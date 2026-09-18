/**
 * تست محافظت زمان اجرای نشست‌ها و توکن‌ها (Session Protection - P1-SC-06)
 */
'use strict';

const assert = require('assert');
const {
  checkSessionProtection
} = require('../../../server/security/zero-trust-runtime');

function runSessionProtectionTests() {
  console.log('▸ تست ۳: محافظت زمان اجرای نشست‌ها و تشخیص ناهنجاری (session-protection)');

  const baseSession = {
    id: 'sess-123',
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    revoked: false,
    client_ip: '192.168.1.10',
    user_agent: 'Mozilla/5.0 Chrome/120.0',
    active_sessions_count: 2
  };

  // ۱. نشست استاندارد و سالم
  const check1 = checkSessionProtection({
    session: baseSession,
    clientInfo: { ip: '192.168.1.10', user_agent: 'Mozilla/5.0 Chrome/120.0' }
  });
  assert.strictEqual(check1.protected, true);
  assert.strictEqual(check1.status, 'HEALTHY');
  assert.strictEqual(check1.risk_level, 'NONE');
  assert.strictEqual(check1.automated_remediation, false);
  assert.strictEqual(check1.requires_human_approval, true);

  // ۲. تغییر مشکوک آدرس آی‌پی (IP Shift)
  const check2 = checkSessionProtection({
    session: baseSession,
    clientInfo: { ip: '10.0.0.99', user_agent: 'Mozilla/5.0 Chrome/120.0' }
  });
  assert.strictEqual(check2.protected, false);
  assert.strictEqual(check2.status, 'ANOMALY_DETECTED');
  assert(check2.issues.includes('SUSPICIOUS_IP_SHIFT'));
  assert.strictEqual(check2.risk_level, 'MEDIUM');

  // ۳. کشف بازپخش توکن (Token Replay Detection)
  const history = [{ nonce: 'nonce-abc', used: true }];
  const check3 = checkSessionProtection({
    session: baseSession,
    clientInfo: { ip: '192.168.1.10', user_agent: 'Mozilla/5.0 Chrome/120.0', nonce: 'nonce-abc' },
    sessionHistory: history
  });
  assert.strictEqual(check3.protected, false);
  assert(check3.issues.includes('TOKEN_REPLAY_DETECTED'));
  assert.strictEqual(check3.risk_level, 'CRITICAL');

  // ۴. نشست‌های همزمان بیش از حد مجاز
  const crowdedSession = { ...baseSession, active_sessions_count: 8 };
  const check4 = checkSessionProtection({
    session: crowdedSession,
    clientInfo: { ip: '192.168.1.10', user_agent: 'Mozilla/5.0 Chrome/120.0' }
  });
  assert.strictEqual(check4.protected, false);
  assert(check4.issues.includes('EXCESSIVE_CONCURRENT_SESSIONS'));

  // ۵. رعایت حاکمیت تصمیم انسانی در تمام خروجی‌ها (عدم ابطال خودکار)
  assert.strictEqual(check2.automated_remediation, false);
  assert.strictEqual(check3.automated_remediation, false);
  assert.strictEqual(check4.automated_remediation, false);

  console.log('  ✅ صحت محافظت نشست‌ها، تشخیص تغییر IP، بازپخش توکن و همزمانی تایید شد');
}

if (require.main === module) {
  runSessionProtectionTests();
}

module.exports = { runSessionProtectionTests };
