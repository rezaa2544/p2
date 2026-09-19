/**
 * Phase 6.5 — Canary runtime middleware.
 * Chain: HTTP → middleware → decision (PostgreSQL SoT) → headers → (caller records telemetry).
 *
 * Mandatory response headers (from a REAL request, never constants):
 *   X-Canary-ID        unique decision id
 *   X-Canary-Cluster   cluster that owns the province
 *   X-Canary-Version   config version from PostgreSQL
 */
'use strict';

const crypto = require('crypto');

async function applyCanaryRouting(req, res, engine) {
  const province = req.headers['x-province-code'] || '07';
  const rollRaw = req.headers['x-canary-roll'];
  const route = await engine.routeRequestSoT(province, {
    roll: rollRaw != null ? Number(rollRaw) : undefined
  });
  const canaryId = crypto.randomBytes(8).toString('hex');
  res.setHeader('X-Canary-ID', canaryId);
  res.setHeader('X-Canary-Cluster', String(route.clusterId || ''));
  res.setHeader('X-Canary-Version', String(route.version != null ? route.version : 1));
  res.setHeader('X-Canary-Destination', route.isCanary ? 'canary' : 'baseline');
  /* backward-compat aliases from earlier phases */
  res.setHeader('X-Payesh-Canary-Cluster', String(route.clusterId || ''));
  res.setHeader('X-Payesh-Target-DC', String(route.targetDc || ''));
  res.setHeader('X-Payesh-Canary-Destination', route.isCanary ? 'canary' : 'baseline');
  res.setHeader('X-Payesh-Canary-Weight', String(route.weight));
  res.setHeader('X-Payesh-Failover', route.failoverMode ? 'true' : 'false');
  req.canaryRoute = Object.assign({ canaryId }, route);
  return req.canaryRoute;
}

module.exports = { applyCanaryRouting };
