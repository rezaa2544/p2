#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   گاردِ POC و CDN (ورکر + مانیفست + Ingress + سند)
   C1: ورکر قانونِ immutable یک‌ساله برایِ استاتیک دارد
   C2: ورکر ‎/api/*‎ را passthrough می‌کند (هرگز کش)
   C3: مانیفست با index.html می‌خواند (‏join‏ تکه‌ها = ‏sha256‏ + مُهر)
   C4: Ingress مبدأ درست است
   C5: سند هر ۴ فایل را می‌شناسد
   اجرا:  node tests/cdn.js
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const worker = fs.readFileSync(path.join(ROOT, 'cloudflare', 'worker.js'), 'utf8');
const manifestRaw = fs.readFileSync(path.join(ROOT, 'cdn-manifest.json'), 'utf8');
const ingress = fs.readFileSync(path.join(ROOT, 'k8s', 'ingress-cdn.yaml'), 'utf8');
const doc = fs.readFileSync(path.join(ROOT, 'docs', 'CDN_INTEGRATION_SETUP.md'), 'utf8');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

let pass = 0;
function chk(name, cond, extra){
  if(cond){ pass++; console.log('  ✅ ' + name); }
  else console.log('  ❌ ' + name + (extra ? ' — ' + extra : ''));
}
function has(t, s){ return t.indexOf(s) > -1; }

console.log('\n🔍 CDN Tests (worker + manifest + ingress)');
chk('C1: ورکر immutable یک‌ساله برایِ استاتیک',
  has(worker, 'max-age=31536000') && has(worker, 'immutable') && has(worker, 'woff2'));
chk('C2: ورکر ‎/api/*‎ را passthrough می‌کند',
  has(worker, "startsWith('/api/')") && has(worker, 'return fetch(request)'));
let manifestOk = false, manifestWhy = 'parse';
try {
  const m = JSON.parse(manifestRaw);
  const joined = (m.sha256_index_html || []).join('');
  const sha = crypto.createHash('sha256').update(html).digest('hex');
  const seal = crypto.createHash('sha1').update(html).digest('hex').slice(0, 12);
  manifestOk = joined === sha && m.seal12 === seal && m.version === 1;
  manifestWhy = manifestOk ? '' : 'hash/seal mismatch';
} catch(e){ manifestWhy = String(e.message).slice(0, 80); }
chk('C3: مانیفست با index.html می‌خواند', manifestOk, manifestWhy);
chk('C4: Ingress مبدأ (‏Ingress/payesh-api/3000‏)',
  has(ingress, 'kind: Ingress') && has(ingress, 'payesh-api') && has(ingress, '3000'));
chk('C5: سند هر ۴ فایل را می‌شناسد',
  has(doc, 'cloudflare/worker.js') && has(doc, 'ingress-cdn.yaml') &&
  has(doc, 'cdn-manifest.json') && has(doc, 'build.js'));

const N = 5;
console.log(pass === N ? `\nCDN Tests: ${N}/${N} passed\n` : `\nCDN Tests: ${pass}/${N} FAILED\n`);
process.exit(pass === N ? 0 : 1);
