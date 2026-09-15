#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   server13 — fail-fastِ TLS در production (دور 85, P1-4)
   ───────────────────────────────────────────────────────────────────
   T1 production + self-signed (خروجِ tls-cert.js)  → exit(1) + پیامِ خطا
   T2 production + گواهیِ امضاشدهٔ CA (leaf)          → سرور بالا می‌آید
   T3 development (بدون PAYESH_ENV) + self-signed     → سرور بالا می‌آید
   T4 production + گواهیِ خراب                         → exit(1) + «cert unreadable»
   گواهی‌ها در همین تست با همان ابزارِ DERِ server/tls-cert.js
   ساخته می‌شوند (صفر وابستگی خارجی).
   اجرا: node tests/server13.js
   ═══════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const https = require('https');
const crypto = require('crypto');
const { spawn } = require('child_process');
const { makeSelfSigned, tlv, seq, derInt, derUtc, derUtf8, derBitString } = require('../server/tls-cert.js');

const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const errors = [];
function chk(name, cond, extra) {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; errors.push(name + (extra !== undefined ? ' — ' + String(extra).slice(0, 160) : '')); console.log('  ❌ ' + name + (extra !== undefined ? ' — ' + String(extra).slice(0, 160) : '')); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ── ساختِ گواهیِ leaf امضاشدهٔ CA (با ابزارِ DERِ خودِ پروژه) ────── */
function makeCaSignedLeaf(ca, leafCn) {
  const OID_CN = Buffer.from([0x55, 0x04, 0x03]);
  function name(cn) {
    const atav = seq(Buffer.concat([tlv(0x06, OID_CN), derUtf8(cn)]));
    return seq(tlv(0x31, atav));
  }
  function sigAlg() {
    const oid = Buffer.from([0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x0b]);
    return seq(Buffer.concat([tlv(0x06, oid), Buffer.from([0x05, 0x00])]));
  }
  const caKeyObj = crypto.createPrivateKey(ca.keyPem);
  const leafPair = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'der' },
    privateKeyEncoding: { type: 'pkcs1', format: 'pem' }
  });
  const nb = new Date(Date.now() - 86400000), na = new Date(Date.now() + 86400000 * 900);
  const serial = crypto.randomBytes(15); serial[0] &= 0x7f;
  const tbs = seq(Buffer.concat([
    tlv(0xa0, derInt(Buffer.from([2]))),
    derInt(serial),
    sigAlg(),
    name('Payesh Test CA'),
    seq(Buffer.concat([derUtc(nb), derUtc(na)])),
    name(leafCn),
    leafPair.publicKey
  ]));
  const signature = crypto.createSign('RSA-SHA256').update(tbs).sign(caKeyObj);
  const leafDer = seq(Buffer.concat([tbs, sigAlg(), derBitString(signature)]));
  const pem = '-----BEGIN CERTIFICATE-----\n' + leafDer.toString('base64').match(/.{1,64}/g).join('\n') + '\n-----END CERTIFICATE-----\n';
  return { certPem: pem, keyPem: leafPair.privateKey };
}

function httpGet(port, p, useTls) {
  const mod = useTls ? https : http;
  return new Promise((resolve) => {
    const opts = { hostname: '127.0.0.1', port, path: p, method: 'GET' };
    if (useTls) {
      opts.rejectUnauthorized = true;
      if (process.env.TLS_CA) {
        try { opts.ca = fs.readFileSync(process.env.TLS_CA); } catch (e) {}
      }
    }
    const req = mod.request(opts, (res) => {
      let b = '';
      res.on('data', (d) => (b += d));
      res.on('end', () => { let j = null; try { j = JSON.parse(b); } catch (e) {} resolve({ status: res.statusCode, json: j }); });
    });
    req.on('error', () => resolve({ status: 0, json: null }));
    req.end();
  });
}

process.on('exit', () => { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {} });
let tmp = null;

/* سرور را spawn می‌کند و یا exit(1) با stderr یا health با pid را برمی‌گرداند
   نتیجه: { booted: bool, code: number|null, stderr: string, port: number|null } */
async function bootScenario({ tlsCert, tlsKey, production, portPool }) {
  const storeFile = path.join(tmp, 'store-' + process.hrtime.bigint() + '.json');
  fs.copyFileSync(path.join(ROOT, 'server/data/payesh.json'), storeFile);
  const env = Object.assign({}, process.env, {
    HOST: '127.0.0.1',
    PAYESH_STORE: storeFile,
    PAYESH_AUDIT: path.join(tmp, 'audit.log'),
    PAYESH_KEY: path.join(tmp, 'jwt.key')
  });
  delete env.PAYESH_DEMO_CODE;
  if (tlsCert) env.PAYESH_TLS_CERT = tlsCert;
  if (tlsKey) env.PAYESH_TLS_KEY = tlsKey;
  if (production) env.PAYESH_ENV = 'production';
  for (const p of portPool) {
    const proc = spawn(process.execPath, ['server/index.js'], { cwd: ROOT, env: Object.assign({}, env, { PORT: String(p) }), stdio: 'pipe' });
    let err = '';
    proc.stderr.on('data', (d) => (err += d));
    const exitP = new Promise((resolve) => proc.on('exit', (code) => resolve(code)));
    let booted = false;
    for (let i = 0; i < 50; i++) {
      const h = await httpGet(p, '/api/health', !!(tlsCert && tlsKey)).then(r => r.json).catch(() => null);
      if (h && h.ok && h.pid === proc.pid) { booted = true; break; }
      if (h && h.ok) break; /* server دیگری روی این پورت است */
      const code = await Promise.race([exitP, sleep(250).then(() => null)]);
      if (code != null) { proc.kill('SIGKILL'); return { booted: false, code, stderr: err, port: p }; }
    }
    if (booted) return { booted: true, code: null, stderr: err, port: p, proc };
    proc.kill('SIGKILL');
  }
  return { booted: false, code: null, stderr: 'no port / no exit', port: null };
}

