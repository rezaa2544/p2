/* =======================================================================
   tests/office-head-contract.js — قراردادِ پایان‌به‌پایانِ «رئیس اداره» (is_head)

   مالکیت: Chat2 — C2-07 (ساختِ اولیه) · C1-05 (توازنِ جدولِ اجرایی) ·
           C2-02 (parity + negative control) · C2-03 (قراردادِ end-to-end)
   Base:   main@16182f8cb9a9146fbc25c05ac4a9768f4f2d9702 (Shift 2 board)

   C2-03 (Takeover از شاخهٔ arena/01a0af02-p2 / PR #299 — بسته‌شده بدون مرج):
  Acceptance:   seed / model / write-perms / sync / policy / UI — positive + negative

   چرا این بازنویسی لازم بود (سه نقصِ اثبات‌شده در نسخهٔ قبل — red-first):
     1) بخش B هیچ assert نداشت: `require('../tools/seed-office-data.js')` آن فایل
        را اجرا می‌کرد و `module.exports` ندارد ⇒ تست همیشه [PASS] چاپ می‌کرد
        (سبزِ جعلی — خلافِ قاعدهٔ «no fake green»).
     2) بخش C فقط grep رشتهٔ 'is_head' در سورس بود و با مسیرِ نسبی
        `readFileSync('./src/js/30-authz.js')` ⇒ اجرای تست از هر cwd دیگری
        با ENOENT می‌ شکست (شکستگیِ محیطی).
     3) «negative control» قبلی فقط یک خط print بود و هیچ کنشی/ادعایی نداشت؛
        لایه‌های sync و policy هرگز اجرا نمی‌شدند.

   حالا هر شش لایه «اجرا» می‌شود و هر لایه کنترلِ منفیِ جهش‌محور دارد
   (جهش فقط در حافظه؛ هیچ فایلِ مخزن دست‌نخورده). مسیرِ نبودِ دانه ⇒ NOT-RUN
   با دلیلِ دقیق — سبزِ جعلی ممنوع.

   اجرا: node tests/office-head-contract.js
   این سوئیت در tests/run.js نیست (گیتِ سریعِ آفلاین؛ و بخشی از سنجه‌ها
   به فروشگاهِ تولیدشده نیاز دارند) — همان جایگاهِ قبلیِ خودش.
   ======================================================================= */
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const P = (rel) => path.join(ROOT, rel);
const STORE = P('server/data/payesh.json');
const MODEL_PATH = P('authz/model.json');

const HEAD_ACTIONS = ['office-msg', 'office-print', 'office-dash', 'office-broadcast'];

let pass = 0;
const failures = [];
const notrun = [];
const findings = [];

function check(id, name, fn) {
  try {
    fn();
    pass++;
    console.log('[PASS] ' + id + ' - ' + name);
  } catch (e) {
    failures.push(id);
    console.log('[FAIL] ' + id + ' - ' + (e && e.message ? e.message : String(e)));
  }
}
function notRun(id, name, why) {
  notrun.push(id);
  console.log('[NOT-RUN] ' + id + ' - ' + name + ' — دلیل: ' + why);
}
function finding(id, text) {
  findings.push(id);
  console.log('[FINDING] ' + id + ' - ' + text);
}

/* -------------------------------------------------------------------- */
/* ابزارِ مشترک                                                        */
/* -------------------------------------------------------------------- */
function readJson(p) { return JSON.parse(fs.readFileSync(p, 'utf8')); }

/* توازنِ جدولِ تولیدشده با مدل (C1-05 — رفتارِ حفظ‌شده) */
function fieldParity(model, artifact) {
  const missing = [], extra = [];
  const cols = Object.keys(model.collections || {});
  for (const c of cols) {
    const want = (model.collections[c] || {}).fields || [];
    const got = (artifact.fields || {})[c] || [];
    for (const f of want) if (got.indexOf(f) === -1) missing.push(c + '.' + f);
    for (const f of got) if (want.indexOf(f) === -1) extra.push(c + '.' + f);
  }
  return { missing, extra, collections: cols.length };
}

