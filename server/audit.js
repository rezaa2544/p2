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

function ipv4ToLong(ip) {
  if (typeof ip !== 'string') return null;
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  let num = 0;
  for (let i = 0; i < 4; i++) {
    const n = parseInt(parts[i], 10);
    if (isNaN(n) || n < 0 || n > 255) return null;
    num = (num << 8) + n;
  }
  return num >>> 0;
}

function isIpMatch(ip, target) {
  if (!ip || !target) return false;
  ip = ip.replace(/^::ffff:/, '').trim();
  target = target.replace(/^::ffff:/, '').trim();
  if (ip === target) return true;
  if ((target === '127.0.0.1' || target === '::1' || target === 'localhost') &&
      (ip === '127.0.0.1' || ip === '::1' || ip === 'localhost')) {
    return true;
  }
  if (target.includes('/')) {
    const [net, bitsStr] = target.split('/');
    const bits = parseInt(bitsStr, 10);
    const ipNum = ipv4ToLong(ip);
    const netNum = ipv4ToLong(net);
    if (ipNum !== null && netNum !== null && !isNaN(bits)) {
      const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
      return (ipNum & mask) === (netNum & mask);
    }
  }
  return false;
}

function isTrustedProxy(remoteIp) {
  if (!remoteIp) return false;
  const cleanRemote = remoteIp.replace(/^::ffff:/, '').trim();
  
  // Loopback (127.0.0.1, ::1, localhost) is the local reverse proxy / test harness
  if (cleanRemote === '127.0.0.1' || cleanRemote === '::1' || cleanRemote === 'localhost') {
    return true;
  }

  const behindProxy = process.env.PAYESH_BEHIND_PROXY === '1' || process.env.PAYESH_BEHIND_PROXY === 'true';
  const customProxies = (process.env.TRUSTED_PROXIES || '').split(',').map(s => s.trim()).filter(Boolean);
  
  if (customProxies.length > 0) {
    return customProxies.some(p => isIpMatch(cleanRemote, p));
  }
  
  if (behindProxy) {
    const defaultTrusted = ['127.0.0.1', '::1', '10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16'];
    return defaultTrusted.some(p => isIpMatch(cleanRemote, p));
  }
  
  return false;
}

/**
 * دریافت آی‌پی کلاینت از درخواست HTTP
 */
function clientIp(req) {
  if (!req) return '127.0.0.1';
  let remoteIp = (req.socket && req.socket.remoteAddress) ? req.socket.remoteAddress.replace(/^::ffff:/, '').trim() : null;
  if (!remoteIp) remoteIp = '127.0.0.1';

  const xff = req.headers && req.headers['x-forwarded-for'];
  if (xff && typeof xff === 'string' && isTrustedProxy(remoteIp)) {
    const ips = xff.split(',').map(s => s.trim().replace(/^::ffff:/, '')).filter(Boolean);
    if (ips.length > 0) {
      return ips[0];
    }
  }

  return remoteIp;
}

/**
 * ساخت نمونه کنترل‌کننده ممیزی
 *
 * حالتِ نوشتن (Wave 9 — Application Performance):
 *  - پیش‌فرض (sync): عیناً رفتارِ پیشین — appendFileSync در همان لحظه.
 *    آزمون‌ها و ابزارها فایل را بلافاصله پس از رویداد می‌خوانند؛ این
 *    حالتِ پیش‌فرض باید همان‌بماند تا قراردادِ خواندنِ هم‌زمان برقرار بماند.
 *  - async (تولید، PAYESH_AUDIT_ASYNC=1 یا opts.asyncMode): رویدادها به
 *    صفِ درون‌حافظه می‌روند و در پس‌زمینه (setImmediate) با یک
 *    fs.appendFile به‌صورتِ دسته‌ای و مرتب نوشته می‌شوند — دیگر هیچ
 *    I/O سنکرونی در مسیرِ درخواست نیست. خروجِ فرآیند با flushSync
 *    باقی‌مانده را همان لحظه می‌نویسد (wired در server/index.js).
 */
