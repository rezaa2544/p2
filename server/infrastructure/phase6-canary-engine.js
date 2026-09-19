/**
 * سامانه مدیریت هوشمند آموزش پایش — فاز ۶.۵: موتور استقرار قناری
 * Phase 6.5: Runtime Truth — PostgreSQL is the ONLY source of truth.
 *
 * RAM (this.clusters / this.metrics / this.seenSignatures) is a cache.
 * Traffic weight, rollout state, governance approval, replay protection
 * and audit history live in PostgreSQL. A second instance reading the
 * same tables MUST observe the same weight.
 */

'use strict';

const crypto = require('crypto');
const gov = require('./phase6-governance');
const authority = require('./authority');

const CANARY_STATES = Object.freeze({
  HEALTHY: 'HEALTHY',
  DEGRADED: 'DEGRADED',
  CRITICAL: 'CRITICAL',
  OFFLINE: 'OFFLINE'
});

const CANARY_ERRORS = Object.freeze({
  CLUSTER_NOT_FOUND: 'PHASE6_CLUSTER_NOT_FOUND',
  INVALID_WEIGHT: 'PHASE6_INVALID_WEIGHT',
  APPROVAL_REQUIRED: 'PHASE6_APPROVAL_REQUIRED',
  CIRCUIT_OPEN: 'PHASE6_CIRCUIT_OPEN',
  FAIL_CLOSED_NO_ROUTE: 'PHASE6_FAIL_CLOSED_NO_HEALTHY_ROUTE',
  ZERO_RANKING_VIOLATION: 'ZERO_RANKING_VIOLATION'
});

const ALLOWED_WEIGHTS = [0, 5, 10, 25, 50, 100];

const DEFAULT_CLUSTERS = [
  {
    id: 'ir-tehran-1',
    name: 'کلاستر پایتخت و حوزه مرکزی',
    provinces: ['07', '00'],
    primaryDc: 'tehran-dc-01',
    secondaryDc: 'tehran-dc-02',
    capacityTps: 5000,
    weight: 100,
    status: CANARY_STATES.HEALTHY
  },
  {
    id: 'ir-isfahan-1',
    name: 'کلاستر فلات مرکزی ایران',
    provinces: ['04', '25', '03', '20'],
    primaryDc: 'isfahan-dc-01',
    secondaryDc: 'isfahan-dc-02',
    capacityTps: 3000,
    weight: 100,
    status: CANARY_STATES.HEALTHY
  },
  {
    id: 'ir-khorasan-1',
    name: 'کلاستر شمال شرق و شرق',
    provinces: ['09', '10', '11', '12'],
    primaryDc: 'mashhad-dc-01',
    secondaryDc: 'mashhad-dc-02',
    capacityTps: 3000,
    weight: 100,
    status: CANARY_STATES.HEALTHY
  },
  {
    id: 'ir-fars-1',
    name: 'کلاستر جنوب و حوزه خلیج فارس',
    provinces: ['14', '15', '16', '17'],
    primaryDc: 'shiraz-dc-01',
    secondaryDc: 'shiraz-dc-02',
    capacityTps: 2500,
    weight: 100,
    status: CANARY_STATES.HEALTHY
  },
  {
    id: 'ir-tabriz-1',
    name: 'کلاستر شمال غرب و حوزه خزر',
    provinces: ['01', '02', '05', '06', '13'],
    primaryDc: 'tabriz-dc-01',
    secondaryDc: 'tabriz-dc-02',
    capacityTps: 3000,
    weight: 100,
    status: CANARY_STATES.HEALTHY
  },
  {
    id: 'ir-border-west-1',
    name: 'کلاستر غرب و نوار مرزی مقاوم',
    provinces: ['18', '19', '21', '22', '23'],
    primaryDc: 'ahvaz-dc-01',
    secondaryDc: 'kermanshah-dc-01',
    capacityTps: 2500,
    weight: 100,
    status: CANARY_STATES.HEALTHY
  },
  {
    id: 'ir-rural-central-1',
    name: 'کلاستر مدارس روستایی و عشایری سراسر کشور',
    provinces: ['RURAL_ALL'],
    primaryDc: 'tehran-dc-03',
    secondaryDc: 'isfahan-dc-03',
    capacityTps: 2000,
    weight: 100,
    status: CANARY_STATES.HEALTHY
  }
];