function opsParity(model, artifact) {
  const drift = [];
  for (const c of Object.keys(model.collections || {})) {
    const def = model.collections[c] || {};
    const got = (artifact.ops || {})[c] || {};
    for (const op of ['ins', 'upd', 'del']) {
      if (JSON.stringify(def[op] || []) !== JSON.stringify(got[op] || [])) drift.push(c + '.' + op);
    }
  }
  return drift;
}

/* آشکارسازِ «ادارهٔ بی‌رئیس» — همان منطقی که B1 و B2 روی آن سوارند.
   requireActive=false برای fixtureهایی که فیلدِ active ندارند
   (tools/seed-office-data.js پیش‌نویس است و active ندارد). */
function officesWithoutHead(users, requireActive) {
  const needActive = requireActive !== false;
  const byOffice = new Map();
  for (const u of users || []) {
    if (u.role !== 'edu_office') continue;
    if (needActive && u.active !== 1) continue;
    const k = String(u.office_id == null ? '∅' : u.office_id);
    if (!byOffice.has(k)) byOffice.set(k, []);
    byOffice.get(k).push(u);
  }
  const bad = [];
  for (const [office, list] of byOffice) {
    if (!list.some((u) => u.is_head === 1)) bad.push(office);
  }
  return { bad, offices: byOffice.size, heads: [...byOffice.values()].filter((l) => l.some((u) => u.is_head === 1)).length };
}

/* دانه: در صورت نبودِ فروشگاه، یک‌بار تولید می‌شود (همان الگوی
   tests/seed-completeness.js — فروشگاهِ تولیدی در .gitignore است). */
let store = null, storeSkipWhy = '';
function loadStore() {
  if (store || storeSkipWhy) return store;
  if (!fs.existsSync(STORE)) {
    try {
      execFileSync(process.execPath, [P('server/seed.js')], { stdio: 'pipe', timeout: 300000 });
    } catch (e) {
      const why = String(e && e.message || e).split('\n').filter(Boolean)[0] || 'seed failed';
      storeSkipWhy = 'تولیدِ دانه نشد (`node server/seed.js`): ' + why +
        ' — لازم است: `npm i --no-save jsdom` (devDependency)';
      return null;
    }
  }
  store = readJson(STORE);
  return store;
}

/* canRoute واقعی، از سورسِ محصول، در سندباکسِ vm.
   NAV عمداً تهی است تا «شاخهٔ رئیس» تنها منبعِ تصمیمِ این سه نام باشد
   (روت‌های واقعیِ NAV در tests/smoke.js پوشش دارند). */
function loadCanRoute(user) {
  const src = fs.readFileSync(P('src/js/30-authz.js'), 'utf8');
  const ctx = vm.createContext({ NAV: {}, S: { user: user }, console: { log() {}, warn() {}, error() {} } });
  vm.runInContext(src + '\n;globalThis.__canRoute = canRoute;', ctx);
  return (route, role) => ctx.__canRoute(route, role);
}

/* -------------------------------------------------------------------- */
/* A) مدل + جدولِ اجرایی (مدل منبعِ کوراکشن، جدول آنچه سرور می‌خواند) */
/* -------------------------------------------------------------------- */
check('A1', 'authz/model.json: users.fields has is_head; ins/upd/del = manager+superadmin only', () => {
  const model = readJson(MODEL_PATH);
  const users = model.collections.users;
  assert.ok(users.fields.includes('is_head'), 'authz/model.json users.fields must include is_head');
  assert.strictEqual(users.fields.length, 37, 'users fields count must be 37 (36 + is_head)');
  /* فیلدِ اختیارتبار: فقط مدیریتِ کاربران/سوپرادمین — ارتقاءِ خودِ نقش رد است */
  for (const op of ['ins', 'upd', 'del']) {
    assert.deepStrictEqual(users[op], ['manager', 'superadmin'],
      'users.' + op + ' باید دقیقاً [manager, superadmin] باشد (یافته: ' + JSON.stringify(users[op]) + ')');
  }
});

