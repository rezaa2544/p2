#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   payesh-server — the real server for the single-file app
   -------------------------------------------------------------------
   Phase 1 of "connect to server" (docs/SERVER_SECURITY_CONTRACT.md):
     - static : serves the built index.html / USER_GUIDE.html
     - auth   : phone + code + national-id → JWT in HttpOnly cookie
                (server/auth.js — contract §2, §5.5)
     - sync   : POST /api/sync — the offline write queue
                (server/sync.js — contract §3)
     - scope  : GET /api/students/:id — reference IDOR endpoint
                (server/idor.js — contract §1.2, §5.7)
   Runtime deps: Node stdlib only (http, crypto, fs, path).
   The store is a JSON file (server/data/payesh.json) built by
   `node server/seed.js` from the deterministic demo world.
   ───────────────────────────────────────────────────────────────── */
'use strict';
/* Tracing اول از همه: باید پیش از http و ماژول‌هایِ instrumentشده بالا بیاید (OTel) */
const tracing = require('./tracing');
tracing.initTracing();
/* ویو ۱۴ (Observability) — سیگنالِ metrics. بدون وابستگیِ بیرونی و بدون
   side-effect در require: زمان‌بندِ نمونه‌برداری فقط در بوتِ سرور روشن می‌شود. */
const metrics = require('./metrics');
const waf = require('./waf'); /* P-WAF: report/enforce (P0 #6 — enforce با PAYESH_WAF_MODE=enforce) */
const csrf = require('./csrf'); /* Q3 red-team: same-origin gate for unsafe cookie writes */
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const { createAuth } = require('./auth');
const { createOtpStore } = require('./otp-store');
const { createSync, attach: syncAttach } = require('./sync');
const { createIdor } = require('./idor');
const { createBell } = require('./bell');
const { createPublicReport } = require('./public-report');
const { createAdmin } = require('./admin');
const { createHealthIndex } = require('./health-index'); /* G.1 */
const { createSms } = require('./sms');
const { createConflicts } = require('./conflicts');
const { createAudit, clientIp } = require('./audit');
const db = require('./db');
const redis = require('./redis');
const cache = require('./cache');
/* Delta Phase 4 (gap 1): sync backpressure uses the same distributed
   fixed-window limiter as auth (Redis live, in-memory dev fallback). */
const rateLimit = require('./rate-limit');
const revocation = require('./revocation'); /* Wave 6: ابطالِ توزیع‌شدهٔ مرحلهٔ REVOKE */

const { createStudentRoutes } = require('./routes/students');
const { createClassRoutes } = require('./routes/classes');
const { createAttendanceRoutes } = require('./routes/attendance');
const { createGradeRoutes } = require('./routes/grades');
const { createUserRoutes } = require('./routes/users');
const { createReportsRoutes } = require('./routes/reports'); /* Wave 23 — گزارش‌دهی پیشرفته */
const { createAnalyticsRoutes } = require('./routes/analytics'); /* P0-EI-09 — مرکز فرماندهی و هوشمندی مدرسه */
/* Phase 9.0 (Wiring Gate): اتصال هشت موتور آموزشیِ F-EI-01 به مسیر HTTP واقعی */
const { createSemanticAnalyticsRoutes } = require('./routes/semantic-analytics');
const { createBootstrapRoute } = require('./routes/bootstrap');
const { createSystemRoutes } = require('./routes/system'); /* Phase 4 — P1-SC-01: سلامت زیرساخت و مقیاس‌پذیری */
const { assertNationalCapacityEnforcement } = require('./infrastructure/national-capacity-enforcement'); /* Phase 5 — P2-NI-05: اینگرس مهار ظرفیت ملی */
const { globalCanaryEngine } = require('./infrastructure/phase6-canary-engine'); /* Phase 6: موتور استقرار قناری و هدایت ترافیک */
const { applyCanaryRouting } = require('./middleware/canary'); /* Phase 6.5: runtime canary headers from SoT */
const { assertTenantBoundary, sanitizePayload, resolveActorProvince } = require('./infrastructure/phase6-production-hardening'); /* Phase 6: گارد زیروترست و پالایش */
const authority = require('./infrastructure/authority'); /* Phase 7: PostgreSQL authority */
const { createIds } = require('./ids'); /* P0-16 */
const { createOutbox } = require('./outbox'); /* P0-17 */
const { createWorker } = require('./worker'); /* ویو ۸ — کارگرِ صندوق رویدادها */
const { createDeleteService } = require('./delete-service'); /* P0-17 */
const { createPull } = require('./pull');
const { createHeavyWorker } = require('./worker-service'); /* Wave 9 — رشتهٔ کارِ عملیاتِ سنگین */
const { createStaticCache } = require('./static-cache');   /* Wave 9 — کشِ استاتیک */
const { checkEnvFlags, mismatchWarning, wafModeWarning } = require('./env-flags'); /* SUSPECT-B + Phase 8.1 R15 */
const { createRuntimeMonitor } = require('./runtime-monitor'); /* Q3 runtime security signals */
const { createAttackDetector } = require('./attack-detector'); /* Q3 attack signatures */
const { createAbuseGuard } = require('./abuse-guard'); /* Q3 audit/metric/webhook egress */

/* SUSPECT-B (نشست ۲): ناهماهنگیِ پرچم‌هایِ تولید را بلند کن — رفتارِ بوت
   عوض نمی‌شود (T2 و redis-fallback §۶ همان رفتار را پین کرده‌اند)؛ فقط
   اپراتور می‌فهمد. قانونِ متعارف («هر دو production») در DEPLOY.md §۳. */
try {
  const __envf = checkEnvFlags(process.env);
  if(__envf.mismatch) console.warn(mismatchWarning(__envf));
}catch(e){}
/* Phase 8.1 (R15): production running the WAF in detect-only mode must say
   so loudly at boot (default stays `report` by design — staged rollout,
   RISK-S-007; the warning makes the deployment decision explicit). */
try {
  const __wafw = wafModeWarning(process.env);
  if(__wafw) console.warn(__wafw);
}catch(e){}

const ROOT = path.join(__dirname, '..');
const DATA_DIR = path.join(__dirname, 'data');
const STORE_FILE = process.env.PAYESH_STORE || path.join(DATA_DIR, 'payesh.json');
const OTP_FILE = process.env.PAYESH_OTP_FILE || path.join(path.dirname(STORE_FILE), 'otp.json');
const AUDIT_FILE = process.env.PAYESH_AUDIT || path.join(DATA_DIR, 'audit.log');
const KEY_FILE   = process.env.PAYESH_KEY   || path.join(DATA_DIR, 'jwt.key');

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';
const SESSION_NAME = 'payesh_session';
const SESSION_TTL_S = 28800;           /* 8h — one school day (contract §2.1) */
const CODE_TTL_MS = 5 * 60 * 1000;     /* 5 minutes */
const MAX_BATCH = 500;                 /* contract §3.3 */
const AT_DRIFT_MS = 24 * 3600 * 1000;  /* §3.3: do not reject, log */
/* (R97: نگهبانِ شمردنِ شناسه به سطحِ روتر منتقل شد — ثابت‌هایِ تازه
   کنارِ store تعریف شده‌اند.) */
/* Round 85 (P0-4): DEMO_CODE defaults to OFF. Echoing the login code in
   the HTTP response is a test-only convenience; in production the code
   comes from the real SMS gateway, so the echo must require an explicit
   opt-in: PAYESH_DEMO_CODE=1. (DEPLOY.md §env already documented this
   default — the code now matches the docs.) */
const DEMO_CODE_ECHO = (process.env.PAYESH_DEMO_CODE === '1') &&
  process.env.NODE_ENV !== 'production' &&
  process.env.PAYESH_ENV !== 'production';

/* ── store ────────────────────────────────────────────────────────── */
function loadStore(){
  if(!fs.existsSync(STORE_FILE)){
    /* Wave 1: with PostgreSQL configured, the file is only a bootstrap
       artifact — boot from an empty skeleton and hydrate from PG below. */
    if(process.env.DATABASE_URL){
      console.log('[store] no JSON file; DATABASE_URL set — booting skeleton for PG hydration');
      return { __processed_uids: {}, __revoked_jti: {}, __auth: { codes: {}, login_fail: {}, code_rate: {}, enum: {} } };
    }
    console.error('no store found: ' + STORE_FILE);
    console.error('run:  node server/seed.js   (builds it from the demo world)');
    process.exit(1);
  }
  /* Wave 24 (KPI-3): پارس مستقیم از Buffer — بدونِ ساختِ رشتهٔ میانیِ
     ~۵.۸MB در فضای JS (decode جدا ≈ ۲۲ms). V8 خودش UTF-8 را در مسیرِ
     سریع‌ترِ داخلی decode می‌کند: ~۵۸ms → ~۴۸ms روی استورِ مرجع. */
  const s = JSON.parse(fs.readFileSync(STORE_FILE));
  s.__processed_uids = s.__processed_uids || {};
  s.__revoked_jti    = s.__revoked_jti || {};
  s.__auth = s.__auth || { codes: {}, login_fail: {}, code_rate: {} };
  /* Wave 6: شمارندهٔ نگهبان به Redis رفت — نگه‌داشتنِ نسخهٔ قدیمی
     (فقط‌رشد و بدونِ GC در payesh.json) معنا ندارد. */
  if(s.__auth && s.__auth.enum) delete s.__auth.enum;
  return s;
}
const store = loadStore();
syncAttach(store);
/* بازخوردِ بازبینِ PR #94: وقتی هیدراتاسیون از PG عمداً سقف‌دار/بریده
   است (PAYESH_PG_HYDRATE_LIMIT/SKIP)، هیچ مسیری نباید این آینهٔ ناقص
   را روی store.json بنویسد (خاموشی، فال‌بکِ ورکر، خروجِ FATAL) — چون
   فایلِ کاملِ قبلی را می‌کُشد و بوتِ بدونِ PG فقط دادهٔ بریده می‌بیند.
   در PG-live مرجع PG است؛ فایلِ قدیمی دست‌نخورده می‌ماند. */
let mirrorIncomplete = false;

/* ── Wave 9 — رشتهٔ کارِ عملیاتِ سنگین ─────────────────────────────
   JSON.stringify(store) و نوشتنِ سنکرونِ فایل از رشتهٔ اصلی به ورکر
   می‌روند (persist هر ۲ ثانیه، بکاپ، گزارشِ عمومی). ورکر دیرزیاد و
   unref است؛ شکستش به مسیرِ سنکرونِ قدیمی برمی‌گردد (فال‌بک). */
const workers = createHeavyWorker({ getStore: () => store });
/* Wave 9 — کشِ استاتیک: خواندنِ async + اعتبارسنجیِ mtime (نه readFileSync در هر درخواست) */
const staticCache = createStaticCache();

/* ── database and caching layers initialization ── */
/* P0-1: dbReady is awaited by the boot gate at the bottom of this file, so a
   production process never calls listen() before the backing store is known
   good. Resolves to the db.init result, or null if init itself threw. */
