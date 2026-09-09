#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   تستِ پارتیشن‌بندیِ وزن‌دار (فاز ۲.۴)
   ───────────────────────────────────────────────────────────────────
   W1  وزنِ هر مدرسه از داده‌ی واقعیِ مجموعه‌ها حساب می‌شود
   W2  تقسیمِ وزن‌دار از تقسیمِ ساده‌لوحانه متوازن‌تر است (اندازه‌گیری)
   W3  نقشه قطعی است (دو ماژولِ جدا به یک نتیجه می‌رسند)
   W4  شناساییِ مدارسِ شلوغ با آستانه (و صداقت: با آستانه‌ی ۱۰۰۰ در این
       داده هیچ مدرسه‌ای شلوغ نیست)
   W5  مسیریابی: رده/شارد/رپلیکا — و پایداریِ تصمیم
   W6  rowsFor همان نتیجه‌ی پویشِ قدیمی را می‌دهد (طول، ترتیب، مرجع)
   W7  scoped: مدیرِکل/اداره همه را می‌بینند؛ نقش‌هایِ مدرسه فقط مدرسهٔ خود
   W8  بی‌اعتبارسازی: پس از نوشتن، ردیفِ تازه دیده می‌شود (دادهٔ کهنه ممنوع)
   W9  تغییرِ طولِ آرایه هم خودبه‌خود نمایه را باطل می‌کند
   W10 سودِ واقعی: روی دادهٔ بزرگ، خوانشِ تفکیک‌شده سریع‌تر از پویش است
   W11 گزارشِ پایش: شکل و متریک‌ها
   W12 HTTP: مسیرِ پایش فقط برای مدیرِ کل و فقط دادهٔ تجمیعی (بدون PII)
   W13 پوشش: هیچ مدرسه‌ای در تقسیم گم نمی‌شود
   W14 لبه‌ها: مدرسهٔ بی‌ردیف، مجموعهٔ ناشناس، storeِ تهی

   اجرا: node tests/weighted-partitioning.js
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
const path = require('path');
const ROOT = path.join(__dirname, '..');
const { createPartitioning } = require(path.join(ROOT, 'server', 'partitioning.js'));

let pass = 0, fail = 0;
const errors = [];
function chk(name, cond, extra){
  if(cond){ pass++; console.log('  ✅ ' + name); }
  else { fail++; errors.push(name); console.log('  ❌ ' + name + (extra !== undefined ? ' — ' + String(extra).slice(0,200) : '')); }
}

/* ── داده‌ی ساختگیِ قطعی (بدون وابستگی به seed) ─────────────────── */
function mkStore(sizes){
  /* sizes: { schoolId: nRows } */
  const schools = [], classes = [], enrollments = [], attendance = [], grades = [];
  let sid = 0, stid = 0;
  for(const k of Object.keys(sizes).map(Number).sort((a,b)=>a-b)){
    const n = sizes[k];
    schools.push({ id: k, name: 'مدرسهٔ ' + k, active: 1 });
    classes.push({ id: ++sid + 100, school_id: k, name: 'کلاس ' + k });
    const students = Math.max(1, Math.round(n / 20));
    for(let s = 0; s < students; s++) enrollments.push({ id: ++stid, class_id: sid + 100, student_id: 1000 + stid });
    for(let i = 0; i < n; i++) attendance.push({ id: i + 1, school_id: k, date: '2026-01-01' });
    for(let i = 0; i < Math.round(n * 1.2); i++) grades.push({ id: i + 1, school_id: k, score: 15 });
  }
  /* چند ردیفِ بی‌مدرسه (مثلِ تنظیماتِ سراسری) — باید در خوانشِ هر مدرسه
     هم بیایند، درست مثلِ رفتارِ فعلیِ filterByScope.
     عمداً **در میانه** می‌نشینند، نه در انتها: اگر در انتها باشند، پیاده‌سازیِ
     غلطی که ردیف‌های مدرسه را جدا برگرداند و ردیف‌های بی‌مدرسه را به آخر
     بچسباند، همان ترتیبِ درست را می‌داد و سنجه‌ی ترتیب چیزی را نمی‌گرفت. */
  attendance.splice(3, 0, { id: 90001, school_id: null, date: '2026-01-01' });
  attendance.splice(Math.floor(attendance.length / 2), 0, { id: 90002, school_id: null, date: '2026-01-01' });
  attendance.push({ id: 90003, school_id: null, date: '2026-01-01' });
  return { schools, classes, enrollments, attendance, grades, students: [] };
}
const SIZES = { 1: 4000, 2: 3800, 3: 3600, 4: 1200, 5: 1100, 6: 900 };