function testRuntimeArtifactParity() {
  const model = readJson(MODEL_PATH);
  const artifact = readJson(P('authz/write-perms.json'));
  const p = fieldParity(model, artifact);
  assert.strictEqual(p.missing.length, 0,
    'authz/write-perms.json فیلدهایِ مدل را ندارد — server/sync.js fieldGate این فهرست را allowlist می‌گیرد ' +
    '⇒ نوشتنِ آن فیلدها fail-closed رد می‌شود. گمشده: ' + p.missing.join('، ') +
    ' — رفع: node tools/generate-write-perms.js');
  assert.strictEqual(p.extra.length, 0,
    'authz/write-perms.json فیلدِ بیرون از مدل دارد: ' + p.extra.join('، '));
  const ops = opsParity(model, artifact);
  assert.strictEqual(ops.length, 0, 'authz/write-perms.json ناهمخوانیِ عملیات با مدل دارد: ' + ops.join('، '));
  assert.ok(artifact.fields.users.indexOf('is_head') > -1,
    'users.is_head در جدولِ اجرایی نیست — مسیرِ «رئیسِ اداره» بی‌اثر می‌شود (server/policy.js:317)');
  return p;
}
check('A2', 'authz/write-perms.json: field+ops parity with model; users.is_head present', () => {
  const p = testRuntimeArtifactParity();
  console.log('        (' + p.collections + ' collection, parity ok)');
});

function testNegativeFieldParityControl() {
  const model = readJson(MODEL_PATH);
  const artifact = readJson(P('authz/write-perms.json'));
  const mutated = { fields: JSON.parse(JSON.stringify(artifact.fields)), ops: artifact.ops };
  mutated.fields.users = mutated.fields.users.filter((f) => f !== 'is_head');
  const p = fieldParity(model, mutated);
  assert.deepStrictEqual(p.missing, ['users.is_head'],
    'کنترلِ منفی: حذفِ is_head از جدول باید «users.is_head» را گمشده گزارش کند');
}
check('A3', 'negative control: dropping is_head from the runtime table is detected', testNegativeFieldParityControl);

check('A4', 'generator is idempotent: `generate-write-perms.js --check` exits 0', () => {
  execFileSync(process.execPath, [P('tools/generate-write-perms.js'), '--check'], { stdio: 'pipe' });
});

