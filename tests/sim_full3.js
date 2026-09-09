#!/usr/bin/env node
/**
 * شبیه‌سازیِ جامعِ سلامت (دور ۷۲) — سمتِ سرور
 *
 *  چندمدرسه، چندنقش، سناریو + چاس — اما این‌بار از درِ سرور واقعی:
 *   T0  سرور روی store موقت بالا می‌آید
 *   T1  health
 *   T2  ورودِ واقعیِ ۱۱ نقش (سوپرادمین، ۵ مدیر، دبیر، دانش‌آموز، ولی، ۲ مشاور، راننده)
 *   T3  مدرسهٔ ۶ خاموش: ورود → school_inactive
 *   T4  باتریِ IDOR (تجاوز بین‌مدرسه‌ای از درِ سرور)
 *   T5  batch مسموم: op معتبر + op نامعتبر → اتمیک، هیچ‌کدام اعمال نمی‌شود
 *   T6  ایدمپوتنس (uid تکراری)
 *   T7  batch بزرگ → 413
 *   T8  byِ جعلی → forged_by
 *   T9  user_id / school_idِ جعلی → mismatch
 *   T10 روزِ غیرحضوری: عملیاتِ فیزیکی → virtual_day
 *   T11 flush واقعی به disk + آدیت
 *   T12 بدون کوکی → no_session
 *
 * اجرا:  node tests/sim_full3.js   (پورت 8997؛ نیاز: node server/seed.js)
 */
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { opX } = require('./helpers/opx');

const ROOT = path.join(__dirname, '..');
const PORT = 8997;
const BASE = `http://127.0.0.1:${PORT}`;