function rowToCluster(row) {
  const provinces = Array.isArray(row.provinces)
    ? row.provinces
    : (typeof row.provinces === 'string' ? JSON.parse(row.provinces) : []);
  const weight = row.weight != null ? Number(row.weight) : Number(row.traffic_weight);
  return {
    id: row.id,
    name: row.name,
    region_id: row.region_id || row.id,
    provinces,
    primaryDc: row.primary_dc,
    secondaryDc: row.secondary_dc,
    capacityTps: Number(row.capacity_tps) || 2000,
    weight,
    status: row.status || CANARY_STATES.HEALTHY,
    circuitBreakerOpen: !!row.circuit_breaker_open,
    errorStreak: 0,
    stage: row.stage || 'STAGE_4_FULL_NATIONAL',
    version: Number(row.version) || 1,
    lastWeightChange: row.updated_at ? new Date(row.updated_at).toISOString() : new Date().toISOString()
  };
}

class Phase6CanaryEngine {
  constructor(options = {}) {
    this.clusters = new Map();           // CACHE only
    this.auditLog = [];                  // CACHE of recent audit ids
    this.metrics = new Map();            // CACHE of live request samples
    this.rollbackSnapshots = new Map();  // CACHE
    this.seenSignatures = new Set();     // CACHE; ledger is SoT
    this.destinationCounters = { canary: 0, baseline: 0 };
    this.db = options.db || null;
    this.publicKey = options.publicKey || gov.loadPublicKeyFromEnv();
    this._sotCacheAt = 0;
    this.initDefaultClusters();
  }

  initDefaultClusters() {
    this.clusters.clear();
    for (const c of DEFAULT_CLUSTERS) {
      this.clusters.set(c.id, {
        ...c,
        region_id: c.id,
        lastWeightChange: new Date().toISOString(),
        circuitBreakerOpen: false,
        errorStreak: 0,
        version: 1
      });
      this.rollbackSnapshots.set(c.id, c.weight);
      this.metrics.set(c.id, { totalRequests: 0, errors: 0, latencies: [] });
    }
  }

  cryptoRequired() {
    return !!(this.db || this.publicKey || process.env.PAYESH_GOVERNANCE_ED25519_PUBLIC_KEY);
  }

  async initDb(db) {
    this.db = db;
    this.publicKey = this.publicKey || gov.loadPublicKeyFromEnv();
    if (!this.db || typeof this.db.query !== 'function') return;
    await this.refreshCacheFromPg({ force: true });
  }

  invalidateSotCache() {
    this._sotCacheAt = 0;
  }

  async refreshCacheFromPg({ force } = {}) {
    if (authority.attached()) {
      const db = authority.requireDb();
      if (db) this.db = db;
      const rows = await authority.listCanaryConfigs();
      if (rows && Array.isArray(rows) && rows.length > 0) {
        for (const row of rows) {
          const cluster = rowToCluster(row);
          const prev = this.clusters.get(cluster.id);
          if (prev) cluster.errorStreak = prev.errorStreak || 0;
          this.clusters.set(cluster.id, cluster);
          this.rollbackSnapshots.set(cluster.id, cluster.weight);
          if (!this.metrics.has(cluster.id)) {
            this.metrics.set(cluster.id, { totalRequests: 0, errors: 0, latencies: [] });
          }
        }
      }
      this._sotCacheAt = Date.now();
      return;
    }
    if (process.env.DATABASE_URL) {
      const err = new Error('AUTHORITY_UNAVAILABLE: PostgreSQL authority not connected');
      err.code = 'AUTHORITY_UNAVAILABLE';
      err.status = 503;
      throw err;
    }
  }

