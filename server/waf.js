/* ═══════════════════════════════════════════════════════════════════
   server/waf.js — لایهٔ تشخیصِ WAF درونِ برنامه (فقط-تشخیص، هرگز مسدود)
   ───────────────────────────────────────────────────────────────────
   - ورودی‌ها: نشانی (خام + decodeشده) و User-Agent؛ بدنه هرگز خوانده نمی‌شود.
   - خروجی‌ها: req.context.waf ‏+ سرآیندِ X-WAF-Verdict ‏+ ممیزیِ throttled.
   - نرخ: شمارشِ Redis-محور (checkRateLimit) فقط برای سرآیندِ advisory؛
     اِعمالِ واقعیِ نرخ = nginx/Cloudflare (لبه).
   - حالت‌ها (P0 #6): PAYESH_WAF_MODE=report (پیش‌فرض — رفتارِ v1: هیچ
     تصمیمی گرفته نمی‌شود) یا enforce: هر verdict = 403 waf_blocked،
     مگر مسیرِ allowlist (fail-safe: مسیرهای ضرورِی هرگز مسدود نمی‌شوند؛
     PAYESH_WAF_ALLOW پیشوندِ اضافی). خطایِ خودِ enforce = fail-open.
   - ممیزی: فقط (rule, field, ip)؛ هیچ‌وقت excerpt از payload (PII).
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

var WAF_VERSION = 1;
var RATE_LIMIT = 100;      /* هم‌عدد با nginx (درخواست در دقیقه برای هر IP) */
var RATE_WINDOW = 60;      /* ثانیه */
var REDIS_TIMEOUT_MS = 100;/* سقفِ انتظارِ Redis در هر درخواست */
var AUDIT_PER_RULE = 5;    /* سقفِ ممیزی در دقیقه برای هر rule (ضدِ سیل) */

/* P0 #6 — حالتِ WAF: report (فقط-تشخیص) | enforce (مسدودکننده).
   N-28 — پیش‌فرض در production اکنون enforce است: یک فایروالِ برنامه‌ای که
   فقط لاگ می‌کرد عملاً فایده‌ای نداشت و هر بارِ استقرار که
   PAYESH_WAF_MODE=enforce را فراموش می‌کرد کلِ این لایه را بی‌اثر می‌کرد.
   همچنان با تنظیمِ صریحِ PAYESH_WAF_MODE=report در dev/test قابلِ خاموش‌کردن
   است. */
function detectWafMode() {
  var explicit = String(process.env.PAYESH_WAF_MODE || '').trim().toLowerCase();
  if (explicit === 'enforce') return 'enforce';
  if (explicit === 'report') return 'report';
  var env = String(process.env.PAYESH_ENV || '').trim().toLowerCase();
  var nodeEnv = String(process.env.NODE_ENV || '').trim().toLowerCase();
  return (env === 'production' || nodeEnv === 'production') ? 'enforce' : 'report';
}
var WAF_MODE = detectWafMode();

/* fail-safe: مسیرهای ضروری که در enforce هرگز مسدود نمی‌شوند (حتی اگر
   الگویی بخورد) — پروب‌های زیرساخت؛ اپراتور می‌تواند با PAYESH_WAF_ALLOW
   (کاما-جداسازِ پیشوندها) گسترش دهد. */
var ALLOW_BASE = ['^/api/health$', '^/api/liveness$', '^/api/readiness$', '^/metrics$'];
function isAllowlisted(pathname) {
  try {
    pathname = String(pathname || '');
    for (var i = 0; i < ALLOW_BASE.length; i++) {
      if (new RegExp(ALLOW_BASE[i]).test(pathname)) return true;
    }
    var extra = String(process.env.PAYESH_WAF_ALLOW || '')
      .split(',').map(function (x) { return x.trim(); }).filter(Boolean);
    for (var j = 0; j < extra.length; j++) {
      if (pathname === extra[j] || pathname.indexOf(extra[j] + '/') === 0) return true;
    }
  } catch (e) {}
  return false;
}

