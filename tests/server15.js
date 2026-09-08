#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   R95 (بند ۲.۵) — base_version + حفظِ تعارض + داوری (سرورِ واقعی)
     S0  سرور + پنج نشست (سوپرادمین، مدیر ۱، مدیر ۲، دبیر ۱، دبیر ۲)
     C1  ins نمره → version ۱ روی disk
     C2  upd با base_versionِ یکسان → اعمال + version ۲
     C3  upd با base_versionِ کهنه → conflict_preserved (اعمال نشد)
     C3b رکوردِ sync_conflicts روی disk (open، نسخه‌ها، هر دو نسخه)
     C4  اعلانِ «⚠️ تعارض همگام‌سازی» به مدیرِ مدرسه
     C5  بدون base_version → اعمال (سازگاریِ قدیمی) + نسخه چرخید
     C6  مجموعهٔ LWW (announcements): base_version بی‌اثر → اعمال
     C7  ساختار (subjects) کهنه → stale_base (اعمال نشد)
     C8  ساختار با base_versionِ یکسان (۰) → اعمال + version
     C9  حضور: همان سیاست نسخه‌دار (ins → conflict)
     C10 مدرسهٔ دوم: تعارضِ جداگانه (دامنهٔ school)
     C11 فهرست: مدیر فقط مدرسهٔ خود؛ سوپرادمین همه
     C12 GET بدون نشست ۴۰۱ / دبیر ۴۰۳
     C13 resolve بین‌مدرسه‌ای → ۴۰۳ out_of_scope
     C14 resolve توسطِ دبیر → ۴۰۳ role_denied
     C15 resolve incoming → اعمالِ دادهٔ کلاینت + نسخه +۱
     C16 resolve دوم → ۴۰۹ already_resolved
     C17 resolve server → رکورد دست‌نخورده + resolved
     C18 ردِّ پایِ audit (sync_conflict_preserved + conflict_resolved)
   اجرا: node tests/server15.js
   ═══════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const http = require('http');

