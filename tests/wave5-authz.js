#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   wave5-authz.js — ویو ۵: ایزولاسیون مستأجر + آزمون IDOR/BOLA
   ───────────────────────────────────────────────────────────────────
   سرور واقعی روی پورت ۹۰۳۴ با کپی موقتِ فروشگاه:

   ایزولاسیون مستأجر برای اداره (edu_office):
     T1  اطلاعیه برای مدرسهٔ داخل محدوده ⇒ پذیرش
     T2  اطلاعیه برای مدرسهٔ بیرون محدوده ⇒ رد (بین‌مستأجری)
     T3  اطلاعیهٔ سراسری (بدون مدرسه) ⇒ رد (fail-closed)
     T4  پیوند دبیر–مدرسه: بیرون محدوده رد، داخل محدوده پذیرش
     T5  ساخت دفتر (ساختاری) ⇒ ردِ نقش
     T6  حالت حضور مدرسهٔ بیرون محدوده ⇒ رد
     T7  اعلان به کاربر مدرسهٔ بیرون محدوده ⇒ رد؛ داخل ⇒ پذیرش
   نوشتن بین‌مدرسه‌ای (BOLA):
     T8  مدیر: نمره برای دانش‌آموز مدرسهٔ دیگر ⇒ رد
     T9  دبیر: نمره برای دانش‌آموزی که در کلاسش نیست ⇒ رد
     T10 ولی: نمره برای فرزند دیگری ⇒ رد
     T11 دانش‌آموز: ویرایش نمرهٔ دانش‌آموز دیگر ⇒ رد
   خوانش IDOR ‏(/api/students/:id — بیرون محدوده همیشه ۴۰۴):
     T12 دانش‌آموز: خودش ۲۰۰، دیگری ۴۰۴
     T13 دبیر: شاگرد کلاسش ۲۰۰، شاگرد مدرسه اما نه کلاسش ۴۰۴
     T14 مدیر: دانش‌آموز مدرسهٔ دیگر ۴۰۴ (ضد شمارش)
   پوشش مدل:
     T15 هر مجموعه‌ای که مدل به اداره نوشتن داده، دروازهٔ دامنه دارد
   اجرا:  node tests/wave5-authz.js
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..');
const REAL_STORE = path.join(ROOT, 'server', 'data', 'payesh.json');
const MODEL = JSON.parse(fs.readFileSync(path.join(ROOT, 'authz', 'model.json'), 'utf8'));
const PORT = 9034;

