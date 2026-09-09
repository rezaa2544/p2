/* ═══════════════════════════════════════════════════════════════════
   server/waf.js — لایهٔ تشخیصِ WAF درونِ برنامه (فقط-تشخیص، هرگز مسدود)
   ───────────────────────────────────────────────────────────────────
   - ورودی‌ها: نشانی (خام + decodeشده) و User-Agent؛ بدنه هرگز خوانده نمی‌شود.
   - خروجی‌ها: req.context.waf ‏+ سرآیندِ X-WAF-Verdict ‏+ ممیزیِ throttled.
   - نرخ: شمارشِ Redis-محور (checkRateLimit) فقط برای سرآیندِ advisory؛
     اِعمالِ واقعیِ نرخ = nginx/Cloudflare (لبه). v1 هیچ تصمیمِ دسترسی
     نمی‌گیرد، پس fail-open/closed در کار نیست: خطا = بی‌سرآیند + ادامه.
   - ممیزی: فقط (rule, field, ip)؛ هیچ‌وقت excerpt از payload (PII).
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

var WAF_VERSION = 1;
var RATE_LIMIT = 100;      /* هم‌عدد با nginx (درخواست در دقیقه برای هر IP) */
var RATE_WINDOW = 60;      /* ثانیه */
var REDIS_TIMEOUT_MS = 100;/* سقفِ انتظارِ Redis در هر درخواست */
var AUDIT_PER_RULE = 5;    /* سقفِ ممیزی در دقیقه برای هر rule (ضدِ سیل) */

var RULES = [
  { id: 'traversal', field: 'url', res: [
    /\.\.[\/\\]/, /%2e%2e/i, /%252e/i, /%c0%ae/i,
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

/* ممیزیِ throttled (awaitشدنی؛ خطا = سکوت؛ فقط روی تشخیص صدا زده می‌شود). */
async function throttledAudit(verdict, ip) {
  try {
    var cache = lazyMod('./cache.js');
    var am = lazyMod('./audit.js');
    if (!cache || !am || typeof cache.checkRateLimit !== 'function') return;
    var r = await withTimeout(cache.checkRateLimit(verdict.rule, 'waf:audit', AUDIT_PER_RULE, 60), REDIS_TIMEOUT_MS);
    if (r && r.allowed && typeof am.audit === 'function') {
      am.audit('waf_detect', { rule: verdict.rule, field: verdict.field, ip: ip });
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
    if (verdict) { try { await throttledAudit(verdict, ip); } catch (e) {} }
  } catch (e) {
    try { if (req) req.context = req.context || {}; } catch (_) {}
  }
}

module.exports = {
  WAF_VERSION: WAF_VERSION,
  RATE_LIMIT: RATE_LIMIT,
  RATE_WINDOW: RATE_WINDOW,
  RULES: RULES,
  evaluateInput: evaluateInput,
  wafMiddleware: wafMiddleware,
  withTimeout: withTimeout
};
