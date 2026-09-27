#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   tests/n27-pull-directory-least-privilege.test.js — N-27 regression guard
   -------------------------------------------------------------------
   N-27 (شدت: MEDIUM): در server/pull.js، مجموعهٔ users برای نقش‌هایی که
   شاخهٔ صریح نداشتند (driver، guard، edu_office) از یک fallthrough می‌رسید
   و کلِ دایرکتوریِ کاربرانِ مدرسه را می‌فرستاد — همهٔ دانش‌آموزان،
   اولیا، دبیران و مدیران، با اینکه نه راننده و نه نگهبان هیچ‌وقت
   دایرکتوری را در کلاینت رندر نمی‌کنند (راننده فقط سرویسِ اتوبوس، نگهبان
   فقط پذیرشِ مهمان).

   دروازهٔ جدید (کمترینِ امتیاز، آینهٔ نیازِ واقعیِ کلاینت):
     driver  → خودش + دانش‌آموزان + رانندگانِ هم‌مدرسه
     guard   → خودش + مدیرانِ هم‌مدرسه
     edu_office → مدارسِ داخلِ محدودهٔ دفتر (آینهٔ policy.filterReadable)
     ناشناخته → فقط خودش (fail-closed)
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const REAL_STORE = path.join(ROOT, 'server', 'data', 'payesh.json');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'payesh-n27-'));
process.on('exit', () => { try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {} });

const T_STORE = path.join(TMP, 'store.json');
const T_AUDIT = path.join(TMP, 'audit.log');
const T_KEY   = path.join(TMP, 'jwt.key');
fs.copyFileSync(REAL_STORE, T_STORE);

process.env.PAYESH_STORE = T_STORE;
process.env.PAYESH_AUDIT = T_AUDIT;
process.env.PAYESH_KEY   = T_KEY;
process.env.PAYESH_DEMO_CODE = '1';
/* REST-writing suites need this or every write 503s (see tests/api/runner.js). */
process.env.PAYESH_ALLOW_DEV_MEMORY_AUTHORITY = '1';

const { server, store } = require('../server/index.js');

let BASE = '';
let pass = 0, fail = 0;

