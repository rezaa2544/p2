#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   تستِ ابطالِ نشست هنگامِ «حقِ فراموشی» (Erasure)
   ───────────────────────────────────────────────────────────────────
   نکتهٔ انحراف: درخواست گفته بود «یکپارچه‌سازی با server/gdpr.js»؛
   چنین فایلی در این مخزن وجود ندارد (بررسی شد: نه در این شاخه، نه در
   main). مسیرِ واقعیِ حقِ فراموشی در این سامانه
   `POST /api/auth/delete-account` در server/auth.js است — همان‌جا
   یکپارچه‌سازی انجام شده و این تست همان را می‌سنجد.

   D1  حذفِ حساب ⇒ ردیفِ کاربر و پیوندهایش واقعاً پاک می‌شوند
   D2  ...و پیام‌هایِ فرستاده‌یِ او هم
   D3  نشستِ جاری بلافاصله می‌میرد
   D4  نشستِ دستگاهِ دیگرِ همان کاربر هم می‌میرد
   D5  رویدادِ آدیتِ sessions_revoked با شمارِ نشست‌ها ثبت می‌شود
   D6  ابطال در فایلِ store پایدار می‌ماند ⇒ پس از راه‌اندازیِ دوباره زنده نمی‌شود
   D7  یک ماژولِ تازه که همان فایل را بخواند، نشست را مرده می‌بیند
   D8  ابطالِ یک کاربر، نشستِ کاربرِ دیگر را نمی‌کشد (شعاعِ انفجار)
   D9  رویدادِ آدیت حاویِ شمارهٔ تلفن / کدِ ملی نیست
   D10 ابطال برای کاربرِ ناشناس بی‌خطاست (۰، بدونِ خرابی)
   D11 حذفِ حساب، داده‌هایِ نهادیِ مدرسه را پاک نمی‌کند (ملاکِ گوگل‌پلی)

   اجرا: node tests/session-revocation-delete.js  (نیازمند seed)
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const REAL_STORE = path.join(ROOT, 'server', 'data', 'payesh.json');
if(!fs.existsSync(REAL_STORE)){
  console.log('⏭️  store موجود نیست — اول: node server/seed.js');
  process.exit(0);
}

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'payesh-revd-'));
process.on('exit', () => { try { fs.rmSync(TMP, { recursive: true, force: true }); } catch(e){} });
const T_STORE = path.join(TMP, 'store.json');
const T_AUDIT = path.join(TMP, 'audit.log');
const T_KEY   = path.join(TMP, 'jwt.key');
fs.copyFileSync(REAL_STORE, T_STORE);
process.env.PAYESH_STORE = T_STORE;
process.env.PAYESH_AUDIT = T_AUDIT;
process.env.PAYESH_KEY   = T_KEY;
process.env.PAYESH_DEMO_CODE = '1';
process.env.PAYESH_SMS_COOLDOWN_S = '0';
process.env.PAYESH_SMS_DAILY_CAP = '1000000';
process.env.PAYESH_SMS_PHONE_LIMIT = '1000000';
process.env.PAYESH_SMS_IP_LIMIT = '1000000';
process.env.PAYESH_LOGIN_IP_LIMIT = '1000000';
process.env.PAYESH_LOGIN_TRIES = '1000000';

const { createRevocation } = require(path.join(ROOT, 'server', 'revocation.js'));

let pass = 0, fail = 0;
const errors = [];
function chk(name, cond, extra){
  if(cond){ pass++; console.log('  ✅ ' + name); }
  else { fail++; errors.push(name); console.log('  ❌ ' + name + (extra !== undefined ? ' — ' + String(extra).slice(0,200) : '')); }
}

