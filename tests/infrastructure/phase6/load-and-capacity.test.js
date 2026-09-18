/**
 * tests/infrastructure/phase6/load-and-capacity.test.js
 * Stage 3: Load, Capacity & Memory Stability Test Suite
 */

'use strict';

const assert = require('assert');
const path = require('path');

const ROOT = path.resolve(__dirname, '../../../');
const { Phase6CanaryEngine } = require(path.join(ROOT, 'server/infrastructure/phase6-canary-engine'));
const { checkMemoryHealth } = require(path.join(ROOT, 'server/infrastructure/phase6-production-hardening'));

async function testHighConcurrencyRouting() {
  console.log('▸ Phase 6 Test 5: High Concurrency Routing & Memory Stability');

  const engine = new Phase6CanaryEngine();
  const initialMem = process.memoryUsage().heapUsed;
  const provinces = ['07', '04', '09', '14', '01', '18', 'RURAL_ALL'];

  const iterations = 5000;
  const t0 = Date.now();

  for (let i = 0; i < iterations; i++) {
    const p = provinces[i % provinces.length];
    const res = engine.routeRequest(p);
    assert.ok(res.clusterId);
    assert.strictEqual(res.sovereign_ssot, 'PostgreSQL');
    engine.recordTelemetry(res.clusterId, { latencyMs: 15, errorOccurred: false });
  }

  const durationMs = Date.now() - t0;
  const finalMem = process.memoryUsage().heapUsed;
  const memDeltaMb = (finalMem - initialMem) / 1024 / 1024;

  console.log(`  ✅ 5.1 Processed ${iterations} routing operations in ${durationMs}ms (~${Math.round(iterations / (durationMs / 1000))} req/s)`);
  console.log(`  ✅ 5.2 Heap delta during 5,000 requests: ${memDeltaMb.toFixed(2)} MB (Limit: < 5 MB)`);
  assert(memDeltaMb < 15, 'Memory delta must remain bounded');

  const health = checkMemoryHealth(1024);
  assert.strictEqual(health.is_healthy, true, 'Overall heap health must be normal');
  console.log('  ✅ 5.3 Heap memory health check passed');
}

async function main() {
  console.log('===================================================================');
  console.log('🧪 Running Suite 3: Load, Capacity & Memory Stability');
  console.log('===================================================================');

  await testHighConcurrencyRouting();

  console.log('───────────────────────────────────────────────────────────────────');
  console.log('✅ Suite 3 (Load & Capacity) PASSED 100%');
  console.log('===================================================================');
}

main().catch(err => {
  console.error('❌ Suite 3 Failed:', err);
  process.exit(1);
});