/* -------------------------------------------------------------------- */
/* B) seed — دانهٔ واقعی، نه پیش‌نویس                                   */
/* -------------------------------------------------------------------- */
const st = loadStore();
if (!st) {
  notRun('B1', 'seed store: ≥1 رئیسِ فعالِ edu_office با is_head=1 + هر اداره ≥1 رئیس', storeSkipWhy);
  notRun('B2', 'negative control: حذفِ پرچم از دانه باید «ادارهٔ بی‌رئیس» بدهد', storeSkipWhy);
} else {
  const users = st.users || [];
  const heads = users.filter((u) => u.role === 'edu_office' && u.active === 1 && u.is_head === 1);
  const experts = users.filter((u) => u.role === 'edu_office' && u.active === 1 && u.is_head !== 1);
  check('B1', 'seed store: ≥1 رئیسِ فعالِ edu_office با is_head=1; هر اداره ≥1 رئیس؛ کارشناس پرچمِ ۱ ندارد', () => {
    assert.ok(heads.length >= 1, 'دانه باید حداقل یک کاربرِ edu_office با is_head=1 داشته باشد (یافته: ' + heads.length + ')');
    assert.ok(experts.length >= 1, 'دانه باید حداقل یک کارشناسِ بی‌پرچم هم داشته باشد تا منفی‌سنجی معنا دارد (یافته: ' + experts.length + ')');
    const r = officesWithoutHead(users);
    assert.ok(r.offices >= 2, 'دانه باید ≥۲ ادارهٔ دارای کاربرِ اداره بسازد (یافته: ' + r.offices + ')');
    assert.deepStrictEqual(r.bad, [], 'این اداره‌ها کاربرِ فعالِ edu_office دارند ولی رئیسِ is_head=1 نه: ' + r.bad.join('، '));
    for (const e of experts) assert.notStrictEqual(e.is_head, 1, 'کارشناس ' + e.username + ' نباید is_head=1 داشته باشد');
    console.log('        (' + heads.length + ' رئیس / ' + experts.length + ' کارشناس، ' + r.offices + ' اداره)');
  });

  check('B2', 'negative control: stripping the flag from the seed store is detected', () => {
    const copy = JSON.parse(JSON.stringify(users)).map((u) => {
      if (u.role === 'edu_office') { delete u.is_head; }
      return u;
    });
    const r = officesWithoutHead(copy);
    assert.ok(r.offices >= 2, 'کنترلِ منفی باید همان اداره‌ها را ببیند (یافته: ' + r.offices + ')');
    assert.strictEqual(r.bad.length, r.offices,
      'پس از حذفِ پرچم باید **همهٔ** اداره‌ها بی‌رئیس گزارش شوند: ' + r.bad.length + ' از ' + r.offices);
    assert.strictEqual(r.heads, 0, 'پس از حذفِ پرچم نباید هیچ رئیسی بماند (یافته: ' + r.heads + ')');
  });
}

check('B3', 'tools/seed-office-data.js (fixtureِ دستهٔ D): exit 0 + خروجیِ معتبر با رئیسِ هر اداره', () => {
  /* اجرا در پروسهٔ فرزند: این فایل با require اثرِ جانبی (چاپِ JSON و
     process.exit) دارد؛ پس فراخوانیِ CLI و سنجشِ stdout. */
  const out = execFileSync(process.execPath, [P('tools/seed-office-data.js')], { stdio: ['ignore', 'pipe', 'pipe'], timeout: 60000 }).toString();
  const sample = JSON.parse(out);
  const r = officesWithoutHead(sample.users, false);
  assert.ok(r.offices >= 2, 'fixture باید ≥۲ ادارهٔ دارای کاربر داشته باشد');
  assert.deepStrictEqual(r.bad, [], 'fixture: ادارهٔ بی‌رئیس: ' + r.bad.join('، '));
  const perOffice = new Map();
  for (const u of sample.users) {
    if (u.role !== 'edu_office') continue;
    perOffice.set(u.office_id, (perOffice.get(u.office_id) || 0) + (u.is_head === 1 ? 1 : 0));
  }
  for (const [office, n] of perOffice) assert.strictEqual(n, 1, 'ادارهٔ ' + office + ' باید دقیقاً یک رئیس داشته باشد (یافته: ' + n + ')');
});

/* -------------------------------------------------------------------- */
/* C) sync — دروازهٔ فیلدِ سرور (fieldGate)                            */
/* -------------------------------------------------------------------- */
const sync = require('../server/sync.js');
const fieldGate = sync.fieldGate;
const MGR = { id: 1, role: 'manager', school_id: 1 };
const SUPER = { id: 2, role: 'superadmin' };

check('C1', 'sync/positive: manager و superadmin می‌توانند users.is_head را بنویسند', () => {
  assert.strictEqual(fieldGate({ t: 'upd', c: 'users', id: 5, data: { is_head: 1 } }, MGR, false), null,
    'مدیر باید بتواند پرچم را ست کند (منبعِ مجوز: users.upd = [manager, superadmin])');
  assert.strictEqual(fieldGate({ t: 'upd', c: 'users', id: 5, data: { is_head: 1 } }, SUPER, false), null,
    'superadmin = "*" باید آزاد باشد');
});