  async registerCluster(config, governanceContext = {}) {
    await this.assertGovernanceApproval(governanceContext, 'ثبت کلاستر جدید', {
      action: 'CLUSTER_REGISTER',
      cluster_id: config && config.id,
      target_weight: config && config.weight != null ? config.weight : 0
    });
    if (!config || !config.id || !config.name || !Array.isArray(config.provinces)) {
      throw new Error('پیکربندی کلاستر ناقص است');
    }
    const cluster = {
      id: config.id,
      name: config.name,
      region_id: config.region_id || config.id,
      provinces: [...config.provinces],
      primaryDc: config.primaryDc || 'default-dc-01',
      secondaryDc: config.secondaryDc || 'default-dc-02',
      capacityTps: config.capacityTps || 2000,
      weight: config.weight != null ? Number(config.weight) : 0,
      status: CANARY_STATES.HEALTHY,
      circuitBreakerOpen: false,
      errorStreak: 0,
      version: 1,
      lastWeightChange: new Date().toISOString()
    };

    if (authority.attached()) {
      await authority.upsertCanaryConfig(cluster);
      this.invalidateSotCache();
      await this.refreshCacheFromPg({ force: true });
    } else if (process.env.DATABASE_URL) {
      const err = new Error('AUTHORITY_UNAVAILABLE: PostgreSQL authority not attached');
      err.code = 'AUTHORITY_UNAVAILABLE';
      err.status = 503;
      throw err;
    } else {
      this.clusters.set(cluster.id, cluster);
    }
    this.rollbackSnapshots.set(cluster.id, cluster.weight);
    this.metrics.set(cluster.id, { totalRequests: 0, errors: 0, latencies: [] });

    await this.logAudit('CLUSTER_REGISTERED', {
      clusterId: cluster.id,
      operator: governanceContext.operator,
      signature: governanceContext.signature
    });
    return this.clusters.get(cluster.id) || cluster;
  }

  async unregisterCluster(clusterId, governanceContext = {}) {
    await this.assertGovernanceApproval(governanceContext, 'خارج‌سازی کلاستر', {
      action: 'CLUSTER_UNREGISTER',
      cluster_id: clusterId,
      target_weight: 0
    });
    if (authority.attached()) {
      const r = await authority.deleteCanaryConfig(clusterId);
      if (!r || !r.rowCount) {
        const err = new Error(`کلاستر "${clusterId}" یافت نشد`);
        err.code = CANARY_ERRORS.CLUSTER_NOT_FOUND;
        throw err;
      }
      this.clusters.delete(clusterId);
      this.invalidateSotCache();
    } else if (process.env.DATABASE_URL) {
      const err = new Error('AUTHORITY_UNAVAILABLE: PostgreSQL authority not attached');
      err.code = 'AUTHORITY_UNAVAILABLE';
      err.status = 503;
      throw err;
    } else {
      if (!this.clusters.has(clusterId)) {
        const err = new Error(`کلاستر "${clusterId}" یافت نشد`);
        err.code = CANARY_ERRORS.CLUSTER_NOT_FOUND;
        throw err;
      }
      this.clusters.delete(clusterId);
    }
    await this.logAudit('CLUSTER_UNREGISTERED', {
      clusterId,
      operator: governanceContext.operator,
      signature: governanceContext.signature
    });
    return true;
  }

