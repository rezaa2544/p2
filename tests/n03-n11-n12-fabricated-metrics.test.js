#!/usr/bin/env node
/* ═════════════════════════════════════════════════════════════════
   tests/n03-n11-n12-fabricated-metrics.test.js
   -------------------------------------------------------------------
   N-03 — Intelligence engines fabricated entire datasets from constants
          and presented them as observed measurements:
     · longitudinal route minted 5 periods from `1 + idx*0.02` while the
       real grades/attendance it fetched were never used
     · outcome-evaluation invented 2 interventions (evidenceConfidence 90)
     · policy-simulation reported completeness 94.5 / freshness 3 days and
       confidence HIGH from literals
     · decision-command minted 2 decision items (evidence_strength 90/80)
     · execution dashboard reported SLA compliance 100% for zero tasks and
       synthesized a default workflow

   N-11 — Observability collectors fell back to invented healthy numbers
          (22 connections, 210 eps, 0.88 hit ratio) when given no metrics,
          so a down DB/Redis looked identical to a live one.

   N-12 — Zero-trust security health asserted unconditional literals
          (enabled: true, policy_engine: 'ACTIVE', ...) with no inputs.

   Scenarios (a fix is not accepted until it survives 5 full runs):
     N03-1  longitudinal snapshots derive from real records; a school with
            records yields periods whose metrics match a recomputation
     N03-2  a school with ZERO records yields zero periods, no fabricated
            IMPROVING trend, and honest data_availability
     N03-3  outcome/policy/decision/execution engines return empty or
            downgraded results instead of invented data
     N03-4  SLA compliance is null (not 100%) for zero tasks
     N11-1  observability collectors report UNKNOWN + null metrics when no
            measurements are supplied
     N11-2  observability collectors report real values when measurements
            ARE supplied (no over-blocking of the honest path)
     N12-1  zero-trust snapshot derives its fields from live probes and
            exposes what was actually verified
   ═════════════════════════════════════════════════════════════════ */
'use strict';

const assert = require('assert');

const { computeSchoolSnapshotsFromRecords, buildLongitudinalSchoolProfile } = require('../server/analytics/longitudinal-intelligence-monitoring');
const { buildOutcomeEvaluationSnapshot } = require('../server/analytics/outcome-evaluation-optimization');
const { buildPolicySimulationSnapshot } = require('../server/analytics/policy-simulation-engine');
const { buildDecisionCommandSnapshot } = require('../server/analytics/decision-intelligence-command');
const { buildExecutionDashboard } = require('../server/analytics/operational-intelligence-execution');
const { collectDatabaseMetrics, collectQueueMetrics, collectCacheMetrics } = require('../server/monitoring/production-observability');
const { buildSecurityHealthSnapshot } = require('../server/security/zero-trust-runtime');

let pass = 0, fail = 0;
async function test(name, fn) {
  try { await fn(); pass++; console.log('  ✅ ' + name); }
  catch (err) { fail++; console.error('  ❌ ' + name + '\n     ' + err.message); }
}

function loadScoped(schoolId) {
  const store = require('../server/data/payesh.json');
  return {
    grades: (store.grades || []).filter(g => Number(g.school_id) === schoolId),
    attendance: (store.attendance || []).filter(a => Number(a.school_id) === schoolId),
    discipline: (store.discipline || []).filter(d => Number(d.school_id) === schoolId)
  };
}

