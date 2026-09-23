/**
 * تست اعتبارسنجی تمامیت نسخه‌های پشتیبان چندمؤلفه‌ای (P1-SC-04)
 */
'use strict';

const assert = require('assert');
const fixture = require('./evidence-fixture');
const {
  verifyBackupIntegrity
} = require('../../../server/infrastructure/disaster-recovery');

function runBackupIntegrityTests() {
  console.log('▸ تست ۱: اعتبارسنجی تمامیت مؤلفه‌های پشتیبان (backup-integrity)');

  // ۱. پشتیبان کامل و معتبر
  const nominal = verifyBackupIntegrity(fixture.backup);
  assert.strictEqual(nominal.verified, true);
  assert.strictEqual(nominal.retention_days, 30);
  assert.strictEqual(nominal.components.postgres.verified, true);
  assert.strictEqual(nominal.components.postgres.wal_archiving, true);
  assert(nominal.components.postgres.checksum.length === 64);
  assert.strictEqual(nominal.components.redis.verified, true);
  assert.strictEqual(nominal.components.redis.rdb_snapshot, true);
  assert.strictEqual(nominal.components.configuration.verified, true);
  assert.strictEqual(nominal.manifest.verified, true);

  // ۲. عدم تایید در صورت خرابی یکی از مؤلفه‌ها
  const corruptPg = verifyBackupIntegrity({ ...fixture.backup, postgres_verified: false });
  assert.strictEqual(corruptPg.verified, false);
  assert.strictEqual(corruptPg.components.postgres.verified, false);
  assert.strictEqual(corruptPg.manifest.verified, false);

  const corruptRedis = verifyBackupIntegrity({ ...fixture.backup, redis_verified: false });
  assert.strictEqual(corruptRedis.verified, false);
  assert.strictEqual(corruptRedis.components.redis.verified, false);

  console.log('  ✅ اعتبارسنجی جامع نسخه‌های پشتیبان دیتابیس، کش، کانفیگ و مانیفست تایید شد');
}

if (require.main === module) {
  runBackupIntegrityTests();
}

module.exports = { runBackupIntegrityTests };
