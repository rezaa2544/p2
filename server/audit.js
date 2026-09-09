/**
 * پایش — سامانه هوشمند مدیریت مدرسه
 * ماژول ممیزی و ثبت رویدادهای امنیتی (Audit Hardening)
 * 
 * ویژگی‌ها:
 *  - ساختار Append-Only مستقل از پایگاه داده اصلی
 *  - ذخیره در server/data/audit.log با سطح دسترسی 0600
 *  - فرمت استاندارد JSON برای هر خط:
 *    { timestamp, event, user_id, role, school_id, ip, summary, ... }
 *  - پاک‌سازی و ماسک کامل داده‌های هویتی و حساس (تلفن، کد ملی، رمزها، توکن‌ها)
 *  - چرخش خودکار (Rotation): هر ۱۰۰۰ رویداد یا تغییر روزانه یا رسیدن به سقف حجم
 *  - انتقال لاگ‌های قدیمی به پوشه server/data/audit/
 */

const fs = require('fs');
const path = require('path');
const { getClientIp } = require('./client-ip');

// الگوهای تشخیص داده‌های حساس
const PHONE_PATTERN = /(?:(?:\+|00)98|0)?9\d{9}\b/g;
const NATIONAL_ID_PATTERN = /\b\d{10}\b/g;
const SENSITIVE_KEYS = /^(?:password|pass|secret|jwt|token|otp)$/i;
const PHONE_KEYS = /^(?:phone|mobile|tel|cellphone)$/i;
const NID_KEYS = /^(?:national_id|nid|nationalId|melli_code|melliCode)$/i;

/**
 * ماسک کردن شماره تلفن همراه (نمایش پیش‌شماره و ۴ رقم آخر)
 * مثال: 09121234567 -> 0912***4567
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
 * ماسک کردن کد ملی ۱۰ رقمی (نمایش ۳ رقم اول و ۴ رقم آخر)
 * مثال: 0012345678 -> 001***5678
 */
function maskNationalId(val) {
  if (val == null) return null;
  const s = String(val).trim();
  if (/^\d{10}$/.test(s)) {
    return `${s.slice(0, 3)}***${s.slice(-4)}`;
  }
  return s.length > 4 ? s.slice(0, 2) + '***' + s.slice(-2) : '***';
}

/**
 * پاک‌سازی رشته از شماره تلفن و کد ملی کامل
 */
function sanitizeString(str) {
  if (typeof str !== 'string') return str;
  return str
    .replace(PHONE_PATTERN, (m) => {
      const clean = m.replace(/[\s\-()]/g, '');
      const last4 = clean.slice(-4);
      const prefix = clean.startsWith('+98') ? '+989' + clean.slice(4, 6) : (clean.startsWith('09') ? clean.slice(0, 4) : '0' + clean.slice(0, 3));
      return `${prefix}***${last4}`;
    })
    .replace(NATIONAL_ID_PATTERN, (m) => `${m.slice(0, 3)}***${m.slice(-4)}`);
}

/**
 * پاک‌سازی و گندزدایی عمیق اشیاء و داده‌ها برای لاگ ممیزی
 */
function sanitizeData(val, seen = new WeakSet()) {
  if (val === null || val === undefined) return val;
  if (typeof val === 'string') return sanitizeString(val);
  if (typeof val === 'number' || typeof val === 'boolean') return val;
  if (typeof val === 'function' || typeof val === 'symbol') return undefined;

  if (typeof val === 'object') {
    if (seen.has(val)) return '[CIRCULAR]';
    seen.add(val);

    if (Array.isArray(val)) {
      return val.map(item => sanitizeData(item, seen));
    }

    const out = {};
    for (const [k, v] of Object.entries(val)) {
      if (SENSITIVE_KEYS.test(k)) {
        out[k] = '[REDACTED]';
      } else if (k === 'code' && (typeof v === 'string' || typeof v === 'number') && /^\d{4,6}$/.test(String(v).trim())) {
        out[k] = '[REDACTED]';
      } else if (PHONE_KEYS.test(k)) {
        out[k] = maskPhone(v);
      } else if (NID_KEYS.test(k)) {
        out[k] = maskNationalId(v);
      } else {
        out[k] = sanitizeData(v, seen);
      }
    }
    return out;
  }
  return String(val);
}

/**
 * دریافت آی‌پی کلاینت از درخواست HTTP
 */
/* F-AUTH-01: مجموعهٔ پراکسی‌های مورداعتماد (نمونه‌ها via createAudit)؛
   undefined یعنی پیش‌فرضِ loopback در client-ip.js */
