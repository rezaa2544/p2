/* ═══════════════════════════════════════════════════════════════════
   server/abac.js — لایهٔ ABAC روی RBAC (M15-04)
   ───────────────────────────────────────────────────────────────────
   RBAC موجود (server/policy.js + authz/write-perms.json) نقش→عملیات را
   تعیین می‌کند؛ ABAC شرط‌های صفت‌محور را روی همان اضافه می‌کند:
     - tenant scoping: هر resource با school_id فقط در tenantِ خود نشست
     - field conditions: قواعد grade/exam_type در سیاست‌ها
   سیاست: authz/abac-policies.json — لیستی از قواعد؛ هر قاعده:
     { action, resource?, effect: 'allow'|'deny', when?: {school_id?: 'self'|number,
       grade?: [..], exam_type?: [..]} }
   تصمیم: deny مقدم بر allow (پیش‌فرض deny) — تصمیم همیشه با دلیل.
   fail-closed: سیاستِ ناخوانا = رد؛ عملیاتِ بدون قاعده = به RBAC واگذار.
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const path = require('path');

const DEFAULT_POLICY_FILE = path.join(__dirname, '..', 'authz', 'abac-policies.json');

function loadPolicies(file) {
  const f = file || DEFAULT_POLICY_FILE;
  let parsed = [];
  try {
    const raw = JSON.parse(fs.readFileSync(f, 'utf8'));
    parsed = Array.isArray(raw) ? raw : (Array.isArray(raw.policies) ? raw.policies : []);
  } catch (e) {
    const err = new Error('ABAC_POLICY_UNREADABLE: fail-closed — ' + (e && e.message));
    err.code = 'ABAC_POLICY_UNREADABLE';
    throw err;
  }
  return parsed.filter((p) => p && p.action && (p.effect === 'allow' || p.effect === 'deny'));
}

function createAbac(opts) {
  const optsObj = opts || {};
  let policies = optsObj.policies || null;
  let file = optsObj.file || null;
  if (!policies) policies = loadPolicies(file);

  function matchWhen(when, ctx) {
    if (!when) return true;
    /* tenant scoping: 'self' = school_id resource باید با tenant نشست برابر باشد */
    if (Object.prototype.hasOwnProperty.call(when, 'school_id')) {
      const want = when.school_id;
      const resSchool = ctx.resource && ctx.resource.school_id;
      if (want === 'self') {
        const mySchool = ctx.session && ctx.session.school_id;
        if (ctx.session && ctx.session.role === 'superadmin') { /* superadmin = همه tenantها */ }
        else if (mySchool == null || resSchool == null || String(mySchool) !== String(resSchool)) return false;
      } else if (String(want) !== String(resSchool)) return false;
    }
    if (when.grade) {
      const grades = Array.isArray(when.grade) ? when.grade : [when.grade];
      if (!grades.map(String).includes(String(ctx.resource && ctx.resource.grade))) return false;
    }
    if (when.exam_type) {
      const types = Array.isArray(when.exam_type) ? when.exam_type : [when.exam_type];
      if (!types.map(String).includes(String(ctx.resource && ctx.resource.exam_type))) return false;
    }
    return true;
  }

  /**
   * تصمیم ABAC برای یک عملیات. خروجی: {decision:'allow'|'deny'|'defer',
   * reason} — defer یعنی قاعده‌ای نگرفت؛ لایهٔ RBAC بعدی تصمیم می‌گیرد.
   */
  function evaluate({ action, session, resource }) {
    if (!policies) {
      return { decision: 'deny', reason: 'ABAC_FAIL_CLOSED: policies not loaded' };
    }
    let sawAllow = false;
    for (const p of policies) {
      if (p.action !== action) continue;
      if (p.resource && p.resource !== (resource && resource.type)) continue;
      if (!matchWhen(p.when || null, { session, resource: resource || {} })) continue;
      if (p.effect === 'deny') {
        return { decision: 'deny', reason: p.reason || 'ABAC deny rule', rule: p.id || null };
      }
      sawAllow = true; /* allow را نگه می‌داریم؛ deny مقدم است */
    }
    return sawAllow
      ? { decision: 'allow', reason: 'ABAC allow rule matched' }
      : { decision: 'defer', reason: 'no ABAC rule for this action — RBAC decides' };
  }

  return { evaluate, reload: (f2) => { policies = loadPolicies(f2 || file); }, policyCount: () => policies.length };
}

module.exports = { createAbac, loadPolicies, DEFAULT_POLICY_FILE };
