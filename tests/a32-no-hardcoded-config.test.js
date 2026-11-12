'use strict';
/* tests/a32-no-hardcoded-config.test.js — A-32 guard: no hardcoded endpoints
   or secrets in the source.

   Ground truth at the guard's introduction (verified live):
     - the only secret-shaped literals in server/src/scripts are comments
       describing what NOT to do (server/index.js `password: '123456'` note)
       and a sentinel (`otp-store.js` `token = 'no-lock'`);
     - the only external-URL literals are URL-parse BASE placeholders
       (`http://csrf.local`, `http://waf.local` — the `new URL(rel, base)`
       idiom, never fetched) and one DEMO seed row (`shad.ir` virtual class
       sample data, never fetched at runtime);
     - the JWT secret is env-only (the N-06 boot gate rejects a missing or
       low-entropy PAYESH_JWT_SECRET).

   This guard fails closed if any of that regresses:

     G1  no secret-shaped literals (password/secret/token/api_key with a
         ≥6-char literal value) outside the documented allowlist;
     G2  no external http(s) URLs in src/ except the demo-seed allowlist;
     G3  no JWT-secret fallback literal (the secret must come from env only).

   Run: node tests/a32-no-hardcoded-config.test.js */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) pass++; else fail++;
  console.log((ok ? '✅' : '❌') + ' ' + name + (detail ? ' — ' + detail : ''));
}

/* the documented, intentional occurrences (each with its reason) */
const SECRET_ALLOW = new Set([
  'tests' + path.sep + 'a32-no-hardcoded-config.test.js', // this guard cites the patterns
]);
const URL_ALLOW = new Set([
  'src' + path.sep + 'js' + path.sep + '50-vclass.js', // demo seed row (shad.ir sample data, never fetched)
  'server' + path.sep + 'csrf.js',   // URL-parse base placeholder 'http://csrf.local'
  'server' + path.sep + 'waf.js',    // URL-parse base placeholder 'http://waf.local'
]);

/* no /g flag: .test() must stay stateless (a global regex carries lastIndex
   and the second .test() on the comment-stripped line would miss the match) */
const SECRET_RE = /\b(password|passwd|secret|api_?key|auth_?token|access_?token)\b\s*[:=]\s*(['"])(?:(?!\2).){6,}\2/i;
/* w3.org/2000/svg = the SVG XML namespace identifier, never an endpoint */
const EXT_URL_RE = /https?:\/\/(?!localhost|127\.0\.0\.1|csrf\.local|waf\.local|www\.w3\.org)[a-z0-9-]+(\.[a-z0-9-]+)/i;
const JWT_FALLBACK_RE = /JWT_SECRET\s*(?:\?\?|\|\||[:=])\s*(['"])(?:(?!\1).){8,}\1/;

/* strip block comments + line comments so a documented anti-pattern is not
   mistaken for shipped code (the SECRET_RE is line-scoped for attribution,
   but the DECISION uses the comment-stripped text) */
function stripComments(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/^\s*\/\/.*$/gm, (m) => m.replace(/[^\n]/g, ' '));
}

function filesUnder(dir) {
  const out = [];
  (function walk(d) {
    let entries = [];
    try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch (e) { return; }
    for (const ent of entries) {
      const full = path.join(d, ent.name);
      if (ent.isDirectory()) {
        if (ent.name === 'node_modules' || ent.name === '.git') continue;
        walk(full);
      } else if (/\.(js|mjs|cjs)$/.test(ent.name) && !/\.test\.js$/.test(ent.name)) {
        out.push(full);
      }
    }
  })(dir);
  return out;
}

/* G1 — secret-shaped literals in server/ and scripts/ (src/ = client, no secrets expected at all) */
const secretHits = [];
for (const f of [...filesUnder(path.join(ROOT, 'server')), ...filesUnder(path.join(ROOT, 'scripts'))]) {
  const rel = path.relative(ROOT, f);
  if (SECRET_ALLOW.has(rel)) continue;
  const text = (() => { try { return fs.readFileSync(f, 'utf8'); } catch (e) { return ''; } })();
  const lines = text.split(/\r?\n/);
  const strippedLines = stripComments(text).split(/\r?\n/);
  lines.forEach((line, i) => {
    if (SECRET_RE.test(line) && SECRET_RE.test(strippedLines[i])) {
      secretHits.push(rel + ':' + (i + 1));
    }
  });
}
check('G1 no hardcoded secret literals in server/scripts', secretHits.length === 0, secretHits.slice(0, 4).join(', ') || 'clean');

/* G2 — external URLs in the client (offline-first boundary) */
const urlHits = [];
(function walkSrc(d) {
  let entries = [];
  try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch (e) { return; }
  for (const ent of entries) {
    const full = path.join(d, ent.name);
    if (ent.isDirectory()) { if (ent.name !== 'node_modules') walkSrc(full); continue; }
    if (!/\.js$/.test(ent.name) || /\.test\.js$/.test(ent.name)) continue;
    const rel = path.relative(ROOT, full);
    if (URL_ALLOW.has(rel)) continue;
    const text = (() => { try { return fs.readFileSync(full, 'utf8'); } catch (e) { return ''; } })();
    const stripped = stripComments(text).split(/\r?\n/);
    text.split(/\r?\n/).forEach((line, i) => {
      if (EXT_URL_RE.test(line) && EXT_URL_RE.test(stripped[i] || '')) {
        urlHits.push(rel + ':' + (i + 1));
      }
    });
  }
})(path.join(ROOT, 'src'));
check('G2 no external endpoint URLs in src/ outside the demo-seed allowlist', urlHits.length === 0, urlHits.slice(0, 4).join(', ') || 'clean');

/* G3 — no JWT-secret fallback literal anywhere in the server */
let jwtHit = false;
for (const f of filesUnder(path.join(ROOT, 'server'))) {
  const text = (() => { try { return fs.readFileSync(f, 'utf8'); } catch (e) { return ''; } })();
  if (JWT_FALLBACK_RE.test(text)) jwtHit = true;
}
check('G3 no JWT-secret fallback literal (env-only, N-06 gate owns it)', !jwtHit);

console.log('────────────────────────────────────────────');
console.log('a32-no-hardcoded-config: ' + pass + ' pass / ' + fail + ' fail');
console.log('CHECKS ' + (pass + fail) + ' FAIL ' + fail);
process.exit(fail ? 1 : 0);
