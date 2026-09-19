'use strict';

const postgres = require('./postgres-authority');
const cache = require('./cache-adapter');
const tx = require('./transaction-manager');
const audit = require('./audit-ledger');

async function hydrateControlPlane() {
  const provincial = require('../provincial-pilot-scaling');
  const region = require('../national-region-control-plane');
  const change = require('../change-management');
  const capacity = require('../national-capacity-enforcement');
  const noc = require('../../operations/national-operations-center');
  const events = require('../event-processing-layer');
  await provincial.refreshProvincialFromSoT();
  await region.refreshRegionsFromSoT();
  await change.refreshChangesFromSoT();
  await capacity.refreshReservationsFromSoT();
  await noc.refreshNocFromSoT();
  await events.refreshEventIdempotencyFromSoT();
  return true;
}

module.exports = {
  attach: postgres.attach,
  attached: postgres.attached,
  requireDb: postgres.requireDb,
  putState: postgres.putState,
  getState: postgres.getState,
  listState: postgres.listState,
  getTenantPolicy: postgres.getTenantPolicy,
  consumeNonce: postgres.consumeNonce,
  getCanaryState: postgres.getCanaryState,
  listCanaryConfigs: postgres.listCanaryConfigs,
  upsertCanaryConfig: postgres.upsertCanaryConfig,
  deleteCanaryConfig: postgres.deleteCanaryConfig,
  updateCanaryWeight: postgres.updateCanaryWeight,
  updateCanaryWeightWithAudit: postgres.updateCanaryWeightWithAudit,
  updateCanaryCircuitBreaker: postgres.updateCanaryCircuitBreaker,
  recordCanaryAuditEvent: postgres.recordCanaryAuditEvent,
  verifyAndRecordGovernanceNonce: postgres.verifyAndRecordGovernanceNonce,
  appendSystemAudit: postgres.appendSystemAudit,
  assertTenantPolicy: postgres.assertTenantPolicy,
  query: postgres.query,
  cache,
  withTransaction: tx.withTransaction,
  audit: audit.record,
  hydrateControlPlane
};