let TRUSTED_PROXIES;
function setTrustedProxies(set) {
  if (set instanceof Set) TRUSTED_PROXIES = set;
}
function clientIp(req) {
  if (!req) return null;
  return getClientIp(req, TRUSTED_PROXIES);
}

/**
 * ساخت نمونه کنترل‌کننده ممیزی
 */
function createAudit(opts = {}) {
  const auditFile = opts.auditFile || process.env.PAYESH_AUDIT || path.join(__dirname, 'data', 'audit.log');
  const auditDir = opts.auditDir || path.join(path.dirname(auditFile), 'audit');
  const maxEvents = opts.maxEvents != null ? opts.maxEvents : (parseInt(process.env.PAYESH_AUDIT_MAX_EVENTS || '1000', 10) || 1000);
  const maxBytes = opts.maxBytes != null ? opts.maxBytes : (parseInt(process.env.PAYESH_AUDIT_MAX_BYTES || String(10 * 1024 * 1024), 10) || 10 * 1024 * 1024);
  if(opts.trustedProxies instanceof Set) TRUSTED_PROXIES = opts.trustedProxies;

  let initialized = false;
  let currentDay = new Date().toISOString().slice(0, 10);
  let eventCounter = 0;

  function ensureInit() {
    if (initialized) return;
    initialized = true;
    try {
      const dir = path.dirname(auditFile);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
      if (!fs.existsSync(auditDir)) fs.mkdirSync(auditDir, { recursive: true, mode: 0o700 });

      if (fs.existsSync(auditFile)) {
        try { fs.chmodSync(auditFile, 0o600); } catch (e) {}
        // شمارش رویدادهای موجود در فایل
        const content = fs.readFileSync(auditFile, 'utf8');
        eventCounter = content.split('\n').filter(Boolean).length;
        // خواندن تاریخ ایجاد یا اولین رویداد
        const mtime = fs.statSync(auditFile).mtime;
        currentDay = new Date(mtime).toISOString().slice(0, 10);
      } else {
        const fd = fs.openSync(auditFile, 'a', 0o600);
        fs.closeSync(fd);
        eventCounter = 0;
      }
    } catch (e) {
      // ادامه بدون توقف
    }
  }

  /**
   * چرخش فایل ممیزی و انتقال به server/data/audit/
   */
  function rotate(reason = 'manual') {
    try {
      if (!fs.existsSync(auditFile)) return null;
      const stat = fs.statSync(auditFile);
      if (stat.size === 0 && eventCounter === 0) return null;

      if (!fs.existsSync(auditDir)) {
        fs.mkdirSync(auditDir, { recursive: true, mode: 0o700 });
      }

      const now = new Date();
      const pad = (n) => String(n).padStart(2, '0');
      const ts = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}-${String(now.getMilliseconds()).padStart(3, '0')}`;
      const rotatedFile = path.join(auditDir, `audit-${ts}.log`);

      // انتقال فایل فعال به پوشه آرشیو
      fs.renameSync(auditFile, rotatedFile);
      try { fs.chmodSync(rotatedFile, 0o600); } catch (e) {}

      // سازگاری با آزمون‌های قدیمی (مانند server17 که وجود .1 را بررسی می‌کند)
      try {
        fs.copyFileSync(rotatedFile, auditFile + '.1');
        fs.chmodSync(auditFile + '.1', 0o600);
      } catch (e) {}

      // ریست شمارنده‌ها
      eventCounter = 0;
      currentDay = now.toISOString().slice(0, 10);

      // بازسازی فایل اصلی با دسترسی 0600
      const fd = fs.openSync(auditFile, 'a', 0o600);
      fs.closeSync(fd);

      return rotatedFile;
    } catch (e) {
      return null;
    }
  }

  /**
   * بررسی نیاز به چرخش لاگ
   */
  function checkRotation() {
    const today = new Date().toISOString().slice(0, 10);
    // ۱. تغییر روز
    if (today !== currentDay) {
      rotate('daily');
      return;
    }
    // ۲. رسیدن به سقف ۱۰۰۰ رویداد
    if (eventCounter >= maxEvents) {
      rotate('count');
      return;
    }
    // ۳. رسیدن به سقف حجم
    try {
      if (fs.existsSync(auditFile) && fs.statSync(auditFile).size >= maxBytes) {
        rotate('size');
      }
    } catch (e) {}
  }

  /**
   * ثبت رویداد ممیزی (Append-Only)
   */
  /* هم‌بستگیِ ردیابی (P-Trace): خوانشِ تنبل (بدونِ چرخهٔ require — tracing در لود audit را می‌خواهد) */
  function currentTraceId(){
    try{
      const t = require('./tracing');
      if(t && typeof t.getTraceId === 'function') return t.getTraceId();
    }catch(e){}
    return null;
  }
  function record(eventOrType, detailObj) {
    try {
      ensureInit();
      checkRotation();

      let eventName = 'unknown';
      let userId = null;
      let role = null;
      let schoolId = null;
      let ip = null;
      let summary = '';
      let detail = {};
      let extra = {};

      if (typeof eventOrType === 'string') {
        eventName = eventOrType;
        detail = detailObj ? { ...detailObj } : {};
        userId = detail.user_id != null ? detail.user_id : (detail.userId != null ? detail.userId : null);
        role = detail.role || null;
        schoolId = detail.school_id != null ? detail.school_id : (detail.schoolId != null ? detail.schoolId : null);
        ip = detail.ip || null;
        summary = detail.summary || `${eventName}${userId != null ? ` for user ${userId}` : ''}${role ? ` (${role})` : ''}`;
      } else if (typeof eventOrType === 'object' && eventOrType !== null) {
        eventName = eventOrType.event || eventOrType.type || 'unknown';
        userId = eventOrType.user_id != null ? eventOrType.user_id : (eventOrType.userId != null ? eventOrType.userId : null);
        role = eventOrType.role || null;
        schoolId = eventOrType.school_id != null ? eventOrType.school_id : (eventOrType.schoolId != null ? eventOrType.schoolId : null);
        ip = eventOrType.ip || null;
        summary = eventOrType.summary || `${eventName}${userId != null ? ` for user ${userId}` : ''}${role ? ` (${role})` : ''}`;
        detail = eventOrType.detail || { ...eventOrType };
        extra = { ...eventOrType };
        delete extra.event;
        delete extra.type;
        delete extra.user_id;
        delete extra.userId;
        delete extra.role;
        delete extra.school_id;
        delete extra.schoolId;
        delete extra.ip;
        delete extra.summary;
        delete extra.detail;
        delete extra.timestamp;
        delete extra.ts;
      }

      const now = new Date();
      const isoTs = now.toISOString();

      // ساخت آبجکت تمیز و استاندارد با فیلدهای الزامی
      const sanitizedDetail = sanitizeData(detail);
      const sanitizedSummary = sanitizeString(summary);
      const sanitizedExtra = sanitizeData(extra);

      const entry = {
        timestamp: isoTs,
        event: eventName,
        user_id: userId,
        role: role,
        school_id: schoolId,
        ip: ip,
        summary: sanitizedSummary,
        // فیلدهای سازگاری کامل با آزمون‌ها و قراردادهای پیشین
        ts: isoTs,
        type: eventName,
        detail: sanitizedDetail,
        ...sanitizedDetail,
        ...sanitizedExtra
      };

      /* trace_id به خطِ JSON می‌چسبد تا Loki همان را ship کند (فقط وقتی ردیابی فعال است) */
      const __tid = currentTraceId();
      if(__tid) entry.trace_id = __tid;
      const line = JSON.stringify(entry) + '\n';
      fs.appendFileSync(auditFile, line, { encoding: 'utf8', mode: 0o600 });
      eventCounter++;

      return entry;
    } catch (e) {
      // ثبت ممیزی هرگز نباید مسیر اصلی برنامه را متوقف کند
      return null;
    }
  }

  // ایجاد متد اصلی audit
  function audit(eventOrType, detailObj) {
    return record(eventOrType, detailObj);
  }

  audit.record = record;
  audit.rotate = rotate;
  audit.getAuditFile = () => auditFile;
  audit.getAuditDir = () => auditDir;
  audit.getEventCounter = () => eventCounter;

  return {
    audit,
    record,
    rotate,
    maskPhone,
    maskNationalId,
    sanitizeData,
    sanitizeString,
    clientIp,
    getAuditFile: () => auditFile,
    getAuditDir: () => auditDir,
    getEventCounter: () => eventCounter
  };
}

// نمونه سراسری پیش‌فرض
const defaultInstance = createAudit();

module.exports = {
  createAudit,
  audit: defaultInstance.audit,
  maskPhone,
  maskNationalId,
  sanitizeData,
  sanitizeString,
  clientIp,
  setTrustedProxies
};
