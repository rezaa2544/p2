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
const { validate } = require('./validate');

/* نرمال‌سازیِ سطحی برایِ اعتبارسنجی: trimِ رشته‌ها (کلاینت هم همین را
   می‌فرستد) — کلیدها دست‌نخورده می‌مانند تا unknown_field سنجیده شود. */
function shallowTrim(o){
  if(!o || typeof o !== 'object' || Array.isArray(o)) return o;
  const c = {};
  for(const k of Object.keys(o)) c[k] = (typeof o[k] === 'string') ? o[k].trim() : o[k];
  return c;
}

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
  const otp = ctx.otp; /* R101: otp.json (distributed) */

  /* ── JWT (hand-rolled HS256; alg is hard-coded, contract §2.2) ────
     R96 P0-3: aud/iss/iat validated; key >= 256 bit enforced at boot;
     PAYESH_JWT_SECRET_PREV allows rolling rotation (old tokens stay
     valid until they expire naturally). */
  const b64u = (buf) => Buffer.from(buf).toString('base64url');
  const JWT_PREV_SECRET = ctx.JWT_PREV_SECRET || null;
  const ISS = 'payesh';
  const AUD = 'payesh-web';
  function sigOf(secret, h, b){
    return crypto.createHmac('sha256', secret).update(h + '.' + b).digest();
  }
  function jwtSign(payload){
    const header = b64u(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
    const body   = b64u(JSON.stringify(Object.assign({ iss: ISS, aud: AUD }, payload)));
    const sig    = b64u(sigOf(JWT_SECRET, header, body));
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
    /* sig: current key first, then previous (rotation) — constant-time */
    const got = Buffer.from(parts[2]);
    let sigOk = false;
    const trySig = (secret) => {
      /* مقایسه با همان شکلِ base64url (مثلِ کدِ پیشین) */
      const exp = Buffer.from(b64u(sigOf(secret, parts[0], parts[1])));
      if(exp.length === got.length && crypto.timingSafeEqual(exp, got)) sigOk = true;
    };
    trySig(JWT_SECRET);
    if(!sigOk && JWT_PREV_SECRET) trySig(JWT_PREV_SECRET);
    if(!sigOk) return { err: 'bad_sig' };
    if(typeof payload.exp !== 'number' || payload.exp * 1000 < Date.now()) return { err: 'expired' };
    /* R96: issuer / audience must match exactly (no other service token
       is accepted by this server) */
    if(payload.iss !== ISS) return { err: 'bad_iss' };
    if(payload.aud !== AUD) return { err: 'bad_aud' };
    /* R96: iat freshness — a token older than one TTL cannot be replayed
       (defense in depth alongside exp + jti revocation) */
    if(typeof payload.iat !== 'number' || payload.iat * 1000 > Date.now() + 5 * 60 * 1000
       || Date.now() - payload.iat * 1000 > SESSION_TTL_S * 1000) return { err: 'bad_iat' };
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

  /* ── R96 P0-4 — OTP: CSPRNG + hash-only storage + distributed-style
     limits (phone + IP + daily cap; persisted in the shared store file) ──
     R101: state moved to server/data/otp.json (server/otp-store.js) —
     one shared file across instances; 6-digit codes; 15-min windows. */
  /* سقف‌های پیش‌فرضِ سخت برایِ تولید؛ env فقط برایِ آزمایش (test-harness)
     موجود است — در production هرگز تغییر نده. */
  const _lim = (v, d) => { const n = parseInt(v, 10); return Number.isFinite(n) && n >= 0 ? n : d; };
  const WINDOW_MS = _lim(process.env.PAYESH_SMS_WINDOW_S, 900) * 1000; /* sliding window: sends + logins */
  const CODE_COOLDOWN_MS = _lim(process.env.PAYESH_SMS_COOLDOWN_S, 60) * 1000;
  const CODE_DAILY_MAX = _lim(process.env.PAYESH_SMS_DAILY_CAP, 20);
  const IP_SEND_MAX = _lim(process.env.PAYESH_SMS_IP_LIMIT, 10);   /* sends / window per IP */
  const PHONE_SEND_MAX = _lim(process.env.PAYESH_SMS_PHONE_LIMIT, 5); /* sends / window per phone */
  const IP_LOGIN_MAX = _lim(process.env.PAYESH_LOGIN_IP_LIMIT, 10); /* logins / window per IP */
  const LOGIN_TRIES_MAX = _lim(process.env.PAYESH_LOGIN_TRIES, 5);  /* wrong codes before code dies */
  function clientIp(req){
    const xf = req.headers && req.headers['x-forwarded-for'];
    if(typeof xf === 'string' && xf) return xf.split(',')[0].trim().slice(0, 64);
    return (req.socket && req.socket.remoteAddress) || 'local';
  }
  function hashCode(code, phone){
    return crypto.createHash('sha256').update(code + '|' + phone).digest('hex');
  }
  function codeRecOk(rec, code, phone, now){
    if(!rec || now - rec.at >= CODE_TTL_MS) return false;
    if((rec.tries || 0) >= LOGIN_TRIES_MAX) return false;
    const a = Buffer.from(hashCode(code, phone));
    const b = Buffer.from(rec.h || '0000000000000000000000000000000000000000000000000000000000000000');
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  }
  function pruneList(list, windowMs, now){ while(list.length && list[0] < now - windowMs) list.shift(); }

  /* ── endpoints ─────────────────────────────────────────────────── */
  async function apiSendCode(req, res, body){
    /* لایهٔ مقدار (validate.js): فقط {phone} — کلیدِ ناشناخته = ردِّ 400.
       قراردادِ فرمت (§2) و codeها دست‌نخورده‌اند. */
    const v = validate(shallowTrim(body), { fields: { phone: { type: 'authphone' } }, required: ['phone'] });
    if(!v.ok){
      if(v.kind === 'unknown_field') return sendJson(res, 400, { ok: false, code: 'unknown_field', field: v.field });
      return sendJson(res, 400, { ok: false, code: 'bad_phone' });
    }
    const phone = String(body.phone).replace(/[\s\-()]/g, '');
    /* R96: EVERY limit BEFORE the existence check — probing unknown
       phones must cost the same as known ones (equal-shape responses). */
    const now = Date.now();
    const ip = clientIp(req);
    otp.reloadIfChanged(); /* R101: sibling instances' writes (shared otp.json) */
    const cd = otp.data.cd;
    if(now - (cd[phone] || 0) < CODE_COOLDOWN_MS) return sendJson(res, 429, { ok: false, code: 'rate_limited' });
    const daily = otp.data.daily;
    const day = new Date(now).toISOString().slice(0, 10);
    if(daily[phone] && daily[phone].day === day && daily[phone].n >= CODE_DAILY_MAX)
      return sendJson(res, 429, { ok: false, code: 'rate_limited' });
    const rli = otp.data.rate_ip;
    pruneList(rli[ip] = rli[ip] || [], WINDOW_MS, now);
    if(rli[ip].length >= IP_SEND_MAX) return sendJson(res, 429, { ok: false, code: 'rate_limited' });
    const rl = (otp.data.rate[phone] = otp.data.rate[phone] || []);
    pruneList(rl, WINDOW_MS, now);
    if(rl.length >= PHONE_SEND_MAX) return sendJson(res, 429, { ok: false, code: 'rate_limited' });
    rl.push(now); rli[ip].push(now);
    cd[phone] = now;
    if(!daily[phone] || daily[phone].day !== day) daily[phone] = { day, n: 0 };
    daily[phone].n += 1;
    otp.save(); /* R101: crash-safe + visible to sibling instances */

    const user = (store.users || []).find(u => String(u.phone || '').replace(/[\s\-()]/g, '').slice(-10) === phone.slice(-10));
    /* S-73-2: ONE response shape whether or not the phone is known —
       a 404 here would let an attacker enumerate registered phones.
       Equal-time probe (no timing oracle either way). */
    checkCodeSafe('probe', String((otp.data.codes[phone] || {}).h || '000000'));
    if(!user) return sendJson(res, 200, { ok: true, code: 'sent' });

    /* R96: CSPRNG code; ONLY the hash is stored (plaintext never
       touches disk, audit or responses — demo echo is test-mode only).
       R101: 6 digits; stored in otp.json (distributed). */
    const code = String(crypto.randomInt(100000, 1000000));
    otp.data.codes[phone] = { h: hashCode(code, phone), at: now, user_id: user.id, tries: 0 };
    otp.save();
    audit('send_code', { user_id: user.id, role: user.role, school_id: user.school_id, ip, summary: 'ارسال کد ورود برای کاربر ' + user.id });
    const out = { ok: true, code: 'sent' };
    if(DEMO_CODE_ECHO) out.demo_code = code; /* dev/preview — a real gateway never echoes */
    sendJson(res, 200, out);
  }

  async function apiLogin(req, res, body){
    /* لایهٔ مقدار (validate.js): فقط {phone, code, national_id} — کلیدِ
       ناشناخته = ردِّ 400. فرمت‌ها و codeها عینِ رفتارِ قفل‌شده‌اند. */
    const v = validate(shallowTrim(body), { fields: {
      phone: { type: 'authphone' }, code: { type: 'code' }, national_id: { type: 'nid' }
    }, required: ['phone', 'code', 'national_id'] });
    if(!v.ok){
      if(v.kind === 'unknown_field') return sendJson(res, 400, { ok: false, code: 'unknown_field', field: v.field });
      return sendJson(res, 400, { ok: false, code: 'missing_fields' });
    }
    const phone = String(body.phone).replace(/[\s\-()]/g, '');
    const code  = String(body.code).trim();
    const nid   = String(body.national_id).trim();

    /* R96: IP-level login limit (brute-force across phones) — persisted,
       so it survives restarts and is shared across instances of one store. */
    const now = Date.now();
    const ip = clientIp(req);
    otp.reloadIfChanged();
    const lri = otp.data.login_rate_ip;
    pruneList(lri[ip] = lri[ip] || [], WINDOW_MS, now);
    if(lri[ip].length >= IP_LOGIN_MAX) return sendJson(res, 429, { ok: false, code: 'rate_limited' });
    lri[ip].push(now);
    otp.save();

    const user = (store.users || []).find(u => String(u.phone || '').replace(/[\s\-()]/g, '').slice(-10) === phone.slice(-10));

    /* progressive delay after consecutive failures — an attacker can
       NOT weaponize the lock (contract §5.5.2) */
    const fl = (otp.data.login_fail[phone] = otp.data.login_fail[phone] || { n: 0, until: 0 });
    if(fl.until > Date.now()) await sleep(fl.until - Date.now());

    const fail = (msg) => {
      fl.n += 1;
      fl.until = Date.now() + Math.min(1000 * Math.pow(2, Math.max(0, fl.n - 3)), 30000);
      audit('login_fail', { reason: msg, user_id: user ? user.id : null, role: user ? user.role : null, school_id: user ? user.school_id : null, ip, summary: 'ورود ناموفق: ' + msg });
      otp.save();
      return sendJson(res, 401, { ok: false, code: msg });
    };

    /* 1) the code — equal timing whether or not the phone is known.
       R96: hash-only compare (plaintext code is never stored). */
    const rec = otp.data.codes[phone];
    if(rec && (rec.tries || 0) >= LOGIN_TRIES_MAX) delete otp.data.codes[phone]; /* exhausted — force re-send */
    const okCode = codeRecOk(rec, code, phone, Date.now());
    if(!okCode){
      /* R96: تلاشِ نادرست هم شمارنده را بالا می‌برد — وگرنه کد
         هرگز «کِلی» نمی‌شد و brute-force فقط با سقفِ IP می‌خورد. */
      if(rec){
        rec.tries = (rec.tries || 0) + 1;
        if(rec.tries >= LOGIN_TRIES_MAX) delete otp.data.codes[phone];
      }
      checkCodeSafe('dummy', 'dummy');
      return fail('bad_code');
    }
    rec.tries = (rec.tries || 0) + 1;
    if(!user || rec.user_id !== user.id) return fail('bad_code');

    /* 2) identity match — the national id must belong to THIS phone.
       S-73-5: constant-time compare (no length/prefix timing oracle). */
    if(!checkCodeSafe(user.national_id, nid)) return fail('nid_mismatch');
    if(!user.active) return fail('inactive');
    const school = (store.schools || []).find(s => s.id === user.school_id);
    if(school && !school.active) return fail('school_inactive');

    delete otp.data.codes[phone];
    fl.n = 0; fl.until = 0;
    audit('login_ok', { user_id: user.id, role: user.role, school_id: user.school_id, ip, summary: 'ورود موفق: ' + user.id + ' (' + user.role + ')' });
    otp.save();
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
      if(!v.err){ store.__revoked_jti[v.payload.jti] = Date.now(); audit('logout', { user_id: v.payload.sub, role: v.payload.role, school_id: v.payload.school_id, ip: clientIp(req), summary: 'خروج کاربر: ' + v.payload.sub }); if(ctx.markDirty) ctx.markDirty(); }
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
    purge('parent_links', r => Number(r.parent_id) === uid || Number(r.student_id) === uid);
    purge('parent_verifications', r => Number(r.parent_id) === uid);
    purge('parent_subscriptions', r => Number(r.user_id) === uid);
    purge('messages', r => Number(r.from_id) === uid);
    purge('users', r => Number(r.id) === uid);
    audit('account_deleted', { user_id: uid, role: s.role, school_id: s.school_id, purged: purged, ip: clientIp(req), summary: 'حذف کامل حساب کاربری: ' + uid + ' (' + s.role + ')' });
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