check('C2', 'sync/negative: هیچ نقشِ دیگری نمی‌تواند is_head را بنویسد (خودارتقایی رد)', () => {
  for (const s of [
    { id: 6, role: 'edu_office', office_id: 1 },          /* رئیس یا کارشناسِ اداره */
    { id: 7, role: 'edu_office', office_id: 1, is_head: 1 }, /* با پرچمِ رئیس هم رد */
    { id: 8, role: 'teacher', school_id: 1 },
    { id: 9, role: 'parent' },
    { id: 10, role: 'student', school_id: 1 },
  ]) {
    const v = fieldGate({ t: 'upd', c: 'users', id: s.id, data: { is_head: 1 } }, s, false);
    assert.ok(v && v.code === 'role_denied', 'نقشِ ' + s.role + ' (id=' + s.id + ') باید رد شود، یافته: ' + JSON.stringify(v));
    assert.strictEqual(v.msg.includes('is_head'), false, 'پیامِ رد نباید مقدارِ فیلد را افشا کند');
  }
});

check('C3', 'sync/sensitivity: گیتِ فیلد بیدار است — فیلدِ بیرون‌مدل روی users ⇒ unknown_field', () => {
  const v = fieldGate({ t: 'upd', c: 'users', id: 5, data: { is_headX: 1 } }, MGR, false);
  assert.ok(v && v.code === 'unknown_field',
    'اگر این رد نشود، «سبزیِ» C1 بی‌معناست (mass assignment). یافته: ' + JSON.stringify(v));
});

/* -------------------------------------------------------------------- */
/* D) policy — دروازهٔ fail-closedِ اکشن‌هایِ رئیس‌محور                 */
/* -------------------------------------------------------------------- */
const policy = require('../server/policy.js');
function officeStore() {
  return {
    users: [
      { id: 1027, role: 'edu_office', office_id: 1, is_head: 1, active: 1 },
      { id: 1028, role: 'edu_office', office_id: 1, is_head: 0, active: 1 },
    ],
    schools: [{ id: 1, name: 'س1', office_id: 1, province_id: 901, county_id: 9011, district_id: 90111 }],
  };
}

check('D1', 'policy/positive: رئیسِ اداره (is_head=1) ⇒ اطلاعیهٔ type=office در محدوده پذیرش', () => {
  const store = officeStore();
  const ok = policy.inScope(store.users[0], store, 'notifications', null, { type: 'office', office_id: 1 });
  assert.strictEqual(ok, true, 'رئیس باید اطلاعیهٔ ادارهٔ خودش را بنویسد');
});

check('D2', 'policy/negative: کارشناس (is_head=0) ⇒ همان اطلاعیه رد (fail-closed)', () => {
  const store = officeStore();
  const ok = policy.inScope(store.users[1], store, 'notifications', null, { type: 'office', office_id: 1 });
  assert.strictEqual(ok, false, 'کارشناس باید رد شود — رد نشود یعنی ارتقاءِ بی‌مجوز');
});

check('D3', 'policy/negative control: فقط پرچم عوض می‌شود ⇒ نتیجه وارونه می‌شود (درِ واقعی است)', () => {
  const a = officeStore();
  a.users[1].is_head = 1;   /* کارشناس را رئیس کنیم */
  assert.strictEqual(policy.inScope(a.users[1], a, 'notifications', null, { type: 'office', office_id: 1 }), true,
    'با is_head=1 باید پذیرفته شود — وگرنه گیت به پرچم نگاه نمی‌کند');
  const b = officeStore();
  b.users[0].is_head = 0;   /* رئیس را بی‌پرچم کنیم */
  assert.strictEqual(policy.inScope(b.users[0], b, 'notifications', null, { type: 'office', office_id: 1 }), false,
    'بدون پرچم باید رد شود — وگرنه گیت ثابتِ true است');
  const c = officeStore();  /* کاربرِ اصلاً در store نیست ⇒ رد (fail-closed) */
  assert.strictEqual(policy.inScope({ id: 999, role: 'edu_office', office_id: 1 }, c, 'notifications', null, { type: 'office', office_id: 1 }), false,
    'کاربرِ ناشناس در آینه باید رد شود');
});

