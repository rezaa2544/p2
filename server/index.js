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
const waf = require('./waf'); /* P-WAF: فقط-تشخیص (detect-only) */
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
const { createSms } = require('./sms');
const { createConflicts } = require('./conflicts');
const { createAudit, clientIp } = require('./audit');
const db = require('./db');
const redis = require('./redis');
const cache = require('./cache');

const { createStudentRoutes } = require('./routes/students');
const { createClassRoutes } = require('./routes/classes');
const { createAttendanceRoutes } = require('./routes/attendance');
const { createGradeRoutes } = require('./routes/grades');
const { createUserRoutes } = require('./routes/users');
const { createBootstrapRoute } = require('./routes/bootstrap');
const { createIds } = require('./ids'); /* P0-16 */
const { createOutbox } = require('./outbox'); /* P0-17 */
const { createDeleteService } = require('./delete-service'); /* P0-17 */
const { createPull } = require('./pull');

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
const DEMO_CODE_ECHO = process.env.PAYESH_DEMO_CODE === '1';

/* ── store ────────────────────────────────────────────────────────── */
function loadStore(){
  if(!fs.existsSync(STORE_FILE)){
    console.error('no store found: ' + STORE_FILE);
    console.error('run:  node server/seed.js   (builds it from the demo world)');
    process.exit(1);
  }
  const s = JSON.parse(fs.readFileSync(STORE_FILE, 'utf8'));
  s.__processed_uids = s.__processed_uids || {};
  s.__revoked_jti    = s.__revoked_jti || {};
  s.__auth = s.__auth || { codes: {}, login_fail: {}, code_rate: {}, enum: {} };
  return s;
}
const store = loadStore();
syncAttach(store);

/* ── database and caching layers initialization ── */
db.init(store).then(info => {
  if (info.driver === 'postgres') {
    console.log('[DB] Connected to PostgreSQL relational engine');
  }
}).catch(err => {
  console.warn('[DB] PostgreSQL init warning:', err.message);
});

