'use strict';

/* Weighted partitioning and read-routing planner for high-enrollment schools.
   This module is pure/config-driven by default. It never opens sockets; db.js
   owns pg.Pool lifecycle and calls these helpers to decide where a query should go. */

const DEFAULT_HEAVY_THRESHOLD = 1000;
const DEFAULT_SHARDS = [
  { id: 'primary-a', weight: 1 },
  { id: 'primary-b', weight: 1 },
  { id: 'primary-c', weight: 1 },
  { id: 'heavy-a', weight: 4, dedicated: true }
];

function envInt(name, fallback, env) {
  const n = parseInt(((env || process.env)[name] || ''), 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function truthy(v) { return /^(1|true|yes|on)$/i.test(String(v || '').trim()); }
function isEnabled(env) { env = env || process.env; return truthy(env.PAYESH_WEIGHTED_PARTITIONING || env.WEIGHTED_PARTITIONING); }

function cleanShard(x, i) {
  if (!x) return null;
  const id = String(x.id || x.name || ('shard-' + (i + 1))).trim();
  if (!id) return null;
  const w = Number(x.weight);
  return {
    id,
    weight: Number.isFinite(w) && w > 0 ? w : 1,
    dedicated: !!x.dedicated,
    readReplica: x.readReplica || x.read_replica || null,
    primaryUrl: x.primaryUrl || x.primary_url || null
  };
}

function parseShardConfig(raw) {
  if (!raw) return DEFAULT_SHARDS.map(cleanShard).filter(Boolean);
  try {
    const parsed = JSON.parse(raw);
    const arr = Array.isArray(parsed) ? parsed : parsed.shards;
    if (Array.isArray(arr) && arr.length) return arr.map(cleanShard).filter(Boolean);
  } catch (e) {}
  const out = String(raw).split(',').map((part, i) => {
    const bits = part.trim().split(':');
    if (!bits[0]) return null;
    return cleanShard({ id: bits[0], weight: bits[1] ? Number(bits[1]) : 1, dedicated: /^heavy|dedicated/i.test(bits[0]) }, i);
  }).filter(Boolean);
  return out.length ? out : DEFAULT_SHARDS.map(cleanShard).filter(Boolean);
}

function parseReplicaUrls(raw) {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
  } catch (e) {}
  return String(raw).split(',').map(s => s.trim()).filter(Boolean);
}

function configFromEnv(env) {
  env = env || process.env;
  return {
    enabled: isEnabled(env),
    heavyThreshold: envInt('PAYESH_HEAVY_SCHOOL_THRESHOLD', DEFAULT_HEAVY_THRESHOLD, env),
    shards: parseShardConfig(env.PAYESH_SHARDS || env.PAYESH_WEIGHTED_SHARDS),
    readReplicas: parseReplicaUrls(env.DATABASE_READ_REPLICA_URLS || env.PAYESH_READ_REPLICA_URLS),
    defaultShardId: env.PAYESH_DEFAULT_SHARD || 'primary-a'
  };
}

function studentIdsFromUsers(users, schoolId) {
  const ids = new Set();
  for (const u of users || []) {
    if (!u || u.role !== 'student') continue;
    if (Number(u.school_id) === Number(schoolId)) ids.add(Number(u.id));
  }
  return ids;
}

function enrollmentCountsBySchool(store) {
  const counts = Object.create(null);
  const seen = Object.create(null);
  for (const e of (store && store.enrollments) || []) {
    const sid = Number(e && e.school_id);
    const stid = Number(e && e.student_id);
    if (!sid || !stid) continue;
    const key = sid + ':' + stid;
    if (seen[key]) continue;
    seen[key] = true;
    counts[sid] = (counts[sid] || 0) + 1;
  }
  /* Fallback for stores that have users but no enrollment table yet. */
  if (!Object.keys(counts).length && store && Array.isArray(store.users)) {
    for (const u of store.users) {
      if (u && u.role === 'student' && u.school_id) counts[Number(u.school_id)] = (counts[Number(u.school_id)] || 0) + 1;
    }
  }
  return counts;
}

function largeSchools(store, threshold) {
  const counts = enrollmentCountsBySchool(store);
  return Object.keys(counts).map(Number)
    .filter(id => counts[id] >= threshold)
    .sort((a, b) => counts[b] - counts[a])
    .map(id => ({ school_id: id, enrollment: counts[id] }));
}

function stableHashInt(input) {
  const s = String(input || '');
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

function weightedPick(shards, key) {
  const list = (shards && shards.length ? shards : DEFAULT_SHARDS).filter(s => s && s.weight > 0);
  const sum = list.reduce((a, s) => a + s.weight, 0) || 1;
  let n = stableHashInt(key) % sum;
  for (const s of list) {
    if (n < s.weight) return s;
    n -= s.weight;
  }
  return list[0];
}

function buildRoutingPlan(store, opts) {
  opts = Object.assign(configFromEnv(), opts || {});
  const counts = enrollmentCountsBySchool(store || {});
  const heavy = largeSchools(store || {}, opts.heavyThreshold);
  const heavySet = new Set(heavy.map(x => Number(x.school_id)));
  const shards = (opts.shards && opts.shards.length ? opts.shards : DEFAULT_SHARDS).map(cleanShard).filter(Boolean);
  const dedicated = shards.filter(s => s.dedicated);
  const shared = shards.filter(s => !s.dedicated);
  const routes = Object.create(null);

  Object.keys(counts).map(Number).sort((a, b) => a - b).forEach(schoolId => {
    const isHeavy = heavySet.has(schoolId);
    const pool = isHeavy && dedicated.length ? dedicated : (shared.length ? shared : shards);
    const shard = weightedPick(pool, schoolId);
    const replicaIdx = opts.readReplicas.length ? stableHashInt('r:' + schoolId) % opts.readReplicas.length : -1;
    routes[schoolId] = {
      school_id: schoolId,
      enrollment: counts[schoolId] || 0,
      heavy: isHeavy,
      shard_id: shard.id,
      shard_weight: shard.weight,
      read_replica_url: replicaIdx >= 0 ? opts.readReplicas[replicaIdx] : (shard.readReplica || null),
      read_replica_index: replicaIdx
    };
  });

  return {
    enabled: !!opts.enabled,
    threshold: opts.heavyThreshold,
    shards,
    readReplicas: opts.readReplicas,
    heavySchools: heavy,
    routes,
    generated_at: new Date().toISOString()
  };
}

function routeForSchool(plan, schoolId, operation) {
  const sid = Number(schoolId);
  const route = plan && plan.routes && plan.routes[sid];
  const op = operation || 'read';
  if (!route) {
    return { school_id: sid || null, heavy: false, target: 'primary', shard_id: (plan && plan.defaultShardId) || 'primary-a', reason: 'unknown_school' };
  }
  if (op === 'read' && route.heavy && route.read_replica_url) {
    return Object.assign({}, route, { target: 'read-replica', url: route.read_replica_url, reason: 'heavy_school_read' });
  }
  return Object.assign({}, route, { target: 'primary', reason: route.heavy ? 'heavy_school_write_or_no_replica' : 'normal_school' });
}

function metricsForPlan(plan) {
  const routes = Object.values((plan && plan.routes) || {});
  const byShard = Object.create(null);
  for (const r of routes) {
    byShard[r.shard_id] = byShard[r.shard_id] || { schools: 0, enrollment: 0, heavy_schools: 0 };
    byShard[r.shard_id].schools += 1;
    byShard[r.shard_id].enrollment += r.enrollment || 0;
    if (r.heavy) byShard[r.shard_id].heavy_schools += 1;
  }
  return {
    enabled: !!(plan && plan.enabled),
    threshold: plan && plan.threshold,
    schools: routes.length,
    heavy_schools: routes.filter(r => r.heavy).length,
    total_enrollment: routes.reduce((a, r) => a + (r.enrollment || 0), 0),
    shards: byShard,
    read_replicas: (plan && plan.readReplicas && plan.readReplicas.length) || 0
  };
}

function analyzeSchema(sql) {
  const tables = [];
  const re = /CREATE TABLE IF NOT EXISTS\s+([A-Za-z0-9_]+)\s*\(([\s\S]*?)\n\);/g;
  let m;
  while ((m = re.exec(sql || ''))) {
    const name = m[1];
    const body = m[2];
    const hasSchoolId = /"school_id"\s+INTEGER/.test(body);
    const hasSchoolFk = new RegExp('fk_' + name + '_school|FOREIGN KEY \\(school_id\\)', 'i').test(body);
    const idx = new RegExp('idx_' + name + '_school_id\\s+ON\\s+' + name + '\\s*\\(school_id\\)', 'i').test(sql || '');
    tables.push({ table: name, has_school_id: hasSchoolId, has_school_fk: hasSchoolFk, has_school_index: idx });
  }
  return tables;
}

module.exports = {
  DEFAULT_HEAVY_THRESHOLD,
  DEFAULT_SHARDS,
  configFromEnv,
  parseShardConfig,
  parseReplicaUrls,
  enrollmentCountsBySchool,
  largeSchools,
  stableHashInt,
  weightedPick,
  buildRoutingPlan,
  routeForSchool,
  metricsForPlan,
  analyzeSchema
};
