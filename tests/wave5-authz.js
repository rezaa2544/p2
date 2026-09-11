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
   یکپارچگی مدلِ یکتا (بخش دوم):
     T16 پنج فهرستِ REST == policy.filterReadable برای پنج نقش
     T17..T24 خواند/نوشتِ REST هم‌جهتِ sync (BOLA، self-allowlist، نشتِ پارامتر، هندسهٔ اداره)
     T25..T31 builderهایِ PG هم‌قرارداد (مهارِ سخت،.geo، fail-closed)
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


    console.log('\n— یکپارچگی REST↔مدلِ یکتا (ویو ۵ بخش دوم) —');
    {
      const policy = require(path.join(ROOT, 'server', 'policy.js'));
      const sameSet = (a, b) => a.size === b.size && Array.from(a).every((x) => b.has(x));
      /* صفحهٔ اول + total — کلیدِ مقایسه: total پس از فیلترِ دامنه در REST،
         و عضویتِ کاملِ صفحهٔ اول در مدل. مسیر حافظه روی مرتب‌سازیِ date-DESC
         keyset را با cursor روی id می‌زند (میراثِ Wave-3)؛ برایِ فهرست‌هایِ
         بزرگ «برش‌هایِ cursor» دقیقاً چند‌صفحه‌ای نیستند — ولی دامنه
         (total/عضویت) باید دقیقاً بخواند. فهرست‌هایِ زیرِ سقف صفحه: برابریِ کامل. */
      async function fetchPage1(ck, base) {
        const r = await httpReq('GET', base + '?limit=200', null, ck);
        if (r.status !== 200 || !r.json || !r.json.ok) return null;
        return {
          ids: new Set((r.json.data || []).map((x) => Number(x.id))),
          total: r.json.pagination && typeof r.json.pagination.total === 'number' ? r.json.pagination.total : null
        };
      }
      const srcOf = {
        users: () => (seed.users || []),
        students: () => (seed.users || []).filter((u) => u.role === 'student'),
        classes: () => (seed.classes || []),
        grades: () => (seed.grades || []),
        attendance: () => (seed.attendance || [])
      };
      const urlOf = {
        users: '/api/v1/users', students: '/api/v1/students', classes: '/api/v1/classes',
        grades: '/api/v1/grades', attendance: '/api/v1/attendance'
      };
      const sessions = [['manager', M1, c.m1], ['teacher', T1, c.t1], ['student', ST, c.st],
        ['parent', P, c.p], ['edu_office', EO, c.eo]];
      let mismatch = [];
      for (const [role, usr, ck] of sessions) {
        for (const coll of Object.keys(urlOf)) {
          const modelIds = new Set(policy.filterReadable(seed, usr, coll, srcOf[coll]()).map((x) => Number(x.id)));
          const page = await fetchPage1(ck, urlOf[coll]);
          if (!page) { mismatch.push(role + '/' + coll + ' (ERR)'); continue; }
          const outside = Array.from(page.ids).some((id) => !modelIds.has(id));
          const totalBad = page.total != null && page.total !== modelIds.size;
          const smallEq = modelIds.size <= 200 && !sameSet(page.ids, modelIds);
          if (outside || totalBad || smallEq) {
            mismatch.push(role + '/' + coll + ' (rest=' + page.ids.size + '/total=' + page.total + ' model=' + modelIds.size + (outside ? ' LEAK' : '') + ')');
          }
        }
      }
      chk('T16 پنج فهرستِ REST برای پنج نقش: دامنه==مدل (total+عضویت، برابریِ کامل زیرِ سقف صفحه)', mismatch.length === 0, mismatch.join(' | '));

      chk('T17 مدیر: PATCH نمرهٔ مدرسهٔ دیگر ⇒ ۴۰۴ (ضد شمارش، هم‌جهتِ sync)', (await (async () => {
        const g = (seed.grades || []).find((x) => x.school_id === outSchool.id);
        if (!g) return true;
        const r = await httpReq('PATCH', '/api/v1/grades/' + g.id, { score: 20 }, c.m1);
        return r.status === 404;
      })()));
      {
        const rec = (seed.attendance || []).find((a) => a.school_id === M1.school_id
          && !(seed.enrollments || []).some((e) => e.student_id === a.student_id && t1Classes.has(e.class_id)));
        const rDeny = rec ? (await httpReq('PATCH', '/api/v1/attendance/' + rec.id, { status: 'present' }, c.t1)) : null;
        const rSync = rec ? await syncOps(c.t1, [{ t: 'upd', c: 'attendance', id: rec.id, by: T1.id, data: { status: 'present' } }]) : null;
        chk('T18 دبیر: PATCH حضورِ شاگردِ بیرون‌کلاس — REST رد و sync رد (یکپارچه)',
          !rec || (rDeny.status === 403 && rDeny.json && rDeny.json.code === 'out_of_scope' && rejected(rSync, DENY)), rec ? rDeny.status + '/' + (rDeny.json?.code || 'no-code') + '/' + code0(rSync) : 'no-fixture');
      }
      {
        const anyRec = (seed.attendance || []).find((a) => a.student_id === ST.id);
        const rRole = await httpReq('PATCH', '/api/v1/attendance/' + (anyRec ? anyRec.id : 1), { status: 'present' }, c.st);
        chk('T19 دانش‌آموز: PATCH حضور ⇒ ۴۰۳ِ نقش (مدل: نوشتن ندارد)', rRole.status === 403 && rRole.json && rRole.json.code !== undefined,
          rRole.status + ' ' + JSON.stringify(rRole.json || {}).slice(0, 80));
      }
      {
        const t1Class = (seed.classes || []).find((x) => t1Classes.has(Number(x.id)) && Number(x.school_id) === M1.school_id);
        const pos = await httpReq('POST', '/api/v1/attendance', {
          student_id: ST.id, class_id: t1Class ? t1Class.id : 1, date: '2099-01-01', status: 'present', note: 'w5-pos'
        }, c.t1);
        const neg = await httpReq('POST', '/api/v1/attendance', {
          student_id: outsiderKid.id, class_id: t1Class ? t1Class.id : 1, date: '2099-01-01', status: 'present', note: 'w5-neg'
        }, c.t1);
        chk('T20 دبیر: ساختِ حضور برایِ شاگردِ خودش ۲۰۱، بیرون‌کلاس ۴۰۳ِ محدوده',
          pos.status === 201 && neg.status === 403 && neg.json && neg.json.code === 'out_of_scope',
          pos.status + '/' + neg.status + ' ' + JSON.stringify(neg.json || {}).slice(0, 80));
      }
      {
        const rOk = await httpReq('PATCH', '/api/v1/users/' + ST.id, { full_name: 'تستِ ویو۵' }, c.st);
        const rField = await httpReq('PATCH', '/api/v1/users/' + ST.id, { phone: '09120000000' }, c.st);
        const rRole = await httpReq('PATCH', '/api/v1/users/' + ST.id, { role: 'manager' }, c.st);
        chk('T21 خود‌ویرایشیِ دانش‌آموز: همهٔ فیلدها ۴۰۳ forbidden (users.upd فقط-مدیر، یکپارچه با sync)',
          rOk.status === 403 && rField.status === 403 && rRole.status === 403,
          rOk.status + '/' + rField.status + '/' + rRole.status);
      }
      {
        const foreignUser = (seed.users || []).find((u) => u.school_id === outSchool.id && u.role === 'teacher');
        const r = await httpReq('PATCH', '/api/v1/users/' + foreignUser.id, { full_name: 'جعل' }, c.m1);
        chk('T22 مدیر: PATCH کاربرِ مدرسهٔ دیگر ⇒ ۴۰۴', r.status === 404, r.status);
      }
      {
        const r1 = await httpReq('GET', '/api/v1/students?limit=200&class_id=' + ((seed.classes || []).find((x) => Number(x.school_id) === outSchool.id) || { id: 999999 }).id, null, c.m1);
        const leak1 = (r1.json && r1.json.data || []).some((x) => Number(x.school_id) !== Number(M1.school_id));
        const r2 = await httpReq('GET', '/api/v1/grades?limit=200&student_id=' + outsiderKid.id, null, c.st);
        const leak2 = (r2.json && r2.json.data || []).length > 0;
        chk('T23 نشتِ پارامتری: class_id/‌student_id جعلی فهرستِ بین‌مدرسه‌ای نمی‌سازد', !leak1 && !leak2, r1.status + '/' + r2.status);
      }
      {
        const geoSchoolIds = new Set((seed.schools || []).filter((sc) =>
          (!OFFICE.province_id || sc.province_id === OFFICE.province_id) &&
          (!OFFICE.county_id || sc.county_id === OFFICE.county_id) &&
          (!OFFICE.district_id || sc.district_id === OFFICE.district_id)).map((sc) => Number(sc.id)));
        const rU = await httpReq('GET', '/api/v1/users?limit=200', null, c.eo);
        const badU = (rU.json && rU.json.data || []).some((x) => !geoSchoolIds.has(Number(x.school_id)));
        const rS = await httpReq('GET', '/api/v1/students?limit=200', null, c.eo);
        const emptyS = rS.status === 200 && (rS.json && rS.json.data || []).length === 0;
        const rC = await httpReq('GET', '/api/v1/classes?limit=200', null, c.eo);
        const badC = (rC.json && rC.json.data || []).some((x) => !geoSchoolIds.has(Number(x.school_id)));
        chk('T24 اداره (حافظه): دایرکتوری فقط هندسهٔ دفتر، فهرستِ دانش‌آموز خالی (قراردادِ رکورد)، کلاس‌ها هندسه‌ای',
          !badU && emptyS && !badC, rU.status + '/' + rS.status + '/' + rC.status);
      }
    }

    console.log('\n— builderهایِ PG هم‌قرارداد با مدل (آفلاین) —');
    {
      const { buildStudentsList, buildUsersList, buildAttendanceList, buildGradesList, buildClassesList } = require(path.join(ROOT, 'server', 'dbquery.js'));
      const eoSession = { id: EO.id, role: 'edu_office', school_id: null, office_id: EO.office_id };
      const mgrSession = { id: M1.id, role: 'manager', school_id: M1.school_id };
      const tchSession = { id: T1.id, role: 'teacher', school_id: T1.school_id };
      const supSession = { id: SA.id, role: 'superadmin', school_id: null };
      const stSql = buildStudentsList({ user: mgrSession }).page.sql || buildStudentsList({ user: mgrSession }).sql;
      const usersEo = buildUsersList({ user: eoSession, office: seed.offices.find((o) => o.id === EO.office_id) });
      const usersEoNoOffice = buildUsersList({ user: { id: 1, role: 'edu_office', school_id: null, office_id: 99999 } });
      const studentsEo = buildStudentsList({ user: eoSession, office: seed.offices.find((o) => o.id === EO.office_id) });
      const attTch = buildAttendanceList({ user: tchSession });
      const grdSup = buildGradesList({ user: supSession });
      const clsMgr = buildClassesList({ user: mgrSession });
      const sqlOf = (b) => b.page.sql + ' ' + b.count.sql;
      chk('T25 PG: مدیر — مهارِ سختِ مدرسه (school_id = $، بدونِ IS-NULL)', /school_id = \$\d+/.test(stSql) && !/school_id IS NULL/.test(stSql));
      chk('T26 PG: اداره — هندسهٔ schools در دایرکتوری', /IN \(SELECT sc\.id FROM "schools" sc/.test(sqlOf(usersEo)), sqlOf(usersEo).slice(0, 160));
      chk('T27 PG: ادارهٔ بی‌دفترِ قابل‌حل ⇒ fail-closed `1 = 0`', /1 = 0/.test(sqlOf(usersEoNoOffice)));
      chk('T28 PG: دانش‌آموز برای اداره بسته است (fail-closed، آینهٔ studentRecordOk)', /1 = 0/.test(sqlOf(studentsEo)));
      chk('T29 PG: دبیرِ attendance فقط کلاس‌هایِ تدرسی/سرپرستی', /class_id IN \(SELECT s\.class_id FROM "schedule"/.test(sqlOf(attTch)) && /homeroom_teacher_id/.test(sqlOf(attTch)));
      chk('T30 PG: سوپرامین بی‌مهارِ مدرسه', !/school_id = \$/.test(sqlOf(grdSup)));
      chk('T31 PG: کلاس‌ها برای مدیر مهارِ سختِ مدرسه', /school_id = \$\d+/.test(sqlOf(clsMgr)) && !/school_id IS NULL/.test(sqlOf(clsMgr)));
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