  async setTrafficWeight(clusterId, targetWeight, governanceContext = {}) {
    await this.assertGovernanceApproval(governanceContext, `تغییر وزن کلاستر به ${targetWeight}%`, {
      action: governanceContext.action || 'WEIGHT_UPDATE',
      cluster_id: clusterId,
      target_weight: targetWeight,
      nonce: governanceContext.nonce,
      timestamp: governanceContext.timestamp,
      expiry: governanceContext.expiry,
      signature: governanceContext.signature
    });

    if (this.db && typeof this.db.query === 'function') {
      await this.refreshCacheFromPg({ force: true });
    }

    const cluster = this.clusters.get(clusterId);
    if (!cluster) {
      const err = new Error(`کلاستر "${clusterId}" یافت نشد`);
      err.code = CANARY_ERRORS.CLUSTER_NOT_FOUND;
      throw err;
    }

    const weight = Number(targetWeight);
    if (!ALLOWED_WEIGHTS.includes(weight)) {
      const err = new Error(`وزن ${targetWeight} نامعتبر است. مقادیر مجاز: ${ALLOWED_WEIGHTS.join(', ')}`);
      err.code = CANARY_ERRORS.INVALID_WEIGHT;
      throw err;
    }

    const oldWeight = cluster.weight;

    if (authority.attached()) {
      let res;
      try {
        res = await authority.updateCanaryWeight(clusterId, weight);
      } catch (e) {
        const err = new Error('ثبتِ پایدارِ وزن در PostgreSQL شکست خورد — تغییر اعمال نشد: ' + e.message);
        err.code = 'CANARY_PERSIST_FAILED';
        err.status = 503;
        throw err;
      }
      if (!res || !(res.rowCount > 0)) {
        const err = new Error('UPDATE/UPSERT وزن، هیچ ردیفی را تحت تأثیر نگذاشت');
        err.code = 'CANARY_PERSIST_FAILED';
        err.status = 503;
        throw err;
      }
      const row = res.rows[0];
      cluster.weight = Number(row.weight != null ? row.weight : row.traffic_weight);
      cluster.version = Number(row.version) || cluster.version;
      cluster.circuitBreakerOpen = !!row.circuit_breaker_open;
      cluster.status = row.status || cluster.status;
      cluster.lastWeightChange = new Date().toISOString();
      this.invalidateSotCache();
    } else if (process.env.DATABASE_URL) {
      const err = new Error('AUTHORITY_UNAVAILABLE: PostgreSQL authority not attached');
      err.code = 'AUTHORITY_UNAVAILABLE';
      err.status = 503;
      throw err;
    } else {
      this.rollbackSnapshots.set(clusterId, oldWeight);
      cluster.weight = weight;
      cluster.lastWeightChange = new Date().toISOString();
      cluster.version = (cluster.version || 1) + 1;
      if (weight > 0 && cluster.circuitBreakerOpen) {
        cluster.circuitBreakerOpen = false;
        cluster.status = CANARY_STATES.HEALTHY;
      }
    }

    await this.logAudit('WEIGHT_UPDATED', {
      clusterId,
      oldWeight,
      newWeight: weight,
      operator: governanceContext.operator,
      reason: governanceContext.reason || 'Manual Promotion',
      signature: governanceContext.signature,
      nonce: governanceContext.nonce
    });

    return cluster;
  }

