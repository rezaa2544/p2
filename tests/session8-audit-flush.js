#!/usr/bin/env node
/* Session 8 / Wave 9 regression: failed async audit writes must be retryable. */
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createAudit } = require('../server/audit');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'payesh-session8-audit-flush-'));
const file = path.join(dir, 'audit.log');
const logger = createAudit({ auditFile: file, auditDir: path.join(dir, 'archive'), asyncMode: true });
logger.audit('retry_a', { n: 1 });
logger.audit('retry_b', { n: 2 });

const originalAppendFile = fs.appendFile;
let failed = true;
fs.appendFile = function patchedAppendFile(...args) {
  const callback = args[args.length - 1];
  if (failed) {
    failed = false;
    return process.nextTick(() => callback(new Error('simulated disk full')));
  }
  return originalAppendFile.apply(fs, args);
};

(async () => {
  try {
    await logger.flush();
    const afterFailure = logger.getQueueStats();
    assert.ok(afterFailure.queued >= 2, 'failed batch must remain queued for retry');
    const failedContent = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
    assert.strictEqual(failedContent, '', 'failed append must not be reported as persisted');
    await logger.flush();
    const lines = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean);
    assert.strictEqual(lines.length, 2, 'retry must persist the original batch exactly once');
    assert.ok(lines[0].includes('retry_a') && lines[1].includes('retry_b'));
    console.log('session8-audit-flush: 4/4 checks ✅');
  } finally {
    fs.appendFile = originalAppendFile;
  }
})().catch((err) => { console.error(err); process.exit(1); });
