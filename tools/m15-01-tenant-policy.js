'use strict';

function isValidActorProvinceTenantPolicy(row, expected) {
  const schoolId = Number(expected && expected.school_id);
  const provinceCode = String(expected && expected.province_code || '');
  if (!row || row.tenant_policy_present !== true
      || !Number.isSafeInteger(schoolId) || schoolId < 1
      || !/^\d{2}$/.test(provinceCode)
      || String(row.tenant_policy_province || '') !== provinceCode
      || !['*', String(schoolId)].includes(String(row.tenant_policy_school || ''))
      || !Number.isSafeInteger(Number(row.tenant_policy_version))
      || Number(row.tenant_policy_version) < 1) return false;

  let scope = row.tenant_policy_allowed_scope;
  if (typeof scope === 'string') {
    try { scope = JSON.parse(scope); } catch (_) { return false; }
  }
  if (!scope || typeof scope !== 'object' || Array.isArray(scope) || scope.deny === true) return false;
  if (scope.match != null && scope.match !== 'actor_province') return false;
  if (Object.prototype.hasOwnProperty.call(scope, 'allowed_scopes')
      && (!Array.isArray(scope.allowed_scopes) || !scope.allowed_scopes.includes('actor_province'))) return false;
  return scope.match === 'actor_province'
    || (Array.isArray(scope.allowed_scopes) && scope.allowed_scopes.includes('actor_province'));
}

module.exports = { isValidActorProvinceTenantPolicy };
