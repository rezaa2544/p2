#!/usr/bin/env node

/**
 * server5 — معنایِ پُلِ دوره‌ای (بند ۱۳.۴) + تیکِ کلاینت (دورِ مرحلهٔ ۲)
 *
 * بخش A — سرورِ واقعی (spawn, HTTP ساده, guard بر pid):
 *   B1  بدون نشست        → 401 no_session
 *   B2  parent: family دقیقاً parent_links خودش + att از storeٔ سرور
 *   B3  student: فقط خودش، با att خودش
 *   B4  teacher: family خالی + teacher.schoolId
 *   B5  ts در بازهٔ ۵ دقیقهٔ ساعتِ سیستم
 *   B7  رویداد bell_now در لاگِ audit ثبت می‌شود
 *
 * بخش B — کلاینتِ واقعی در jsdom (index.html):
 *   C1  تیکِ سروری: رندر با دادهٔ سرور + SERVER_TIME_KEY + bellLiveCache
 *   C1b att سرور بر att محلی اولویت دارد (present روی absent → سبز)
 *   C2  بدنِ نامعتبر → پس‌رویِ محلی (کارتِ قرمز)، cache دست‌نخورده
 *   C3  درِ حالِ پُل: دو تیکِ پشت‌سرهم = فقط یک fetch
 *   C4  حالتِ محلی: fetch اصلاً صدا زده نمی‌شود
 *
 * اجرا: node tests/server5.js  (نیازمند jsdom)
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, execFileSync } = require('child_process');
const http = require('http');

const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const errors = [];
function chk(name, cond, extra) {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; errors.push(name + (extra !== undefined ? ' — ' + String(extra).slice(0, 160) : '')); console.log('  ❌ ' + name + (extra !== undefined ? ' — ' + String(extra).slice(0, 160) : '')); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function httpReq(port, method, p, body, jar) {
  return new Promise((resolve) => {
    const data = body ? JSON.stringify(body) : null;
    const headers = { 'Content-Type': 'application/json' };
    if (jar) headers['Cookie'] = jar.headers().join('; ');
    const req = http.request({ hostname: '127.0.0.1', port, path: p, method, headers }, (res) => {
      let b = '';
      res.on('data', (d) => (b += d));
      res.on('end', () => {
        if (jar) jar.absorb(res.headers);
        let j = null; try { j = JSON.parse(b); } catch (e) {}
        resolve({ status: res.statusCode, headers: res.headers, json: j, raw: b });
      });
    });
    req.on('error', () => resolve({ status: 0, headers: {}, json: null, raw: '' }));
    if (data) req.write(data);
    req.end();
  });
}
function makeJar() {
  const jar = {};
  return {
    headers() { return Object.keys(jar).map((k) => k + '=' + jar[k]); },
    absorb(h) {
      const sc = h['set-cookie'];
      if (!sc) return;
      sc.forEach((c) => {
        const [pair] = c.split(';');
        const i = pair.indexOf('=');
        if (i > 0) jar[pair.slice(0, i).trim()] = pair.slice(i + 1).trim();
      });
    }
  };
}
const p2 = (n) => String(n).padStart(2, '0');
const todayISO = () => { const d = new Date(); return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()); };

/* ---------- بخش A: سرورِ واقعی ---------- */
async function partA() {
  console.log('\n▸ بخش A: endpointِ زنگ — دامنه‌های واقعی (سرورِ spawn)');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'payesh-s5-'));
  const storeFile = path.join(tmp, 'payesh.json');
  fs.copyFileSync(path.join(ROOT, 'server/data/payesh.json'), storeFile);
  const keyFile = path.join(tmp, 'jwt.key');
  const auditFile = path.join(tmp, 'audit.log');

  // seedِ قطعی: حضورِ امروزِ دانش‌آموز ۱۶ = present (روی هر رکوردِ قبلیِ امروز)
  const st = JSON.parse(fs.readFileSync(storeFile, 'utf8'));
  const T = todayISO();
  st.attendance = (st.attendance || []).filter((a) => !(a.student_id === 16 && a.date === T));
  st.attendance.push({ school_id: 1, class_id: 1, student_id: 16, date: T, status: 'present', note: null, id: 990001 });
  fs.writeFileSync(storeFile, JSON.stringify(st));
  const parent = st.users.find((u) => u.role === 'parent' && u.id === 17) || st.users.find((u) => u.role === 'parent');
  const student = st.users.find((u) => u.role === 'student' && u.id === 16) || st.users.find((u) => u.role === 'student');
  const teacher = st.users.find((u) => u.role === 'teacher');
  const parentLinks = (st.parent_links || []).filter((l) => l.parent_id === parent.id).map((l) => l.student_id).sort((a, b) => a - b);

  // boot با guard بر pid (جلوگیری از portِ دست‌سپارِ دورهایِ قبلی)
  let port = null, srv = null;
  for (const p of [8961, 8962, 8963]) {
    const s = spawn(process.execPath, ['server/index.js'], {
      cwd: ROOT,
      env: Object.assign({}, process.env, {
        PORT: String(p), HOST: '127.0.0.1',
        PAYESH_STORE: storeFile, PAYESH_AUDIT: auditFile, PAYESH_KEY: keyFile, PAYESH_DEMO_CODE: '1'
      }),
      stdio: 'pipe'
    });
    let booted = false;
    for (let i = 0; i < 50; i++) {
      const h = await httpReq(p, 'GET', '/api/health').then((r) => r.json).catch(() => null);
      if (h && h.ok && h.pid === s.pid) { booted = true; break; }
      if (h && h.ok) break; // portِ دست‌سپار — این port را رها کن
      await sleep(300);
    }
    if (booted) { port = p; srv = s; break; }
    s.kill('SIGKILL');
  }
  chk('A0 سرور بالا آمد (با pidِ خودِ این spawn)', port !== null);
  if (port === null) { console.log('  ⚠ بدون سرور، ادامه ممکن نیست'); return false; }

  // B1: بدون نشست
  const noAuth = await httpReq(port, 'GET', '/api/bell/now', null, null);
  chk('B1 بدون نشست → 401 no_session', noAuth.status === 401 && noAuth.json && noAuth.json.code === 'no_session', noAuth.raw);

  async function loginAs(u) {
    const jar = makeJar();
    const send = await httpReq(port, 'POST', '/api/auth/send-code', { phone: u.phone }, jar);
    const code = send.json && send.json.demo_code;
    const login = await httpReq(port, 'POST', '/api/auth/login', { phone: u.phone, code: String(code || ''), national_id: u.national_id }, jar);
    return { jar, login };
  }

  // B2: parent
  const { jar: parJar } = await loginAs(parent);
  const par = await httpReq(port, 'GET', '/api/bell/now', null, parJar);
  const parIds = (par.json && par.json.family || []).map((r) => r.studentId).sort((a, b) => a - b);
  chk('B2 parent: family دقیقاً parent_links خودش', par.status === 200 && par.json && par.json.ok === true &&
    JSON.stringify(parIds) === JSON.stringify(parentLinks), par.raw.slice(0, 140));
  const kidRow = par.json && (par.json.family || []).find((r) => r.studentId === 16);
  chk('B2b att از storeٔ سرور می‌آید (presentِ seedشده)', !!kidRow && kidRow.att === 'present', par.raw.slice(0, 140));

  // B3: student
  const { jar: stuJar } = await loginAs(student);
  const stu = await httpReq(port, 'GET', '/api/bell/now', null, stuJar);
  chk('B3 student: فقط خودش، با att خودش', stu.status === 200 && stu.json &&
    (stu.json.family || []).length === 1 && stu.json.family[0].studentId === student.id && stu.json.family[0].att === 'present', stu.raw.slice(0, 140));

  // B4: teacher
  const { jar: teaJar } = await loginAs(teacher);
  const tea = await httpReq(port, 'GET', '/api/bell/now', null, teaJar);
  chk('B4 teacher: family خالی + teacher.schoolId', tea.status === 200 && tea.json &&
    (tea.json.family || []).length === 0 && tea.json.teacher && tea.json.teacher.schoolId === teacher.school_id, tea.raw.slice(0, 140));

  // B5: ts
  chk('B5 ts در بازهٔ ۵ دقیقهٔ ساعتِ سیستم', par.json && typeof par.json.ts === 'number' && Math.abs(Date.now() - par.json.ts) < 300000, par.raw.slice(0, 140));

  // B7: audit
  await sleep(200);
  const auditTxt = fs.existsSync(auditFile) ? fs.readFileSync(auditFile, 'utf8') : '';
  chk('B7 bell_now در لاگِ audit ثبت شد', /bell_now/.test(auditTxt), auditTxt.slice(-160));

  srv.kill('SIGKILL');
  await sleep(200);
  return true;
}

