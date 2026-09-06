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

const PHONE_RE = /^09\d{9}$/;

function createSms(ctx){
  const store = ctx.store;
  const audit = ctx.audit;
  const sessionFrom = ctx.sessionFrom;
  const sendJson = ctx.sendJson;
  const markDirty = ctx.markDirty;

  const PROVIDER = process.env.PAYESH_SMS_PROVIDER || '';
  const DRY_RUN = (process.env.PAYESH_SMS_DRY_RUN || '0') === '1';
  const MAX_PER_DAY = Number(process.env.PAYESH_SMS_MAX_PER_DAY || 2000);
  const configured = PROVIDER !== '';

  const partsOf = (body) => Math.max(1, Math.ceil(String(body || '').length / 66));
  const today = () => new Date().toISOString().slice(0, 10);
  function nextId(c){
    let m = 0;
    for(const x of store[c] || []) if(x.id != null && x.id > m) m = x.id;
    return m + 1;
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
  function usedToday(sid){
    const t = today();
    return (store.sms_log || []).reduce((a, l) =>
      (l.school_id === sid && l.created_at === t && l.status === 'sent') ? a + (l.parts || 1) : a, 0);
  }

  async function apiSend(req, res, body){
    const s = sessionFrom(req);
    if(!s) return sendJson(res, 401, { ok: false, code: 'no_session' });
    if(s.role !== 'superadmin') return sendJson(res, 403, { ok: false, code: 'forbidden' });
    if(!configured) return sendJson(res, 503, { ok: false, code: 'sms_not_configured' });
    const ids = (body && Array.isArray(body.queue_ids)) ? body.queue_ids : [];
    if(!ids.length) return sendJson(res, 400, { ok: false, code: 'empty_batch' });

    const users = store.users || [];
    const out = { sent: 0, skipped_already: 0, skipped_credit: 0, failed: 0, credits_used: 0, dry_run: DRY_RUN };

    /* جمع‌بندیِ دسته + پیش‌بازرسیِ سقف (طرحِ قفل‌شده: عبور = 429 daily_cap برایِ کلِ دسته) */
    const items = [];
    for(const qid of ids){
      const q = (store.notify_queue || []).find(x => x.id === qid);
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
        store.sms_log.push({ id: nextId('sms_log'), school_id: q.school_id,
          user_id: null, phone: null, body: q.body, parts: it.cost, status: 'failed',
          error: failCode, queue_id: qid, created_at: today() });
        audit('sms_fail', { school: q.school_id, n: parents.length, code: failCode });
        out.failed++;
        continue;
      }
      /* تصمیمِ ۳: واحدِ هزینه = قطعهٔ اعلام‌شدهٔ درگاه (اختلاف → ترازِ هفتگی) */
      const cost = results.reduce((a, r) => a + (r.parts || parts), 0);
      if(!Array.isArray(store.sms_log)) store.sms_log = [];
      for(const r of results){
        const dup = store.sms_log.some(l => l.status === 'sent' && l.queue_id === qid && l.user_id === r.parent.id);
        if(dup) continue;                       /* ایدمپوتانس */
        store.sms_log.push({ id: nextId('sms_log'), school_id: q.school_id,
          user_id: r.parent.id, phone: r.phone, body: q.body, parts: r.parts,
          status: 'sent', provider_msg: r.msg, queue_id: qid, created_at: today() });
      }
      w.balance = Number(w.balance || 0) - cost;
      out.credits_used += cost;
      out.sent++;
      q.status = 'sent';
      q.decided_at = new Date().toISOString();
      q.decided_by = s.id;
      markDirty();
      audit('sms_send', { school: q.school_id, n: parents.length, parts: cost, credits: cost, dry: DRY_RUN });
    }
    return sendJson(res, 200, Object.assign({ ok: true }, out));
  }

  return { apiSend, configured, DRY_RUN };
}

module.exports = { createSms };