cache.init().then((r) => {
  if (r && r.ok === false) {
    /* P0-13: در تولید بدونِ ردیسِ زنده سرویس نمی‌دهیم — فال‌بک به حافظهٔ
       محلی بین نمونه‌ها واگرا می‌شود. خروجی غیرصفر = شکستِ ریدی. */
    console.error('[FATAL] Cache readiness failed:', r.error || r.warning || 'unknown');
    if (process.env.NODE_ENV === 'production') {
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
  if (process.env.NODE_ENV === 'production') process.exit(1);
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
function enumTouch(sess){
  const e = (store.__auth.enum[sess.jti] = store.__auth.enum[sess.jti] || { t: Date.now(), n: 0 });
  if(Date.now() - e.t > ENUM_WINDOW_MS){ e.t = Date.now(); e.n = 0; }
  e.n += 1;
  return e;
}
function enumDelay(sess){
  const e = store.__auth.enum && store.__auth.enum[sess.jti];
  if(!e) return 0;
  if(e.n >= ENUM_SLOW2) return 2000;
  if(e.n >= ENUM_SLOW1) return 500;
  return 0;
}
/* R97 — مراحلِ نگهبان (هشدار/تأخیر/ابطال)؛ در هر دو نقطهٔ شمارش: رد‌ها و خوانشِ ID */
function enumStage(e, sess){
  if(e.n === ENUM_WARN) audit('enum_warn', { user_id: sess.id, n: e.n });
  else if(e.n === ENUM_SLOW1) audit('enum_slow', { user_id: sess.id, n: e.n, delay_ms: 500 });
  else if(e.n === ENUM_SLOW2) audit('enum_slow2', { user_id: sess.id, n: e.n, delay_ms: 2000 });
  else if(e.n === ENUM_REVOKE){
    store.__revoked_jti[sess.jti] = { at: Date.now(), reason: 'enumeration' };
    audit('enum_revoke', { user_id: sess.id, n: e.n });
  }
}

let dirty = false;
function markDirty(){ dirty = true; }

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
  for(const k in store.__processed_uids){
    if(now - store.__processed_uids[k] > UID_GC_MS){ delete store.__processed_uids[k]; n++; }
  }
  for(const k in store.__revoked_jti){
    if(now - store.__revoked_jti[k] > JTI_GC_MS){ delete store.__revoked_jti[k]; n++; }
  }
  return n;
}
function persistStore(){
  if(!dirty) return;
  dirty = false;
  const gc = gcStore();
  if(gc) try { audit('store_gc', { removed: gc }); } catch(e){}
  try{
    const tmp = STORE_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(store), { encoding: 'utf8', mode: 0o600 }); /* S-73-3: PII — owner-only */
    fs.renameSync(tmp, STORE_FILE);
    try{ fs.chmodSync(STORE_FILE, 0o600); }catch(e){}
  }catch(e){ /* store file may be gone (tests) — never crash on exit */ }
}
setInterval(persistStore, 2000).unref();
process.on('exit', () => { persistStore(); db.close(); redis.close(); });
process.on('SIGTERM', () => { persistStore(); db.close(); redis.close(); process.exit(0); });
process.on('SIGINT', () => { persistStore(); db.close(); redis.close(); process.exit(0); });

/* ── JWT secret (env, or generated once; never committed) ──────────── */
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
     در enumStage/enumDelay. مسیرهایِ /api/auth/* سقفِ خودشان را دارند. */
  const r = REQ_STATE;
  const isIdorRead = r && /^\/api\/students\/\d+$/.test(r.p || '');
  if(r && r.sess && (status === 401 || status === 403 || status === 404) && !isIdorRead){
    enumStage(enumTouch(r.sess), r.sess);
  }
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
const auth = createAuth({ store, JWT_SECRET, JWT_PREV_SECRET, SESSION_NAME, SESSION_TTL_S, CODE_TTL_MS, DEMO_CODE_ECHO, audit, isHttps, markDirty, otp });
/* R97: همهٔ ماژول‌هایِ /api با sendJsonCounting می‌چرخند تا رد‌ها شمرده
   شوند؛ auth استثناست (سقفِ OTP سقفِ خودش را می‌سازد). */
const sync = createSync({ store, db, MAX_BATCH, AT_DRIFT_MS, audit, sessionFrom: auth.sessionFrom, sendJson: sendJsonCounting, markDirty });
const idor = createIdor({ store, audit, sessionFrom: auth.sessionFrom, sendJson: sendJsonCounting });
const bell = createBell({ store, audit, sessionFrom: auth.sessionFrom, sendJson: sendJsonCounting });
const pubrep = createPublicReport({ store, sendJson: sendJsonCounting });
const admin = createAdmin({ store, audit, sessionFrom: auth.sessionFrom, sendJson: sendJsonCounting, markDirty, dataDir: path.dirname(STORE_FILE) });
const sms = createSms({ store, audit, sessionFrom: auth.sessionFrom, sendJson: sendJsonCounting, markDirty });
const conflicts = createConflicts({ store, audit, sessionFrom: auth.sessionFrom, sendJson: sendJsonCounting, markDirty });

/* ── Phase 3: RESTful Resource Routes ─────────────────────────────── */
/* P0-16: شناسه‌های بدون‌برخورد — دنبالهٔ پستگرس یا مکس+۱ قفل‌دار */
const ids = createIds({ db, cache });
/* P0-17: صندوق برون‌مرزی + سرویس حذف واحد (سنگ‌قبر به‌جای اسپلایسِ خام) */
const outbox = createOutbox({ store, db });
const deleter = createDeleteService({ store, db, markDirty, outbox });
const studentRoutes = createStudentRoutes({ store, db, audit, markDirty, ids, deleter });
const classRoutes = createClassRoutes({ store, db, audit, markDirty, ids, deleter });
const attendanceRoutes = createAttendanceRoutes({ store, db, audit, markDirty, ids, deleter });
const gradeRoutes = createGradeRoutes({ store, db, audit, markDirty, ids, deleter });
const userRoutes = createUserRoutes({ store, db, audit, markDirty, ids, deleter });
const bootstrapRoute = createBootstrapRoute({ store, db });
const pullRoute = createPull({ store, db, sessionFrom: auth.sessionFrom, sendJson });

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
function serveStatic(res, urlPath, nonce){
  const entry = STATIC[urlPath];
  if(!entry) return sendJson(res, 404, { ok: false, code: 'not_found' });
  const fp = path.join(ROOT, entry.file);
  if(!fs.existsSync(fp)) return sendJson(res, 500, { ok: false, code: 'missing_build' });
  let html = fs.readFileSync(fp, 'utf8');
  /* per-request CSP nonce (contract §5.6.2) — build.js placeholder */
  if(nonce) html = html.split('__PAYESH_NONCE__').join(nonce);
  res.writeHead(200, { 'Content-Type': entry.type, 'Cache-Control': 'no-cache' });
  res.end(html);
}

/* ── router ────────────────────────────────────────────────────────── */
const onRequest = async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const p = url.pathname;
  const https = isHttps(req);
  const nonce = crypto.randomBytes(16).toString('base64');
  securityHeaders(res, nonce, https);
  /* Tracing (P-Trace): شناسهٔ ردیابی در کانتکست و سرآیندِ پاسخ برای هم‌بستگی —
     پیش از WAF تا رویدادهای ممیزیِ آن شناسهٔ ردیابی داشته باشند. */
  req.context = req.context || {};
  try{
    const __tid = tracing.getTraceId();
    if(__tid){ req.context.trace_id = __tid; res.setHeader('X-Trace-Id', __tid); }
  }catch(e){}
  /* WAF (P-WAF): فقط-تشخیص (detect-only)؛ هرگز مسدود نمی‌کند — اِعمال با لبه است */
  try{ await waf.wafMiddleware(req, res); }catch(e){}
  /* R97 — نگهبانِ شمردنِ شناسه: شمارِ رد‌ها (404/403/401) و شمارِ همهٔ
     خوانش‌هایِ /api/students/:id (مسطحِ شمردنِ شناسهٔ §5.7) به ازای هر
     نشست؛ از SLOW1 به بعد تأخیر، در REVOKE ابطال (sendJsonCounting). */
  REQ_STATE.sess = null;
  REQ_STATE.p = p;
  if(p.indexOf('/api/') === 0 && p.indexOf('/api/auth/') !== 0){
    const gs = await auth.sessionFrom(req);
    if(gs){
      REQ_STATE.sess = gs;
      if(/^\/api\/students\/\d+$/.test(p)) enumStage(enumTouch(gs), gs); /* §5.7: هر خوانشِ این مسیر می‌شمارد */
      const dm = enumDelay(gs);
      if(dm) await new Promise(r => setTimeout(r, dm));
    }
  }
  try{
    if(p === '/api/health' && (req.method === 'GET' || req.method === 'HEAD')){
      /* P0-13: ریدی = در تولید، کشِ توزیع‌شده زنده است؛ وگرنه 503. */
      const rdy = redis.ready();
      return sendJson(res, rdy ? 200 : 503, { ok: rdy, name: 'payesh-server', phase: 1, time: new Date().toISOString(), version: '1.0', pid: process.pid, cache: redis.isRedis() ? 'redis' : (rdy ? 'memory-dev' : 'unavailable') });
    }
    if(p === '/api/auth/send-code' && req.method === 'POST') return await auth.apiSendCode(req, res, await readBody(req, 4 * 1024));
    if(p === '/api/auth/login'     && req.method === 'POST') return await auth.apiLogin(req, res, await readBody(req, 4 * 1024));
    if(p === '/api/auth/me'        && req.method === 'GET')  return await auth.apiMe(req, res);
    if(p === '/api/auth/logout'    && req.method === 'POST') return await auth.apiLogout(req, res);
    if(p === '/api/auth/delete-account' && req.method === 'POST') return await auth.apiDeleteAccount(req, res);
    if(p === '/api/sync'           && req.method === 'POST') return await sync.apiSync(req, res, await readBody(req, 1024 * 1024));
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

    /* ── Phase 3: RESTful Resource Endpoints (/api/v1/*) ────────── */
    if(p.indexOf('/api/v1/') === 0){
      const s = await auth.sessionFrom(req);
      if(!s) return sendJson(res, 401, { ok: false, code: 'unauthorized', message: 'احراز هویت الزامی است' });
      req.user = s;
      req.session = s;

      // /api/v1/bootstrap
      if(p === '/api/v1/bootstrap' && req.method === 'GET'){
        const r = await bootstrapRoute.getBootstrapData(req);
        return sendJson(res, r.status, r.body);
      }

      // /api/v1/pull (A01: General Pull & Delta Sync)
      if(p === '/api/v1/pull' && req.method === 'GET'){
        return await pullRoute.apiPull(req, res);
      }

      // /api/v1/students & /api/v1/students/:id
      if(p === '/api/v1/students' && req.method === 'GET'){
        const r = studentRoutes.getStudentsList(req, url.searchParams);
        return sendJson(res, 200, r);
      }
      if(p === '/api/v1/students' && req.method === 'POST'){
        const r = await studentRoutes.createStudent(req, await readBody(req, 64 * 1024));
        return sendJson(res, r.status, r.body);
      }
      if(/^\/api\/v1\/students\/\d+$/.test(p)){
        const id = p.split('/')[4];
        if(req.method === 'GET'){
          const r = studentRoutes.getStudentById(req, id);
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
        const r = classRoutes.getClassesList(req, url.searchParams);
        return sendJson(res, 200, r);
      }
      if(p === '/api/v1/classes' && req.method === 'POST'){
        const r = await classRoutes.createClass(req, await readBody(req, 64 * 1024));
        return sendJson(res, r.status, r.body);
      }
      if(/^\/api\/v1\/classes\/\d+$/.test(p)){
        const id = p.split('/')[4];
        if(req.method === 'GET'){
          const r = classRoutes.getClassById(req, id);
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
        const r = attendanceRoutes.getAttendanceList(req, url.searchParams);
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
        const r = gradeRoutes.getGradesList(req, url.searchParams);
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
        const r = userRoutes.getUsersList(req, url.searchParams);
        return sendJson(res, 200, r);
      }
      if(p === '/api/v1/users' && req.method === 'POST'){
        const r = await userRoutes.createUser(req, await readBody(req, 64 * 1024));
        return sendJson(res, r.status, r.body);
      }
      if(/^\/api\/v1\/users\/\d+$/.test(p)){
        const id = p.split('/')[4];
        if(req.method === 'GET'){
          const r = userRoutes.getUserById(req, id);
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
    return serveStatic(res, p, nonce);
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
    console.error('TLS file missing: ' + (TLS_CERT + ' / ' + TLS_KEY));
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
  server = https.createServer({ key: keyPem, cert: certPem }, onRequest);
}else{
  server = http.createServer(onRequest);
}
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

/* ── بکاپِ دوره‌ایِ خودکار (باقی‌ماندهٔ 2.4) — درون‌پروسه ─────────
   PAYESH_BACKUP_EVERY_HOURS (production، مثلاً 24) یا
   PAYESH_BACKUP_EVERY_MS (تست). بی‌ارزش/صفر = خاموش. */
const BACKUP_EVERY_MS = (Number(process.env.PAYESH_BACKUP_EVERY_MS) > 0)
  ? Number(process.env.PAYESH_BACKUP_EVERY_MS)
  : (Number(process.env.PAYESH_BACKUP_EVERY_HOURS) > 0
      ? Number(process.env.PAYESH_BACKUP_EVERY_HOURS) * 3600000 : 0);

if(require.main === module){
  if(BACKUP_EVERY_MS > 0) admin.startAutoBackup(BACKUP_EVERY_MS);
  server.listen(PORT, HOST, () => {
    const proto = (TLS_CERT && TLS_KEY) ? 'https' : 'http';
    console.log('payesh-server (phase 1' + (TLS_CERT ? ' + TLS' : '') + ') on ' + proto + '://' + HOST + ':' + PORT);
    console.log('  static : ' + path.join(ROOT, 'index.html'));
    console.log('  api    : /api/health /api/auth/* /api/sync /api/sync/conflicts /api/sync/resolve-conflict /api/students/:id /api/bell/now /api/public-report /api/admin/{backup,restore} /api/sms/send');
    console.log('  store  : ' + STORE_FILE + '  (' + (store.users || []).length + ' users)');
    if(BACKUP_EVERY_MS > 0){
      console.log('  backup : automatic every ' + Math.round(BACKUP_EVERY_MS / 60000) + ' min (retention ' + 10 + ')');
    }
  });
}
module.exports = { server, store, audit, isHttps, persistStore, db, redis, cache };
