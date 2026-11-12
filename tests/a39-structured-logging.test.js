'use strict';
/* tests/a39-structured-logging.test.js — A-39: structured logging +
   correlation id. L1  the logger emits one JSON object per line with
   ts/level/msg; L2  the child binding (request_id/tenant/user) appears on
   every line; L3  the log level gate (LOG_LEVEL=error hides info);
   R1  an HTTP request without x-request-id gets a minted UUID echoed in the
   x-request-id response header; R2  the same id is stable per request
   (two requests = two different ids); R3  the client-supplied
   x-request-id is honored and echoed; R4  no console.log remains anywhere
   in server/ (the full replacement — the literal task requirement).

   Run: node tests/a39-structured-logging.test.js */

const assert = require('assert');
const http = require('http');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');

const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) pass++; else fail++;
  console.log((ok ? '✅' : '❌') + ' ' + name + (detail ? ' — ' + detail : ''));
}

function get(url, headers) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, { headers: headers || {} }, (res) => {
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
    });
    req.on('error', reject);
    req.setTimeout(10000, () => { req.destroy(new Error('timeout')); });
  });
}

(async () => {
  /* L1/L2/L3 — the logger contract */
  {
    const { createLogger } = require('../server/logger');
    let captured = '';
    const orig = process.stdout.write.bind(process.stdout);
    process.stdout.write = (s) => { captured += s; return true; };
    const log = createLogger({ request_id: 'rid-1', tenant: '100', user: '7' });
    log.info('hello world', { extra: 42 });
    log.debug('hidden'); /* info level = the floor */
    process.stdout.write = orig;
    const line = JSON.parse(captured.trim().split('\n')[0]);
    check('L1 one JSON object per line (ts/level/msg)', line.ts && line.level === 'info' && line.msg === 'hello world', JSON.stringify(line).slice(0, 80));
    check('L2 the child binding on the line', line.request_id === 'rid-1' && line.tenant === '100' && line.user === '7');
    check('L2b the extra fields pass through', line.extra === 42);
    check('L3 debug below the info floor is not emitted', !captured.includes('hidden'));

    let errCap = '';
    const oe = process.stderr.write.bind(process.stderr);
    process.stderr.write = (s) => { errCap += s; return true; };
    createLogger().error('boom', { code: 'X' });
    process.stderr.write = oe;
    const el = JSON.parse(errCap.trim().split('\n').pop());
    check('L4 error = a JSON line on stderr with the fields', el.level === 'error' && el.code === 'X');
  }

  /* R1/R2/R3 — the HTTP correlation */
  {
    /* In-process boot, the repo's proven harness (see tests/api/*.test.js):
       index.js only auto-listens when it is the MAIN module (require.main ===
       module), so a test boots by requiring it and binding manually. No demo
       seed — it is CPU-heavy and /healthz does not need it. */
    process.env.ALLOW_MEMORY_FALLBACK = '1';
    process.env.PAYESH_JWT_SECRET = crypto.randomBytes(32).toString('hex');
    const idx = require('../server/index.js');
    await new Promise((r) => idx.server.listen(0, '127.0.0.1', r));
    const addr = 'http://127.0.0.1:' + idx.server.address().port;
    const a = await get(addr + '/api/health');
    const echoed = a.headers['x-request-id'];
    check('R1 a request without x-request-id = a minted UUID echoed', a.status === 200 && /^[0-9a-f-]{36}$/.test(String(echoed || '')), 'header=' + echoed);
    const b = await get(addr + '/api/health');
    check('R2 two requests = two different ids', String(b.headers['x-request-id']) !== String(echoed));
    const mine = crypto.randomUUID();
    const c = await get(addr + '/healthz', { 'x-request-id': mine });
    check('R3 the client-supplied x-request-id is honored and echoed', c.headers['x-request-id'] === mine);
    try { idx.server.close(); } catch (e) { /* already gone */ }
  }

  /* R4 — no console.log remains in server/ */
  {
    let hits = 0;
    const walk = (dir) => {
      for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, f.name);
        if (f.isDirectory()) walk(p);
        else if (f.name.endsWith('.js')) {
          const src = fs.readFileSync(p, 'utf8');
          const stripped = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
          hits += (stripped.match(/console\.log\s*\(/g) || []).length;
        }
      }
    };
    walk(path.join(ROOT, 'server'));
    check('R4 zero console.log left in server/ (comment-stripped scan)', hits === 0, 'hits=' + hits);
  }

  console.log('────────────────────────────────────────────');
  console.log('a39-structured-logging: ' + pass + ' pass / ' + fail + ' fail');
  console.log('CHECKS ' + (pass + fail) + ' FAIL ' + fail);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('FATAL ' + (e && e.message)); process.exit(1); });
