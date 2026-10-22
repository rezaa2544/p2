#!/usr/bin/env node
'use strict';

// Regression contract for A01's post-spawn exception path. The harness must
// exit with code 2 and release its fixed local server port. Run this contract
// from scripts/ so adding a CI helper does not silently stale the frozen test
// inventory maintained under tests/.
const { spawn, execFileSync } = require('child_process');
const net = require('net');
const path = require('path');

const script = path.join(__dirname, '..', 'tests', 'a01-report-logs-repro.js');
const port = 8971;
const deadlineMs = 12000;
let timedOut = false;
let settled = false;

const child = spawn(process.execPath, [script], {
  env: { ...process.env, A01_TEST_THROW_AFTER_BOOT: '1' },
  stdio: 'ignore',
  detached: process.platform !== 'win32'
});

function killTree() {
  if (!child.pid) return;
  try {
    if (process.platform === 'win32') {
      execFileSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    } else {
      // detached:true gives the harness and its spawned server a dedicated
      // process group, so the timeout path cannot strand a grandchild.
      process.kill(-child.pid, 'SIGKILL');
    }
  } catch (_) {
    try { child.kill('SIGKILL'); } catch (_) {}
  }
}

const timer = setTimeout(() => {
  timedOut = true;
  killTree();
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
  const released = await verifyPortReleased();
  if (timedOut) return fail('A01 exception path exceeded ' + deadlineMs + 'ms; process tree terminated; port released=' + released);
  if (code !== 2) return fail('expected crash exit code 2, got code=' + code + ' signal=' + signal);
  if (!released) return fail('A01 child server still owns port ' + port);
  if (settled) return;
  settled = true;
  console.log('PASS: forced post-spawn exception exits 2 promptly and releases port ' + port);
});
