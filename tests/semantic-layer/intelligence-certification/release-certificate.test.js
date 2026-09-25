/**
 * آزمون ۷: صدور گواهی رسمی انتشار فاز ۳ (release-certificate)
 */

'use strict';

const assert = require('assert');
const {
  generatePhase3ReleaseCertificate,
  runPhase3Certification,
  CERTIFICATION_STATUS
} = require('../../../server/analytics/intelligence-release-certification');

function runTests() {
  console.log('▸ تست ۷: صدور گواهی رسمی انتشار فاز ۳ (release-certificate)');

  const mockUser = {
    id: 10,
    role: 'manager',
    school_id: 101,
    region_id: 1
  };

  // ۱. اجرای فرآیند کامل صدور گواهی
  const certSnapshot = runPhase3Certification({
    schoolId: 101,
    regionId: 1,
    academicYear: '1404-1405',
    user: mockUser
  }, { timestamp: '2026-09-18T12:00:00.000Z' });

  assert.strictEqual(certSnapshot.phase, 'PHASE_3');
  assert.strictEqual(certSnapshot.school_id, 101);
  /* A-31 / I-08 + I-09: بدونِ شاهدِ اجرای گیت‌ها و شاهدِ رانتایمِ زنجیره،
     گواهی «صادر شده» نیست. */
  assert.strictEqual(certSnapshot.certification_status, CERTIFICATION_STATUS.REJECTED);
  assert.strictEqual(certSnapshot.release_ready, false);
  assert.strictEqual(certSnapshot.release_certificate.quality_gates_summary.all_passed, false);
  assert.strictEqual(certSnapshot.e2e_chain_execution.verification_mode, 'SIMULATION');

  /* کنترل: با شاهدِ کاملِ گیت‌ها و شاهدِ رانتایمِ زنجیره، گواهی صادر می‌شود */
  const allPassed = {};
  for (const key of ['semantic_tests', 'api_tests', 'master_regression', 'build_parity',
    'authorization_parity', 'secret_scan', 'docs_stats_sync', 'docs_consistency']) {
    allPassed[key] = { status: 'PASSED', ran_at: '2026-09-18T12:00:00.000Z' };
  }
  const runtimeEvidence = {};
  for (let i = 1; i <= 12; i++) {
    runtimeEvidence['STEP_' + String(i).padStart(2, '0')] = { status: 'OBSERVED', observed_at: '2026-09-18T12:00:00.000Z' };
  }
  const evidencedSnapshot = runPhase3Certification({
    schoolId: 101,
    regionId: 1,
    academicYear: '1404-1405',
    user: mockUser
  }, { timestamp: '2026-09-18T12:00:00.000Z', gateResults: allPassed, runtimeEvidence });
  assert.strictEqual(evidencedSnapshot.certification_status, CERTIFICATION_STATUS.CERTIFIED);
  assert.strictEqual(evidencedSnapshot.release_ready, true);

  // بررسی گواهینامه انتشار (در حالتِ دارای شاهد)
  const cert = evidencedSnapshot.release_certificate;
  assert.ok(cert.certificate_id.startsWith('CERT-PAYESH-PHASE3-'));
  assert.strictEqual(cert.status, CERTIFICATION_STATUS.CERTIFIED);
  assert.strictEqual(cert.release_ready, true);
  assert.strictEqual(cert.engines_summary.total_required, 20);
  assert.strictEqual(cert.engines_summary.total_certified, 20);
  assert.strictEqual(cert.quality_gates_summary.all_passed, true);
  assert.strictEqual(cert.governance_summary.human_decision_sovereignty, 'VERIFIED_STRICT');
  assert.strictEqual(cert.governance_summary.zero_ranking_policy, 'ENFORCED_ZERO_TOLERANCE');
  assert.strictEqual(cert.e2e_verification.unbroken_closed_loop, true);
  assert.strictEqual(evidencedSnapshot.e2e_chain_execution.verification_mode, 'RUNTIME');
  assert.ok(cert.certificate_fingerprint.length === 64, 'چک‌سام گواهینامه باید هش معتبر SHA-256 باشد');

  // ۲. سناریوی رد صلاحیت در صورت بروز نقض حاکمیت انسانی
  const rejectedCert = generatePhase3ReleaseCertificate({
    sovereignty: { compliant: false, checks: {} },
    zeroRanking: { compliant: true },
    qualityGates: { all_passed: true },
    completeness: { complete: true, total_required: 20, active_count: 20 },
    e2eChain: { verified: true, unbroken_loop: true }
  });
  assert.strictEqual(rejectedCert.status, CERTIFICATION_STATUS.REJECTED);
  assert.strictEqual(rejectedCert.release_ready, false);

  console.log('  ✅ صدور گواهی رسمی انتشار فاز ۳ با مشخصات و چک‌سام رمزنگاری‌شده با موفقیت تایید شد');
}

if (require.main === module) {
  runTests();
}

module.exports = { runTests };
