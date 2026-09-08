/* ═══════════════════════════════════════════════════════════════════
   server/middleware/auth.js — JWT Authentication Middleware
   -------------------------------------------------------------------
   Phase 3: Backend Production API
   - Extracts session from HttpOnly Cookie (payesh_session) or
     Authorization: Bearer <token> header.
   - Validates signature, expiration, audience, issuer, and revocation.
   - Attaches authenticated user object (req.user / req.session).
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

/**
 * Creates JWT authentication middleware
 * @param {Object} auth - auth module instance or session provider
 */
function createAuthMiddleware(auth) {
  return function authMiddleware(req, res, next) {
    let session = null;
    
    if (auth && typeof auth.sessionFrom === 'function') {
      session = auth.sessionFrom(req);
    }

    // Support Authorization: Bearer <token> header as fallback
    if (!session && req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
      const token = req.headers.authorization.slice(7).trim();
      if (auth && typeof auth.jwtVerify === 'function') {
        const v = auth.jwtVerify(token);
        if (v && v.payload) {
          const store = auth.getStore ? auth.getStore() : (auth.store || {});
          const user = (store.users || []).find(u => u.id === v.payload.sub);
          if (user && user.active) {
            session = Object.assign({ jti: v.payload.jti, token }, user);
          }
        }
      }
    }

    if (!session) {
      res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: false, code: 'unauthorized', message: 'احراز هویت انجام نشده است' }));
      return;
    }

    req.user = session;
    req.session = session;
    if (next) next();
  };
}

module.exports = { createAuthMiddleware };