check('D4', 'policy/geometry: اطلاعیهٔ ادارهٔ دیگر برای رئیس هم رد است (cross-office)', () => {
  const store = officeStore();
  const ok = policy.inScope(store.users[0], store, 'notifications', null, { type: 'office', office_id: 2 });
  assert.strictEqual(ok, false, 'office_id=2 بیرونِ ادارهٔ کاربر است ⇒ رد (ویو ۵)');
});

/* -------------------------------------------------------------------- */
/* E) UI — canRoute واقعی از سورسِ محصول                                */
/* -------------------------------------------------------------------- */
check('E1', 'UI: canRoute برای edu_office با is_head=1 مجاز و با is_head=0 رد (هر سه روتِ رئیس)', () => {
  const head = loadCanRoute({ role: 'edu_office', is_head: 1 });
  const expert = loadCanRoute({ role: 'edu_office', is_head: 0 });
  const none = loadCanRoute({ role: 'edu_office' });
  for (const r of ['office-msg', 'office-print', 'office-dash']) {
    assert.strictEqual(head(r, 'edu_office'), true, 'رئیس باید «' + r + '» را ببیند');
    assert.strictEqual(expert(r, 'edu_office'), false, 'کارشناس با پرچمِ ۰ باید «' + r + '» را نبیند');
    assert.strictEqual(none(r, 'edu_office'), false, 'بی‌پرچم باید «' + r + '» را نبیند');
  }
});

check('E2', 'UI/negative control: پرچم روی نقشِ دیگر اثر ندارد (دبیر با is_head=1 روتِ اداره نمی‌گیرد)', () => {
  const teacher = loadCanRoute({ role: 'teacher', is_head: 1 });
  for (const r of ['office-msg', 'office-print', 'office-dash']) {
    assert.strictEqual(teacher(r, 'teacher'), false, 'دبیر نباید با پرچمِ جعلی روتِ اداره بگیرد: ' + r);
  }
});

check('E3', 'UI/sensitivity: مسیرِ allowlist هم کار می‌کند (officedash برای همهٔ edu_office) — یعنی منفی‌ها از نبودِ روت‌اند، نه خرابیِ harness', () => {
  const expert = loadCanRoute({ role: 'edu_office', is_head: 0 });
  assert.strictEqual(expert('officedash', 'edu_office'), true, 'EXTRA_ROUTES.edu_office باید officedash را بدهد');
  assert.strictEqual(expert('adminsubs', 'edu_office'), false, 'روتِ سوپرادمین باید برای اداره رد شود');
});