const dbReady = db.init(store).then(async info => {
  /* Chat 2 remediation (P0-BUG-04): one-time mirror of the bootstrap JSON store
   into an empty PostgreSQL, FK-safe order, chunked, column-filtered against
   information_schema. Rows that cannot map are skipped and counted — the
   seed must never abort the boot. */
async function seedPgFromBootstrap(store, db) {
  const CHUNK = 100;
  const colsCache = {};
  const colsOf = async (t) => {
    if (!colsCache[t]) {
      const r = await db.query(`SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1`, [t]);
      colsCache[t] = new Set(r.rows.map(x => x.column_name));
    }
    return colsCache[t];
  };
  const ident = (n) => '"' + String(n).replace(/"/g, '""') + '"';
  const valOf = (v) => (v !== null && typeof v === 'object') ? JSON.stringify(v) : v;
  const names = Object.keys(store).filter((k) => /^[a-z][a-z0-9_]*$/.test(k) && Array.isArray(store[k]));
  const head = ['schools', 'users', 'subjects', 'classes'].filter((c) => names.includes(c));
  const tail = names.filter((c) => !head.includes(c));
  const seq = head.concat(tail);
  let rows = 0, tables = 0, skipped = 0;
  for (const col of seq) {
    let cols;
    try { cols = await colsOf(col); } catch (e) { continue; }
    if (!cols || !cols.size) continue;
    const arr = (store[col] || []).filter((r) => r && r.id != null);
    if (!arr.length) continue;
    tables++;
    for (let i = 0; i < arr.length; i += CHUNK) {
      const cleanRows = [];
      const fieldSet = new Set();
      for (const r of arr.slice(i, i + CHUNK)) {
        const data = {};
        for (const k of Object.keys(r)) {
          if (cols.has(k)) {
            let val = r[k];
            if (col === 'attendance' && (k === 'late_at' || k === 'exit_at') && typeof val === 'string' && /^\d{2}:\d{2}$/.test(val)) {
              val = (r.date || '2026-09-01') + 'T' + val + ':00Z';
            }
            data[k] = val;
            fieldSet.add(k);
          }
        }
        if (data.id != null) cleanRows.push(data);
      }
      if (!cleanRows.length) continue;

        /* F1 hardening: bootstrap JSON may contain legacy semantic grade strings while
         PostgreSQL keeps the numeric grade in a separate column. Preserve the
         semantic value in grade_level instead of letting a type error silently
         discard the whole row. */
      if (col === 'classes' && fieldSet.has('grade') && fieldSet.has('grade_level')) {
        for (const row of cleanRows) {
          if (row.grade != null && !Number.isFinite(Number(row.grade))) {
            if (row.grade_level == null) row.grade_level = String(row.grade);
            delete row.grade;
          }
        }
        fieldSet.delete('grade');
      }
      const rowFields = Array.from(fieldSet);
      try {
        await db.transaction(async (client) => {
          const params = [];
          const rowClauses = [];
          for (const row of cleanRows) {
            const placeholders = [];
            for (const f of rowFields) {
              const v = row[f] !== undefined ? row[f] : null;
              params.push(valOf(v));
              placeholders.push('$' + params.length);
            }
            rowClauses.push('(' + placeholders.join(', ') + ')');
          }
          const sql = 'INSERT INTO ' + ident(col) + ' (' + rowFields.map(ident).join(', ') + ') VALUES ' + rowClauses.join(', ') + ' ON CONFLICT DO NOTHING;';
          await client.query(sql, params);
        });
        rows += cleanRows.length;
      } catch (e) {
        /* F1: fallback is still fail-closed. A row that cannot be persisted is
           not allowed to disappear behind a green boot. */
        for (const row of cleanRows) {
          try {
            const fields = Object.keys(row);
            const params = fields.map(f => valOf(row[f]));
            const placeholders = fields.map((_, n) => '
}

/* P0-1: mirror of the cache/Redis readiness gate below. db.init now reports
     ok:false in production when PostgreSQL is absent/unreachable — the server
     must not serve traffic from the JSON store. */
  if (info && info.ok === false) {
    console.error('[FATAL] Database readiness failed:', info.error || info.warning || 'unknown');
    if (process.env.NODE_ENV === 'production' || process.env.PAYESH_ENV === 'production') {
      try { db.close(); } catch (e) {}
      process.exit(1);
    }
    return info;
  }
  if (info.driver === 'postgres') {
    console.log('[DB] Connected to PostgreSQL relational engine');
    /* Migration-012 contract, self-configured (Chat 2 remediation): on a chain-
       migrated database the grades/attendance tables are partitioned with PK
       (id, created_at) — writes only stay correct when PAYESH_PARTITIONED_TABLES
       lists them. Operators kept forgetting the env ⇒ every attendance/grades
       mirror write failed with `no unique ... for ON CONFLICT`. Detect once at
       boot and merge into the env (explicit operator value still wins). */
    try {
      const pr = await db.query(`SELECT c.relname FROM pg_partitioned_table pt JOIN pg_class c ON c.oid = pt.partrelid WHERE c.relname IN ('grades','attendance')`);
      const parts = pr.rows.map(x => x.relname);
      if (parts.length) {
        const cur = String(process.env.PAYESH_PARTITIONED_TABLES || '').split(',').map(x => x.trim()).filter(Boolean);
        const merged = [...new Set([...cur, ...parts])].join(',');
        if (cur.join(',') !== merged) {
          process.env.PAYESH_PARTITIONED_TABLES = merged;
          console.log('[DB] partitioned tables detected — PAYESH_PARTITIONED_TABLES=' + merged + ' (auto-configured, migration 012 contract)');
        }
      }
    } catch (e) { /* pre-012 database — nothing to configure */ }
    /* P0-BUG-04 fix (Chat 2 remediation, 2026-09-19): PG empty + a populated
       bootstrap JSON store ⇒ hydration would REPLACE the bootstrap data with
       empty arrays and the persist loop then overwrites the store FILE with an
       empty shell (auth dies, local data destroyed — reproduced live).
       Guard: when both users and schools are empty in PG and the bootstrap
       store has users, keep the bootstrap data this boot AND seed PostgreSQL
       from it once (mission option A+B combined) — PG becomes the real SSoT
       and the next boot hydrates normally. */
    let keepBootstrap = false;
    try {
      const er = await db.query('SELECT (SELECT COUNT(*) FROM users) AS u, (SELECT COUNT(*) FROM schools) AS s');
      const pgEmpty = Number(er.rows[0].u) === 0 && Number(er.rows[0].s) === 0;
      keepBootstrap = pgEmpty && Array.isArray(store.users) && store.users.length > 0
        && process.env.PAYESH_FORCE_HYDRATION !== '1';   /* B7: explicit force overrides the guard */
    } catch (e) { /* tables missing ⇒ not a clean-empty PG — hydrate as before */ }
    if (keepBootstrap) {
      console.log('[store] PG is empty and a bootstrap JSON store is present — hydration SKIPPED (P0-BUG-04 guard); seeding PG from the bootstrap store now (one-time)...');
      const r = await seedPgFromBootstrap(store, db);
      console.log('[store] bootstrap→PG seed done: ' + r.rows + ' row(s) / ' + r.tables + ' table(s)');
    } else
    /* Wave 1: PG is authoritative — replace store domain collections with
       PG truth at boot (per-table failures warn and keep going). */
    try {
      const h = await db.hydrateStoreFromPg(store);
      mirrorIncomplete = db.shouldPersistMirrorFile(db.isPostgres(), h) === false;
      if (mirrorIncomplete) {
        console.warn('[store] mirror incomplete (capped/env-skipped hydration) — JSON file persist DISABLED: a trimmed snapshot must never overwrite the full store file (PG is authoritative)');
      }
      if (db.hydrationUsersCapped && db.hydrationUsersCapped(h)) {
        console.warn('[store] WARNING: users hydration is capped — users beyond the cap CANNOT authenticate; PAYESH_PG_HYDRATE_LIMIT is for load-test/staging sandboxes only (see docs/WAVE18_LOAD_TEST_REPORT.md §5-4)');
      }
      console.log('[DB] Hydrated ' + h.hydrated + ' collections from PostgreSQL' +
        (h.skipped.length ? ' (skipped: ' + h.skipped.join(',') + ')' : '') +
        (h.capped && h.capped.length ? ' (capped: ' + h.capped.join(',') + ')' : '') +
        (h.env_skipped && h.env_skipped.length ? ' (env-skipped: ' + h.env_skipped.join(',') + ')' : ''));
    } catch (e) { console.warn('[DB] Hydration warning:', e.message); }
    try {
      require('./infrastructure/ops-kv').attach(db);
      await require('./infrastructure/national-traffic-fabric').refreshTrafficFromSoT();
      console.log('[OPS-KV] attached — Phase-5 traffic fabric hydrates from phase6_ops_kv');
    } catch (e) {
      console.error('[OPS-KV] attach/hydrate failed:', e && e.message);
      if (process.env.NODE_ENV === 'production' || process.env.PAYESH_ENV === 'production') throw e;
    }
    try {
      authority.attach(db);
      await authority.hydrateControlPlane();
      console.log('[AUTHORITY] attached + control-plane hydrated from PostgreSQL');
    } catch (e) {
      console.error('[AUTHORITY] attach/hydrate failed:', e && e.message);
      if (process.env.DATABASE_URL) throw e;
    }
  }
  return info;
}).catch(err => {
  console.warn('[DB] PostgreSQL init warning:', err.message);
  return null;
});

/* A-22 (re-audit): شکلِ productionِ یکپارچه — همان تعریفی که redis.js
   (isProduction/prodRethrow/prodNoRedis) برایِ الزامِ ردیس به کار می‌برد.
   هر استقراری که REDIS_URL یا DATABASE_URL دارد production محسوب می‌شود؛
   در غیرِ این صورت NODE_ENV، و سپس PAYESH_ENV (با ALLOW_MEMORY_FALLBACK برای
   dev/test). این تابع تنها ملاکِ «بوت نباید بدونِ کشِ مشترک ادامه یابد»
   است و در مسیرهایِ پایینِ cache.init آمده است. */
function isProdShape() {
  if (process.env.REDIS_URL || process.env.DATABASE_URL) return true;
  if (process.env.NODE_ENV === 'production') return true;
  if (process.env.ALLOW_MEMORY_FALLBACK === '1' || process.env.ALLOW_MEMORY_FALLBACK === 'true') return false;
  return process.env.PAYESH_ENV === 'production';
}

/* P1: آماده‌سازیِ کش باید پیش از باز شدنِ سوکت به نتیجه برسد. پیش از این
   fire-and-forget بود: با ردیسِ پیکربندی‌شده اما غیرقابلِ دسترس، redis.init
   تا ۳ ثانیه طول می‌کشید و server.listen در همین پنجره سوکت را باز می‌کرد —
   یعنی درخواست‌ها سرو می‌شدند پیش از آنکه دروازهٔ بوتِ ردیس بتواند
   process.exit(1) کند. startListening اکنون cacheReady را هم await می‌کند. */
const cacheReady = cache.init().then((r) => {
  if (r && r.ok === false) {
    /* P0-13: در تولید بدونِ ردیسِ زنده سرویس نمی‌دهیم — فال‌بک به حافظهٔ
       محلی بین نمونه‌ها واگرا می‌شود. خروجی غیرصفر = شکستِ ریدی. */
    console.error('[FATAL] Cache readiness failed:', r.error || r.warning || 'unknown');
    /* Phase 8.1 (R5): the fail-fast predicate now covers every
       production-equivalent shape, not only NODE_ENV. Previously a boot that
       declared just PAYESH_ENV=production — or set DATABASE_URL with no
       production flag (PostgreSQL mode; redis.js isProduction() treats it as
       production for fail-closed) — logged this FATAL but kept listening
       forever with health=503: a zombie startup. A configured-but-unreachable
       Redis at boot keeps the same exit (Wave-15 boot contract); runtime
       outages after a healthy boot remain loud degradation (readiness 503,
       reconnect loop), unchanged.
       A-22 (re-audit): این مسیرِ انتهایی همچنین باید شکلِ «فقط REDIS_URL» را
       بپوشاند. redis.js هر استقراری که REDIS_URL دارد به‌عنوانِ تولید می‌بیند
       (prodRethrow/prodNoRedis به همین معنا fail-closed می‌شوند)، ولی این
       مسیر فقط NODE_ENV/PAYESH_ENV/DATABASE_URL را می‌سنجید. نتیجه: سرور
       با ردیسِ پیکربندی‌شده ولی مرده بالا می‌آمد، health=۵۰۳ می‌داد ولی
       همچنان ترافیک سرو می‌کرد و ابطال در هر درخواست fail-open می‌شد.
       (اثبات: tests/reaudit-redis-outage.js S1) */
    if (isProdShape()) {
      try { persistStore(); } catch (e) {}
      try { db.close(); } catch (e) {}
      process.exit(1);
    }
    return;
  }
  if (redis.isRedis()) {
    console.log('[Cache] Redis distributed caching and pub/sub active');
  }
}).catch((err) => {
  console.error('[FATAL] Cache init crashed:', (err && err.message) || err);
  if (isProdShape()) process.exit(1);
});

/* ── R97 (TODO 2.7) — نگهبانِ شمردنِ شناسه، سطحِ روتر ──────────────
   هر رد (401/403/404) برایِ هر نشست در پنجرهٔ ۱۰ دقیقه شمرده می‌شود:
     ≥ WARN   → auditِ هشدار
     ≥ SLOW1  → تأخیرِ ۵۰۰ms روی درخواست‌هایِ بعدیِ همان نشست
     ≥ SLOW2  → تأخیرِ ۲s
     ≥ REVOKE → ابطالِ نشست (jti) — ادامه = 401
   /api/auth/* مستثنی است (cooldown/سقف‌هایِ OTP سقفِ خودشان را دارند). */
const ENUM_WINDOW_MS = 10 * 60 * 1000;
const _num = (v, d) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : d; };
const ENUM_WARN   = _num(process.env.PAYESH_ENUM_WARN, 20);
const ENUM_SLOW1  = _num(process.env.PAYESH_ENUM_SLOW1, 100);
const ENUM_SLOW2  = _num(process.env.PAYESH_ENUM_SLOW2, 500);
const ENUM_REVOKE = _num(process.env.PAYESH_ENUM_REVOKE, 2000);
const REQ_STATE = { sess: null };
/* Wave 6: شمارندهٔ نگهبان روی Redis — پنجرهٔ ۱۰ دقیقه با TTL؛ بین نمونه‌ها
   مشترک (پیش‌تر درون‌فروشگاهی بود و چرخشِ حمله بین نمونه‌ها آن را صفر
   می‌کرد؛ هم‌چنین در payesh.json بدونِ GC رشدِ بی‌پایان داشت). */
const ENUM_TTL_S = ENUM_WINDOW_MS / 1000;
function enumKey(sess){ return 'payesh:enum:' + sess.jti; }
async function enumTouch(sess){
  try{
    return await redis.incrWithTtl(enumKey(sess), ENUM_TTL_S);
  }catch(e){ return 0; } /* خطای ردیس = شمارِ این درخواست گم می‌شود (سکوت) — پنجرهٔ بعدی از نو می‌شمارد */
}
async function enumRead(sess){
  try{
    const v = await redis.get(enumKey(sess));
    const n = v == null ? 0 : parseInt(v, 10);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }catch(e){ return 0; }
}
function enumDelayMs(n){
  if(n >= ENUM_SLOW2) return 2000;
  if(n >= ENUM_SLOW1) return 500;
  return 0;
}
/* R97 — مراحلِ نگهبان (هشدار/تأخیر/ابطال)؛ Wave 6: ورودی = nِ شمارندهٔ ردیس.
   ابطال در REVOKE هم توزیع‌شده می‌شود (denylistِ Redis) — پیش‌تر فقط محلی بود. */
function enumStage(n, sess){
  if(n === ENUM_WARN) audit('enum_warn', { user_id: sess.id, n });
  else if(n === ENUM_SLOW1) audit('enum_slow', { user_id: sess.id, n, delay_ms: 500 });
  else if(n === ENUM_SLOW2) audit('enum_slow2', { user_id: sess.id, n, delay_ms: 2000 });
  else if(n === ENUM_REVOKE){
    store.__revoked_jti[sess.jti] = { at: Date.now(), reason: 'enumeration' };
    revocation.revokeSession(sess.jti, SESSION_TTL_S).catch(() => {});
    audit('enum_revoke', { user_id: sess.id, n });
  }
}

let dirty = false;
function markDirty(){ dirty = true; workers.bump(); }

/* ── GC of internal state (دور ۸۵ P1-3 — AD ۸۵.۲) ─────────────
   سه نقشهٔ فقط-رشد:
   __processed_uids — ایدمپوتانس؛ صفِ کلاینت‌ها عمرش کمتر از ۳۰ روز
     است، پس uidهایِ کهنه‌تر هرگز دوباره ارسال نمی‌شوند. ری‌پلایِ
     یک uidِ کهنه پس از GC با قرارداد سازگار است (ایدمپوتانس در
     حدِ عمرِ صف برقرار است).
   __revoked_jti — فقط در حدِ TTLِ نشست (۸h، بند ۲.۱) معنا دارد.
   (R101: __auth.codes به otp.json رفت — جارویش با همان فایل است.)
   در حلقهٔ persist اجرا می‌شود: سه جارو O(n) ناچیز؛ payesh.json
   (و بکاپ‌هایش) دیگر بی‌پایان رشد نمی‌کنند. */
const UID_GC_MS = 30 * 24 * 3600 * 1000;
const JTI_GC_MS = SESSION_TTL_S * 1000;
function gcStore(){
  const now = Date.now();
  let n = 0;
  /* logout stores a scalar timestamp, while the enumeration guard stores
     { at, reason }. Normalize both shapes before applying the retention
     window; subtracting an object yields NaN and made those entries live
     forever in a long-running process. Invalid internal timestamps are
     discarded as unusable state so the maps remain bounded. */
  const timestampOf = (value) => {
    if (typeof value === 'number') return value;
    if (value && typeof value === 'object') return Number(value.at);
    return Number(value);
  };
  const expired = (value, ttl) => {
    const at = timestampOf(value);
    return !Number.isFinite(at) || now - at > ttl;
  };
  for(const k in store.__processed_uids){
    if(expired(store.__processed_uids[k], UID_GC_MS)){ delete store.__processed_uids[k]; n++; }
  }
  for(const k in store.__revoked_jti){
    if(expired(store.__revoked_jti[k], JTI_GC_MS)){ delete store.__revoked_jti[k]; n++; }
  }
  return n;
}
/* ── Wave 9 — persist بیرون از رشتهٔ اصلی ──────────────────────────
   مسیرِ عادی (تیکرِ ۲ ثانیه): اسنپ‌شات با structured clone به ورکر
   می‌رود؛ JSON.stringify و نوشتنِ فایل در رشتهٔ پس‌زمینه انجام می‌شود.
   تازگیِ داده با نسخه‌ها تضمین می‌شود (workers.bump در markDirty):
   هر جهشِ حینِ پرواز دوباره dirty می‌کند و چرخهٔ بعدی می‌نویسد.
   هم‌جوشی: اگر نوشتنِ قبلی هنوز در جریان است، فقط پرچم می‌خورد. */
let persistBusy = false;    /* نوشتنِ ورکر در جریان است */
let persistQueued = false;  /* حینِ پرواز دوباره کثیف شد */
function persistStore(){
  /* PR #94 review-guard: با آینهٔ سقف‌دار، فایل هرگز با اسنپ‌شاتِ بریده
     بازنویسی نمی‌شود (این مسیرِ FATAL/فال‌بک هم هست). شرط عمداً فقط
     mirrorIncomplete است، نه isPostgres(): در خاموشی، db.close() پیش از
     رویدادِ exit اجرا می‌شود و isPostgres() دیگر false است — تصمیم باید
     با snapshotِ بوت قفل بماند (یافتهٔ آزمونِ لایو). */
  if(mirrorIncomplete) return;
  if(!dirty) return;
  if(persistBusy){ persistQueued = true; return; }
  dirty = false; /* نقطهٔ اسنپ‌شات — جهشِ بعدی دوباره کثیف می‌کند */
  const gc = gcStore();
  if(gc) try { audit('store_gc', { removed: gc }); } catch(e){}
  persistBusy = true;
  workers.runPersist(STORE_FILE).then(() => {
    persistBusy = false;
    if(persistQueued || dirty){ persistQueued = false; persistStore(); }
  }).catch(() => {
    persistBusy = false;
    persistStoreSync(); /* ورکر در دسترس نیست → مسیرِ سنکرونِ قدیمی */
  });
}
/* مسیرِ سنکرون — فقط خاموشی (exit/SIGTERM/SIGINT) و فال‌بکِ خطای ورکر؛
   هرگز در مسیرِ درخواست یا تیکرِ دوره‌ای صدا نمی‌شود. */
function persistStoreSync(){
  /* همان گارد — مسیرِ خاموشی (exit/SIGTERM/SIGINT) و فال‌بکِ ورکر.
     مستقل از isPostgres(): در exit بعد از db.close() اتصال مرده است ولی
     آینه هنوز بریده است — نباید نوشت. */
  if(mirrorIncomplete) return;
  if(!dirty && !persistBusy && !persistQueued) return;
  dirty = false; persistQueued = false;
  const gc = gcStore();
  if(gc) try { audit('store_gc', { removed: gc }); } catch(e){}
  try{
    const tmp = STORE_FILE + '.tmp';
    /* Wave 24 (KPI-3): همان قالبِ ASCII-escapedِ ورکر — پارسِ بوتِ بعدی سریع‌تر.
       این مسیر فقط در خاموشی/فال‌بک اجرا می‌شود؛ ~۴۰ms اضافه بی‌اثر است. */
    fs.writeFileSync(tmp, require('./json-fast').stringifyAscii(store), { encoding: 'utf8', mode: 0o600 }); /* S-73-3: PII — owner-only */
    fs.renameSync(tmp, STORE_FILE);
    try{ fs.chmodSync(STORE_FILE, 0o600); }catch(e){}
  }catch(e){ /* store file may be gone (tests) — never crash on exit */ }
}
/* P0-1: the periodic JSON mirror must never run in production. If PostgreSQL
   drops mid-session, isPostgres() goes false — writing payesh.json at that
   point would silently fork state per instance, which is exactly what the boot
   gate refuses. Production therefore logs FATAL once and leaves readiness red
   (db.healthCheck() → ok:false) instead of persisting JSON. */
let pgLostWarned = false;
setInterval(() => {
  if (db.isPostgres()) return;
  if (db.memoryFallbackAllowed()) { persistStore(); return; }
  if (!pgLostWarned) {
    pgLostWarned = true;
    console.error('[FATAL] PostgreSQL is not active in production — JSON/in-memory persistence stays DISABLED (writes must fail loudly, not fork per instance)');
  }
}, 2000).unref(); /* Wave 1: no periodic JSON persist in PG mode */
process.on('exit', () => {
  try { worker.stop(); } catch (e) {}
  persistStoreSync();
  try{ if(typeof auditLogger.flushSync === 'function') auditLogger.flushSync(); }catch(e){}
});
/* Wave 15: SIGTERM/SIGINT → handleShutdown (drain + close ناهمگام) —
   ثبتِ آن در پایینی فایل است؛ رویدادِ exit فقط کارِ همگام انجام می‌دهد
   (در رویدادِ exit promise‌ها هرگز به‌جا نمی‌رسند). */

/* ── JWT secret (env, or generated once; never committed) ──────────── */
/* P0#2 (چندنمونه‌ای): در production با بک‌اندِ مشترک (Redis/PG) کلیدِ نشست
   باید **مشترک** باشد — اگر env نباشد، هر instance کلیدِ خودش را روی
   دیسکِ محلی تولید می‌کند و توکنِ صادرشده در A در B نامعتبر می‌شود
   (جلساتِ چندنمونه‌ای ساکت می‌شکنند). ⇒ fail-fast در استارت.
   تک‌نمونهٔ production بدون Redis/PG دست‌نخورده می‌ماند (حالتِ پیشین). */
const SHARED_BACKEND_CONFIGURED = !!(process.env.REDIS_URL || process.env.REDIS_CLUSTER_NODES
  || process.env.REDIS_SENTINELS || process.env.DATABASE_URL);
if((process.env.PAYESH_ENV === 'production' || process.env.NODE_ENV === 'production')
   && !process.env.PAYESH_JWT_SECRET && SHARED_BACKEND_CONFIGURED){
  console.error('Error: production with shared state (Redis/PostgreSQL) requires a shared PAYESH_JWT_SECRET — the auto-generated per-instance key makes tokens valid only on the issuing instance (multi-instance sessions break). Set the same PAYESH_JWT_SECRET (>=32 bytes) in every instance.');
  process.exit(1);
}
let JWT_SECRET = process.env.PAYESH_JWT_SECRET || null;
if(!JWT_SECRET){
  if(fs.existsSync(KEY_FILE)) JWT_SECRET = fs.readFileSync(KEY_FILE, 'utf8').trim();
  else{
    JWT_SECRET = crypto.randomBytes(32).toString('hex');
    fs.mkdirSync(path.dirname(KEY_FILE), { recursive: true });
    fs.writeFileSync(KEY_FILE, JWT_SECRET, { mode: 0o600 });
    console.log('generated JWT secret -> ' + KEY_FILE);
  }
}
/* R96 P0-3: کلیدِ HS256 باید حداقل 256 بیت باشد — کلیدِ ضعیف، استارت را
   می‌کُشد تا مجبور به rotation شود (خارج از repository). */
if(Buffer.byteLength(JWT_SECRET, 'utf8') < 32){
  console.error('Error: JWT key shorter than 256 bits — rotate it (set PAYESH_JWT_SECRET or regenerate ' + KEY_FILE + ')');
  process.exit(1);
}
/* R96 P0-3: rotation — کلیدِ قبلی برایِ مدتِ عمرِ نشست‌ها معتبر می‌ماند */
const JWT_PREV_SECRET = (process.env.PAYESH_JWT_SECRET_PREV || '').trim() || null;
/* Delta Phase 4 (gap 3): خاستگاهِ کلیدِ امضا — سلامتِ کرسر همین را
   بازمی‌گوید (env پایدارِ config / keyfile پایدارِ دیسک). */
const JWT_KEY_ORIGIN = process.env.PAYESH_JWT_SECRET ? 'env' : 'keyfile';

/* ── audit log (append-only, sanitized: no phone / nid / password) ───
   R96 P1-8 + Audit Hardening: outside store, 0600 mode, rotation on 1000 events / daily / 10MB */
const AUDIT_MAX_BYTES = 10 * 1024 * 1024;
const auditLogger = createAudit({
  auditFile: AUDIT_FILE,
  auditDir: path.join(path.dirname(AUDIT_FILE), 'audit'),
  maxEvents: parseInt(process.env.PAYESH_AUDIT_MAX_EVENTS || '1000', 10),
  maxBytes: AUDIT_MAX_BYTES
});
const audit = auditLogger.audit;

/* ── Q3 runtime security monitoring ──────────────────────────────────
   The monitor's observations are bounded and fail-safe. Attack detection is
   deliberately separated from enforcement: WAF/authz/rate-limits continue to
   make access decisions, while abuseGuard emits redacted audit/metric/webhook
   signals for operator response. */
let abuseGuard;
const runtimeMonitor = createRuntimeMonitor({
  onAnomaly: (finding) => { try { if (abuseGuard) abuseGuard.reportAnomaly(finding); } catch (_) {} }
});
abuseGuard = createAbuseGuard({ audit, metrics, runtimeMonitor });
const attackDetector = createAttackDetector({
  onDetect: (finding) => { try { abuseGuard.report(finding).catch(() => {}); } catch (_) {} }
});

/* ── shared helpers ────────────────────────────────────────────────── */
function isHttps(req){
  if(req && req.socket && req.socket.encrypted) return true;
  /* S-73-4: X-Forwarded-Proto is a TRUSTED-proxy claim. We honor it only
     when the deployment declares itself behind a TLS proxy
     (PAYESH_HTTPS=1). Direct clients spoofing the header must not be able
     to flip the Secure-cookie / HSTS decisions. */
  if(process.env.PAYESH_HTTPS === '1'){
    const xfp = (req && req.headers['x-forwarded-proto']) || '';
    if(xfp === 'https') return true;
    return true; /* declared proxy mode: the proxy terminates TLS upstream */
  }
  return false;
}
function sendJson(res, status, obj){
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
}
function sendJsonCounting(res, status, obj){
  /* R97 (TODO 2.7): شمارِ رد‌ها (401/403/404) به ازای هر نشست — مرحله‌بندی
     در enumStage. Wave 6: شمارنده روی Redis است (پنجرهٔ ۱۰ دقیقه، TTL) —
     شمارش async و بدونِ مسدودکردنِ پاسخ (فنا = سکوت؛ پنجرهٔ بعدی می‌بیند).
     مسیرهایِ /api/auth/* سقفِ خودشان را دارند. */
  const r = REQ_STATE;
  const isIdorRead = r && /^\/api\/students\/\d+$/.test(r.p || '');
  if(r && r.sess && (status === 401 || status === 403 || status === 404) && !isIdorRead){
    enumTouch(r.sess).then(n => {
      if(n) enumStage(n, r.sess);
      /* ویو ۱۴: همان شمارِ R97 به‌صورت metric. برچسبِ stage از آستانه‌های
         ENUM_* مشتق می‌شود (۵ مقدارِ ممکن) — بدون PII و بدون cardinality بلند. */
      const stage = n >= ENUM_REVOKE ? 'revoke'
        : n >= ENUM_SLOW2 ? 'slow2'
        : n >= ENUM_SLOW1 ? 'slow1'
        : n >= ENUM_WARN ? 'warn' : 'count';
      metrics.observeAuth('rejection', stage);
    }).catch(() => {});
  }
  /* Q3: API modules return stable denial codes. Feed only those codes and the
     already-authenticated session to the signature detector; data/payloads
     remain outside telemetry. */
  try {
    if(r && r.sess && obj && (obj.code === 'out_of_scope' || obj.code === 'school_mismatch')) {
      attackDetector.observeCrossSchool({ sessionId: r.sess.jti });
    }
    if(r && r.sess && obj && ['forged_by', 'user_mismatch', 'school_mismatch', 'ownership_forge'].includes(obj.code)) {
      attackDetector.observeSyncResult({ sessionId: r.sess.jti, code: obj.code });
    }
  }catch(_){}
  return sendJson(res, status, obj);
}
function readBody(req, limit){
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = []; let over = false;
    req.on('data', c => {
      size += c.length;
      if(over) return; /* drain — سوکت زنده بماند تا 413 برسد (R96) */
      if(size > (limit || 1024 * 1024)){ over = true; reject(new Error('too_large')); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      if(over) return;
      if(!chunks.length) return resolve({});
      try{ resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch(e){ reject(new Error('bad_json')); }
    });
    req.on('error', reject);
  });
}

/* ── security headers (contract §5.6.1; CSP nonce per request §5.6.2) */
function securityHeaders(res, nonce, https){
  res.setHeader('Content-Security-Policy',
    "default-src 'self'; script-src 'self' 'nonce-" + nonce + "'; style-src 'self' 'nonce-" + nonce +
    "'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), camera=(), microphone=()');
  if(https) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
}

/* ── compose modules ───────────────────────────────────────────────── */
/* R101: OTP + rate limits live in otp.json (distributed across instances)
   P0-15: وقتی ردیس فعال است، همان کلیدِ مشترکِ ردیس منبع حقیقت می‌شود
   و فایل فقط فال‌بکِ توسعهٔ بدون ردیس است. */
const otp = createOtpStore({ file: OTP_FILE, ttlMs: CODE_TTL_MS, store, markDirty, redis, cache });
const auth = createAuth({ store, db, JWT_SECRET, JWT_PREV_SECRET, SESSION_NAME, SESSION_TTL_S, CODE_TTL_MS, DEMO_CODE_ECHO, audit, isHttps, markDirty, otp });
/* R97: همهٔ ماژول‌هایِ /api با sendJsonCounting می‌چرخند تا رد‌ها شمرده
   شوند؛ auth استثناست (سقفِ OTP سقفِ خودش را می‌سازد). */
/* P0-16: شناسه‌های بدون‌برخورد — دنبالهٔ پستگرس یا مکس+۱ قفل‌دار (پیش از sync: حلقهٔ اعمال از آن استفاده می‌کند) */
const ids = createIds({ db, cache });
const sync = createSync({ store, db, MAX_BATCH, AT_DRIFT_MS, audit, sessionFrom: auth.sessionFrom, sendJson: sendJsonCounting, markDirty, ids, rateLimit: rateLimit.checkRateLimit });
const idor = createIdor({ store, audit, sessionFrom: auth.sessionFrom, sendJson: sendJsonCounting, db });
const bell = createBell({ store, audit, sessionFrom: auth.sessionFrom, sendJson: sendJsonCounting });
const pubrep = createPublicReport({ store, db, sendJson: sendJsonCounting, workers }); /* P1-3: مسیر PG */
/* هر سه ماژول با db می‌چرخند: admin/conflicts (Wave 1 main) + sms (W1p2 تراکنسی) */
const admin = createAdmin({ store, db, audit, sessionFrom: auth.sessionFrom, sendJson: sendJsonCounting, markDirty, dataDir: path.dirname(STORE_FILE), workers });
const healthIdx = createHealthIndex({ store, audit, sessionFrom: auth.sessionFrom, sendJson: sendJsonCounting }); /* G.1 */
const sms = createSms({ store, db, audit, sessionFrom: auth.sessionFrom, sendJson: sendJsonCounting, markDirty });
const conflicts = createConflicts({ store, db, audit, sessionFrom: auth.sessionFrom, sendJson: sendJsonCounting, markDirty });

/* ── Phase 3: RESTful Resource Routes ─────────────────────────────── */
/* P0-17: صندوق برون‌مرزی + سرویس حذف واحد (سنگ‌قبر به‌جای اسپلایسِ خام) */
const outbox = createOutbox({ store, db });
const deleter = createDeleteService({ store, db, markDirty, outbox });
/* ویو ۸ — کارگرِ صندوق رویدادها: کارهای پس از حذف (مثل باطل‌کردن کش)
   از مسیر درخواست بیرون می‌افتد و به‌صورت ناهم‌زمان با تلاشِ مجدد اجرا می‌شود. */
const worker = createWorker({
  store, outbox,
  handlers: {
    '*.deleted': async (evt) => {
      const sid = evt.payload && evt.payload.school_id;
      if (sid != null && typeof cache.invalidateCollection === 'function') {
        await cache.invalidateCollection(evt.collection, sid);
      }
    }
  },
  intervalMs: Number(process.env.PAYESH_WORKER_INTERVAL_MS || 1000),
  maxRetries: Number(process.env.PAYESH_WORKER_MAX_RETRIES || 5)
});
worker.start();
/* F3 (chaos-drill #185): در PG-live، store.outbox پس از restart خالی بوت
   می‌شود و pendingهای جدولِ server_outbox بدون مصرف‌کننده می‌ماندند —
   بازپخشِ یک‌باره در بوت تا worker همان چرخهٔ همیشگی را برود.
   best-effort (خطا فقط لاگ می‌شود؛ بوت را نمی‌شکند). */
dbReady.then(async () => {
  try {
    const rp = await outbox.replayPendingFromPg();
    if (rp && rp.replayed > 0) console.log('[outbox] replayed ' + rp.replayed + ' pending event(s) from server_outbox after restart');
    else if (rp && rp.ok === false) console.warn('[outbox] pending replay failed (will stay best-effort):', rp.error);
  } catch (e) { console.warn('[outbox] pending replay error:', String((e && e.message) || e).slice(0, 140)); }
});
const studentRoutes = createStudentRoutes({ store, db, audit, markDirty, ids, deleter });
const classRoutes = createClassRoutes({ store, db, audit, markDirty, ids, deleter });
const attendanceRoutes = createAttendanceRoutes({ store, db, audit, markDirty, ids, deleter });
const gradeRoutes = createGradeRoutes({ store, db, audit, markDirty, ids, deleter });
const userRoutes = createUserRoutes({ store, db, audit, markDirty, ids, deleter });
const reportsRoutes = createReportsRoutes({ store, db, audit, markDirty, ids, deleter }); /* Wave 23 */
const analyticsRoutes = createAnalyticsRoutes({ store, db, audit, markDirty, ids, deleter }); /* P0-EI-09 */
const semanticAnalyticsRoutes = createSemanticAnalyticsRoutes({ store, db }); /* Phase 9.0 Wiring Gate */
const bootstrapRoute = createBootstrapRoute({ store, db });
const systemRoutes = createSystemRoutes({ store, db }); /* Phase 4 — P1-SC-01 */
/* Root-cause elimination (RAM-as-authority audit): canary weights MUST be
   hydrated from PostgreSQL BEFORE the socket serves traffic — the old
   fire-and-forget `initDb(db).catch(()=>{})` silently served DEFAULT weights
   after a restart until hydration happened to finish (stale routing window).
   The promise is awaited by startListening below; failure is LOUD, not mute. */
const canaryHydrated = db
  ? Promise.resolve(dbReady)
      .then(() => globalCanaryEngine.initDb(db))
      .then(() => {
        /* observable proof the SSoT load ran (silence here hid regressions) */
        console.log('[CANARY] weights hydrated from PostgreSQL (cluster_weights SSoT, ' + globalCanaryEngine.clusters.size + ' clusters)');
      })
      .catch((e) => {
        console.error('[CANARY] PostgreSQL hydration FAILED — serving traffic with persisted-weight UNKNOWN; rerouting decisions may diverge from cluster_weights:', e.message);
        throw e;
      })
  : null;
/* Delta Hardening Phase 2 (gap 2): signed TTL cursor — the resolved JWT key
   (env or key-file) feeds a domain-separated cursor key inside server/cursor.js;
   PAYESH_CURSOR_SECRET overrides it. */
const pullRoute = createPull({ store, db, sessionFrom: auth.sessionFrom, sendJson, cursorSecret: process.env.PAYESH_CURSOR_SECRET || JWT_SECRET });
/* Delta Phase 4 (gap 3): منبعِ کلیدِ کرسر از دیدِ اپراتور — env_cursor
   رازِ صریحِ >=32 بایت است؛ وگرنه همان خاستگاهِ کلیدِ JWT (env/keyfile).
   هر منبعِ فعال بینِ restart پایدار است؛ کلیدِ تصادفیِ per-boot هرگز
   رخ نمی‌دهد (بدونِ کلید، کرسر fail-closed خاموش است). */
const CURSOR_KEY_SOURCE = !pullRoute.cursor.enabled
  ? 'disabled'
  : (Buffer.byteLength(String(process.env.PAYESH_CURSOR_SECRET || ''), 'utf8') >= 32
      ? 'env_cursor'
      : (JWT_KEY_ORIGIN === 'env' ? 'env_jwt' : 'keyfile'));
console.log('  cursor : ' + (pullRoute.cursor.enabled
  ? 'enabled — key=' + CURSOR_KEY_SOURCE + ' (signed cursors survive restarts, ttl=' + pullRoute.cursor.ttlS + 's)'
  : 'DISABLED — set PAYESH_CURSOR_SECRET (>=32 bytes) or provide a JWT key; pull keeps working via legacy since'));

/* ── static ────────────────────────────────────────────────────────── */
const STATIC = {
  '/':              { file: 'index.html',      type: 'text/html; charset=utf-8' },
  '/index.html':    { file: 'index.html',      type: 'text/html; charset=utf-8' },
  '/USER_GUIDE.html': { file: 'USER_GUIDE.html', type: 'text/html; charset=utf-8' },
  '/guide.html':    { file: 'USER_GUIDE.html', type: 'text/html; charset=utf-8' },
  '/account-deletion.html': { file: 'account-deletion.html', type: 'text/html; charset=utf-8' },
  '/account-deletion':    { file: 'account-deletion.html', type: 'text/html; charset=utf-8' },
  /* ملاک گوگل‌پلی: سیاستِ حریم خصوصی باید به‌عنوان صفحهٔ وب هم قابل دسترس باشد (بند 15.3) */
  '/privacy.html': { file: 'privacy.html', type: 'text/html; charset=utf-8' },
  '/privacy':      { file: 'privacy.html', type: 'text/html; charset=utf-8' },
};
async function serveStatic(res, urlPath, nonce){
  const entry = STATIC[urlPath];
  if(!entry) return sendJson(res, 404, { ok: false, code: 'not_found' });
  const fp = path.join(ROOT, entry.file);
  /* Wave 9 — خواندنِ async + کشِ mtime: نه readFileSyncِ سنکرون در هر درخواست */
  let html = await staticCache.read(fp);
  if(html === null) return sendJson(res, 500, { ok: false, code: 'missing_build' });
  /* per-request CSP nonce (contract §5.6.2) — build.js placeholder */
  if(nonce) html = html.split('__PAYESH_NONCE__').join(nonce);
  res.writeHead(200, { 'Content-Type': entry.type, 'Cache-Control': 'no-cache' });
  res.end(html);
}

/* ── Phase 5 (P2-NI-05): اینگرس کنترل ظرفیت ملی (Fail-Closed) ──────── */
let rollingWindowSec = Math.floor(Date.now() / 1000);
let rollingWindowRps = 0;
let rollingWindowWrites = 0;

function nationalCapacityGateMiddleware(req, res) {
  const currentSec = Math.floor(Date.now() / 1000);
  if (currentSec !== rollingWindowSec) {
    rollingWindowSec = currentSec;
    rollingWindowRps = 0;
    rollingWindowWrites = 0;
  }
  rollingWindowRps++;
  const isWrite = req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH' || req.method === 'DELETE';
  if (isWrite) rollingWindowWrites++;

  const simRps = Number(req.headers['x-simulated-rps'] || 0);
  const simConcurrent = Number(req.headers['x-simulated-concurrent-users'] || 0);
  const simWrites = Number(req.headers['x-simulated-writes'] || 0);
  const simDbConns = Number(req.headers['x-simulated-db-connections'] || 0);

  const observedMetrics = {
    rps: simRps > 0 ? simRps : rollingWindowRps,
    concurrent_users: simConcurrent > 0 ? simConcurrent : (typeof inFlight === 'number' ? inFlight : 0),
    write_tps: simWrites > 0 ? simWrites : (isWrite ? rollingWindowWrites : 0),
    db_connections: simDbConns > 0 ? simDbConns : 0
  };

  try {
    assertNationalCapacityEnforcement(observedMetrics);
    return true;
  } catch (err) {
    res.setHeader('Retry-After', '1');
    sendJson(res, 429, {
      ok: false,
      code: err.code || 'PHASE5_NATIONAL_CAPACITY_LIMIT_BREACH',
      error: 'National capacity limit breached (Fail-Closed)',
      metric: err.metric,
      limit: err.limit,
      observed: err.observed
    });
    return false;
  }
}

/* ── router ────────────────────────────────────────────────────────── */
const onRequest = async (req, res) => {
  /* S7-1 (Bug Hunt session 7): a malformed request-target (e.g. `//[`, `///`,
     `//@`) made `new URL(req.url, …)` throw at the very top of this async
     handler — outside every try/catch and with no rejection handler on the
     caller — so one raw request line killed the process (unauthenticated DoS).
     Parse defensively: bad target = plain 400, never a throw. */
  let url;
  try{ url = new URL(req.url, 'http://localhost'); }
  catch(e){ return sendJson(res, 400, { ok: false, code: 'bad_request' }); }
  const p = url.pathname;
  const https = isHttps(req);
  const nonce = crypto.randomBytes(16).toString('base64');
  securityHeaders(res, nonce, https);

  // Phase 6.5: Canary middleware — HTTP → decision (PG SoT) → X-Canary-* headers
  let canaryRoute = null;
  try {
    canaryRoute = await applyCanaryRouting(req, res, globalCanaryEngine);
  } catch (err) {
    if (err.code === 'PHASE6_CIRCUIT_OPEN' || err.code === 'PHASE6_FAIL_CLOSED_NO_HEALTHY_ROUTE') {
      return sendJson(res, 503, {
        ok: false,
        code: err.code,
        message: 'کلاستر منطقه‌ای در دسترس نیست و به صورت امن قطع شد (Fail-Closed)'
      });
    }
  }

  /* ویو ۱۴ (Observability) — شمارشِ هر درخواست: شمار/تأخیر/بایت با برچسبِ
     «قالبِ مسیر» (نه خودِ URL) تا هم cardinality کران‌دار بماند و هم هیچ
     شناسه/PII وارد label نشود (metrics.js R3). هیچ‌گاه در مسیرِ پاسخ خطا
     نمی‌دهد (R1). */
  const __mStart = process.hrtime.bigint();
  let __mBytes = 0;
  const __mEnd = res.end;
  res.end = function(chunk, enc, cb){
    try{
      if(chunk) __mBytes += Buffer.isBuffer(chunk) ? chunk.length
        : Buffer.byteLength(String(chunk), typeof enc === 'string' ? enc : 'utf8');
    }catch(e){}
    return __mEnd.call(this, chunk, enc, cb);
  };
  res.on('finish', () => {
    metrics.observeHttpRequest({
      route: p,
      method: req.method,
      status: res.statusCode,
      durationSeconds: metrics.elapsedSeconds(__mStart),
      bytes: __mBytes
    });
    /* Q3: record only closed-set role/signal values. The monitor hashes its
       session/tenant inputs internally and never exports raw request data. */
    try {
      const rt = (req.context && req.context.runtime) || {};
      runtimeMonitor.recordRequest({
        role: rt.role || 'anonymous', status: res.statusCode, responseBytes: __mBytes,
        sessionId: rt.sessionId, tenantId: rt.tenantId, syncOps: rt.syncOps
      });
      attackDetector.observeRequest({
        sessionId: rt.sessionId, source: clientIp(req), path: p, status: res.statusCode,
        wafBlocked: !!(req.context && req.context.waf && req.context.waf.blocked)
      });
      if (req.context && req.context.waf && req.context.waf.blocked) {
        attackDetector.observeWafBlock({ sessionId: rt.sessionId, source: clientIp(req), blocked: true });
      }
      // Phase 6: ضبط تله‌متری تاخیر و خطای بلادرنگ کلاستر
      if (canaryRoute && canaryRoute.clusterId) {
        const elapsedNs = process.hrtime.bigint() - __mStart;
        const elapsedMs = Number(elapsedNs) / 1e6;
        globalCanaryEngine.recordTelemetry(canaryRoute.clusterId, {
          latencyMs: elapsedMs,
          errorOccurred: res.statusCode >= 500
        });
      }
    } catch (_) {}
  });
  /* Tracing (P-Trace): شناسهٔ ردیابی در کانتکست و سرآیندِ پاسخ برای هم‌بستگی —
     پیش از WAF تا رویدادهای ممیزیِ آن شناسهٔ ردیابی داشته باشند. */
  req.context = req.context || {};
  try{
    const __tid = tracing.getTraceId();
    if(__tid){ req.context.trace_id = __tid; res.setHeader('X-Trace-Id', __tid); }
  }catch(e){}
  /* WAF (P-WAF): حالتِ report (پیش‌فرض — فقط-تشخیص) یا enforce (P0 #6:
     PAYESH_WAF_MODE=enforce ⇒ verdict = 403 waf_blocked با fail-safe allowlist) */
  try{ await waf.wafMiddleware(req, res); }catch(e){}
  /* P0 #6: اگر WAF (enforce) درخواست را مسدود کرده باشد (403 فرستاده)، روتینگ ادامه نمی‌یابد */
  if(res.writableEnded) return;
  /* Q3 red-team / CSRF: an explicit browser Origin or Referer on every
     unsafe API request must agree with this exact host+scheme. This runs
     before the body is read and before route dispatch, so a cross-origin
     form/fetch cannot invoke logout, sync, delete, or any REST write. */
  const csrfDecision = csrf.checkCsrfOrigin(req, isHttps);
  if(!csrfDecision.ok){
    audit('csrf_denied', { path: p, reason: csrfDecision.code, ip: clientIp(req) });
    return sendJson(res, 403, { ok: false, code: csrfDecision.code });
  }
  /* R97 — نگهبانِ شمردنِ شناسه: شمارِ رد‌ها (404/403/401) و شمارِ همهٔ
     خوانش‌هایِ /api/students/:id (مسطحِ شمردنِ شناسهٔ §5.7) به ازای هر
     نشست؛ از SLOW1 به بعد تأخیر، در REVOKE ابطال (sendJsonCounting). */
  REQ_STATE.sess = null;
  REQ_STATE.p = p;
  if(p.indexOf('/api/') === 0 && p.indexOf('/api/auth/') !== 0){
    const gs = await auth.sessionFrom(req);
    if(gs){
      REQ_STATE.sess = gs;
      req.context.runtime = {
        role: gs.role,
        sessionId: gs.jti,
        /* A supplied school selector is an untrusted telemetry signal only;
           authorization still derives scope from the authenticated session. */
        tenantId: url.searchParams.get('school_id') || gs.school_id || null,
        syncOps: 0
      };
      let enumN = 0;
      if(/^\/api\/students\/\d+$/.test(p)){
        enumN = await enumTouch(gs); /* §5.7: هر خوانشِ این مسیر می‌شمارد (Wave 6: ردیس) */
        if(enumN) enumStage(enumN, gs);
      } else {
        enumN = await enumRead(gs);
      }
      const dm = enumDelayMs(enumN);
      if(dm) await new Promise(r => setTimeout(r, dm));
    }
  }
  try{
    /* ویو ۱۴ — Prometheus scrape. Fail-closed (metrics.js R4):
         PAYESH_METRICS=0                → 404
         production و بدون توکن          → 404 (endpoint اصولاً وجود ندارد)
         PAYESH_METRICS_TOKEN            → Bearer token (مقایسهٔ زمان‌ثابت)
         توسعه و بدون توکن               → فقط loopback
       /metrics هرگز زیر /api/ نیست و هرگز در فهرستِ static نمی‌آید. */
    if(p === '/metrics' && (req.method === 'GET' || req.method === 'HEAD')){
      const g = metrics.scrapeGate(req);
      if(!g.ok){
        audit('metrics_denied', { path: p, status: g.status, reason: g.code, ip: clientIp(req) });
        return sendJson(res, g.status, { ok: false, code: g.code });
      }
      /* گاژهایِ تازه پیش از render: poolها + صفِ outbox (تنها در زمانِ scrape
         خوانده می‌شوند تا هر درخواست هزینهٔ I/O ندهد). */
      try{
        if(db.isPostgres && db.isPostgres() && typeof db.poolStats === 'function') metrics.publishDbPools(db.poolStats());
      }catch(e){}
      try{
        if(typeof outbox.depth === 'function') metrics.publishOutboxDepth(outbox.depth());
      }catch(e){}
      /* Runtime health gauges must also refresh on the Prometheus scrape path;
         `/api/health` is operator-facing, not the collector's source. */
      try {
        const runtimeSecurity = runtimeMonitor.snapshot();
        metrics.set('payesh_suspicious_sessions', [], runtimeSecurity.suspicious_sessions);
        metrics.set('payesh_attack_patterns_blocked', [], runtimeSecurity.attack_patterns_blocked);
      } catch (_) {}
      try {
        await metrics.publishRuntimeProbes();
      } catch (_) {}
      const body = metrics.render();
      res.writeHead(200, {
        'Content-Type': 'text/plain; version=0.0.4; charset=utf-8',
        'Cache-Control': 'no-store'
      });
      return res.end(req.method === 'HEAD' ? undefined : body);
    }
    if(p === '/api/liveness' && (req.method === 'GET' || req.method === 'HEAD')){
      /* Wave 15: liveness = فرایند زنده است و event-loop پاسخ می‌دهد.
         عمداً هیچ وابستگی (DB/Redis) چک نمی‌کند — خرابیِ وابستگی نباید
         ارکستراتور را وادار به restart کند (طوفانِ ری‌استارت)؛ برایِ آن
         readiness هست. حتی در حالِ drain همیشه 200. */
      return sendJson(res, 200, { ok: true, status: 'live', name: 'payesh-server', pid: process.pid, uptime_s: Math.round(process.uptime()), draining });
    }
    if(p === '/api/readiness' && (req.method === 'GET' || req.method === 'HEAD')){
      /* Wave 15: readiness = آیا می‌توانم ترافیک بپذیرم؟
         - DB: store در استارت لود شده (وگرنه فرایند اصلاً بالا نمی‌آمد) +
           pingِ موتور (memory همیشه ok؛ postgres = SELECT 1).
         - Redis: در تولید (PAYESH_ENV=production یا NODE_ENV=production)
           ردیسِ زنده لازم است (P0-13)؛ در توسعه فال‌بکِ حافظه قابل‌قبول است.
           ⇒ PAYESH_ENV=production + قطعِ ردیس = 503 (سپکِ Wave 15).
         - draining: بلافاصله پس از SIGTERM ⇒ 503 تا LB ترافیکِ تازه نفرستد. */
      const prod = process.env.PAYESH_ENV === 'production' || process.env.NODE_ENV === 'production';
      let dbp = { ok: true, driver: 'memory', alive: true };
      try { dbp = await db.ping(); } catch (e) { dbp = { ok: false, driver: 'memory', alive: false, error: String(e.message || e).slice(0, 120) }; }
      let rdp = { ok: true, driver: 'memory', alive: true };
      try { rdp = await redis.ping(); } catch (e) { rdp = { ok: false, driver: 'memory', alive: false, error: String(e.message || e).slice(0, 120) }; }
      const dbOk = !!(dbp && dbp.ok);
      const redisOk = !!(rdp && rdp.ok);
      const redisLive = redis.isRedis();
      const ready = !draining && dbOk && redisOk && (!prod || redisLive);
      return sendJson(res, ready ? 200 : 503, {
        ok: ready, status: ready ? 'ready' : 'not_ready', name: 'payesh-server',
        db: { driver: dbp.driver, alive: dbOk },
        redis: { driver: rdp.driver, alive: redisOk, live: redisLive, required: prod },
        draining, time: new Date().toISOString()
      });
    }
    if(p === '/api/health' && (req.method === 'GET' || req.method === 'HEAD')){
      /* P0-13: ریدی = در تولید، کشِ توزیع‌شده زنده است؛ وگرنه 503.
         Wave 15: کدِ وضعیت روی همان درگاهِ P0-13 می‌ماند (قراردادِ
         server13/S1 — تغییر نمی‌کند) و بدنه گسترش یافت: گزارشِ کاملِ
         db/redis/queue + آمارِ pool و حافظه. */
      const rdy = redis.ready();
      let dbp = { ok: false, driver: 'unknown', alive: false };
      try { dbp = await db.ping(); } catch (e) { dbp = { ok: false, driver: 'unknown', alive: false, error: String(e.message || e).slice(0, 120) }; }
      let rdp = { ok: false, driver: 'unknown', alive: false };
      try { rdp = await redis.ping(); } catch (e) {}
      const pool = db.getPool();
      const dbAlive = !!(dbp && dbp.ok);
      const workerHealthy = typeof worker.isHealthy === 'function' ? worker.isHealthy() : true;
      const isHealthy = rdy && dbAlive && workerHealthy;
      /* Q3: health exposes bounded integer counters only; no session, tenant,
         actor, URL, or payload data leaves the runtime monitor. */
      const runtimeSecurity = runtimeMonitor.snapshot();
      try {
        metrics.set('payesh_suspicious_sessions', [], runtimeSecurity.suspicious_sessions);
        metrics.set('payesh_attack_patterns_blocked', [], runtimeSecurity.attack_patterns_blocked);
      } catch (_) {}
      const body = {
        ok: isHealthy, name: 'payesh-server', phase: 1, time: new Date().toISOString(), version: '1.0', pid: process.pid,
        anomalies_detected_24h: runtimeSecurity.anomalies_detected_24h,
        suspicious_sessions: runtimeSecurity.suspicious_sessions,
        attack_patterns_blocked: runtimeSecurity.attack_patterns_blocked,
        worker: typeof worker.health === 'function' ? worker.health() : { healthy: true },
        cache: redis.isRedis() ? 'redis' : (rdy ? 'memory-dev' : 'unavailable'),
        db: { driver: dbp.driver, alive: !!(dbp && dbp.ok), pool: pool ? { total: pool.totalCount, idle: pool.idleCount, pending: pool.pendingCount } : null },
        redis: { driver: rdp.driver, alive: !!(rdp && rdp.ok) },
        queue: { outbox: (store.outbox || []).length, notify_pending: (store.notify_queue || []).filter(q => q.status === 'pending').length, in_flight: inFlight },
        cache_l1: cache.stats().l1,
        uptime_s: Math.round(process.uptime()),
        memory: { heap_used_kb: Math.round(process.memoryUsage().heapUsed / 1024) },
        /* Delta Phase 4 (gap 3): warmupِ کرسر — کلیدِ امضا بینِ restart
           پایدار است یا نه. persistent=true یعنی کرسرِ صادرشدهٔ نسخهٔ
           پیشینِ فرآیند بعد از restart هم هنوز verify می‌شود (تا TTL). */
        cursor: { enabled: pullRoute.cursor.enabled, persistent: pullRoute.cursor.enabled, key_source: CURSOR_KEY_SOURCE },
        /* Delta Phase 4 (gap 4): پالسِ sync در سلامت — pull/push/conflict/
           backpressure/کرسر + میانگینِ حجمِ دلتا (خام و سیم). */
        sync: metrics.syncHealthStats(metrics.snapshot())
      };
      /* Wave 10 — pool observability (primary + optional read replica) when PG live */
      try { if (db.isPostgres && db.isPostgres() && typeof db.poolStats === 'function') body.db_pools = db.poolStats(); }
      catch (e) {}
      return sendJson(res, isHealthy ? 200 : 503, body);
    }
    /* Wave 15: hookِ فقط-تست (env-gated، پیش‌فرض خاموش) — مسیرِ آهسته برای
       اثباتِ قطعیِ drain در Graceful Shutdown (tests/wave15-health.js). */
    if(p === '/api/__slow' && req.method === 'GET' && process.env.PAYESH_TEST_SLOW_MS){
      const ms = Math.min(30000, Math.max(1, Number(process.env.PAYESH_TEST_SLOW_MS) || 1));
      await new Promise(r => setTimeout(r, ms));
      return sendJson(res, 200, { ok: true, slow_ms: ms });
    }
    /* ویو ۱۴ — سوءاستفادهٔ OTP/ورود به‌صورت metric (برچسبِ outcome از
       مجموعهٔ بستهٔ کدهایِ HTTP مشتق می‌شود؛ شماره/کد ملی هرگز label نیست). */
    if(p === '/api/auth/send-code' && req.method === 'POST'){
      const b = await readBody(req, 4 * 1024);
      const r = await auth.apiSendCode(req, res, b);
      metrics.observeAuth('otp', res.statusCode === 200 ? 'sent' : res.statusCode === 429 ? 'rate_limited' : 'rejected');
      return r;
    }
    if(p === '/api/auth/login'     && req.method === 'POST'){
      const b = await readBody(req, 4 * 1024);
      const r = await auth.apiLogin(req, res, b);
      metrics.observeAuth('login', res.statusCode === 200 ? 'ok' : res.statusCode === 429 ? 'rate_limited' : res.statusCode === 401 ? 'failed' : 'rejected');
      /* Q3: detector hashes source/subject internally; neither phone nor IP is
         emitted to logs, metrics, webhooks, or health. */
      if(res.statusCode === 401) {
        try { attackDetector.observeLoginFailure({ source: clientIp(req), subject: b && b.phone }); } catch (_) {}
      }
      return r;
    }
    if(p === '/api/auth/me'        && req.method === 'GET')  return await auth.apiMe(req, res);
    if(p === '/api/auth/logout'    && req.method === 'POST') return await auth.apiLogout(req, res);
    if(p === '/api/auth/delete-account' && req.method === 'POST') return await auth.apiDeleteAccount(req, res);
    if(p === '/api/sync'           && req.method === 'POST'){
      if(!nationalCapacityGateMiddleware(req, res)) return;
      const b = await readBody(req, 1024 * 1024);
      /* Q3: sync op count / claimed tenant are monitoring inputs only. The
         sync authorization gate still independently validates every stamp. */
      if(req.context && req.context.runtime) {
        req.context.runtime.syncOps = b && Array.isArray(b.ops) ? b.ops.length : 0;
        const claimed = b && Array.isArray(b.ops) && b.ops.find(op => op && op.school_id != null);
        if(claimed) req.context.runtime.tenantId = claimed.school_id;
      }
      /* ویو ۱۴: اندازهٔ دستهٔ جهش‌ها = عمقِ صفِ آفلاینِ کلاینت در لحظهٔ drain. */
      metrics.observeSyncBatch(b && Array.isArray(b.ops) ? b.ops.length : 0);
      const r = await sync.apiSync(req, res, b);
      metrics.inc('payesh_sync_requests_total', { code: String(res.statusCode).slice(0, 3) });
      return r;
    }
    if(p === '/api/sync/conflicts' && req.method === 'GET')  return await conflicts.apiList(req, res);
    if(p === '/api/sync/resolve-conflict' && req.method === 'POST') return await conflicts.apiResolve(req, res, await readBody(req, 4 * 1024));
    if(/^\/api\/students\/\d+$/.test(p) && req.method === 'GET') return await idor.apiStudent(req, res, p.split('/')[3]);
    if(p === '/api/bell/now' && req.method === 'GET') return await bell.apiBellNow(req, res);
    if(p === '/api/public-report' && req.method === 'GET') return await pubrep.apiPublicReport(req, res);
    if(p === '/api/admin/backup'  && req.method === 'POST') return await admin.apiBackup(req, res);
    /* restore فقط {file} می‌گیرد (نامِ حداکثر ۱۲۸ نویسه) — سقفِ 64MBِ پیشین
       بی‌دلیل بود؛ حالا 4KB مثلِ بقیهٔ بدنه‌هایِ کوچک (413 برایِ بیشتر). */
    if(p === '/api/admin/restore' && req.method === 'POST') return await admin.apiRestore(req, res, await readBody(req, 4 * 1024));
    if(p === '/api/sms/send' && req.method === 'POST') return await sms.apiSend(req, res, await readBody(req, 32 * 1024));
    if(p === '/api/health-index' && req.method === 'GET') return await healthIdx.apiHealthIndex(req, res, url.searchParams); /* G.1 */

    // Phase 6: Direct API Aliases (/api/system/canary/*)
    if(p === '/api/system/canary/status' && req.method === 'GET') {
      const s = await auth.sessionFrom(req);
      if(!s) return sendJson(res, 401, { ok: false, code: 'unauthorized', message: 'احراز هویت الزامی است' });
      req.user = s;
      const r = await systemRoutes.phase6CanaryStatus(req, url.searchParams);
      return sendJson(res, r.status, r.body);
    }
    if((p === '/api/system/canary/promote' || p === '/api/system/canary/weight') && req.method === 'POST') {
      const s = await auth.sessionFrom(req);
      if(!s) return sendJson(res, 401, { ok: false, code: 'unauthorized', message: 'احراز هویت الزامی است' });
      req.user = s;
      const body = await readBody(req, 64 * 1024);
      const r = await systemRoutes.phase6CanaryPromote(req, body);
      return sendJson(res, r.status, r.body);
    }
    if(p === '/api/system/canary/rollback' && req.method === 'POST') {
      const s = await auth.sessionFrom(req);
      if(!s) return sendJson(res, 401, { ok: false, code: 'unauthorized', message: 'احراز هویت الزامی است' });
      req.user = s;
      const body = await readBody(req, 64 * 1024);
      const r = await systemRoutes.phase6CanaryRollback(req, body);
      return sendJson(res, r.status, r.body);
    }
    if(p === '/api/system/canary/circuit-breaker' && req.method === 'POST') {
      const s = await auth.sessionFrom(req);
      if(!s) return sendJson(res, 401, { ok: false, code: 'unauthorized', message: 'احراز هویت الزامی است' });
      req.user = s;
      const body = await readBody(req, 64 * 1024);
      const r = await systemRoutes.phase6CanaryCircuitBreaker(req, body);
      return sendJson(res, r.status, r.body);
    }

    /* ── Phase 3: RESTful Resource Endpoints (/api/v1/*) ────────── */
    if(p.indexOf('/api/v1/') === 0){
      const s = await auth.sessionFrom(req);
      if(!s) return sendJson(res, 401, { ok: false, code: 'unauthorized', message: 'احراز هویت الزامی است' });
      req.user = s;
      req.session = s;

      // Phase 6 (B8): Zero-Trust Tenant & Provincial Isolation Guardrail
      const targetSchool = url.searchParams.get('school_id') || req.headers['x-school-id'];
      const targetProv = req.headers['x-province-code'];
      if (s.role !== 'superadmin' || targetSchool || targetProv) {
        try {
          /* P1: استانِ عامل از یک منبعِ واحد حل می‌شود (resolveActorProvince:
             session.province_code → province_id → school → office). پیش از این
             یک پیش‌فرضِ جادوییِ '۰۷' به‌کار می‌رفت که با هیچ استانِ واقعی
             تطابق نداشت، استان‌های ۱ و ۲ را یکی می‌کرد، و edu_office را که
             school_id ندارد کلاً از /api/v1 محروم می‌ساخت.
             اکنون: اگر استانِ عامل قابلِ تعیین نیست، fail-closed می‌بندیم
             (هیچ استانِ پیش‌فرضی فرض نمی‌شود). */
          const actorProv = resolveActorProvince(s, store);
          const effSchool = targetSchool || s.school_id;
          const effProv = targetProv || actorProv;
          if (!effProv) {
            const err = new Error('PHASE6_UNRESOLVED_PROVINCE: استان عامل قابل تعیین نیست؛ دسترسی مسدود شد');
            err.code = 'PHASE6_TENANT_ISOLATION_BREACH';
            throw err;
          }
          const actorWithProv = Object.assign({}, s, { province_code: actorProv });
          await assertTenantBoundary(actorWithProv, effSchool, effProv);
        } catch (err) {
          return sendJson(res, err.status === 503 ? 503 : 403, {
            ok: false,
            code: err.code || 'PHASE6_TENANT_ISOLATION_BREACH',
            message: err.message
          });
        }
      }

      // /api/v1/bootstrap
      if(p === '/api/v1/bootstrap' && req.method === 'GET'){
        const r = await bootstrapRoute.getBootstrapData(req);
        return sendJson(res, r.status, r.body);
      }

      // /api/v1/pull (A01: General Pull & Delta Sync)
      if(p === '/api/v1/pull' && req.method === 'GET'){
        return await pullRoute.apiPull(req, res);
      }

      // /api/v1/reports/* (Wave 23 — گزارش‌های استاندارد وزارتی، فقط‌خواندنی)
      if(p === '/api/v1/reports/attendance' && req.method === 'GET'){
        const r = await reportsRoutes.attendanceReport(req, url.searchParams);
        return sendJson(res, r.status, r.body);
      }
      if(p === '/api/v1/reports/academic' && req.method === 'GET'){
        const r = await reportsRoutes.academicReport(req, url.searchParams);
        return sendJson(res, r.status, r.body);
      }
      if(p === '/api/v1/reports/finance' && req.method === 'GET'){
        const r = await reportsRoutes.financeReport(req, url.searchParams);
        return sendJson(res, r.status, r.body);
      }
      if(p === '/api/v1/reports/teachers' && req.method === 'GET'){
        const r = await reportsRoutes.teachersReport(req, url.searchParams);
        return sendJson(res, r.status, r.body);
      }

      // /api/v1/analytics/school-intelligence (P0-EI-09: مرکز هوشمندی و فرماندهی مدرسه)
      if(p === '/api/v1/analytics/school-intelligence' && req.method === 'GET'){
        const r = await analyticsRoutes.schoolIntelligenceReport(req, url.searchParams);
        return sendJson(res, r.status, r.body);
      }

      // /api/v1/analytics/regional-intelligence (P0-EI-10: شبکه بینش و اقدام منطقه‌ای)
      if(p === '/api/v1/analytics/regional-intelligence' && req.method === 'GET'){
        const r = await analyticsRoutes.regionalIntelligenceReport(req, url.searchParams);
        return sendJson(res, r.status, r.body);
      }

      // /api/v1/analytics/quality-governance (P0-EI-11: راهبری کیفیت آموزشی و چرخه بهبود مستمر)
      if(p === '/api/v1/analytics/quality-governance' && req.method === 'GET'){
        const r = await analyticsRoutes.qualityGovernanceReport(req, url.searchParams);
        return sendJson(res, r.status, r.body);
      }

      // /api/v1/analytics/longitudinal-intelligence (P0-EI-12: پایش طولی هوشمندی آموزشی و کشف روندها)
      if(p === '/api/v1/analytics/longitudinal-intelligence' && req.method === 'GET'){
        const r = await analyticsRoutes.longitudinalIntelligenceReport(req, url.searchParams);
        return sendJson(res, r.status, r.body);
      }

      // /api/v1/analytics/action-recommendations (P0-EI-13: موتور پیشنهاددهنده و برنامه‌ریزی اقدام آموزشی)
      if(p === '/api/v1/analytics/action-recommendations' && req.method === 'GET'){
        const r = await analyticsRoutes.actionRecommendationsReport(req, url.searchParams);
        return sendJson(res, r.status, r.body);
      }

      // /api/v1/analytics/feedback-learning-memory (P0-EI-14: موتور حلقه بازخورد و حافظه یادگیری سازمانی)
      if(p === '/api/v1/analytics/feedback-learning-memory' && req.method === 'GET'){
        const r = await analyticsRoutes.feedbackLearningMemoryReport(req, url.searchParams);
        return sendJson(res, r.status, r.body);
      }

      // /api/v1/analytics/intelligence-governance (P0-EI-15: مرکز حاکمیت و شفافیت هوشمندی آموزشی)
      if(p === '/api/v1/analytics/intelligence-governance' && req.method === 'GET'){
        const r = await analyticsRoutes.intelligenceGovernanceReport(req, url.searchParams);
        return sendJson(res, r.status, r.body);
      }

      // /api/v1/analytics/policy-simulation (P0-EI-16: لایه فرماندهی و شبیه‌سازی خط‌مشی‌های آموزشی)
      if(p === '/api/v1/analytics/policy-simulation' && req.method === 'GET'){
        const r = await analyticsRoutes.policySimulationReport(req, url.searchParams);
        return sendJson(res, r.status, r.body);
      }

      // /api/v1/analytics/decision-command (P0-EI-17: لایه هوش تصمیم و ارکستراسیون فرمان آموزشی)
      if(p === '/api/v1/analytics/decision-command' && req.method === 'GET'){
        const r = await analyticsRoutes.decisionCommandReport(req, url.searchParams);
        return sendJson(res, r.status, r.body);
      }

      // /api/v1/analytics/operational-execution (P0-EI-18: لایه اجرای عملیاتی هوشمندی آموزشی)
      if(p === '/api/v1/analytics/operational-execution' && req.method === 'GET'){
        const r = await analyticsRoutes.operationalExecutionReport(req, url.searchParams);
        return sendJson(res, r.status, r.body);
      }

      // /api/v1/analytics/outcome-evaluation (P0-EI-19: لایه ارزیابی پیامد و بهینه‌سازی مستمر)
      if(p === '/api/v1/analytics/outcome-evaluation' && req.method === 'GET'){
        const r = await analyticsRoutes.outcomeEvaluationReport(req, url.searchParams);
        return sendJson(res, r.status, r.body);
      }

      // /api/v1/analytics/intelligence-platform (P0-EI-20: لایه یکپارچه‌سازی پلتفرم هوشمندی آموزشی)
      if(p === '/api/v1/analytics/intelligence-platform' && req.method === 'GET'){
        const r = await analyticsRoutes.intelligencePlatformReport(req, url.searchParams);
        return sendJson(res, r.status, r.body);
      }

      // /api/v1/analytics/intelligence-certification (P0-EI-21: گیت انتشار و صدور گواهی نهایی فاز ۳)
      if(p === '/api/v1/analytics/intelligence-certification' && req.method === 'GET'){
        const r = await analyticsRoutes.intelligenceCertificationReport(req, url.searchParams);
        return sendJson(res, r.status, r.body);
      }

      // ── Phase 9.0 Wiring Gate (F-EI-01): اتصال هشت موتور آموزشی که پیش‌تر
      //    کد داشتند اما هیچ مسیر رانتایمی به آن‌ها نبود. ──────────────────
      if(p === '/api/v1/analytics/semantic-metrics' && req.method === 'GET'){
        const r = await semanticAnalyticsRoutes.semanticReport(req, url.searchParams);
        return sendJson(res, r.status, r.body);
      }
      if(p === '/api/v1/analytics/assessment-quality' && req.method === 'GET'){
        const r = await semanticAnalyticsRoutes.assessmentQualityReport(req, url.searchParams);
        return sendJson(res, r.status, r.body);
      }
      if(p === '/api/v1/analytics/attendance-risk' && req.method === 'GET'){
        const r = await semanticAnalyticsRoutes.attendanceRiskReport(req, url.searchParams);
        return sendJson(res, r.status, r.body);
      }
      if(p === '/api/v1/analytics/student-timeline' && req.method === 'GET'){
        const r = await semanticAnalyticsRoutes.studentTimelineReport(req, url.searchParams);
        return sendJson(res, r.status, r.body);
      }
      if(p === '/api/v1/analytics/intervention-warnings' && req.method === 'GET'){
        const r = await semanticAnalyticsRoutes.interventionWarningsReport(req, url.searchParams);
        return sendJson(res, r.status, r.body);
      }
      if(p === '/api/v1/analytics/school-health-dashboard' && req.method === 'GET'){
        const r = await semanticAnalyticsRoutes.schoolHealthReport(req, url.searchParams);
        return sendJson(res, r.status, r.body);
      }
      if(p === '/api/v1/analytics/parent-360' && req.method === 'GET'){
        const r = await semanticAnalyticsRoutes.parent360Report(req, url.searchParams);
        return sendJson(res, r.status, r.body);
      }
      if(p === '/api/v1/analytics/teacher-evidence' && req.method === 'GET'){
        const r = await semanticAnalyticsRoutes.teacherEvidenceReport(req, url.searchParams);
        return sendJson(res, r.status, r.body);
      }

      // /api/v1/system/scalability-health (Phase 4 — P1-SC-01: رصد سلامت زیرساخت مقیاس‌پذیری و کش توزیع‌شده)
      if(p === '/api/v1/system/scalability-health' && req.method === 'GET'){
        const r = await systemRoutes.scalabilityHealthReport(req, url.searchParams);
        return sendJson(res, r.status, r.body);
      }

      // /api/v1/system/event-processing-health (Phase 4 — P1-SC-02: رصد سلامت صف رویدادها و مدیریت بار)
      if(p === '/api/v1/system/event-processing-health' && req.method === 'GET'){
        const r = await systemRoutes.eventProcessingHealthReport(req, url.searchParams);
        return sendJson(res, r.status, r.body);
      }

      // /api/v1/system/observability-health (Phase 4 — P1-SC-03: رصدپذیری بلادرنگ و سلامت تولید)
      if(p === '/api/v1/system/observability-health' && req.method === 'GET'){
        const r = await systemRoutes.observabilityHealthReport(req, url.searchParams);
        return sendJson(res, r.status, r.body);
      }

      // /api/v1/system/disaster-recovery-health (Phase 4 — P1-SC-04: پایداری، پشتیبان‌گیری و بازیابی بحران)
      if(p === '/api/v1/system/disaster-recovery-health' && req.method === 'GET'){
        const r = await systemRoutes.disasterRecoveryHealthReport(req, url.searchParams);
        return sendJson(res, r.status, r.body);
      }

      // /api/v1/system/pilot-deployment-health (Phase 4 — P1-SC-05: استقرار پایلوت و مدیریت ترافیک)
      if(p === '/api/v1/system/pilot-deployment-health' && req.method === 'GET'){
        const r = await systemRoutes.pilotDeploymentHealthReport(req, url.searchParams);
        return sendJson(res, r.status, r.body);
      }

      // /api/v1/system/security-health (Phase 4 — P1-SC-06: لایه امنیت Zero Trust و انطباق زمان اجرا)
      if(p === '/api/v1/system/security-health' && req.method === 'GET'){
        const r = await systemRoutes.securityHealthReport(req, url.searchParams);
        return sendJson(res, r.status, r.body);
      }

      // /api/v1/system/phase4-certification (Phase 4 — P1-SC-07: گیت انتشار جامع و صدور گواهی مقیاس‌پذیری و پایداری فاز ۴)
      if((p === '/api/v1/system/phase4-certification' || p === '/api/v1/system/scalability-certification') && req.method === 'GET'){
        const r = await systemRoutes.phase4CertificationReport(req, url.searchParams);
        return sendJson(res, r.status, r.body);
      }

      // /api/v1/system/phase5/regions (Phase 5 — P2-PL-01: فهرست کلاسترهای چندمنطقه‌ای)
      if(p === '/api/v1/system/phase5/regions' && req.method === 'GET'){
        const r = await systemRoutes.phase5Regions(req, url.searchParams);
        return sendJson(res, r.status, r.body);
      }

      // /api/v1/system/phase5/federation-health (Phase 5 — P2-PL-01: رصد سلامت فدراسیون کلاسترها)
      if(p === '/api/v1/system/phase5/federation-health' && req.method === 'GET'){
        const r = await systemRoutes.phase5FederationHealth(req, url.searchParams);
        return sendJson(res, r.status, r.body);
      }

      // /api/v1/system/phase5/resource-governance (Phase 5 — P2-PL-01: حاکمیت منابع و ظرفیت پایلوت)
      if(p === '/api/v1/system/phase5/resource-governance' && req.method === 'GET'){
        const r = await systemRoutes.phase5ResourceGovernance(req, url.searchParams);
        return sendJson(res, r.status, r.body);
      }

      // /api/v1/system/phase5/pilot-approval (Phase 5 — P2-PL-01: تاییدیه اپراتور انسانی)
      if(p === '/api/v1/system/phase5/pilot-approval' && req.method === 'POST'){
        const body = await readBody(req, 64 * 1024);
        const r = await systemRoutes.phase5PilotApproval(req, body);
        return sendJson(res, r.status, r.body);
      }

      // /api/v1/system/phase5/provincial-pilots (Phase 5 — P2-PL-02: فهرست و وضعیت پایلوت استانی)
      if(p === '/api/v1/system/phase5/provincial-pilots' && req.method === 'GET'){
        const r = await systemRoutes.phase5ProvincialPilots(req, url.searchParams);
        return sendJson(res, r.status, r.body);
      }

      // /api/v1/system/phase5/provincial-pilots/capacity (Phase 5 — P2-PL-02: تابلوی ظرفیت و مقیاس‌پذیری پایلوت استانی)
      if(p === '/api/v1/system/phase5/provincial-pilots/capacity' && req.method === 'GET'){
        const r = await systemRoutes.phase5ProvincialCapacity(req, url.searchParams);
        return sendJson(res, r.status, r.body);
      }

      // /api/v1/system/phase5/provincial-pilots/activate (Phase 5 — P2-PL-02: فعال‌سازی و آماده‌سازی کلاستر استانی)
      if(p === '/api/v1/system/phase5/provincial-pilots/activate' && req.method === 'POST'){
        const body = await readBody(req, 64 * 1024);
        const r = await systemRoutes.phase5ProvincialActivate(req, body);
        return sendJson(res, r.status, r.body);
      }

      // /api/v1/system/phase5/provincial-pilots/traffic-rollout (Phase 5 — P2-PL-02: تنظیم ترافیک قناری پایلوت استانی)
      if(p === '/api/v1/system/phase5/provincial-pilots/traffic-rollout' && req.method === 'POST'){
        const body = await readBody(req, 64 * 1024);
        const r = await systemRoutes.phase5ProvincialTrafficRollout(req, body);
        return sendJson(res, r.status, r.body);
      }

      // /api/v1/system/national/regions (Phase 5 — P2-NI-01: کنترل‌پلین کلاسترهای ملی)
      if(p === '/api/v1/system/national/regions' && req.method === 'GET'){
        const r = await systemRoutes.nationalRegions(req, url.searchParams);
        return sendJson(res, r.status, r.body);
      }

      // /api/v1/system/national/capacity (Phase 5 — P2-NI-01 / P2-NI-03: مدل ظرفیت ملی پایش و سقف‌های اجبار)
      if(p === '/api/v1/system/national/capacity' && req.method === 'GET'){
        const r = await systemRoutes.nationalCapacity(req, url.searchParams);
        return sendJson(res, r.status, r.body);
      }

      // /api/v1/system/national/capacity/reservations (Phase 5 — P2-NI-03: فهرست رزروهای سهمیه)
      if(p === '/api/v1/system/national/capacity/reservations' && req.method === 'GET'){
        const r = await systemRoutes.nationalCapacityReservations(req, url.searchParams);
        return sendJson(res, r.status, r.body);
      }

      // /api/v1/system/national/capacity/reservation (Phase 5 — P2-NI-03: ثبت رزرو سهمیه با تایید انسانی)
      if(p === '/api/v1/system/national/capacity/reservation' && req.method === 'POST'){
        const body = await readBody(req, 64 * 1024);
        const r = await systemRoutes.nationalCapacityReserve(req, body);
        return sendJson(res, r.status, r.body);
      }

      // /api/v1/system/national/health (Phase 5 — P2-NI-01: تابلوی رصدپذیری ملی)
      if(p === '/api/v1/system/national/health' && req.method === 'GET'){
        const r = await systemRoutes.nationalHealth(req, url.searchParams);
        return sendJson(res, r.status, r.body);
      }

      // /api/v1/system/national/traffic (Phase 5 — P2-NI-01: فابریک ترافیک ملی)
      if(p === '/api/v1/system/national/traffic' && req.method === 'GET'){
        const r = await systemRoutes.nationalTraffic(req, url.searchParams);
        return sendJson(res, r.status, r.body);
      }

      // /api/v1/system/national/operations (Phase 5 — P2-NI-02: مرکز عملیات ملی)
      if(p === '/api/v1/system/national/operations' && req.method === 'GET'){
        const r = await systemRoutes.nationalOperations(req, url.searchParams);
        return sendJson(res, r.status, r.body);
      }

      // /api/v1/system/national/readiness (Phase 5 — P2-NI-02: گیت آمادگی انتشار ملی)
      if(p === '/api/v1/system/national/readiness' && req.method === 'GET'){
        const r = await systemRoutes.nationalReadiness(req, url.searchParams);
        return sendJson(res, r.status, r.body);
      }

      // /api/v1/system/national/load-test (Phase 5 — P2-NI-02: شبیه‌سازی بار ملی)
      if(p === '/api/v1/system/national/load-test' && req.method === 'GET'){
        const r = await systemRoutes.nationalLoadTest(req, url.searchParams);
        return sendJson(res, r.status, r.body);
      }

      // /api/v1/system/national/incidents (Phase 5 — P2-NI-02: رخدادهای مرکز عملیات ملی)
      if(p === '/api/v1/system/national/incidents' && req.method === 'GET'){
        const r = await systemRoutes.nationalIncidents(req, url.searchParams);
        return sendJson(res, r.status, r.body);
      }

      // /api/v1/system/national/change-request (Phase 5 — P2-NI-01 / P2-NI-02: ثبت تغییرات زیرساخت با تایید انسانی)
      if(p === '/api/v1/system/national/change-request' && req.method === 'POST'){
        const body = await readBody(req, 64 * 1024);
        const r = await systemRoutes.nationalChangeRequest(req, body);
        return sendJson(res, r.status, r.body);
      }

      // /api/v1/system/national/write-smoothing (Phase 5 — P2-NI-05: تلطیف بارهای انفجاری نوشت)
      if(p === '/api/v1/system/national/write-smoothing' && req.method === 'GET'){
        const r = await systemRoutes.nationalWriteSmoothing(req, url.searchParams);
        return sendJson(res, r.status, r.body);
      }

      // Phase 6: Canary Status (B1 & B6: رصد بلادرنگ وضعیت کلاسترها، اوزان و SLO)
      if(p === '/api/v1/system/phase6/canary/status' && req.method === 'GET'){
        const r = await systemRoutes.phase6CanaryStatus(req, url.searchParams);
        return sendJson(res, r.status, r.body);
      }

      // Phase 6: Canary Promote / Weight (B3: ارتقای ترافیک با اعتبارسنجی حاکمیت و امضای اپراتور)
      if((p === '/api/v1/system/phase6/canary/promote' || p === '/api/v1/system/phase6/canary/weight') && req.method === 'POST'){
        const body = await readBody(req, 64 * 1024);
        const r = await systemRoutes.phase6CanaryPromote(req, body);
        return sendJson(res, r.status, r.body);
      }

      // Phase 6: Canary Rollback (B4: رول‌بک اضطراری و تخلیه آنی ترافیک به ۰٪)
      if(p === '/api/v1/system/phase6/canary/rollback' && req.method === 'POST'){
        const body = await readBody(req, 64 * 1024);
        const r = await systemRoutes.phase6CanaryRollback(req, body);
        return sendJson(res, r.status, r.body);
      }

      // Phase 6: Canary Circuit Breaker & Failover Control (B5)
      if(p === '/api/v1/system/phase6/canary/circuit-breaker' && req.method === 'POST'){
        const body = await readBody(req, 64 * 1024);
        const r = await systemRoutes.phase6CanaryCircuitBreaker(req, body);
        return sendJson(res, r.status, r.body);
      }

      // Phase 5 (P2-NI-05): National Capacity Gate for core entity writes & reads
      if(p.startsWith('/api/v1/students') || p.startsWith('/api/v1/classes') || p.startsWith('/api/v1/attendance') || p.startsWith('/api/v1/grades')){
        if(!nationalCapacityGateMiddleware(req, res)) return;
      }

      // /api/v1/students & /api/v1/students/:id
      if(p === '/api/v1/students' && req.method === 'GET'){
        const r = await studentRoutes.getStudentsList(req, url.searchParams);
        return sendJson(res, 200, r);
      }
      if(p === '/api/v1/students' && req.method === 'POST'){
        const r = await studentRoutes.createStudent(req, await readBody(req, 64 * 1024));
        return sendJson(res, r.status, r.body);
      }
      if(/^\/api\/v1\/students\/\d+$/.test(p)){
        const id = p.split('/')[4];
        if(req.method === 'GET'){
          const r = await studentRoutes.getStudentById(req, id);
          return sendJson(res, r.status, r.body);
        }
        if(req.method === 'PATCH'){
          const r = await studentRoutes.updateStudent(req, id, await readBody(req, 64 * 1024));
          return sendJson(res, r.status, r.body);
        }
        if(req.method === 'DELETE'){
          const r = await studentRoutes.deleteStudent(req, id);
          return sendJson(res, r.status, r.body);
        }
      }

      // /api/v1/classes & /api/v1/classes/:id
      if(p === '/api/v1/classes' && req.method === 'GET'){
        const r = await classRoutes.getClassesList(req, url.searchParams);
        return sendJson(res, 200, r);
      }
      if(p === '/api/v1/classes' && req.method === 'POST'){
        const r = await classRoutes.createClass(req, await readBody(req, 64 * 1024));
        return sendJson(res, r.status, r.body);
      }
      if(/^\/api\/v1\/classes\/\d+$/.test(p)){
        const id = p.split('/')[4];
        if(req.method === 'GET'){
          const r = await classRoutes.getClassById(req, id);
          return sendJson(res, r.status, r.body);
        }
        if(req.method === 'PATCH'){
          const r = await classRoutes.updateClass(req, id, await readBody(req, 64 * 1024));
          return sendJson(res, r.status, r.body);
        }
        if(req.method === 'DELETE'){
          const r = await classRoutes.deleteClass(req, id);
          return sendJson(res, r.status, r.body);
        }
      }

      // /api/v1/attendance & /api/v1/attendance/:id
      if(p === '/api/v1/attendance' && req.method === 'GET'){
        const r = await attendanceRoutes.getAttendanceList(req, url.searchParams);
        return sendJson(res, 200, r);
      }
      if(p === '/api/v1/attendance' && req.method === 'POST'){
        const r = await attendanceRoutes.createAttendance(req, await readBody(req, 64 * 1024));
        return sendJson(res, r.status, r.body);
      }
      if(/^\/api\/v1\/attendance\/\d+$/.test(p)){
        const id = p.split('/')[4];
        if(req.method === 'PATCH'){
          const r = await attendanceRoutes.updateAttendance(req, id, await readBody(req, 64 * 1024));
          return sendJson(res, r.status, r.body);
        }
        if(req.method === 'DELETE'){
          const r = await attendanceRoutes.deleteAttendance(req, id);
          return sendJson(res, r.status, r.body);
        }
      }

      // /api/v1/grades & /api/v1/grades/:id
      if(p === '/api/v1/grades' && req.method === 'GET'){
        const r = await gradeRoutes.getGradesList(req, url.searchParams);
        return sendJson(res, 200, r);
      }
      if(p === '/api/v1/grades' && req.method === 'POST'){
        const r = await gradeRoutes.createGrade(req, await readBody(req, 64 * 1024));
        return sendJson(res, r.status, r.body);
      }
      if(/^\/api\/v1\/grades\/\d+$/.test(p)){
        const id = p.split('/')[4];
        if(req.method === 'PATCH'){
          const r = await gradeRoutes.updateGrade(req, id, await readBody(req, 64 * 1024));
          return sendJson(res, r.status, r.body);
        }
        if(req.method === 'DELETE'){
          const r = await gradeRoutes.deleteGrade(req, id);
          return sendJson(res, r.status, r.body);
        }
      }

      // /api/v1/users & /api/v1/users/:id
      if(p === '/api/v1/users' && req.method === 'GET'){
        const r = await userRoutes.getUsersList(req, url.searchParams);
        return sendJson(res, 200, r);
      }
      if(p === '/api/v1/users' && req.method === 'POST'){
        const r = await userRoutes.createUser(req, await readBody(req, 64 * 1024));
        return sendJson(res, r.status, r.body);
      }
      if(/^\/api\/v1\/users\/\d+$/.test(p)){
        const id = p.split('/')[4];
        if(req.method === 'GET'){
          const r = await userRoutes.getUserById(req, id);
          return sendJson(res, r.status, r.body);
        }
        if(req.method === 'PATCH'){
          const r = await userRoutes.updateUser(req, id, await readBody(req, 64 * 1024));
          return sendJson(res, r.status, r.body);
        }
        if(req.method === 'DELETE'){
          const r = await userRoutes.deleteUser(req, id);
          return sendJson(res, r.status, r.body);
        }
      }

      return sendJson(res, 404, { ok: false, code: 'not_found' });
    }
    if(p.indexOf('/api/') === 0) return sendJson(res, 404, { ok: false, code: 'not_found' });
    return await serveStatic(res, p, nonce);
  }catch(err){
    /* R96 P0-5: حجمِ بیش‌ازحدِ body → 413 (نه 500) — و خطا را لاگ نکن که
       محتوای بدنه در audit نیاید. */
    if(err && err.message === 'too_large'){
      audit('body_too_large', { path: p });
      if(!res.headersSent) sendJson(res, 413, { ok: false, code: 'body_too_large' });
      else res.end();
      return;
    }
    audit('error', { path: p, msg: String(err.message || err).slice(0, 120) });
    if(!res.headersSent) sendJson(res, 500, { ok: false, code: 'server_error' });
    else res.end();
  }
};

/* ── Wave 15: شمارشِ درخواست‌هایِ درحالت‌پرواز برایِ Graceful Shutdown ──
   هر درخواست در ورود شمار می‌شود و در 'close' پاسخ (پس از flush کامل،
   حتی روی اتصالِ keep-alive) کم می‌شود. drain = صفرِ این شمارنده. */
let draining = false;
let inFlight = 0;
const SHUTDOWN_TIMEOUT_MS = Math.max(500, Number(process.env.PAYESH_SHUTDOWN_TIMEOUT_MS) || 10000);
const wrappedRequest = async (req, res) => {
  inFlight++;
  res.on('close', () => { inFlight = Math.max(0, inFlight - 1); });
  /* S7-1: fail-safe — a rejection from any request handler must never reach the
     process-level unhandledRejection path (Node ≥15 exits the process there).
     One bad request may fail; it may not take the service down with it. */
  try{
    await onRequest(req, res);
  }catch(e){
    try{ console.error('[request] unhandled handler error:', (e && e.message) || e); }catch(_){}
    try{ if(!res.writableEnded) sendJson(res, 500, { ok: false, code: 'internal_error' }); }catch(_){}
  }
};

/* ── TLS (stage 2): real https when PAYESH_TLS_CERT / PAYESH_TLS_KEY
     point at PEM files (self-signed: `node server/tls-cert.js`).
     PAYESH_HTTPS=1 still means "behind a TLS reverse proxy". ──────── */
const TLS_CERT = process.env.PAYESH_TLS_CERT || null;
const TLS_KEY  = process.env.PAYESH_TLS_KEY  || null;
let server;
if(TLS_CERT || TLS_KEY){
  if(!TLS_CERT || !TLS_KEY){
    console.error('TLS needs BOTH PAYESH_TLS_CERT and PAYESH_TLS_KEY');
    process.exit(1);
  }
  if(!fs.existsSync(TLS_CERT) || !fs.existsSync(TLS_KEY)){
    console.error('TLS file missing: check PAYESH_TLS_CERT and PAYESH_TLS_KEY paths');
    console.error('generate one:  node server/tls-cert.js');
    process.exit(1);
  }
  const keyPem  = fs.readFileSync(TLS_KEY);
  const certPem = fs.readFileSync(TLS_CERT);
  /* Round 85 (P1-4): production fail-fast. A self-signed cert (e.g. the
     dev one from `node server/tls-cert.js`) is fine for local dev, but a
     deployment that declares PAYESH_ENV=production must present a
     CA-issued cert — real PII (nid/phone) must not ride a cert the
     client cannot verify. subject===issuer is the self-signed marker. */
  if(process.env.PAYESH_ENV === 'production'){
    try{
      const x509 = new (require('crypto').X509Certificate)(certPem);
      if(x509.subject === x509.issuer){
        console.error('Error: Production requires valid CA certificate (self-signed cert detected; see DEPLOY.md §TLS — certbot)');
        process.exit(1);
      }
    }catch(e){
      console.error('Error: Production requires valid CA certificate (cert unreadable: ' + e.message + ')');
      process.exit(1);
    }
  }
  const https = require('https');
  server = https.createServer({ key: keyPem, cert: certPem }, wrappedRequest);
}else{
  server = http.createServer(wrappedRequest);
}
/* Wave 14 — تاپِ زمان‌سنجی پاسخ (هر دو حالت HTTP/HTTPS) — fail-safe؛ هرگز
   بوتِ سرویس را نمی‌شکند. */
try { if (server) metrics.attach(server); } catch (e) {}
/* S-73-6: connection/request timeouts — a stalled client must not hold a
   socket forever (slowloris surface). 65s covers the slowest legit op. */
/* R96 P1-10: production باید TLS داشته باشد — یا مستقیم (گواهیِ CA) یا
   پشتِ reverse-proxyِ اعلام‌شده. وگرنه استارت نمی‌کند (fail-fast). */
if(process.env.PAYESH_ENV === 'production' && !TLS_CERT && !TLS_KEY
   && process.env.PAYESH_BEHIND_PROXY !== '1' && process.env.PAYESH_HTTPS !== '1'){
  console.error('Error: production requires TLS — set PAYESH_TLS_CERT/PAYESH_TLS_KEY (CA-issued cert) or PAYESH_BEHIND_PROXY=1 behind a TLS reverse proxy');
  process.exit(1);
}
try{
  if('requestTimeout' in server) server.requestTimeout = 65000;
  if('headersTimeout' in server) server.headersTimeout = 65000;
  server.keepAliveTimeout = 65000;
}catch(e){}

/* ── Wave 15: Graceful Shutdown (SIGTERM / SIGINT) ───────────────────
   توالی:
     1) draining = true — /api/readiness فوراً 503 (بالانس بار از ما می‌رود)
     2) closeIdleConnections + server.close — پذیرشِ اتصالِ تازه متوقف
        (اتصالاتِ keep-aliveٔ خالی فوراً بسته می‌شوند؛ Node ≥ 18.2)
     3) انتظارِ پایانِ درخواست‌هایِ درحالت‌پرواز (poll 50ms؛ مهلت
        PAYESH_SHUTDOWN_TIMEOUT_MS، پیش‌فرض 10s)
     4) seamِ worker: اگر در آینده workerی بیاید همین‌جا ایستاده
        شود (این شاخه worker ندارد؛ تایمرِ بکاپِ خودکار unref است و
        خروج را نگه نمی‌دارد — persistStoreٔ بعدی dirty را می‌پوشاند)
     5) persistStore (همگام) + db.close() + redis.close() (ناهمگام)
     6) process.exit(0)
   نگهبانِ زور: اگر drain از مهلت بگذرد، خروج اجباری با کد ۱
   (غیرصفر = قابلِ مشاهده در مانیتورینگ؛ کد ۰ فقط برایِ ختمِ تمیز).
   اگر listener اصلاً شروع نشده باشد (تستِ درون‌فرایند)، server.close()
   بی‌اثر است و توالی به‌همان‌ترتیب انجام می‌شود. */
let shutdownRunning = false;
function handleShutdown(signal) {
  if (draining || shutdownRunning) return;
  shutdownRunning = true;
  draining = true;
  const t0 = Date.now();
  const started = inFlight;
  console.log('[shutdown] ' + signal + ' received — draining ' + started + ' in-flight request(s), budget ' + SHUTDOWN_TIMEOUT_MS + 'ms');
  try { if (server.closeIdleConnections) server.closeIdleConnections(); } catch (e) {}
  try { server.close(() => {}); } catch (e) {} /* ERR_SERVER_NOT_RUNNING — context تست */
  let done = false;
  const killer = setTimeout(() => {
    console.error('[shutdown] drain budget exceeded — forcing exit');
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS + 2000);
  const poll = setInterval(() => {
    if (inFlight > 0) return;
    finish();
  }, 50);
  function finish() {
    if (done) return;
    done = true;
    clearTimeout(killer);
    clearInterval(poll);
    try { persistStore(); } catch (e) {}
    (async () => {
      try { await db.close(); } catch (e) {}
      try { await redis.close(); } catch (e) {}
      console.log('[shutdown] clean — dependencies closed in ' + (Date.now() - t0) + 'ms; exit 0');
      process.exit(0);
    })();
  }
  /* بدونِ listenerِ فعال، close() هرگز کامل نمی‌شود — اگر الان هم درحالت
    پروازی نباشد، خودمان را پیش می‌بریم (poll ۵۰ms هم پادزهرِ دوم است). */
  if (inFlight === 0) setTimeout(() => { if (inFlight === 0) finish(); }, 50);
}
process.on('SIGTERM', () => { handleShutdown('SIGTERM'); });
process.on('SIGINT', () => { handleShutdown('SIGINT'); });

/* ── بکاپِ دوره‌ایِ خودکار (باقی‌ماندهٔ 2.4) — درون‌پروسه ─────────
   PAYESH_BACKUP_EVERY_HOURS (production، مثلاً 24) یا
   PAYESH_BACKUP_EVERY_MS (تست). بی‌ارزش/صفر = خاموش. */
const BACKUP_EVERY_MS = (Number(process.env.PAYESH_BACKUP_EVERY_MS) > 0)
  ? Number(process.env.PAYESH_BACKUP_EVERY_MS)
  : (Number(process.env.PAYESH_BACKUP_EVERY_HOURS) > 0
      ? Number(process.env.PAYESH_BACKUP_EVERY_HOURS) * 3600000 : 0);

if(require.main === module){
  /* Wave 15: این خطِ verbatim باید بماند (جهشِ M18 روی همین الگو است).
     تایمرِ بکاپِ خودکار unref است — خروجِ shutdown را هرگز نگه نمی‌دارد؛
     persistStoreٔ نهاییِ handleShutdown وضعیتِ dirty را می‌پوشاند. */
  if(BACKUP_EVERY_MS > 0) admin.startAutoBackup(BACKUP_EVERY_MS);
  /* ویو ۱۴ — نمونه‌برداریِ runtime (heap/rss/cpu/event-loop lag). تایمرها
     unref هستند: هرگز فرآیند را زنده نگه نمی‌دارند. */
  metrics.startRuntimeCollector();
  metrics.set('payesh_build_info', { version: '1.0', phase: '1' }, 1);
  /* P0-1 — synchronous boot gate. Evaluated here (not in the async db.init
     handler) so the failure reason is unambiguous and always precedes the
     Redis readiness gate: in production, an absent DATABASE_URL must never
     reach listen(). Unreachable-but-configured PostgreSQL is caught by the
     ok:false branch of db.init above. */
  if (db.isProductionEnv() && !process.env.DATABASE_URL && !db.memoryFallbackAllowed()) {
    console.error('[FATAL] ' + db.backingStorePolicy().reason);
    console.error('Error: production requires PostgreSQL — set DATABASE_URL (the JSON/in-memory store is dev-only and forks per instance)');
    try { persistStoreSync(); } catch (e) {}
    process.exit(1);
  }
  const startListening = async () => {
    if (process.env.DATABASE_URL) {
      const info = await Promise.resolve(dbReady);
      if (!info || info.ok === false || info.driver !== 'postgres') {
        console.error('[FATAL] DATABASE_URL set but PostgreSQL is not ready — refusing listen()');
        process.exit(1);
      }
      if (!authority.attached()) {
        console.error('[FATAL] DATABASE_URL set but authority is not attached/hydrated — refusing listen()');
        process.exit(1);
      }
    }
    if (canaryHydrated) {
      /* Root-cause fix: no socket until canary weights are loaded (or loudly failed). */
      try { await canaryHydrated; }
      catch (e) {
        if (process.env.DATABASE_URL) {
          console.error('[FATAL] canary hydrate failed — refusing listen():', e && e.message);
          process.exit(1);
        }
        console.warn('[CANARY] boot continues WITHOUT persisted weights (loud degradation — see error above)');
      }
    }
    /* P1: پیش از باز کردنِ سوکت، دروازهٔ آمادگیِ کش (ردیس) هم به نتیجه برسد.
       در غیر این صورت با ردیسِ غیرقابلِ دسترس، سوکت پیش از exit(1) باز می‌ماند. */
    try { await cacheReady; }
    catch (e) {
      console.error('[FATAL] cache readiness crashed — refusing listen():', e && e.message);
      process.exit(1);
    }
    server.listen(PORT, HOST, () => {
    const proto = (TLS_CERT && TLS_KEY) ? 'https' : 'http';
    console.log('payesh-server (phase 1' + (TLS_CERT ? ' + TLS' : '') + ') on ' + proto + '://' + HOST + ':' + PORT);
    console.log('  static : ' + path.join(ROOT, 'index.html'));
    console.log('  api    : /api/health /api/readiness /api/liveness /api/auth/* /api/sync /api/sync/conflicts /api/sync/resolve-conflict /api/students/:id /api/bell/now /api/public-report /api/admin/{backup,restore} /api/sms/send');
    console.log('  metrics: /metrics (' + (process.env.PAYESH_METRICS_TOKEN ? 'bearer token' : (process.env.PAYESH_ENV === 'production' || process.env.NODE_ENV === 'production') ? 'DISABLED — set PAYESH_METRICS_TOKEN' : 'loopback only') + ')');
    console.log('  store  : ' + STORE_FILE + '  (' + (store.users || []).length + ' users)');
    if(BACKUP_EVERY_MS > 0){
      /* A-05b: در حالتِ PG-live، تایمرِ بکاپ عمداً مسلح نمی‌شود (PG مرجع
         است — admin.startAutoBackup هیچ‌وقت فایل نمی‌نویسد). چاپِ «automatic
         every N min» در این حالت یک قولِ دروغ بود. */
      if (db && typeof db.isPostgres === 'function' && db.isPostgres()) {
        console.log('  backup : in-process JSON export refused in PG mode — timer NOT armed. ' +
          'Use pg_dump / pgBackRest / WAL-G at the infrastructure level (docs/RELIABILITY_DR_PLAN.md).');
      } else {
        console.log('  backup : automatic every ' + Math.round(BACKUP_EVERY_MS / 60000) + ' min (retention ' + 10 + ')');
      }
    } else if (process.env.NODE_ENV === 'production' || process.env.PAYESH_ENV === 'production' || process.env.DATABASE_URL) {
      /* A-05: بکاپِ خودکار پیش‌فرض خاموش است و تا پیش از این در زمانِ بوتِ
         تولید هیچ خطی چاپ نمی‌شد — یک استقرار می‌توانست بدونِ هیچ بکاپی
         بالا بیاید. اکنون هشدارِ بلند (نه مسدودکننده) داده می‌شود. */
      console.warn('  ⚠ backup: DISABLED — set PAYESH_BACKUP_EVERY_HOURS (e.g. 24) or PAYESH_BACKUP_EVERY_MS. ' +
        'No automatic backup will run in this process.');
    }
    });
  };
  /* P0-1 — in production, listen() waits for database readiness. Without this
     the asynchronous gate loses the race with listen(): the process accepted
     connections for a few hundred ms and only then exited non-zero, which is
     not fail-closed. Dev/test keep the previous immediate listen, so
     zero-disruption local boot is unchanged. */
  if (process.env.DATABASE_URL || (db.isProductionEnv() && !db.memoryFallbackAllowed())) {
    Promise.resolve(dbReady).then((info) => {
      if (process.env.DATABASE_URL && (!info || info.ok === false || info.driver !== 'postgres')) {
        console.error('[FATAL] DATABASE_URL hydrate failed — refusing listen()');
        process.exit(1);
      }
      if (info && info.ok === false) return; /* handler above already exits */
      startListening();
    }).catch((e) => {
      console.error('[FATAL] boot gate failed:', e && e.message);
      if (process.env.DATABASE_URL) process.exit(1);
    });
  } else {
    startListening();
  }
}
/* rebase: union — main added persistStoreSync/workers/staticCache + Wave 6/15 test hooks, Wave 14 adds metrics. */
module.exports = {
  server, store, audit, isHttps, persistStore, persistStoreSync, db, redis, cache, workers, staticCache, metrics,
  __gcStoreForTests: gcStore,
  /* Wave 6: برای تستِ مستقیمِ نگهبانِ شمارش (state روی Redis) */
  __enumForTests: { enumTouch, enumRead, enumDelayMs, enumStage, enumKey },
  /* Wave 15: برای تستِ Graceful Shutdown (وضعیتِ drain) */
  __drainForTests: () => ({ draining, inFlight })
};
 + (n + 1)).join(', ');
            await db.query(
              'INSERT INTO ' + ident(col) + ' (' + fields.map(ident).join(', ') + ') VALUES (' + placeholders + ') ON CONFLICT DO NOTHING',
              params
            );
            rows++;
          } catch (e2) {
            skipped++;
          }
        }
      }
    }
    /* F1: explicit-id bootstrap rows must move PostgreSQL identity sequences
       forward before the application allocates new ids. */
    try {
      const sr = await db.query(
        'SELECT pg_get_serial_sequence($1, $2) AS seq', [col, 'id']
      );
      const seqName = sr && sr.rows && sr.rows[0] && sr.rows[0].seq;
      if (seqName) {
        await db.query(
          'SELECT setval($1::regclass, COALESCE((SELECT MAX(id) FROM ' + ident(col) + '), 1), true)',
          [seqName]
        );
      }
    } catch (e) {
      skipped++;
    }
  }
  if (skipped > 0) {
    const e = new Error('bootstrap→PG seed incomplete: ' + skipped + ' row/sequence operation(s) failed');
    e.code = 'bootstrap_seed_incomplete';
    e.skipped = skipped;
    throw e;
  }
  return { rows, tables, skipped };
}

/* P0-1: mirror of the cache/Redis readiness gate below. db.init now reports
     ok:false in production when PostgreSQL is absent/unreachable — the server
     must not serve traffic from the JSON store. */
  if (info && info.ok === false) {
    console.error('[FATAL] Database readiness failed:', info.error || info.warning || 'unknown');
    if (process.env.NODE_ENV === 'production' || process.env.PAYESH_ENV === 'production') {
      try { db.close(); } catch (e) {}
      process.exit(1);
    }
    return info;
  }
  if (info.driver === 'postgres') {
    console.log('[DB] Connected to PostgreSQL relational engine');
    /* Migration-012 contract, self-configured (Chat 2 remediation): on a chain-
       migrated database the grades/attendance tables are partitioned with PK
       (id, created_at) — writes only stay correct when PAYESH_PARTITIONED_TABLES
       lists them. Operators kept forgetting the env ⇒ every attendance/grades
       mirror write failed with `no unique ... for ON CONFLICT`. Detect once at
       boot and merge into the env (explicit operator value still wins). */
    try {
      const pr = await db.query(`SELECT c.relname FROM pg_partitioned_table pt JOIN pg_class c ON c.oid = pt.partrelid WHERE c.relname IN ('grades','attendance')`);
      const parts = pr.rows.map(x => x.relname);
      if (parts.length) {
        const cur = String(process.env.PAYESH_PARTITIONED_TABLES || '').split(',').map(x => x.trim()).filter(Boolean);
        const merged = [...new Set([...cur, ...parts])].join(',');
        if (cur.join(',') !== merged) {
          process.env.PAYESH_PARTITIONED_TABLES = merged;
          console.log('[DB] partitioned tables detected — PAYESH_PARTITIONED_TABLES=' + merged + ' (auto-configured, migration 012 contract)');
        }
      }
    } catch (e) { /* pre-012 database — nothing to configure */ }
    /* P0-BUG-04 fix (Chat 2 remediation, 2026-09-19): PG empty + a populated
       bootstrap JSON store ⇒ hydration would REPLACE the bootstrap data with
       empty arrays and the persist loop then overwrites the store FILE with an
       empty shell (auth dies, local data destroyed — reproduced live).
       Guard: when both users and schools are empty in PG and the bootstrap
       store has users, keep the bootstrap data this boot AND seed PostgreSQL
       from it once (mission option A+B combined) — PG becomes the real SSoT
       and the next boot hydrates normally. */
    let keepBootstrap = false;
    try {
      const er = await db.query('SELECT (SELECT COUNT(*) FROM users) AS u, (SELECT COUNT(*) FROM schools) AS s');
      const pgEmpty = Number(er.rows[0].u) === 0 && Number(er.rows[0].s) === 0;
      keepBootstrap = pgEmpty && Array.isArray(store.users) && store.users.length > 0
        && process.env.PAYESH_FORCE_HYDRATION !== '1';   /* B7: explicit force overrides the guard */
    } catch (e) { /* tables missing ⇒ not a clean-empty PG — hydrate as before */ }
    if (keepBootstrap) {
      console.log('[store] PG is empty and a bootstrap JSON store is present — hydration SKIPPED (P0-BUG-04 guard); seeding PG from the bootstrap store now (one-time)...');
      try {
        const r = await seedPgFromBootstrap(store, db);
        console.log('[store] bootstrap→PG seed done: ' + r.rows + ' row(s) / ' + r.tables + ' table(s)' + (r.skipped ? ' — skipped ' + r.skipped + ' non-mappable row(s)' : ''));
      } catch (e) {
        console.warn('[store] bootstrap→PG seed failed (bootstrap mode stays; retried next boot):', e.message);
      }
    } else
    /* Wave 1: PG is authoritative — replace store domain collections with
       PG truth at boot (per-table failures warn and keep going). */
    try {
      const h = await db.hydrateStoreFromPg(store);
      mirrorIncomplete = db.shouldPersistMirrorFile(db.isPostgres(), h) === false;
      if (mirrorIncomplete) {
        console.warn('[store] mirror incomplete (capped/env-skipped hydration) — JSON file persist DISABLED: a trimmed snapshot must never overwrite the full store file (PG is authoritative)');
      }
      if (db.hydrationUsersCapped && db.hydrationUsersCapped(h)) {
        console.warn('[store] WARNING: users hydration is capped — users beyond the cap CANNOT authenticate; PAYESH_PG_HYDRATE_LIMIT is for load-test/staging sandboxes only (see docs/WAVE18_LOAD_TEST_REPORT.md §5-4)');
      }
      console.log('[DB] Hydrated ' + h.hydrated + ' collections from PostgreSQL' +
        (h.skipped.length ? ' (skipped: ' + h.skipped.join(',') + ')' : '') +
        (h.capped && h.capped.length ? ' (capped: ' + h.capped.join(',') + ')' : '') +
        (h.env_skipped && h.env_skipped.length ? ' (env-skipped: ' + h.env_skipped.join(',') + ')' : ''));
    } catch (e) { console.warn('[DB] Hydration warning:', e.message); }
    try {
      require('./infrastructure/ops-kv').attach(db);
      await require('./infrastructure/national-traffic-fabric').refreshTrafficFromSoT();
      console.log('[OPS-KV] attached — Phase-5 traffic fabric hydrates from phase6_ops_kv');
    } catch (e) {
      console.error('[OPS-KV] attach/hydrate failed:', e && e.message);
      if (process.env.NODE_ENV === 'production' || process.env.PAYESH_ENV === 'production') throw e;
    }
    try {
      authority.attach(db);
      await authority.hydrateControlPlane();
      console.log('[AUTHORITY] attached + control-plane hydrated from PostgreSQL');
    } catch (e) {
      console.error('[AUTHORITY] attach/hydrate failed:', e && e.message);
      if (process.env.DATABASE_URL) throw e;
    }
  }
  return info;
}).catch(err => {
  console.warn('[DB] PostgreSQL init warning:', err.message);
  return null;
});

