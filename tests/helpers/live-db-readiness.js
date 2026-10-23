#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════
   tests/helpers/live-db-readiness.js — کرانه‌دار، fail-closed readiness gate
   ───────────────────────────────────────────────────────────────────────
   چرا این فایل وجود دارد (M15-01 / Bug Hunt `CI-FLAKE-01`):
     `tests/server13.js` سرورِ production را واقعاً spawn می‌کند و آن سرور در
     production «fallbackِ JSON/in-memory» را رد می‌کند (server/db.js:
     `DATABASE_URL is required when NODE_ENV=production`). نتیجه: اگر
     PostgreSQL در آن لحظه اتصال را رد کند، پیامِ سوئیت چنین می‌شود
       ❌ T2 production + CA-signed → سرور بالا آمد — code=1 err=[DB]
          PostgreSQL unreachable in production — refusing the JSON/in-memory
          fallback: connect ECONNREFUSED 127.0.0.1:5432
     یعنی یک «شکستِ محصولِ TLS» — در حالی که نقص، محیط/وابستگی است. دقیقاً
     همین امضا در Node.js CI (PR) روی `7d902f33…` سوزنِ قرمزِ
     `RED suite server13-mutations` را تولید کرد (check-run
     `120598819123`, step 7; بدنهٔ حلقهٔ `execFileSync` در لاگ، با
     `connect ECONNREFUSED 127.0.0.1:5432`).

     قبل از این دروازه، سوئیت فقط یک `migrate-ledger up` «best-effort» داشت که
     خطایش در یک `catch` بلعیده می‌شد — یعنی هیچ سنجشِ آمادگی‌ای وجود نداشت و
     شکستِ مهاجرات هم بی‌صدا می‌گذشت.

   قرارداد این دروازه (تأکید: هیچ دروازه‌ای تضعیف نمی‌شود):
     1. آمادگی با یک کوئریِ واقعی (`SELECT 1` روی همان DSN) سنجیده می‌شود —
        نه `nc`، نه TCPِ خالی، نه skip.
     2. بودجه کرانه‌دار است (پیش‌فرض ۹۰ ثانیه، بازپرس هر ۱ ثانیه). یک پنجرهٔ
        کوتاهِ crash-restartِ postmaster جذب می‌شود؛ خرابیِ واقعی همچنان
        exit 1 می‌دهد. هیچ سبزی از این دروازه درنمی‌آید.
     3. پیامِ شکست کلمهٔ `ENVIRONMENT` را دارد تا یک قرمزیِ محیطی هرگز
        «نقصِ TLS» تفسیر نشود (تفکیکِ صادقانه، نه تبدیلِ قرمز به سبز).
     4. DSN هرگز خام چاپ نمی‌شود: `redactTarget` فقط میزبان/درگاه/پایگاه.

   اجرا (به‌عنوانِ واحدِ مستقل): node tests/live-db-readiness-guards.js
   ═══════════════════════════════════════════════════════════════════════ */
'use strict';

const { execFileSync } = require('child_process');
const path = require('path');

const CI_DEFAULT_DB = 'postgres://payesh:payesh@127.0.0.1:5432/payesh_ci';
const ROOT = path.join(__dirname, '..', '..');

function resolveTargetDbUrl(env) {
  const e = env || process.env;
  return e.DATABASE_URL || e.PGURL || CI_DEFAULT_DB;
}

/* پاک‌سازیِ تدافعیِ هر رشته‌ای که قرار است در لاگ برود: هر DSNِ کاربر/رمزدار
   به شکلِ بدونِ اعتبارنامه درمی‌آید. لاگِ CI باید قابلِ چسباندن روی ایشو باشد. */
const DSN_IN_TEXT_RE = /([a-z][a-z0-9+.-]*):\/\/[^/\s@]*@/gi;
function redactSecrets(text) {
  return String(text == null ? '' : text).replace(DSN_IN_TEXT_RE, (m) => m.split('://')[0] + '://[REDACTED]@');
}

/* فقط بخش‌هایِ غیرحساسِ اتصال. نامِ کاربر و رمز هرگز از این تابع بیرون
   نمی‌روند — لاگِ CI باید قابلِ چسباندن روی ایشو باشد. */
