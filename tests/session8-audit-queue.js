#!/usr/bin/env node
/* Session 8 / Wave 9 regression: async audit buffering must be bounded. */
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { createAudit } = require('../server/audit');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'payesh-session8-audit-'));
const file = path.join(dir, 'audit.log');
const logger = createAudit({
  auditFile: file,
  auditDir: path.join(dir, 'archive'),
  asyncMode: true,
  maxQueue: 2,
  maxEvents: 10000
});

for (let i = 0; i < 100; i++) logger.audit('burst_' + i, { i });
const before = logger.getQueueStats();
assert.ok(before.queued <= 2, 'queue must stay within maxQueue');
assert.ok(before.dropped >= 98, 'overflow must be observable as dropped events');

(async () => {
  await logger.flush();
  const lines = fs.existsSync(file) ? fs.readFileSync(file, 'utf8').split('\n').filter(Boolean) : [];
  assert.ok(lines.length <= 2, 'only bounded queued events may be flushed');
  assert.strictEqual(logger.getQueueStats().queued, 0, 'flush drains the bounded queue');
  console.log('session8-audit-queue: 4/4 checks ✅');
})().catch((err) => { console.error(err); process.exit(1); });