/* A-22 (re-audit): شکلِ productionِ یکپارچه — همان تعریفی که redis.js
   (isProduction/prodRethrow/prodNoRedis) برایِ الزامِ ردیس به کار می‌برد.
   هر استقراری که REDIS_URL یا DATABASE_URL دارد production محسوب می‌شود؛
   در غیرِ این صورت NODE_ENV، و سپس PAYESH_ENV (با ALLOW_MEMORY_FALLBACK برای
   dev/test). این تابع تنها ملاکِ «بوت نباید بدونِ کشِ مشترک ادامه یابد»
   است و در مسیرهایِ پایینِ cache.init آمده است. */
function isProdShape() {
  if (process.env.REDIS_URL || process.env.DATABASE_URL) return true;
  if (process.env.NODE_ENV === 'production') return true;
  if (process.env.ALLOW_MEMORY_FALLBACK === '1' || process.env.ALLOW_MEMORY_FALLBACK === 'true') return false;
  return process.env.PAYESH_ENV === 'production';
}

/* P1: آماده‌سازیِ کش باید پیش از باز شدنِ سوکت به نتیجه برسد. پیش از این
   fire-and-forget بود: با ردیسِ پیکربندی‌شده اما غیرقابلِ دسترس، redis.init
   تا ۳ ثانیه طول می‌کشید و server.listen در همین پنجره سوکت را باز می‌کرد —
   یعنی درخواست‌ها سرو می‌شدند پیش از آنکه دروازهٔ بوتِ ردیس بتواند
   process.exit(1) کند. startListening اکنون cacheReady را هم await می‌کند. */