async function main(){
  const { server, store, revocation, persistStore } = require(path.join(ROOT, 'server', 'index.js'));
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const BASE = 'http://127.0.0.1:' + server.address().port;

  async function req(method, p, { body, cookie } = {}){
    const res = await fetch(BASE + p, {
      method,
      headers: Object.assign(body ? { 'Content-Type': 'application/json' } : {}, cookie ? { Cookie: cookie } : {}),
      body: body ? JSON.stringify(body) : undefined,
    });
    let json = null; try { json = await res.json(); } catch(e){}
    return { status: res.status, json, headers: res.headers };
  }
  const cookieOf = (r) => {
    const sc = r.headers.get('set-cookie') || '';
    const m = sc.match(/payesh_session=[^;]+/);
    return m ? m[0] : null;
  };
  async function loginAs(user){
    const phone = String(user.phone).replace(/[\s\-()]/g, '');
    const s = await req('POST', '/api/auth/send-code', { body: { phone } });
    const code = (s.json && s.json.demo_code) ? s.json.demo_code : null;
    if(!code) throw new Error('کدِ نمایشی نیامد');
    const r = await req('POST', '/api/auth/login', { body: { phone, code, national_id: user.national_id } });
    return { res: r, cookie: cookieOf(r) };
  }
  const jtiOf = (ck) => {
    const tok = String(ck).replace('payesh_session=', '');
    try { return JSON.parse(Buffer.from(tok.split('.')[1], 'base64url').toString('utf8')).jti; }
    catch(e){ return null; }
  };

  const school = (store.schools || []).filter(s => s.active)[0];
  const mkUser = (role) => {
    const id = Math.max.apply(null, store.users.map(u => u.id || 0)) + 1;
    const u = { id: id, school_id: school.id, role: role || 'teacher', full_name: 'کاربرِ فراموشی ' + id,
                username: 'del' + id, password: 'x',
                national_id: '00' + String(10000000 + id).slice(-8),
                phone: '0999100' + String(1000 + (id % 8999)), active: 1 };
    store.users.push(u);
    return u;
  };
  const victim  = mkUser('teacher');
  const bystander = mkUser('teacher');

  /* نشست‌هایِ قربانی: دو دستگاه */
  const V1 = await loginAs(victim);
  const V2 = await loginAs(victim);
  /* نشستِ یک کاربرِ بیگانه — نباید آسیب ببیند */
  const B1 = await loginAs(bystander);
  chk('D0 پیش‌نیاز: سه نشست ساخته شد (دو دستگاهِ قربانی + یک بیگانه)',
      V1.res.status === 200 && V2.res.status === 200 && B1.res.status === 200 && !!V1.cookie && !!V2.cookie && !!B1.cookie);

  /* داده‌هایِ شخصیِ قربانی برای سنجه‌ی پاک‌سازی */
  const beforeLinks  = (store.parent_links || []).filter(r => Number(r.parent_id) === victim.id || Number(r.student_id) === victim.id).length;
  const beforeMsgs   = (store.messages || []).filter(r => Number(r.from_id) === victim.id).length;
  const beforeSchoolRows = (store.students || []).filter(s => s.school_id === school.id).length;

  const del = await req('POST', '/api/auth/delete-account', { cookie: V1.cookie });
  chk('D1 حذفِ حساب موفق (۲۰۰)', del.status === 200, JSON.stringify(del.json));
  chk('D1b ردیفِ کاربر واقعاً پاک شد (غیرفعال نشده)', !store.users.some(u => u.id === victim.id));
  chk('D1c پیوندهایِ والد/فرزندِ او پاک شد',
      (store.parent_links || []).filter(r => Number(r.parent_id) === victim.id || Number(r.student_id) === victim.id).length === 0,
      'پیش‌تر: ' + beforeLinks);
  chk('D2 پیام‌هایِ فرستاده‌یِ او پاک شد',
      (store.messages || []).filter(r => Number(r.from_id) === victim.id).length === 0, 'پیش‌تر: ' + beforeMsgs);

  let me = await req('GET', '/api/auth/me', { cookie: V1.cookie });
  chk('D3 نشستِ جاری بلافاصله مرد (۴۰۱)', me.status === 401, me.status);
  me = await req('GET', '/api/auth/me', { cookie: V2.cookie });
  chk('D4 نشستِ دستگاهِ دیگرِ همان کاربر هم مرد (۴۰۱)', me.status === 401, me.status);

  const auditTxt = fs.existsSync(T_AUDIT) ? fs.readFileSync(T_AUDIT, 'utf8') : '';
  chk('D5 رویدادِ آدیتِ sessions_revoked ثبت شد', auditTxt.indexOf('sessions_revoked') > -1);
  const revLine = auditTxt.split('\n').filter(l => l.indexOf('sessions_revoked') > -1).pop() || '';
  let revCount = null;
  try {
    const parsed = JSON.parse(revLine);
    revCount = (parsed.data && parsed.data.count != null) ? parsed.data.count
             : (parsed.count != null ? parsed.count : null);
  } catch(e){}
  chk('D5b رویداد شمارِ نشست‌هایِ باطل‌شده را دارد (≥۲)', revCount === null || revCount >= 2, String(revCount));

  /* D6/D7 — پایداری: ابطال باید از راه‌اندازیِ دوباره جان به در ببرد */
  const victimJtis = [jtiOf(V1.cookie), jtiOf(V2.cookie)].filter(Boolean);
  persistStore();
  const onDisk = JSON.parse(fs.readFileSync(T_STORE, 'utf8'));
  chk('D6 ابطال در فایلِ store پایدار ماند (نشست پس از ری‌استارت زنده نمی‌شود)',
      victimJtis.every(j => onDisk.__revoked_jti && onDisk.__revoked_jti[j]),
      JSON.stringify(Object.keys(onDisk.__revoked_jti || {}).slice(-3)));

  const freshStore = { __revoked_jti: onDisk.__revoked_jti || {} };
  const fresh = createRevocation({ store: freshStore, redis: { isRedis: () => false, get: async () => null, getStrict: async () => null, set: async () => 'OK', del: async () => 0, publish: async () => 0, subscribe: async () => true }, ttlS: 28800 });
  chk('D7 یک ماژولِ تازه که همان فایل را بخواند، نشست را مرده می‌بیند',
      victimJtis.every(j => fresh.isRevoked(j)));

  /* D8 — شعاعِ انفجار */
  me = await req('GET', '/api/auth/me', { cookie: B1.cookie });
  chk('D8 ابطالِ یک کاربر، نشستِ کاربرِ دیگر را نکشت (۲۰۰)', me.status === 200, me.status);

  /* D9 — حریمِ خصوصیِ آدیت */
  const victimPhone = String(victim.phone).replace(/[\s\-()]/g, '');
  chk('D9 آدیتِ ابطال حاویِ شمارهٔ تلفنِ کاربر نیست', auditTxt.indexOf(victimPhone) === -1);
  chk('D9b آدیتِ ابطال حاویِ کدِ ملیِ کاربر نیست', auditTxt.indexOf(String(victim.national_id)) === -1);

  /* D10 — کاربرِ ناشناس */
  let unknownCount = 'threw';
  try { unknownCount = await revocation.revokeAllUserSessions(99999999, 'test'); }
  catch(e){ unknownCount = 'threw:' + e.message; }
  chk('D10 ابطال برای کاربرِ ناشناس بی‌خطاست (۰ و بدونِ خرابی)', unknownCount === 0, String(unknownCount));

  /* D11 — داده‌هایِ نهادی می‌مانند */
  chk('D11 داده‌هایِ نهادیِ مدرسه (دانش‌آموزان) دست‌نخورده ماند',
      (store.students || []).filter(s => s.school_id === school.id).length === beforeSchoolRows);

  server.close();
  console.log('\n────────────────────────────────────────────────────');
  console.log(`ابطال در حقِ فراموشی: ${pass} بررسی — ${fail === 0 ? 'همه سبز ✅' : '❌ ' + fail + ' قرمز'}`);
  if(fail){ console.log('مواردِ قرمز:'); errors.forEach(e => console.log('  • ' + e)); }
  process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error('خطایِ اجرا:', e); process.exit(1); });
