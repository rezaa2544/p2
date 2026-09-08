#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   دور 85 (P0-1) — سفیدفهرستِ فیلد برای `leaves` (سرورِ واقعی)
   ───────────────────────────────────────────────────────────────────
   S0  سه نشستِ واقعی (والدِ ۱۷، مدیرِ مدرسهٔ ۱، دبیر)
   S1  والد: ins مرخصی با status:'pending' → ok
   S2  والد: ins مرخصی با status:'approved' → field_denied (ساخته نمی‌شود)
   S3  والد: ins بدون status → ok + نرمال‌شده به pending
   S4  والد: upd status:'approved' روی فرزندش → field_denied (تغییر نمی‌کند)
   S5  والد: upd فیلدِ دیگر (reason) بدون status → ok
   S6  مدیر: upd status:'approved' → ok
   S7  مدیر: ins مستقیم با status:'approved' (روندِ خوابگاه، AD 78.3) → ok
   S8  دبیر: ins leaves → 403 role_denied (نقش، دست‌نخورده)
   S9  مدیر: upd status:'pending' → field_denied (مقدارِ مجاز نیست)
   S10 والد: upd بدون status روی مرخصیِ غیرفرزند → 403 out_of_scope
   S11 دستهٔ مخلوط: op سالم + op جعلی → سالم ok، جعلی field_denied (۲۰)
   S12 disk: وضعیتِ نهاییِ رکوردِ والد = pending + reasonِ تازه
   S13 آدیت: sync_field_denied وجود دارد، بدونِ شمارهٔ تلفن
   Round 88: S14–S17 (دامنهٔ leaves + هُکِ اعلانِ سروریِ مدیر)
   Round 89: S18–S26 (چت/تکلیف/نوبت/نشانِ خوانده/ردِ فرزند + هُک‌هایِ چت و corrections)
   Round 90: S27 (upd اعلانِ خود فقط پرچمِ read)
   اجرا: node tests/server12.js
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
  else { fail++; errors.push(name + (extra !== undefined ? ' — ' + String(extra).slice(0, 160) : '')); console.log('  ❌ ' + name + (extra !== undefined ? ' — ' + String(extra).slice(0, 160) : '')); }
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
    req.on('error', () => resolve({ status: 0, json: null }));
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

process.on('exit', () => { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {} });
let tmp = null;