const cacheReady = cache.init().then((r) => {
  if (r && r.ok === false) {
    /* P0-13: در تولید بدونِ ردیسِ زنده سرویس نمی‌دهیم — فال‌بک به حافظهٔ
       محلی بین نمونه‌ها واگرا می‌شود. خروجی غیرصفر = شکستِ ریدی. */
    console.error('[FATAL] Cache readiness failed:', r.error || r.warning || 'unknown');
    /* Phase 8.1 (R5): the fail-fast predicate now covers every
       production-equivalent shape, not only NODE_ENV. Previously a boot that
       declared just PAYESH_ENV=production — or set DATABASE_URL with no
       production flag (PostgreSQL mode; redis.js isProduction() treats it as
       production for fail-closed) — logged this FATAL but kept listening
       forever with health=503: a zombie startup. A configured-but-unreachable
       Redis at boot keeps the same exit (Wave-15 boot contract); runtime
       outages after a healthy boot remain loud degradation (readiness 503,
       reconnect loop), unchanged.
       A-22 (re-audit): این مسیرِ انتهایی همچنین باید شکلِ «فقط REDIS_URL» را
       بپوشاند. redis.js هر استقراری که REDIS_URL دارد به‌عنوانِ تولید می‌بیند
       (prodRethrow/prodNoRedis به همین معنا fail-closed می‌شوند)، ولی این
       مسیر فقط NODE_ENV/PAYESH_ENV/DATABASE_URL را می‌سنجید. نتیجه: سرور
       با ردیسِ پیکربندی‌شده ولی مرده بالا می‌آمد، health=۵۰۳ می‌داد ولی
       همچنان ترافیک سرو می‌کرد و ابطال در هر درخواست fail-open می‌شد.
       (اثبات: tests/reaudit-redis-outage.js S1) */
    if (isProdShape()) {
      try { persistStore(); } catch (e) {}
      try { db.close(); } catch (e) {}
      process.exit(1);
    }
    return;
  }
  if (redis.isRedis()) {
    console.log('[Cache] Redis distributed caching and pub/sub active');
  }
}).catch((err) => {
  console.error('[FATAL] Cache init crashed:', (err && err.message) || err);
  if (isProdShape()) process.exit(1);
});

