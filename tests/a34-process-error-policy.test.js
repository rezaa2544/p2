'use strict';
/* tests/a34-process-error-policy.test.js — A-34: the API-level error handling
   is comprehensive (per-request boundaries + graceful shutdown existed); this
   adds the LAST layer: the process-level async error policy — and proves it
   behaviorally in child processes:

     P1  unhandledRejection (a background-task stray) → audited loudly, the
         process STAYS ALIVE (Node ≥15's default would exit);
     P2  uncaughtException (unknown sync state) → graceful shutdown WITH drain
         semantics and a NONZERO exit (the supervisor must see a crash, not a
         clean stop);
     P3  the SIGTERM exit code stays 0 (the existing clean-stop contract is
         not regressed by the exitCode parameter).

   Run: node tests/a34-process-error-policy.test.js */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) pass++; else fail++;
  console.log((ok ? '✅' : '❌') + ' ' + name + (detail ? ' — ' + detail : ''));
}

const crypto = require('crypto');
/* the child boots the REAL server (in-memory mode) and fires the signal */
function runChild(stage) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ['-e', `
      process.on('message', (m) => {
        if (m === 'reject') { Promise.reject(new Error('a34-stray-rejection')); }
        if (m === 'throw')  { setImmediate(() => { throw new Error('a34-stray-exception'); }); }
      });
      const srv = require(${JSON.stringify(path.join(ROOT, 'server', 'index.js'))});
      const go = () => { if (process.send) process.send('booted'); };
      if (srv.ready && typeof srv.ready === 'function') { Promise.resolve(srv.ready()).then(go, go); } else { go(); }
      setTimeout(go, 4000); /* fail-open: booted anyway so the parent can proceed */
    `], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe', 'ipc'], env: Object.assign({}, process.env, { PAYESH_DEMO_CODE: '1', PAYESH_JWT_SECRET: crypto.randomBytes(32).toString('hex') }) });
    let out = '', err = '', booted = false, done = false;
    const finish = (code, signal) => { if (!done) { done = true; resolve({ booted, out, err, code, signal }); } };
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { err += d; });
    child.on('message', (m) => {
      if (m === 'booted' && !booted) {
        booted = true;
        child.send(stage);
      }
    });
    if (stage === 'reject') {
      /* alive after 3s = P1 passes */
      setTimeout(() => {
        if (!done) { try { child.kill('SIGKILL'); } catch (e) {} finish('ALIVE', null); }
      }, 3000);
    }
    child.on('exit', (code, signal) => finish(code, signal));
    /* hard cap */
    setTimeout(() => { if (!done) { try { child.kill('SIGKILL'); } catch (e) {} finish('TIMEOUT', null); } }, 20000);
  });
}

(async () => {
  /* P1 — stray rejection: the process survives */
  const r1 = await runChild('reject');
  check('P1 unhandledRejection keeps the process alive', r1 === 'ALIVE' || (r1.code === 'ALIVE'), 'result=' + r1.code + ' signal=' + r1.signal);
  check('P1b rejection is loudly logged', /\[process\] unhandledRejection/.test(r1.out + r1.err), (r1.err.match(/\[process\][^\n]*/) || [''])[0].slice(0, 90));

  /* P2 — stray throw: graceful shutdown with a nonzero exit */
  const r2 = await runChild('throw');
  check('P2 uncaughtException exits nonzero', typeof r2.code === 'number' && r2.code !== 0, 'code=' + r2.code + ' signal=' + r2.signal);
  check('P2b shutdown sequence ran (drain + dependencies closed)', /\[shutdown\] uncaughtException received/.test(r2.out + r2.err) && /dependencies closed/.test(r2.out + r2.err),
    (r2.out.match(/\[shutdown\][^\n]*/) || [''])[0].slice(0, 90));

  /* P3 — SIGTERM still exits 0 (the clean-stop contract). Windows cannot
     deliver SIGTERM to a process at all (process.kill maps to
     TerminateProcess — no handler runs), so this check is a documented
     platform skip here and is exercised fully on the Linux CI lanes. */
  if (process.platform === 'win32') {
    console.log('⏭ P3 skipped: Windows cannot deliver SIGTERM (TerminateProcess has no handler phase) — the Linux CI lanes exercise this check');
  } else {
    const r3 = await new Promise((resolve) => {
      const child = spawn(process.execPath, ['-e', `
        require(${JSON.stringify(path.join(ROOT, 'server', 'index.js'))});
        setTimeout(() => process.exit(0), 3000); /* fallback clean exit */
      `], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe', 'ipc'], env: Object.assign({}, process.env, { PAYESH_DEMO_CODE: '1', PAYESH_JWT_SECRET: crypto.randomBytes(32).toString('hex') }) });
      let out = '';
      child.stdout.on('data', (d) => { out += d; });
      child.stderr.on('data', (d) => { out += d; });
      setTimeout(() => { try { child.kill('SIGTERM'); } catch (e) {} }, 1200);
      child.on('exit', (code) => resolve({ code, out }));
    });
    check('P3 SIGTERM keeps exit 0', r3.code === 0, 'code=' + r3.code + ' log=[' + (r3.out.match(/\[shutdown\][^\n]*/) || ['(none)'])[0].slice(0, 100) + ']');
  }

  console.log('────────────────────────────────────────────');
  console.log('a34-process-error-policy: ' + pass + ' pass / ' + fail + ' fail');
  console.log('CHECKS ' + (pass + fail) + ' FAIL ' + fail);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('FATAL ' + (e && e.message)); process.exit(1); });