async function main() {
  console.log('\n▸ دور 85 — P0-1: سفیدفهرستِ فیلد برای leaves (سرورِ واقعی)');
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'payesh-s12-'));
  const storeFile = path.join(tmp, 'payesh.json');
  fs.copyFileSync(path.join(ROOT, 'server/data/payesh.json'), storeFile);
  const keyFile = path.join(tmp, 'jwt.key');
  const auditFile = path.join(tmp, 'audit.log');
  const src = JSON.parse(fs.readFileSync(storeFile, 'utf8'));

  const P = src.users.find(u => u.id === 17);                 /* والد — فرزند 16 */
  const KID = 16;
  const M1 = src.users.find(u => u.role === 'manager' && u.school_id === 1);
  const T1 = src.users.find(u => u.role === 'teacher' && u.school_id === 1);
  const FOREIGN = (src.leaves || []).find(l => l.school_id === 1 && l.student_id !== KID);
  chk('P0 حساب‌ها موجودند (والد/فرزند/مدیر/دبیر + مرخصیِ خارجی)', !!(P && M1 && T1 && FOREIGN && (src.parent_links || []).some(l => l.parent_id === 17 && l.student_id === KID)));
  if (!(P && M1 && T1 && FOREIGN)) process.exit(1);

  let port = null, srv = null;
  for (const p of [8993, 8992]) {
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
  const cP = await login(P);
  const cM = await login(M1);
  const cT = await login(T1);
  chk('S0 سه نشستِ واقعی ساخته شد (والد، مدیر، دبیر)', !!(cP && cM && cT));

  let seq = 0;
  async function syncOps(cookie, ops) {
    const body = { ops: ops.map(o => Object.assign({ by: o.__by, uid: 's12-' + (++seq) }, { t: o.t, c: o.c, id: o.id, data: o.data })) };
    const r = await httpReq(port, 'POST', '/api/sync', body, cookie);
    return r;
  }
  const leaf = (status) => ({ school_id: 1, student_id: KID, from_date: '2026-09-10', to_date: '2026-09-10', reason: 'دور 85 P0-1', status, created_at: '2026-09-07' });

  /* S1 — والد: ins با pending */
  const r1 = await syncOps(cP, [{ t: 'ins', c: 'leaves', data: leaf('pending'), __by: P.id }]);
  chk('S1 والد: ins با status pending → ok', r1.json && r1.json.results && r1.json.results[0] && r1.json.results[0].ok, JSON.stringify(r1.json).slice(0, 140));

  /* S2 — والد: ins جعلی با approved */
  const r2 = await syncOps(cP, [{ t: 'ins', c: 'leaves', data: leaf('approved'), __by: P.id }]);
  const s2 = r2.json && r2.json.results && r2.json.results[0];
  chk('S2 والد: ins با status approved → field_denied (ردِ عملیات)', r2.status === 200 && s2 && !s2.ok && s2.code === 'field_denied', JSON.stringify(r2.json).slice(0, 140));

  /* S3 — والد: ins بدون status → نرمال pending */
  const d3 = leaf(undefined);
  const r3 = await syncOps(cP, [{ t: 'ins', c: 'leaves', data: d3, __by: P.id }]);
  chk('S3 والد: ins بدون status → ok (نرمال pending)', r3.json && r3.json.results[0] && r3.json.results[0].ok, JSON.stringify(r3.json).slice(0, 140));

  /* پیدا کردن id رکوردِ S1 روی disk (flush هر ۲ ثانیه) */
  let recId = null;
  for (let i = 0; i < 10 && recId == null; i++) {
    await sleep(1000);
    const cand = JSON.parse(fs.readFileSync(storeFile, 'utf8'));
    const hit = (cand.leaves || []).find(l => l.student_id === KID && l.reason === 'دور 85 P0-1' && l.status === 'pending');
    if (hit) recId = hit.id;
  }
  chk('S3b رکوردِ S1 روی disk نشسته است (pending)', recId != null);
  if (recId == null) { console.log('\n❌ server12: ' + errors.join(' | ')); process.exit(1); }

  const r5 = await syncOps(cP, [{ t: 'upd', c: 'leaves', id: recId, data: { status: 'approved' }, __by: P.id }]);
  const s5 = r5.json && r5.json.results && r5.json.results[0];
  chk('S4 والد: upd status approved → field_denied', r5.status === 200 && s5 && !s5.ok && s5.code === 'field_denied', JSON.stringify(r5.json).slice(0, 140));

  /* S5 — والد: upd بدون status (reason) */
  const r6 = await syncOps(cP, [{ t: 'upd', c: 'leaves', id: recId, data: { reason: 'دور 85 — reasonِ تازه' }, __by: P.id }]);
  chk('S5 والد: upd فیلدِ دیگر (بدون status) → ok', r6.json && r6.json.results[0] && r6.json.results[0].ok, JSON.stringify(r6.json).slice(0, 140));

  /* S6 — مدیر: upd status approved */
  const r7 = await syncOps(cM, [{ t: 'upd', c: 'leaves', id: recId, data: { status: 'approved' }, __by: M1.id }]);
  chk('S6 مدیر: upd status approved → ok', r7.json && r7.json.results[0] && r7.json.results[0].ok, JSON.stringify(r7.json).slice(0, 140));

  /* S7 — مدیر: ins مستقیمِ approved (خوابگاه — AD 78.3) */
  const r8 = await syncOps(cM, [{ t: 'ins', c: 'leaves', data: Object.assign({}, leaf('approved'), { kind: 'dorm_weekend', reason: 'مرخصیِ رفت‌وبرگشتِ آخر هفته (خوابگاه)' }), __by: M1.id }]);
  chk('S7 مدیر: ins مستقیمِ approved (روندِ خوابگاه) → ok', r8.json && r8.json.results[0] && r8.json.results[0].ok, JSON.stringify(r8.json).slice(0, 140));

  /* S8 — دبیر: role_denied (نقش، دست‌نخورده) */
  const r9 = await syncOps(cT, [{ t: 'ins', c: 'leaves', data: leaf('pending'), __by: T1.id }]);
  const s9 = r9.json && r9.json.results && r9.json.results[0];
  /* R96: ردِّ نقش به دروازهٔ فیلد پیوست — per-op (200 + ok:false) تا بقیهٔ
     دسته زنده بماند؛ legacy 403ِ دسته‌ای دیگر معیار نیست. */
  chk('S8 دبیر: ins leaves → role_denied (per-op)', r9.status === 200 && s9 && !s9.ok && s9.code === 'role_denied', JSON.stringify(r9.json).slice(0, 140));

  /* S9 — مدیر: upd status 'pending' (مقدارِ مجاز نیست) */
  const r10 = await syncOps(cM, [{ t: 'upd', c: 'leaves', id: recId, data: { status: 'pending' }, __by: M1.id }]);
  const s10 = r10.json && r10.json.results && r10.json.results[0];
  chk('S9 مدیر: upd status pending → field_denied (مقدار)', r10.status === 200 && s10 && !s10.ok && s10.code === 'field_denied', JSON.stringify(r10.json).slice(0, 140));

  /* S10 — والد: upd بدون status روی مرخصیِ غیرفرزند → out_of_scope */
  const r11 = await syncOps(cP, [{ t: 'upd', c: 'leaves', id: FOREIGN.id, data: { reason: 'جعلِ scope' }, __by: P.id }]);
  const s11 = r11.json && r11.json.results && r11.json.results[0];
  chk('S10 والد: غیرفرزند → 403 out_of_scope (fail-closed)', r11.status === 403 && s11 && !s11.ok && s11.code === 'out_of_scope', JSON.stringify(r11.json).slice(0, 140));

  /* S11 — دستهٔ مخلوط: op سالم + op جعلی (status) */
  const d11 = leaf('pending');
  const r12 = await syncOps(cP, [
    { t: 'upd', c: 'leaves', id: recId, data: { reason: 'دستهٔ مخلوط — سالم' }, __by: P.id },
    { t: 'upd', c: 'leaves', id: recId, data: { status: 'approved' }, __by: P.id }
  ]);
  const m = r12.json && r12.json.results;
  chk('S11 دستهٔ مخلوط: ۲۰ + سالم ok + جعلی field_denied', r12.status === 200 && m && m.length === 2 && m[0].ok && !m[1].ok && m[1].code === 'field_denied', JSON.stringify(r12.json).slice(0, 140));

  /* S12 — disk: وضعیتِ نهایی */
  await sleep(2500);
  const finalSrc = JSON.parse(fs.readFileSync(storeFile, 'utf8'));
  const fin = (finalSrc.leaves || []).find(l => l.id === recId);
  /* S9 مدیر approved کرده (S6) و S9 (pending) رد شده — نهایی = approved */
  chk('S12 disk: رکوردِ نهایی approved (مدیر) + reasonِ دستهٔ مخلوط', fin && fin.status === 'approved' && fin.reason === 'دستهٔ مخلوط — سالم', JSON.stringify(fin).slice(0, 160));
  const forgedIns = (finalSrc.leaves || []).filter(l => l.student_id === KID && l.reason === 'دور 85 P0-1' && l.status === 'approved' && !l.kind);
  chk('S12b رکوردِ جعلیِ S2 ساخته نشده است', forgedIns.length === 0);

  /* ── PR#2 (دور ۸۸) — موجه‌سازیِ سریعِ ولی: مالکیت + اعلانِ مدیر ── */

  /* S14 — والد: ins leave برای دانش‌آموزِ دیگر (همان مدرسه) → out_of_scope */
  const r14 = await syncOps(cP, [{ t: 'ins', c: 'leaves', data: { school_id: 1, student_id: FOREIGN.student_id, from_date: '2026-09-12', to_date: '2026-09-12', reason: 'PR2-S14', status: 'pending', created_at: '2026-09-08' }, __by: P.id }]);
  const s14 = r14.json && r14.json.results && r14.json.results[0];
  chk('S14 والد: ins leave برای دانش‌آموزِ بی‌ربط → 403 out_of_scope', r14.status === 403 && s14 && !s14.ok && s14.code === 'out_of_scope', JSON.stringify(r14.json).slice(0, 140));

  /* S15 — والد: ins اعلان برای مدیر → out_of_scope (مبنایِ هُکِ سروری) */
  const r15 = await syncOps(cP, [{ t: 'ins', c: 'notifications', data: { user_id: M1.id, school_id: 1, type: 'leave', title: 'PR2-S15', body: 'x', link: 'leaves', read: 0, created_at: '2026-09-08' }, __by: P.id }]);
  const s15 = r15.json && r15.json.results && r15.json.results[0];
  chk('S15 والد: ins اعلان (student_id ندارد) → 403 out_of_scope', r15.status === 403 && s15 && !s15.ok && s15.code === 'out_of_scope', JSON.stringify(r15.json).slice(0, 140));

  /* S16 — والد: ins leaveِ pending برای فرزندِ خودش → ok + اعلانِ مدیر از سمتِ سرور */
  const notifsBefore = (JSON.parse(fs.readFileSync(storeFile, 'utf8')).notifications || []).length;
  const r16 = await syncOps(cP, [{ t: 'ins', c: 'leaves', data: { school_id: 1, student_id: KID, from_date: '2026-09-13', to_date: '2026-09-13', reason: 'PR2-S16', status: 'pending', created_at: '2026-09-08' }, __by: P.id }]);
  const s16 = r16.json && r16.json.results && r16.json.results[0];
  chk('S16a والد: ins leaveِ pending برای فرزند → ok', r16.status === 200 && s16 && s16.ok, JSON.stringify(r16.json).slice(0, 140));
  let srvNotif = null;
  for (let i = 0; i < 10 && !srvNotif; i++) {
    await sleep(1000);
    const cand = (JSON.parse(fs.readFileSync(storeFile, 'utf8')).notifications || []);
    srvNotif = cand.find(n => n.user_id === M1.id && n.type === 'leave' && n.link === 'leaves' && String(n.body || '').indexOf('2026-09-13') > -1);
  }
  chk('S16b اعلانِ مدیر روی disk نشست (ساخته‌شده از سمتِ سرور)', !!srvNotif);

  /* S17 — مدیر: ins leaveِ pending (درخواستِ خودِ مدیر) → ok ولی بدونِ اعلان */
  const notifsMid = (JSON.parse(fs.readFileSync(storeFile, 'utf8')).notifications || []).length;
  const r17 = await syncOps(cM, [{ t: 'ins', c: 'leaves', data: { school_id: 1, student_id: KID, from_date: '2026-09-14', to_date: '2026-09-14', reason: 'PR2-S17', status: 'pending', created_at: '2026-09-08' }, __by: M1.id }]);
  const s17 = r17.json && r17.json.results && r17.json.results[0];
  chk('S17a مدیر: ins leaveِ pending → ok', r17.status === 200 && s17 && s17.ok, JSON.stringify(r17.json).slice(0, 140));
  await sleep(2500);
  const notifsAfter = (JSON.parse(fs.readFileSync(storeFile, 'utf8')).notifications || []).length;
  chk('S17b اعلانِ تازه‌ای برایِ درخواستِ مدیر ساخته نشده', notifsAfter === notifsMid, notifsAfter + ' vs ' + notifsMid);

  /* ══ Round 89 — جریان‌هایِ همگام‌سازیِ نقش‌هایِ غیرمدیر (چت/تکلیف/نشان/ردِ فرزند) ══ */
  const STU = src.users.find(u => u.role === 'student' && u.school_id === 1);
  const T1CLASS = (src.classes || []).find(c => c.school_id === 1 &&
    (c.homeroom_teacher_id === T1.id || (src.schedule || []).some(s => s.class_id === c.id && s.teacher_id === T1.id)));
  const FOREIGN_CLASS = (src.classes || []).find(c => c.school_id === 1 && c.id !== (T1CLASS && T1CLASS.id) &&
    c.homeroom_teacher_id !== T1.id && !(src.schedule || []).some(s => s.class_id === c.id && s.teacher_id === T1.id));
  const T2 = src.users.find(u => u.role === 'teacher' && u.school_id === 1 && u.id !== T1.id);
  chk('R89 حساب‌هایِ تست موجودند (دانش‌آموز/کلاسِ دبیر/کلاسِ بی‌ربط/دبیرِ دوم)', !!(STU && T1CLASS && FOREIGN_CLASS && T2));
  const cST = await login(STU);
  chk('R89 نشستِ دانش‌آموز ساخته شد', !!cST);

  /* S18 — والد: چت (از خودش) → ok */
  const r18 = await syncOps(cP, [{ t: 'ins', c: 'messages', data: { school_id: 1, from_id: P.id, to_id: M1.id, body: 'R89-S18', created_at: '2026-09-08' }, __by: P.id }]);
  const s18 = r18.json && r18.json.results && r18.json.results[0];
  chk('S18 والد: چت (from خود) → ok', r18.status === 200 && s18 && s18.ok, JSON.stringify(r18.json).slice(0, 140));

  /* S19 — والد: چتِ جعلی (from کاربرِ دیگر) → out_of_scope */
  const r19 = await syncOps(cP, [{ t: 'ins', c: 'messages', data: { school_id: 1, from_id: STU.id, to_id: M1.id, body: 'R89-S19 forged', created_at: '2026-09-08' }, __by: P.id }]);
  const s19 = r19.json && r19.json.results && r19.json.results[0];
  chk('S19 والد: چت با from_idِ دیگر → 403 out_of_scope', r19.status === 403 && s19 && !s19.ok && s19.code === 'out_of_scope', JSON.stringify(r19.json).slice(0, 140));

  /* S20 — دبیر: تکلیفِ کلاسِ خودش → ok · کلاسِ بی‌ربط → out_of_scope */
  const r20 = await syncOps(cT, [{ t: 'ins', c: 'hw_assignments', data: { school_id: 1, class_id: T1CLASS.id, subject_id: 1, title: 'R89-S20', description: '', due_date: '2026-09-15', created_by: T1.id, created_at: '2026-09-08' }, __by: T1.id }]);
  const s20 = r20.json && r20.json.results && r20.json.results[0];
  chk('S20a دبیر: تکلیفِ کلاسِ خودش → ok', r20.status === 200 && s20 && s20.ok, JSON.stringify(r20.json).slice(0, 140));
  const r20b = await syncOps(cT, [{ t: 'ins', c: 'hw_assignments', data: { school_id: 1, class_id: FOREIGN_CLASS.id, subject_id: 1, title: 'R89-S20b', description: '', due_date: '2026-09-15', created_by: T1.id, created_at: '2026-09-08' }, __by: T1.id }]);
  const s20b = r20b.json && r20b.json.results && r20b.json.results[0];
  chk('S20b دبیر: تکلیفِ کلاسِ بی‌ربط → 403 out_of_scope', r20b.status === 403 && s20b && !s20b.ok && s20b.code === 'out_of_scope', JSON.stringify(r20b.json).slice(0, 140));

  /* S21 — دبیر: نوبتِ مشاورهٔ خودش → ok · نوبتِ دبیرِ دیگر → out_of_scope */
  const r21 = await syncOps(cT, [{ t: 'ins', c: 'meeting_slots', data: { school_id: 1, teacher_id: T1.id, date: '2026-09-15', start_time: '15:00', duration: 30, location: 'test', status: 'open', parent_id: null, student_id: null, created_at: '2026-09-08' }, __by: T1.id }]);
  const s21 = r21.json && r21.json.results && r21.json.results[0];
  chk('S21a دبیر: نوبتِ خودش → ok', r21.status === 200 && s21 && s21.ok, JSON.stringify(r21.json).slice(0, 140));
  const r21b = await syncOps(cT, [{ t: 'ins', c: 'meeting_slots', data: { school_id: 1, teacher_id: T2.id, date: '2026-09-15', start_time: '15:30', duration: 30, location: 'test', status: 'open', parent_id: null, student_id: null, created_at: '2026-09-08' }, __by: T1.id }]);
  const s21b = r21b.json && r21b.json.results && r21b.json.results[0];
  chk('S21b دبیر: نوبتِ دبیرِ دیگر → 403 out_of_scope', r21b.status === 403 && s21b && !s21b.ok && s21b.code === 'out_of_scope', JSON.stringify(r21b.json).slice(0, 140));

  /* S22 — دانش‌آموز: چت (از خودش) → ok */
  const r22 = await syncOps(cST, [{ t: 'ins', c: 'messages', data: { school_id: 1, from_id: STU.id, to_id: T1.id, body: 'R89-S22', created_at: '2026-09-08' }, __by: STU.id }]);
  const s22 = r22.json && r22.json.results && r22.json.results[0];
  chk('S22 دانش‌آموز: چت (from خود) → ok', r22.status === 200 && s22 && s22.ok, JSON.stringify(r22.json).slice(0, 140));

  /* S23 — نشانِ خوانده‌شدن: مدیر یک اعلان برایِ والد می‌سازد، والد read می‌کند → روی disk */
  const r23 = await syncOps(cM, [{ t: 'ins', c: 'notifications', data: { user_id: P.id, school_id: 1, type: 'announcement', title: 'R89-S23', body: 'x', link: 'record', read: 0, created_at: '2026-09-08' }, __by: M1.id }]);
  let pNotifId = null;
  for (let i = 0; i < 10 && pNotifId == null; i++) {
    await sleep(1000);
    const cand = (JSON.parse(fs.readFileSync(storeFile, 'utf8')).notifications || []);
    pNotifId = ((cand.find(n => n.title === 'R89-S23')) || {}).id || null;
  }
  chk('S23a اعلانِ والد روی disk نشست', pNotifId != null);
  const r23b = pNotifId != null ? await syncOps(cP, [{ t: 'upd', c: 'notifications', id: pNotifId, data: { read: 1 }, __by: P.id }]) : { status: 0 };
  const s23b = r23b.json && r23b.json.results && r23b.json.results[0];
  chk('S23b والد: upd اعلانِ خودش (read) → ok', r23b.status === 200 && s23b && s23b.ok, JSON.stringify(r23b.json).slice(0, 140));
  let readOk = false;
  for (let i = 0; i < 10 && !readOk; i++) {
    await sleep(1000);
    readOk = (JSON.parse(fs.readFileSync(storeFile, 'utf8')).notifications || []).some(n => n.id === pNotifId && n.read === 1);
  }
  chk('S23c پرچمِ read روی disk نشست', readOk);
  const r23d = await syncOps(cP, [{ t: 'upd', c: 'notifications', id: 1, data: { read: 1 }, __by: P.id }]);
  const s23d = r23d.json && r23d.json.results && r23d.json.results[0];
  chk('S23d والد: upd اعلانِ بی‌ربط (id=1) → 403', r23d.status === 403 && s23d && !s23d.ok, JSON.stringify(r23d.json).slice(0, 140));

  /* S24 — ردِ فرزند: corrections (فرزندِ خودش) → ok + اعلانِ مدیر از هُک */
  const r24 = await syncOps(cP, [{ t: 'ins', c: 'corrections', data: { school_id: 1, student_id: KID, parent_id: P.id, parent_nid: P.national_id, message: 'R89-S24', status: 'open', created_at: '2026-09-08' }, __by: P.id }]);
  const s24 = r24.json && r24.json.results && r24.json.results[0];
  chk('S24a والد: corrections برایِ فرزندِ خودش → ok', r24.status === 200 && s24 && s24.ok, JSON.stringify(r24.json).slice(0, 140));
  let corrNotif = null;
  for (let i = 0; i < 10 && !corrNotif; i++) {
    await sleep(1000);
    const cand = (JSON.parse(fs.readFileSync(storeFile, 'utf8')).notifications || []);
    corrNotif = cand.find(n => n.user_id === M1.id && n.type === 'announcement' && String(n.title || '').indexOf('اصلاح اطلاعات ولی') > -1);
  }
  chk('S24b هُک: اعلانِ «درخواست اصلاح اطلاعات ولی» روی disk نشست', !!corrNotif);

  /* S25 — هُکِ چت: پیامِ S18 (والد→مدیر) → دقیقاً یک اعلانِ chat برایِ مدیر */
  await sleep(1500);
  const chatNotifs = (JSON.parse(fs.readFileSync(storeFile, 'utf8')).notifications || []).filter(n => n.user_id === M1.id && n.type === 'chat' && String(n.body || '').indexOf('R89-S18') > -1);
  chk('S25 هُکِ چت: مدیر دقیقاً یک اعلانِ پیامِ والد گرفت', chatNotifs.length === 1, 'count=' + chatNotifs.length);

  /* S26 — جعلِ parent_link: parent_idِ کاربرِ دیگر (فرزندِ خودش) → out_of_scope */
  const r26 = await syncOps(cP, [{ t: 'ins', c: 'parent_links', data: { parent_id: STU.id, student_id: KID }, __by: P.id }]);
  const s26 = r26.json && r26.json.results && r26.json.results[0];
  chk('S26 والد: parent_link با parent_idِ دیگر → 403 out_of_scope', r26.status === 403 && s26 && !s26.ok && s26.code === 'out_of_scope', JSON.stringify(r26.json).slice(0, 140));

  /* Round 90 — S27: upd اعلانِ خود فقط پرچمِ read می‌پذیرد */
  const r27 = pNotifId != null ? await syncOps(cP, [{ t: 'upd', c: 'notifications', id: pNotifId, data: { read: 1, title: 'R90-S27 forged' }, __by: P.id }]) : { status: 0 };
  const s27 = r27.json && r27.json.results && r27.json.results[0];
  chk('S27 والد: upd اعلانِ خود با فیلدِ غیر-read → 403', r27.status === 403 && s27 && !s27.ok && s27.code === 'out_of_scope', JSON.stringify(r27.json).slice(0, 140));
  await sleep(1500);
  const n27 = (JSON.parse(fs.readFileSync(storeFile, 'utf8')).notifications || []).find(n => n.id === pNotifId);
  chk('S27b عنوانِ اعلان روی disk دست‌نخورده است', n27 && n27.title === 'R89-S23', n27 && n27.title);

  /* S13 — آدیت */
  await sleep(2500);
  const audit = fs.existsSync(auditFile) ? fs.readFileSync(auditFile, 'utf8') : '';
  const evLines = audit.split('\n').filter(l => l.indexOf('sync_field_denied') > -1);
  chk('S13 آدیت: sync_field_denied ثبت شده (بدونِ شمارهٔ تلفن)', evLines.length >= 2 && evLines.every(l => l.indexOf('0999') === -1), 'lines=' + evLines.length);

  srv.kill('SIGKILL');
  console.log('\nserver12: ' + pass + '/' + (pass + fail) + ' سبز' + (fail ? ' — شکست: ' + errors.join(' | ') : '  ✅'));
  process.exit(fail ? 1 : 0);
}
main().catch(e => { console.error('FATAL', e); process.exit(1); });
