#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   server11-sms.js — درگاهِ پیامک: گامِ ۱ (AD 81.1 / docs/PLAN_SMS_GATEWAY.md)
   POST /api/sms/send رویِ سرورِ واقعی — بدونِ in-configure:
     S0 boot + ورودِ superadmin
     S1 بدونِ env → 503 sms_not_configured (فرزندِ جدا)
     S2 ارسالِ واقعیِ mock: log×2 + کسرِ کیف + صف→sent
     S3 ایدمپوتانس: تکرار → هیچ دوباره (log/کیف/ارسال)
     S4 شکستِ جزئی: «همه یا هیچ» + logِ failed + بدونِ کسر
     S5 سقفِ روزانه (فرزندِ جدا: MAX_PER_DAY=1) → 429 daily_cap + sms_cap
     S6 نقش: manager → 403
     S7 آدیتِ sms_send بدونِ phone
     S8 dry-run (فرزندِ جدا): منطق واقعی، زنگِ درگاه نه (dry-*)
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'payesh-s11-'));
const REAL = path.join(ROOT, 'server', 'data', 'payesh.json');
const T_STORE = path.join(TMP, 'store.json');
const T_AUDIT = path.join(TMP, 'audit.log');
fs.copyFileSync(REAL, T_STORE);
process.env.PAYESH_STORE = T_STORE;
process.env.PAYESH_AUDIT = T_AUDIT;
process.env.PAYESH_KEY = path.join(TMP, 'key');
process.env.PAYESH_DEMO_CODE = '1';
process.env.PAYESH_SMS_PROVIDER = 'mock';
delete process.env.PAYESH_SMS_DRY_RUN;
delete process.env.PAYESH_SMS_MOCK_FAIL;

const { server, store } = require(path.join(ROOT, 'server', 'index.js'));
let BASE = null;

async function req(p, m = 'GET', body = null, cookie = null){
  const h = {};
  if(body !== null) h['Content-Type'] = 'application/json';
  if(cookie) h['Cookie'] = cookie;
  const r = await fetch(BASE + p, { method: m, headers: h, body: body === null ? null : JSON.stringify(body) });
  const t = await r.text();
  let j = null; try { j = JSON.parse(t); } catch (e) {}
  return { status: r.status, j, headers: r.headers };
}
function cookieOf(r){
  const c = r.headers.get('set-cookie') || '';
  const m = c.match(/payesh_session=[^;]+/);
  return m ? m[0] : null;
}
async function loginAs(user){
  let r = await req('/api/auth/send-code', 'POST', { phone: String(user.phone).replace(/\D/g, '') });
  const j = r.j || {};
  const code = j.demo_code != null ? String(j.demo_code) : (user.otp_code || '');
  r = await req('/api/auth/login', 'POST', { phone: String(user.phone).replace(/\D/g, ''), code, national_id: user.national_id != null ? String(user.national_id) : null }, cookieOf(r));
  return { cookie: cookieOf(r), r, j: r.j };
}
const PARENTS = [17, 1025];
const PHONES = ['09998544082', '09990001234', '09992630039'];
const SA = store.users.find(u => u.role === 'superadmin');
const MGR = store.users.find(u => u.role === 'manager' && u.school_id === 1);
let passed = 0, failed = 0;
async function check(name, fn){
  try { await fn(); passed++; console.log('  PASS ' + name); }
  catch (e) { failed++; console.log('  FAIL ' + name + ' :: ' + (e && e.message || e)); }
}
const assert = require('assert');