/* ── R97 (TODO 2.7) — نگهبانِ شمردنِ شناسه، سطحِ روتر ──────────────
   هر رد (401/403/404) برایِ هر نشست در پنجرهٔ ۱۰ دقیقه شمرده می‌شود:
     ≥ WARN   → auditِ هشدار
     ≥ SLOW1  → تأخیرِ ۵۰۰ms روی درخواست‌هایِ بعدیِ همان نشست
     ≥ SLOW2  → تأخیرِ ۲s
     ≥ REVOKE → ابطالِ نشست (jti) — ادامه = 401
   /api/auth/* مستثنی است (cooldown/سقف‌هایِ OTP سقفِ خودشان را دارند). */
const ENUM_WINDOW_MS = 10 * 60 * 1000;
const _num = (v, d) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : d; };
const ENUM_WARN   = _num(process.env.PAYESH_ENUM_WARN, 20);
const ENUM_SLOW1  = _num(process.env.PAYESH_ENUM_SLOW1, 100);
const ENUM_SLOW2  = _num(process.env.PAYESH_ENUM_SLOW2, 500);
const ENUM_REVOKE = _num(process.env.PAYESH_ENUM_REVOKE, 2000);
const REQ_STATE = { sess: null };
/* Wave 6: شمارندهٔ نگهبان روی Redis — پنجرهٔ ۱۰ دقیقه با TTL؛ بین نمونه‌ها
   مشترک (پیش‌تر درون‌فروشگاهی بود و چرخشِ حمله بین نمونه‌ها آن را صفر
   می‌کرد؛ هم‌چنین در payesh.json بدونِ GC رشدِ بی‌پایان داشت). */
const ENUM_TTL_S = ENUM_WINDOW_MS / 1000;
function enumKey(sess){ return 'payesh:enum:' + sess.jti; }
async function enumTouch(sess){
  try{
    return await redis.incrWithTtl(enumKey(sess), ENUM_TTL_S);
  }catch(e){ return 0; } /* خطای ردیس = شمارِ این درخواست گم می‌شود (سکوت) — پنجرهٔ بعدی از نو می‌شمارد */
}
async function enumRead(sess){
  try{
    const v = await redis.get(enumKey(sess));
    const n = v == null ? 0 : parseInt(v, 10);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }catch(e){ return 0; }
}
function enumDelayMs(n){
  if(n >= ENUM_SLOW2) return 2000;
  if(n >= ENUM_SLOW1) return 500;
  return 0;
}
/* R97 — مراحلِ نگهبان (هشدار/تأخیر/ابطال)؛ Wave 6: ورودی = nِ شمارندهٔ ردیس.
   ابطال در REVOKE هم توزیع‌شده می‌شود (denylistِ Redis) — پیش‌تر فقط محلی بود. */
function enumStage(n, sess){
  if(n === ENUM_WARN) audit('enum_warn', { user_id: sess.id, n });
  else if(n === ENUM_SLOW1) audit('enum_slow', { user_id: sess.id, n, delay_ms: 500 });
  else if(n === ENUM_SLOW2) audit('enum_slow2', { user_id: sess.id, n, delay_ms: 2000 });
  else if(n === ENUM_REVOKE){
    store.__revoked_jti[sess.jti] = { at: Date.now(), reason: 'enumeration' };
    revocation.revokeSession(sess.jti, SESSION_TTL_S).catch(() => {});
    audit('enum_revoke', { user_id: sess.id, n });
  }
}

let dirty = false;
function markDirty(){ dirty = true; workers.bump(); }

/* ── GC of internal state (دور ۸۵ P1-3 — AD ۸۵.۲) ─────────────
   سه نقشهٔ فقط-رشد:
   __processed_uids — ایدمپوتانس؛ صفِ کلاینت‌ها عمرش کمتر از ۳۰ روز
     است، پس uidهایِ کهنه‌تر هرگز دوباره ارسال نمی‌شوند. ری‌پلایِ
     یک uidِ کهنه پس از GC با قرارداد سازگار است (ایدمپوتانس در
     حدِ عمرِ صف برقرار است).
   __revoked_jti — فقط در حدِ TTLِ نشست (۸h، بند ۲.۱) معنا دارد.
   (R101: __auth.codes به otp.json رفت — جارویش با همان فایل است.)
   در حلقهٔ persist اجرا می‌شود: سه جارو O(n) ناچیز؛ payesh.json
   (و بکاپ‌هایش) دیگر بی‌پایان رشد نمی‌کنند. */
const UID_GC_MS = 30 * 24 * 3600 * 1000;
const JTI_GC_MS = SESSION_TTL_S * 1000;
function gcStore(){
  const now = Date.now();
  let n = 0;
  /* logout stores a scalar timestamp, while the enumeration guard stores
     { at, reason }. Normalize both shapes before applying the retention
     window; subtracting an object yields NaN and made those entries live
     forever in a long-running process. Invalid internal timestamps are
     discarded as unusable state so the maps remain bounded. */
  const timestampOf = (value) => {
    if (typeof value === 'number') return value;
    if (value && typeof value === 'object') return Number(value.at);
    return Number(value);
  };
  const expired = (value, ttl) => {
    const at = timestampOf(value);
    return !Number.isFinite(at) || now - at > ttl;
  };
  for(const k in store.__processed_uids){
    if(expired(store.__processed_uids[k], UID_GC_MS)){ delete store.__processed_uids[k]; n++; }
  }
  for(const k in store.__revoked_jti){
    if(expired(store.__revoked_jti[k], JTI_GC_MS)){ delete store.__revoked_jti[k]; n++; }
  }
  return n;
}
/* ── Wave 9 — persist بیرون از رشتهٔ اصلی ──────────────────────────
   مسیرِ عادی (تیکرِ ۲ ثانیه): اسنپ‌شات با structured clone به ورکر
   می‌رود؛ JSON.stringify و نوشتنِ فایل در رشتهٔ پس‌زمینه انجام می‌شود.
   تازگیِ داده با نسخه‌ها تضمین می‌شود (workers.bump در markDirty):
   هر جهشِ حینِ پرواز دوباره dirty می‌کند و چرخهٔ بعدی می‌نویسد.
   هم‌جوشی: اگر نوشتنِ قبلی هنوز در جریان است، فقط پرچم می‌خورد. */
let persistBusy = false;    /* نوشتنِ ورکر در جریان است */
let persistQueued = false;  /* حینِ پرواز دوباره کثیف شد */
function persistStore(){
  /* PR #94 review-guard: با آینهٔ سقف‌دار، فایل هرگز با اسنپ‌شاتِ بریده
     بازنویسی نمی‌شود (این مسیرِ FATAL/فال‌بک هم هست). شرط عمداً فقط
     mirrorIncomplete است، نه isPostgres(): در خاموشی، db.close() پیش از
     رویدادِ exit اجرا می‌شود و isPostgres() دیگر false است — تصمیم باید
     با snapshotِ بوت قفل بماند (یافتهٔ آزمونِ لایو). */
  if(mirrorIncomplete) return;
  if(!dirty) return;
  if(persistBusy){ persistQueued = true; return; }
  dirty = false; /* نقطهٔ اسنپ‌شات — جهشِ بعدی دوباره کثیف می‌کند */
  const gc = gcStore();
  if(gc) try { audit('store_gc', { removed: gc }); } catch(e){}
  persistBusy = true;
  workers.runPersist(STORE_FILE).then(() => {
    persistBusy = false;
    if(persistQueued || dirty){ persistQueued = false; persistStore(); }
  }).catch(() => {
    persistBusy = false;
    persistStoreSync(); /* ورکر در دسترس نیست → مسیرِ سنکرونِ قدیمی */
  });
}
/* مسیرِ سنکرون — فقط خاموشی (exit/SIGTERM/SIGINT) و فال‌بکِ خطای ورکر؛
   هرگز در مسیرِ درخواست یا تیکرِ دوره‌ای صدا نمی‌شود. */
function persistStoreSync(){
  /* همان گارد — مسیرِ خاموشی (exit/SIGTERM/SIGINT) و فال‌بکِ ورکر.
     مستقل از isPostgres(): در exit بعد از db.close() اتصال مرده است ولی
     آینه هنوز بریده است — نباید نوشت. */
  if(mirrorIncomplete) return;
  if(!dirty && !persistBusy && !persistQueued) return;
  dirty = false; persistQueued = false;
  const gc = gcStore();
  if(gc) try { audit('store_gc', { removed: gc }); } catch(e){}
  try{
    const tmp = STORE_FILE + '.tmp';
    /* Wave 24 (KPI-3): همان قالبِ ASCII-escapedِ ورکر — پارسِ بوتِ بعدی سریع‌تر.
       این مسیر فقط در خاموشی/فال‌بک اجرا می‌شود؛ ~۴۰ms اضافه بی‌اثر است. */
    fs.writeFileSync(tmp, require('./json-fast').stringifyAscii(store), { encoding: 'utf8', mode: 0o600 }); /* S-73-3: PII — owner-only */
    fs.renameSync(tmp, STORE_FILE);
    try{ fs.chmodSync(STORE_FILE, 0o600); }catch(e){}
  }catch(e){ /* store file may be gone (tests) — never crash on exit */ }
}
/* P0-1: the periodic JSON mirror must never run in production. If PostgreSQL
   drops mid-session, isPostgres() goes false — writing payesh.json at that
   point would silently fork state per instance, which is exactly what the boot
   gate refuses. Production therefore logs FATAL once and leaves readiness red
   (db.healthCheck() → ok:false) instead of persisting JSON. */
let pgLostWarned = false;
setInterval(() => {
  if (db.isPostgres()) return;
  if (db.memoryFallbackAllowed()) { persistStore(); return; }
  if (!pgLostWarned) {
    pgLostWarned = true;
    console.error('[FATAL] PostgreSQL is not active in production — JSON/in-memory persistence stays DISABLED (writes must fail loudly, not fork per instance)');
  }
}, 2000).unref(); /* Wave 1: no periodic JSON persist in PG mode */
process.on('exit', () => {
  try { worker.stop(); } catch (e) {}
  persistStoreSync();
  try{ if(typeof auditLogger.flushSync === 'function') auditLogger.flushSync(); }catch(e){}
});
/* Wave 15: SIGTERM/SIGINT → handleShutdown (drain + close ناهمگام) —
   ثبتِ آن در پایینی فایل است؛ رویدادِ exit فقط کارِ همگام انجام می‌دهد
   (در رویدادِ exit promise‌ها هرگز به‌جا نمی‌رسند). */

