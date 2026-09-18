/**
 * پایش — سامانه هوشمند مدیریت مدرسه
 * فاز ۴ — گام ۶ (P1-SC-06): موتور ممیزی و ثبت وقایع امنیتی (Security Audit Engine)
 * 
 * ثبت وقایع:
 *  - authentication events (ورود، خروج، انقضا، شکست)
 *  - authorization checks (بررسی مجوزها و تصمیمات سیاست‌گذاری)
 *  - denied requests (رد دسترسی مستأجر، نقش یا خط‌مشی)
 *  - policy evaluations (ارزیابی سیاست‌ها: ALLOW, DENY, REVIEW)
 *  - security warnings (نشست مشکوک، بازپخش توکن، هشدار نرخ درخواست)
 * 
 * پالایش قطعی داده‌های حساس (Redaction):
 *  - حذف کامل password, token, secret, credential, jwt, authorization, otp, pass, api_key
 *  - ماسک خودکار شماره تماس (0912***4567) و کد ملی (123****789)
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { assertNoZeroRanking, deepFreeze } = require('./zero-trust-runtime');

// کلیدهای به شدت محرمانه که باید کاملاً حذف یا سانسور شوند
const SENSITIVE_KEY_REGEX = /^(?:password|pass|secret|token|credential|jwt|authorization|otp|api_key|access_token|refresh_token)$/i;

// الگوهای ماسک هویتی
const PHONE_PATTERN = /(?:(?:\+|00)98|0)?9\d{9}\b/g;
const NATIONAL_ID_PATTERN = /\b\d{10}\b/g;

// بافر حافظه امن رویدادهای ممیزی با ظرفیت محدود (Ring Buffer)
const MAX_IN_MEMORY_LOGS = 500;
const inMemoryAuditTrail = [];

/**
 * ماسک کردن شماره تلفن
 */
function maskPhone(val) {
  if (val == null) return null;
  const s = String(val).replace(/[\s\-()]/g, '');
  if (s.length >= 10 && /^(?:(?:\+|00)98|0)?9\d{9}$/.test(s)) {
    const last4 = s.slice(-4);
    const prefix = s.startsWith('+98') ? '+989' + s.slice(4, 6) : (s.startsWith('0098') ? '00989' + s.slice(5, 7) : (s.startsWith('09') ? s.slice(0, 4) : '0' + s.slice(0, 3)));
    return `${prefix}***${last4}`;
  }
  return s.length > 4 ? s.slice(0, 2) + '***' + s.slice(-2) : '***';
}

/**
 * ماسک کردن کد ملی
 */
function maskNationalId(val) {
  if (val == null) return null;
  const s = String(val).trim();
  if (s.length === 10 && /^\d{10}$/.test(s)) {
    return s.slice(0, 3) + '****' + s.slice(-3);
  }
  return '***';
}

/**
 * پاک‌سازی عمیق و بازگشتی تمامی داده‌های حساس و محرمانه در ورودی لاگ
 */
function sanitizeSecurityPayload(payload) {
  if (payload == null) return payload;

  if (typeof payload === 'string') {
    // ماسک تلفن و کد ملی در رشته‌ها
    return payload
      .replace(PHONE_PATTERN, (m) => maskPhone(m))
      .replace(NATIONAL_ID_PATTERN, (m) => maskNationalId(m));
  }

  if (Array.isArray(payload)) {
    return payload.map(item => sanitizeSecurityPayload(item));
  }

  if (typeof payload === 'object') {
    const sanitized = {};
    for (const [key, value] of Object.entries(payload)) {
      if (SENSITIVE_KEY_REGEX.test(key)) {
        sanitized[key] = '[REDACTED_SECRET]';
      } else if (/phone|mobile|cellphone/i.test(key)) {
        sanitized[key] = maskPhone(value);
      } else if (/national_id|nid|melli_code/i.test(key)) {
        sanitized[key] = maskNationalId(value);
      } else {
        sanitized[key] = sanitizeSecurityPayload(value);
      }
    }
    return sanitized;
  }

  return payload;
}

/**
 * ثبت یک رویداد امنیتی در ردپای ممیزی سیستم
 */
function recordSecurityEvent({
  event_type,
  action,
  user_id = null,
  role = null,
  school_id = null,
  ip = null,
  status = 'INFO',
  policy_id = null,
  decision = null,
  details = {}
}) {
  const timestamp = new Date().toISOString();

  // پالایش داده‌های جزئیات
  const sanitizedDetails = sanitizeSecurityPayload(details);

  const eventRecord = {
    timestamp,
    event_type: event_type || 'SECURITY_AUDIT_LOG',
    action: action || 'UNSPECIFIED',
    user_id: user_id != null ? Number(user_id) : null,
    role: role || null,
    school_id: school_id != null ? Number(school_id) : null,
    ip: ip || '127.0.0.1',
    status,
    policy_id: policy_id || null,
    decision: decision || null,
    details: sanitizedDetails,
    governance: {
      human_decision_sovereignty: true,
      requires_human_approval: true
    }
  };

  // ممانعت مطلق از رتبه‌بندی رقابتی در رکورد لاگ
  assertNoZeroRanking(eventRecord);

  // افزودن به بافر حافظه
  inMemoryAuditTrail.push(eventRecord);
  if (inMemoryAuditTrail.length > MAX_IN_MEMORY_LOGS) {
    inMemoryAuditTrail.shift();
  }

  return deepFreeze(eventRecord);
}

/**
 * بازیابی ردپای ممیزی با فیلتر مستأجر و رویداد
 */
function getSecurityAuditTrail({ schoolId = null, eventType = null, limit = 50 } = {}) {
  let logs = inMemoryAuditTrail;

  if (schoolId != null) {
    const sid = Number(schoolId);
    logs = logs.filter(l => l.school_id === sid || l.school_id == null);
  }

  if (eventType) {
    logs = logs.filter(l => l.event_type === eventType);
  }

  const result = logs.slice(-Math.min(limit, 100));
  return deepFreeze(result);
}

/**
 * پاکسازی بافر حافظه تست‌ها
 */
function clearAuditTrailForTests() {
  inMemoryAuditTrail.length = 0;
}

module.exports = {
  maskPhone,
  maskNationalId,
  sanitizeSecurityPayload,
  recordSecurityEvent,
  getSecurityAuditTrail,
  clearAuditTrailForTests
};