(async () => {
  await new Promise(res => server.listen(0, () => { BASE = 'http://localhost:' + server.address().port; res(); }));

  /* ── S0 boot + ورود ── */
  let saCookie = null;
  await check('S0 superadmin می‌تواند وارد شود', async () => {
    const a = await loginAs(SA);
    assert.ok(a.cookie, 'cookie');
    const me = await req('/api/auth/me', 'GET', null, a.cookie);
    assert.strictEqual(me.status, 200);
    assert.strictEqual(me.j.user.role, 'superadmin');
    saCookie = a.cookie;
  });
  const mgr = await loginAs(MGR);

  /* ── S1 بدونِ env → 503 (فرزندِ جدا: env در آغازِ ماژول خوانده می‌شود) ── */
  await check('S1 بدونِ PAYESH_SMS_PROVIDER → 503 sms_not_configured', async () => {
    const c = spawnSync('node', [path.join(ROOT, 'tests', 'server11-child.js'), ROOT, 'nocfg'], { encoding: 'utf8' });
    const out = c.stdout || '';
    const st = (out.match(/STATUS:(\d+)/) || [])[1];
    const resp = (out.match(/RESP:(.+)/) || [])[1];
    assert.strictEqual(st, '503', 'status: ' + st + ' ' + (c.stderr || ''));
    assert.ok(resp.indexOf('sms_not_configured') > -1, 'resp: ' + resp);
  });

  /* ── S2 ارسالِ واقعی (mock): صفِ seed id=1 (2 ولی × ۲ قطعه = ۴) ── */
  const wBefore = store.sms_wallet.find(x => x.school_id === 1).balance;
  await check('S2 ارسالِ واقعی: ۲ log + کسرِ کیف + صف→sent', async () => {
    const r = await req('/api/sms/send', 'POST', { queue_ids: [1] }, saCookie);
    assert.strictEqual(r.status, 200, 'status ' + r.status + ' ' + JSON.stringify(r.j));
    assert.strictEqual(r.j.ok, true);
    assert.strictEqual(r.j.sent, 1, 'sent: ' + JSON.stringify(r.j));
    assert.strictEqual(r.j.credits_used, 4, 'credits: ' + JSON.stringify(r.j));
    const w = store.sms_wallet.find(x => x.school_id === 1);
    assert.strictEqual(w.balance, wBefore - 4, 'wallet ' + w.balance + ' != ' + (wBefore - 4));
    const logs = (store.sms_log || []).filter(l => l.queue_id === 1 && l.status === 'sent');
    assert.strictEqual(logs.length, 2, 'logs ' + logs.length);
    assert.deepStrictEqual(logs.map(l => l.user_id).sort(), [17, 1025].sort());
    for(const l of logs){
      assert.ok(String(l.provider_msg).indexOf('mock-') === 0, 'provider_msg ' + l.provider_msg);
      assert.ok(PHONES.indexOf(l.phone) > -1, 'phone in store ok: ' + l.phone);
    }
    const q = store.notify_queue.find(x => x.id === 1);
    assert.strictEqual(q.status, 'sent', 'queue status ' + q.status);
    assert.ok(q.decided_at, 'decided_at');
  });

  /* ── S3 ایدمپوتانس: تکرارِ همان queue_id ── */
  await check('S3 ایدمپوتانس: تکرار هیچ دوباره نمی‌کند', async () => {
    const logsBefore = (store.sms_log || []).length;
    const wBefore2 = store.sms_wallet.find(x => x.school_id === 1).balance;
    const r = await req('/api/sms/send', 'POST', { queue_ids: [1] }, saCookie);
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.j.sent, 0, 'sent ' + JSON.stringify(r.j));
    assert.strictEqual(r.j.credits_used, 0, 'credits ' + JSON.stringify(r.j));
    assert.strictEqual(r.j.skipped_already, 1, 'skipped ' + JSON.stringify(r.j));
    assert.strictEqual(store.sms_log.length, logsBefore, 'no new logs');
    assert.strictEqual(store.sms_wallet.find(x => x.school_id === 1).balance, wBefore2, 'no double debit');
  });

  /* ── S4 شکستِ جزئی: «همه یا هیچ» ── */
  await check('S4 شکستِ یک گیرنده = کلِ آیتم sent نمی‌شود', async () => {
    const maxQ = store.notify_queue.reduce((a, q) => Math.max(a, q.id || 0), 0);
    const item = { id: maxQ + 1, school_id: 1, kind: 'failtest', student_id: 16, class_id: 1,
      parent_ids: [17, 1025], body: 'پیامِ شکست‌آزمایی', parts: 1, status: 'pending', created_at: new Date().toISOString() };
    store.notify_queue.push(item);
    const wBefore3 = store.sms_wallet.find(x => x.school_id === 1).balance;
    process.env.PAYESH_SMS_MOCK_FAIL = '09998544082';
    const r = await req('/api/sms/send', 'POST', { queue_ids: [item.id] }, saCookie);
    delete process.env.PAYESH_SMS_MOCK_FAIL;
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.j.failed, 1, 'failed ' + JSON.stringify(r.j));
    assert.strictEqual(r.j.sent, 0, 'sent ' + JSON.stringify(r.j));
    const q = store.notify_queue.find(x => x.id === item.id);
    assert.strictEqual(q.status, 'pending', 'queue must stay pending, got ' + q.status);
    assert.strictEqual(store.sms_wallet.find(x => x.school_id === 1).balance, wBefore3, 'no debit on fail');
    const fl = (store.sms_log || []).filter(l => l.queue_id === item.id && l.status === 'failed');
    assert.strictEqual(fl.length, 1, 'failed log ' + fl.length);
    assert.ok(fl[0].error, 'error field: ' + JSON.stringify(fl[0]));
    assert.strictEqual(fl[0].phone, null, 'no phone in failed log');
  });

  /* ── S5 سقفِ روزانه (فرزند: MAX_PER_DAY=1, هزینه ۲) ── */
  await check('S5 سقفِ روزانه → 429 daily_cap + آدیتِ sms_cap', async () => {
    const c = spawnSync('node', [path.join(ROOT, 'tests', 'server11-child.js'), ROOT, 'cap'], { encoding: 'utf8' });
    const out = c.stdout || '';
    const st = (out.match(/STATUS:(\d+)/) || [])[1];
    const resp = (out.match(/RESP:(.+)/) || [])[1];
    const aud = (out.match(/AUDIT:(\w+)/) || [])[1];
    assert.strictEqual(st, '429', 'status ' + st + ' ' + (c.stderr || ''));
    assert.ok(resp.indexOf('daily_cap') > -1, 'resp ' + resp);
    assert.strictEqual(aud, 'yes', 'sms_cap audit');
  });

  /* ── S6 نقش: manager → 403 ── */
  await check('S6 manager → 403 (فقطِ superadmin)', async () => {
    assert.ok(mgr.cookie, 'manager login');
    const maxQ = store.notify_queue.reduce((a, q) => Math.max(a, q.id || 0), 0);
    const item = { id: maxQ + 1, school_id: 1, kind: 'roletest', student_id: 16, class_id: 1,
      parent_ids: [17, 1025], body: 'پیامِ نقش‌آزمایی', parts: 1, status: 'pending', created_at: new Date().toISOString() };
    store.notify_queue.push(item);
    const r = await req('/api/sms/send', 'POST', { queue_ids: [item.id] }, mgr.cookie);
    assert.strictEqual(r.status, 403, 'status ' + r.status + ' ' + JSON.stringify(r.j));
    assert.strictEqual(store.notify_queue.find(x => x.id === item.id).status, 'pending');
  });

  /* ── S7 آدیتِ sms_send بدونِ phone ── */
  await check('S7 آدیتِ sms_send وجود دارد و phone ندارد', async () => {
    assert.ok(fs.existsSync(T_AUDIT), 'audit file');
    const lines = fs.readFileSync(T_AUDIT, 'utf8').trim().split('\n');
    const send = lines.filter(l => l.indexOf('sms_send') > -1);
    assert.ok(send.length >= 1, 'sms_send lines ' + send.length);
    for(const ph of PHONES){
      assert.ok(!send.some(l => l.indexOf(ph) > -1), 'phone leaked: ' + ph);
    }
    const failL = lines.filter(l => l.indexOf('sms_fail') > -1);
    assert.ok(failL.length >= 1, 'sms_fail from S4');
    for(const ph of PHONES) assert.ok(!failL.some(l => l.indexOf(ph) > -1), 'phone in sms_fail: ' + ph);
  });

  /* ── S8 dry-run (فرزند: DRY_RUN=1) ── */
  await check('S8 dry-run: منطق واقعی + زنگِ درگاه نه (dry-*)', async () => {
    const c = spawnSync('node', [path.join(ROOT, 'tests', 'server11-child.js'), ROOT, 'dry'], { encoding: 'utf8' });
    const out = c.stdout || '';
    const st = (out.match(/STATUS:(\d+)/) || [])[1];
    const resp = (out.match(/RESP:(.+)/) || [])[1];
    const msg = (out.match(/MSG:(\S+)/) || [])[1];
    assert.strictEqual(st, '200', 'status ' + st + ' ' + (c.stderr || ''));
    const j = JSON.parse(resp);
    assert.strictEqual(j.sent, 1, 'sent ' + resp);
    assert.strictEqual(j.dry_run, true, 'dry_run flag ' + resp);
    assert.strictEqual(msg, 'dry-', 'provider_msg prefix: ' + msg);
  });

  console.log(`\n${passed + failed} بررسی — ${failed === 0 ? '✅ همه سبز' : '❌ شکست: ' + failed}`);
  try { server.close(); } catch (e) {}
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