/* رفتارِ مرجع (قدیمی) — همان چیزی که باید حفظ شود */
function legacyFilter(user, rows){
  if(!Array.isArray(rows)) return [];
  if(!user || user.role === 'superadmin' || user.role === 'edu_office') return rows;
  return rows.filter(r => r.school_id == null || Number(r.school_id) === Number(user.school_id));
}

async function main(){
  console.log('\n— بخشِ ۱: وزن و تقسیم (داده‌ی ساختگی) —');
  const store = mkStore(SIZES);
  const P = createPartitioning({ store });

  {
    const wl = P.weightList();
    chk('W1 وزنِ هر مدرسه از مجموعه‌ها حساب می‌شود (۶ مدرسه، سنگین اول)',
        wl.length === 6 && wl[0].school_id === 1 && wl[0].weight > wl[5].weight,
        JSON.stringify(wl.map(w => w.school_id + ':' + w.weight)));
    chk('W1b دانش‌آموز از enrollments←classes شمرده می‌شود (students خود school_id ندارد)',
        wl.every(w => w.students > 0), JSON.stringify(wl.map(w => w.students)));
    /* چرا این سنجه؟

       چون «وزن» باید واقعاً از ردیف‌های سنگین بیاید، نه فقط از تعدادِ
       دانش‌آموز — وگرنه مدرسه‌ای با هزاران ردیفِ حضور و صد دانش‌آموز
       سبک دیده می‌شد و تقسیم اشتباه از آب درمی‌آمد. */
    chk('W1c وزن شاملِ ردیف‌هایِ مجموعه‌هایِ سنگین هم هست (نه فقط دانش‌آموز)',
        wl.every(w => w.weight >= (w.rows.attendance || 0) + (w.rows.grades || 0)),
        JSON.stringify(wl.map(w => ({ id: w.school_id, w: w.weight, rows: (w.rows.attendance || 0) + (w.rows.grades || 0) }))));

    /* W2 — مقایسه با تقسیمِ ساده‌لوحانه (round-robin روی شناسه) */
    const p = P.weightedShards(3);
    const naive = { 0: 0, 1: 0, 2: 0 };
    wl.slice().sort((a, b) => Number(a.school_id) - Number(b.school_id))
      .forEach((s, i) => { naive[i % 3] += s.weight; });
    const nv = Object.values(naive), nm = nv.reduce((a, b) => a + b, 0) / 3;
    const nsd = Math.sqrt(nv.reduce((a, b) => a + (b - nm) ** 2, 0) / 3);
    const naiveCov = nsd / nm;
    chk('W2 تقسیمِ وزن‌دار متوازن‌تر از تقسیمِ ساده است',
        p.balance.cov < naiveCov / 5,
        'وزن‌دار: ' + p.balance.cov + ' در برابر ساده: ' + naiveCov.toFixed(3));
    chk('W2b نابرابریِ شاردها زیرِ ۱٫۱ است (بیشینه/میانگین)',
        p.balance.imbalance < 1.1, JSON.stringify(p.balance));

    /* W3 — قطعی‌بودن */
    const P2 = createPartitioning({ store: mkStore(SIZES) });
    const p2 = P2.weightedShards(3);
    chk('W3 نقشه قطعی است (دو ماژولِ مستقل → یک نتیجه)',
        JSON.stringify(p.assign) === JSON.stringify(p2.assign),
        JSON.stringify(p.assign) + ' ≠ ' + JSON.stringify(p2.assign));

    /* W13 — پوشش */
    const assigned = Object.keys(p.assign).map(Number).sort((a, b) => a - b);
    chk('W13 همهٔ مدارس در نقشه هستند (هیچ‌یک گم نمی‌شود)',
        JSON.stringify(assigned) === JSON.stringify([1, 2, 3, 4, 5, 6]), JSON.stringify(assigned));

    /* W4 — آستانه‌ی شلوغی */
    chk('W4 با آستانه‌ی پیش‌فرض (۱۰۰۰ دانش‌آموز) در این داده مدرسهٔ شلوغی نیست — صداقت، نه عددسازی',
        P.hotSchools().length === 0, JSON.stringify(P.hotSchools()));
    /* آستانه‌ی ۳۰۰۰ ردیف: سه مدرسهٔ بزرگ بالای آن‌اند، سه مدرسهٔ کوچک پایین
       (۴۰۰۰+۴۸۰۰ در برابر ۹۰۰+۱۰۸۰) — آستانه باید تفکیک‌کننده باشد. */
    const Phot = createPartitioning({ store, hotRows: 3000 });
    const hot = Phot.hotSchools();
    chk('W4b با آستانه‌ی ردیف (۳۰۰۰) سه مدرسهٔ بزرگ شلوغ‌اند',
        hot.length === 3 && hot.every(h => [1, 2, 3].indexOf(h.school_id) > -1),
        JSON.stringify(hot.map(h => h.school_id)));

    /* W5 — مسیریابی */
    const rHot = Phot.routeFor(1), rCold = Phot.routeFor(6);
    chk('W5 مدرسهٔ شلوغ ⇒ رده‌ی hot و رپلیکایِ خواندن',
        rHot.tier === 'hot' && rHot.replica === true, JSON.stringify(rHot));
    chk('W5b مدرسهٔ معمولی ⇒ رده‌ی normal و بی‌رپلیکا',
        rCold.tier === 'normal' && rCold.replica === false, JSON.stringify(rCold));
    chk('W5c تصمیمِ مسیریابی پایدار است (دو فراخوانی یکی)',
        JSON.stringify(Phot.routeFor(1)) === JSON.stringify(Phot.routeFor(1)));
  }

  console.log('\n— بخشِ ۲: هم‌ارزیِ مسیرِ خواندن با رفتارِ قدیمی —');
  {
    const users = [
      { id: 1, role: 'manager', school_id: 1 },
      { id: 2, role: 'teacher', school_id: 3 },
      { id: 3, role: 'student', school_id: 6 },
      { id: 4, role: 'superadmin', school_id: null },
      { id: 5, role: 'edu_office', school_id: null },
    ];
    let bad = 0, checked = 0, firstBad = null;
    for(const coll of ['attendance', 'grades']){
      for(const u of users){
        const a = legacyFilter(u, store[coll]);
        const b = P.scoped(u, coll);
        checked++;
        const same = a.length === b.length && a.every((r, i) => r === b[i]);
        if(!same && !firstBad) firstBad = { coll: coll, role: u.role, school: u.school_id, old: a.length, neu: b.length };
        if(!same) bad++;
      }
    }
    chk('W6 خواندنِ تفکیک‌شده همانِ پویشِ قدیمی است (طول + ترتیب + همان ردیف)',
        bad === 0, checked - bad + '/' + checked + ' — نخستین ناهمسانی: ' + JSON.stringify(firstBad));

    const mgr = { id: 1, role: 'manager', school_id: 1 };
    const own = P.scoped(mgr, 'attendance');
    chk('W7 مدیر فقط ردیف‌های مدرسهٔ خود + ردیف‌های بی‌مدرسه را می‌بیند',
        own.every(r => r.school_id === 1 || r.school_id == null) && own.some(r => r.school_id == null),
        JSON.stringify(own.slice(0, 3).map(r => r.school_id)));
    chk('W7b مدیرِ کل و اداره همه را می‌بینند (رفتارِ فعلی دست‌نخورده)',
        P.scoped({ id: 4, role: 'superadmin' }, 'attendance').length === store.attendance.length &&
        P.scoped({ id: 5, role: 'edu_office' }, 'grades').length === store.grades.length);
  }

  console.log('\n— بخشِ ۳: بی‌اعتبارسازی (دادهٔ کهنه ممنوع) —');
  {
    const u = { id: 1, role: 'manager', school_id: 1 };
    const before = P.scoped(u, 'attendance').length;
    store.attendance.push({ id: 555001, school_id: 1, date: '2026-02-02' });  /* شبیه‌سازیِ نوشتن */
    P.invalidate('attendance');
    const after = P.scoped(u, 'attendance').length;
    chk('W8 پس از نوشتن + بی‌اعتبارسازی، ردیفِ تازه دیده می‌شود',
        after === before + 1, before + ' → ' + after);

    /* W9 — بدون صدا زدنِ invalidate: تغییرِ طول باید خودبه‌خود باطل کند */
    store.attendance.push({ id: 555002, school_id: 1, date: '2026-02-03' });
    const after2 = P.scoped(u, 'attendance').length;
    chk('W9 تغییرِ طولِ آرایه، نمایه را خودبه‌خود باطل می‌کند (نیازی به invalidate نیست)',
        after2 === before + 2, after + ' → ' + after2);

    /* جابه‌جاییِ آرایه (مسیرِ del در sync.js) هم باید درست باشد */
    const keep = store.attendance.filter(r => r.school_id === 1);
    store.attendance = store.attendance.filter(r => r.school_id !== 1);
    const after3 = P.scoped(u, 'attendance');
    const nulls = store.attendance.filter(r => r.school_id == null).length;  /* انتظارِ پویا، نه عددِ دست‌نویس */
    chk('W9b جایگزینیِ آرایه (مسیرِ حذف در sync) هم نمایه را باطل می‌کند',
        after3.length === nulls, 'length=' + after3.length + ' (انتظار: ' + nulls + ')');
    store.attendance = store.attendance.concat(keep); /* بازگردانی */
    P.invalidate();

    /* W15 — جایی که invalidate واقعاً معنا دارد: طولِ آرایه ثابت می‌ماند
       اما مدرسه‌ی یک ردیف عوض می‌شود. این سنجه جداسازیِ مستأجر را نگه
       می‌دارد: اگر نمایه کهنه بماند، ردیف هم در مدرسه‌ی قبلی دیده می‌شود
       و هم در مدرسه‌ی جدید ⇒ نشتِ بینِ مدارس. */
    const moved = store.attendance.find(r => r.school_id === 2);
    const beforeMove = {
      two: P.scoped({ id: 1, role: 'manager', school_id: 2 }, 'attendance').length,
      six: P.scoped({ id: 2, role: 'manager', school_id: 6 }, 'attendance').length,
    };
    moved.school_id = 6;                 /* جابه‌جاییِ درجا — طول ثابت */
    P.invalidate('attendance');          /*sync.js همین را پس از هر op می‌زند */
    const afterMove = {
      two: P.scoped({ id: 1, role: 'manager', school_id: 2 }, 'attendance').length,
      six: P.scoped({ id: 2, role: 'manager', school_id: 6 }, 'attendance').length,
    };
    chk('W15 جابه‌جاییِ ردیف بینِ دو مدرسه، در هر دو دیده می‌شود (نشتِ بین‌مدرسه‌ای ممنوع)',
        afterMove.two === beforeMove.two - 1 && afterMove.six === beforeMove.six + 1,
        JSON.stringify({ beforeMove: beforeMove, afterMove: afterMove }));
    chk('W15b ردیفِ جابه‌جا‌شده در مدرسهٔ قبلی دیگر نیست',
        !P.scoped({ id: 1, role: 'manager', school_id: 2 }, 'attendance').some(r => r.id === moved.id));
    moved.school_id = 2; P.invalidate('attendance'); /* بازگردانی */
  }

  console.log('\n— بخشِ ۴: سودِ واقعی روی دادهٔ بزرگ —');
  {
    /* ۱۲۰ هزار ردیفِ حضور در ۴۰ مدرسه — مقیاسی که «پویشِ کامل» واقعاً درد دارد */
    const big = { schools: [], classes: [], enrollments: [], attendance: [], grades: [], students: [] };
    for(let s = 1; s <= 40; s++){
      big.schools.push({ id: s, name: 'م' + s });
      for(let i = 0; i < 3000; i++) big.attendance.push({ id: s * 10000 + i, school_id: s });
    }
    const PB = createPartitioning({ store: big });
    const u = { id: 1, role: 'manager', school_id: 7 };
    const bench = (fn, n) => { const t0 = process.hrtime.bigint(); for(let i = 0; i < n; i++) fn(); return Number(process.hrtime.bigint() - t0) / 1e6 / n; };
    bench(() => PB.scoped(u, 'attendance'), 30);              /* گرم‌کردن */
    const tOld = bench(() => legacyFilter(u, big.attendance), 200);
    const tNew = bench(() => PB.scoped(u, 'attendance'), 200);
    chk('W10 روی ۱۲۰هزار ردیف، خواندنِ تفکیک‌شده سریع‌تر از پویشِ کامل است',
        tNew < tOld / 2, 'پویش: ' + tOld.toFixed(3) + 'ms در برابر تفکیک‌شده: ' + tNew.toFixed(3) + 'ms ⇒ ' + (tOld / tNew).toFixed(1) + '×');
    console.log('     (ساختِ نمایه: ' + PB.report().index.buildMs + 'ms یک‌بار — بازپرداخت از ' +
                Math.ceil(PB.report().index.buildMs / (tOld - tNew)) + ' خوانش)');
  }

  console.log('\n— بخشِ ۵: گزارشِ پایش و لبه‌ها —');
  {
    const r = P.report(true);
    chk('W11 گزارش: آستانه‌ها، توازن و متریک‌هایِ نمایه را دارد',
        r && r.thresholds && r.balance && r.index && typeof r.hotCount === 'number',
        JSON.stringify(Object.keys(r || {})));
    chk('W11b گزارش فقط دادهٔ تجمیعی است (نامِ دانش‌آموز/ردیفِ شخصی ندارد)',
        JSON.stringify(r).indexOf('student_id') === -1 && JSON.stringify(r.hot).indexOf('نام') === -1);

    const empty = createPartitioning({ store: { schools: [], attendance: [] } });
    chk('W14 storeِ تهی سقوط نمی‌کند (مدرسه‌ای نیست ⇒ شاردها خالی اما معتبرند)',
        empty.weightList().length === 0 && empty.weightedShards(3).shards.length === 3);
    chk('W14b مجموعهٔ ناشناس ⇒ فهرستِ تهی (و نه استثنا)',
        Array.isArray(P.rowsFor('چنین‌مجموعه‌ای‌نداریم', 1)) && P.rowsFor('چنین‌مجموعه‌ای‌نداریم', 1).length === 0);
    const noRows = createPartitioning({ store: { schools: [{ id: 9, name: 'بی‌ردیف' }], attendance: [] } });
    chk('W14c مدرسهٔ بی‌ردیف هم در نقشه هست (وزن صفر، نه حذف)',
        noRows.weightList().length === 1 && noRows.weightList()[0].weight === 0);
  }

  console.log('\n— بخشِ ۶: مسیرِ پایش روی سرورِ واقعی —');
  {
    const fs = require('fs');
    const REAL_STORE = path.join(ROOT, 'server', 'data', 'payesh.json');
    if(!fs.existsSync(REAL_STORE)){
      console.log('  ⏭️  store موجود نیست — بخشِ HTTP رد شد (اول: node server/seed.js)');
    } else {
      const os = require('os');
      const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'payesh-wp-'));
      process.on('exit', () => { try { fs.rmSync(TMP, { recursive: true, force: true }); } catch(e){} });
      fs.copyFileSync(REAL_STORE, path.join(TMP, 'store.json'));
      process.env.PAYESH_STORE = path.join(TMP, 'store.json');
      process.env.PAYESH_AUDIT = path.join(TMP, 'audit.log');
      process.env.PAYESH_KEY   = path.join(TMP, 'jwt.key');
      process.env.PAYESH_DEMO_CODE = '1';
      process.env.PAYESH_SMS_COOLDOWN_S = '0';
      process.env.PAYESH_SMS_DAILY_CAP = '1000000';
      process.env.PAYESH_SMS_PHONE_LIMIT = '1000000';
      process.env.PAYESH_SMS_IP_LIMIT = '1000000';
      process.env.PAYESH_LOGIN_IP_LIMIT = '1000000';
      process.env.PAYESH_LOGIN_TRIES = '1000000';

      const { server, store } = require(path.join(ROOT, 'server', 'index.js'));
      await new Promise(r => server.listen(0, '127.0.0.1', r));
      const BASE = 'http://127.0.0.1:' + server.address().port;
      const req = async (m, p, { cookie } = {}) => {
        const res = await fetch(BASE + p, { method: m, headers: cookie ? { Cookie: cookie } : {} });
        let json = null; try { json = await res.json(); } catch(e){}
        return { status: res.status, json, headers: res.headers };
      };
      const login = async (user) => {
        const phone = String(user.phone).replace(/[\s\-()]/g, '');
        const s = await req('POST', '/api/auth/send-code', { /* placeholder */ });
        return null;
      };
      /* ورودِ واقعی با کدِ دمو */
      const loginAs = async (user) => {
        const phone = String(user.phone).replace(/[\s\-()]/g, '');
        const s = await fetch(BASE + '/api/auth/send-code', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone }) });
        const sj = await s.json();
        const r = await fetch(BASE + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone, code: sj.demo_code, national_id: user.national_id }) });
        const m = (r.headers.get('set-cookie') || '').match(/payesh_session=[^;]+/);
        return m ? m[0] : null;
      };

      const anon = await req('GET', '/api/admin/partition-report');
      chk('W12 مسیرِ پایش برایِ بی‌نشست ۴۰۱ است', anon.status === 401, anon.status);

      const sup = (store.users || []).find(u => u.role === 'superadmin' && u.active);
      const mgr = (store.users || []).find(u => u.role === 'manager' && u.active);
      const ckSup = await loginAs(sup), ckMgr = await loginAs(mgr);
      chk('W12b ورودِ مدیرِ کل و مدیر موفق بود', !!ckSup && !!ckMgr);

      const forMgr = await req('GET', '/api/admin/partition-report', { cookie: ckMgr });
      chk('W12c مدیر (غیرِ مدیرِ کل) به گزارش دسترسی ندارد (۴۰۳)', forMgr.status === 403, forMgr.status);

      const rep = await req('GET', '/api/admin/partition-report', { cookie: ckSup });
      chk('W12d مدیرِ کل گزارش را می‌گیرد (۲۰۰)', rep.status === 200 && rep.json && rep.json.ok === true, rep.status);
      const j = rep.json || {};
      chk('W12e گزارش فقط تجمیعی است: نه نامِ دانش‌آموز، نه شمارهٔ تلفن، نه کدِ ملی',
          JSON.stringify(j).indexOf('national_id') === -1 &&
          JSON.stringify(j).indexOf('phone') === -1 &&
          JSON.stringify(j).indexOf('09') === -1,
          JSON.stringify(j).slice(0, 160));
      chk('W12f گزارش شاملِ توازنِ شاردها و فهرستِ مدارسِ شلوغ است',
          !!j.balance && Array.isArray(j.hot) && Array.isArray(j.shards), JSON.stringify(Object.keys(j)));
      server.close();
    }
  }

  console.log('\n────────────────────────────────────────────────────');
  console.log(`پارتیشن‌بندیِ وزن‌دار: ${pass} بررسی — ${fail === 0 ? 'همه سبز ✅' : '❌ ' + fail + ' قرمز'}`);
  if(fail){ console.log('مواردِ قرمز:'); errors.forEach(e => console.log('  • ' + e)); }
  process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error('خطایِ اجرا:', e); process.exit(1); });