/* ── JWT secret (env, or generated once; never committed) ──────────── */
/* P0#2 (چندنمونه‌ای): در production با بک‌اندِ مشترک (Redis/PG) کلیدِ نشست
   باید **مشترک** باشد — اگر env نباشد، هر instance کلیدِ خودش را روی
   دیسکِ محلی تولید می‌کند و توکنِ صادرشده در A در B نامعتبر می‌شود
   (جلساتِ چندنمونه‌ای ساکت می‌شکنند). ⇒ fail-fast در استارت.
   تک‌نمونهٔ production بدون Redis/PG دست‌نخورده می‌ماند (حالتِ پیشین). */
const SHARED_BACKEND_CONFIGURED = !!(process.env.REDIS_URL || process.env.REDIS_CLUSTER_NODES
  || process.env.REDIS_SENTINELS || process.env.DATABASE_URL);
if((process.env.PAYESH_ENV === 'production' || process.env.NODE_ENV === 'production')
   && !process.env.PAYESH_JWT_SECRET && SHARED_BACKEND_CONFIGURED){
  console.error('Error: production with shared state (Redis/PostgreSQL) requires a shared PAYESH_JWT_SECRET — the auto-generated per-instance key makes tokens valid only on the issuing instance (multi-instance sessions break). Set the same PAYESH_JWT_SECRET (>=32 bytes) in every instance.');
  process.exit(1);
}
let JWT_SECRET = process.env.PAYESH_JWT_SECRET || null;
if(!JWT_SECRET){
  if(fs.existsSync(KEY_FILE)) JWT_SECRET = fs.readFileSync(KEY_FILE, 'utf8').trim();
  else{
    JWT_SECRET = crypto.randomBytes(32).toString('hex');
    fs.mkdirSync(path.dirname(KEY_FILE), { recursive: true });
    fs.writeFileSync(KEY_FILE, JWT_SECRET, { mode: 0o600 });
    console.log('generated JWT secret -> ' + KEY_FILE);
  }
}
/* R96 P0-3: کلیدِ HS256 باید حداقل 256 بیت باشد — کلیدِ ضعیف، استارت را
   می‌کُشد تا مجبور به rotation شود (خارج از repository). */
if(Buffer.byteLength(JWT_SECRET, 'utf8') < 32){
  console.error('Error: JWT key shorter than 256 bits — rotate it (set PAYESH_JWT_SECRET or regenerate ' + KEY_FILE + ')');
  process.exit(1);
}
/* R96 P0-3: rotation — کلیدِ قبلی برایِ مدتِ عمرِ نشست‌ها معتبر می‌ماند */
const JWT_PREV_SECRET = (process.env.PAYESH_JWT_SECRET_PREV || '').trim() || null;
/* Delta Phase 4 (gap 3): خاستگاهِ کلیدِ امضا — سلامتِ کرسر همین را
   بازمی‌گوید (env پایدارِ config / keyfile پایدارِ دیسک). */
const JWT_KEY_ORIGIN = process.env.PAYESH_JWT_SECRET ? 'env' : 'keyfile';

/* ── audit log (append-only, sanitized: no phone / nid / password) ───
   R96 P1-8 + Audit Hardening: outside store, 0600 mode, rotation on 1000 events / daily / 10MB */
const AUDIT_MAX_BYTES = 10 * 1024 * 1024;
const auditLogger = createAudit({
  auditFile: AUDIT_FILE,
  auditDir: path.join(path.dirname(AUDIT_FILE), 'audit'),
  maxEvents: parseInt(process.env.PAYESH_AUDIT_MAX_EVENTS || '1000', 10),
  maxBytes: AUDIT_MAX_BYTES
});
const audit = auditLogger.audit;

/* ── Q3 runtime security monitoring ──────────────────────────────────
   The monitor's observations are bounded and fail-safe. Attack detection is
   deliberately separated from enforcement: WAF/authz/rate-limits continue to
   make access decisions, while abuseGuard emits redacted audit/metric/webhook
   signals for operator response. */
let abuseGuard;
const runtimeMonitor = createRuntimeMonitor({
  onAnomaly: (finding) => { try { if (abuseGuard) abuseGuard.reportAnomaly(finding); } catch (_) {} }
});
abuseGuard = createAbuseGuard({ audit, metrics, runtimeMonitor });
const attackDetector = createAttackDetector({
  onDetect: (finding) => { try { abuseGuard.report(finding).catch(() => {}); } catch (_) {} }
});

/* ── shared helpers ────────────────────────────────────────────────── */
function isHttps(req){
  if(req && req.socket && req.socket.encrypted) return true;
  /* S-73-4: X-Forwarded-Proto is a TRUSTED-proxy claim. We honor it only
     when the deployment declares itself behind a TLS proxy
     (PAYESH_HTTPS=1). Direct clients spoofing the header must not be able
     to flip the Secure-cookie / HSTS decisions. */
  if(process.env.PAYESH_HTTPS === '1'){
    const xfp = (req && req.headers['x-forwarded-proto']) || '';
    if(xfp === 'https') return true;
    return true; /* declared proxy mode: the proxy terminates TLS upstream */
  }
  return false;
}
function sendJson(res, status, obj){
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
}
function sendJsonCounting(res, status, obj){
  /* R97 (TODO 2.7): شمارِ رد‌ها (401/403/404) به ازای هر نشست — مرحله‌بندی
     در enumStage. Wave 6: شمارنده روی Redis است (پنجرهٔ ۱۰ دقیقه، TTL) —
     شمارش async و بدونِ مسدودکردنِ پاسخ (فنا = سکوت؛ پنجرهٔ بعدی می‌بیند).
     مسیرهایِ /api/auth/* سقفِ خودشان را دارند. */
  const r = REQ_STATE;
  const isIdorRead = r && /^\/api\/students\/\d+$/.test(r.p || '');
  if(r && r.sess && (status === 401 || status === 403 || status === 404) && !isIdorRead){
    enumTouch(r.sess).then(n => {
      if(n) enumStage(n, r.sess);
      /* ویو ۱۴: همان شمارِ R97 به‌صورت metric. برچسبِ stage از آستانه‌های
         ENUM_* مشتق می‌شود (۵ مقدارِ ممکن) — بدون PII و بدون cardinality بلند. */
      const stage = n >= ENUM_REVOKE ? 'revoke'
        : n >= ENUM_SLOW2 ? 'slow2'
        : n >= ENUM_SLOW1 ? 'slow1'
        : n >= ENUM_WARN ? 'warn' : 'count';
      metrics.observeAuth('rejection', stage);
    }).catch(() => {});
  }
  /* Q3: API modules return stable denial codes. Feed only those codes and the
     already-authenticated session to the signature detector; data/payloads
     remain outside telemetry. */
  try {
    if(r && r.sess && obj && (obj.code === 'out_of_scope' || obj.code === 'school_mismatch')) {
      attackDetector.observeCrossSchool({ sessionId: r.sess.jti });
    }
    if(r && r.sess && obj && ['forged_by', 'user_mismatch', 'school_mismatch', 'ownership_forge'].includes(obj.code)) {
      attackDetector.observeSyncResult({ sessionId: r.sess.jti, code: obj.code });
    }
  }catch(_){}
  return sendJson(res, status, obj);
}
function readBody(req, limit){
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = []; let over = false;
    req.on('data', c => {
      size += c.length;
      if(over) return; /* drain — سوکت زنده بماند تا 413 برسد (R96) */
      if(size > (limit || 1024 * 1024)){ over = true; reject(new Error('too_large')); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      if(over) return;
      if(!chunks.length) return resolve({});
      try{ resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch(e){ reject(new Error('bad_json')); }
    });
    req.on('error', reject);
  });
}

