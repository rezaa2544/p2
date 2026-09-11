#!/usr/bin/env node
/* Session 8 / Wave 9 regression: async audit record() must not touch sync fs APIs. */
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createAudit } = require('../server/audit');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'payesh-session8-audit-io-'));
const file = path.join(dir, 'nested', 'audit.log');
const syncApis = ['existsSync', 'statSync', 'mkdirSync', 'openSync', 'appendFileSync', 'renameSync', 'copyFileSync'];
const originals = Object.fromEntries(syncApis.map((name) => [name, fs[name]]));
let calls = 0;
for (const name of syncApis) {
  fs[name] = function forbiddenSyncFs(...args) {
    calls++;
    throw new Error('sync fs in async audit path: ' + name);
  };
}
let logger;
try {
  logger = createAudit({ auditFile: file, auditDir: path.join(dir, 'archive'), asyncMode: true, maxBytes: 1 });
  logger.audit('async_no_sync_io', { ok: true });
} finally {
  for (const name of syncApis) fs[name] = originals[name];
}

(async () => {
  assert.strictEqual(calls, 0, 'record() must not call synchronous fs APIs in async mode');
  await logger.flush();

  let flushSyncCalls = 0;
  const flushOriginals = Object.fromEntries(syncApis.map((name) => [name, fs[name]]));
  for (const name of syncApis) {
    fs[name] = function forbiddenFlushSyncFs(...args) {
      flushSyncCalls++;
      throw new Error('sync fs in async flush path: ' + name);
    };
  }
  try {
    logger.audit('async_rotation_no_sync_io', { ok: true });
    await logger.flush();
  } finally {
    for (const name of syncApis) fs[name] = flushOriginals[name];
  }

  assert.strictEqual(flushSyncCalls, 0, 'async rotation must not call synchronous fs APIs');
  const lines = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean);
  assert.strictEqual(lines.length, 1);
  assert.ok(lines[0].includes('async_rotation_no_sync_io'));
  const archives = fs.readdirSync(path.join(dir, 'archive')).filter((name) => name.endsWith('.log'));
  assert.ok(archives.length >= 1, 'size rotation must archive the previous batch');
  console.log('session8-audit-async-io: 5/5 checks ✅');
})().catch((err) => { console.error(err); process.exit(1); });
