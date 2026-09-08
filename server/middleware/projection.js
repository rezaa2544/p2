/* ═══════════════════════════════════════════════════════════════════
   server/middleware/projection.js — Role-Based Field Projections
   -------------------------------------------------------------------
   Phase 3: Backend Production API
   - Strips sensitive PII and financial fields based on caller role.
   - Saves bandwidth and enforces zero-trust field exposure.
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

/**
 * Mask National ID (e.g. 0012345678 -> 001***5678)
 */
function maskNationalId(nid) {
  if (!nid) return null;
  const s = String(nid).trim();
  if (s.length !== 10) return s;
  return s.slice(0, 3) + '***' + s.slice(6);
}

/**
 * Mask Phone Number (e.g. 09123456789 -> 0912***6789)
 */
function maskPhone(phone) {
  if (!phone) return null;
  const s = String(phone).trim();
  if (s.length < 7) return s;
  return s.slice(0, 4) + '***' + s.slice(s.length - 4);
}

/**
 * Project User record fields based on requester role
 * @param {Object} userRecord - User entity
 * @param {string} requesterRole - Role of the requesting user
 * @param {boolean} isSelfOrOwner - Whether requester is the user itself or parent
 * @returns {Object} Projected safe user object
 */
function projectUserByRole(userRecord, requesterRole, isSelfOrOwner = false) {
  if (!userRecord) return null;

  // Superadmin, Manager, Edu Office, or Self/Parent gets full profile
  if (requesterRole === 'superadmin' || requesterRole === 'manager' || requesterRole === 'edu_office' || isSelfOrOwner) {
    const clone = Object.assign({}, userRecord);
    delete clone.password; // Never expose password hash
    return clone;
  }

  // Teacher sees educational fields + IEP, but PII is masked/stripped
  if (requesterRole === 'teacher') {
    return {
      id: userRecord.id,
      full_name: userRecord.full_name,
      username: userRecord.username,
      role: userRecord.role,
      school_id: userRecord.school_id,
      grade_level: userRecord.grade_level,
      field: userRecord.field,
      gender: userRecord.gender,
      active: userRecord.active,
      status: userRecord.status,
      iep_notes: userRecord.iep_notes,
      iep_staff: userRecord.iep_staff,
      iep_updated: userRecord.iep_updated,
      national_id_masked: maskNationalId(userRecord.national_id)
    };
  }

  // Student, Counselor, Driver, Others: public directory fields only
  return {
    id: userRecord.id,
    full_name: userRecord.full_name,
    username: userRecord.username,
    role: userRecord.role,
    school_id: userRecord.school_id,
    grade_level: userRecord.grade_level,
    field: userRecord.field,
    active: userRecord.active
  };
}

module.exports = {
  maskNationalId,
  maskPhone,
  projectUserByRole
};