/* ── security headers (contract §5.6.1; CSP nonce per request §5.6.2) */
function securityHeaders(res, nonce, https){
  res.setHeader('Content-Security-Policy',
    "default-src 'self'; script-src 'self' 'nonce-" + nonce + "'; style-src 'self' 'nonce-" + nonce +
    "'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), camera=(), microphone=()');
  if(https) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
}

/* ── compose modules ───────────────────────────────────────────────── */
/* R101: OTP + rate limits live in otp.json (distributed across instances)
   P0-15: وقتی ردیس فعال است، همان کلیدِ مشترکِ ردیس منبع حقیقت می‌شود
   و فایل فقط فال‌بکِ توسعهٔ بدون ردیس است. */
const otp = createOtpStore({ file: OTP_FILE, ttlMs: CODE_TTL_MS, store, markDirty, redis, cache });
const auth = createAuth({ store, db, JWT_SECRET, JWT_PREV_SECRET, SESSION_NAME, SESSION_TTL_S, CODE_TTL_MS, DEMO_CODE_ECHO, audit, isHttps, markDirty, otp });
/* R97: همهٔ ماژول‌هایِ /api با sendJsonCounting می‌چرخند تا رد‌ها شمرده
   شوند؛ auth استثناست (سقفِ OTP سقفِ خودش را می‌سازد). */
/* P0-16: شناسه‌های بدون‌برخورد — دنبالهٔ پستگرس یا مکس+۱ قفل‌دار (پیش از sync: حلقهٔ اعمال از آن استفاده می‌کند) */
const ids = createIds({ db, cache });
const sync = createSync({ store, db, MAX_BATCH, AT_DRIFT_MS, audit, sessionFrom: auth.sessionFrom, sendJson: sendJsonCounting, markDirty, ids, rateLimit: rateLimit.checkRateLimit });
const idor = createIdor({ store, audit, sessionFrom: auth.sessionFrom, sendJson: sendJsonCounting, db });
const bell = createBell({ store, audit, sessionFrom: auth.sessionFrom, sendJson: sendJsonCounting });
const pubrep = createPublicReport({ store, db, sendJson: sendJsonCounting, workers }); /* P1-3: مسیر PG */
/* هر سه ماژول با db می‌چرخند: admin/conflicts (Wave 1 main) + sms (W1p2 تراکنسی) */
const admin = createAdmin({ store, db, audit, sessionFrom: auth.sessionFrom, sendJson: sendJsonCounting, markDirty, dataDir: path.dirname(STORE_FILE), workers });
const healthIdx = createHealthIndex({ store, audit, sessionFrom: auth.sessionFrom, sendJson: sendJsonCounting }); /* G.1 */
const sms = createSms({ store, db, audit, sessionFrom: auth.sessionFrom, sendJson: sendJsonCounting, markDirty });
const conflicts = createConflicts({ store, db, audit, sessionFrom: auth.sessionFrom, sendJson: sendJsonCounting, markDirty });

/* ── Phase 3: RESTful Resource Routes ─────────────────────────────── */
/* P0-17: صندوق برون‌مرزی + سرویس حذف واحد (سنگ‌قبر به‌جای اسپلایسِ خام) */
const outbox = createOutbox({ store, db });
const deleter = createDeleteService({ store, db, markDirty, outbox });
/* ویو ۸ — کارگرِ صندوق رویدادها: کارهای پس از حذف (مثل باطل‌کردن کش)
   از مسیر درخواست بیرون می‌افتد و به‌صورت ناهم‌زمان با تلاشِ مجدد اجرا می‌شود. */
const worker = createWorker({
  store, outbox,
  handlers: {
    '*.deleted': async (evt) => {
      const sid = evt.payload && evt.payload.school_id;
      if (sid != null && typeof cache.invalidateCollection === 'function') {
        await cache.invalidateCollection(evt.collection, sid);
      }
    }
  },
  intervalMs: Number(process.env.PAYESH_WORKER_INTERVAL_MS || 1000),
  maxRetries: Number(process.env.PAYESH_WORKER_MAX_RETRIES || 5)
});
worker.start();
/* F3 (chaos-drill #185): در PG-live، store.outbox پس از restart خالی بوت
   می‌شود و pendingهای جدولِ server_outbox بدون مصرف‌کننده می‌ماندند —
   بازپخشِ یک‌باره در بوت تا worker همان چرخهٔ همیشگی را برود.
   best-effort (خطا فقط لاگ می‌شود؛ بوت را نمی‌شکند). */
dbReady.then(async () => {
  try {
    const rp = await outbox.replayPendingFromPg();
    if (rp && rp.replayed > 0) console.log('[outbox] replayed ' + rp.replayed + ' pending event(s) from server_outbox after restart');
    else if (rp && rp.ok === false) console.warn('[outbox] pending replay failed (will stay best-effort):', rp.error);
  } catch (e) { console.warn('[outbox] pending replay error:', String((e && e.message) || e).slice(0, 140)); }
});
const studentRoutes = createStudentRoutes({ store, db, audit, markDirty, ids, deleter });
const classRoutes = createClassRoutes({ store, db, audit, markDirty, ids, deleter });
const attendanceRoutes = createAttendanceRoutes({ store, db, audit, markDirty, ids, deleter });
const gradeRoutes = createGradeRoutes({ store, db, audit, markDirty, ids, deleter });
const userRoutes = createUserRoutes({ store, db, audit, markDirty, ids, deleter });
const reportsRoutes = createReportsRoutes({ store, db, audit, markDirty, ids, deleter }); /* Wave 23 */
const analyticsRoutes = createAnalyticsRoutes({ store, db, audit, markDirty, ids, deleter }); /* P0-EI-09 */
const semanticAnalyticsRoutes = createSemanticAnalyticsRoutes({ store, db }); /* Phase 9.0 Wiring Gate */
const bootstrapRoute = createBootstrapRoute({ store, db });
const systemRoutes = createSystemRoutes({ store, db }); /* Phase 4 — P1-SC-01 */
/* Root-cause elimination (RAM-as-authority audit): canary weights MUST be
   hydrated from PostgreSQL BEFORE the socket serves traffic — the old
   fire-and-forget `initDb(db).catch(()=>{})` silently served DEFAULT weights
   after a restart until hydration happened to finish (stale routing window).
   The promise is awaited by startListening below; failure is LOUD, not mute. */
const canaryHydrated = db
  ? Promise.resolve(dbReady)
      .then(() => globalCanaryEngine.initDb(db))
      .then(() => {
        /* observable proof the SSoT load ran (silence here hid regressions) */
        console.log('[CANARY] weights hydrated from PostgreSQL (cluster_weights SSoT, ' + globalCanaryEngine.clusters.size + ' clusters)');
      })
      .catch((e) => {
        console.error('[CANARY] PostgreSQL hydration FAILED — serving traffic with persisted-weight UNKNOWN; rerouting decisions may diverge from cluster_weights:', e.message);
        throw e;
      })
  : null;
/* Delta Hardening Phase 2 (gap 2): signed TTL cursor — the resolved JWT key
   (env or key-file) feeds a domain-separated cursor key inside server/cursor.js;
   PAYESH_CURSOR_SECRET overrides it. */
const pullRoute = createPull({ store, db, sessionFrom: auth.sessionFrom, sendJson, cursorSecret: process.env.PAYESH_CURSOR_SECRET || JWT_SECRET });
/* Delta Phase 4 (gap 3): منبعِ کلیدِ کرسر از دیدِ اپراتور — env_cursor
   رازِ صریحِ >=32 بایت است؛ وگرنه همان خاستگاهِ کلیدِ JWT (env/keyfile).
   هر منبعِ فعال بینِ restart پایدار است؛ کلیدِ تصادفیِ per-boot هرگز
   رخ نمی‌دهد (بدونِ کلید، کرسر fail-closed خاموش است). */
const CURSOR_KEY_SOURCE = !pullRoute.cursor.enabled
  ? 'disabled'
  : (Buffer.byteLength(String(process.env.PAYESH_CURSOR_SECRET || ''), 'utf8') >= 32
      ? 'env_cursor'
      : (JWT_KEY_ORIGIN === 'env' ? 'env_jwt' : 'keyfile'));
console.log('  cursor : ' + (pullRoute.cursor.enabled
  ? 'enabled — key=' + CURSOR_KEY_SOURCE + ' (signed cursors survive restarts, ttl=' + pullRoute.cursor.ttlS + 's)'
  : 'DISABLED — set PAYESH_CURSOR_SECRET (>=32 bytes) or provide a JWT key; pull keeps working via legacy since'));

/* ── static ────────────────────────────────────────────────────────── */
const STATIC = {
  '/':              { file: 'index.html',      type: 'text/html; charset=utf-8' },
  '/index.html':    { file: 'index.html',      type: 'text/html; charset=utf-8' },
  '/USER_GUIDE.html': { file: 'USER_GUIDE.html', type: 'text/html; charset=utf-8' },
  '/guide.html':    { file: 'USER_GUIDE.html', type: 'text/html; charset=utf-8' },
  '/account-deletion.html': { file: 'account-deletion.html', type: 'text/html; charset=utf-8' },
  '/account-deletion':    { file: 'account-deletion.html', type: 'text/html; charset=utf-8' },
  /* ملاک گوگل‌پلی: سیاستِ حریم خصوصی باید به‌عنوان صفحهٔ وب هم قابل دسترس باشد (بند 15.3) */
  '/privacy.html': { file: 'privacy.html', type: 'text/html; charset=utf-8' },
  '/privacy':      { file: 'privacy.html', type: 'text/html; charset=utf-8' },
};
async function serveStatic(res, urlPath, nonce){
  const entry = STATIC[urlPath];
  if(!entry) return sendJson(res, 404, { ok: false, code: 'not_found' });
  const fp = path.join(ROOT, entry.file);
  /* Wave 9 — خواندنِ async + کشِ mtime: نه readFileSyncِ سنکرون در هر درخواست */
  let html = await staticCache.read(fp);
  if(html === null) return sendJson(res, 500, { ok: false, code: 'missing_build' });
  /* per-request CSP nonce (contract §5.6.2) — build.js placeholder */
  if(nonce) html = html.split('__PAYESH_NONCE__').join(nonce);
  res.writeHead(200, { 'Content-Type': entry.type, 'Cache-Control': 'no-cache' });
  res.end(html);
}

/* ── Phase 5 (P2-NI-05): اینگرس کنترل ظرفیت ملی (Fail-Closed) ──────── */
let rollingWindowSec = Math.floor(Date.now() / 1000);
let rollingWindowRps = 0;
let rollingWindowWrites = 0;

function nationalCapacityGateMiddleware(req, res) {
  const currentSec = Math.floor(Date.now() / 1000);
  if (currentSec !== rollingWindowSec) {
    rollingWindowSec = currentSec;
    rollingWindowRps = 0;
    rollingWindowWrites = 0;
  }
  rollingWindowRps++;
  const isWrite = req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH' || req.method === 'DELETE';
  if (isWrite) rollingWindowWrites++;

  const simRps = Number(req.headers['x-simulated-rps'] || 0);
  const simConcurrent = Number(req.headers['x-simulated-concurrent-users'] || 0);
  const simWrites = Number(req.headers['x-simulated-writes'] || 0);
  const simDbConns = Number(req.headers['x-simulated-db-connections'] || 0);

  const observedMetrics = {
    rps: simRps > 0 ? simRps : rollingWindowRps,
    concurrent_users: simConcurrent > 0 ? simConcurrent : (typeof inFlight === 'number' ? inFlight : 0),
    write_tps: simWrites > 0 ? simWrites : (isWrite ? rollingWindowWrites : 0),
    db_connections: simDbConns > 0 ? simDbConns : 0
  };

  try {
    assertNationalCapacityEnforcement(observedMetrics);
    return true;
  } catch (err) {
    res.setHeader('Retry-After', '1');
    sendJson(res, 429, {
      ok: false,
      code: err.code || 'PHASE5_NATIONAL_CAPACITY_LIMIT_BREACH',
      error: 'National capacity limit breached (Fail-Closed)',
      metric: err.metric,
      limit: err.limit,
      observed: err.observed
    });
    return false;
  }
}

/* ── router ────────────────────────────────────────────────────────── */
const onRequest = async (req, res) => {
  /* S7-1 (Bug Hunt session 7): a malformed request-target (e.g. `//[`, `///`,
     `//@`) made `new URL(req.url, …)` throw at the very top of this async
     handler — outside every try/catch and with no rejection handler on the
     caller — so one raw request line killed the process (unauthenticated DoS).
     Parse defensively: bad target = plain 400, never a throw. */
  let url;
  try{ url = new URL(req.url, 'http://localhost'); }
  catch(e){ return sendJson(res, 400, { ok: false, code: 'bad_request' }); }
  const p = url.pathname;
  const https = isHttps(req);
  const nonce = crypto.randomBytes(16).toString('base64');
  securityHeaders(res, nonce, https);

  // Phase 6.5: Canary middleware — HTTP → decision (PG SoT) → X-Canary-* headers
  let canaryRoute = null;
  try {
    canaryRoute = await applyCanaryRouting(req, res, globalCanaryEngine);
  } catch (err) {
    if (err.code === 'PHASE6_CIRCUIT_OPEN' || err.code === 'PHASE6_FAIL_CLOSED_NO_HEALTHY_ROUTE') {
      return sendJson(res, 503, {
        ok: false,
        code: err.code,
        message: 'کلاستر منطقه‌ای در دسترس نیست و به صورت امن قطع شد (Fail-Closed)'
      });
    }
  }

  /* ویو ۱۴ (Observability) — شمارشِ هر درخواست: شمار/تأخیر/بایت با برچسبِ
     «قالبِ مسیر» (نه خودِ URL) تا هم cardinality کران‌دار بماند و هم هیچ
     شناسه/PII وارد label نشود (metrics.js R3). هیچ‌گاه در مسیرِ پاسخ خطا
     نمی‌دهد (R1). */
  const __mStart = process.hrtime.bigint();
  let __mBytes = 0;
  const __mEnd = res.end;
  res.end = function(chunk, enc, cb){
    try{
      if(chunk) __mBytes += Buffer.isBuffer(chunk) ? chunk.length
        : Buffer.byteLength(String(chunk), typeof enc === 'string' ? enc : 'utf8');
    }catch(e){}
    return __mEnd.call(this, chunk, enc, cb);
  };
  res.on('finish', () => {
    metrics.observeHttpRequest({
      route: p,
      method: req.method,
      status: res.statusCode,
      durationSeconds: metrics.elapsedSeconds(__mStart),
      bytes: __mBytes
    });
    /* Q3: record only closed-set role/signal values. The monitor hashes its
       session/tenant inputs internally and never exports raw request data. */
    try {
      const rt = (req.context && req.context.runtime) || {};
      runtimeMonitor.recordRequest({
        role: rt.role || 'anonymous', status: res.statusCode, responseBytes: __mBytes,
        sessionId: rt.sessionId, tenantId: rt.tenantId, syncOps: rt.syncOps
      });
      attackDetector.observeRequest({
        sessionId: rt.sessionId, source: clientIp(req), path: p, status: res.statusCode,
        wafBlocked: !!(req.context && req.context.waf && req.context.waf.blocked)
      });
      if (req.context && req.context.waf && req.context.waf.blocked) {
        attackDetector.observeWafBlock({ sessionId: rt.sessionId, source: clientIp(req), blocked: true });
      }
      // Phase 6: ضبط تله‌متری تاخیر و خطای بلادرنگ کلاستر
      if (canaryRoute && canaryRoute.clusterId) {
        const elapsedNs = process.hrtime.bigint() - __mStart;
        const elapsedMs = Number(elapsedNs) / 1e6;
        globalCanaryEngine.recordTelemetry(canaryRoute.clusterId, {
          latencyMs: elapsedMs,
          errorOccurred: res.statusCode >= 500
        });
      }
    } catch (_) {}
  });
  /* Tracing (P-Trace): شناسهٔ ردیابی در کانتکست و سرآیندِ پاسخ برای هم‌بستگی —
     پیش از WAF تا رویدادهای ممیزیِ آن شناسهٔ ردیابی داشته باشند. */
  req.context = req.context || {};
  try{
    const __tid = tracing.getTraceId();
    if(__tid){ req.context.trace_id = __tid; res.setHeader('X-Trace-Id', __tid); }
  }catch(e){}
  /* WAF (P-WAF): حالتِ report (پیش‌فرض — فقط-تشخیص) یا enforce (P0 #6:
     PAYESH_WAF_MODE=enforce ⇒ verdict = 403 waf_blocked با fail-safe allowlist) */
  try{ await waf.wafMiddleware(req, res); }catch(e){}
  /* P0 #6: اگر WAF (enforce) درخواست را مسدود کرده باشد (403 فرستاده)، روتینگ ادامه نمی‌یابد */
  if(res.writableEnded) return;
  /* Q3 red-team / CSRF: an explicit browser Origin or Referer on every
     unsafe API request must agree with this exact host+scheme. This runs
     before the body is read and before route dispatch, so a cross-origin
     form/fetch cannot invoke logout, sync, delete, or any REST write. */
  const csrfDecision = csrf.checkCsrfOrigin(req, isHttps);
  if(!csrfDecision.ok){
    audit('csrf_denied', { path: p, reason: csrfDecision.code, ip: clientIp(req) });
    return sendJson(res, 403, { ok: false, code: csrfDecision.code });
  }
  /* R97 — نگهبانِ شمردنِ شناسه: شمارِ رد‌ها (404/403/401) و شمارِ همهٔ
     خوانش‌هایِ /api/students/:id (مسطحِ شمردنِ شناسهٔ §5.7) به ازای هر
     نشست؛ از SLOW1 به بعد تأخیر، در REVOKE ابطال (sendJsonCounting). */
  REQ_STATE.sess = null;
  REQ_STATE.p = p;
  if(p.indexOf('/api/') === 0 && p.indexOf('/api/auth/') !== 0){
    const gs = await auth.sessionFrom(req);
    if(gs){
      REQ_STATE.sess = gs;
      req.context.runtime = {
        role: gs.role,
        sessionId: gs.jti,
        /* A supplied school selector is an untrusted telemetry signal only;
           authorization still derives scope from the authenticated session. */
        tenantId: url.searchParams.get('school_id') || gs.school_id || null,
        syncOps: 0
      };
      let enumN = 0;
      if(/^\/api\/students\/\d+$/.test(p)){
        enumN = await enumTouch(gs); /* §5.7: هر خوانشِ این مسیر می‌شمارد (Wave 6: ردیس) */
        if(enumN) enumStage(enumN, gs);
      } else {
        enumN = await enumRead(gs);
      }
      const dm = enumDelayMs(enumN);
      if(dm) await new Promise(r => setTimeout(r, dm));
    }
  }
  try{
    /* ویو ۱۴ — Prometheus scrape. Fail-closed (metrics.js R4):
         PAYESH_METRICS=0                → 404
         production و بدون توکن          → 404 (endpoint اصولاً وجود ندارد)
         PAYESH_METRICS_TOKEN            → Bearer token (مقایسهٔ زمان‌ثابت)
         توسعه و بدون توکن               → فقط loopback
       /metrics هرگز زیر /api/ نیست و هرگز در فهرستِ static نمی‌آید. */
    if(p === '/metrics' && (req.method === 'GET' || req.method === 'HEAD')){
      const g = metrics.scrapeGate(req);
      if(!g.ok){
        audit('metrics_denied', { path: p, status: g.status, reason: g.code, ip: clientIp(req) });
        return sendJson(res, g.status, { ok: false, code: g.code });
      }
      /* گاژهایِ تازه پیش از render: poolها + صفِ outbox (تنها در زمانِ scrape
         خوانده می‌شوند تا هر درخواست هزینهٔ I/O ندهد). */
      try{
        if(db.isPostgres && db.isPostgres() && typeof db.poolStats === 'function') metrics.publishDbPools(db.poolStats());
      }catch(e){}
      try{
        if(typeof outbox.depth === 'function') metrics.publishOutboxDepth(outbox.depth());
      }catch(e){}
      /* Runtime health gauges must also refresh on the Prometheus scrape path;
         `/api/health` is operator-facing, not the collector's source. */
      try {
        const runtimeSecurity = runtimeMonitor.snapshot();
        metrics.set('payesh_suspicious_sessions', [], runtimeSecurity.suspicious_sessions);
        metrics.set('payesh_attack_patterns_blocked', [], runtimeSecurity.attack_patterns_blocked);
      } catch (_) {}
      try {
        await metrics.publishRuntimeProbes();
      } catch (_) {}
      const body = metrics.render();
      res.writeHead(200, {
        'Content-Type': 'text/plain; version=0.0.4; charset=utf-8',
        'Cache-Control': 'no-store'
      });
      return res.end(req.method === 'HEAD' ? undefined : body);
    }
    if(p === '/api/liveness' && (req.method === 'GET' || req.method === 'HEAD')){
      /* Wave 15: liveness = فرایند زنده است و event-loop پاسخ می‌دهد.
         عمداً هیچ وابستگی (DB/Redis) چک نمی‌کند — خرابیِ وابستگی نباید
         ارکستراتور را وادار به restart کند (طوفانِ ری‌استارت)؛ برایِ آن
         readiness هست. حتی در حالِ drain همیشه 200. */
      return sendJson(res, 200, { ok: true, status: 'live', name: 'payesh-server', pid: process.pid, uptime_s: Math.round(process.uptime()), draining });
    }
    if(p === '/api/readiness' && (req.method === 'GET' || req.method === 'HEAD')){
      /* Wave 15: readiness = آیا می‌توانم ترافیک بپذیرم؟
         - DB: store در استارت لود شده (وگرنه فرایند اصلاً بالا نمی‌آمد) +
           pingِ موتور (memory همیشه ok؛ postgres = SELECT 1).
         - Redis: در تولید (PAYESH_ENV=production یا NODE_ENV=production)
           ردیسِ زنده لازم است (P0-13)؛ در توسعه فال‌بکِ حافظه قابل‌قبول است.
           ⇒ PAYESH_ENV=production + قطعِ ردیس = 503 (سپکِ Wave 15).
         - draining: بلافاصله پس از SIGTERM ⇒ 503 تا LB ترافیکِ تازه نفرستد. */
      const prod = process.env.PAYESH_ENV === 'production' || process.env.NODE_ENV === 'production';
      let dbp = { ok: true, driver: 'memory', alive: true };
      try { dbp = await db.ping(); } catch (e) { dbp = { ok: false, driver: 'memory', alive: false, error: String(e.message || e).slice(0, 120) }; }
      let rdp = { ok: true, driver: 'memory', alive: true };
      try { rdp = await redis.ping(); } catch (e) { rdp = { ok: false, driver: 'memory', alive: false, error: String(e.message || e).slice(0, 120) }; }
      const dbOk = !!(dbp && dbp.ok);
      const redisOk = !!(rdp && rdp.ok);
      const redisLive = redis.isRedis();
      const ready = !draining && dbOk && redisOk && (!prod || redisLive);
      return sendJson(res, ready ? 200 : 503, {
        ok: ready, status: ready ? 'ready' : 'not_ready', name: 'payesh-server',
        db: { driver: dbp.driver, alive: dbOk },
        redis: { driver: rdp.driver, alive: redisOk, live: redisLive, required: prod },
        draining, time: new Date().toISOString()
      });
    }
    if(p === '/api/health' && (req.method === 'GET' || req.method === 'HEAD')){
      /* P0-13: ریدی = در تولید، کشِ توزیع‌شده زنده است؛ وگرنه 503.
         Wave 15: کدِ وضعیت روی همان درگاهِ P0-13 می‌ماند (قراردادِ
         server13/S1 — تغییر نمی‌کند) و بدنه گسترش یافت: گزارشِ کاملِ
         db/redis/queue + آمارِ pool و حافظه. */
      const rdy = redis.ready();
      let dbp = { ok: false, driver: 'unknown', alive: false };
      try { dbp = await db.ping(); } catch (e) { dbp = { ok: false, driver: 'unknown', alive: false, error: String(e.message || e).slice(0, 120) }; }
      let rdp = { ok: false, driver: 'unknown', alive: false };
      try { rdp = await redis.ping(); } catch (e) {}
      const pool = db.getPool();
      const dbAlive = !!(dbp && dbp.ok);
      const workerHealthy = typeof worker.isHealthy === 'function' ? worker.isHealthy() : true;
      const isHealthy = rdy && dbAlive && workerHealthy;
      /* Q3: health exposes bounded integer counters only; no session, tenant,
         actor, URL, or payload data leaves the runtime monitor. */
      const runtimeSecurity = runtimeMonitor.snapshot();
      try {
        metrics.set('payesh_suspicious_sessions', [], runtimeSecurity.suspicious_sessions);
        metrics.set('payesh_attack_patterns_blocked', [], runtimeSecurity.attack_patterns_blocked);
      } catch (_) {}
      const body = {
        ok: isHealthy, name: 'payesh-server', phase: 1, time: new Date().toISOString(), version: '1.0', pid: process.pid,
        anomalies_detected_24h: runtimeSecurity.anomalies_detected_24h,
        suspicious_sessions: runtimeSecurity.suspicious_sessions,
        attack_patterns_blocked: runtimeSecurity.attack_patterns_blocked,
        worker: typeof worker.health === 'function' ? worker.health() : { healthy: true },
        cache: redis.isRedis() ? 'redis' : (rdy ? 'memory-dev' : 'unavailable'),
        db: { driver: dbp.driver, alive: !!(dbp && dbp.ok), pool: pool ? { total: pool.totalCount, idle: pool.idleCount, pending: pool.pendingCount } : null },
        redis: { driver: rdp.driver, alive: !!(rdp && rdp.ok) },
        queue: { outbox: (store.outbox || []).length, notify_pending: (store.notify_queue || []).filter(q => q.status === 'pending').length, in_flight: inFlight },
        cache_l1: cache.stats().l1,
        uptime_s: Math.round(process.uptime()),
        memory: { heap_used_kb: Math.round(process.memoryUsage().heapUsed / 1024) },
        /* Delta Phase 4 (gap 3): warmupِ کرسر — کلیدِ امضا بینِ restart
           پایدار است یا نه. persistent=true یعنی کرسرِ صادرشدهٔ نسخهٔ
           پیشینِ فرآیند بعد از restart هم هنوز verify می‌شود (تا TTL). */
        cursor: { enabled: pullRoute.cursor.enabled, persistent: pullRoute.cursor.enabled, key_source: CURSOR_KEY_SOURCE },
        /* Delta Phase 4 (gap 4): پالسِ sync در سلامت — pull/push/conflict/
           backpressure/کرسر + میانگینِ حجمِ دلتا (خام و سیم). */
        sync: metrics.syncHealthStats(metrics.snapshot())
      };
      /* Wave 10 — pool observability (primary + optional read replica) when PG live */
      try { if (db.isPostgres && db.isPostgres() && typeof db.poolStats === 'function') body.db_pools = db.poolStats(); }
      catch (e) {}
      return sendJson(res, isHealthy ? 200 : 503, body);
    }
    /* Wave 15: hookِ فقط-تست (env-gated، پیش‌فرض خاموش) — مسیرِ آهسته برای
       اثباتِ قطعیِ drain در Graceful Shutdown (tests/wave15-health.js). */
    if(p === '/api/__slow' && req.method === 'GET' && process.env.PAYESH_TEST_SLOW_MS){
      const ms = Math.min(30000, Math.max(1, Number(process.env.PAYESH_TEST_SLOW_MS) || 1));
      await new Promise(r => setTimeout(r, ms));
      return sendJson(res, 200, { ok: true, slow_ms: ms });
    }
    /* ویو ۱۴ — سوءاستفادهٔ OTP/ورود به‌صورت metric (برچسبِ outcome از
       مجموعهٔ بستهٔ کدهایِ HTTP مشتق می‌شود؛ شماره/کد ملی هرگز label نیست). */
    if(p === '/api/auth/send-code' && req.method === 'POST'){
      const b = await readBody(req, 4 * 1024);
      const r = await auth.apiSendCode(req, res, b);
      metrics.observeAuth('otp', res.statusCode === 200 ? 'sent' : res.statusCode === 429 ? 'rate_limited' : 'rejected');
      return r;
    }
    if(p === '/api/auth/login'     && req.method === 'POST'){
      const b = await readBody(req, 4 * 1024);
      const r = await auth.apiLogin(req, res, b);
      metrics.observeAuth('login', res.statusCode === 200 ? 'ok' : res.statusCode === 429 ? 'rate_limited' : res.statusCode === 401 ? 'failed' : 'rejected');
      /* Q3: detector hashes source/subject internally; neither phone nor IP is
         emitted to logs, metrics, webhooks, or health. */
      if(res.statusCode === 401) {
        try { attackDetector.observeLoginFailure({ source: clientIp(req), subject: b && b.phone }); } catch (_) {}
      }
      return r;
    }
    if(p === '/api/auth/me'        && req.method === 'GET')  return await auth.apiMe(req, res);
    if(p === '/api/auth/logout'    && req.method === 'POST') return await auth.apiLogout(req, res);
    if(p === '/api/auth/delete-account' && req.method === 'POST') return await auth.apiDeleteAccount(req, res);
    if(p === '/api/sync'           && req.method === 'POST'){
      if(!nationalCapacityGateMiddleware(req, res)) return;
      const b = await readBody(req, 1024 * 1024);
      /* Q3: sync op count / claimed tenant are monitoring inputs only. The
         sync authorization gate still independently validates every stamp. */
      if(req.context && req.context.runtime) {
        req.context.runtime.syncOps = b && Array.isArray(b.ops) ? b.ops.length : 0;
        const claimed = b && Array.isArray(b.ops) && b.ops.find(op => op && op.school_id != null);
        if(claimed) req.context.runtime.tenantId = claimed.school_id;
      }
      /* ویو ۱۴: اندازهٔ دستهٔ جهش‌ها = عمقِ صفِ آفلاینِ کلاینت در لحظهٔ drain. */
      metrics.observeSyncBatch(b && Array.isArray(b.ops) ? b.ops.length : 0);
      const r = await sync.apiSync(req, res, b);
      metrics.inc('payesh_sync_requests_total', { code: String(res.statusCode).slice(0, 3) });
      return r;
    }
    if(p === '/api/sync/conflicts' && req.method === 'GET')  return await conflicts.apiList(req, res);
    if(p === '/api/sync/resolve-conflict' && req.method === 'POST') return await conflicts.apiResolve(req, res, await readBody(req, 4 * 1024));
    if(/^\/api\/students\/\d+$/.test(p) && req.method === 'GET') return await idor.apiStudent(req, res, p.split('/')[3]);
    if(p === '/api/bell/now' && req.method === 'GET') return await bell.apiBellNow(req, res);
    if(p === '/api/public-report' && req.method === 'GET') return await pubrep.apiPublicReport(req, res);
    if(p === '/api/admin/backup'  && req.method === 'POST') return await admin.apiBackup(req, res);
    /* restore فقط {file} می‌گیرد (نامِ حداکثر ۱۲۸ نویسه) — سقفِ 64MBِ پیشین
       بی‌دلیل بود؛ حالا 4KB مثلِ بقیهٔ بدنه‌هایِ کوچک (413 برایِ بیشتر). */
    if(p === '/api/admin/restore' && req.method === 'POST') return await admin.apiRestore(req, res, await readBody(req, 4 * 1024));
    if(p === '/api/sms/send' && req.method === 'POST') return await sms.apiSend(req, res, await readBody(req, 32 * 1024));
    if(p === '/api/health-index' && req.method === 'GET') return await healthIdx.apiHealthIndex(req, res, url.searchParams); /* G.1 */

    // Phase 6: Direct API Aliases (/api/system/canary/*)
    if(p === '/api/system/canary/status' && req.method === 'GET') {
      const s = await auth.sessionFrom(req);
      if(!s) return sendJson(res, 401, { ok: false, code: 'unauthorized', message: 'احراز هویت الزامی است' });
      req.user = s;
      const r = await systemRoutes.phase6CanaryStatus(req, url.searchParams);
      return sendJson(res, r.status, r.body);
    }
    if((p === '/api/system/canary/promote' || p === '/api/system/canary/weight') && req.method === 'POST') {
      const s = await auth.sessionFrom(req);
      if(!s) return sendJson(res, 401, { ok: false, code: 'unauthorized', message: 'احراز هویت الزامی است' });
      req.user = s;
      const body = await readBody(req, 64 * 1024);
      const r = await systemRoutes.phase6CanaryPromote(req, body);
      return sendJson(res, r.status, r.body);
    }
    if(p === '/api/system/canary/rollback' && req.method === 'POST') {
      const s = await auth.sessionFrom(req);
      if(!s) return sendJson(res, 401, { ok: false, code: 'unauthorized', message: 'احراز هویت الزامی است' });
      req.user = s;
      const body = await readBody(req, 64 * 1024);
      const r = await systemRoutes.phase6CanaryRollback(req, body);
      return sendJson(res, r.status, r.body);
    }
    if(p === '/api/system/canary/circuit-breaker' && req.method === 'POST') {
      const s = await auth.sessionFrom(req);
      if(!s) return sendJson(res, 401, { ok: false, code: 'unauthorized', message: 'احراز هویت الزامی است' });
      req.user = s;
      const body = await readBody(req, 64 * 1024);
      const r = await systemRoutes.phase6CanaryCircuitBreaker(req, body);
      return sendJson(res, r.status, r.body);
    }

    /* ── Phase 3: RESTful Resource Endpoints (/api/v1/*) ────────── */
    if(p.indexOf('/api/v1/') === 0){
      const s = await auth.sessionFrom(req);
      if(!s) return sendJson(res, 401, { ok: false, code: 'unauthorized', message: 'احراز هویت الزامی است' });
      req.user = s;
      req.session = s;

      // Phase 6 (B8): Zero-Trust Tenant & Provincial Isolation Guardrail
      const targetSchool = url.searchParams.get('school_id') || req.headers['x-school-id'];
      const targetProv = req.headers['x-province-code'];
      if (s.role !== 'superadmin' || targetSchool || targetProv) {
        try {
          /* P1: استانِ عامل از یک منبعِ واحد حل می‌شود (resolveActorProvince:
             session.province_code → province_id → school → office). پیش از این
             یک پیش‌فرضِ جادوییِ '۰۷' به‌کار می‌رفت که با هیچ استانِ واقعی
             تطابق نداشت، استان‌های ۱ و ۲ را یکی می‌کرد، و edu_office را که
             school_id ندارد کلاً از /api/v1 محروم می‌ساخت.
             اکنون: اگر استانِ عامل قابلِ تعیین نیست، fail-closed می‌بندیم
             (هیچ استانِ پیش‌فرضی فرض نمی‌شود). */
          const actorProv = resolveActorProvince(s, store);
          const effSchool = targetSchool || s.school_id;
          const effProv = targetProv || actorProv;
          if (!effProv) {
            const err = new Error('PHASE6_UNRESOLVED_PROVINCE: استان عامل قابل تعیین نیست؛ دسترسی مسدود شد');
            err.code = 'PHASE6_TENANT_ISOLATION_BREACH';
            throw err;
          }
          const actorWithProv = Object.assign({}, s, { province_code: actorProv });
          await assertTenantBoundary(actorWithProv, effSchool, effProv);
        } catch (err) {
          return sendJson(res, err.status === 503 ? 503 : 403, {
            ok: false,
            code: err.code || 'PHASE6_TENANT_ISOLATION_BREACH',
            message: err.message
          });
        }
      }

      // /api/v1/bootstrap
      if(p === '/api/v1/bootstrap' && req.method === 'GET'){
        const r = await bootstrapRoute.getBootstrapData(req);
        return sendJson(res, r.status, r.body);
      }

      // /api/v1/pull (A01: General Pull & Delta Sync)
      if(p === '/api/v1/pull' && req.method === 'GET'){
        return await pullRoute.apiPull(req, res);
      }

      // /api/v1/reports/* (Wave 23 — گزارش‌های استاندارد وزارتی، فقط‌خواندنی)
      if(p === '/api/v1/reports/attendance' && req.method === 'GET'){
        const r = await reportsRoutes.attendanceReport(req, url.searchParams);
        return sendJson(res, r.status, r.body);
      }
      if(p === '/api/v1/reports/academic' && req.method === 'GET'){
        const r = await reportsRoutes.academicReport(req, url.searchParams);
        return sendJson(res, r.status, r.body);
      }
      if(p === '/api/v1/reports/finance' && req.method === 'GET'){
        const r = await reportsRoutes.financeReport(req, url.searchParams);
        return sendJson(res, r.status, r.body);
      }
      if(p === '/api/v1/reports/teachers' && req.method === 'GET'){
        const r = await reportsRoutes.teachersReport(req, url.searchParams);
        return sendJson(res, r.status, r.body);
      }

      // /api/v1/analytics/school-intelligence (P0-EI-09: مرکز هوشمندی و فرماندهی مدرسه)
      if(p === '/api/v1/analytics/school-intelligence' && req.method === 'GET'){
        const r = await analyticsRoutes.schoolIntelligenceReport(req, url.searchParams);
        return sendJson(res, r.status, r.body);
      }

      // /api/v1/analytics/regional-intelligence (P0-EI-10: شبکه بینش و اقدام منطقه‌ای)
      if(p === '/api/v1/analytics/regional-intelligence' && req.method === 'GET'){
        const r = await analyticsRoutes.regionalIntelligenceReport(req, url.searchParams);
        return sendJson(res, r.status, r.body);
      }

      // /api/v1/analytics/quality-governance (P0-EI-11: راهبری کیفیت آموزشی و چرخه بهبود مستمر)
      if(p === '/api/v1/analytics/quality-governance' && req.method === 'GET'){
        const r = await analyticsRoutes.qualityGovernanceReport(req, url.searchParams);
        return sendJson(res, r.status, r.body);
      }

      // /api/v1/analytics/longitudinal-intelligence (P0-EI-12: پایش طولی هوشمندی آموزشی و کشف روندها)
      if(p === '/api/v1/analytics/longitudinal-intelligence' && req.method === 'GET'){
        const r = await analyticsRoutes.longitudinalIntelligenceReport(req, url.searchParams);
        return sendJson(res, r.status, r.body);
      }

      // /api/v1/analytics/action-recommendations (P0-EI-13: موتور پیشنهاددهنده و برنامه‌ریزی اقدام آموزشی)
      if(p === '/api/v1/analytics/action-recommendations' && req.method === 'GET'){
        const r = await analyticsRoutes.actionRecommendationsReport(req, url.searchParams);
        return sendJson(res, r.status, r.body);
      }

      // /api/v1/analytics/feedback-learning-memory (P0-EI-14: موتور حلقه بازخورد و حافظه یادگیری سازمانی)
      if(p === '/api/v1/analytics/feedback-learning-memory' && req.method === 'GET'){
        const r = await analyticsRoutes.feedbackLearningMemoryReport(req, url.searchParams);
        return sendJson(res, r.status, r.body);
      }

      // /api/v1/analytics/intelligence-governance (P0-EI-15: مرکز حاکمیت و شفافیت هوشمندی آموزشی)
      if(p === '/api/v1/analytics/intelligence-governance' && req.method === 'GET'){
        const r = await analyticsRoutes.intelligenceGovernanceReport(req, url.searchParams);
        return sendJson(res, r.status, r.body);
      }

      // /api/v1/analytics/policy-simulation (P0-EI-16: لایه فرماندهی و شبیه‌سازی خط‌مشی‌های آموزشی)
      if(p === '/api/v1/analytics/policy-simulation' && req.method === 'GET'){
        const r = await analyticsRoutes.policySimulationReport(req, url.searchParams);
        return sendJson(res, r.status, r.body);
      }

      // /api/v1/analytics/decision-command (P0-EI-17: لایه هوش تصمیم و ارکستراسیون فرمان آموزشی)
      if(p === '/api/v1/analytics/decision-command' && req.method === 'GET'){
        const r = await analyticsRoutes.decisionCommandReport(req, url.searchParams);
        return sendJson(res, r.status, r.body);
      }

      // /api/v1/analytics/operational-execution (P0-EI-18: لایه اجرای عملیاتی هوشمندی آموزشی)
      if(p === '/api/v1/analytics/operational-execution' && req.method === 'GET'){
        const r = await analyticsRoutes.operationalExecutionReport(req, url.searchParams);
        return sendJson(res, r.status, r.body);
      }

      // /api/v1/analytics/outcome-evaluation (P0-EI-19: لایه ارزیابی پیامد و بهینه‌سازی مستمر)
      if(p === '/api/v1/analytics/outcome-evaluation' && req.method === 'GET'){
        const r = await analyticsRoutes.outcomeEvaluationReport(req, url.searchParams);
        return sendJson(res, r.status, r.body);
      }

      // /api/v1/analytics/intelligence-platform (P0-EI-20: لایه یکپارچه‌سازی پلتفرم هوشمندی آموزشی)
      if(p === '/api/v1/analytics/intelligence-platform' && req.method === 'GET'){
        const r = await analyticsRoutes.intelligencePlatformReport(req, url.searchParams);
        return sendJson(res, r.status, r.body);
      }

      // /api/v1/analytics/intelligence-certification (P0-EI-21: گیت انتشار و صدور گواهی نهایی فاز ۳)
      if(p === '/api/v1/analytics/intelligence-certification' && req.method === 'GET'){
        const r = await analyticsRoutes.intelligenceCertificationReport(req, url.searchParams);
        return sendJson(res, r.status, r.body);
      }

      // ── Phase 9.0 Wiring Gate (F-EI-01): اتصال هشت موتور آموزشی که پیش‌تر
      //    کد داشتند اما هیچ مسیر رانتایمی به آن‌ها نبود. ──────────────────
      if(p === '/api/v1/analytics/semantic-metrics' && req.method === 'GET'){
        const r = await semanticAnalyticsRoutes.semanticReport(req, url.searchParams);
        return sendJson(res, r.status, r.body);
      }
      if(p === '/api/v1/analytics/assessment-quality' && req.method === 'GET'){
        const r = await semanticAnalyticsRoutes.assessmentQualityReport(req, url.searchParams);
        return sendJson(res, r.status, r.body);
      }
      if(p === '/api/v1/analytics/attendance-risk' && req.method === 'GET'){
        const r = await semanticAnalyticsRoutes.attendanceRiskReport(req, url.searchParams);
        return sendJson(res, r.status, r.body);
      }
      if(p === '/api/v1/analytics/student-timeline' && req.method === 'GET'){
        const r = await semanticAnalyticsRoutes.studentTimelineReport(req, url.searchParams);
        return sendJson(res, r.status, r.body);
      }
      if(p === '/api/v1/analytics/intervention-warnings' && req.method === 'GET'){
        const r = await semanticAnalyticsRoutes.interventionWarningsReport(req, url.searchParams);
        return sendJson(res, r.status, r.body);
      }
      if(p === '/api/v1/analytics/school-health-dashboard' && req.method === 'GET'){
        const r = await semanticAnalyticsRoutes.schoolHealthReport(req, url.searchParams);
        return sendJson(res, r.status, r.body);
      }
      if(p === '/api/v1/analytics/parent-360' && req.method === 'GET'){
        const r = await semanticAnalyticsRoutes.parent360Report(req, url.searchParams);
        return sendJson(res, r.status, r.body);
      }
      if(p === '/api/v1/analytics/teacher-evidence' && req.method === 'GET'){
        const r = await semanticAnalyticsRoutes.teacherEvidenceReport(req, url.searchParams);
        return sendJson(res, r.status, r.body);
      }

      // /api/v1/system/scalability-health (Phase 4 — P1-SC-01: رصد سلامت زیرساخت مقیاس‌پذیری و کش توزیع‌شده)
      if(p === '/api/v1/system/scalability-health' && req.method === 'GET'){
        const r = await systemRoutes.scalabilityHealthReport(req, url.searchParams);
        return sendJson(res, r.status, r.body);
      }

      // /api/v1/system/event-processing-health (Phase 4 — P1-SC-02: رصد سلامت صف رویدادها و مدیریت بار)
      if(p === '/api/v1/system/event-processing-health' && req.method === 'GET'){
        const r = await systemRoutes.eventProcessingHealthReport(req, url.searchParams);
        return sendJson(res, r.status, r.body);
      }

      // /api/v1/system/observability-health (Phase 4 — P1-SC-03: رصدپذیری بلادرنگ و سلامت تولید)
      if(p === '/api/v1/system/observability-health' && req.method === 'GET'){
        const r = await systemRoutes.observabilityHealthReport(req, url.searchParams);
        return sendJson(res, r.status, r.body);
      }

      // /api/v1/system/disaster-recovery-health (Phase 4 — P1-SC-04: پایداری، پشتیبان‌گیری و بازیابی بحران)
      if(p === '/api/v1/system/disaster-recovery-health' && req.method === 'GET'){
        const r = await systemRoutes.disasterRecoveryHealthReport(req, url.searchParams);
        return sendJson(res, r.status, r.body);
      }

      // /api/v1/system/pilot-deployment-health (Phase 4 — P1-SC-05: استقرار پایلوت و مدیریت ترافیک)
      if(p === '/api/v1/system/pilot-deployment-health' && req.method === 'GET'){
        const r = await systemRoutes.pilotDeploymentHealthReport(req, url.searchParams);
        return sendJson(res, r.status, r.body);
      }

      // /api/v1/system/security-health (Phase 4 — P1-SC-06: لایه امنیت Zero Trust و انطباق زمان اجرا)
      if(p === '/api/v1/system/security-health' && req.method === 'GET'){
        const r = await systemRoutes.securityHealthReport(req, url.searchParams);
        return sendJson(res, r.status, r.body);
      }

      // /api/v1/system/phase4-certification (Phase 4 — P1-SC-07: گیت انتشار جامع و صدور گواهی مقیاس‌پذیری و پایداری فاز ۴)
      if((p === '/api/v1/system/phase4-certification' || p === '/api/v1/system/scalability-certification') && req.method === 'GET'){
        const r = await systemRoutes.phase4CertificationReport(req, url.searchParams);
        return sendJson(res, r.status, r.body);
      }

      // /api/v1/system/phase5/regions (Phase 5 — P2-PL-01: فهرست کلاسترهای چندمنطقه‌ای)
      if(p === '/api/v1/system/phase5/regions' && req.method === 'GET'){
        const r = await systemRoutes.phase5Regions(req, url.searchParams);
        return sendJson(res, r.status, r.body);
      }

      // /api/v1/system/phase5/federation-health (Phase 5 — P2-PL-01: رصد سلامت فدراسیون کلاسترها)
      if(p === '/api/v1/system/phase5/federation-health' && req.method === 'GET'){
        const r = await systemRoutes.phase5FederationHealth(req, url.searchParams);
        return sendJson(res, r.status, r.body);
      }

      // /api/v1/system/phase5/resource-governance (Phase 5 — P2-PL-01: حاکمیت منابع و ظرفیت پایلوت)
      if(p === '/api/v1/system/phase5/resource-governance' && req.method === 'GET'){
        const r = await systemRoutes.phase5ResourceGovernance(req, url.searchParams);
        return sendJson(res, r.status, r.body);
      }

      // /api/v1/system/phase5/pilot-approval (Phase 5 — P2-PL-01: تاییدیه اپراتور انسانی)
      if(p === '/api/v1/system/phase5/pilot-approval' && req.method === 'POST'){
        const body = await readBody(req, 64 * 1024);
        const r = await systemRoutes.phase5PilotApproval(req, body);
        return sendJson(res, r.status, r.body);
      }

      // /api/v1/system/phase5/provincial-pilots (Phase 5 — P2-PL-02: فهرست و وضعیت پایلوت استانی)
      if(p === '/api/v1/system/phase5/provincial-pilots' && req.method === 'GET'){
        const r = await systemRoutes.phase5ProvincialPilots(req, url.searchParams);
        return sendJson(res, r.status, r.body);
      }

      // /api/v1/system/phase5/provincial-pilots/capacity (Phase 5 — P2-PL-02: تابلوی ظرفیت و مقیاس‌پذیری پایلوت استانی)
      if(p === '/api/v1/system/phase5/provincial-pilots/capacity' && req.method === 'GET'){
        const r = await systemRoutes.phase5ProvincialCapacity(req, url.searchParams);
        return sendJson(res, r.status, r.body);
      }

      // /api/v1/system/phase5/provincial-pilots/activate (Phase 5 — P2-PL-02: فعال‌سازی و آماده‌سازی کلاستر استانی)
      if(p === '/api/v1/system/phase5/provincial-pilots/activate' && req.method === 'POST'){
        const body = await readBody(req, 64 * 1024);
        const r = await systemRoutes.phase5ProvincialActivate(req, body);
        return sendJson(res, r.status, r.body);
      }

      // /api/v1/system/phase5/provincial-pilots/traffic-rollout (Phase 5 — P2-PL-02: تنظیم ترافیک قناری پایلوت استانی)
      if(p === '/api/v1/system/phase5/provincial-pilots/traffic-rollout' && req.method === 'POST'){
        const body = await readBody(req, 64 * 1024);
        const r = await systemRoutes.phase5ProvincialTrafficRollout(req, body);
        return sendJson(res, r.status, r.body);
      }

      // /api/v1/system/national/regions (Phase 5 — P2-NI-01: کنترل‌پلین کلاسترهای ملی)
      if(p === '/api/v1/system/national/regions' && req.method === 'GET'){
        const r = await systemRoutes.nationalRegions(req, url.searchParams);
        return sendJson(res, r.status, r.body);
      }

      // /api/v1/system/national/capacity (Phase 5 — P2-NI-01 / P2-NI-03: مدل ظرفیت ملی پایش و سقف‌های اجبار)
      if(p === '/api/v1/system/national/capacity' && req.method === 'GET'){
        const r = await systemRoutes.nationalCapacity(req, url.searchParams);
        return sendJson(res, r.status, r.body);
      }

      // /api/v1/system/national/capacity/reservations (Phase 5 — P2-NI-03: فهرست رزروهای سهمیه)
      if(p === '/api/v1/system/national/capacity/reservations' && req.method === 'GET'){
        const r = await systemRoutes.nationalCapacityReservations(req, url.searchParams);
        return sendJson(res, r.status, r.body);
      }

      // /api/v1/system/national/capacity/reservation (Phase 5 — P2-NI-03: ثبت رزرو سهمیه با تایید انسانی)
      if(p === '/api/v1/system/national/capacity/reservation' && req.method === 'POST'){
        const body = await readBody(req, 64 * 1024);
        const r = await systemRoutes.nationalCapacityReserve(req, body);
        return sendJson(res, r.status, r.body);
      }

      // /api/v1/system/national/health (Phase 5 — P2-NI-01: تابلوی رصدپذیری ملی)
      if(p === '/api/v1/system/national/health' && req.method === 'GET'){
        const r = await systemRoutes.nationalHealth(req, url.searchParams);
        return sendJson(res, r.status, r.body);
      }

      // /api/v1/system/national/traffic (Phase 5 — P2-NI-01: فابریک ترافیک ملی)
      if(p === '/api/v1/system/national/traffic' && req.method === 'GET'){
        const r = await systemRoutes.nationalTraffic(req, url.searchParams);
        return sendJson(res, r.status, r.body);
      }

      // /api/v1/system/national/operations (Phase 5 — P2-NI-02: مرکز عملیات ملی)
      if(p === '/api/v1/system/national/operations' && req.method === 'GET'){
        const r = await systemRoutes.nationalOperations(req, url.searchParams);
        return sendJson(res, r.status, r.body);
      }

      // /api/v1/system/national/readiness (Phase 5 — P2-NI-02: گیت آمادگی انتشار ملی)
      if(p === '/api/v1/system/national/readiness' && req.method === 'GET'){
        const r = await systemRoutes.nationalReadiness(req, url.searchParams);
        return sendJson(res, r.status, r.body);
      }

      // /api/v1/system/national/load-test (Phase 5 — P2-NI-02: شبیه‌سازی بار ملی)
      if(p === '/api/v1/system/national/load-test' && req.method === 'GET'){
        const r = await systemRoutes.nationalLoadTest(req, url.searchParams);
        return sendJson(res, r.status, r.body);
      }

      // /api/v1/system/national/incidents (Phase 5 — P2-NI-02: رخدادهای مرکز عملیات ملی)
      if(p === '/api/v1/system/national/incidents' && req.method === 'GET'){
        const r = await systemRoutes.nationalIncidents(req, url.searchParams);
        return sendJson(res, r.status, r.body);
      }

      // /api/v1/system/national/change-request (Phase 5 — P2-NI-01 / P2-NI-02: ثبت تغییرات زیرساخت با تایید انسانی)
      if(p === '/api/v1/system/national/change-request' && req.method === 'POST'){
        const body = await readBody(req, 64 * 1024);
        const r = await systemRoutes.nationalChangeRequest(req, body);
        return sendJson(res, r.status, r.body);
      }

      // /api/v1/system/national/write-smoothing (Phase 5 — P2-NI-05: تلطیف بارهای انفجاری نوشت)
      if(p === '/api/v1/system/national/write-smoothing' && req.method === 'GET'){
        const r = await systemRoutes.nationalWriteSmoothing(req, url.searchParams);
        return sendJson(res, r.status, r.body);
      }

      // Phase 6: Canary Status (B1 & B6: رصد بلادرنگ وضعیت کلاسترها، اوزان و SLO)
      if(p === '/api/v1/system/phase6/canary/status' && req.method === 'GET'){
        const r = await systemRoutes.phase6CanaryStatus(req, url.searchParams);
        return sendJson(res, r.status, r.body);
      }

      // Phase 6: Canary Promote / Weight (B3: ارتقای ترافیک با اعتبارسنجی حاکمیت و امضای اپراتور)
      if((p === '/api/v1/system/phase6/canary/promote' || p === '/api/v1/system/phase6/canary/weight') && req.method === 'POST'){
        const body = await readBody(req, 64 * 1024);
        const r = await systemRoutes.phase6CanaryPromote(req, body);
        return sendJson(res, r.status, r.body);
      }

      // Phase 6: Canary Rollback (B4: رول‌بک اضطراری و تخلیه آنی ترافیک به ۰٪)
      if(p === '/api/v1/system/phase6/canary/rollback' && req.method === 'POST'){
        const body = await readBody(req, 64 * 1024);
        const r = await systemRoutes.phase6CanaryRollback(req, body);
        return sendJson(res, r.status, r.body);
      }

      // Phase 6: Canary Circuit Breaker & Failover Control (B5)
      if(p === '/api/v1/system/phase6/canary/circuit-breaker' && req.method === 'POST'){
        const body = await readBody(req, 64 * 1024);
        const r = await systemRoutes.phase6CanaryCircuitBreaker(req, body);
        return sendJson(res, r.status, r.body);
      }

      // Phase 5 (P2-NI-05): National Capacity Gate for core entity writes & reads
      if(p.startsWith('/api/v1/students') || p.startsWith('/api/v1/classes') || p.startsWith('/api/v1/attendance') || p.startsWith('/api/v1/grades')){
        if(!nationalCapacityGateMiddleware(req, res)) return;
      }

      // /api/v1/students & /api/v1/students/:id
      if(p === '/api/v1/students' && req.method === 'GET'){
        const r = await studentRoutes.getStudentsList(req, url.searchParams);
        return sendJson(res, 200, r);
      }
      if(p === '/api/v1/students' && req.method === 'POST'){
        const r = await studentRoutes.createStudent(req, await readBody(req, 64 * 1024));
        return sendJson(res, r.status, r.body);
      }
      if(/^\/api\/v1\/students\/\d+$/.test(p)){
        const id = p.split('/')[4];
        if(req.method === 'GET'){
          const r = await studentRoutes.getStudentById(req, id);
          return sendJson(res, r.status, r.body);
        }
        if(req.method === 'PATCH'){
          const r = await studentRoutes.updateStudent(req, id, await readBody(req, 64 * 1024));
          return sendJson(res, r.status, r.body);
        }
        if(req.method === 'DELETE'){
          const r = await studentRoutes.deleteStudent(req, id);
          return sendJson(res, r.status, r.body);
        }
      }

      // /api/v1/classes & /api/v1/classes/:id
      if(p === '/api/v1/classes' && req.method === 'GET'){
        const r = await classRoutes.getClassesList(req, url.searchParams);
        return sendJson(res, 200, r);
      }
      if(p === '/api/v1/classes' && req.method === 'POST'){
        const r = await classRoutes.createClass(req, await readBody(req, 64 * 1024));
        return sendJson(res, r.status, r.body);
      }
      if(/^\/api\/v1\/classes\/\d+$/.test(p)){
        const id = p.split('/')[4];
        if(req.method === 'GET'){
          const r = await classRoutes.getClassById(req, id);
          return sendJson(res, r.status, r.body);
        }
        if(req.method === 'PATCH'){
          const r = await classRoutes.updateClass(req, id, await readBody(req, 64 * 1024));
          return sendJson(res, r.status, r.body);
        }
        if(req.method === 'DELETE'){
          const r = await classRoutes.deleteClass(req, id);
          return sendJson(res, r.status, r.body);
        }
      }

      // /api/v1/attendance & /api/v1/attendance/:id
      if(p === '/api/v1/attendance' && req.method === 'GET'){
        const r = await attendanceRoutes.getAttendanceList(req, url.searchParams);
        return sendJson(res, 200, r);
      }
      if(p === '/api/v1/attendance' && req.method === 'POST'){
        const r = await attendanceRoutes.createAttendance(req, await readBody(req, 64 * 1024));
        return sendJson(res, r.status, r.body);
      }
      if(/^\/api\/v1\/attendance\/\d+$/.test(p)){
        const id = p.split('/')[4];
        if(req.method === 'PATCH'){
          const r = await attendanceRoutes.updateAttendance(req, id, await readBody(req, 64 * 1024));
          return sendJson(res, r.status, r.body);
        }
        if(req.method === 'DELETE'){
          const r = await attendanceRoutes.deleteAttendance(req, id);
          return sendJson(res, r.status, r.body);
        }
      }

      // /api/v1/grades & /api/v1/grades/:id
      if(p === '/api/v1/grades' && req.method === 'GET'){
        const r = await gradeRoutes.getGradesList(req, url.searchParams);
        return sendJson(res, 200, r);
      }
      if(p === '/api/v1/grades' && req.method === 'POST'){
        const r = await gradeRoutes.createGrade(req, await readBody(req, 64 * 1024));
        return sendJson(res, r.status, r.body);
      }
      if(/^\/api\/v1\/grades\/\d+$/.test(p)){
        const id = p.split('/')[4];
        if(req.method === 'PATCH'){
          const r = await gradeRoutes.updateGrade(req, id, await readBody(req, 64 * 1024));
          return sendJson(res, r.status, r.body);
        }
        if(req.method === 'DELETE'){
          const r = await gradeRoutes.deleteGrade(req, id);
          return sendJson(res, r.status, r.body);
        }
      }

      // /api/v1/users & /api/v1/users/:id
      if(p === '/api/v1/users' && req.method === 'GET'){
        const r = await userRoutes.getUsersList(req, url.searchParams);
        return sendJson(res, 200, r);
      }
      if(p === '/api/v1/users' && req.method === 'POST'){
        const r = await userRoutes.createUser(req, await readBody(req, 64 * 1024));
        return sendJson(res, r.status, r.body);
      }
      if(/^\/api\/v1\/users\/\d+$/.test(p)){
        const id = p.split('/')[4];
        if(req.method === 'GET'){
          const r = await userRoutes.getUserById(req, id);
          return sendJson(res, r.status, r.body);
        }
        if(req.method === 'PATCH'){
          const r = await userRoutes.updateUser(req, id, await readBody(req, 64 * 1024));
          return sendJson(res, r.status, r.body);
        }
        if(req.method === 'DELETE'){
          const r = await userRoutes.deleteUser(req, id);
          return sendJson(res, r.status, r.body);
        }
      }

      return sendJson(res, 404, { ok: false, code: 'not_found' });
    }
    if(p.indexOf('/api/') === 0) return sendJson(res, 404, { ok: false, code: 'not_found' });
    return await serveStatic(res, p, nonce);
  }catch(err){
    /* R96 P0-5: حجمِ بیش‌ازحدِ body → 413 (نه 500) — و خطا را لاگ نکن که
       محتوای بدنه در audit نیاید. */
    if(err && err.message === 'too_large'){
      audit('body_too_large', { path: p });
      if(!res.headersSent) sendJson(res, 413, { ok: false, code: 'body_too_large' });
      else res.end();
      return;
    }
    audit('error', { path: p, msg: String(err.message || err).slice(0, 120) });
    if(!res.headersSent) sendJson(res, 500, { ok: false, code: 'server_error' });
    else res.end();
  }
};

/* ── Wave 15: شمارشِ درخواست‌هایِ درحالت‌پرواز برایِ Graceful Shutdown ──
   هر درخواست در ورود شمار می‌شود و در 'close' پاسخ (پس از flush کامل،
   حتی روی اتصالِ keep-alive) کم می‌شود. drain = صفرِ این شمارنده. */
let draining = false;
let inFlight = 0;
const SHUTDOWN_TIMEOUT_MS = Math.max(500, Number(process.env.PAYESH_SHUTDOWN_TIMEOUT_MS) || 10000);
const wrappedRequest = async (req, res) => {
  inFlight++;
  res.on('close', () => { inFlight = Math.max(0, inFlight - 1); });
  /* S7-1: fail-safe — a rejection from any request handler must never reach the
     process-level unhandledRejection path (Node ≥15 exits the process there).
     One bad request may fail; it may not take the service down with it. */
  try{
    await onRequest(req, res);
  }catch(e){
    try{ console.error('[request] unhandled handler error:', (e && e.message) || e); }catch(_){}
    try{ if(!res.writableEnded) sendJson(res, 500, { ok: false, code: 'internal_error' }); }catch(_){}
  }
};

/* ── TLS (stage 2): real https when PAYESH_TLS_CERT / PAYESH_TLS_KEY
     point at PEM files (self-signed: `node server/tls-cert.js`).
     PAYESH_HTTPS=1 still means "behind a TLS reverse proxy". ──────── */
const TLS_CERT = process.env.PAYESH_TLS_CERT || null;
const TLS_KEY  = process.env.PAYESH_TLS_KEY  || null;
let server;
if(TLS_CERT || TLS_KEY){
  if(!TLS_CERT || !TLS_KEY){
    console.error('TLS needs BOTH PAYESH_TLS_CERT and PAYESH_TLS_KEY');
    process.exit(1);
  }
  if(!fs.existsSync(TLS_CERT) || !fs.existsSync(TLS_KEY)){
    console.error('TLS file missing: check PAYESH_TLS_CERT and PAYESH_TLS_KEY paths');
    console.error('generate one:  node server/tls-cert.js');
    process.exit(1);
  }
  const keyPem  = fs.readFileSync(TLS_KEY);
  const certPem = fs.readFileSync(TLS_CERT);
  /* Round 85 (P1-4): production fail-fast. A self-signed cert (e.g. the
     dev one from `node server/tls-cert.js`) is fine for local dev, but a
     deployment that declares PAYESH_ENV=production must present a
     CA-issued cert — real PII (nid/phone) must not ride a cert the
     client cannot verify. subject===issuer is the self-signed marker. */
  if(process.env.PAYESH_ENV === 'production'){
    try{
      const x509 = new (require('crypto').X509Certificate)(certPem);
      if(x509.subject === x509.issuer){
        console.error('Error: Production requires valid CA certificate (self-signed cert detected; see DEPLOY.md §TLS — certbot)');
        process.exit(1);
      }
    }catch(e){
      console.error('Error: Production requires valid CA certificate (cert unreadable: ' + e.message + ')');
      process.exit(1);
    }
  }
  const https = require('https');
  server = https.createServer({ key: keyPem, cert: certPem }, wrappedRequest);
}else{
  server = http.createServer(wrappedRequest);
}
/* Wave 14 — تاپِ زمان‌سنجی پاسخ (هر دو حالت HTTP/HTTPS) — fail-safe؛ هرگز
   بوتِ سرویس را نمی‌شکند. */
try { if (server) metrics.attach(server); } catch (e) {}
/* S-73-6: connection/request timeouts — a stalled client must not hold a
   socket forever (slowloris surface). 65s covers the slowest legit op. */
/* R96 P1-10: production باید TLS داشته باشد — یا مستقیم (گواهیِ CA) یا
   پشتِ reverse-proxyِ اعلام‌شده. وگرنه استارت نمی‌کند (fail-fast). */
if(process.env.PAYESH_ENV === 'production' && !TLS_CERT && !TLS_KEY
   && process.env.PAYESH_BEHIND_PROXY !== '1' && process.env.PAYESH_HTTPS !== '1'){
  console.error('Error: production requires TLS — set PAYESH_TLS_CERT/PAYESH_TLS_KEY (CA-issued cert) or PAYESH_BEHIND_PROXY=1 behind a TLS reverse proxy');
  process.exit(1);
}
try{
  if('requestTimeout' in server) server.requestTimeout = 65000;
  if('headersTimeout' in server) server.headersTimeout = 65000;
  server.keepAliveTimeout = 65000;
}catch(e){}

/* ── Wave 15: Graceful Shutdown (SIGTERM / SIGINT) ───────────────────
   توالی:
     1) draining = true — /api/readiness فوراً 503 (بالانس بار از ما می‌رود)
     2) closeIdleConnections + server.close — پذیرشِ اتصالِ تازه متوقف
        (اتصالاتِ keep-aliveٔ خالی فوراً بسته می‌شوند؛ Node ≥ 18.2)
     3) انتظارِ پایانِ درخواست‌هایِ درحالت‌پرواز (poll 50ms؛ مهلت
        PAYESH_SHUTDOWN_TIMEOUT_MS، پیش‌فرض 10s)
     4) seamِ worker: اگر در آینده workerی بیاید همین‌جا ایستاده
        شود (این شاخه worker ندارد؛ تایمرِ بکاپِ خودکار unref است و
        خروج را نگه نمی‌دارد — persistStoreٔ بعدی dirty را می‌پوشاند)
     5) persistStore (همگام) + db.close() + redis.close() (ناهمگام)
     6) process.exit(0)
   نگهبانِ زور: اگر drain از مهلت بگذرد، خروج اجباری با کد ۱
   (غیرصفر = قابلِ مشاهده در مانیتورینگ؛ کد ۰ فقط برایِ ختمِ تمیز).
   اگر listener اصلاً شروع نشده باشد (تستِ درون‌فرایند)، server.close()
   بی‌اثر است و توالی به‌همان‌ترتیب انجام می‌شود. */
let shutdownRunning = false;
function handleShutdown(signal) {
  if (draining || shutdownRunning) return;
  shutdownRunning = true;
  draining = true;
  const t0 = Date.now();
  const started = inFlight;
  console.log('[shutdown] ' + signal + ' received — draining ' + started + ' in-flight request(s), budget ' + SHUTDOWN_TIMEOUT_MS + 'ms');
  try { if (server.closeIdleConnections) server.closeIdleConnections(); } catch (e) {}
  try { server.close(() => {}); } catch (e) {} /* ERR_SERVER_NOT_RUNNING — context تست */
  let done = false;
  const killer = setTimeout(() => {
    console.error('[shutdown] drain budget exceeded — forcing exit');
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS + 2000);
  const poll = setInterval(() => {
    if (inFlight > 0) return;
    finish();
  }, 50);
  function finish() {
    if (done) return;
    done = true;
    clearTimeout(killer);
    clearInterval(poll);
    try { persistStore(); } catch (e) {}
    (async () => {
      try { await db.close(); } catch (e) {}
      try { await redis.close(); } catch (e) {}
      console.log('[shutdown] clean — dependencies closed in ' + (Date.now() - t0) + 'ms; exit 0');
      process.exit(0);
    })();
  }
  /* بدونِ listenerِ فعال، close() هرگز کامل نمی‌شود — اگر الان هم درحالت
    پروازی نباشد، خودمان را پیش می‌بریم (poll ۵۰ms هم پادزهرِ دوم است). */
  if (inFlight === 0) setTimeout(() => { if (inFlight === 0) finish(); }, 50);
}
process.on('SIGTERM', () => { handleShutdown('SIGTERM'); });
process.on('SIGINT', () => { handleShutdown('SIGINT'); });

/* ── بکاپِ دوره‌ایِ خودکار (باقی‌ماندهٔ 2.4) — درون‌پروسه ─────────
   PAYESH_BACKUP_EVERY_HOURS (production، مثلاً 24) یا
   PAYESH_BACKUP_EVERY_MS (تست). بی‌ارزش/صفر = خاموش. */
const BACKUP_EVERY_MS = (Number(process.env.PAYESH_BACKUP_EVERY_MS) > 0)
  ? Number(process.env.PAYESH_BACKUP_EVERY_MS)
  : (Number(process.env.PAYESH_BACKUP_EVERY_HOURS) > 0
      ? Number(process.env.PAYESH_BACKUP_EVERY_HOURS) * 3600000 : 0);

if(require.main === module){
  /* Wave 15: این خطِ verbatim باید بماند (جهشِ M18 روی همین الگو است).
     تایمرِ بکاپِ خودکار unref است — خروجِ shutdown را هرگز نگه نمی‌دارد؛
     persistStoreٔ نهاییِ handleShutdown وضعیتِ dirty را می‌پوشاند. */
  if(BACKUP_EVERY_MS > 0) admin.startAutoBackup(BACKUP_EVERY_MS);
  /* ویو ۱۴ — نمونه‌برداریِ runtime (heap/rss/cpu/event-loop lag). تایمرها
     unref هستند: هرگز فرآیند را زنده نگه نمی‌دارند. */
  metrics.startRuntimeCollector();
  metrics.set('payesh_build_info', { version: '1.0', phase: '1' }, 1);
  /* P0-1 — synchronous boot gate. Evaluated here (not in the async db.init
     handler) so the failure reason is unambiguous and always precedes the
     Redis readiness gate: in production, an absent DATABASE_URL must never
     reach listen(). Unreachable-but-configured PostgreSQL is caught by the
     ok:false branch of db.init above. */
  if (db.isProductionEnv() && !process.env.DATABASE_URL && !db.memoryFallbackAllowed()) {
    console.error('[FATAL] ' + db.backingStorePolicy().reason);
    console.error('Error: production requires PostgreSQL — set DATABASE_URL (the JSON/in-memory store is dev-only and forks per instance)');
    try { persistStoreSync(); } catch (e) {}
    process.exit(1);
  }
  const startListening = async () => {
    if (process.env.DATABASE_URL) {
      const info = await Promise.resolve(dbReady);
      if (!info || info.ok === false || info.driver !== 'postgres') {
        console.error('[FATAL] DATABASE_URL set but PostgreSQL is not ready — refusing listen()');
        process.exit(1);
      }
      if (!authority.attached()) {
        console.error('[FATAL] DATABASE_URL set but authority is not attached/hydrated — refusing listen()');
        process.exit(1);
      }
    }
    if (canaryHydrated) {
      /* Root-cause fix: no socket until canary weights are loaded (or loudly failed). */
      try { await canaryHydrated; }
      catch (e) {
        if (process.env.DATABASE_URL) {
          console.error('[FATAL] canary hydrate failed — refusing listen():', e && e.message);
          process.exit(1);
        }
        console.warn('[CANARY] boot continues WITHOUT persisted weights (loud degradation — see error above)');
      }
    }
    /* P1: پیش از باز کردنِ سوکت، دروازهٔ آمادگیِ کش (ردیس) هم به نتیجه برسد.
       در غیر این صورت با ردیسِ غیرقابلِ دسترس، سوکت پیش از exit(1) باز می‌ماند. */
    try { await cacheReady; }
    catch (e) {
      console.error('[FATAL] cache readiness crashed — refusing listen():', e && e.message);
      process.exit(1);
    }
    server.listen(PORT, HOST, () => {
    const proto = (TLS_CERT && TLS_KEY) ? 'https' : 'http';
    console.log('payesh-server (phase 1' + (TLS_CERT ? ' + TLS' : '') + ') on ' + proto + '://' + HOST + ':' + PORT);
    console.log('  static : ' + path.join(ROOT, 'index.html'));
    console.log('  api    : /api/health /api/readiness /api/liveness /api/auth/* /api/sync /api/sync/conflicts /api/sync/resolve-conflict /api/students/:id /api/bell/now /api/public-report /api/admin/{backup,restore} /api/sms/send');
    console.log('  metrics: /metrics (' + (process.env.PAYESH_METRICS_TOKEN ? 'bearer token' : (process.env.PAYESH_ENV === 'production' || process.env.NODE_ENV === 'production') ? 'DISABLED — set PAYESH_METRICS_TOKEN' : 'loopback only') + ')');
    console.log('  store  : ' + STORE_FILE + '  (' + (store.users || []).length + ' users)');
    if(BACKUP_EVERY_MS > 0){
      /* A-05b: در حالتِ PG-live، تایمرِ بکاپ عمداً مسلح نمی‌شود (PG مرجع
         است — admin.startAutoBackup هیچ‌وقت فایل نمی‌نویسد). چاپِ «automatic
         every N min» در این حالت یک قولِ دروغ بود. */
      if (db && typeof db.isPostgres === 'function' && db.isPostgres()) {
        console.log('  backup : in-process JSON export refused in PG mode — timer NOT armed. ' +
          'Use pg_dump / pgBackRest / WAL-G at the infrastructure level (docs/RELIABILITY_DR_PLAN.md).');
      } else {
        console.log('  backup : automatic every ' + Math.round(BACKUP_EVERY_MS / 60000) + ' min (retention ' + 10 + ')');
      }
    } else if (process.env.NODE_ENV === 'production' || process.env.PAYESH_ENV === 'production' || process.env.DATABASE_URL) {
      /* A-05: بکاپِ خودکار پیش‌فرض خاموش است و تا پیش از این در زمانِ بوتِ
         تولید هیچ خطی چاپ نمی‌شد — یک استقرار می‌توانست بدونِ هیچ بکاپی
         بالا بیاید. اکنون هشدارِ بلند (نه مسدودکننده) داده می‌شود. */
      console.warn('  ⚠ backup: DISABLED — set PAYESH_BACKUP_EVERY_HOURS (e.g. 24) or PAYESH_BACKUP_EVERY_MS. ' +
        'No automatic backup will run in this process.');
    }
    });
  };
  /* P0-1 — in production, listen() waits for database readiness. Without this
     the asynchronous gate loses the race with listen(): the process accepted
     connections for a few hundred ms and only then exited non-zero, which is
     not fail-closed. Dev/test keep the previous immediate listen, so
     zero-disruption local boot is unchanged. */
  if (process.env.DATABASE_URL || (db.isProductionEnv() && !db.memoryFallbackAllowed())) {
    Promise.resolve(dbReady).then((info) => {
      if (process.env.DATABASE_URL && (!info || info.ok === false || info.driver !== 'postgres')) {
        console.error('[FATAL] DATABASE_URL hydrate failed — refusing listen()');
        process.exit(1);
      }
      if (info && info.ok === false) return; /* handler above already exits */
      startListening();
    }).catch((e) => {
      console.error('[FATAL] boot gate failed:', e && e.message);
      if (process.env.DATABASE_URL) process.exit(1);
    });
  } else {
    startListening();
  }
}
/* rebase: union — main added persistStoreSync/workers/staticCache + Wave 6/15 test hooks, Wave 14 adds metrics. */
module.exports = {
  server, store, audit, isHttps, persistStore, persistStoreSync, db, redis, cache, workers, staticCache, metrics,
  __gcStoreForTests: gcStore,
  /* Wave 6: برای تستِ مستقیمِ نگهبانِ شمارش (state روی Redis) */
  __enumForTests: { enumTouch, enumRead, enumDelayMs, enumStage, enumKey },
  /* Wave 15: برای تستِ Graceful Shutdown (وضعیتِ drain) */
  __drainForTests: () => ({ draining, inFlight })
};