function createAudit(opts = {}) {
  const auditFile = opts.auditFile || process.env.PAYESH_AUDIT || path.join(__dirname, 'data', 'audit.log');
  const auditDir = opts.auditDir || path.join(path.dirname(auditFile), 'audit');
  const maxEvents = opts.maxEvents != null ? opts.maxEvents : (parseInt(process.env.PAYESH_AUDIT_MAX_EVENTS || '1000', 10) || 1000);
  const maxBytes = opts.maxBytes != null ? opts.maxBytes : (parseInt(process.env.PAYESH_AUDIT_MAX_BYTES || String(10 * 1024 * 1024), 10) || 10 * 1024 * 1024);
  const requestedQueue = opts.maxQueue != null ? Number(opts.maxQueue) : Number(process.env.PAYESH_AUDIT_MAX_QUEUE || 10000);
  const maxQueue = Number.isFinite(requestedQueue) && requestedQueue > 0 ? Math.floor(requestedQueue) : 10000;
  const asyncMode = opts.asyncMode === true || process.env.PAYESH_AUDIT_ASYNC === '1';

  let initialized = false;
  let asyncReady = false;
  let asyncInitPromise = null;
  let currentDay = new Date().toISOString().slice(0, 10);
  let eventCounter = 0;

  /* ── صفِ پس‌زمینه (فقط حالتِ async) ───────────────────────────── */
  let flushQueue = [];
  let flushScheduled = false;
  let flushRunning = false;
  let droppedEvents = 0;
  let overflowWarned = false;

  /* ایمنی دایرکتوری لاگر: اطمینان از وجود مسیر والد و فایل لاگ */
  try {
    const pdir = path.dirname(auditFile);
    if (!fs.existsSync(pdir)) fs.mkdirSync(pdir, { recursive: true, mode: 0o700 });
    if (!fs.existsSync(auditDir)) fs.mkdirSync(auditDir, { recursive: true, mode: 0o700 });
    if (!asyncMode && !fs.existsSync(auditFile)) {
      const fd = fs.openSync(auditFile, 'a', 0o600);
      fs.closeSync(fd);
    }
  } catch (e) {}

  function ensureInit() {
    if (initialized) return;
    initialized = true;
    /* Async audit initialization is deliberately deferred to flush(). This
       keeps the first request free of mkdir/stat/open/chmod system calls. */
    if (asyncMode) return;
    try {
      const dir = path.dirname(auditFile);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
      if (!fs.existsSync(auditDir)) fs.mkdirSync(auditDir, { recursive: true, mode: 0o700 });

      if (fs.existsSync(auditFile)) {
        try { fs.chmodSync(auditFile, 0o600); } catch (e) {}
        if (asyncMode) {
          /* حالتِ async: شمارشِ خطوط با خواندنِ کلِ فایلِ (تا ۱۰MB)
             سنکرون در مسیرِ نخستِ رویداد نمی‌ارزد — سقفِ حجم در flush
             نگهبان است و شمارنده از صفرِ همین فرآیند می‌شمارد. */
          const mtime = fs.statSync(auditFile).mtime;
          currentDay = new Date(mtime).toISOString().slice(0, 10);
        } else {
          // شمارش رویدادهای موجود در فایل
          const content = fs.readFileSync(auditFile, 'utf8');
          eventCounter = content.split('\n').filter(Boolean).length;
          // خواندن تاریخ ایجاد یا اولین رویداد
          const mtime = fs.statSync(auditFile).mtime;
          currentDay = new Date(mtime).toISOString().slice(0, 10);
        }
      } else {
        const fd = fs.openSync(auditFile, 'a', 0o600);
        fs.closeSync(fd);
        eventCounter = 0;
      }
    } catch (e) {
      // ادامه بدون توقف
    }
  }

  async function ensureAsyncInit() {
    if (!asyncMode || asyncReady) return;
    if (asyncInitPromise) return asyncInitPromise;
    asyncInitPromise = (async () => {
      try {
        const dir = path.dirname(auditFile);
        await fs.promises.mkdir(dir, { recursive: true, mode: 0o700 });
        await fs.promises.mkdir(auditDir, { recursive: true, mode: 0o700 });
        try {
          const stat = await fs.promises.stat(auditFile);
          try { await fs.promises.chmod(auditFile, 0o600); } catch (e) {}
          currentDay = new Date(stat.mtime).toISOString().slice(0, 10);
        } catch (e) {
          const handle = await fs.promises.open(auditFile, 'a', 0o600);
          await handle.close();
        }
        asyncReady = true;
      } catch (e) {
        /* appendFile will report the failure and flush() will requeue. */
      } finally {
        asyncInitPromise = null;
      }
    })();
    return asyncInitPromise;
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

  /* Async rotation is used only by the background flusher. It deliberately
     mirrors rotate() without any synchronous filesystem calls. */
  async function rotateAsync(reason = 'manual') {
    try {
      await ensureAsyncInit();
      const stat = await fs.promises.stat(auditFile);
      if (stat.size === 0 && eventCounter === 0) return null;
      await fs.promises.mkdir(auditDir, { recursive: true, mode: 0o700 });

      const now = new Date();
      const pad = (n) => String(n).padStart(2, '0');
      const ts = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}-${String(now.getMilliseconds()).padStart(3, '0')}`;
      const rotatedFile = path.join(auditDir, `audit-${ts}.log`);

      await fs.promises.rename(auditFile, rotatedFile);
      try { await fs.promises.chmod(rotatedFile, 0o600); } catch (e) {}
      try {
        await fs.promises.copyFile(rotatedFile, auditFile + '.1');
        await fs.promises.chmod(auditFile + '.1', 0o600);
      } catch (e) {}

      eventCounter = 0;
      currentDay = now.toISOString().slice(0, 10);
      const handle = await fs.promises.open(auditFile, 'a', 0o600);
      await handle.close();
      return rotatedFile;
    } catch (e) {
      return null;
    }
  }

  async function checkRotationAsync() {
    const today = new Date().toISOString().slice(0, 10);
    if (today !== currentDay) return rotateAsync('daily');
    if (eventCounter >= maxEvents) return rotateAsync('count');
    try {
      const stat = await fs.promises.stat(auditFile);
      if (stat.size >= maxBytes) return rotateAsync('size');
    } catch (e) {}
    return null;
  }

  /**
   * نوشتنِ پس‌زمینه (حالتِ async — Wave 9):
   * صف → یک appendFileِ دسته‌ای در setImmediate. ترتیبِ رویدادها با
   * صفِ FIFO و زنجیرهٔ تک‌نفرهٔ فلش حفظ می‌شود. شکستِ دیسک رویداد را در
   * صف نگه می‌دارد و فلشِ بعدی دوباره می‌کوشد (رویداد ممیزی هرگز
   * مسیرِ اصلی را نمی‌شکند — همان قراردادِ قبلی).
   */
  function enqueueLine(line) {
    /* The request path must never turn a slow disk into an unbounded heap.
       Drop newest lines once the explicit bound is reached; the counter is
       exposed for telemetry/operators and the oldest queued audit history is
       preserved. */
    if (flushQueue.length >= maxQueue) {
      droppedEvents++;
      if (!overflowWarned) {
        overflowWarned = true;
        try { process.emitWarning('audit async queue reached its bound; newest events are being dropped', { code: 'PAYESH_AUDIT_QUEUE_OVERFLOW' }); } catch (e) {}
      }
      return false;
    }
    flushQueue.push(line);
    if (!flushScheduled && !flushRunning) {
      flushScheduled = true;
      setImmediate(flush);
    }
    return true;
  }

  let flushPromise = null;
  async function flush() {
    flushScheduled = false;
    if (flushPromise) return flushPromise;
    flushPromise = (async () => {
      flushRunning = true;
      try {
        await ensureAsyncInit();
        while (flushQueue.length) {
          const batch = flushQueue;
          flushQueue = [];
          try { await checkRotationAsync(); } catch (e) {}
          const chunk = batch.join('');
          try { fs.mkdirSync(path.dirname(auditFile), { recursive: true, mode: 0o700 }); } catch (e) {}
          const ok = await new Promise((resolve) => {
            fs.appendFile(auditFile, chunk, { encoding: 'utf8', mode: 0o600 }, (err) => resolve(!err));
          });
          if (!ok) {
            /* Keep failed lines at the head of the FIFO. The next explicit
               flush (or a later enqueue) retries them instead of silently
               losing security evidence. */
            flushQueue = batch.concat(flushQueue);
            return false;
          }
        }
        return true;
      } finally {
        flushRunning = false;
        flushPromise = null;
      }
    })();
    return flushPromise;
  }

  /**
   * تخلیهٔ سنکرونِ صف — برای خروجِ فرآیند (exit/SIGTERM/SIGINT).
   * خارج از حالتِ async هیچ کاری نمی‌کند (صف همیشه خالی است).
   */
  function flushSync() {
    if (!asyncMode || !flushQueue.length) return;
    const chunk = flushQueue.join('');
    flushQueue = [];
    try {
      fs.mkdirSync(path.dirname(auditFile), { recursive: true, mode: 0o700 });
      fs.mkdirSync(auditDir, { recursive: true, mode: 0o700 });
      fs.appendFileSync(auditFile, chunk, { encoding: 'utf8', mode: 0o600 });
      try { fs.chmodSync(auditFile, 0o600); } catch (e) {}
    } catch (e) {
      /* Preserve the final batch for an embedding process that retries. */
      flushQueue = [chunk].concat(flushQueue);
    }
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
      /* Wave 9: در حالتِ async تصمیمِ چرخش به فلشِ پس‌زمینه می‌رود
         (checkRotationLight + سنجشِ حجم با statِ async) — دیگر هیچ
         statSync/rotate ای در مسیرِ خودِ رویداد نیست. */
      if (!asyncMode) checkRotation();

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
      if (asyncMode) {
        /* Wave 9: صفِ پس‌زمینه — بدونِ appendFileSync در مسیرِ رویداد */
        eventCounter++;
        enqueueLine(line);
      } else {
        try {
          const pdir = path.dirname(auditFile);
          if (!fs.existsSync(pdir)) fs.mkdirSync(pdir, { recursive: true, mode: 0o700 });
          fs.appendFileSync(auditFile, line, { encoding: 'utf8', mode: 0o600 });
        } catch (err) {
          try {
            const m = require('./metrics');
            m.inc('payesh_audit_write_failures_total', { sink: 'fs', reason: 'append_error' });
          } catch (_) {}
          console.error('[AUDIT_FS_ERROR] Failed to write audit log:', err && err.message ? err.message : String(err));
        }
        eventCounter++;
      }

      return entry;
    } catch (e) {
      try {
        const m = require('./metrics');
        m.inc('payesh_audit_write_failures_total', { sink: 'record', reason: 'record_error' });
      } catch (_) {}
      console.error('[AUDIT_RECORD_ERROR] Failed to record audit event:', e && e.message ? e.message : String(e));
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
  audit.getQueueStats = () => ({ queued: flushQueue.length, max: maxQueue, dropped: droppedEvents, flushing: flushRunning });
  audit.isAsync = () => asyncMode;
  audit.flush = asyncMode ? flush : async () => {};
  audit.flushSync = flushSync;

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
    getEventCounter: () => eventCounter,
    getQueueStats: () => ({ queued: flushQueue.length, max: maxQueue, dropped: droppedEvents, flushing: flushRunning }),
    isAsync: () => asyncMode,
    flush: asyncMode ? flush : (async () => {}),
    flushSync
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
  clientIp
};