/* ---------- بخش B: کلاینت در jsdom ---------- */
async function partB() {
  let JSDOM;
  try { ({ JSDOM } = require('jsdom')); }
  catch { console.log('  ⏭️ jsdom نصب نیست — بخش B رد شد.  (npm i --no-save jsdom)'); return; }

  console.log('\n▸ بخش B: تیکِ کلاینت (jsdom + index.htmlِ واقعی)');
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    url: 'http://localhost/',
    virtualConsole: new (require('jsdom').VirtualConsole)()
  });
  const win = dom.window;
  const W = (expr) => win.eval(expr);
  await sleep(500);

  // کاربرِ ولی (با حداقل یک فرزند) را از dbٔ کلاینت بیابیم
  const parId = W(`(function(){
    var l = db.parent_links || [];
    var ids = {};
    l.forEach(function(x){ ids[x.parent_id] = 1; });
    var p = (db.users || []).find(function(u){ return u.role === 'parent' && ids[u.id]; });
    return p ? p.id : null;
  })()`);
  if (!parId) { chk('B-پیش‌نیاز: ولیِ دارای فرزند در dbٔ کلاینت', false); return; }
  const kidIds = W(`(function(){ return (db.parent_links||[]).filter(function(l){return l.parent_id===${parId};}).map(function(l){return l.student_id;}); })()`);
  const kid0 = kidIds[0];

  // حضورِ محلیِ فرزندِ اولِ امروز = absent (برای اینکه overlayِ att قابل‌مشاهده باشد)
  W(`(function(){
    var T = todayISO();
    db.attendance = (db.attendance||[]).filter(function(r){ return !(r.student_id === ${kid0} && r.date === T); });
    db.attendance.push({ student_id: ${kid0}, date: T, status: 'absent', id: 990002 });
  })()`);
  W(`S.user=byId('users',${parId});S.persona=null;S.boss=null;`);
  W(`(function(){
    var d=document.createElement('div'); d.id='bell5root';
    d.setAttribute('data-bell-live','family'); document.body.appendChild(d);
  })()`);

  const rootHtml = () => W(`(function(){ var r=document.getElementById('bell5root'); return r ? r.innerHTML : ''; })()`);

  // fetch stub
  let fetchCalls = 0;
  let fetchImpl = async () => ({ ok: true, status: 200, json: async () => ({ ok: true }) });
  win.fetch = (url) => { fetchCalls++; return fetchImpl(url); };

  const T = todayISO();
  const ts = Date.now();
  const serverPayload = {
    ok: true, ts, date: T,
    family: [{ studentId: kid0, att: 'present' }],
    teacher: null
  };

  // C4: حالتِ محلی — fetch نباید صدا زده شود
  fetchImpl = async () => ({ ok: true, status: 200, json: async () => serverPayload });
  W(`DATA_MODE='local'`);
  W(`bellLiveTick()`);
  await sleep(60);
  chk('C4 حالتِ محلی: fetch اصلاً صدا زده نشد', fetchCalls === 0, 'fetchCalls=' + fetchCalls);

  // C1: تیکِ سروری با پاسخِ معتبر
  W(`DATA_MODE='server'`);
  W(`bellLiveTick()`);
  await sleep(80);
  const cached = W(`(typeof bellLiveCache!=='undefined') ? bellLiveCache : null`);
  const stKey = W(`(typeof Store!=='undefined') ? Store.get('sms_server_time_v1') : null`);
  chk('C1 تیکِ سروری: fetch شد + cache ذخیره شد', fetchCalls === 1 && cached && cached.ts === ts, 'fetchCalls=' + fetchCalls + ' cache=' + JSON.stringify(cached));
  chk('C1b SERVER_TIME_KEY با iso(ts) پر شد', stKey === new Date(ts).toISOString(), stKey);

  // C1c: overlay — att سرور (present) بر att محلی (absent) اولویت دارد
  chk('C1c att سرور بر محلی اولویت دارد (کارتِ سبز)', rootHtml().indexOf('b-green') !== -1, rootHtml().slice(0, 200));

  // C2: بدنِ نامعتبر → پس‌رویِ محلی (ریشه را خالی می‌کنیم تا «رندرِ محلی»
  //     را از «تغییر نکردنِ DOM» جدا کنیم — مبنایِ جهشِ M11)
  W(`document.getElementById('bell5root').innerHTML = ''`);
  const cacheBefore = JSON.stringify(cached);
  // بدنِ «دست‌کم‌به‌هم ولی بدونِ ok» — دنیایِ بدونِ گارد این را ذخیره و اعمال
  // می‌کند؛ دنیایِ درست پس‌رویِ محلی می‌رود و cache دست‌نخورده می‌ماند.
  fetchImpl = async () => ({ ok: true, status: 200, json: async () => ({ ts: ts, date: T, family: [{ studentId: kid0, att: 'present' }], teacher: null }) });
  W(`bellLiveTick()`);
  await sleep(80);
  const cachedAfter = W(`(typeof bellLiveCache!=='undefined') ? bellLiveCache : null`);
  chk('C2 بدنِ نامعتبر: پس‌رویِ محلی (کارتِ قرمز) + cache دست‌نخورده',
    rootHtml().indexOf('b-red') !== -1 && JSON.stringify(cachedAfter) === cacheBefore,
    rootHtml().slice(0, 200));

  // C3: درِ حالِ پُل — دو تیک = یک fetch
  let releaseFn = null;
  fetchImpl = (url) => new Promise((resolve) => { releaseFn = () => resolve({ ok: true, status: 200, json: async () => serverPayload }); });
  const before = fetchCalls;
  W(`bellLiveTick()`);
  W(`bellLiveTick()`);
  await sleep(60);
  chk('C3 درِ حالِ پُل: دو تیکِ پشت‌سرهم = فقط یک fetch', fetchCalls === before + 1, 'fetchCalls=' + fetchCalls);
  if (releaseFn) releaseFn();
  await sleep(60);

  win.close();
}

(async () => {
  const okA = await partA();
  if (okA) await partB();
  console.log('\n────────────────────────────────────────────────────────');
  console.log('server5 (پُلِ دوره‌ای ۱۳.۴): ' + (pass + fail) + ' بررسی — ✅ ' + pass + ' · ❌ ' + fail);
  if (errors.length) { console.log('شکست‌ها:'); errors.forEach((f) => console.log('  - ' + f)); }
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