let pass = 0, fail = 0;
const T = (c, m) => { if (c) { pass++; console.log('  ✅ ' + m); } else { fail++; console.log('  ❌ ' + m); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/* 🔴 رفعِ race (دور ۸۷): حلقهٔ persist سرور هر ۲ ثانیه فایلِ store را
   می‌نویسد؛ خواندنِ فایل بلافاصله بعد از پاسخِ HTTP (که وضعیتِ حافظه‌ای
   تازه را دارد) می‌تواند پیش از flush بعدی باشد. الگوی server12:
   تا برآوردِ شرط روی فایلِ disk برقرار نشود، با فاصلهٔ کوتاه دوباره
   بخوان. در timeout، آخرین snapshot برمی‌گردد تا خودِ ادعا با دادهٔ
   واقعی شکست (نه کرشِ مبهم). */
async function waitForDisk(file, predicate, timeoutMs = 6000, intervalMs = 100) {
  const t0 = Date.now();
  let snap = null;
  for (;;) {
    snap = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (predicate(snap)) return snap;
    if (Date.now() - t0 >= timeoutMs) return snap;
    await sleep(intervalMs);
  }
}

const CSRF_JAR = {}; /* F-CSRF-01: نگاشتِ نشست ← توکن (تزریقِ خودکار) */
function http(method, url, body, cookie) {
  return fetch(BASE + url, {
    method,
    headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}), ...(cookie && CSRF_JAR[cookie] ? { 'X-CSRF-Token': CSRF_JAR[cookie] } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  }).then(async (r) => ({ status: r.status, json: await r.json().catch(() => ({})), hdr: r.headers.get('set-cookie') || '' }));
}
/* op واقع‌گرایانه: با مهرهای همان‌طور که کلاینت می‌فرستد */
function opReal(user, spec) {
  const o = opX(spec);
  o.user_id = user.id;
  o.school_id = user.school_id || null;
  return o;
}

async function main() {
  console.log('\n▸ T0/T1 — بوتِ سرور روی store موقت');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'payesh-sim3-'));
  process.on('exit', () => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) {} });
  const store = path.join(dir, 'store.json');
  const seed = path.join(ROOT, 'server/data/payesh.json');
  if (!fs.existsSync(seed)) { console.error('⚠️ server/data/payesh.json نیست — اول: node server/seed.js'); process.exit(1); }
  fs.copyFileSync(seed, store);
  const store0 = JSON.parse(fs.readFileSync(store, 'utf8'));
  const child = spawn('node', [path.join(ROOT, 'server/index.js')], {
    env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', PAYESH_STORE: store, PAYESH_AUDIT: path.join(dir, 'audit.jsonl'), PAYESH_JWT_SECRET: require('crypto').randomBytes(32).toString('hex'), PAYESH_DEMO_CODE: '1',
    /* R96: ۱۱ login از یک IP — سقف‌های OTP در server17 سنجیده می‌شوند */
    PAYESH_SMS_COOLDOWN_S: '0', PAYESH_SMS_DAILY_CAP: '1000000', PAYESH_SMS_PHONE_LIMIT: '1000000', PAYESH_SMS_IP_LIMIT: '1000000', PAYESH_LOGIN_IP_LIMIT: '1000000', PAYESH_LOGIN_TRIES: '1000000' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let out = '';
  child.stdout.on('data', (d) => (out += String(d)));
  child.stderr.on('data', (d) => (out += String(d)));
  const up = new Promise((res, rej) => {
    const iv = setInterval(async () => {
      try { const r = await http('GET', '/api/health'); if (r.status === 200) { clearInterval(iv); res(); } } catch (e) {}
    }, 300);
    setTimeout(() => rej(new Error('سرور بالا نیامد: ' + out.slice(-300))), 12000);
  });
  await up;
  console.log('  (سرور روی ' + PORT + ' بالا آمد)');

  const health = await http('GET', '/api/health');
  T(health.status === 200 && health.json.ok && health.json.pid === child.pid, 'T1 health: ok + pidِ سرورِ خودِ ما');

  console.log('\n▸ T2 — ورودِ واقعیِ ۱۱ نقش');
  const pick = (role, school_id) => store0.users.find((u) => u.role === role && (school_id == null || u.school_id === school_id) && u.active !== 0);
  const cls12 = (store0.classes || []).find((c) => String(c.name).indexOf('دوازدهم') === 0);
  const enr12 = (store0.enrollments || []).find((e) => e.class_id === cls12.id);
  const stU = store0.users.find((u) => u.id === enr12.student_id);
  const parU = store0.users.find((u) => u.id === (store0.parent_links || []).find((p) => p.student_id === stU.id).parent_id);
  const login = async (u) => {
    const sc = await http('POST', '/api/auth/send-code', { phone: u.phone });
    const code = sc.json.demo_code || sc.json.code || '000000';
    const lg = await http('POST', '/api/auth/login', { phone: u.phone, code, national_id: u.national_id });
    if (lg.status !== 200 || !lg.hdr) return { err: lg.status + ' ' + JSON.stringify(lg.json).slice(0, 100) };
    const ckS = lg.hdr.split(';')[0];
    const cmS = lg.hdr.match(/csrf_token=([^;]+)/);
    if (cmS) CSRF_JAR[ckS] = cmS[1];
    return { cookie: ckS };
  };
  const cast = [
    ['superadmin', null, pick('superadmin')],
    ['manager-1', 1, pick('manager', 1)],
    ['manager-2', 2, pick('manager', 2)],
    ['manager-4', 4, pick('manager', 4)],
    ['manager-5', 5, pick('manager', 5)],
    ['teacher-1', 1, pick('teacher', 1)],
    ['student-12th', stU.school_id, stU],
    ['parent', null, parU],
    ['counselor-1', stU.school_id, pick('counselor', stU.school_id)],
    ['counselor-2', 2, pick('counselor', 2)],
    ['driver-1', 1, pick('driver', 1)],
  ];
  const missing = cast.filter(([n]) => !cast.find((x) => x[0] === n)[2]).map((x) => x[0]);
  T(missing.length === 0, 'T2a همهٔ نقش‌ها در دمو پیدا شدند' + (missing.length ? ' — گم: ' + missing.join('،') : ''));
  const tok = {};
  let okLogins = 0;
  for (const [name, , u] of cast) {
    if (!u) continue;
    const r = await login(u);
    if (r.cookie) { tok[name] = r.cookie; okLogins++; }
    else console.log('       ⚠ ' + name + ': ' + r.err);
  }
  T(okLogins === cast.length, 'T2b ورود موفقِ ' + okLogins + ' از ' + cast.length + ' نقش');

  console.log('\n▸ T3 — مدرسهٔ ۶ خاموش');
  const mgr6 = pick('manager', 6);
  const lg6 = mgr6 ? await login(mgr6) : { err: 'مدیری در دمو برای ۶ نیست' };
  T(!lg6.cookie && JSON.stringify(await (async () => {
    const sc = await http('POST', '/api/auth/send-code', { phone: mgr6.phone });
    const code = sc.json.demo_code || '000000';
    return (await http('POST', '/api/auth/login', { phone: mgr6.phone, code, national_id: mgr6.national_id })).json;
  })()).indexOf('school_inactive') > -1, 'T3 مدیرِ مدرسهٔ ۶ (خاموش) نمی‌تواند وارد شود — school_inactive');

  console.log('\n▸ T4 — باتریِ IDOR (تجاوز از درِ سرور)');
  const stForeign = store0.users.find((u) => u.role === 'student' && u.school_id === 1 && u.id !== stU.id);
  const m2U = store0.users.find((u) => u.role === 'manager' && u.school_id === 2);
  const r4a = await http('POST', '/api/sync', { ops: [opReal(m2U, { by: m2U.id, collection: 'grades', type: 'ins', data: { school_id: 1, student_id: stForeign.id, subject_id: 1, term: 'نوبت اول', exam_type: 'پایانی', score: 1, max_score: 20 } })] }, tok['manager-2']);
  T(r4a.status === 403 && r4a.json.code === 'out_of_scope', 'T4a مدیرِ ۲: درجِ نمرهٔ مدرسهٔ ۱ → out_of_scope');
  const r4b = await http('POST', '/api/sync', { ops: [opReal(m2U, { by: m2U.id, collection: 'users', type: 'upd', id: stForeign.id, data: { phone: '09000000000' } })] }, tok['manager-2']);
  T(r4b.status === 403 && r4b.json.code === 'out_of_scope', 'T4b مدیرِ ۲: ویرایشِ دانش‌آموزِ مدرسهٔ ۱ → out_of_scope');
  const tea1 = store0.users.find((u) => u.role === 'teacher' && u.school_id === 1);
  const foreignCls = (store0.classes || []).find((c) => c.school_id === 1 && !(store0.schedule || []).some((s) => s.teacher_id === tea1.id && s.class_id === c.id));
  const foreignStu = store0.users.find((u) => u.id === (store0.enrollments || []).find((e) => e.class_id === foreignCls.id).student_id);
  const r4c = await http('POST', '/api/sync', { ops: [opReal(tea1, { by: tea1.id, collection: 'attendance', type: 'ins', data: { school_id: 1, student_id: foreignStu.id, date: new Date().toISOString().slice(0, 10), status: 'present' } })] }, tok['teacher-1']);
  T(r4c.status === 403 && r4c.json.code === 'out_of_scope', 'T4c دبیر: حضور برای کلاسی که تدریس نمی‌کند → out_of_scope');
  const saU = store0.users.find((u) => u.role === 'superadmin');
  const r4d = await http('POST', '/api/sync', { ops: [opReal(saU, { by: saU.id, collection: 'announcements', type: 'ins', data: { school_id: 1, title: 'اصل: سوپرادمین بدون محدودیت', body: 'sim3' } })] }, tok.superadmin);
  T(r4d.status === 200, 'T4d سوپرادمین: همان رکورد در مدرسهٔ ۱ → 200 (اصلِ بدون‌محدودیت)');

  console.log('\n▸ T5 — batch مسموم (اتمیسی)');
  const annTitle = 'sim3-atomic-' + Date.now();
  const goodOp = opReal(m2U, { by: m2U.id, collection: 'announcements', type: 'ins', data: { school_id: 2, title: annTitle, body: 'بخشِ معتبر' } });
  const badOp = opReal(m2U, { by: m2U.id, collection: 'grades', type: 'ins', data: { school_id: 1, student_id: stForeign.id, subject_id: 1, term: 'نوبت اول', exam_type: 'پایانی', score: 1, max_score: 20 } });
  const r5 = await http('POST', '/api/sync', { ops: [goodOp, badOp] }, tok['manager-2']);
  const diskAfter5 = JSON.parse(fs.readFileSync(store, 'utf8'));
  T(r5.status === 403 && r5.json.code === 'out_of_scope', 'T5a batch با یک opِ نامعتبر → کل batch رد شد');
  T(!((diskAfter5.announcements || []).some((a) => a.title === annTitle)), 'T5b opِ معتبرِ همان batch هم اعمال نشد (اتمی)');

  console.log('\n▸ T6 — ایدمپوتنس (uid تکراری)');
  const dupOp = opReal(m2U, { by: m2U.id, collection: 'announcements', type: 'ins', uid: 'sim3-dup-' + Date.now(), data: { school_id: 2, title: 'sim3-dup', body: 'اول' } });
  const r6a = await http('POST', '/api/sync', { ops: [dupOp] }, tok['manager-2']);
  const r6b = await http('POST', '/api/sync', { ops: [dupOp] }, tok['manager-2']);
  T(r6a.status === 200 && r6b.json.results && r6b.json.results[0] && r6b.json.results[0].code === 'duplicate_ignored', 'T6a تکرارِ uid → duplicate_ignored');
  const diskAfter6 = await waitForDisk(store, (d) => ((d.announcements || []).filter((a) => a.title === 'sim3-dup')).length === 1);
  T(((diskAfter6.announcements || []).filter((a) => a.title === 'sim3-dup')).length === 1, 'T6b فقط یک رکورد روی disk');

  console.log('\n▸ T7 — batch بزرگ');
  const bigOps = [];
  for (let i = 0; i < 501; i++) bigOps.push(opReal(saU, { by: saU.id, collection: 'announcements', type: 'ins', data: { school_id: 1, title: 'sim3-big', body: String(i) } }));
  const r7 = await http('POST', '/api/sync', { ops: bigOps }, tok.superadmin);
  T(r7.status === 413 && r7.json.code === 'batch_too_large', 'T7 ۵۰۱ op → 413 batch_too_large');

  console.log('\n▸ T8 — byِ جعلی');
  const r8 = await http('POST', '/api/sync', { ops: [Object.assign(opReal(m2U, { by: m2U.id, collection: 'announcements', type: 'ins', data: { school_id: 2, title: 'sim3-forge', body: 'byِ جعلی' } }), { by: saU.id })] }, tok['manager-2']);
  T(r8.status === 403 && r8.json.code === 'forged_by', 'T8 op با byِ کاربرِ دیگر → forged_by');

  console.log('\n▸ T9 — مهرهایِ جعلی');
  const r9a = await http('POST', '/api/sync', { ops: [Object.assign(opReal(m2U, { by: m2U.id, collection: 'announcements', type: 'ins', data: { school_id: 2, title: 'sim3-um', body: 'x' } }), { user_id: saU.id })] }, tok['manager-2']);
  T(r9a.status === 403 && r9a.json.code === 'user_mismatch', 'T9a user_idِ جعلی → user_mismatch');
  const r9b = await http('POST', '/api/sync', { ops: [Object.assign(opReal(m2U, { by: m2U.id, collection: 'announcements', type: 'ins', data: { school_id: 2, title: 'sim3-sm', body: 'x' } }), { school_id: 1 })] }, tok['manager-2']);
  T(r9b.status === 403 && r9b.json.code === 'school_mismatch', 'T9b school_idِ جعلی → school_mismatch');

  console.log('\n▸ T10 — روزِ غیرحضوری (عملیاتِ فیزیکی مسدود)');
  const vday = new Date().toISOString().slice(0, 10);
  const t2U = store0.users.find((u) => u.role === 'teacher' && u.school_id === 2);
  const cls2 = (store0.classes || []).find((c) => c.school_id === 2 && (store0.schedule || []).some((s) => s.teacher_id === t2U.id && s.class_id === c.id));
  const st2U = store0.users.find((u) => u.id === (store0.enrollments || []).find((e) => e.class_id === cls2.id).student_id);
  const mgr2U = m2U;
  const r10m = await http('POST', '/api/sync', { ops: [opReal(mgr2U, { by: mgr2U.id, collection: 'attendance_modes', type: 'ins', data: { school_id: 2, date: vday, mode: 'virtual', set_by: mgr2U.id, set_at: vday } })] }, tok['manager-2']);
  T(r10m.status === 200, 'T10a مدیرِ ۲: اعلامِ روزِ غیرحضوری → 200');
  const t2C = (await login(t2U)).cookie || '';
  const r10 = await http('POST', '/api/sync', { ops: [
    opReal(t2U, { by: t2U.id, collection: 'attendance', type: 'ins', data: { school_id: 2, student_id: st2U.id, date: vday, status: 'present' } }),
    opReal(t2U, { by: t2U.id, collection: 'teacher_notes', type: 'ins', data: { school_id: 2, student_id: st2U.id, teacher_id: t2U.id, body: 'sim3 غیرفیزیکی' } }),
  ] }, t2C);
    console.log('       [dbg] status='+r10.status+' '+JSON.stringify(r10.json).slice(0,400));
    const codes10 = (r10.json.results || []).map((x) => x.code);
  T(codes10.indexOf('virtual_day') > -1, 'T10b حضورِ فیزیکی در روزِ غیرحضوری → virtual_day');
  T((r10.json.results || []).some((r) => r.ok === true), 'T10c عملیاتِ غیرفیزیکیِ همان batch ادامه خورد (per-op، نه همه)');
  const diskForDel = await waitForDisk(store, (d) => (d.attendance_modes || []).some((m) => m.school_id === 2 && m.date === vday));
  const modeRec = (diskForDel.attendance_modes || []).find((m) => m.school_id === 2 && m.date === vday);
  T(!!modeRec, 'T10d رکوردِ غیرحضوری روی disk دیده شد (پیش از پاک‌سازی)');
  const r10c = modeRec ? await http('POST', '/api/sync', { ops: [opReal(mgr2U, { by: mgr2U.id, collection: 'attendance_modes', type: 'del', id: modeRec.id, data: {} })] }, tok['manager-2']) : null;
  T(r10c && r10c.status === 200, 'T10e پاک‌سازیِ حالتِ غیرحضوری');

  console.log('\n▸ T11 — flush واقعی به disk + آدیت');
  const flushTitle = 'sim3-flush-' + Date.now();
  await http('POST', '/api/sync', { ops: [opReal(m2U, { by: m2U.id, collection: 'announcements', type: 'ins', data: { school_id: 2, title: flushTitle, body: 'flush' } })] }, tok['manager-2']);
  await sleep(2500);
  const diskFlush = JSON.parse(fs.readFileSync(store, 'utf8'));
  T((diskFlush.announcements || []).some((a) => a.title === flushTitle), 'T11a رکورد روی disk سرور نشست (flush)');
  const auditTxt = fs.existsSync(path.join(dir, 'audit.jsonl')) ? fs.readFileSync(path.join(dir, 'audit.jsonl'), 'utf8') : '';
  T(auditTxt.indexOf('sync_forge_by') > -1, 'T11b آدیتِ forge ثبت شد');
  T(/sync/.test(auditTxt), 'T11c آدیتِ sync ثبت شد');

  console.log('\n▸ T12 — بدون کوکی');
  const r12 = await http('POST', '/api/sync', { ops: [opReal(saU, { by: saU.id, collection: 'announcements', type: 'ins', data: { school_id: 1, title: 'x', body: 'y' } })] }, null);
  T(r12.status === 401 && r12.json.code === 'no_session', 'T12 بدون نشست → 401 no_session');

  child.kill('SIGKILL');
  await sleep(300);
  console.log(`\nsim_full3 (شبیه‌سازیِ جامعِ سرور): ${pass + fail} بررسی — ✅ ${pass} · ❌ ${fail}`);
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error('❌ خطای ناگهانی:', e); process.exit(1); });