const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const errors = [];
function chk(name, cond, extra) {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; errors.push(name + (extra !== undefined ? ' — ' + String(extra).slice(0, 200) : '')); console.log('  ❌ ' + name + (extra !== undefined ? ' — ' + String(extra).slice(0, 200) : '')); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function httpReq(port, method, p, body, cookie) {
  const headers = { 'Content-Type': 'application/json' };
  if (cookie) headers['Cookie'] = cookie;
  return new Promise((resolve) => {
    const data = body ? JSON.stringify(body) : null;
    const req = http.request({ hostname: '127.0.0.1', port, path: p, method, headers }, (res) => {
      let b = '';
      res.on('data', (d) => (b += d));
      res.on('end', () => { let j = null; try { j = JSON.parse(b); } catch (e) {} resolve({ status: res.statusCode, json: j, setCookie: res.headers['set-cookie'] }); });
    });
    req.on('error', () => resolve({ status: 0, json: null, setCookie: [] }));
    if (data) req.write(data);
    req.end();
  });
}
function cookieFrom(r) {
  const sc = r.setCookie || [];
  for (const c of Array.isArray(sc) ? sc : [sc]) {
    const kv = String(c).split(';')[0];
    const i = kv.indexOf('=');
    if (i > 0) return kv.slice(0, i) + '=' + kv.slice(i + 1);
  }
  return '';
}
let tmp = null;
process.on('exit', () => { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {} });

async function main() {
  console.log('\n▸ R95 بند ۲.۵ — نسخه‌گذاری + حفظِ تعارض + داوری (سرورِ واقعی)');
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'payesh-s15-'));
  const storeFile = path.join(tmp, 'payesh.json');
  fs.copyFileSync(path.join(ROOT, 'server/data/payesh.json'), storeFile);
  const keyFile = path.join(tmp, 'jwt.key');
  const auditFile = path.join(tmp, 'audit.log');
  const src = JSON.parse(fs.readFileSync(storeFile, 'utf8'));

  const SA = src.users.find(u => u.role === 'superadmin');
  const M1 = src.users.find(u => u.role === 'manager' && u.school_id === 1);
  const M2 = src.users.find(u => u.role === 'manager' && u.school_id === 2);
  const T1 = src.users.find(u => u.role === 'teacher' && u.school_id === 1 && u.id === 4);
  const T2 = src.users.find(u => u.role === 'teacher' && u.school_id === 2 && u.id === 246);
  chk('S0a حساب‌ها موجودند', !!(SA && M1 && M2 && T1 && T2));
  if (!(SA && M1 && M2 && T1 && T2)) process.exit(1);

  let port = null, srv = null;
  for (const p of [9001, 9002]) {
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
      const h = await httpReq(p, 'GET', '/api/health').then(r => r.json).catch(() => null);
      if (h && h.ok && h.pid === s.pid) { booted = true; break; }
      if (h && h.ok) break;
      await sleep(300);
    }
    if (booted) { port = p; srv = s; break; }
    s.kill('SIGKILL');
  }
  chk('S0b سرورِ واقعی بالا آمد', port !== null);
  if (port === null) process.exit(1);

  async function login(u) {
    const sc = await httpReq(port, 'POST', '/api/auth/send-code', { phone: u.phone });
    const code = sc.json && sc.json.demo_code;
    const lg = await httpReq(port, 'POST', '/api/auth/login', { phone: u.phone, code, national_id: u.national_id });
    return (lg.json && lg.json.ok) ? cookieFrom(lg) : null;
  }
  const cSA = await login(SA), cM1 = await login(M1), cM2 = await login(M2);
  const cT1 = await login(T1), cT2 = await login(T2);
  chk('S0c پنج نشستِ واقعی ساخته شد', !!(cSA && cM1 && cM2 && cT1 && cT2));

  let seq = 0;
  async function syncOps(cookie, ops) {
    const body = { ops: ops.map(o => {
      const w = { t: o.t, c: o.c, id: o.id, data: o.data, by: o.__by, uid: 's15-' + (++seq) };
      if (o.base_version !== undefined) w.base_version = o.base_version;
      return w;
    }) };
    return await httpReq(port, 'POST', '/api/sync', body, cookie);
  }
  const readStore = () => JSON.parse(fs.readFileSync(storeFile, 'utf8'));
  async function waitDisk(fn, tries) {
    for (let i = 0; i < (tries || 12); i++) {
      const s = readStore();
      const r = fn(s);
      if (r) return r;
      await sleep(1000);
    }
    return null;
  }
  const gradeOf = (s, marker) => (s.grades || []).find(g => g.created_at === marker);
  const M_G1 = 'R95-C1', M_G2 = 'R95-C5', M_ATT = 'R95-C9', M_S2 = 'R95-C10', M_AN = 'R95-C6';

  /* C1 — ins نمره → version ۱ */
  let r = await syncOps(cT1, [{ t: 'ins', c: 'grades', __by: T1.id, data: {
    school_id: 1, student_id: 16, class_id: 1, subject_id: 1, teacher_id: T1.id,
    term: 'نوبت دوم', exam_type: 'کلاسی', score: 11.5, max_score: 20, created_at: M_G1 } }]);
  chk('C1 ins نمره → ok', r.json && r.json.results && r.json.results[0] && r.json.results[0].ok, JSON.stringify(r.json).slice(0, 160));
  let g = await waitDisk(s => gradeOf(s, M_G1));
  chk('C1b رکورد روی disk با version ۱ نشسته است', !!(g && g.version === 1), g && JSON.stringify({ score: g.score, version: g.version }));
  if (!g) { console.log('\n❌ server15: ' + errors.join(' | ')); srv.kill('SIGKILL'); process.exit(1); }

  /* C2 — upd با base_versionِ یکسان → اعمال + version ۲ */
  r = await syncOps(cT1, [{ t: 'upd', c: 'grades', id: g.id, base_version: 1, __by: T1.id, data: { score: 12.5 } }]);
  chk('C2 upd با base_versionِ یکسان → ok', r.json && r.json.results[0] && r.json.results[0].ok, JSON.stringify(r.json).slice(0, 160));
  g = await waitDisk(s => { const x = gradeOf(s, M_G1); return (x && x.version === 2 && x.score === 12.5) ? x : null; });
  chk('C2b version ۲ + نمرهٔ تازه روی disk', !!(g && g.version === 2 && g.score === 12.5), g && JSON.stringify({ score: g.score, version: g.version }));

  /* C3 — upd با base_versionِ کهنه → conflict_preserved */
  r = await syncOps(cT1, [{ t: 'upd', c: 'grades', id: g.id, base_version: 1, __by: T1.id, data: { score: 13.5 } }]);
  const c3 = r.json && r.json.results && r.json.results[0];
  chk('C3 upd کهنه → conflict_preserved (+conflict_id)', !!c3 && !c3.ok && c3.code === 'conflict_preserved' && !!c3.conflict_id, JSON.stringify(r.json).slice(0, 160));
  const CF_A = c3 ? c3.conflict_id : null;

  /* C3b — رکوردِ sync_conflicts روی disk (flushِ تضمین‌شده = سنجشِ صادقانه) */
  const cfA = await waitDisk(s => (s.sync_conflicts || []).find(c => c.id === CF_A));
  chk('C3b sync_conflicts روی disk: open + نسخه‌ها + هر دو نسخه',
    !!(cfA && cfA.status === 'open' && cfA.collection === 'grades' && cfA.school_id === 1
       && cfA.base_version === 1 && cfA.server_version === 2
       && cfA.incoming && cfA.incoming.data && cfA.incoming.data.score === 13.5
       && cfA.server_state && cfA.server_state.score === 12.5),
    cfA && JSON.stringify({ status: cfA.status, bv: cfA.base_version, sv: cfA.server_version, inc: cfA.incoming && cfA.incoming.data && cfA.incoming.data.score, ss: cfA.server_state && cfA.server_state.score }));

  /* C3c — همون flush: رکوردِ نمره باید دست‌نخورده باشد */
  g = readStore().grades.find(x => x.created_at === M_G1);
  chk('C3c رکورد دست‌نخورده ماند (نمرهٔ ۱۲٫۵/نسخهٔ ۲) — اعمال نشد', !!(g && g.score === 12.5 && g.version === 2), g && JSON.stringify({ score: g.score, version: g.version }));

  /* C4 — اعلان به مدیر */
  const nt = await waitDisk(s => (s.notifications || []).find(n => n.user_id === M1.id && /تعارض همگام‌سازی/.test(n.title || '')));
  chk('C4 اعلانِ «⚠️ تعارض همگام‌سازی» به مدیرِ مدرسهٔ ۱', !!nt, nt && nt.title);

  /* C5 — بدون base_version (سازگاری قدیمی) → اعمال */
  r = await syncOps(cT1, [{ t: 'ins', c: 'grades', __by: T1.id, data: {
    school_id: 1, student_id: 16, class_id: 1, subject_id: 2, teacher_id: T1.id,
    term: 'نوبت دوم', exam_type: 'کلاسی', score: 10, max_score: 20, created_at: M_G2 } }]);
  chk('C5a ins نمرهٔ دوم → ok', r.json && r.json.results[0] && r.json.results[0].ok, JSON.stringify(r.json).slice(0, 160));
  const g2a = await waitDisk(s => gradeOf(s, M_G2));
  r = await syncOps(cT1, [{ t: 'upd', c: 'grades', id: g2a ? g2a.id : null, __by: T1.id, data: { score: 11 } }]);
  chk('C5 upd بدون base_version → ok (سازگاریِ قدیمی)', r.json && r.json.results[0] && r.json.results[0].ok, JSON.stringify(r.json).slice(0, 160));
  const g2 = await waitDisk(s => { const x = gradeOf(s, M_G2); return (x && x.score === 11 && x.version === 2) ? x : null; });
  chk('C5b اعمال شد + نسخه چرخید (۲)', !!(g2 && g2.score === 11 && g2.version === 2), g2 && JSON.stringify({ score: g2.score, version: g2.version }));

  /* C6 — LWW: announcements با base_versionِ کهنه → هم‌چنان اعمال */
  r = await syncOps(cM1, [{ t: 'ins', c: 'announcements', __by: M1.id, data: {
    school_id: 1, title: 'آگهی R95', body: M_AN, audience: 'all', created_by: M1.id, created_at: '2026-09-08' } }]);
  chk('C6a ins آگهی → ok', r.json && r.json.results[0] && r.json.results[0].ok, JSON.stringify(r.json).slice(0, 160));
  const an = await waitDisk(s => (s.announcements || []).find(a => a.body === M_AN));
  r = await syncOps(cM1, [{ t: 'upd', c: 'announcements', id: an ? an.id : null, base_version: 99, __by: M1.id, data: { title: 'آگهی R95 — ویرایش' } }]);
  chk('C6b LWW: base_versionِ کهنه بی‌اثر → ok (اعمال شد)', r.json && r.json.results[0] && r.json.results[0].ok, JSON.stringify(r.json).slice(0, 160));
  const an2 = await waitDisk(s => (s.announcements || []).find(a => a.id === (an && an.id) && /ویرایش/.test(a.title || '')));
  chk('C6c عنوانِ تازه روی disk (LWW برنده شد)', !!an2, an2 && an2.title);

  /* C7 — ساختار کهنه → stale_base */
  const subj = (src.subjects || []).find(x => x.school_id === 1);
  r = await syncOps(cM1, [{ t: 'upd', c: 'subjects', id: subj ? subj.id : null, base_version: 99, __by: M1.id, data: { weekly_hours: 9 } }]);
  chk('C7 ساختار (subjects) با base_versionِ کهنه → stale_base', r.json && r.json.results[0] && !r.json.results[0].ok && r.json.results[0].code === 'stale_base', JSON.stringify(r.json).slice(0, 160));
  const subjStill = readStore().subjects.find(y => y.id === subj.id);
  chk('C7b رکوردِ ساختار دست‌نخورده ماند', !!(subjStill && subjStill.weekly_hours !== 9), subjStill && 'weekly_hours=' + subjStill.weekly_hours);

  /* C8 — ساختار با base_versionِ یکسان → اعمال + نسخه
     (رکوردهایِ بدونِ فیلدِ version به‌عنوانِ نسخهٔ ۱ تلقی می‌شوند — همان
     fallbackِ ||1 سمتِ کلاینت؛ پس base_versionِ صحیحِ این رکوردِ seed = ۱) */
  r = await syncOps(cM1, [{ t: 'upd', c: 'subjects', id: subj ? subj.id : null, base_version: 1, __by: M1.id, data: { weekly_hours: 3 } }]);
  chk('C8 ساختار با base_versionِ یکسان (۱) → ok', r.json && r.json.results[0] && r.json.results[0].ok, JSON.stringify(r.json).slice(0, 160));
  const subj2 = await waitDisk(s => { const x = (s.subjects || []).find(y => y.id === subj.id); return (x && x.weekly_hours === 3 && x.version === 2) ? x : null; });
  chk('C8b مقدار + version ۲ روی disk (۱+۱)', !!(subj2 && subj2.weekly_hours === 3 && subj2.version === 2), subj2 && JSON.stringify({ wh: subj2.weekly_hours, version: subj2.version }));

  /* C9 — حضور: همان سیاست نسخه‌دار */
  r = await syncOps(cT1, [
    { t: 'ins', c: 'attendance', __by: T1.id, data: { school_id: 1, class_id: 1, student_id: 16, date: '2026-09-08', status: 'present', note: null, taken_at: '2026-09-08T07:00:00', created_at: M_ATT } },
  ]);
  chk('C9a ins حضور → ok', r.json && r.json.results[0] && r.json.results[0].ok, JSON.stringify(r.json).slice(0, 160));
  const att = await waitDisk(s => (s.attendance || []).find(a => a.date === '2026-09-08' && a.student_id === 16 && (a.created_at === M_ATT || !a.created_at)));
  r = await syncOps(cT1, [{ t: 'upd', c: 'attendance', id: att ? att.id : null, base_version: 5, __by: T1.id, data: { status: 'absent' } }]);
  chk('C9b حضور: upd کهنه → conflict_preserved', r.json && r.json.results[0] && !r.json.results[0].ok && r.json.results[0].code === 'conflict_preserved', JSON.stringify(r.json).slice(0, 160));

  /* C10 — مدرسهٔ دوم: تعارضِ جداگانه */
  r = await syncOps(cT2, [{ t: 'ins', c: 'grades', __by: T2.id, data: {
    school_id: 2, student_id: 258, class_id: 10, subject_id: 1, teacher_id: T2.id,
    term: 'نوبت دوم', exam_type: 'کلاسی', score: 9, max_score: 20, created_at: M_S2 } }]);
  chk('C10a مدرسهٔ ۲: ins نمره → ok', r.json && r.json.results[0] && r.json.results[0].ok, JSON.stringify(r.json).slice(0, 160));
  const g10 = await waitDisk(s => gradeOf(s, M_S2));
  r = await syncOps(cT2, [{ t: 'upd', c: 'grades', id: g10 ? g10.id : null, base_version: 7, __by: T2.id, data: { score: 15 } }]);
  chk('C10b مدرسهٔ ۲: upd کهنه → conflict_preserved', r.json && r.json.results[0] && !r.json.results[0].ok && r.json.results[0].code === 'conflict_preserved', JSON.stringify(r.json).slice(0, 160));
  const CF_S2 = r.json && r.json.results[0] && r.json.results[0].conflict_id;

  /* C11 — فهرست + دامنهٔ مدرسه */
  const listM1 = await httpReq(port, 'GET', '/api/sync/conflicts', null, cM1);
  const listM2 = await httpReq(port, 'GET', '/api/sync/conflicts', null, cM2);
  const listSA = await httpReq(port, 'GET', '/api/sync/conflicts', null, cSA);
  const idsM1 = (listM1.json && listM1.json.conflicts || []).map(c => c.id);
  const idsM2 = (listM2.json && listM2.json.conflicts || []).map(c => c.id);
  const idsSA = (listSA.json && listSA.json.conflicts || []).map(c => c.id);
  chk('C11a مدیرِ ۱ تعارضِ مدرسهٔ ۱ را می‌بیند، مدرسهٔ ۲ را نه',
    !!CF_A && idsM1.indexOf(CF_A) > -1 && idsM1.indexOf(CF_S2) === -1,
    'idsM1=' + idsM1.join(',') + ' CF_A=' + CF_A + ' CF_S2=' + CF_S2);
  chk('C11b مدیرِ ۲ برعکس', !!CF_S2 && idsM2.indexOf(CF_S2) > -1 && idsM2.indexOf(CF_A) === -1,
    'idsM2=' + idsM2.join(','));
  chk('C11c سوپرادمین هر دو را می‌بیند', !!CF_A && !!CF_S2 && idsSA.indexOf(CF_A) > -1 && idsSA.indexOf(CF_S2) > -1,
    'idsSA=' + idsSA.join(','));

  /* C12 — نقش/نشست روی GET */
  const gT = await httpReq(port, 'GET', '/api/sync/conflicts', null, cT1);
  const gX = await httpReq(port, 'GET', '/api/sync/conflicts');
  chk('C12 GET: دبیر ۴۰ + بدون نشست ۴۰۱', gT.status === 403 && gX.status === 401, 'teacher=' + gT.status + ' anon=' + gX.status);

  /* C13 — resolve بین‌مدرسه‌ای → 403 out_of_scope */
  const r13 = await httpReq(port, 'POST', '/api/sync/resolve-conflict', { conflict_id: CF_A, winner: 'server' }, cM2);
  chk('C13 مدیرِ ۲ نمی‌تواند تعارضِ مدرسهٔ ۱ را داوری کند (403 out_of_scope)', r13.status === 403 && r13.json && r13.json.code === 'out_of_scope', 'status=' + r13.status + ' ' + JSON.stringify(r13.json).slice(0, 120));

  /* C14 — resolve توسطِ دبیر → 403 role_denied */
  const r14 = await httpReq(port, 'POST', '/api/sync/resolve-conflict', { conflict_id: CF_A, winner: 'server' }, cT1);
  chk('C14 دبیر نمی‌تواند داوری کند (403 role_denied)', r14.status === 403 && r14.json && r14.json.code === 'role_denied', 'status=' + r14.status);

  /* C15 — resolve incoming: اعمالِ دادهٔ کلاینت + نسخه +۱ */
  const r15 = await httpReq(port, 'POST', '/api/sync/resolve-conflict', { conflict_id: CF_A, winner: 'incoming' }, cM1);
  chk('C15 resolve incoming → ok', r15.status === 200 && r15.json && r15.json.ok === true, JSON.stringify(r15.json).slice(0, 160));
  const gA = await waitDisk(s => { const x = gradeOf(s, M_G1); return (x && x.score === 13.5 && x.version === 3) ? x : null; });
  chk('C15b دادهٔ کلاینت (۱۳٫۵) اعمال شد + version ۳', !!(gA && gA.score === 13.5 && gA.version === 3), gA && JSON.stringify({ score: gA.score, version: gA.version }));
  const cfAd = await waitDisk(s => (s.sync_conflicts || []).find(c => c.id === CF_A && c.status === 'resolved'));
  chk('C15c رکوردِ تعارض resolved + winner + resolved_by', !!(cfAd && cfAd.winner === 'incoming' && cfAd.resolved_by === M1.id && cfAd.resolved_at), cfAd && JSON.stringify({ status: cfAd.status, winner: cfAd.winner, by: cfAd.resolved_by }));

  /* C16 — resolve دوباره → 409 */
  const r16 = await httpReq(port, 'POST', '/api/sync/resolve-conflict', { conflict_id: CF_A, winner: 'server' }, cM1);
  chk('C16 resolve دوباره → 409 already_resolved', r16.status === 409 && r16.json && r16.json.code === 'already_resolved', 'status=' + r16.status);

  /* C17 — resolve server: رکورد دست‌نخورده */
  r = await syncOps(cT1, [{ t: 'upd', c: 'grades', id: gA ? gA.id : null, base_version: 1, __by: T1.id, data: { score: 14.5 } }]);
  const CF_B = r.json && r.json.results[0] && r.json.results[0].conflict_id;
  chk('C17a تعارضِ دوم ساخته شد', !!CF_B, JSON.stringify(r.json).slice(0, 160));
  const r17 = await httpReq(port, 'POST', '/api/sync/resolve-conflict', { conflict_id: CF_B, winner: 'server', reason: 'تست' }, cM1);
  chk('C17b resolve server → ok', r17.status === 200 && r17.json && r17.json.ok === true, JSON.stringify(r17.json).slice(0, 160));
  const cfBd = await waitDisk(s => (s.sync_conflicts || []).find(c => c.id === CF_B && c.status === 'resolved'));
  chk('C17c resolved + winner server + reason', !!(cfBd && cfBd.winner === 'server' && cfBd.reason === 'تست'), cfBd && JSON.stringify({ winner: cfBd.winner, reason: cfBd.reason }));
  const gB = readStore().grades.find(x => x.created_at === M_G1);
  chk('C17d رکورد دست‌نخورده ماند (۱۳٫۵/۳) — نسخهٔ سرور برنده شد', !!(gB && gB.score === 13.5 && gB.version === 3), gB && JSON.stringify({ score: gB.score, version: gB.version }));

  /* C18 — ردِّ پایِ audit */
  const auditTxt = fs.readFileSync(auditFile, 'utf8');
  chk('C18 audit: sync_conflict_preserved + conflict_resolved',
    auditTxt.indexOf('sync_conflict_preserved') > -1 && auditTxt.indexOf('conflict_resolved') > -1,
    'preserved=' + (auditTxt.indexOf('sync_conflict_preserved') > -1) + ' resolved=' + (auditTxt.indexOf('conflict_resolved') > -1));

  srv.kill('SIGKILL');
  await sleep(200);

  console.log('\n' + '─'.repeat(52));
  console.log(`server15 (R95 بند ۲.۵): ${pass} بررسی — ✅ ${pass} · ❌ ${fail}`);
  if (fail) { console.log(errors.join('\n')); process.exit(1); }
}
main().catch((e) => { console.error(e); process.exit(1); });
