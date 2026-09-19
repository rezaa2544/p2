/**
 * Phase 7 — PostgreSQL Authority Gateway & Single Source of Truth
 *
 * PostgreSQL is the ONLY source of truth for:
 * - Canary traffic configuration (canary_state / phase6_canary_configs)
 * - Tenant Policy enforcement (tenant_policy)
 * - System Audit logging (system_audit)
 * - Governance Nonce consumption (phase6_replay_ledger)
 * - Control-plane state (authority_state)
 *
 * RAM Maps and Redis entries are CACHE ONLY.
 * No security decision may fall back to RAM maps when PostgreSQL is attached.
 */
'use strict';

const postgresAuthority = require('./postgres-authority');
const auditLedger = require('./audit-ledger');
const cacheAdapter = require('./cache-adapter');

function attach(db) {
  postgresAuthority.attach(db);
}

function attached() {
  return postgresAuthority.attached();
}

function requireDb() {
  return postgresAuthority.requireDb();
}

async function getCanaryState(clusterId) {
  if (clusterId) {
    const res = await postgresAuthority.query(
      'SELECT id, cluster, weight, version, updated_at, updated_by FROM canary_state WHERE id = $1 OR cluster = $1 LIMIT 1;',
      [String(clusterId)]
    );
    if (!res || !res.rows || !res.rows.length) return null;
    return res.rows[0];
  }
  const res = await postgresAuthority.query(
    'SELECT id, cluster, weight, version, updated_at, updated_by FROM canary_state;'
  );
  return (res && res.rows) || [];
}

async function verifyAndRecordGovernanceNonce(nonce, signatureHash, expiresAt) {
  return postgresAuthority.consumeNonce(nonce, signatureHash, expiresAt);
}

async function appendSystemAudit({ actor, reason, action, before, after }) {
  return auditLedger.record({ actor, reason, action, before, after });
}

async function assertTenantPolicy(province, school) {
  const policy = await postgresAuthority.getTenantPolicy(province, school);
  if (!policy) {
    // If attached and policy not found, or default fail-closed
    if (attached()) {
      const err = new Error(`TENANT_POLICY_VIOLATION: No tenant policy configured for province ${province}`);
      err.code = 'TENANT_POLICY_VIOLATION';
      err.status = 403;
      throw err;
    }
    return null;
  }
  return policy;
}

module.exports = {
  attach,
  attached,
  requireDb,
  getCanaryState,
  verifyAndRecordGovernanceNonce,
  appendSystemAudit,
  assertTenantPolicy,
  putState: postgresAuthority.putState,
  getState: postgresAuthority.getState,
  listState: postgresAuthority.listState,
  getTenantPolicy: postgresAuthority.getTenantPolicy,
  consumeNonce: postgresAuthority.consumeNonce,
  unavailable: postgresAuthority.unavailable,
  audit: auditLedger,
  cache: cacheAdapter
};