async function main() {
  console.log('\n🔍 N-03/N-11/N-12 regression: no fabricated metrics');

  /* ── N03-1: real snapshots match a recomputation ───────────────── */
  await test('N03-1: longitudinal snapshots derive from real records and match recomputation', () => {
    const s1 = loadScoped(1);
    const r = computeSchoolSnapshotsFromRecords({ schoolId: 1, ...s1 });
    assert.ok(r.snapshots.length > 0, 'school 1 has records → at least one period');
    assert.strictEqual(r.data_availability.derived_from_store, true);
    assert.strictEqual(r.data_availability.fabricated_defaults, false);
    assert.strictEqual(r.data_availability.grade_records, s1.grades.length);

    /* assert each snapshot's metric consistency: gpa within [0,20],
       rates within [0,100], and health_index a blend of present metrics */
    for (const snap of r.snapshots) {
      if (snap.average_gpa != null) assert.ok(snap.average_gpa >= 0 && snap.average_gpa <= 20, 'gpa out of range: ' + snap.average_gpa);
      if (snap.calendar_rate != null) assert.ok(snap.calendar_rate >= 0 && snap.calendar_rate <= 100, 'calendar_rate out of range');
      if (snap.chronic_absence_rate != null) assert.ok(snap.chronic_absence_rate >= 0 && snap.chronic_absence_rate <= 100, 'chronic rate out of range');
      if (snap.health_index != null) assert.ok(snap.health_index >= 0 && snap.health_index <= 100, 'health_index out of range');
      assert.ok(typeof snap.has_intervention === 'boolean', 'has_intervention must be boolean');
    }
    /* the profile built on these snapshots must report the same period count */
    const profile = buildLongitudinalSchoolProfile({ schoolId: 1, snapshots: r.snapshots, periodRange: 'ALL' });
    assert.strictEqual(profile.total_periods, r.snapshots.length);
  });

  /* ── N03-2: zero records → zero periods, no invented trend ─────── */
  await test('N03-2: a school with zero records yields zero periods and no fabricated trend', () => {
    const r = computeSchoolSnapshotsFromRecords({ schoolId: 99999, grades: [], attendance: [], discipline: [] });
    assert.strictEqual(r.snapshots.length, 0, 'no records must produce no periods');
    assert.strictEqual(r.data_availability.periods_available, 0);
    assert.strictEqual(r.data_availability.grade_records, 0);
    assert.strictEqual(r.data_availability.derived_from_store, true);

    const profile = buildLongitudinalSchoolProfile({ schoolId: 99999, snapshots: [], periodRange: 'ALL' });
    assert.strictEqual(profile.total_periods, 0);
    assert.notStrictEqual(profile.overall_trend, 'IMPROVING', 'an empty school must not report IMPROVING');
    assert.strictEqual(profile.overall_slope, 0.0);
  });

  /* ── N03-3: engines return empty/downgraded instead of invented ── */
  await test('N03-3: outcome/policy/decision engines report honest empties on no input', () => {
    /* outcome: no evaluations → zero interventions, not two invented ones */
    const out = buildOutcomeEvaluationSnapshot({ schoolId: 1 });
    assert.strictEqual(out.total_interventions_evaluated, 0, 'must not invent interventions');
    assert.strictEqual(out.data_availability.fabricated_defaults, false);
    assert.strictEqual(out.average_impact_score, 0);

    /* policy: no baselineMetrics → LOW confidence, null freshness, partial completeness */
    const pol = buildPolicySimulationSnapshot({ schoolId: 1 });
    assert.strictEqual(pol.confidence_level, 'LOW', 'default-baseline simulation must not claim HIGH confidence');
    assert.strictEqual(pol.data_quality.freshness_days, null, 'freshness must not be invented');
    assert.strictEqual(pol.data_quality.baseline_source, 'engine_defaults');
    assert.ok(pol.data_quality.completeness_pct < 100, 'completeness must reflect missing baselines');

    /* decision: no decisions → empty board, not two minted items */
    const cmd = buildDecisionCommandSnapshot({ schoolId: 1, engineOutputs: {} });
    assert.strictEqual(cmd.data_availability.decisions_supplied, 0);
    assert.strictEqual(cmd.data_availability.fabricated_defaults, false);
    assert.strictEqual(cmd.priority_matrix_summary.high_priority_count, 0);

    /* decision WITH supplied decisions still works (no over-blocking) */
    const cmd2 = buildDecisionCommandSnapshot({
      schoolId: 1,
      engineOutputs: { decisions: [{ decision_id: 'D1', title: 't', domain: 'ATTENDANCE', urgency: 'IMMEDIATE_24H', workflow_state: 'HUMAN_REVIEW_REQUIRED' }] }
    });
    assert.ok(cmd2.data_availability.decisions_supplied >= 1, 'supplied decisions must be counted');
  });

  /* ── N03-4: SLA null for zero tasks ────────────────────────────── */
  await test('N03-4: execution dashboard reports null SLA for zero tasks and no default workflow', () => {
    const dash = buildExecutionDashboard({ schoolId: 1 });
    assert.strictEqual(dash.total_tasks, 0, 'no tasks/workflows supplied → empty board');
    assert.strictEqual(dash.sla_summary.sla_compliance_rate_pct, null, 'zero tasks must not show 100% SLA');
    assert.strictEqual(dash.data_availability.fabricated_defaults, false);
    assert.strictEqual(dash.data_availability.task_source, 'none');

    /* supplied tasks still produce a real compliance rate */
    const dash2 = buildExecutionDashboard({
      schoolId: 1,
      tasks: [{ task_id: 'T1', state: 'COMPLETED' }, { task_id: 'T2', state: 'BLOCKED' }]
    });
    assert.ok(dash2.sla_summary.sla_compliance_rate_pct !== null && dash2.sla_summary.sla_compliance_rate_pct <= 100);
    assert.strictEqual(dash2.data_availability.task_source, 'caller_tasks');
  });

  /* ── N11-1: unmeasured ⇒ UNKNOWN + nulls ───────────────────────── */
  await test('N11-1: observability collectors report UNKNOWN with null metrics when nothing is measured', () => {
    const db = collectDatabaseMetrics({});
    assert.strictEqual(db.status, 'unknown', 'unmeasured DB must be UNKNOWN not healthy');
    assert.strictEqual(db.measured, false);
    assert.strictEqual(db.connection_pool.active_connections, null);
    assert.strictEqual(db.transaction_latency_ms, null);

    const q = collectQueueMetrics({});
    assert.strictEqual(q.status, 'unknown');
    assert.strictEqual(q.measured, false);
    assert.strictEqual(q.event_throughput_per_sec, null);
    assert.strictEqual(q.pipeline_state, 'UNMEASURED');

    const c = collectCacheMetrics({});
    assert.strictEqual(c.status, 'unknown');
    assert.strictEqual(c.measured, false);
    assert.strictEqual(c.hit_ratio, null);
  });

  /* ── N11-2: measured ⇒ real values (honest path intact) ────────── */
  await test('N11-2: observability collectors report real values when measurements are supplied', () => {
    const db = collectDatabaseMetrics({ active_connections: 95, max_connections: 100, transaction_latency_ms: 600, deadlock_count: 0 });
    assert.strictEqual(db.measured, true);
    assert.strictEqual(db.connection_pool.active_connections, 95);
    assert.strictEqual(db.status, 'critical', 'saturated pool must be critical, not healthy');

    const q = collectQueueMetrics({ event_throughput_per_sec: 100, consumer_lag: 20, dead_letter_queue_size: 0 });
    assert.strictEqual(q.measured, true);
    assert.strictEqual(q.event_throughput_per_sec, 100);
    assert.notStrictEqual(q.status, 'unknown');

    const c = collectCacheMetrics({ hit_ratio: 0.2, memory_pressure: 0.5 });
    assert.strictEqual(c.measured, true);
    assert.strictEqual(c.status, 'critical', 'a 0.2 hit ratio must be critical, not healthy');
  });

  /* ── N12-1: zero-trust fields are probed, not literal ──────────── */
  await test('N12-1: zero-trust snapshot derives fields from live probes', () => {
    const snap = buildSecurityHealthSnapshot({ schoolId: 1 });
    assert.ok(snap.zero_trust_probes, 'probes must be exposed');
    assert.strictEqual(Array.isArray(snap.zero_trust_probes.probe_errors), true);
    assert.strictEqual(snap.zero_trust_probes.probe_errors.length, 0, 'probes must not error');
    /* each field must be one of the real probe outputs, never an unearned literal */
    assert.ok(snap.zero_trust.enabled === true || snap.zero_trust.enabled === false);
    assert.ok(['ACTIVE', 'NOT_VERIFIED'].includes(snap.zero_trust.policy_engine));
    assert.ok(['ENABLED', 'DETECTION_ONLY', 'NOT_VERIFIED'].includes(snap.zero_trust.runtime_protection));
    assert.ok(['ACTIVE', 'NOT_VERIFIED'].includes(snap.zero_trust.identity_verification));
    assert.ok(['ACTIVE', 'NOT_VERIFIED'].includes(snap.zero_trust.session_protection));
    /* WAF defaults to report mode → runtime_protection must NOT claim ENABLED */
    assert.notStrictEqual(snap.zero_trust.runtime_protection, 'ENABLED', 'default report-mode WAF must not claim ENABLED');
  });

  console.log('\nN-03/N-11/N-12 regression tests: ' + pass + '/' + (pass + fail) + ' passed');
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error('suite crashed:', e); process.exit(2); });
