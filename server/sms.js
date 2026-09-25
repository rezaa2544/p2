/* ═══════════════════════════════════════════════════════════════════
   server/sms.js — POST /api/sms/send: ارسالِ واقعی (فقطِ سرور، فقطِ superadmin)
   قرارداد: docs/PLAN_SMS_GATEWAY.md + قفلِ ۸۱.۱ (AD.md)
     • بدونِ env: 503 sms_not_configured (کلاینتِ دمو دست‌نخورده می‌ماند)
     • PAYESH_SMS_PROVIDER=mock: سازگارِ mock (تست‌ها)
     • PAYESH_SMS_DRY_RUN=1: همهٔ منطق واقعی؛ فقط زنگِ درگاه نمی‌زند
     • سازگارِ واقعی: بعد از قرارداد (PLAN §4) — fetch نازک + جدولِ نگاشت
   ایدمپوتانس: (queue_id, parent_id) — هرگز دوباره ارسال/کسر.
   سیاست: «همه یا هیچ» به ازای هر آیتمِ صف؛ شکست → logِ failed؛
   هیچ ری‌ارسالِ خودکاری نیست. سقفِ روزانه: PAYESH_SMS_MAX_PER_DAY.
   آدیت: sms_send / sms_fail / sms_cap / sms_skip — بدونِ phone.
   Runtime deps: Node stdlib only.
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

const { validate } = require('./validate');

const PHONE_RE = /^09\d{9}$/;

function createSms(ctx){
  const store = ctx.store;
  const db = ctx.db; /* Wave1-W: آینهٔ پستگرس (تراکنش به ازای هر آیتم) */
  const audit = ctx.audit;
  const sessionFrom = ctx.sessionFrom;
  const sendJson = ctx.sendJson;
  const markDirty = ctx.markDirty;

  /* Wave1-W: آینهٔ اتمیکِ آیتم — شکست، مثلِ sync، برای کلاینت نامرئی است
     (audit + JSON اعمال‌شده می‌ماند)؛ همهٔ نوشت‌هایِ آیتم در یک تراکنش. */
  async function mirrorItem(itemOps, where){
    if(!db || typeof db.persistOpsBatch !== 'function' || !itemOps.length) return;
    try { await db.persistOpsBatch(itemOps); }
    catch(e){ audit('sms_mirror_failed', Object.assign({ ops: itemOps.length }, where,
      { error: String((e && e.message) || e) })); }
  }

  const PROVIDER = process.env.PAYESH_SMS_PROVIDER || '';
  const DRY_RUN = (process.env.PAYESH_SMS_DRY_RUN || '0') === '1';
  const MAX_PER_DAY = Number(process.env.PAYESH_SMS_MAX_PER_DAY || 2000);
  const configured = PROVIDER !== '';

  const partsOf = (body) => Math.max(1, Math.ceil(String(body || '').length / 66));
  const today = () => new Date().toISOString().slice(0, 10);

  /* A-04/A-06: شمارندهٔ یکنوایِ صعودی — همان الگوی server/ids.js.
     تا پیش از این هر push، کلِ collection را برای یافتنِ max بعدی پیمایش
     می‌کرد. رویِ sms_logِ append-only این یک O(n²)ِ پنهان است: یک دستهٔ
     ۵۰۰تایی رویِ ۲۰۰هزار ردیف ~۲.۵ ثانیه فقط برایِ تخصیصِ شناسه.
     sms_log و sms_wallet فقط از همین ماژول نوشته می‌شوند (تأیید با grep
     رویِ کلِ server/) پس این شمارنده از نوشتنِ بیرونی عقب نمی‌ماند.
     اگر آرایه جایگزین و کوتاه‌تر شود (آبگیریِ دوباره از PG) کش، از طریقِ
     طول، بی‌اعتبار می‌شود. */
  const idHigh = new Map();
  const idHighLen = new Map();
  function nextId(c){
    const list = store[c] || [];
    let m = idHigh.get(c);
    if(m === undefined || (list.length || 0) < (idHighLen.get(c) || 0)){
      m = 0;
      for(const x of list) if(x.id != null && x.id > m) m = x.id;
    }
    const id = m + 1;
    idHigh.set(c, id);
    idHighLen.set(c, list.length + 1);
    return id;
  }

  /* سازگارِ درگاه — نقطهٔ تعویض (PLAN §4).
     PAYESH_SMS_MOCK_FAIL: خطِ تست — mock برایِ همان شماره reject می‌کند. */
  function providerSend(phone, body){
    if(DRY_RUN) return Promise.resolve({ message_id: 'dry-' + Date.now(), parts: partsOf(body) });
    if(PROVIDER === 'mock'){
      if(process.env.PAYESH_SMS_MOCK_FAIL && process.env.PAYESH_SMS_MOCK_FAIL === phone)
        return Promise.reject({ code: 'mock_injected' });
      return Promise.resolve({ message_id: 'mock-' + Math.random().toString(36).slice(2, 8), parts: partsOf(body) });
    }
    return Promise.reject({ code: 'gateway_not_implemented' });
  }

  function walletOf(sid){
    if(!Array.isArray(store.sms_wallet)) store.sms_wallet = [];
    let w = store.sms_wallet.find(x => x.school_id === sid);
    if(!w){
      w = { id: nextId('sms_wallet'), school_id: sid, balance: 0 };
      store.sms_wallet.push(w);
    }
    return w;
  }

  /* سقف به واحدِ «قطعهٔ ارسال‌شدهٔ امروز» است (همان معیارِ کلاینت) */
  function usedTodayRaw(sid, t){
    return (store.sms_log || []).reduce((a, l) =>
      (l.school_id === sid && l.created_at === t && l.status === 'sent') ? a + (l.parts || 1) : a, 0);
  }

  /* A-06: حلقهٔ پیش‌بازرسیِ سقف (پایین‌تر) این تابع را به‌ازایِ هر آیتمِ
     دسته (تا ۵۰۰) صدا می‌زند و sms_log فقط append است و هرگز هرس نمی‌شود.
     نتیجه: O(دسته × log) در هر درخواست — ۴.۱ ثانیه رویِ ۲۰۰هزار ردیف —
     و چون log با هر ارسال می‌گذرد، به‌ازایِ هر درخواست ازِ قبل کندتر است
     (هیچ حالتِ پایا‌ای وجود ندارد).
     حلقهٔ پیش‌بازرسی قبل از هر ارسالی و کاملاً همگام (بدونِ await) اجرا
     می‌شود، پس مقدارِ usedToday در طولِ آن ثابت است. مموی‌سازیِ
     هردرخواستی آن را O(تعدادِ مدرسه × log) می‌کند — یعنی رفتارِ خروجی
     یکسان، با حذفِ عاملِ اندازهٔ دسته. */
  function makeUsedToday(){
    const day = today();
    const cache = new Map();
    return function usedToday(sid){
      const t = today();
      if(t !== day) return usedTodayRaw(sid, t); /* عبور از نیمه‌شب: کش بی‌اعتبار است */
      const key = sid + '|' + t;
      let v = cache.get(key);
      if(v === undefined){ v = usedTodayRaw(sid, t); cache.set(key, v); }
      return v;
    };
  }

  /* A-06: سومین نمونهٔ همان الگو — بررسیِ ایدمپوتانس (در حلقهٔ ارسال)
     به ازایِ هر گیرنده، کلِ sms_log را باِ .some پیمایش می‌کرد: رویِ
     ۲۰۰هزار ردیف و دستهٔ ۵۰۰تایی، ۱۰۰ میلیون پیمایش. یک ایندکسِ
     (queue_id|user_id) رویِ رکوردهایِ sent، آن را O(1) می‌کند.
     یکبار در هر apiSend ساخته می‌شود (قبل از هر ارسال)، پس هیچ
    stalenessی بینِ درخواست‌ها وجود ندارد و کلیدهایِ این درخواست را
     قبل از push افزودیم تا آیتمِ خودمان را به‌اشتباه dedupe نکنیم. */
  function makeSentIndex(){
    const idx = new Set();
    (store.sms_log || []).forEach((l) => {
      if(l && l.status === 'sent' && l.queue_id != null && l.user_id != null) idx.add(l.queue_id + '|' + l.user_id);
    });
    return idx;
  }

  async function apiSend(req, res, body){
    const s = await sessionFrom(req);
    if(!s) return sendJson(res, 401, { ok: false, code: 'no_session' });
    if(s.role !== 'superadmin') return sendJson(res, 403, { ok: false, code: 'forbidden' });
    /* R96 P0-5 — validatorِ صریح (حالا رویِ validate.js سوار است): بدنه =
       فقطِ queue_ids؛ آرایهٔ عددِ مثبتِ صحیح، حداکثر ۵۰۰؛ فیلدِ ناشناس =
       رد (fail-closed). phone/بدنهٔ پیام از notify_queue می‌آید — کلاینت
       هیچ‌کدام را تزریق نمی‌کند. codeها عینِ رفتارِ قفل‌شده‌اند. */
    const v = validate(body, { fields: {
      queue_ids: { type: 'array', max: 500, of: { type: 'integer', min: 1 } }
    }, required: ['queue_ids'] });
    if(!v.ok){
      if(v.kind === 'unknown_field')
        return sendJson(res, 400, { ok: false, code: 'unknown_field', field: v.field });
      return sendJson(res, 400, { ok: false, code: 'bad_batch' });
    }
    const ids = body.queue_ids;
    if(!ids.length) return sendJson(res, 400, { ok: false, code: 'empty_batch' });
    if(!configured) return sendJson(res, 503, { ok: false, code: 'sms_not_configured' });

    const users = store.users || [];
    const out = { sent: 0, skipped_already: 0, skipped_credit: 0, failed: 0, credits_used: 0, dry_run: DRY_RUN };

    const usedToday = makeUsedToday(); /* A-06: یک پازش به ازایِ مدرسه، نه به ازایِ آیتم */
    const sentIndex = makeSentIndex(); /* A-06: ایندکسِ ایدمپوتانس، نه پازشِ هر گیرنده */

    /* A-06: نفسِ الگو برایِ جستجویِ صف: find درونِ حلقه به ازایِ هر
       queue_id کلِ notify_queue را پیمایش می‌کرد (O(دسته × صف)). یک
       ایندکسِ یک‌بار، آن را O(دسته + صف) می‌کند — خروجی یکسان است. */
    const queueById = new Map();
    (store.notify_queue || []).forEach(q => { if(q && q.id != null) queueById.set(q.id, q); });

    /* جمع‌بندیِ دسته + پیش‌بازرسیِ سقف (طرحِ قفل‌شده: عبور = 429 daily_cap برایِ کلِ دسته) */
    const items = [];
    for(const qid of ids){
      const q = queueById.get(qid);
      if(!q || q.status !== 'pending'){ out.skipped_already++; continue; }
      const parents = (q.parent_ids || []).map(pid => users.find(u => u.id === pid)).filter(Boolean);
      if(!parents.length){ out.skipped_already++; continue; }
      const parts = Number(q.parts) > 0 ? Number(q.parts) : partsOf(q.body);
      items.push({ qid, q, parents, parts, cost: parts * parents.length });
    }
    const bySchool = {};
    for(const it of items){
      bySchool[it.q.school_id] = (bySchool[it.q.school_id] || 0) + it.cost;
      if(usedToday(it.q.school_id) + bySchool[it.q.school_id] > MAX_PER_DAY){
        audit('sms_cap', { school: it.q.school_id, cap: MAX_PER_DAY, used: usedToday(it.q.school_id) });
        return sendJson(res, 429, { ok: false, code: 'daily_cap', school: it.q.school_id,
          used: usedToday(it.q.school_id), cap: MAX_PER_DAY });
      }
    }

    for(const it of items){
      const { qid, q, parents, parts } = it;
      const w = walletOf(q.school_id);
      if(it.cost > Number(w.balance || 0)){
        out.skipped_credit++;
        audit('sms_skip', { school: q.school_id, reason: 'no-credit' });
        continue;
      }
      /* «همه یا هیچ»: شکستِ یک گیرنده = کلِ آیتم ثبتِ sent نمی‌شود */
      const results = [];
      let failCode = null;
      for(const p of parents){
        const ph = String(p.phone || '').replace(/\D/g, '');
        if(!PHONE_RE.test(ph)){ failCode = 'bad-phone'; break; }
        try{
          const r = await providerSend(ph, q.body);
          results.push({ parent: p, phone: ph, msg: r.message_id || null, parts: r.parts || parts });
        }catch(e){
          failCode = (e && e.code) || 'gateway_error';
          break;
        }
      }
      if(failCode){
        if(!Array.isArray(store.sms_log)) store.sms_log = [];
        const frec = { id: nextId('sms_log'), school_id: q.school_id,
          user_id: null, phone: null, body: q.body, parts: it.cost, status: 'failed',
          error: failCode, queue_id: qid, created_at: today() };
        store.sms_log.push(frec);
        /* Wave1-W: رکوردِ شکست هم به پستگرس می‌رسد (تراکنشِ تک‌عناصری) */
        await mirrorItem([{ c: 'sms_log', t: 'ins', data: frec }],
          { school: q.school_id, queue_id: qid, kind: 'fail' });
        audit('sms_fail', { school: q.school_id, n: parents.length, code: failCode });
        out.failed++;
        continue;
      }
      /* تصمیمِ ۳: واحدِ هزینه = قطعهٔ اعلام‌شدهٔ درگاه (اختلاف → ترازِ هفتگی) */
      const cost = results.reduce((a, r) => a + (r.parts || parts), 0);
      if(!Array.isArray(store.sms_log)) store.sms_log = [];
      const itemOps = []; /* Wave1-W: نوشت‌هایِ آیتم — یک تراکنش برایِ همه */
      for(const r of results){
        const dup = sentIndex.has(qid + '|' + r.parent.id);
        if(dup) continue;                       /* ایدمپوتانس */
        const lrec = { id: nextId('sms_log'), school_id: q.school_id,
          user_id: r.parent.id, phone: r.phone, body: q.body, parts: r.parts,
          status: 'sent', provider_msg: r.msg, queue_id: qid, created_at: today() };
        store.sms_log.push(lrec);
        sentIndex.add(qid + '|' + r.parent.id); /* A-06: ایندکسِ همین درخواست را تازه نگه می‌دارد */
        itemOps.push({ c: 'sms_log', t: 'ins', data: lrec });
      }
      w.balance = Number(w.balance || 0) - cost;
      itemOps.push({ c: 'sms_wallet', t: 'upd', data: w });
      out.credits_used += cost;
      out.sent++;
      q.status = 'sent';
      q.decided_at = new Date().toISOString();
      q.decided_by = s.id;
      itemOps.push({ c: 'notify_queue', t: 'upd', data: q });
      await mirrorItem(itemOps, { school: q.school_id, queue_id: qid, kind: 'send' });
      markDirty();
      audit('sms_send', { school: q.school_id, n: parents.length, parts: cost, credits: cost, dry: DRY_RUN });
    }
    return sendJson(res, 200, Object.assign({ ok: true }, out));
  }

  return { apiSend, configured, DRY_RUN };
}

module.exports = { createSms };
