#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   tests/truncation-telemetry.js — پ۳ بستهٔ اندازه‌پذیری
   بخش A: سه کانترِ بریدگی/resume (کاردینالیتهٔ کران‌دار + نمایش /metrics)
   بخش B: خودآزمونِ هارنسِ bench-reports-scale (پارس/آمار/قالب+برچسب مقیاس)
   اجرا: node tests/truncation-telemetry.js
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.join(__dirname, '..');
delete process.env.DATABASE_URL;

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'payesh-teltest-'));
process.on('exit', () => { try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {} });

const ROW_CAP = 300;
process.env.PAYESH_PULL_MAX_ROWS = String(ROW_CAP);
process.env.PAYESH_PULL_MAX_BYTES = String(8 * 1024 * 1024);
fs.copyFileSync(path.join(ROOT, 'server', 'data', 'payesh.json'), path.join(TMP, 'store.json'));
process.env.PAYESH_STORE = path.join(TMP, 'store.json');
process.env.PAYESH_AUDIT = path.join(TMP, 'audit.log');
process.env.PAYESH_KEY = path.join(TMP, 'jwt.key');
process.env.PAYESH_DEMO_CODE = '1';

const { server, store } = require(path.join(ROOT, 'server', 'index.js'));

let BASE = '';
let pass = 0, fail = 0;
async function test(name, fn) {
  try { await fn(); pass++; console.log('  ✅ ' + name); }
  catch (err) { fail++; console.error('  ❌ ' + name + '\n     ' + err.message); }
}

async function loginCookie(user) {
  const phone = String(user.phone).replace(/[\s\-()]/g, '');
  const r0 = await fetch(BASE + '/api/auth/send-code', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone }) });
  const j0 = await r0.json();
  const r1 = await fetch(BASE + '/api/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, code: j0.demo_code, national_id: String(user.national_id) }) });
  assert.strictEqual(r1.status, 200);
  return (r1.headers.get('set-cookie') || '').match(/payesh_session=[^;]+/)[0];
}

/** total یک کانتر از متن /metrics — جمعِ همهٔ سری‌ها یا سریِ یک برچسب. */
function counterTotal(metricsText, name, labelPair) {
  let sum = 0;
  for (const line of metricsText.split('\n')) {
    if (!line.startsWith(name)) continue;
    if (labelPair && !line.includes(labelPair)) continue;
    const v = Number(line.trim().split(/\s+/).pop());
    if (Number.isFinite(v)) sum += v;
  }
  return sum;
}

async function scrape(cookie) {
  const r = await fetch(BASE + '/metrics', { headers: { Cookie: cookie } });
  assert.strictEqual(r.status, 200);
  return r.text();
}

