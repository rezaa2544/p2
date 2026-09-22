#!/usr/bin/env node
'use strict';

const assert = require('assert');
const http = require('http');
const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname, '..');
const TOOL = path.join(ROOT, 'tools', 'capacity-saturation-probe.js');

function run(args) {
  return spawnSync(process.execPath, [TOOL, ...args], {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: 10000,
  });
}

function withServer(handler, fn) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(handler);
    server.listen(0, '127.0.0.1', async () => {
      try {
        await fn('http://127.0.0.1:' + server.address().port);
        resolve();
      } catch (e) {
        reject(e);
      } finally {
        server.close();
      }
    });
    server.on('error', reject);
  });
}

(async () => {
  console.log('\n▸ capacity saturation false-green regression');

  const zero = run(['--validate', '--staircase', '0']);
  assert.notStrictEqual(zero.status, 0, 'staircase=0 must fail CLI validation');

  const zeroStep = run(['--validate', '--step-seconds', '0']);
  assert.notStrictEqual(zeroStep.status, 0, 'step-seconds=0 must fail CLI validation');

  await withServer((req, res) => {
    if (req.url === '/metrics') {
      res.writeHead(200, { 'content-type': 'text/plain' });
      return res.end('# metrics intentionally empty\\n');
    }
    res.writeHead(req.url.includes('/api/auth/') ? 401 : 403);
    res.end('denied');
  }, async (base) => {
    const out = path.join(ROOT, 'tests', '.capacity-auth-regression.json');
    const r = run(['--target', base, '--confirm-staging', '--staircase', '1', '--step-seconds', '1', '--warmup-seconds', '0', '--out', out]);
    assert.strictEqual(r.status, 0, '401/403-only run should remain measurable, not become a goodput sample');
    const report = JSON.parse(fs.readFileSync(out, 'utf8'));
    const step = report.steps[0];
    assert.strictEqual(step.goodputRequests, 0, '401/403 must not count as goodput');
    assert(step.authDeniedRequests > 0, '401/403 must be counted separately');
    fs.unlinkSync(out);
  });

  await withServer((req, res) => {
    if (req.url === '/metrics') {
      res.writeHead(200, { 'content-type': 'text/plain' });
      return res.end('# metrics intentionally empty\\n');
    }
    res.writeHead(503);
    res.end('unavailable');
  }, async (base) => {
    const r = run(['--target', base, '--confirm-staging', '--staircase', '1', '--step-seconds', '1', '--warmup-seconds', '0']);
    assert.notStrictEqual(r.status, 0, '5xx must fail the benchmark');
  });

  await withServer((req, res) => {
    if (req.url === '/metrics') {
      res.writeHead(200, { 'content-type': 'text/plain' });
      return res.end('# metrics intentionally empty\\n');
    }
    req.socket.destroy();
  }, async (base) => {
    const r = run(['--target', base, '--confirm-staging', '--staircase', '1', '--step-seconds', '1', '--warmup-seconds', '0']);
    assert.notStrictEqual(r.status, 0, 'transport failures must fail the benchmark');
  });

  console.log('capacity saturation false-green regression: 5/5 PASS');
})().catch((e) => {
  console.error('FAIL', e.stack || e);
  process.exit(1);
});