let pass = 0, fail = 0;
const errors = [];
function chk(name, cond, extra) {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; errors.push(name + (extra ? ' — ' + String(extra).slice(0, 220) : '')); console.log('  ❌ ' + name + (extra ? '  —  ' + String(extra).slice(0, 220) : '')); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function httpReq(method, p, body, cookie) {
  return new Promise((resolve) => {
    const data = body ? JSON.stringify(body) : null;
    const req = http.request({
      hostname: '127.0.0.1', port: PORT, path: p, method,
      headers: Object.assign(
        data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {},
        cookie ? { Cookie: cookie } : {}
      )
    }, (res) => {
      let b = '';
      res.on('data', (d) => (b += d));
      res.on('end', () => {
        let j = null; try { j = JSON.parse(b); } catch (e) {}
        resolve({ status: res.statusCode, headers: res.headers, body: b, json: j });
      });
    });
    req.on('error', (e) => resolve({ status: 0, headers: {}, body: 'SOCKERR ' + e.code, json: null }));
    if (data) req.write(data);
    req.end();
  });
}

main().catch((e) => { console.error(e); process.exit(1); });

async function main() {
  if (!fs.existsSync(REAL_STORE)) { console.log('⏭️  فروشگاه نیست — node server/seed.js'); process.exit(0); }
  console.log('\n▸ ویو ۵ — ایزولاسیون مستأجر و IDOR');
  const seed = JSON.parse(fs.readFileSync(REAL_STORE, 'utf8'));

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'payesh-w5-'));
  const storeFile = path.join(tmp, 'payesh.json');
  fs.copyFileSync(REAL_STORE, storeFile);
  const env = Object.assign({}, process.env, {
    PORT: String(PORT), HOST: '127.0.0.1',
    PAYESH_STORE: storeFile, PAYESH_AUDIT: path.join(tmp, 'audit.log'),
    PAYESH_KEY: path.join(tmp, 'jwt.key'), PAYESH_DEMO_CODE: '1'
  });
  const server = spawn(process.execPath, ['server/index.js'], { cwd: ROOT, env, stdio: 'pipe' });
  const srvLog = path.join(tmp, 'server.log');
  const logStream = fs.createWriteStream(srvLog, { flags: 'a' });
  server.stdout.pipe(logStream); server.stderr.pipe(logStream);
  try {
    let booted = false;
    for (let i = 0; i < 50; i++) {
      const h = await httpReq('GET', '/api/health');
      if (h.status === 200 && h.json && h.json.ok && h.json.pid === server.pid) { booted = true; break; }
      if (server.exitCode !== null) break;
      await sleep(300);
    }
    chk('W0 سرور بالا آمد (' + PORT + ')', booted);
    if (!booted) return;

    /* ── فیکسچرها از دلِ فروشگاه ── */
    const U = (id) => seed.users.find(u => u.id === id);
    const SA = U(1), M1 = U(2), T1 = U(4), ST = U(16), P = U(17), EO = U(1026);
    const OFFICE = seed.offices.find(o => o.id === EO.office_id);
    const inSchool = seed.schools.find(s =>
      (!OFFICE.province_id || s.province_id === OFFICE.province_id) &&
      (!OFFICE.county_id || s.county_id === OFFICE.county_id) &&
      (!OFFICE.district_id || s.district_id === OFFICE.district_id));
    const outSchool = seed.schools.find(s =>
      (OFFICE.province_id && s.province_id !== OFFICE.province_id) ||
      (OFFICE.county_id && s.county_id !== OFFICE.county_id));
    /* دانش‌آموزِ مدرسهٔ ۱ که در کلاسِ ت۱ نیست */
    const t1Classes = new Set((seed.schedule || []).filter(x => x.teacher_id === T1.id).map(x => x.class_id));
    (seed.classes || []).forEach(c => { if (c.homeroom_teacher_id === T1.id) t1Classes.add(c.id); });
    const outsiderKid = seed.users.find(u => u.role === 'student' && u.school_id === M1.school_id
      && u.id !== ST.id && !(seed.enrollments || []).some(e => e.student_id === u.id && t1Classes.has(e.class_id)));
    /* کاربرِ مدرسهٔ بیرون محدوده (برای اعلان) */
    const outUser = seed.users.find(u => u.school_id === outSchool.id && u.role === 'manager');
    const inUser = seed.users.find(u => u.school_id === inSchool.id && u.role === 'manager');

    async function login(u) {
      const phone = String(u.phone).replace(/[\s\-()]/g, '');
      const sc = await httpReq('POST', '/api/auth/send-code', { phone });
      const lg = await httpReq('POST', '/api/auth/login', { phone, code: sc.json && sc.json.demo_code, national_id: u.national_id });
      const sc2 = lg.headers['set-cookie'];
      return Array.isArray(sc2) ? sc2[0].split(';')[0] : (sc2 || '').split(';')[0];
    }
    const c = {};
    for (const [k, u] of [['sa', SA], ['m1', M1], ['t1', T1], ['st', ST], ['p', P], ['eo', EO]]) c[k] = await login(u);
    chk('W0b نشست‌ها برقرار شد', Object.values(c).every(Boolean), JSON.stringify(Object.keys(c).filter(k => !c[k])));

    let seq = 0, iid = 970000;
    const syncOps = (ck, ops) => httpReq('POST', '/api/sync', { ops: ops.map(o => { if (o.t === 'ins' && o.id == null) o.id = (++iid); return Object.assign({ uid: 'w5-' + (++seq) }, o); }) }, ck);
    const code0 = (r) => (r.json && r.json.results && r.json.results[0] && r.json.results[0].code) || (r.json && r.json.code) || null;
    const permitted = (r) => r.status === 200 && r.json && r.json.results && r.json.results[0] && r.json.results[0].ok === true;
    const rejected = (r, codes) => (r.status === 403 || r.status === 200) && codes.indexOf(code0(r)) > -1 && !(r.json && r.json.results && r.json.results[0] && r.json.results[0].ok === true);
    const DENY = ['out_of_scope', 'role_denied'];
    const today = new Date().toISOString().slice(0, 10);

    console.log('\n— ایزولاسیون مستأجر اداره —');
    chk('T1 اداره: اطلاعیه برای مدرسهٔ داخل محدوده پذیرفته شد', permitted(
      await syncOps(c.eo, [{ t: 'ins', c: 'announcements', by: EO.id, data: { school_id: inSchool.id, title: 'ویو۵', body: 'داخل محدوده', audience: 'all', created_at: today } }])));
    chk('T2 اداره: اطلاعیه برای مدرسهٔ بیرون محدوده رد شد', rejected(
      await syncOps(c.eo, [{ t: 'ins', c: 'announcements', by: EO.id, data: { school_id: outSchool.id, title: 'ویو۵', body: 'بیرون محدوده', audience: 'all', created_at: today } }]), DENY));
    chk('T3 اداره: اطلاعیهٔ سراسری (بدون مهار مدرسه) رد شد', rejected(
      await syncOps(c.eo, [{ t: 'ins', c: 'announcements', by: EO.id, data: { school_id: null, title: 'ویو۵', body: 'سراسری جعلی', audience: 'all', created_at: today } }]), DENY));
    {
      const rOut = await syncOps(c.eo, [{ t: 'ins', c: 'teacher_schools', by: EO.id, data: { school_id: outSchool.id, teacher_id: T1.id, active: 1, created_at: today } }]);
      const rIn = await syncOps(c.eo, [{ t: 'ins', c: 'teacher_schools', by: EO.id, data: { school_id: inSchool.id, teacher_id: T1.id, active: 1, created_at: today } }]);
      chk('T4 اداره: پیوند دبیر–مدرسه بیرون رد، داخل پذیرش', rejected(rOut, DENY) && permitted(rIn),
        code0(rOut) + ' / ' + code0(rIn));
    }
    chk('T5 اداره: ساخت دفتر رد نقش شد', rejected(
      await syncOps(c.eo, [{ t: 'ins', c: 'offices', by: EO.id, data: { name: 'دفتر جعلی', level: 'county', active: 1, created_at: today } }]), DENY));
    {
      /* لایهٔ دوم دفاع به‌صورت واحد: حتی اگر مجوزِ نقش دور زده شود،
         inScope دفاتر را برای اداره می‌بندد. */
      const { inScope, attach } = require(path.join(ROOT, 'server', 'sync.js'));
      attach(seed);
      const eoSession = { id: EO.id, role: 'edu_office', school_id: null, office_id: EO.office_id };
      chk('T5b دروازهٔ درونی: دفاتر برای اداره بسته است', inScope(eoSession, 'offices', null, { name: 'x' }) === false);
      chk('T5b2 دروازهٔ درونی: مدرسهٔ بیرون محدوده برای اداره بسته است', inScope(eoSession, 'announcements', null, { school_id: outSchool.id, title: 'x', body: 'y' }) === false);
      chk('T5b3 دروازهٔ درونی: مدرسهٔ داخل محدوده باز است', inScope(eoSession, 'announcements', null, { school_id: inSchool.id, title: 'x', body: 'y' }) === true);
    }
    chk('T6 اداره: حالت حضور مدرسهٔ بیرون محدوده رد شد', rejected(
      await syncOps(c.eo, [{ t: 'ins', c: 'attendance_modes', by: EO.id, data: { school_id: outSchool.id, date: today, mode: 'virtual', set_at: today, set_by: EO.id, created_at: today } }]), DENY));
    {
      /* عمدتاً بدون school_id: مهار باید از مدرسهٔ گیرنده حل شود */
      const rOut = await syncOps(c.eo, [{ t: 'ins', c: 'notifications', by: EO.id, data: { user_id: outUser.id, title: 'ویو۵', body: 'بیرون محدوده', type: 'announcement', created_at: today } }]);
      const rIn = await syncOps(c.eo, [{ t: 'ins', c: 'notifications', by: EO.id, data: { user_id: inUser.id, title: 'ویو۵', body: 'داخل محدوده', type: 'announcement', created_at: today } }]);
      chk('T7 اداره: اعلان بیرون محدوده رد، داخل پذیرش', rejected(rOut, DENY) && permitted(rIn),
        code0(rOut) + ' / ' + code0(rIn));
    }

    console.log('\n— نوشتن بین‌مدرسه‌ای (BOLA) —');
    chk('T8 مدیر: نمره برای مدرسهٔ دیگر رد شد', rejected(
      await syncOps(c.m1, [{ t: 'ins', c: 'grades', by: M1.id, data: { school_id: outSchool.id, student_id: ST.id, class_id: 1, subject_id: 1, term: 'ویو۵', score: 20, max_score: 20 } }]), DENY));
    chk('T9 دبیر: نمره برای شاگردِ بیرون از کلاس‌هایش رد شد', rejected(
      await syncOps(c.t1, [{ t: 'ins', c: 'grades', by: T1.id, data: { school_id: M1.school_id, student_id: outsiderKid.id, class_id: 1, subject_id: 1, term: 'ویو۵', score: 20, max_score: 20 } }]), DENY));
    chk('T10 ولی: نمره برای فرزندِ دیگری رد شد', rejected(
      await syncOps(c.p, [{ t: 'ins', c: 'grades', by: P.id, data: { school_id: M1.school_id, student_id: outsiderKid.id, class_id: 1, subject_id: 1, term: 'ویو۵', score: 20, max_score: 20 } }]), DENY));
    {
      const foreignGrade = seed.grades.find(g => Number(g.student_id) !== ST.id);
      chk('T11 دانش‌آموز: ویرایش نمرهٔ دیگری رد شد', foreignGrade ? rejected(
        await syncOps(c.st, [{ t: 'upd', c: 'grades', id: foreignGrade.id, by: ST.id, data: { score: 20 } }]), DENY) : true);
    }

    console.log('\n— خوانش IDOR ‏(/api/students/:id) —');
    const getStudent = (ck, id) => httpReq('GET', '/api/students/' + id, null, ck);
    {
      const rSelf = await getStudent(c.st, ST.id);
      const rOther = await getStudent(c.st, outsiderKid.id);
      chk('T12 دانش‌آموز: خودش ۲۰۰، دیگری ۴۰۴', rSelf.status === 200 && rOther.status === 404, rSelf.status + '/' + rOther.status);
    }
    {
      const rMine = await getStudent(c.t1, ST.id);
      const rNotMine = await getStudent(c.t1, outsiderKid.id);
      chk('T13 دبیر: شاگرد کلاسش ۲۰۰، شاگردِ بیرون از کلاسش ۴۰۴', rMine.status === 200 && rNotMine.status === 404, rMine.status + '/' + rNotMine.status);
    }
    {
      const rOut = await getStudent(c.m1, (seed.users.find(u => u.role === 'student' && u.school_id === outSchool.id) || {}).id);
      chk('T14 مدیر: دانش‌آموز مدرسهٔ دیگر ۴۰۴ (ضد شمارش)', rOut.status === 404, rOut.status);
    }

    console.log('\n— پوشش مدل —');
    {
      /* ویو ۵ بخش دوم — منبع یکتای سیاست policy.js است؛ sync.js فقط مصرف‌کننده.
         این آزمون هم پوشش فهرست را می‌سنجد و هم «یکپارچگی لایه‌ها» را:
         اگر روزی sync سیاست موازیِ تازه‌ای بسازد یا از policy جدا شود، قرمز می‌شود. */
      const policySrc = fs.readFileSync(path.join(ROOT, 'server', 'policy.js'), 'utf8');
      const syncSrc = fs.readFileSync(path.join(ROOT, 'server', 'sync.js'), 'utf8');
      const gated = (policySrc.match(/EO_SCOPE_GATED = \[([^\]]+)\]/) || [])[1] || '';
      const eoWrite = Object.keys(MODEL.collections).filter(n => {
        const d = MODEL.collections[n];
        return ['ins', 'upd', 'del'].some(op => (d[op] || []).indexOf('edu_office') > -1);
      });
      const uncovered = eoWrite.filter(n => gated.indexOf("'" + n + "'") === -1 && n !== 'offices');
      chk('T15 هر نوشتنِ اداره در مدل، دروازهٔ دامنه دارد', uncovered.length === 0, 'بدون دروازه: ' + uncovered.join(','));
      chk('T15b یکپارچگی: محدودهٔ نوشتنِ sync از policy.js عبور می‌کند',
        /function inScope\(session, coll, recId, data\)\{\s*return policy\.inScope\(/.test(syncSrc)
        && syncSrc.includes("require('./policy')"));
    }

    await sleep(100);
  } finally {
    try { server.kill('SIGKILL'); } catch (e) {}
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {}
  }

  const total = pass + fail;
  console.log('────────────────────────────────────────────────────');
  console.log(`ویو ۵ — مجوزها: ${pass}/${total} موفق` + (fail ? `  —  ${fail} ناموفق` : '  —  بدون خطا ✅'));
  if (errors.length) console.log('ناموفق‌ها: ' + errors.join(' | '));
  process.exit(fail ? 1 : 0);
}
