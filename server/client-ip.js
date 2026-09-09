/* ═══════════════════════════════════════════════════════════════════
   server/client-ip.js — F-AUTH-01: trusted-proxy-aware client IP

   مشکل: خواندنِ کورِ X-Forwarded-For (اولین خانه) به مهاجمِ مستقیم اجازه
   می‌داد IP دلخواه جا بزند و سقف‌های نرخیِ IP-محور + لاگ حسابرسی را مسموم کند.

   قرارداد:
   - PAYESH_TRUSTED_PROXIES (جدا با ویرگول): پراکسی‌های مورداعتماد.
     ‣ تنظیم‌نشده → فقط loopback (127.0.0.1 و ::1)؛ یعنی استقرارِ
       استانداردِ تک‌میزبانه با reverse-proxy روی همان ماشین، بدون هیچ
       تنظیمی امن است. اتصالِ مستقیمِ مهاجم (remoteAddress غیرِ loopback)
       هرگز XFF را معتبر نمی‌کند.
     ‣ تنظیم‌شده (حتی رشتهٔ خالی) → دقیقاً همان مجموعه (خالی = اعتمادِ صفر).
   - زنجیره [xff..., peer] از راست (peer) به چپ پیموده می‌شود تا اولینِ
     غیرقابل‌اعتماد؛ اگر همه قابل‌اعتماد بودند، چپ‌ترین خانه برمی‌گردد.
   - خانه‌های نامعتبر (نه IPv4 نه IPv6) نادیده گرفته می‌شوند (fail-closed
     به‌سمت peer)، نه اینکه کل سرآیند دور ریخته شود.
   Runtime deps: Node stdlib only (net).
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
const net = require('net');

/* پیش‌فرضِ امن: فقط اتصال‌های برخاسته از خودِ ماشین */
const LOOPBACK_DEFAULT = ['127.0.0.1', '::1'];

/* نرمال‌سازی به فرمِ کانونیِ قابل‌مقایسه؛ نامعتبر → null */
function normalizeIp(ip){
  if(typeof ip !== 'string') return null;
  let s = ip.trim();
  if(!s) return null;
  /* IPv4ِ نگاشته‌شده روی سوکتِ دوگانه: ::ffff:127.0.0.1 */
  if(s.toLowerCase().indexOf('::ffff:') === 0) s = s.slice(7);
  s = s.toLowerCase();
  /* براکتِ IPv6 در XFF (مثل [2001:db8::1]) */
  if(s.length > 2 && s[0] === '[' && s[s.length - 1] === ']') s = s.slice(1, -1);
  return net.isIP(s) ? s : null;
}

function defaultTrusted(){
  return new Set(LOOPBACK_DEFAULT);
}

/* پارسِ PAYESH_TRUSTED_PROXIES؛ undefined/null → پیش‌فرضِ loopback */
function parseTrustedProxies(val){
  if(val === undefined || val === null) return defaultTrusted();
  const set = new Set();
  String(val).split(',').forEach(tok => {
    const n = normalizeIp(tok);
    if(n) set.add(n);
  });
  return set;
}

/* IP واقعیِ کلاینت از روی req؛ trusted نامعتبر → پیش‌فرضِ loopback */
function getClientIp(req, trusted){
  const trust = (trusted instanceof Set) ? trusted : defaultTrusted();
  const chain = [];
  const hdrs = req && req.headers;
  const xff = hdrs ? hdrs['x-forwarded-for'] : null;
  if(typeof xff === 'string' && xff){
    xff.split(',').forEach(tok => {
      const n = normalizeIp(tok);
      if(n) chain.push(n);
    });
  }
  const peer = normalizeIp(req && req.socket && req.socket.remoteAddress);
  if(peer) chain.push(peer);
  if(!chain.length) return null;
  let i = chain.length - 1;
  while(i > 0 && trust.has(chain[i])) i--;
  return chain[i];
}

module.exports = { normalizeIp, defaultTrusted, parseTrustedProxies, getClientIp };
