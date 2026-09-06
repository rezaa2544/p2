#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   payesh-server — self-signed TLS certificate, pure Node stdlib
   -------------------------------------------------------------------
   Stage 2 of "connect to server": real TLS for local/dev and for
   schools that run the server behind their own domain.

   No external deps: the X.509 v1 certificate (self-signed, RSA-2048,
   SHA-256) is assembled byte by byte as DER. That keeps the whole
   project on the Node stdlib (http, crypto, fs) — same rule as the
   rest of server/.

   Usage:
     node server/tls-cert.js            # -> server/data/tls.crt + tls.key
     node server/tls-cert.js OUT_DIR    # -> OUT_DIR/tls.crt + tls.key
     node server/tls-cert.js OUT_DIR CN # custom Common Name

   ⚠️ A SELF-SIGNED cert is real TLS (real crypto, real handshake) but
   browsers show a warning until the user trusts it — that is expected
   for dev. Production schools use a CA-issued cert: point
   PAYESH_TLS_CERT / PAYESH_TLS_KEY at it; nothing else changes.
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

/* ── tiny DER encoder ─────────────────────────────────────────────── */
function derLen(n){
  if(n < 0x80) return Buffer.from([n]);
  const b = [];
  let x = n;
  while(x > 0){ b.unshift(x & 0xff); x >>= 8; }
  return Buffer.concat([Buffer.from([0x80 | b.length]), Buffer.from(b)]);
}
function tlv(tag, content){
  return Buffer.concat([Buffer.from([tag]), derLen(content.length), content]);
}
function seq(content){ return tlv(0x30, content); }
function derInt(buf){
  if(buf.length && (buf[0] & 0x80)) buf = Buffer.concat([Buffer.from([0]), buf]);
  return tlv(0x02, buf);
}
function derNull(){ return Buffer.from([0x05, 0x00]); }
function derUtf8(str){ return tlv(0x0c, Buffer.from(str, 'utf8')); }
function derUtc(date){
  const p = (n) => String(n).padStart(2, '0');
  const s = String(date.getUTCFullYear()).slice(-2) + p(date.getUTCMonth() + 1)
    + p(date.getUTCDate()) + p(date.getUTCHours()) + p(date.getUTCMinutes())
    + p(date.getUTCSeconds()) + 'Z';
  return tlv(0x17, Buffer.from(s, 'ascii'));
}
function derBitString(der){ return tlv(0x03, Buffer.concat([Buffer.from([0]), der])); }

/* ── fixed OIDs ───────────────────────────────────────────────────── */
const OID_SHA256_WITH_RSA = Buffer.from([0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x0b]);
const OID_COMMON_NAME     = Buffer.from([0x55, 0x04, 0x03]); // 2.5.4.3
function sigAlg(){ return seq(Buffer.concat([tlv(0x06, OID_SHA256_WITH_RSA), derNull()])); }
function name(cn){
  /* X.500: Name = SEQUENCE OF RelativeDistinguishedName; each RDN is a
     SET OF AttributeTypeAndValue, and ATAV itself is a SEQUENCE
     { type OID, value ANY }. */
  const atav = seq(Buffer.concat([tlv(0x06, OID_COMMON_NAME), derUtf8(cn)]));
  const rdn = tlv(0x31, atav);
  return seq(rdn);
}

/* ── build ────────────────────────────────────────────────────────── */
function makeSelfSigned(cn, notBefore, notAfter){
  const pair = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding:   { type: 'spki',  format: 'der' },
    privateKeyEncoding:  { type: 'pkcs1', format: 'pem' }
  });
  const serial = crypto.randomBytes(15);
  serial[0] &= 0x7f; // keep the integer positive
  const nm = name(cn);
  /* v3: version [0] EXPLICIT INTEGER 2, plus basicConstraints CA:TRUE
     (OID 2.5.29.19 = 55 1d 13) so the cert works as its own trust anchor. */
  const version = tlv(0xa0, derInt(Buffer.from([2])));
  const bcExt = seq(Buffer.concat([
    tlv(0x06, Buffer.from([0x55, 0x1d, 0x13])),
    tlv(0x04, seq(Buffer.from([0x01, 0x01, 0xff])))
  ]));
  const extensions = tlv(0xa3, seq(bcExt));
  const tbs = seq(Buffer.concat([
    version,
    derInt(serial),
    sigAlg(),
    nm,                                   /* issuer  = subject (self-signed) */
    seq(Buffer.concat([derUtc(notBefore), derUtc(notAfter)])),
    nm,
    pair.publicKey,                       /* SubjectPublicKeyInfo (SPKI DER, already a SEQUENCE) */
    extensions
  ]));
  const signature = crypto.createSign('RSA-SHA256').update(tbs).sign(pair.privateKey);
  const cert = seq(Buffer.concat([tbs, sigAlg(), derBitString(signature)]));
  const crtPem = '-----BEGIN CERTIFICATE-----\n'
    + cert.toString('base64').match(/.{1,64}/g).join('\n') + '\n-----END CERTIFICATE-----\n';
  return { certPem: crtPem, keyPem: pair.privateKey, certDer: cert };
}

/* ── CLI ──────────────────────────────────────────────────────────── */
if(require.main === module){
  const outDir = process.argv[2] || path.join(__dirname, 'data');
  const cn = process.argv[3] || 'payesh-local';
  const notBefore = new Date(Date.now() - 24 * 3600 * 1000);
  const notAfter  = new Date(Date.now() + 825 * 24 * 3600 * 1000);
  const { certPem, keyPem } = makeSelfSigned(cn, notBefore, notAfter);
  fs.mkdirSync(outDir, { recursive: true });
  const crt = path.join(outDir, 'tls.crt');
  const key = path.join(outDir, 'tls.key');
  fs.writeFileSync(crt, certPem, { mode: 0o644 });
  fs.writeFileSync(key, keyPem, { mode: 0o600 });
  /* sanity: Node must be able to parse what we just wrote */
  const x509 = new crypto.X509Certificate(certPem);
  console.log('self-signed cert written:');
  console.log('  cert : ' + crt + '  (CN=' + x509.subjectCN + ', '
    + x509.validFrom + ' .. ' + x509.validTo + ')');
  console.log('  key  : ' + key);
  console.log('start TLS:  PAYESH_TLS_CERT=' + crt + ' PAYESH_TLS_KEY=' + key + ' node server/index.js');
}

module.exports = { makeSelfSigned, tlv, seq, derInt, derUtc, derUtf8, derBitString };