function redactTarget(connectionString) {
  const raw = String(connectionString || '');
  let u = null;
  try {
    u = new URL(raw.replace(/^postgres(ql)?:/i, 'http:'));
  } catch (_err) {
    u = null;
  }
  if (!u) return 'unparsable-target';
  const db = String(u.pathname || '').replace(/^\//, '') || '(no-database)';
  return (u.hostname || '?') + ':' + (u.port || '5432') + '/' + db;
}

function shortError(e) {
  const m = String((e && (e.message || e)) || '').split('\n')[0].trim();
  return redactSecrets(m || 'unknown-error').slice(0, 160);
}

/* سنجشِ آمادگی: کوئریِ واقعی، کرانه‌دار، بدونِ skip.
   برمی‌گرداند { ok, attempts, waited_ms, budget_ms, target, last_error } */
async function waitForPostgres(connectionString, opts) {
  const o = opts || {};
  const budgetMs = Number.isFinite(o.budgetMs) ? Math.max(0, o.budgetMs) : 90000;
  const intervalMs = Number.isFinite(o.intervalMs) ? Math.max(50, o.intervalMs) : 1000;
  const { Client } = require('pg');
  const started = Date.now();
  let attempts = 0;
  let last = 'not-attempted';
  while (true) {
    attempts++;
    const c = new Client({ connectionString: String(connectionString), connectionTimeoutMillis: 2500, statement_timeout: 4000 });
    try {
      await c.connect();
      const r = await c.query('SELECT 1 AS ok');
      await c.end();
      if (r && r.rows && r.rows[0] && Number(r.rows[0].ok) === 1) {
        return { ok: true, attempts, waited_ms: Date.now() - started, budget_ms: budgetMs, target: redactTarget(connectionString), last_error: null };
      }
      last = 'unexpected-select-1-result';
    } catch (e) {
      try { await c.end(); } catch (_endErr) { /* اتصال از قبل بسته */ }
      last = shortError(e);
    }
    if (Date.now() - started + intervalMs > budgetMs) {
      return { ok: false, attempts, waited_ms: Date.now() - started, budget_ms: budgetMs, target: redactTarget(connectionString), last_error: last };
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

/* مهاجرات، کرانه‌دار و بدونِ بلعیدنِ خطا. پاسخ:
   { ok, attempts, last_error, out }
   چرا تلاشِ مجدد: در CI همین لحظه با ۴ لاِنِ موازی اجرا می‌شود و lane B/کپی‌ها
   نیز `migrate-ledger up` می‌زنند؛ قفلِ advisory در `tools/migrate-ledger.js`
   وجود ندارد، پس برخوردِ DDL هم‌زمان ممکن است. تلاشِ مجدد کرانه‌دار این را
   جذب می‌کند و در خرابیِ واقعی، قرمز را نگه می‌دارد. */
async function ensureMigrated(connectionString, opts) {
  const o = opts || {};
  const attempts = Math.max(1, Number(o.attempts) || 3);
  const retryMs = Math.max(0, Number(o.retryMs) || 2000);
  const timeoutMs = Math.max(5000, Number(o.timeoutMs) || 60000);
  let last = 'not-attempted';
  let out = '';
  for (let i = 1; i <= attempts; i++) {
    try {
      out = execFileSync(process.execPath, [path.join(ROOT, 'tools/migrate-ledger.js'), 'up'], {
        cwd: ROOT,
        env: Object.assign({}, process.env, { DATABASE_URL: String(connectionString) }),
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: timeoutMs,
        maxBuffer: 8 * 1024 * 1024
      });
      return { ok: true, attempts: i, last_error: null, out: redactSecrets(String(out || '')).split('\n').filter(Boolean).slice(-1)[0] || '' };
    } catch (e) {
      last = shortError(e);
      out = redactSecrets(String((e && e.stdout) || '') + String((e && e.stderr) || ''));
      if (i < attempts) await new Promise((r) => setTimeout(r, retryMs));
    }
  }
  return { ok: false, attempts, last_error: last, out: out.slice(-400) };
}

module.exports = { CI_DEFAULT_DB, resolveTargetDbUrl, redactTarget, redactSecrets, shortError, waitForPostgres, ensureMigrated };
