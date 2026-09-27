#!/usr/bin/env node
/* ═════════════════════════════════════════════════════════════════
   tests/n04-n05-region-tenant-guards.test.js
   -------------------------------------------------------------------
   N-04 — edu_office region guard FAILS OPEN when the officer carries no
          region_id/office_id. Two shapes existed:
     (a) regional-intelligence-network.js: `if (userRegionId != null && ...)`
         — a null assignment skipped the comparison and returned true.
     (b) 7 more guards: `Number(user.region_id || user.district_id)`
         collapses an unassigned officer to region 0, and
         `if (targetRegion && ...)` skipped entirely on a falsy target.
     An unassigned officer could read any region's data.

   N-05 — the F4 region invariant ("a school role has no regional tenant
          grant") was applied to 2 of 9 analytics guards. The other 8 ended
          their manager/counselor branch at the own-school check and
          `return true`, so `GET .../intelligence-governance?region_id=<any>`
          handed a full district overview to any school manager.

   Test scenarios (a fix is not accepted until it survives 5 full runs):
     N04-1  an edu_office with NO region assignment is rejected by all 12
            guards (fail-closed) — the core N-04 bypass
     N04-2  an edu_office WITH a region reaches its own region and is
            rejected from a foreign one (all 12 guards)
     N04-3  the falsy-region trick (region_id: 0) can no longer skip the check
     N05-1  a manager is rejected on a region-scoped target by all 8 guards
     N05-2  a counselor is rejected on a region-scoped target (second role)
     N05-3  no regression: manager/counselor still reach their own school,
            and the internal-caller shape (school + region hint) still works
     N05-4  end-to-end through the live HTTP API: unassigned edu_office gets
            403 on a foreign region; an assigned officer gets 200 on its own
   ═════════════════════════════════════════════════════════════════ */
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

/* ── guards under test ──────────────────────────────────────────── */
const { enforceGovernanceDashboardAccessGuard } = require('../server/analytics/intelligence-governance-dashboard');
const { enforceRecommendationAccessGuard } = require('../server/analytics/recommendation-action-planning');
const { enforcePolicySimulationAccessGuard } = require('../server/analytics/policy-simulation-engine');
const { enforceDecisionCommandAccessGuard } = require('../server/analytics/decision-intelligence-command');
const { enforceExecutionAccessGuard } = require('../server/analytics/operational-intelligence-execution');
const { enforceOutcomeEvaluationAccessGuard } = require('../server/analytics/outcome-evaluation-optimization');
const { enforcePlatformAccessGuard } = require('../server/analytics/intelligence-platform-integration');
const { enforceCertificationAccessGuard } = require('../server/analytics/intelligence-release-certification');
const { enforceRegionalTenantIsolation } = require('../server/analytics/regional-intelligence-network');
const { enforceEventProcessingTenantIsolation } = require('../server/infrastructure/event-processing-layer');
const { enforcePhase4CertificationAccessGuard } = require('../server/infrastructure/phase4-release-certification');
const { enforceInfrastructureTenantIsolation } = require('../server/infrastructure/scalability-foundation');

let pass = 0, fail = 0;
async function test(name, fn) {
  try { await fn(); pass++; console.log('  ✅ ' + name); }
  catch (err) { fail++; console.error('  ❌ ' + name + '\n     ' + err.message); }
}

/* Every guard that had the N-04 fail-open shape, plus the N-05 set. */
const ANALYTICS_PREFIX = {
  governance: 'GOVERNANCE_TENANT_ISOLATION_VIOLATION',
  recommendation: 'RECOMMENDATION_TENANT_ISOLATION_VIOLATION',
  policy: 'POLICY_SIMULATION_TENANT_ISOLATION_VIOLATION',
  decision: 'DECISION_COMMAND_TENANT_ISOLATION_VIOLATION',
  execution: 'OPERATIONAL_EXECUTION_TENANT_ISOLATION_VIOLATION',
  outcome: 'OUTCOME_EVALUATION_TENANT_ISOLATION_VIOLATION',
  platform: 'INTELLIGENCE_PLATFORM_TENANT_ISOLATION_VIOLATION',
  certification: 'INTELLIGENCE_CERTIFICATION_TENANT_ISOLATION_VIOLATION'
};

/* guards taking (requester, targetEntity, options) */
const ENTITY_GUARDS = {
  governance: enforceGovernanceDashboardAccessGuard,
  recommendation: enforceRecommendationAccessGuard,
  policy: enforcePolicySimulationAccessGuard,
  decision: enforceDecisionCommandAccessGuard
};
/* guards taking (user, target) */
const TARGET_GUARDS = {
  execution: enforceExecutionAccessGuard,
  outcome: enforceOutcomeEvaluationAccessGuard,
  platform: enforcePlatformAccessGuard,
  certification: enforceCertificationAccessGuard
};

const ALL_GUARDS = Object.assign({}, ENTITY_GUARDS, TARGET_GUARDS);

function callGuard(key, user, target) {
  return ALL_GUARDS[key](user, target, {});
}

function escRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

