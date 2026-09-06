/* ═══════════════════════════════════════════════════════════════════
   server/auth.js — identity: phone + code + national-id → JWT cookie
   Contract: docs/SERVER_SECURITY_CONTRACT.md
     §2   — session in HttpOnly cookie, role from the token only
     §2.2 — HS256 hard-coded, exp + jti revocation
     §5.5 — progressive delay (no hard lockout), equal-time answers
   Runtime deps: Node stdlib only.
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
const crypto = require('crypto');

/* ctx: { store, JWT_SECRET, SESSION_NAME, SESSION_TTL_S, CODE_TTL_MS,
          DEMO_CODE_ECHO, audit, isHttps(req) } */
function createAuth(ctx){
  const store = ctx.store;
  const JWT_SECRET = ctx.JWT_SECRET;
  const SESSION_NAME = ctx.SESSION_NAME;
  const SESSION_TTL_S = ctx.SESSION_TTL_S;
  const CODE_TTL_MS = ctx.CODE_TTL_MS;
  const DEMO_CODE_ECHO = ctx.DEMO_CODE_ECHO;
  const audit = ctx.audit;
  const isHttps = ctx.isHttps;

  /* ── JWT (hand-rolled HS256; alg is hard-coded, contract §2.2) ──── */
  const b64u = (buf) => Buffer.from(buf).toString('base64url');
  function jwtSign(payload){
    const header = b64u(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
    const body   = b64u(JSON.stringify(payload));
    const sig    = b64u(crypto.createHmac('sha256', JWT_SECRET).update(header + '.' + body).digest());
    return header + '.' + body + '.' + sig;
  }
  function jwtVerify(token){
    if(typeof token !== 'string') return { err: 'no_token' };
    const parts = token.split('.');
    if(parts.length !== 3) return { err: 'malformed' };
    let header, payload;
    try{
      header  = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
      payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    }catch(e){ return { err: 'malformed' }; }
    /* NEVER trust the alg field — hard-coded HS256 (kills alg:none) */
    if(!header || header.alg !== 'HS256' || header.typ !== 'JWT') return { err: 'bad_alg' };
    const expect = b64u(crypto.createHmac('sha256', JWT_SECRET).update(parts[0] + '.' + parts[1]).digest());
    const a = Buffer.from(parts[2]); const b = Buffer.from(expect);
    if(a.length !== b.length || !crypto.timingSafeEqual(a, b)) return { err: 'bad_sig' };
    if(typeof payload.exp !== 'number' || payload.exp * 1000 < Date.now()) return { err: 'expired' };
    if(typeof payload.jti !== 'string' || store.__revoked_jti[payload.jti]) return { err: 'revoked' };
    return { payload };
  }

  /* ── sessions ──────────────────────────────────────────────────── */
  function parseCookies(req){
    const out = {};
    const h = req.headers.cookie;
    if(!h) return out;
    h.split(';').forEach(p => {
      const i = p.indexOf('=');
      if(i > -1) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
    });
    return out;
  }
  function sessionFrom(req){
    const tok = parseCookies(req)[SESSION_NAME];
    if(!tok) return null;
    const v = jwtVerify(tok);
    if(v.err) return null;
    const p = v.payload;
    const user = (store.users || []).find(u => u.id === p.sub);
    if(!user || !user.active) return null;
    return Object.assign({ jti: p.jti, token: tok }, user);
  }
  function setSessionCookie(req, res, user){
    const jti = 'jt_' + crypto.randomBytes(12).toString('hex');
    const now = Math.floor(Date.now() / 1000);
    const tok = jwtSign({ sub: user.id, role: user.role, school_id: user.school_id || null, iat: now, exp: now + SESSION_TTL_S, jti });
    const secure = isHttps(req) ? 'Secure; ' : '';
    res.setHeader('Set-Cookie', SESSION_NAME + '=' + tok + '; ' + secure + 'HttpOnly; SameSite=Lax; Path=/; Max-Age=' + SESSION_TTL_S);
  }

  /* equal-time code check (contract §5.5.3: no timing oracle) */
  function checkCodeSafe(have, want){
    const a = Buffer.from(String(have || '').padEnd(12), 'utf8');
    const b = Buffer.from(String(want || '').padEnd(12), 'utf8');
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  }
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  /* ── endpoints ─────────────────────────────────────────────────── */
  async function apiSendCode(req, res, body){
    const phone = String((body && body.phone) || '').replace(/[\s\-()]/g, '');
    if(!/^\+?\d{10,15}$/.test(phone)) return sendJson(res, 400, { ok: false, code: 'bad_phone' });
    const user = (store.users || []).find(u => String(u.phone || '').replace(/[\s\-()]/g, '').slice(-10) === phone.slice(-10));
    /* equal-time probe whether or not the phone is known */
    checkCodeSafe('probe', String((store.__auth.codes[phone] || {}).code || '0000'));
    if(!user) return sendJson(res, 404, { ok: false, code: 'no_account' });

    /* rate limit: 5 codes / phone / 10 min — throttle, never hard lock */
    const now = Date.now();
    const rl = (store.__auth.code_rate[phone] = store.__auth.code_rate[phone] || []);
    while(rl.length && rl[0] < now - 10 * 60 * 1000) rl.shift();
    if(rl.length >= 5) return sendJson(res, 429, { ok: false, code: 'rate_limited' });
    rl.push(now);

    const code = String(1000 + Math.floor(Math.random() * 9000));
    store.__auth.codes[phone] = { code, at: now, user_id: user.id, tries: 0 };
    audit('send_code', { user_id: user.id, role: user.role });
    const out = { ok: true, code: 'sent' };
    if(DEMO_CODE_ECHO) out.demo_code = code; /* dev/preview — a real gateway never echoes */
    sendJson(res, 200, out);
  }

  async function apiLogin(req, res, body){
    const phone = String((body && body.phone) || '').replace(/[\s\-()]/g, '');
    const code  = String((body && body.code) || '').trim();
    const nid   = String((body && body.national_id) || '').trim();
    if(!phone || !code || !nid) return sendJson(res, 400, { ok: false, code: 'missing_fields' });

    const user = (store.users || []).find(u => String(u.phone || '').replace(/[\s\-()]/g, '').slice(-10) === phone.slice(-10));

    /* progressive delay after consecutive failures — an attacker can
       NOT weaponize the lock (contract §5.5.2) */
    const fl = (store.__auth.login_fail[phone] = store.__auth.login_fail[phone] || { n: 0, until: 0 });
    if(fl.until > Date.now()) await sleep(fl.until - Date.now());

    const fail = (msg) => {
      fl.n += 1;
      fl.until = Date.now() + Math.min(1000 * Math.pow(2, Math.max(0, fl.n - 3)), 30000);
      audit('login_fail', { reason: msg, user_id: user ? user.id : null });
      return sendJson(res, 401, { ok: false, code: msg });
    };

    /* 1) the code — equal timing whether or not the phone is known */
    const rec = store.__auth.codes[phone];
    const okCode = rec && (Date.now() - rec.at < CODE_TTL_MS) && (rec.tries || 0) < 5 && checkCodeSafe(rec.code, code);
    if(!okCode){ checkCodeSafe('dummy', 'dummy'); return fail('bad_code'); }
    rec.tries = (rec.tries || 0) + 1;
    if(!user || rec.user_id !== user.id) return fail('bad_code');

    /* 2) identity match — the national id must belong to THIS phone */
    if(String(user.national_id) !== nid) return fail('nid_mismatch');
    if(!user.active) return fail('inactive');
    const school = (store.schools || []).find(s => s.id === user.school_id);
    if(school && !school.active) return fail('school_inactive');

    delete store.__auth.codes[phone];
    fl.n = 0; fl.until = 0;
    audit('login_ok', { user_id: user.id, role: user.role });
    setSessionCookie(req, res, user);
    /* never echo nid / full phone back (contract §4) */
    sendJson(res, 200, { ok: true, user: { id: user.id, full_name: user.full_name, role: user.role, school_id: user.school_id || null, phone_masked: phone.slice(0, 4) + '****' + phone.slice(-2) } });
  }

  async function apiMe(req, res){
    const s = sessionFrom(req);
    if(!s) return sendJson(res, 401, { ok: false, code: 'no_session' });
    sendJson(res, 200, { ok: true, user: { id: s.id, full_name: s.full_name, role: s.role, school_id: s.school_id || null } });
  }

  async function apiLogout(req, res){
    const tok = parseCookies(req)[SESSION_NAME];
    if(tok){
      const v = jwtVerify(tok);
      if(!v.err){ store.__revoked_jti[v.payload.jti] = Date.now(); audit('logout', { user_id: v.payload.sub }); }
    }
    res.setHeader('Set-Cookie', SESSION_NAME + '=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');
    sendJson(res, 200, { ok: true });
  }

  /* حذف حساب (ملاک حذفِ حسابِ گوگل‌پلی — قفل ۹.۵):
     حذفِ کاملِ داده‌های شخصیِ کاربر از store — هرگز «غیرفعال».
     داده‌های نهادی (حضور/نمرات/انضباط) متعلق به مدرسه/دانش‌آموز است و می‌ماند.
     نشست‌های باز خودبه‌خود باطل می‌شوند: sessionFrom کاربر را پیدا نمی‌کند.
     آدیت فقط user_id/role — هرگز phone/nid (قفلِ قرارداد). */
  async function apiDeleteAccount(req, res){
    const s = sessionFrom(req);
    if(!s) return sendJson(res, 401, { ok: false, code: 'no_session' });
    const uid = s.id;
    const purged = {};
    function purge(coll, pred){
      const rows = store[coll];
      if(!Array.isArray(rows)) return;
      const keep = rows.filter(r => !pred(r));
      if(keep.length !== rows.length){ purged[coll] = rows.length - keep.length; store[coll] = keep; }
    }
    purge('parent_links', r => Number(r.parent_id) === uid);
    purge('parent_verifications', r => Number(r.parent_id) === uid);
    purge('parent_subscriptions', r => Number(r.user_id) === uid);
    purge('messages', r => Number(r.from_id) === uid);
    purge('users', r => Number(r.id) === uid);
    audit('account_deleted', { user_id: uid, role: s.role, purged: purged });
    if(ctx.markDirty) ctx.markDirty();
    /* نشستِ فعلی هم همین حالا می‌میرد (cookie پاک) */
    res.setHeader('Set-Cookie', SESSION_NAME + '=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');
    sendJson(res, 200, { ok: true, deleted: true });
  }

  function sendJson(res, status, obj){
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(obj));
  }

  return { jwtSign, jwtVerify, sessionFrom, setSessionCookie, checkCodeSafe, apiSendCode, apiLogin, apiMe, apiLogout, apiDeleteAccount };
}
module.exports = { createAuth };
