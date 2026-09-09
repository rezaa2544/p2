/* ─────────────────────────────────────────────────────────────
   tracing-performance.js — سربارِ ردیابی (P-Trace)
   ─────────────────────────────────────────────────────────────
   همیشه اجرا می‌شود (بدونِ Jaeger؛ اسپن‌ها به صادرکنندهٔ حافظه می‌روند).
   PERF-* آستانه‌ها عامدانه گشادند (نه‌فلکی در CI): هدف اثباتِ «نه‌آسیب‌شناختی»
   است؛ عددهایِ واقعی چاپ می‌شوند تا در docs/TRACING_SETUP.md ثبت شوند.
   ───────────────────────────────────────────────────────────── */
'use strict';
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

const ROOT = path.join(__dirname, '..');
const tracing = require('../server/tracing.js');

let okc = 0, failc = 0;
const fails = [];
function chk(name, cond, extra) {
  if (cond) { okc++; console.log('  ✅ ' + name); }
  else { failc++; fails.push(name + (extra ? ' — ' + extra : '')); console.log('  ❌ ' + name + (extra ? ' — ' + extra : '')); }
}
const pct = (a, p) => a.slice().sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(a.length * p))];
function req(port, p, method, body, headers) {
  return new Promise((res, rej) => {
    const t0 = process.hrtime.bigint();
    const r = http.request({ host: '127.0.0.1', port: port, path: p, method: method || 'GET', headers: headers || {} }, rs => {
      let b = '';
      rs.on('data', c => { b += c; });
      rs.on('end', () => res({ status: rs.statusCode, headers: rs.headers, body: b, ms: Number(process.hrtime.bigint() - t0) / 1e6 }));
    });
    r.on('error', rej);
    if (body) r.write(body);
    r.end();
  });
}

(async () => {
  console.log('\n▸ P-Trace — سربارِ ردیابی');

  /* ── اسپنِ خالص ── */
  const mem = [];
  tracing.initTracing({ exporter: { export: (spans, cb) => { mem.push(...spans); cb({ code: 0 }); }, shutdown: async () => {} } });
  const N = 2000;
  const ds = [];
  for (let i = 0; i < N; i++) {
    const t0 = process.hrtime.bigint();
    await tracing.withSpan('perf.probe', { i: i }, async () => {});
    ds.push(Number(process.hrtime.bigint() - t0) / 1e6);
  }
  const avg = ds.reduce((a, b) => a + b, 0) / ds.length, p99 = pct(ds, 0.99);
  console.log(`    اسپن: میانگین ${avg.toFixed(3)}ms — صدکِ ۹۹ ${p99.toFixed(3)}ms (n=${N})`);
  chk('PERF-a میانگینِ اسپن زیرِ ۱ms', avg < 1, 'avg=' + avg.toFixed(3) + 'ms');
  chk('PERF-b صدکِ ۹۹ِ اسپن زیرِ ۱۰ms', p99 < 10, 'p99=' + p99.toFixed(3) + 'ms');
  chk('PERF-c هر ۲۰۰۰ اسپن صادر شد', mem.length === N, 'n=' + mem.length);
  chk('PERF-d بیرونِ اسپن trace_id تهی است', tracing.getTraceId() === null);
  await tracing.__resetForTests();

  /* ── تأخیرِ HTTP سرورِ واقعی (ردیابیِ روشن، بدونِ Jaeger) ── */
  const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-perf-'));
  const PORT = 18771;
  const env = Object.assign({}, process.env, {
    PORT: String(PORT), HOST: '127.0.0.1',
    PAYESH_STORE: path.join(TMP, 's.json'), PAYESH_AUDIT: path.join(TMP, 'a.log'),
    PAYESH_KEY: path.join(TMP, 'k'), PAYESH_DEMO_CODE: '1', TRACING_ENABLED: 'true'
  });
  fs.copyFileSync(path.join(ROOT, 'server', 'data', 'payesh.json'), env.PAYESH_STORE);
  const proc = spawn(process.execPath, ['server/index.js'], { cwd: ROOT, env, stdio: 'pipe' });
  const kill = () => { try { proc.kill('SIGKILL'); } catch (e) {} try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {} };
  process.on('exit', kill);
  await new Promise(r => setTimeout(r, 2500));
  try {
    const hs = [];
    for (let i = 0; i < 30; i++) hs.push((await req(PORT, '/api/health')).ms);
    const hp99 = pct(hs, 0.99), hp50 = pct(hs, 0.5);
    console.log(`    /api/health: میانه ${hp50.toFixed(1)}ms — صدکِ ۹۹ ${hp99.toFixed(1)}ms (n=30)`);
    chk('PERF-e صدکِ ۹۹ سلامت زیرِ ۱۰۰۰ms', hp99 < 1000, 'p99=' + hp99.toFixed(1) + 'ms');
    const ss = [];
    let hdrOk = 0;
    for (let i = 0; i < 5; i++) {
      const r = await req(PORT, '/api/sync', 'POST', JSON.stringify({ ops: [] }), { 'content-type': 'application/json' });
      ss.push(r.ms);
      if (r.headers['x-trace-id'] && /^[0-9a-f]{32}$/.test(r.headers['x-trace-id'])) hdrOk++;
    }
    console.log(`    /api/sync(401): صدکِ ۹۹ ${pct(ss, 0.99).toFixed(1)}ms (n=5)`);
    chk('PERF-f مسیرِ ردیابی‌شده سرآیندِ معتبر دارد', hdrOk === 5, 'n=' + hdrOk);
    chk('PERF-g صدکِ ۹۹ مسیرِ ردیابی‌شده زیرِ ۱۰۰۰ms', pct(ss, 0.99) < 1000);
  } finally {
    kill();
  }

  console.log(`\n  جمع: ${okc} موفق، ${failc} ناموفق از ${okc + failc}`);
  if (failc) { console.log('  مواردِ ناموفق:\n   - ' + fails.join('\n   - ')); process.exit(1); }
  process.exit(0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