async function main() {
  console.log('\n🔍 N-04/N-05 regression: region tenant isolation');

  /* ── N04-1: an unassigned edu_office is rejected everywhere ────── */
  await test('N04-1: edu_office with no region assignment is fail-closed in all 12 guards', () => {
    const unassigned = { id: 9999, role: 'edu_office' }; /* no region/office/district */
    for (const key of Object.keys(ALL_GUARDS)) {
      assert.throws(
        () => callGuard(key, unassigned, { region_id: 5, school_id: null }),
        /TENANT_ISOLATION_VIOLATION|lacks region/,
        key + ': unassigned edu_office was allowed through'
      );
    }
    /* regional-intelligence-network (needs a valid target region) */
    assert.throws(
      () => enforceRegionalTenantIsolation(unassigned, { region_id: 5 }),
      /REGIONAL_TENANT_ISOLATION_VIOLATION/,
      'regional-intelligence-network: unassigned edu_office was allowed through'
    );
    /* the three infrastructure guards */
    assert.throws(() => enforceEventProcessingTenantIsolation(unassigned, { region_id: 5 }), /TENANT_ISOLATION_VIOLATION|lacks region/, 'event-processing: unassigned allowed');
    assert.throws(() => enforcePhase4CertificationAccessGuard(unassigned, { region_id: 5 }), /TENANT_ISOLATION_VIOLATION|lacks region/, 'phase4: unassigned allowed');
    assert.throws(() => enforceInfrastructureTenantIsolation(unassigned, { region_id: 5 }), /TENANT_ISOLATION_VIOLATION|lacks region/, 'scalability: unassigned allowed');
  });

  /* ── N04-2: assigned officer — own region ok, foreign rejected ─── */
  await test('N04-2: edu_office of region 12 reaches region 12 and is blocked from region 99', () => {
    const officer = { id: 20, role: 'edu_office', region_id: 12 };
    for (const key of Object.keys(ALL_GUARDS)) {
      assert.strictEqual(callGuard(key, officer, { region_id: 12 }), true, key + ': own region was refused');
      assert.throws(
        () => callGuard(key, officer, { region_id: 99 }),
        new RegExp(escRe(ANALYTICS_PREFIX[key])),
        key + ': foreign region was allowed'
      );
    }
    assert.strictEqual(enforceRegionalTenantIsolation(officer, { region_id: 12 }), true);
    assert.throws(() => enforceRegionalTenantIsolation(officer, { region_id: 99 }), /REGIONAL_TENANT_ISOLATION_VIOLATION/);
    assert.strictEqual(enforceEventProcessingTenantIsolation(officer, { region_id: 12 }), true);
    assert.throws(() => enforceEventProcessingTenantIsolation(officer, { region_id: 99 }), /TENANT_ISOLATION_VIOLATION/);
    assert.strictEqual(enforceInfrastructureTenantIsolation(officer, { region_id: 12 }), true);
    assert.throws(() => enforceInfrastructureTenantIsolation(officer, { region_id: 99 }), /TENANT_ISOLATION_VIOLATION/);
  });

  /* ── N04-3: the falsy-region trick no longer skips the check ───── */
  await test('N04-3: region_id: 0 (falsy) no longer bypasses the region comparison', () => {
    const officer = { id: 20, role: 'edu_office', region_id: 12 };
    for (const key of Object.keys(ALL_GUARDS)) {
      assert.throws(
        () => callGuard(key, officer, { region_id: 0 }),
        new RegExp(escRe(ANALYTICS_PREFIX[key])),
        key + ': region_id 0 skipped the region check'
      );
    }
  });

  /* ── N05-1: manager cannot reach regional scope ───────────────── */
  await test('N05-1: a manager is blocked from region-scoped targets in all 8 guards', () => {
    const manager = { id: 10, role: 'manager', school_id: 101 };
    for (const key of Object.keys(ALL_GUARDS)) {
      assert.throws(
        () => callGuard(key, manager, { region_id: 5 }),
        new RegExp(escRe(ANALYTICS_PREFIX[key])),
        key + ': manager reached a region-scoped target'
      );
    }
  });

  /* ── N05-2: counselor cannot reach regional scope ─────────────── */
  await test('N05-2: a counselor is blocked from region-scoped targets in all 8 guards', () => {
    const counselor = { id: 11, role: 'counselor', school_id: 101 };
    for (const key of Object.keys(ALL_GUARDS)) {
      assert.throws(
        () => callGuard(key, counselor, { region_id: 5 }),
        new RegExp(escRe(ANALYTICS_PREFIX[key])),
        key + ': counselor reached a region-scoped target'
      );
    }
  });

  /* ── N05-3: no regression on legitimate school-scoped access ──── */
  await test('N05-3: no regression — own school still works, incl. the school+region-hint shape', () => {
    const manager = { id: 10, role: 'manager', school_id: 101 };
    const counselor = { id: 11, role: 'counselor', school_id: 101 };
    for (const key of Object.keys(ALL_GUARDS)) {
      /* plain own-school scope */
      assert.strictEqual(callGuard(key, manager, { school_id: 101 }), true, key + ': own school refused for manager');
      /* internal-caller shape: own school + region hint (buildExecutionDashboard
         & co. always derive both). The F4 check must not fire on a school-scoped
         target, only on a region-scoped one. */
      assert.strictEqual(callGuard(key, manager, { school_id: 101, region_id: 1 }), true, key + ': school+region-hint refused for manager');
      assert.strictEqual(callGuard(key, counselor, { school_id: 101, region_id: 1 }), true, key + ': school+region-hint refused for counselor');
      /* a foreign school is still refused */
      assert.throws(
        () => callGuard(key, manager, { school_id: 202 }),
        new RegExp(escRe(ANALYTICS_PREFIX[key])),
        key + ': foreign school was allowed'
      );
    }
  });

  /* ── N05-4: end-to-end through the live HTTP API ──────────────── */
  await test('N05-4: live API — unassigned edu_office gets 403 on a foreign region; assigned gets 200', async () => {
    const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'payesh-n04-'));
    process.on('exit', () => { try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {} });
    fs.copyFileSync(path.join(__dirname, '..', 'server', 'data', 'payesh.json'), path.join(TMP, 'store.json'));
    process.env.PAYESH_STORE = path.join(TMP, 'store.json');
    process.env.PAYESH_AUDIT = path.join(TMP, 'audit.log');
    process.env.PAYESH_KEY = path.join(TMP, 'jwt.key');
    process.env.PAYESH_OTP_FILE = path.join(TMP, 'otp.json');
    process.env.PAYESH_JWT_SECRET = require('crypto').randomBytes(32).toString('hex');
    process.env.PAYESH_DEMO_CODE = '1';
    process.env.PAYESH_ALLOW_DEV_MEMORY_AUTHORITY = '1';
    /* two logins for the same phone in one run — keep the limiters permissive */
    process.env.PAYESH_SMS_COOLDOWN_S = '0';
    process.env.PAYESH_SMS_IP_LIMIT = '100000';
    process.env.PAYESH_SMS_PHONE_LIMIT = '10000';
    process.env.PAYESH_SMS_DAILY_CAP = '10000';
    process.env.PAYESH_LOGIN_IP_LIMIT = '100000';
    process.env.PAYESH_LOGIN_PHONE_LIMIT = '10000';

    const { server, store } = require('../server/index.js');
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    const BASE = 'http://127.0.0.1:' + server.address().port;

    const req = async (p, { cookie } = {}) => {
      const res = await fetch(BASE + p, { headers: cookie ? { Cookie: cookie } : {} });
      let json = null;
      try { json = await res.json(); } catch (e) {}
      return { status: res.status, json, headers: res.headers };
    };
    const login = async (phone, nationalId) => {
      const sc = await fetch(BASE + '/api/auth/send-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone })
      });
      let scJson = null;
      try { scJson = await sc.json(); } catch (e) {}
      const code = (scJson && scJson.demo_code) || '123456';
      const r = await fetch(BASE + '/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, code, national_id: nationalId })
      });
      const setCookie = r.headers.get('set-cookie') || '';
      return { status: r.status, cookie: (setCookie.match(/payesh_session=[^;]+/) || [])[0] };
    };

    /* an edu_office user present in the seed store (office_id = 1) */
    const officer = store.users.find((u) => u.role === 'edu_office');
    assert.ok(officer, 'seed store has no edu_office user to test with');

    /* (a) assigned officer: a foreign region must be 403, its own region
       must not be 403 (200/404/400 are all acceptable — the point is that
       the tenant guard did not block its own region). */
    const sess = await login(String(officer.phone), String(officer.national_id));
    assert.strictEqual(sess.status, 200, 'login failed for edu_office');
    const foreign = await req('/api/v1/analytics/regional-intelligence?region_id=777', { cookie: sess.cookie });
    assert.strictEqual(foreign.status, 403, 'assigned edu_office read a foreign region over HTTP (status ' + foreign.status + ')');
    const own = await req('/api/v1/analytics/regional-intelligence?region_id=1', { cookie: sess.cookie });
    assert.notStrictEqual(own.status, 403, 'assigned edu_office was 403 on its own region');

    /* (b) strip the officer's regional assignment in memory and re-login:
       an unassigned officer must now be fail-closed on ANY region. */
    const savedOffice = officer.office_id;
    const savedRegion = officer.region_id;
    officer.office_id = null;
    officer.region_id = null;
    try {
      const sess2 = await login(String(officer.phone), String(officer.national_id));
      assert.strictEqual(sess2.status, 200, 'login failed for unassigned edu_office');
      const unassigned = await req('/api/v1/analytics/regional-intelligence?region_id=1', { cookie: sess2.cookie });
      assert.strictEqual(unassigned.status, 403, 'unassigned edu_office was not fail-closed over HTTP (status ' + unassigned.status + ')');
    } finally {
      officer.office_id = savedOffice;
      officer.region_id = savedRegion;
    }

    server.close();
  });

  console.log('\nN-04/N-05 regression tests: ' + pass + '/' + (pass + fail) + ' passed');
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error('suite crashed:', e); process.exit(2); });
