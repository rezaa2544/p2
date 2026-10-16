#!/usr/bin/env node
'use strict';

// Regression contract for the A01 harness crash path. The harness deliberately
// throws after spawning its local server. It must exit non-zero promptly and
// release the fixed test port; without exception cleanup, child stdio can keep
// the parent alive indefinitely and leave the port occupied.
const { spawn } = require('child_process');
const net = require('net');
const path = require('path');

const script = path.join(__dirname, 'a01-report-logs-repro.js');
const port = 8971;
const deadlineMs = 12000;
let timedOut = false;
let settled = false;

const child = spawn(process.execPath, [script], {
  env: { ...process.env, A01_TEST_THROW_AFTER_BOOT: '1' },
  stdio: 'ignore'
});

const timer = setTimeout(() => {
  timedOut = true;
  try { child.kill('SIGKILL'); } catch (_) {}
}, deadlineMs);

function fail(message) {
  if (settled) return;
  settled = true;
  clearTimeout(timer);
  console.error('FAIL: ' + message);
  process.exitCode = 1;
}

function portCanBind() {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.listen(port, '127.0.0.1', () => server.close(() => resolve(true)));
  });
}

async function verifyPortReleased() {
  const until = Date.now() + 3000;
  while (Date.now() < until) {
    if (await portCanBind()) return true;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return false;
}

child.once('error', (error) => fail('could not start A01 child: ' + error.message));
child.once('close', async (code, signal) => {
  clearTimeout(timer);
  if (timedOut) return fail('A01 exception path did not exit within ' + deadlineMs + 'ms');
  if (code !== 2) return fail('expected crash exit code 2, got code=' + code + ' signal=' + signal);
  if (!(await verifyPortReleased())) return fail('A01 child server still owns port ' + port);
  if (settled) return;
  settled = true;
  console.log('PASS: forced post-spawn exception exits 2 promptly and releases port ' + port);
});