async function main() {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  BASE = 'http://127.0.0.1:' + server.address().port;

  console.log('\n▸ بخش A — کانترهای بریدگی/resume');
  const mgr = store.users.find(u => u.role === 'manager' && u.school_id === 1);
  const cookie = await loginCookie(mgr);

  /* دلتای عظیم مصنوعی (الگوی bounded-delta-resume) */
  const NOW = Date.now();
  let touched = 0;
  for (const a of store.attendance) {
    if (a.school_id === 1) { a.updated_at = new Date(NOW - 40 * 1000 + (touched % 1000)).toISOString(); touched++; }
  }
  assert.ok(touched > ROW_CAP, 'پیش‌شرط بریدگی');
  const SINCE = encodeURIComponent(new Date(NOW - 5 * 60 * 1000).toISOString());

  await test('دلتای بریده هر دو کانترِ partial و full_snapshot_required را برای attendance جلو می‌برد', async () => {
    const before = await scrape(cookie);
    const p0 = counterTotal(before, 'payesh_pull_partial_collections_total', 'collection="attendance"');
    const f0 = counterTotal(before, 'payesh_pull_full_snapshot_required_total', 'collection="attendance"');
    const r = await fetch(BASE + '/api/v1/pull?since=' + SINCE, { headers: { Cookie: cookie } });
    const body = await r.json();
    assert.ok((body.full_snapshot_required_collections || []).includes('attendance'), 'پیش‌شرط: پرچم');
    const after = await scrape(cookie);
    const p1 = counterTotal(after, 'payesh_pull_partial_collections_total', 'collection="attendance"');
    const f1 = counterTotal(after, 'payesh_pull_full_snapshot_required_total', 'collection="attendance"');
    assert.ok(p1 >= p0 + 1, `partial جلو نرفت: ${p0}→${p1}`);
    assert.ok(f1 >= f0 + 1, `full_snapshot_required جلو نرفت: ${f0}→${f1}`);
  });

  await test('snapshot ‏resume=1 کانترِ resume را برای همان مجموعه جلو می‌برد؛ بدون resume=1 نه', async () => {
    const before = await scrape(cookie);
    const r0v = counterTotal(before, 'payesh_pull_resume_snapshot_total', 'collection="attendance"');
    await fetch(BASE + '/api/v1/pull?collections=attendance&resume=1', { headers: { Cookie: cookie } });
    const mid = await scrape(cookie);
    const r1v = counterTotal(mid, 'payesh_pull_resume_snapshot_total', 'collection="attendance"');
    assert.ok(r1v >= r0v + 1, `resume جلو نرفت: ${r0v}→${r1v}`);
    await fetch(BASE + '/api/v1/pull?collections=attendance', { headers: { Cookie: cookie } });
    const after = await scrape(cookie);
    const r2v = counterTotal(after, 'payesh_pull_resume_snapshot_total', 'collection="attendance"');
    assert.strictEqual(r2v, r1v, 'بدون resume=1 نباید بشمارد');
  });

  await test('دلتای resume=1 (نه snapshot) کانترِ resume را نمی‌شمارد', async () => {
    const before = await scrape(cookie);
    const r0v = counterTotal(before, 'payesh_pull_resume_snapshot_total');
    await fetch(BASE + '/api/v1/pull?since=' + encodeURIComponent(new Date(NOW + 3600e3).toISOString()) + '&resume=1',
      { headers: { Cookie: cookie } });
    const after = await scrape(cookie);
    assert.strictEqual(counterTotal(after, 'payesh_pull_resume_snapshot_total'), r0v,
      'resume فقط برای snapshot معنا دارد');
  });

  await test('کاردینالیته کران‌دار: مجموعهٔ غیرسنگین در resume برچسب other می‌گیرد نه نامِ خودش', async () => {
    await fetch(BASE + '/api/v1/pull?collections=announcements&resume=1', { headers: { Cookie: cookie } });
    const text = await scrape(cookie);
    assert.ok(!text.includes('payesh_pull_resume_snapshot_total{collection="announcements"'),
      'برچسبِ آزاد = انفجار کاردینالیته');
    assert.ok(counterTotal(text, 'payesh_pull_resume_snapshot_total', 'collection="other"') >= 1,
      'به‌جای آن باید other شمرده شود');
  });

  await test('هر سه کانتر با HELP/TYPE در /metrics نمایان‌اند', async () => {
    const text = await scrape(cookie);
    for (const n of ['payesh_pull_partial_collections_total',
                     'payesh_pull_full_snapshot_required_total',
                     'payesh_pull_resume_snapshot_total']) {
      assert.ok(text.includes('# TYPE ' + n + ' counter'), n + ' غایب');
    }
  });

  console.log('\n▸ بخش B — خودآزمون هارنس bench-reports-scale');
  const bench = require(path.join(ROOT, 'tools', 'bench-reports-scale.js'));

  await test('parseArgs: پیش‌فرض‌ها و پرچم‌ها', async () => {
    const d = bench.parseArgs([]);
    assert.deepStrictEqual(d.roles, ['manager', 'office', 'superadmin']);
    assert.strictEqual(d.concurrency, 10); assert.strictEqual(d.iterations, 50);
    const c = bench.parseArgs(['--roles=manager', '--concurrency=4', '--iterations=20']);
    assert.deepStrictEqual(c.roles, ['manager']);
    assert.strictEqual(c.concurrency, 4); assert.strictEqual(c.iterations, 20);
  });

  await test('summarize: p50/p95 درست (۱..۱۰۰ ⇒ p50=50, p95=95)', async () => {
    const arr = Array.from({ length: 100 }, (_, i) => i + 1);
    const s = bench.summarize(arr);
    assert.strictEqual(s.p50, 50); assert.strictEqual(s.p95, 95); assert.strictEqual(s.max, 100);
  });

  await test('formatResult: برچسبِ مقیاس measured اجباری است (Target ≠ Measured)', async () => {
    assert.throws(() => bench.formatResult({ scaleLabel: '', rows: [] }), /measured/i);
    assert.throws(() => bench.formatResult({ scaleLabel: 'scale=0.01 (target)', rows: [] }), /measured/i);
    const out = bench.formatResult({ scaleLabel: 'measured@ grades=100', rows: [
      { report: 'academic_page', role: 'manager', n: 10, p50: 1.1, p95: 2.2, max: 3.3 }] });
    assert.ok(out.includes('measured@ grades=100') && out.includes('academic_page'));
  });

  await test('خود-skip بدون DATABASE_URL: exit=0 و پیامِ صریحِ همین دلیل (نه skip دیگری)', async () => {
    const cp = require('child_process');
    const env = { ...process.env }; delete env.DATABASE_URL;
    const out = cp.execFileSync(process.execPath, [path.join(ROOT, 'tools', 'bench-reports-scale.js')],
      { env, encoding: 'utf8', timeout: 30000 });
    /* سنجهٔ دقیق: باید skip به‌دلیلِ نبودِ DATABASE_URL باشد؛ جهشِ حذفِ این
       گارد یا به خطا می‌خورد (pg موجود) یا به skipِ «pg نصب نیست» می‌افتد
       که این عبارت را ندارد. */
    assert.ok(out.includes('DATABASE_URL'), 'پیام skip باید دلیل (DATABASE_URL) را بگوید: ' + out);
  });

  console.log('\n────────────────────────────────────────────────────');
  console.log(`truncation-telemetry: ${pass} سبز / ${fail} قرمز ${fail === 0 ? '✅' : '❌'}`);
  server.close();
  process.exit(fail === 0 ? 0 : 1);
}

main().catch(e => { console.error(e); process.exit(1); });