var RULES = [
  { id: 'traversal', field: 'url', res: [
    /\.\.[/\\]/, /%2e%2e/i, /%252e/i, /%c0%ae/i,
    /\/etc\/(?:passwd|shadow|hosts)/i, /[a-z]:[\\/]/i
  ] },
  { id: 'sqli', field: 'url', res: [
    /union\s+select/i,
    /(\bor\b|\band\b)\s+\d+\s*=\s*\d+/i,
    /'\s*(?:or|and)\s+'?\w+'?\s*=\s*'?\w+/i,
    /;\s*(?:drop|delete|insert|update|shutdown|exec(?:ute)?|declare)\b/i,
    /--\s*$/, /\/\*.*\*\//,
    /sleep\s*\(\s*\d+/i, /benchmark\s*\(/i, /pg_sleep\s*\(/i,
    /information_schema|load_file|into\s+(?:outfile|dumpfile)/i
  ] },
  { id: 'xss', field: 'url', res: [
    /<\s*script/i, /javascript\s*:/i,
    /<\s*(?:img|svg|iframe|object|embed|video|audio|body|style|link|meta)\b/i,
    /<\w+[^>]*\son\w+\s*=/i, /(?:^|[?&;])\s*on\w{2,}\s*=/i,
    /expression\s*\(/i, /vbscript\s*:/i
  ] },
  { id: 'badbot', field: 'ua', res: [
    /sqlmap|nikto|nmap|masscan|hydra|medusa|metasploit|zgrab|shodan|nessus|openvas|wpscan|dirbuster|gobuster|ffuf|burp|acunetix|netsparker|appscan|censys|streetsurf/i
  ] }
];

/* N-28 — قوانینِ بدنه: کپیِ همان الگوهای url (sqli/xss/traversal) با
   پسوندِ _body. url-only بودنِ WAF یعنی یک تزریق درِ بدنهٔ POST به‌سادگی
   از کنارش رد می‌شد. الگوها ازِ RULES بازیافت می‌شوند تا با تکاملِ
   قوانینِ url، بدنه هم هم‌گام بماند (یک منبع، دو میدان). */
var BODY_RULES = (function () {
  var src = { sqli: true, xss: true, traversal: true };
  var out = [];
  for (var i = 0; i < RULES.length; i++) {
    var r = RULES[i];
    if (src[r.id]) out.push({ id: r.id + '_body', res: r.res });
  }
  return out;
})();

function evaluateBody(text) {
  try {
    var hay = String(text || '');
    if (!hay) return null;
    for (var i = 0; i < BODY_RULES.length; i++) {
      var rule = BODY_RULES[i];
      for (var j = 0; j < rule.res.length; j++) {
        if (rule.res[j].test(hay)) return { rule: rule.id, field: 'body' };
      }
    }
  } catch (e) {}
  return null;
}

/* N-28 — نگاهی کوتاه به بدنهٔ درخواست. wafMiddleware قبل از readBodyِ
   مسیر اجرا می‌شود، پس جریان را کامل می‌خوانیم و بافر را روی req نگه
   می‌داریم تا readBody از آن بازپخش کند (unshift بعد از رویدادِ end در Node
   مجاز نیست؛ بازپخشِ بافر قطعی و بدونِ خطرِ بریدنِ جریان است). کران‌دار و
   fail-open در هر خطا. */
var BODY_PEEK_CAP = 2 * 1024 * 1024;
function peekBody(req) {
  return new Promise(function (resolve) {
    try {
      if (!req || typeof req.on !== 'function') return resolve(null);
      var chunks = [];
      var size = 0;
      var done = false;
      var finish = function (txt) {
        if (done) return;
        done = true;
        try { req.removeListener('data', onData); } catch (e) {}
        try { req.removeListener('end', onEnd); } catch (e) {}
        try { req.removeListener('error', onError); } catch (e) {}
        resolve(txt);
      };
      var onData = function (c) {
        try {
          size += c.length;
          if (size > BODY_PEEK_CAP) { req._wafBodyTooLarge = true; finish(null); return; }
          chunks.push(c);
        } catch (e) { finish(null); }
      };
      var onEnd = function () {
        try {
          var buf = Buffer.concat(chunks, size);
          req._wafBodyBuffer = buf;
          finish(buf.toString('utf8'));
        } catch (e) { finish(null); }
      };
      var onError = function () { finish(null); };
      req.on('data', onData);
      req.on('end', onEnd);
      req.on('error', onError);
    } catch (e) { resolve(null); }
  });
}

/* ورودیِ یک درخواست (خالص، تست‌پذیر) → { rule, field } یا null. */
function evaluateInput(input) {
  input = input || {};
  var rawUrl = String(input.url || '');
  var ua = String(input.ua || '');
  var decUrl = rawUrl;
  try { decUrl = decodeURIComponent(rawUrl); } catch (e) { decUrl = rawUrl; }
  for (var i = 0; i < RULES.length; i++) {
    var rule = RULES[i];
    var hay = rule.field === 'ua' ? ua : (rawUrl + '\n' + decUrl);
    for (var j = 0; j < rule.res.length; j++) {
      if (rule.res[j].test(hay)) return { rule: rule.id, field: rule.field };
    }
  }
  return null;
}

/* سقفِ زمانی برای فراخوانی‌های Redis (خود-DDoS نکنیم). */
function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise(function (resolve) { setTimeout(function () { resolve(null); }, ms); })
  ]);
}

function lazyMod(name) {
  try { return require(name); } catch (e) { return null; }
}

/* ممیزیِ throttled (awaitشدنی؛ خطا = سکوت؛ فقط روی تشخیص صدا زده می‌شود).
   event: 'waf_detect' (report) یا 'waf_block' (enforce). */
async function throttledAudit(verdict, ip, event) {
  try {
    var cache = lazyMod('./cache.js');
    var am = lazyMod('./audit.js');
    if (!cache || !am || typeof cache.checkRateLimit !== 'function') return;
    var r = await withTimeout(cache.checkRateLimit(verdict.rule, 'waf:audit', AUDIT_PER_RULE, 60), REDIS_TIMEOUT_MS);
    if (r && r.allowed && typeof am.audit === 'function') {
      am.audit(event || 'waf_detect', { rule: verdict.rule, field: verdict.field, ip: ip });
    }
  } catch (e) {}
}

/* میدلویر (async، هرگز throw، هرگز block). */
async function wafMiddleware(req, res) {
  try {
    var url = (req && req.url) || '';
    var ua = (req && req.headers && req.headers['user-agent']) || '';
    var verdict = null;
    try { verdict = evaluateInput({ url: url, ua: ua }); } catch (e) { verdict = null; }
    /* N-28 — بدنه: فقط برای متدهایی که بدنه دارند و فقط اگر url تمیز است
       (یک verdictِ url همینجا برنده است؛ بدنه خوانده نمی‌شود). */
    if (!verdict && req && req.method) {
      var m = String(req.method).toUpperCase();
      if (m === 'POST' || m === 'PUT' || m === 'PATCH') {
        try {
          var bodyTxt = await peekBody(req);
          if (bodyTxt) {
            try { verdict = evaluateBody(bodyTxt); } catch (e) { verdict = null; }
          }
        } catch (e) { verdict = null; }
      }
    }
    req.context = req.context || {};
    var w = { v: WAF_VERSION, verdict: verdict ? verdict.rule : 'clean' };
    var ip = '';
    try {
      var am = lazyMod('./audit.js');
      ip = (am && typeof am.clientIp === 'function') ? String(am.clientIp(req) || '') : '';
    } catch (e) { ip = ''; }
    try {
      var cache = lazyMod('./cache.js');
      if (cache && typeof cache.checkRateLimit === 'function') {
        var rl = await withTimeout(cache.checkRateLimit(ip || 'unknown', 'waf:ip', RATE_LIMIT, RATE_WINDOW), REDIS_TIMEOUT_MS);
        if (rl) {
          w.rate = { limit: RATE_LIMIT, remaining: rl.remaining, over: !rl.allowed };
          try {
            res.setHeader('X-RateLimit-Limit', String(RATE_LIMIT));
            res.setHeader('X-RateLimit-Remaining', String(rl.remaining));
            res.setHeader('X-RateLimit-Reset', String(Math.floor(Date.now() / 1000) + RATE_WINDOW));
          } catch (e) {}
        }
      }
    } catch (e) {}
    req.context.waf = w;
    try { res.setHeader('X-WAF-Verdict', w.verdict); } catch (e) {}
    /* P0 #6 — ENFORCE (PAYESH_WAF_MODE=enforce): verdict = 403 waf_blocked،
       مگر مسیرِ fail-safeِ allowlist. هر خطا در این بلوک = fail-open. */
    if (WAF_MODE === 'enforce' && verdict) {
      try {
        var pathOnly = url;
        try { pathOnly = String(new URL(url, 'http://waf.local').pathname || url); } catch (e) {}
        if (isAllowlisted(pathOnly)) {
          w.allowlisted = true; /* verdict دیده شد اما fail-safe مسدود نکرد */
        } else {
          w.blocked = verdict.rule;
          w.action = 'block';
          try { res.setHeader('X-WAF-Action', 'block'); } catch (e) {}
          try { await throttledAudit(verdict, ip, 'waf_block'); } catch (e) {}
          var body = JSON.stringify({ ok: false, code: 'waf_blocked', rule: verdict.rule });
          res.statusCode = 403;
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.setHeader('Content-Length', String(Buffer.byteLength(body)));
          res.end(body);
          return;
        }
      } catch (e) { /* report-mode fallback: خودِ evaluateInput هرگز throw نمی‌دهد (قرارداد میدلویر)؛ این catch فقط نگهبان نهایی است و در enforce خرابی باید در audit دیده شود */ }
    }
    if (verdict && !w.blocked) { try { await throttledAudit(verdict, ip); } catch (e) {} }
  } catch (e) {
    try { if (req) req.context = req.context || {}; } catch (_) {}
  }
}

module.exports = {
  WAF_VERSION: WAF_VERSION,
  WAF_MODE: WAF_MODE,
  ALLOW_BASE: ALLOW_BASE,
  isAllowlisted: isAllowlisted,
  RATE_LIMIT: RATE_LIMIT,
  RATE_WINDOW: RATE_WINDOW,
  RULES: RULES,
  BODY_RULES: BODY_RULES,
  evaluateInput: evaluateInput,
  evaluateBody: evaluateBody,
  peekBody: peekBody,
  detectWafMode: detectWafMode,
  wafMiddleware: wafMiddleware,
  withTimeout: withTimeout
};
