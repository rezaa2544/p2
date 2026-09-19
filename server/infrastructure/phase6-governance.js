/**
 * Phase 6.5 — ADR-012 governance: Ed25519 + nonce + timestamp + expiry.
 * `approved === true` is NEVER sufficient. Production changes require a
 * real signature over a canonical payload, verified with the operator
 * public key, and a durable replay ledger.
 */
'use strict';

const crypto = require('crypto');

function canonicalGovernancePayload(fields) {
  const body = {
    action: String(fields.action || 'WEIGHT_UPDATE'),
    cluster_id: String(fields.cluster_id || ''),
    expiry: String(fields.expiry || ''),
    nonce: String(fields.nonce || ''),
    target_weight: Number(fields.target_weight),
    timestamp: String(fields.timestamp || '')
  };
  return JSON.stringify(body);
}

function generateGovernanceKeypair() {
  return crypto.generateKeyPairSync('ed25519');
}

function exportPublicKeyB64(publicKey) {
  return publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
}

function loadPublicKeyFromB64(b64) {
  if (!b64 || typeof b64 !== 'string') return null;
  const trimmed = b64.trim();
  if (!trimmed) return null;
  return crypto.createPublicKey({
    key: Buffer.from(trimmed, 'base64'),
    type: 'spki',
    format: 'der'
  });
}

function loadPublicKeyFromEnv(env = process.env) {
  return loadPublicKeyFromB64(env.PAYESH_GOVERNANCE_ED25519_PUBLIC_KEY || '');
}

function signGovernancePayload(privateKey, fields) {
  const nonce = fields.nonce || crypto.randomBytes(16).toString('hex');
  const timestamp = fields.timestamp || new Date().toISOString();
  const ttlMs = fields.ttlMs != null ? Number(fields.ttlMs) : 60 * 1000;
  const expiry = fields.expiry || new Date(Date.now() + ttlMs).toISOString();
  const payload = canonicalGovernancePayload({
    action: fields.action || 'WEIGHT_UPDATE',
    cluster_id: fields.cluster_id,
    target_weight: fields.target_weight,
    nonce,
    timestamp,
    expiry
  });
  const signature = crypto.sign(null, Buffer.from(payload, 'utf8'), privateKey).toString('base64');
  return { nonce, timestamp, expiry, signature, payload, action: fields.action || 'WEIGHT_UPDATE' };
}

function verifyGovernanceSignature(publicKey, fields, signatureB64) {
  if (!publicKey) {
    const err = new Error('کلید عمومی حاکمیت تنظیم نشده است');
    err.code = 'GOVERNANCE_KEY_UNAVAILABLE';
    err.status = 503;
    throw err;
  }
  if (!signatureB64 || typeof signatureB64 !== 'string') {
    const err = new Error('امضای Ed25519 الزامی است');
    err.code = 'INVALID_OPERATOR_SIGNATURE';
    throw err;
  }
  const payload = canonicalGovernancePayload(fields);
  let ok = false;
  try {
    ok = crypto.verify(
      null,
      Buffer.from(payload, 'utf8'),
      publicKey,
      Buffer.from(signatureB64, 'base64')
    );
  } catch (e) {
    ok = false;
  }
  if (!ok) {
    const err = new Error('امضای Ed25519 نامعتبر است');
    err.code = 'INVALID_OPERATOR_SIGNATURE';
    throw err;
  }
  return payload;
}

function assertFreshTimestamp(timestamp, expiry) {
  const now = Date.now();
  const ts = Date.parse(String(timestamp || ''));
  const exp = Date.parse(String(expiry || ''));
  if (!Number.isFinite(ts) || !Number.isFinite(exp)) {
    const err = new Error('timestamp و expiry الزامی و باید ISO-8601 باشند');
    err.code = 'INVALID_OPERATOR_SIGNATURE';
    throw err;
  }
  if (exp <= now) {
    const err = new Error('امضای حاکمیت منقضی شده است');
    err.code = 'INVALID_OPERATOR_SIGNATURE';
    throw err;
  }
  if (ts > now + 60 * 1000) {
    const err = new Error('timestamp در آینده است');
    err.code = 'INVALID_OPERATOR_SIGNATURE';
    throw err;
  }
  if (now - ts > 10 * 60 * 1000) {
    const err = new Error('timestamp کهنه است (بیش از ۱۰ دقیقه)');
    err.code = 'INVALID_OPERATOR_SIGNATURE';
    throw err;
  }
}

function signatureHash(signatureB64) {
  return crypto.createHash('sha256').update(String(signatureB64 || ''), 'utf8').digest('hex');
}

module.exports = {
  canonicalGovernancePayload,
  generateGovernanceKeypair,
  exportPublicKeyB64,
  loadPublicKeyFromB64,
  loadPublicKeyFromEnv,
  signGovernancePayload,
  verifyGovernanceSignature,
  assertFreshTimestamp,
  signatureHash
};
