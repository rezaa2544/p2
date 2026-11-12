/* ═══════════════════════════════════════════════════════════════════
   server/logger.js — لاگ ساختاریافتهٔ JSON-lines با correlation id (A-39)
   ───────────────────────────────────────────────────────────────────
   قرارداد: هر خط = یک JSON شیء روی stdout:
     { ts, level, msg, request_id, tenant, user, ...fields }
   - جستجوپذیر بر اساس request_id / tenant / user — دقیقاً همان چیزی که
     A-39 می‌خواهد؛ بدون وابستگی جدید (pino/winston نیامده بودند و افزودن
     زنجیرهٔ تأمین برای این قرارداد لازم نبود — خروجی = همان JSON-lines
     که جمع‌کننده‌های لاگ می‌فهمند).
   - child(bind) = زمینهٔ ثابت (request_id/tenant/user) برای همهٔ خطوطِ
     بعدی همان درخواست.
   - سطوح: debug/info/warn/error؛ LOG_LEVEL پیش‌فرض info.
   - error = روی stderr هم می‌رود (stderrِ سیستم‌عامل = کانالِ خطای
     اپراتور؛ stdout = جریانِ اصلیِ لاگ).
   - هیچ وابستگی‌ای به ماژول‌های دیگر سرور ندارد (بدون چرخهٔ require —
     از ابتدای boot در دسترس است).
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
const crypto = require('crypto');

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
const MIN = LEVELS[String(process.env.LOG_LEVEL || 'info').toLowerCase()] || 20;

function newRequestId() {
  return crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex');
}

function emit(level, bind, msg, fields) {
  if ((LEVELS[level] || 20) < MIN) return;
  const rec = { ts: new Date().toISOString(), level };
  if (bind) {
    for (const k of ['request_id', 'tenant', 'user']) {
      if (bind[k] !== undefined && bind[k] !== null) rec[k] = bind[k];
    }
    for (const k of Object.keys(bind)) {
      if (k === 'request_id' || k === 'tenant' || k === 'user') continue;
      rec[k] = bind[k];
    }
  }
  if (fields) { for (const k of Object.keys(fields)) rec[k] = fields[k]; }
  rec.msg = String(msg === undefined ? '' : msg);
  const line = JSON.stringify(rec);
  if (level === 'error') process.stderr.write(line + '\n');
  else process.stdout.write(line + '\n');
}

function createLogger(bind) {
  const b = bind || {};
  const api = {
    debug: (msg, fields) => emit('debug', b, msg, fields),
    info: (msg, fields) => emit('info', b, msg, fields),
    warn: (msg, fields) => emit('warn', b, msg, fields),
    error: (msg, fields) => emit('error', b, msg, fields),
    child: (extra) => createLogger(Object.assign({}, b, extra || {})),
    requestId: b.request_id
  };
  return api;
}

const root = createLogger();

/* The module = the root logger: logger.info(...) works directly AND
   logger.child(...) / logger.root stay available (the A-39 migration sites
   call logger.info at module scope). */
module.exports = {
  debug: root.debug,
  info: root.info,
  warn: root.warn,
  error: root.error,
  root,
  child: root.child,
  createLogger,
  newRequestId,
  LEVELS
};