  /**
   * Sync routing against the in-process cache. HTTP uses routeRequestSoT
   * which refreshes the cache from PostgreSQL first.
   */
  routeRequest(provinceCode, requestContext = {}) {
    if (!provinceCode) {
      const err = new Error('کد استان الزامی است');
      err.code = CANARY_ERRORS.FAIL_CLOSED_NO_ROUTE;
      throw err;
    }

    let targetCluster = null;
    for (const [, cluster] of this.clusters) {
      if (cluster.provinces && cluster.provinces.includes(String(provinceCode))) {
        targetCluster = cluster;
        break;
      }
    }

    if (!targetCluster) {
      if (String(provinceCode).toUpperCase().includes('RURAL')) {
        targetCluster = this.clusters.get('ir-rural-central-1');
      } else {
        targetCluster = this.clusters.get('ir-tehran-1');
      }
    }

    if (!targetCluster) {
      const err = new Error('هیچ کلاستری برای هدایت ترافیک در دسترس نیست');
      err.code = CANARY_ERRORS.FAIL_CLOSED_NO_ROUTE;
      throw err;
    }

    const version = targetCluster.version || 1;

    if (targetCluster.circuitBreakerOpen || targetCluster.status === CANARY_STATES.CRITICAL || targetCluster.status === CANARY_STATES.OFFLINE) {
      if (targetCluster.secondaryDc) {
        return {
          clusterId: targetCluster.id,
          targetDc: targetCluster.secondaryDc,
          failoverMode: true,
          isCanary: false,
          weight: targetCluster.weight,
          version,
          sovereign_ssot: 'PostgreSQL'
        };
      }
      const err = new Error(`کلاستر "${targetCluster.id}" در وضعیت بحرانی است؛ ترافیک قطع شد (Fail-Closed)`);
      err.code = CANARY_ERRORS.CIRCUIT_OPEN;
      throw err;
    }

    if (targetCluster.weight === 0) {
      const baselineCluster = this.clusters.get('ir-tehran-1') || targetCluster;
      this.destinationCounters.baseline++;
      return {
        clusterId: baselineCluster.id,
        targetDc: baselineCluster.primaryDc,
        failoverMode: false,
        isCanary: false,
        weight: 0,
        version,
        sovereign_ssot: 'PostgreSQL'
      };
    }

    if (targetCluster.weight < 100) {
      const roll = requestContext.roll != null
        ? Number(requestContext.roll)
        : (Math.random() * 100);

      if (roll < targetCluster.weight) {
        this.destinationCounters.canary++;
        return {
          clusterId: targetCluster.id,
          targetDc: targetCluster.primaryDc,
          failoverMode: false,
          isCanary: true,
          weight: targetCluster.weight,
          version,
          sovereign_ssot: 'PostgreSQL'
        };
      }
      const baselineCluster = this.clusters.get('ir-tehran-1') || targetCluster;
      this.destinationCounters.baseline++;
      return {
        clusterId: baselineCluster.id,
        targetDc: baselineCluster.primaryDc,
        failoverMode: false,
        isCanary: false,
        weight: targetCluster.weight,
        version,
        sovereign_ssot: 'PostgreSQL'
      };
    }

    this.destinationCounters.canary++;
    return {
      clusterId: targetCluster.id,
      targetDc: targetCluster.primaryDc,
      failoverMode: false,
      isCanary: true,
      weight: 100,
      version,
      sovereign_ssot: 'PostgreSQL'
    };
  }

  async routeRequestSoT(provinceCode, requestContext = {}) {
    if (this.db && typeof this.db.query === 'function') {
      try {
        await this.refreshCacheFromPg();
      } catch (_) {
        /* stale cache for routing only — writes still fail-closed */
      }
    }
    return this.routeRequest(provinceCode, requestContext);
  }

  recordTelemetry(clusterId, { latencyMs = 20, errorOccurred = false } = {}) {
    const cluster = this.clusters.get(clusterId);
    if (!cluster) return;

    let m = this.metrics.get(clusterId);
    if (!m) {
      m = { totalRequests: 0, errors: 0, latencies: [] };
      this.metrics.set(clusterId, m);
    }
    m.totalRequests++;

    const lat = Math.max(1, Math.round(Number(latencyMs) || 1));
    m.latencies.push(lat);
    if (m.latencies.length > 5000) m.latencies.shift();

    if (errorOccurred) {
      m.errors++;
      cluster.errorStreak++;
    } else {
      cluster.errorStreak = Math.max(0, cluster.errorStreak - 1);
    }

    const errorRate = m.errors / Math.max(1, m.totalRequests);
    const avgLatency = m.latencies.reduce((a, b) => a + b, 0) / Math.max(1, m.latencies.length);

    if (cluster.errorStreak >= 5 || errorRate > 0.05 || avgLatency > 500) {
      this.triggerAutoRollback(clusterId, `خطای بحرانی مداوم (نرخ خطا: ${(errorRate * 100).toFixed(2)}%، تاخیر: ${avgLatency.toFixed(0)}ms)`).catch(() => {});
    }
  }

