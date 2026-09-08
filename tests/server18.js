#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   server18 — لایهٔ مقدار: strict request validation (سرورِ واقعی)
   ───────────────────────────────────────────────────────────────────
   U   validate() واحد: الگویِ schema + unknown + required (بدونِ سرور)
   A   auth: فیلدِ ناشناخته/تایپ (send-code/login) + حفظِ codeها
   B   sync پاکت: کلیدِ اضافه/uid/base_version/body
   C   sync مقدار: طول/enum/عدد/تاریخ + ایزوله‌بودنِ عملیات + عدمِ نشتِ PII
   O   ترتیب: fieldGate پیش از لایهٔ مقدار (codeهایِ قفل‌شده عوض نشوند)
   D   resolve-conflict: schema + جریانِ سالم
   E   restore: schema + سقفِ بدنه
   F   sms/send: مهاجرت به validate با همان codeها
   اجرا: node tests/server18.js   (پورت‌ها: 9021–9022)
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const http = require('http');

const ROOT = path.join(__dirname, '..');
const V = require(path.join(ROOT, 'server', 'validate.js'));

let pass = 0, fail = 0;
const errors = [];
function chk(name, cond, extra) {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; errors.push(name + (extra !== undefined ? ' — ' + String(extra).slice(0, 200) : '')); console.log('  ❌ ' + name + (extra !== undefined ? ' — ' + String(extra).slice(0, 200) : '')); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function httpReq(port, method, p, body, cookie, raw) {
  const headers = { 'Content-Type': 'application/json' };
  if (cookie) headers['Cookie'] = cookie;
  return new Promise((resolve) => {
    const data = body === undefined ? null : (raw ? body : JSON.stringify(body));
    const req = http.request({ hostname: '127.0.0.1', port, path: p, method, headers }, (res) => {
      let b = '';
      res.on('data', (d) => (b += d));
      res.on('end', () => { let j = null; try { j = JSON.parse(b); } catch (e) {} resolve({ status: res.statusCode, json: j, text: b, setCookie: res.headers['set-cookie'] }); });
    });
    req.on('error', () => resolve({ status: 0, json: null, text: '' }));
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

let tmp = null, srv = null;
process.on('exit', () => {
  try { if (srv) srv.kill('SIGKILL'); } catch (e) {}
  try { if (tmp) fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {}
});

async function main() {
  console.log('\n▸ server18 — strict request validation');

  /* ── U: واحدِ validate() ─────────────────────────────────────── */
  console.log('— U واحد —');
  chk('U1 الگویِ schema (max + required)', V.validate({ name: 'x' }, { fields: { name: { type: 'string', max: 100 } }, required: ['name'] }).ok === true);
  chk('U2 طولِ بیش‌ازحد رد می‌شود', V.validate({ name: 'x'.repeat(101) }, { fields: { name: { type: 'string', max: 100 } } }).ok === false);
  const u3 = V.validate({ name: 'x', evil: 1 }, { fields: { name: { type: 'string' } } });
  chk('U3 کلیدِ ناشناخته = unknown_field', !u3.ok && u3.kind === 'unknown_field' && u3.field === 'evil');
  const u4 = V.validate({}, { fields: { a: { type: 'string' } }, required: ['a'] });
  chk('U4 فیلدِ الزامیِ غایب = missing', !u4.ok && u4.kind === 'missing');

  /* ── boot ───────────────────────────────────────────────────── */
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'payesh-s18-'));
  const storeFile = path.join(tmp, 'payesh.json');
  fs.copyFileSync(path.join(ROOT, 'server/data/payesh.json'), storeFile);
  const keyFile = path.join(tmp, 'jwt.key');
  const auditFile = path.join(tmp, 'audit.log');
  const src = JSON.parse(fs.readFileSync(storeFile, 'utf8'));

  const M1 = src.users.find(u => u.role === 'manager' && u.school_id === 1);
  const T1 = src.users.find(u => u.role === 'teacher' && u.school_id === 1);
  const SA = src.users.find(u => u.role === 'superadmin');
  const ST = src.users.find(u => u.role === 'student' && u.school_id === 1);
  const G1 = src.grades.find(g => g.school_id === 1);
  chk('P0 حساب‌ها و نمرهٔ مدرسهٔ ۱ موجودند', !!(M1 && T1 && SA && ST && G1));
  if (!(M1 && T1 && SA && ST && G1)) process.exit(1);

  let port = null;
  for (const p of [9021, 9022]) {
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
  chk('P1 سرورِ واقعی بالا آمد', port !== null);
  if (port === null) process.exit(1);

  async function login(u) {
    const sc = await httpReq(port, 'POST', '/api/auth/send-code', { phone: u.phone });
    const code = sc.json && sc.json.demo_code;
    const lg = await httpReq(port, 'POST', '/api/auth/login', { phone: u.phone, code, national_id: u.national_id });
    if (!(lg.json && lg.json.ok)) return null;
    return cookieFrom(lg);
  }
  const cM = await login(M1), cT = await login(T1), cSA = await login(SA);
  chk('P2 سه نشستِ واقعی (مدیر/دبیر/سوپرادمین)', !!(cM && cT && cSA));
  if (!(cM && cT && cSA)) process.exit(1);

  let seq = 0;
  async function syncOps(cookie, ops) {
    const body = { ops: ops.map(o => Object.assign({ uid: 's18-' + (++seq) }, o)) };
    return httpReq(port, 'POST', '/api/sync', body, cookie);
  }
  const res0 = (r) => (r.json && r.json.results && r.json.results[0]) || {};

  /* ── A: auth ────────────────────────────────────────────────── */
  console.log('— A احراز —');
  let r = await httpReq(port, 'POST', '/api/auth/send-code', { phone: M1.phone, evil: 1 });
  chk('A1 send-code با فیلدِ اضافه → 400 unknown_field', r.status === 400 && r.json && r.json.code === 'unknown_field', r.status + ' ' + r.text.slice(0, 120));
  r = await httpReq(port, 'POST', '/api/auth/send-code', { phone: 9991234567 });
  chk('A2 send-code با phoneِ عددی → 400 bad_phone', r.status === 400 && r.json && r.json.code === 'bad_phone', r.status + ' ' + r.text.slice(0, 120));
  r = await httpReq(port, 'POST', '/api/auth/send-code', {});
  chk('A3 send-code بدونِ phone → bad_phone (حفظ‌شده)', r.status === 400 && r.json && r.json.code === 'bad_phone', r.status + ' ' + r.text.slice(0, 120));
  r = await httpReq(port, 'POST', '/api/auth/login', { phone: M1.phone, code: '0000', national_id: M1.national_id, evil: 1 });
  chk('A4 login با فیلدِ اضافه → 400 unknown_field', r.status === 400 && r.json && r.json.code === 'unknown_field', r.status + ' ' + r.text.slice(0, 120));
  r = await httpReq(port, 'POST', '/api/auth/login', { phone: M1.phone });
  chk('A5 loginِ ناقص → missing_fields (حفظ‌شده)', r.status === 400 && r.json && r.json.code === 'missing_fields', r.status + ' ' + r.text.slice(0, 120));

  /* ── B: پاکتِ sync ──────────────────────────────────────────── */
  console.log('— B پاکت —');
  r = await syncOps(cM, [{ t: 'ins', c: 'announcements', by: M1.id, evil: 1, data: { school_id: 1, title: 'x' } }]);
  chk('B1 کلیدِ اضافه در op → کلِ دسته 403 malformed_op', r.status === 403 && r.json && r.json.code === 'malformed_op', r.status + ' ' + r.text.slice(0, 140));
  r = await httpReq(port, 'POST', '/api/sync', { ops: [{ uid: 'x'.repeat(200), t: 'ins', c: 'announcements', by: M1.id, data: { school_id: 1 } }] }, cM);
  chk('B2 uidِ ۲۰۰ نویسه‌ای → malformed_op', r.status === 403 && r.json && r.json.code === 'malformed_op', r.status + ' ' + r.text.slice(0, 140));
  r = await httpReq(port, 'POST', '/api/sync', { ops: [{ uid: 12345, t: 'ins', c: 'announcements', by: M1.id, data: { school_id: 1 } }] }, cM);
  chk('B3 uidِ عددی → malformed_op', r.status === 403 && r.json && r.json.code === 'malformed_op', r.status + ' ' + r.text.slice(0, 140));
  r = await httpReq(port, 'POST', '/api/sync', { ops: [], debug: true }, cM);
  chk('B4 کلیدِ اضافه در بدنه → 400 bad_payload', r.status === 400 && r.json && r.json.code === 'bad_payload', r.status + ' ' + r.text.slice(0, 140));
  const cfBefore = JSON.parse(fs.readFileSync(storeFile, 'utf8')).sync_conflicts || [];
  r = await syncOps(cM, [{ t: 'upd', c: 'grades', id: G1.id, by: M1.id, base_version: 'x', data: { score: 15 } }]);
  chk('B5 base_versionِ بدشکل → validation_failed (عملیات‌محور)', r.status === 200 && res0(r).ok === false && res0(r).code === 'validation_failed', JSON.stringify(res0(r)));
  await sleep(2600);
  const cfAfter = JSON.parse(fs.readFileSync(storeFile, 'utf8')).sync_conflicts || [];
  chk('B6 base_versionِ بدشکل سطرِ تعارض نساخت', cfAfter.length === cfBefore.length, cfBefore.length + '→' + cfAfter.length);

  /* ── C: مقدار ───────────────────────────────────────────────── */
  console.log('— C مقدار —');
  r = await syncOps(cM, [{ t: 'ins', c: 'leaves', by: M1.id, data: { school_id: 1, student_id: ST.id, from_date: '2026-09-10', to_date: '2026-09-10', reason: 'تست', status: 'whatever' } }]);
  chk('C1 leaves.status=whatever (مدیر) → validation_failed', r.status === 200 && !res0(r).ok && res0(r).code === 'validation_failed', JSON.stringify(res0(r)));
  r = await syncOps(cM, [{ t: 'ins', c: 'leaves', by: M1.id, data: { school_id: 1, student_id: ST.id, from_date: '2026-09-10', to_date: '2026-09-10', reason: 'تست', status: 'pending' } }]);
  chk('C2 leaves.status=pending → ok (شاهد)', r.status === 200 && res0(r).ok === true, JSON.stringify(res0(r)));
  const LONGNAME = 'ZZUNIQUE-' + 'ن'.repeat(95);
  r = await syncOps(cM, [{ t: 'ins', c: 'users', by: M1.id, data: { school_id: 1, role: 'student', full_name: LONGNAME, username: 'zzunique1' } }]);
  const c3 = res0(r);
  chk('C3 full_nameِ ۱۰۱ نویسه‌ای → validation_failed', r.status === 200 && !c3.ok && c3.code === 'validation_failed', JSON.stringify(c3));
  chk('C4 پاسخ، مقدارِ خام را برنمی‌گرداند (قرارداد §4)', r.text.indexOf('ZZUNIQUE') === -1, r.text.slice(0, 160));
  r = await syncOps(cM, [{ t: 'upd', c: 'users', id: ST.id, by: M1.id, data: { phone: 'BADPHONE-UNIQUE-999' } }]);
  chk('C5 phoneِ نامعتبر → validation_failed', r.status === 200 && !res0(r).ok && res0(r).code === 'validation_failed', JSON.stringify(res0(r)));
  r = await syncOps(cM, [{ t: 'upd', c: 'users', id: ST.id, by: M1.id, data: { phone: '09991112233' } }]);
  chk('C6 phoneِ معتبرِ ۱۱ رقمی → ok', r.status === 200 && res0(r).ok === true, JSON.stringify(res0(r)));
  r = await syncOps(cM, [{ t: 'upd', c: 'users', id: ST.id, by: M1.id, data: { national_id: '123' } }]);
  chk('C7 national_idِ ۳ رقمی → validation_failed', r.status === 200 && !res0(r).ok && res0(r).code === 'validation_failed', JSON.stringify(res0(r)));
  r = await syncOps(cM, [{ t: 'upd', c: 'grades', id: G1.id, by: M1.id, data: { score: 21 } }]);
  chk('C8 score=21 → validation_failed', r.status === 200 && !res0(r).ok && res0(r).code === 'validation_failed', JSON.stringify(res0(r)));
  r = await syncOps(cM, [{ t: 'upd', c: 'grades', id: G1.id, by: M1.id, data: { score: '18' } }]);
  chk("C9 scoreِ رشته‌ای ('18') → validation_failed", r.status === 200 && !res0(r).ok && res0(r).code === 'validation_failed', JSON.stringify(res0(r)));
  r = await syncOps(cM, [{ t: 'upd', c: 'grades', id: G1.id, by: M1.id, data: { score: 18 } }]);
  chk('C10 score=18 → ok (شاهد)', r.status === 200 && res0(r).ok === true, JSON.stringify(res0(r)));
  r = await syncOps(cM, [{ t: 'ins', c: 'leaves', by: M1.id, data: { school_id: 1, student_id: ST.id, from_date: '2026-13-45', to_date: '2026-09-10', status: 'pending' } }]);
  chk('C11 تاریخِ نامعتبر (ماه ۱۳) → validation_failed', r.status === 200 && !res0(r).ok && res0(r).code === 'validation_failed', JSON.stringify(res0(r)));
  r = await syncOps(cM, [{ t: 'upd', c: 'users', id: ST.id, by: M1.id, data: { office_id: 'abc' } }]);
  chk("C12 شناسهٔ رشته‌ایِ نامعتبر ('abc') → validation_failed", r.status === 200 && !res0(r).ok && res0(r).code === 'validation_failed', JSON.stringify(res0(r)));
  r = await syncOps(cM, [{ t: 'upd', c: 'users', id: ST.id, by: M1.id, data: { office_id: '3' } }]);
  chk("C13 شناسهٔ رشته‌ایِ متعارف ('3') → ok (تحملِ DOM)", r.status === 200 && res0(r).ok === true, JSON.stringify(res0(r)));
  r = await syncOps(cM, [
    { t: 'upd', c: 'grades', id: G1.id, by: M1.id, data: { score: 21 } },
    { t: 'upd', c: 'grades', id: G1.id, by: M1.id, data: { score: 17 } },
  ]);
  const rs = (r.json && r.json.results) || [];
  chk('C14 ایزوله‌بودن: خراب رد + سالم ok در یک دسته', r.status === 200 && rs.length === 2 && !rs[0].ok && rs[0].code === 'validation_failed' && rs[1].ok === true, JSON.stringify(rs));
  r = await syncOps(cM, [{ t: 'ins', c: 'exam_duties', by: M1.id, data: { school_id: 1, exam_id: 1, teacher_id: T1.id, role: 'boss' } }]);
  chk("C15 exam_duties.role='boss' → ok (واژگانِ باز؛ گارد، نویسنده است)", r.status === 200 && res0(r).ok === true, JSON.stringify(res0(r)));
  r = await syncOps(cT, [{ t: 'ins', c: 'exam_duties', by: T1.id, data: { school_id: 1, exam_id: 1, teacher_id: T1.id, role: 'main' } }]);
  chk('C15b دبیر + exam_duties → رد (out_of_scope، پیش از دروازهٔ نقش)', r.status === 403 && r.json && r.json.code === 'out_of_scope', r.status + ' ' + JSON.stringify(res0(r)));
  r = await syncOps(cM, [{ t: 'ins', c: 'preapps', by: M1.id, data: { school_id: 1, name: 'تست', stage: 'zzz' } }]);
  chk("C16 preapps.stage='zzz' → validation_failed", r.status === 200 && !res0(r).ok && res0(r).code === 'validation_failed', JSON.stringify(res0(r)));
  await sleep(2600);
  const disk = JSON.parse(fs.readFileSync(storeFile, 'utf8'));
  chk('C17 ردشده در store نرفت (full_nameِ ۱۰۱ نویسه‌ای نیست)', !(disk.users || []).some(u => u.full_name === LONGNAME));
  chk('C18 ردشده در store نرفت (statusِ whatever نیست)', !(disk.leaves || []).some(l => l.status === 'whatever'));
  const auditTxt = fs.existsSync(auditFile) ? fs.readFileSync(auditFile, 'utf8') : '';
  chk('C19 آدیت: sync_validation_failed ثبت شد', auditTxt.indexOf('sync_validation_failed') > -1);
  chk('C20 آدیت PII ندارد (نام/تلفنِ خراب نیامده)', auditTxt.indexOf('ZZUNIQUE') === -1 && auditTxt.indexOf('BADPHONE-UNIQUE-999') === -1);

  /* ── O: ترتیبِ دروازه‌ها ────────────────────────────────────── */
  console.log('— O ترتیب —');
  const now = new Date().toISOString();
  r = await syncOps(cT, [{ t: 'ins', c: 'meeting_slots', by: T1.id, data: { school_id: 1, teacher_id: T1.id, date: '2026-09-11', start_time: '10:00', duration: 30, location: 'x', status: 'closed', created_at: now } }]);
  chk("O1 دبیر + status=closed → field_denied (fieldGate اول، مثلِ M4x)", res0(r).code === 'field_denied', JSON.stringify(res0(r)));

  /* ── D: resolve-conflict ────────────────────────────────────── */
  console.log('— D داوری —');
  r = await httpReq(port, 'POST', '/api/sync/resolve-conflict', { conflict_id: 1, winner: 'server', evil: 1 }, cM);
  chk('D1 فیلدِ اضافه → 400 unknown_field', r.status === 400 && r.json && r.json.code === 'unknown_field', r.status + ' ' + r.text.slice(0, 120));
  r = await httpReq(port, 'POST', '/api/sync/resolve-conflict', { conflict_id: 1, winner: 'me' }, cM);
  chk('D2 winnerِ نامعتبر → bad_payload (حفظ‌شده)', r.status === 400 && r.json && r.json.code === 'bad_payload', r.status + ' ' + r.text.slice(0, 120));
  r = await httpReq(port, 'POST', '/api/sync/resolve-conflict', { conflict_id: 1, winner: 'server', reason: 'x'.repeat(201) }, cM);
  chk('D3 reasonِ ۲۰۱ نویسه‌ای → 400 bad_payload (ردِّ صریح)', r.status === 400 && r.json && r.json.code === 'bad_payload', r.status + ' ' + r.text.slice(0, 120));
  r = await httpReq(port, 'POST', '/api/sync/resolve-conflict', { conflict_id: '1', winner: 'server' }, cM);
  chk('D4 conflict_idِ رشته‌ای → bad_payload', r.status === 400 && r.json && r.json.code === 'bad_payload', r.status + ' ' + r.text.slice(0, 120));
  r = await syncOps(cM, [{ t: 'upd', c: 'grades', id: G1.id, by: M1.id, base_version: 999, data: { score: 12 } }]);
  const cfId = res0(r).conflict_id;
  chk('D5 تعارضِ واقعی ساخته شد (base_versionِ کهنه)', r.status === 200 && res0(r).code === 'conflict_preserved' && !!cfId, JSON.stringify(res0(r)));
  r = await httpReq(port, 'POST', '/api/sync/resolve-conflict', { conflict_id: cfId, winner: 'incoming', reason: 'تستِ داوری' }, cM);
  chk('D6 داوریِ سالم → ok', r.status === 200 && r.json && r.json.ok === true, r.status + ' ' + r.text.slice(0, 160));

  /* ── E: restore ─────────────────────────────────────────────── */
  console.log('— E بازیابی —');
  const bk = await httpReq(port, 'POST', '/api/admin/backup', undefined, cSA);
  chk('E0 پشتیبان ساخته شد', bk.status === 200 && bk.json && bk.json.ok === true, bk.status + ' ' + bk.text.slice(0, 120));
  r = await httpReq(port, 'POST', '/api/admin/restore', { evil: 1 }, cSA);
  chk('E1 فیلدِ اضافه → 400 unknown_field', r.status === 400 && r.json && r.json.code === 'unknown_field', r.status + ' ' + r.text.slice(0, 120));
  r = await httpReq(port, 'POST', '/api/admin/restore', { file: '../../etc/passwd' }, cSA);
  chk('E2 نامِ traversal → 200 + آخرین نسخه (قراردادِ F1)', r.status === 200 && r.json && r.json.ok === true && r.json.file !== '../../etc/passwd', r.status + ' ' + r.text.slice(0, 160));
  r = await httpReq(port, 'POST', '/api/admin/restore', { file: 'payesh-19990101-000000-000.json' }, cSA);
  chk('E3 نامِ الگودارِ ناموجود → 200 + آخرین نسخه (fallback)', r.status === 200 && r.json && r.json.ok === true && r.json.file !== 'payesh-19990101-000000-000.json', r.status + ' ' + r.text.slice(0, 160));
  r = await httpReq(port, 'POST', '/api/admin/restore', {}, cSA);
  chk('E4 بازیابیِ آخرین نسخه → ok (حفظ‌شده)', r.status === 200 && r.json && r.json.ok === true, r.status + ' ' + r.text.slice(0, 120));
  r = await httpReq(port, 'POST', '/api/admin/restore', 'x'.repeat(5000), cSA, true);
  chk('E5 بدنهٔ 5KB به restore → 413 body_too_large', r.status === 413 && r.json && r.json.code === 'body_too_large', r.status + ' ' + r.text.slice(0, 120));

  /* ── F: sms ─────────────────────────────────────────────────── */
  console.log('— F پیامک —');
  r = await httpReq(port, 'POST', '/api/sms/send', { queue_ids: [1], evil: 1 }, cSA);
  chk('F1 فیلدِ اضافه → unknown_field (مهاجرت، همان code)', r.status === 400 && r.json && r.json.code === 'unknown_field', r.status + ' ' + r.text.slice(0, 120));
  r = await httpReq(port, 'POST', '/api/sms/send', { queue_ids: ['x'] }, cSA);
  chk('F2 آرایهٔ بدشکل → bad_batch (حفظ‌شده)', r.status === 400 && r.json && r.json.code === 'bad_batch', r.status + ' ' + r.text.slice(0, 120));
  r = await httpReq(port, 'POST', '/api/sms/send', { queue_ids: [] }, cSA);
  chk('F3 آرایهٔ خالی → empty_batch (حفظ‌شده)', r.status === 400 && r.json && r.json.code === 'empty_batch', r.status + ' ' + r.text.slice(0, 120));

  try { srv.kill('SIGKILL'); } catch (e) {}
  srv = null;
  console.log('\nserver18: ' + pass + ' سبز، ' + fail + ' قرمز');
  if (fail) { console.log('❌ خطاها:\n - ' + errors.join('\n - ')); process.exit(1); }
}

main().catch((e) => { console.error('server18 crashed:', e); try { if (srv) srv.kill('SIGKILL'); } catch (x) {} process.exit(1); });