(async () => {
  console.log('\n▸ دور 85 — P1-4: fail-fastِ TLS در production');
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'payesh-s13-'));

  const nb = new Date(Date.now() - 86400000), na = new Date(Date.now() + 86400000 * 900);
  const selfSigned = makeSelfSigned('payesh-local', nb, na);
  fs.writeFileSync(path.join(tmp, 'ss.crt'), selfSigned.certPem);
  fs.writeFileSync(path.join(tmp, 'ss.key'), selfSigned.keyPem, { mode: 0o600 });
  const ca = makeSelfSigned('Payesh Test CA', nb, na);
  const leaf = makeCaSignedLeaf(ca, 'payesh.example.com');
  fs.writeFileSync(path.join(tmp, 'leaf.crt'), leaf.certPem);
  fs.writeFileSync(path.join(tmp, 'leaf.key'), leaf.keyPem, { mode: 0o600 });
  fs.writeFileSync(path.join(tmp, 'bad.crt'), 'NOT A CERTIFICATE');
  fs.copyFileSync(path.join(tmp, 'ss.key'), path.join(tmp, 'bad.key'));
  const xLeaf = new crypto.X509Certificate(leaf.certPem);
  chk('P0 گواهی‌های تست ساخته شد (self-signed + leafِ CA)', (new crypto.X509Certificate(selfSigned.certPem)).subject === (new crypto.X509Certificate(selfSigned.certPem)).issuer && xLeaf.subject !== xLeaf.issuer);

  /* T1 — production + self-signed → exit(1) */
  const t1 = await bootScenario({ tlsCert: path.join(tmp, 'ss.crt'), tlsKey: path.join(tmp, 'ss.key'), production: true, portPool: [8987, 8985, 8984] });
  chk('T1 production + self-signed → exit(1)', t1.code === 1, 'code=' + t1.code);
  chk('T1b پیامِ خطایِ دقیق', t1.stderr.indexOf('Error: Production requires valid CA certificate') > -1, t1.stderr.slice(0, 140));
  if (t1.proc) t1.proc.kill('SIGKILL'); /* حالتِ جهش: سرور بالا آمده — پورت را آزاد بکن */

  /* T2 — production + leafِ CA → بالا می‌آید */
  const t2 = await bootScenario({ tlsCert: path.join(tmp, 'leaf.crt'), tlsKey: path.join(tmp, 'leaf.key'), production: true, portPool: [8987, 8986] });
  chk('T2 production + CA-signed → سرور بالا آمد', t2.booted === true, 'code=' + t2.code + ' err=' + t2.stderr.slice(0, 120));
  if (t2.booted) {
    const h = await httpGet(t2.port, '/api/health', true);
    chk('T2b health روی https سالم است', h.json && h.json.ok === true, JSON.stringify(h).slice(0, 100));
    t2.proc.kill('SIGKILL');
  }

  /* T3 — development + self-signed → بالا می‌آید (رفتارِ قدیمی دست‌نخورده) */
  const t3 = await bootScenario({ tlsCert: path.join(tmp, 'ss.crt'), tlsKey: path.join(tmp, 'ss.key'), production: false, portPool: [8987, 8986] });
  chk('T3 development + self-signed → سرور بالا آمد', t3.booted === true, 'code=' + t3.code + ' err=' + t3.stderr.slice(0, 120));
  if (t3.booted) {
    const h = await httpGet(t3.port, '/api/health', true);
    chk('T3b health روی https سالم است', h.json && h.json.ok === true, JSON.stringify(h).slice(0, 100));
    t3.proc.kill('SIGKILL');
  }

  /* T4 — production + گواهیِ خراب → exit(1) + cert unreadable */
  const t4 = await bootScenario({ tlsCert: path.join(tmp, 'bad.crt'), tlsKey: path.join(tmp, 'bad.key'), production: true, portPool: [8987] });
  chk('T4 production + گواهیِ خراب → exit(1)', t4.code === 1, 'code=' + t4.code);
  chk('T4b پیامِ «cert unreadable»', t4.stderr.indexOf('Error: Production requires valid CA certificate') > -1 && t4.stderr.indexOf('cert unreadable') > -1, t4.stderr.slice(0, 140));

  console.log('\nserver13: ' + pass + '/' + (pass + fail) + (fail ? ' — شکست: ' + errors.join(' | ') : '  ✅'));
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