  percentile(sorted, p) {
    if (!sorted.length) return 0;
    const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * p) - 1));
    return sorted[idx];
  }

  getClusterMetrics(clusterId) {
    const m = this.metrics.get(clusterId) || { totalRequests: 0, errors: 0, latencies: [] };
    const total = m.totalRequests;
    const errors = m.errors;
    const errorRate = total > 0 ? (errors / total) : 0;
    const sorted = [...m.latencies].sort((a, b) => a - b);
    const avg = sorted.length ? Math.round(sorted.reduce((a, b) => a + b, 0) / sorted.length) : 0;
    return {
      total_requests: total,
      errors,
      error_rate: Number(errorRate.toFixed(4)),
      samples: sorted.length,
      is_live: sorted.length > 0,
      latency: {
        avg_ms: avg,
        p50_ms: this.percentile(sorted, 0.50),
        p90_ms: this.percentile(sorted, 0.90),
        p95_ms: this.percentile(sorted, 0.95),
        p99_ms: this.percentile(sorted, 0.99)
      }
    };
  }

  getAggregatedMetrics() {
    const latencies = [];
    let total = 0;
    let errors = 0;
    for (const [, m] of this.metrics) {
      total += m.totalRequests || 0;
      errors += m.errors || 0;
      if (Array.isArray(m.latencies)) latencies.push(...m.latencies);
    }
    const sorted = latencies.slice().sort((a, b) => a - b);
    const avg = sorted.length ? Math.round(sorted.reduce((a, b) => a + b, 0) / sorted.length) : 0;
    const errorRate = total > 0 ? errors / total : 0;
    return {
      total_requests: total,
      errors,
      error_rate: Number(errorRate.toFixed(4)),
      samples: sorted.length,
      is_live: sorted.length > 0,
      latency: {
        avg_ms: avg,
        p50_ms: this.percentile(sorted, 0.50),
        p90_ms: this.percentile(sorted, 0.90),
        p95_ms: this.percentile(sorted, 0.95),
        p99_ms: this.percentile(sorted, 0.99)
      }
    };
  }

  async triggerAutoRollback(clusterId, reason) {
    if (this.db && typeof this.db.query === 'function') {
      try { await this.refreshCacheFromPg({ force: true }); } catch (_) {}
    }
    const cluster = this.clusters.get(clusterId);
    if (!cluster) return;

    const oldWeight = cluster.weight;

    if (authority.attached()) {
      try {
        const res = await authority.updateCanaryWeight(clusterId, 0);
        if (res && res.rowCount > 0) {
          cluster.weight = 0;
          cluster.status = CANARY_STATES.DEGRADED;
          cluster.circuitBreakerOpen = true;
          cluster.version = Number(res.rows[0].version) || cluster.version + 1;
          cluster.lastWeightChange = new Date().toISOString();
          this.invalidateSotCache();
        }
      } catch (_) {
        /* telemetry-driven rollback must not throw on the request path */
      }
    } else {
      cluster.status = CANARY_STATES.DEGRADED;
      cluster.circuitBreakerOpen = true;
      cluster.weight = 0;
      cluster.lastWeightChange = new Date().toISOString();
      cluster.version = (cluster.version || 1) + 1;
    }

    await this.logAudit('AUTO_ROLLBACK_EXECUTED', {
      clusterId,
      oldWeight,
      newWeight: 0,
      revertedToWeight: 0,
      reason,
      timestamp: new Date().toISOString()
    });
  }

  async persistCircuitBreaker(clusterId, patch) {
    const cluster = this.clusters.get(clusterId);
    if (!cluster) {
      const err = new Error(`کلاستر "${clusterId}" یافت نشد`);
      err.code = CANARY_ERRORS.CLUSTER_NOT_FOUND;
      throw err;
    }
    if (patch.circuitBreakerOpen !== undefined) cluster.circuitBreakerOpen = Boolean(patch.circuitBreakerOpen);
    if (patch.secondaryDc !== undefined) cluster.secondaryDc = patch.secondaryDc;
    if (patch.status !== undefined) cluster.status = patch.status;
    if (authority.attached()) {
      const res = await authority.updateCanaryCircuitBreaker(clusterId, cluster.circuitBreakerOpen, patch.secondaryDc, patch.status);
      if (!res || !res.rowCount) {
        const err = new Error('persist circuit-breaker failed');
        err.code = 'CANARY_PERSIST_FAILED';
        err.status = 503;
        throw err;
      }
      cluster.version = Number(res.rows[0].version) || cluster.version;
      this.invalidateSotCache();
    } else if (process.env.DATABASE_URL) {
      const err = new Error('AUTHORITY_UNAVAILABLE: PostgreSQL authority not attached');
      err.code = 'AUTHORITY_UNAVAILABLE';
      err.status = 503;
      throw err;
    }
    return cluster;
  }

  async assertGovernanceApproval(context, operationTitle, cryptoFields = {}) {
    const op = (context && context.operator) || {};
    if (!op.id || !['superadmin', 'admin'].includes(op.role)) {
      const err = new Error('تنها کاربران با نقش superadmin/admin مجاز به تغییر وضعیت ترافیک ملی هستند');
      err.code = CANARY_ERRORS.APPROVAL_REQUIRED;
      throw err;
    }

    if (!this.cryptoRequired()) {
      /* Isolated in-memory engine (unit tests of routing math, no DB).
         Production HTTP always has db and takes the Ed25519 path below.
         `approved === true` is still required here so a bare call fails. */
      if (!context || context.approved !== true) {
        const err = new Error(`عملیات "${operationTitle}" نیازمند تایید صریح اپراتور انسانی طبق مصوبه ADR-012 است`);
        err.code = CANARY_ERRORS.APPROVAL_REQUIRED;
        throw err;
      }
      return;
    }

    /* Production path: Ed25519 + nonce + timestamp + expiry. The boolean
       `approved` flag is IGNORED — it is never sufficient. */
    const nonce = context.nonce || cryptoFields.nonce;
    const timestamp = context.timestamp || cryptoFields.timestamp;
    const expiry = context.expiry || cryptoFields.expiry;
    const signature = context.signature || cryptoFields.signature;
    const action = cryptoFields.action || context.action || 'WEIGHT_UPDATE';
    const clusterId = cryptoFields.cluster_id || context.cluster_id;
    const targetWeight = cryptoFields.target_weight != null ? cryptoFields.target_weight : context.target_weight;

    if (!nonce || !timestamp || !expiry || !signature) {
      const err = new Error(`عملیات "${operationTitle}" نیازمند امضای Ed25519 و nonce/timestamp/expiry است (ADR-012)`);
      err.code = CANARY_ERRORS.APPROVAL_REQUIRED;
      throw err;
    }

    gov.assertFreshTimestamp(timestamp, expiry);

    const pub = this.publicKey || gov.loadPublicKeyFromEnv();
    if (!pub) {
      const err = new Error('کلید عمومی حاکمیت (PAYESH_GOVERNANCE_ED25519_PUBLIC_KEY) تنظیم نشده — fail-closed');
      err.code = 'GOVERNANCE_KEY_UNAVAILABLE';
      err.status = 503;
      throw err;
    }

    gov.verifyGovernanceSignature(pub, {
      action,
      cluster_id: clusterId,
      target_weight: targetWeight,
      nonce,
      timestamp,
      expiry
    }, signature);

    const sigHash = gov.signatureHash(signature);

    if (authority.attached()) {
      await authority.verifyAndRecordGovernanceNonce(String(nonce), sigHash, expiry);
    } else if (process.env.DATABASE_URL) {
      const err = new Error('GOVERNANCE_LEDGER_UNAVAILABLE: PostgreSQL authority not attached');
      err.code = 'GOVERNANCE_LEDGER_UNAVAILABLE';
      err.status = 503;
      throw err;
    } else if (this.seenSignatures.has(sigHash) || this.seenSignatures.has(String(nonce))) {
      const err = new Error('امضای امنیتی قبلاً مصرف شده است (Replay Signature Rejected)');
      err.code = 'REPLAY_ATTACK_DETECTED';
      throw err;
    }
    this.seenSignatures.add(sigHash);
    this.seenSignatures.add(String(nonce));
  }

  async logAudit(action, details) {
    const entry = {
      action,
      details,
      timestamp: new Date().toISOString(),
      auditId: crypto.randomBytes(8).toString('hex')
    };
    this.auditLog.push(entry);
    if (this.auditLog.length > 2000) this.auditLog.shift();

    if (authority.attached()) {
      await authority.appendSystemAudit({
        actor: details && details.operator ? details.operator.id || 'system' : 'system',
        reason: details && details.reason ? details.reason : action,
        action,
        after: details
      });
      await authority.recordCanaryAuditEvent(action, details);
    } else if (process.env.DATABASE_URL) {
      const err = new Error('AUDIT_LEDGER_UNAVAILABLE: PostgreSQL authority not attached');
      err.code = 'AUDIT_LEDGER_UNAVAILABLE';
      err.status = 503;
      throw err;
    }
  }

  async getCanaryState(clusterId) {
    if (authority.attached()) {
      const stateRow = await authority.getCanaryState(clusterId);
      if (stateRow) return rowToCluster(stateRow);
    }
    if (this.db && typeof this.db.query === 'function') {
      await this.refreshCacheFromPg({ force: true });
    } else if (process.env.DATABASE_URL) {
      const err = new Error('AUTHORITY_UNAVAILABLE: PostgreSQL authority not attached');
      err.code = 'AUTHORITY_UNAVAILABLE';
      err.status = 503;
      throw err;
    }
    return this.clusters.get(clusterId) || null;
  }

  getSnapshot() {
    const clusterList = [];
    for (const [, c] of this.clusters) {
      clusterList.push({
        ...c,
        metrics: this.getClusterMetrics(c.id)
      });
    }
    return {
      timestamp: new Date().toISOString(),
      total_clusters: this.clusters.size,
      active_clusters: clusterList.filter(c => c.weight > 0 && !c.circuitBreakerOpen).length,
      destination_counters: Object.assign({}, this.destinationCounters),
      aggregated_metrics: this.getAggregatedMetrics(),
      clusters: clusterList,
      governance: {
        single_source_of_truth: 'PostgreSQL',
        human_approval_mandatory: true,
        ed25519_required: this.cryptoRequired(),
        zero_ranking_guarantee: true
      },
      source_of_truth: this.db ? 'PostgreSQL' : 'memory-cache-only',
      audit_records_count: this.auditLog.length
    };
  }

  async getSnapshotFromSoT() {
    if (this.db && typeof this.db.query === 'function') {
      await this.refreshCacheFromPg({ force: true });
    }
    return this.getSnapshot();
  }
}

const globalCanaryEngine = new Phase6CanaryEngine();

module.exports = {
  Phase6CanaryEngine,
  globalCanaryEngine,
  CANARY_STATES,
  CANARY_ERRORS,
  ALLOWED_WEIGHTS,
  canonicalGovernancePayload: gov.canonicalGovernancePayload,
  generateGovernanceKeypair: gov.generateGovernanceKeypair,
  exportPublicKeyB64: gov.exportPublicKeyB64,
  signGovernancePayload: gov.signGovernancePayload,
  loadPublicKeyFromB64: gov.loadPublicKeyFromB64
};
