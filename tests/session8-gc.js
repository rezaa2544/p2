#!/usr/bin/env node
/* Session 8 / Wave 9 regression: internal timestamped maps must be collectible. */
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'payesh-session8-gc-'));
const storeFile = path.join(TMP, 'store.json');
const auditFile = path.join(TMP, 'audit.log');
const keyFile = path.join(TMP, 'jwt.key');
const sourceStore = path.join(ROOT, 'server', 'data', 'payesh.json');
fs.copyFileSync(sourceStore, storeFile);
process.env.PAYESH_STORE = storeFile;
process.env.PAYESH_AUDIT = auditFile;
process.env.PAYESH_KEY = keyFile;
process.env.PAYESH_DEMO_CODE = '1';

const app = require('../server/index.js');
const { store, __gcStoreForTests } = app;
assert.strictEqual(typeof __gcStoreForTests, 'function', 'gc test hook must be exported');

const now = Date.now();
store.__processed_uids = {
  old: now - (31 * 24 * 3600 * 1000),
  fresh: now
};
/* logout stores a number; the enumeration guard stores { at, reason }. */
store.__revoked_jti = {
  old_number: now - (9 * 3600 * 1000),
  old_object: { at: now - (9 * 3600 * 1000), reason: 'enumeration' },
  fresh_object: { at: now, reason: 'logout' }
};

const removed = __gcStoreForTests();
assert.strictEqual(removed, 3, 'GC must remove both stale scalar and object timestamps');
assert.ok(!Object.prototype.hasOwnProperty.call(store.__processed_uids, 'old'));
assert.ok(Object.prototype.hasOwnProperty.call(store.__processed_uids, 'fresh'));
assert.ok(!Object.prototype.hasOwnProperty.call(store.__revoked_jti, 'old_number'));
assert.ok(!Object.prototype.hasOwnProperty.call(store.__revoked_jti, 'old_object'));
assert.ok(Object.prototype.hasOwnProperty.call(store.__revoked_jti, 'fresh_object'));

console.log('session8-gc: 5/5 checks ✅');
process.exit(0);