/* -------------------------------------------------------------------- */
/* F) یافته‌ها (ثبت، بدون جعلِ سبز/قرمز) — برای مالکِ تصمیم             */
/* -------------------------------------------------------------------- */
(function reportFindings() {
  const model = readJson(MODEL_PATH);
  const cols = Object.keys(model.collections || {});
  const dead = HEAD_ACTIONS.filter((h) => cols.indexOf(h) === -1);
  if (dead.length) {
    finding('F1', 'در `server/policy.js:318` فهرستِ `headOnlyActions` با نامِ **اکشن/روت** با متغیر `coll` ' +
      '(نامِ **کالکشن**) مقایسه می‌شود؛ تقاطعش با ' + cols.length + ' کالکشنِ مدل تهی است ⇒ ' +
      'بندهایِ ' + dead.map((d) => `'${d}'`).join('/') + ' هرگز آتش نمی‌گیرند. ' +
      'بندهایِ زنده فقط `notifications && type==\'office\'` است (توسط D1–D4 اثبات شد). ' +
      'رفعِ معنایی = تغییرِ سیاستِ نوشتنِ اکشن (تصمیمِ مالک؛ اینجا فقط ثبت شد).');
  }
  const router = fs.readFileSync(P('src/js/05-router.js'), 'utf8');
  const authzSrc = fs.readFileSync(P('src/js/30-authz.js'), 'utf8');
  const dashDead = /office-dash/.test(router) === false && /'office-dash'/.test(authzSrc);
  if (dashDead) {
    finding('F2', 'در `src/js/30-authz.js:77` شاخهٔ رئیس نامِ `office-dash` را می‌سنجد؛ این نام در ' +
      '`src/js/05-router.js` (NAV) وجود ندارد و روتِ واقعی `officedash` است که از قبل در ' +
      'EXTRA_ROUTES/NAV همهٔ `edu_office`ها هست ⇒ آن شرطِ ویژه عملاً بی‌اثر است (مرده). ' +
      '«تصحیحِ» آن به `officedash` رفتارِ محصول را عوض می‌کند (روتِ عمومی → رئیس‌محور) و تصمیمِ محصول است، نه اصلاحِ تست.');
  }
  const actions = fs.readFileSync(P('src/js/30-authz.js'), 'utf8');
  const msgAll = /'office-msg':\s*\[\s*'edu_office'/.test(actions);
  if (msgAll) {
    finding('F3', 'در `ACTION_ROLES` اکشنِ `office-msg` به همهٔ `edu_office` داده شده (بدون `is_head`) و ' +
      'دکمهٔ آن در `src/js/24-edu-office.js:219` با شرطِ `u.role===\'edu_office\'||isSuper` چاپ می‌شود ⇒ ' +
      'پرچمِ رئیس در لایهٔ UI «دیدنِ روت» را مهار می‌کند ولی **اکشن/دکمه** را نه؛ ' +
      'مهارِ واقعیِ اکشن فقط در `server/policy.js` (مسیرِ notifications/type=office) و مدلِ `users` است.');
  }
  finding('F4', 'سوئیت عمداً به `tests/run.js` وصل **نشد**: آن گیتِ سریعِ آفلاین است (عددِ ۳۵ سوئیت در ' +
    'اسنادِ زیادی ارجاع شده) و بخشی از سنجه‌های این فایل به فروشگاهِ تولیدشده (`node server/seed.js` + `jsdom`) نیاز دارند. ' +
    'اجرای هدفمند: `node tests/office-head-contract.js`.');
})();

/* -------------------------------------------------------------------- */
/* جمع‌بندی                                                             */
/* -------------------------------------------------------------------- */
function run() {
  console.log('=== office-head-contract.js — is_head end-to-end contract (C2-03) ===');
  /* همهٔ سنجه‌ها در بدنهٔ ماژول اجرا شده‌اند؛ این تابع برای سازگاریِ exports نگه داشته شده. */
  return { pass, failures, notrun, findings };
}

console.log('\n' + '-'.repeat(60));
if (failures.length) {
  console.log('office-head-contract: ' + pass + ' سبز / ' + failures.length + ' قرمز (' + failures.join('، ') + ')' +
    (notrun.length ? ' / ' + notrun.length + ' NOT-RUN' : '') + ' ❌');
  process.exitCode = 1;
} else {
  console.log('office-head-contract: ' + pass + ' سبز / 0 قرمز' +
    (notrun.length ? ' / ' + notrun.length + ' NOT-RUN (با دلیلِ ثبت‌شده)' : '') +
    ' ✅' + (findings.length ? '  —  ' + findings.length + ' یافتهٔ ثبت‌شده (بدون ادعای رفع)' : ''));
}

module.exports = {
  run,
  fieldParity, opsParity, officesWithoutHead,
  testRuntimeArtifactParity, testNegativeFieldParityControl,
};
