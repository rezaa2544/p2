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
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const { createAuth } = require('./auth');
const { createSync, attach: syncAttach } = require('./sync');
const { createIdor } = require('./idor');
const { createBell } = require('./bell');
const { createAdmin } = require('./admin');

const ROOT = path.join(__dirname, '..');
const DATA_DIR = path.join(__dirname, 'data');
const STORE_FILE = process.env.PAYESH_STORE || path.join(DATA_DIR, 'payesh.json');
const AUDIT_FILE = process.env.PAYESH_AUDIT || path.join(DATA_DIR, 'audit.log');
const KEY_FILE   = process.env.PAYESH_KEY   || path.join(DATA_DIR, 'jwt.key');

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';
const SESSION_NAME = 'payesh_session';
const SESSION_TTL_S = 28800;           /* 8h — one school day (contract §2.1) */
const CODE_TTL_MS = 5 * 60 * 1000;     /* 5 minutes */
const MAX_BATCH = 500;                 /* contract §3.3 */
const AT_DRIFT_MS = 24 * 3600 * 1000;  /* §3.3: do not reject, log */
const ENUM_WINDOW_MS = 60 * 1000;
const ENUM_THRESHOLD = 100;            /* §5.7 — >100 reads / minute */
const ENUM_SLOW_MS = 50;               /* per 10 requests above threshold */
const DEMO_CODE_ECHO = (process.env.PAYESH_DEMO_CODE || '1') === '1';

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

let dirty = false;
function markDirty(){ dirty = true; }
function persistStore(){
  if(!dirty) return;
  dirty = false;
  try{
    const tmp = STORE_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(store), 'utf8');
    fs.renameSync(tmp, STORE_FILE);
  }catch(e){ /* store file may be gone (tests) — never crash on exit */ }
}
setInterval(persistStore, 2000).unref();
process.on('exit', persistStore);

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

/* ── audit log (append-only, sanitized: no phone / nid / password) ─── */
function audit(type, detail){
  try{
    fs.appendFileSync(AUDIT_FILE, JSON.stringify({ ts: new Date().toISOString(), type, detail: detail || {} }) + '\n', 'utf8');
  }catch(e){ /* never break the request path on logging */ }
}

/* ── shared helpers ────────────────────────────────────────────────── */
function isHttps(req){
  if(req && req.socket && req.socket.encrypted) return true;
  const xfp = (req && req.headers['x-forwarded-proto']) || '';
  if(xfp === 'https') return true;
  return process.env.PAYESH_HTTPS === '1';
}
function sendJson(res, status, obj){
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
}
function readBody(req, limit){
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', c => {
      size += c.length;
      if(size > (limit || 2 * 1024 * 1024)){ reject(new Error('too_large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
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
const auth = createAuth({ store, JWT_SECRET, SESSION_NAME, SESSION_TTL_S, CODE_TTL_MS, DEMO_CODE_ECHO, audit, isHttps, markDirty });
const sync = createSync({ store, MAX_BATCH, AT_DRIFT_MS, audit, sessionFrom: auth.sessionFrom, sendJson, markDirty });
const idor = createIdor({ store, ENUM_WINDOW_MS, ENUM_THRESHOLD, ENUM_SLOW_MS, audit, sessionFrom: auth.sessionFrom, sendJson });
const bell = createBell({ store, audit, sessionFrom: auth.sessionFrom, sendJson });
const admin = createAdmin({ store, audit, sessionFrom: auth.sessionFrom, sendJson, markDirty, dataDir: path.dirname(STORE_FILE) });

/* ── static ────────────────────────────────────────────────────────── */
const STATIC = {
  '/':              { file: 'index.html',      type: 'text/html; charset=utf-8' },
  '/index.html':    { file: 'index.html',      type: 'text/html; charset=utf-8' },
  '/USER_GUIDE.html': { file: 'USER_GUIDE.html', type: 'text/html; charset=utf-8' },
  '/guide.html':    { file: 'USER_GUIDE.html', type: 'text/html; charset=utf-8' },
  '/account-deletion.html': { file: 'account-deletion.html', type: 'text/html; charset=utf-8' },
  '/account-deletion':    { file: 'account-deletion.html', type: 'text/html; charset=utf-8' },
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
  try{
    if(p === '/api/health' && (req.method === 'GET' || req.method === 'HEAD'))
      return sendJson(res, 200, { ok: true, name: 'payesh-server', phase: 1, time: new Date().toISOString(), version: '1.0', pid: process.pid });
    if(p === '/api/auth/send-code' && req.method === 'POST') return await auth.apiSendCode(req, res, await readBody(req));
    if(p === '/api/auth/login'     && req.method === 'POST') return await auth.apiLogin(req, res, await readBody(req));
    if(p === '/api/auth/me'        && req.method === 'GET')  return await auth.apiMe(req, res);
    if(p === '/api/auth/logout'    && req.method === 'POST') return await auth.apiLogout(req, res);
    if(p === '/api/auth/delete-account' && req.method === 'POST') return await auth.apiDeleteAccount(req, res);
    if(p === '/api/sync'           && req.method === 'POST') return await sync.apiSync(req, res, await readBody(req));
    if(/^\/api\/students\/\d+$/.test(p) && req.method === 'GET') return await idor.apiStudent(req, res, p.split('/')[3]);
    if(p === '/api/bell/now' && req.method === 'GET') return bell.apiBellNow(req, res);
    if(p === '/api/admin/backup'  && req.method === 'POST') return await admin.apiBackup(req, res);
    if(p === '/api/admin/restore' && req.method === 'POST') return await admin.apiRestore(req, res, await readBody(req));
    if(p.indexOf('/api/') === 0) return sendJson(res, 404, { ok: false, code: 'not_found' });
    return serveStatic(res, p, nonce);
  }catch(err){
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
  const https = require('https');
  server = https.createServer({
    key:  fs.readFileSync(TLS_KEY),
    cert: fs.readFileSync(TLS_CERT)
  }, onRequest);
}else{
  server = http.createServer(onRequest);
}

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
    console.log('  api    : /api/health /api/auth/* /api/sync /api/students/:id /api/bell/now /api/admin/{backup,restore}');
    console.log('  store  : ' + STORE_FILE + '  (' + (store.users || []).length + ' users)');
    if(BACKUP_EVERY_MS > 0){
      console.log('  backup : automatic every ' + Math.round(BACKUP_EVERY_MS / 60000) + ' min (retention ' + 10 + ')');
    }
  });
}
module.exports = { server, store, audit, isHttps, persistStore };
