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
  chk('S8 دبیر: ins leaves → 403 role_denied', r9.status === 403 && s9 && !s9.ok && s9.code === 'role_denied', JSON.stringify(r9.json).slice(0, 140));

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