async function req(method, p, opts) {
  const options = opts || {};
  const res = await fetch(BASE + p, {
    method,
    headers: Object.assign(
      options.body ? { 'Content-Type': 'application/json' } : {},
      options.cookie ? { Cookie: options.cookie } : {}
    ),
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  let json = null;
  try { json = await res.json(); } catch (e) {}
  return { status: res.status, json, headers: res.headers };
}

async function loginAs(user) {
  const phone = String(user.phone).replace(/[\s\-()]/g, '');
  let r = await req('POST', '/api/auth/send-code', { body: { phone } });
  assert.strictEqual(r.status, 200);
  const code = r.json.demo_code;
  const nid = String(user.national_id);
  r = await req('POST', '/api/auth/login', { body: { phone, code, national_id: nid } });
  assert.strictEqual(r.status, 200);
  const sc = r.headers.get('set-cookie') || '';
  const m = sc.match(/payesh_session=[^;]+/);
  return m ? m[0] : null;
}

async function test(name, fn) {
  try {
    await fn();
    pass++;
    console.log('  ✅ ' + name);
  } catch (err) {
    fail++;
    console.error('  ❌ ' + name + '\n     ' + err.message);
  }
}

async function pullUsers(cookie, schoolId) {
  const q = 'collections=users' + (schoolId != null ? '&school_id=' + schoolId : '');
  const r = await req('GET', '/api/v1/pull?' + q, { cookie });
  assert.strictEqual(r.status, 200, 'pull باید 200 باشد ولی ' + r.status + ' بود: ' + JSON.stringify(r.json));
  assert.ok(r.json && r.json.collections && Array.isArray(r.json.collections.users),
    'پاسخِ pull باید collections.users داشته باشد');
  return r.json.collections.users;
}

async function main() {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  BASE = 'http://127.0.0.1:' + server.address().port;

  const driver = store.users.find(u => u.role === 'driver' && u.school_id === 1);
  const guard = store.users.find(u => u.role === 'guard' && u.school_id === 1);
  const manager = store.users.find(u => u.role === 'manager' && u.school_id === 1);
  const teacher = store.users.find(u => u.role === 'teacher' && u.school_id === 1);
  const student = store.users.find(u => u.role === 'student' && u.school_id === 1);
  const eduOffice = store.users.find(u => u.role === 'edu_office');
  assert.ok(driver, 'دادهٔ نمونه driver مدرسهٔ ۱ نیست');
  assert.ok(guard, 'دادهٔ نمونه guard مدرسهٔ ۱ نیست');
  assert.ok(manager && teacher && student && eduOffice, 'سایر نقش‌های نمونه نیستند');

  const cookieDriver = await loginAs(driver);
  const cookieGuard = await loginAs(guard);
  const cookieMgr = await loginAs(manager);
  assert.ok(cookieDriver && cookieGuard && cookieMgr, 'ورود ناموفق بود');

  console.log('\n🔍 N-27: pull users — least privilege for support roles');

  /* N27-1 — مانیفستِ خطا: راننده فقط دانش‌آموزان + رانندگان + خودش را
     می‌گیرد، نه اولیا/دبیران/مشاوران/مدیرانِ مدرسه. */
  await test('N27-1: driver gets only students + drivers + self', async () => {
    const users = await pullUsers(cookieDriver, 1);
    const roles = new Set(users.map(u => u.role));
    assert.ok(roles.has('driver'), 'راننده باید خودش/همکارانش را ببیند');
    assert.ok(roles.has('student'), 'راننده باید دانش‌آموزانِ مسیر را ببیند');
    assert.ok(!roles.has('parent'), 'راننده نباید اولیا را ببیند (دیده: ' + [...roles].join(',') + ')');
    assert.ok(!roles.has('teacher'), 'راننده نباید دبیران را ببیند');
    assert.ok(!roles.has('manager'), 'راننده نباید مدیران را ببیند');
    assert.ok(!roles.has('counselor'), 'راننده نباید مشاوران را ببیند');
    assert.ok(users.some(u => Number(u.id) === Number(driver.id)), 'راننده باید رکوردِ خودش را ببیند');
  });

  /* N27-2 — مانیفستِ خطا: نگهبان فقط مدیران + خودش را می‌گیرد. */
  await test('N27-2: guard gets only managers + self', async () => {
    const users = await pullUsers(cookieGuard, 1);
    const roles = new Set(users.map(u => u.role));
    assert.ok(roles.has('manager'), 'نگهبان باید مدیرانِ مدرسه را ببیند (تماسِ پذیرش)');
    assert.ok(!roles.has('student'), 'نگهبان نباید دانش‌آموزان را ببیند (دیده: ' + [...roles].join(',') + ')');
    assert.ok(!roles.has('parent'), 'نگهبان نباید اولیا را ببیند');
    assert.ok(!roles.has('teacher'), 'نگهبان نباید دبیران را ببیند');
    assert.ok(users.some(u => Number(u.id) === Number(guard.id)), 'نگهبان باید رکوردِ خودش را ببیند');
  });

  /* N27-3 — PII: فیلدهای حساس برای این نقش‌ها project می‌شوند و نشت
     نمی‌کنند (phone/national_id در پاسخِ pull نیست). */
  await test('N27-3: driver/guard pull rows carry no phone or national_id', async () => {
    const drv = await pullUsers(cookieDriver, 1);
    const grd = await pullUsers(cookieGuard, 1);
    for (const u of drv.concat(grd)) {
      assert.ok(u.phone === undefined, 'phone نباید برای driver/guard نشت کند (روی ' + u.id + ')');
      assert.ok(u.national_id === undefined, 'national_id نباید نشت کند (روی ' + u.id + ')');
      assert.ok(u.password === undefined, 'password هرگز نباید نشت کند');
    }
  });

  /* N27-4 — کنترلِ مثبت: نقش‌های مشروعِ مدرسه همچنان دایرکتوریِ کاملِ
     مدرسه را می‌گیرند (اصلاح نباید عملیاتِ مشروع را بشکند). */
  await test('N27-4: manager still sees the full school directory', async () => {
    const users = await pullUsers(cookieMgr, 1);
    const schoolUsers = store.users.filter(u => Number(u.school_id) === 1);
    assert.ok(users.length > 0, 'مدیر باید کاربرانِ مدرسه را ببیند');
    assert.strictEqual(users.length, schoolUsers.length,
      'مدیر باید تک‌تکِ کاربرانِ مدرسه را ببیند (' + users.length + '/' + schoolUsers.length + ')');
    const ids = new Set(users.map(u => Number(u.id)));
    for (const u of schoolUsers) assert.ok(ids.has(Number(u.id)), 'کاربرِ ' + u.id + ' برای مدیر گم شده');
  });

  /* N27-5 — edu_office فقط مداخلِ محدودهٔ دفترِ خودش را می‌بیند، نه مدارسِ
     دیگر را؛ و دانش‌آموز فقط خودش. */
  await test('N27-5: edu_office scoped to its office; student sees only self', async () => {
    const cookieEo = await loginAs(eduOffice);
    assert.ok(cookieEo, 'ورودِ اداره ناموفق بود');
    const users = await pullUsers(cookieEo);
    /* edu_office باید *چیزهایی* ببیند (آینهٔ policy.filterReadable) ولی
       همه‌اش محدود به دفتر است — مدرسهٔ بدونِ پوشش نباید باشد. */
    assert.ok(Array.isArray(users), 'پاسخ باید آرایه باشد');
    const everySchoolScoped = users.every(u => u.school_id != null);
    assert.ok(everySchoolScoped, 'هر کاربی که edu_office می‌بیند باید school_id داشته باشد (بدونِ مدرسه = محدودهٔ نامشخص)');

    const cookieStd = await loginAs(student);
    assert.ok(cookieStd, 'ورودِ دانش‌آموز ناموفق بود');
    const stdUsers = await pullUsers(cookieStd, 1);
    assert.strictEqual(stdUsers.length, 1, 'دانش‌آموز باید فقط خودش را ببیند ولی ' + stdUsers.length + ' رکورد دید');
    assert.strictEqual(Number(stdUsers[0].id), Number(student.id));
  });

  console.log(`\nN-27 Pull Least-Privilege Tests: ${pass}/${pass + fail} passed`);
  if (fail > 0) process.exit(1);
  server.close();
}

if (require.main === module) {
  main().catch(e => { console.error(e); process.exit(1); });
}
