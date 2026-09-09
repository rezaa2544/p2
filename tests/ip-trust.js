#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   tests/ip-trust.js — F-AUTH-01: trusted-proxy client-IP unit tests
   خالص (بدون بالا آوردن سرور): جعلِ XFF از peer نامعتبر باید نادیده
   گرفته شود؛ XFF فقط وقتی معتبر است که peer در مجموعهٔ مورداعتماد باشد.
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

const { defaultTrusted, parseTrustedProxies, getClientIp } = require('../server/client-ip');

let pass = 0, fail = 0;
function chk(name, cond, extra){
  if(cond){ pass++; console.log('  ✅ ' + name); }
  else{ fail++; console.error('  ❌ ' + name + (extra !== undefined ? ' → ' + extra : '')); }
}
/* req ساختگی: (xff, peer) */
const R = (xff, peer) => ({
  headers: (xff == null) ? {} : { 'x-forwarded-for': xff },
  socket: (peer == null) ? {} : { remoteAddress: peer }
});

/* ── هسته: spoof از نامعتبر نادیده گرفته می‌شود ── */
chk('T1: XFF جعلی از peer نامعتبر ← peer',
  getClientIp(R('9.9.9.9', '203.0.113.7')) === '203.0.113.7');

/* ── سازگاری: پیش‌فرض loopback یعنی XFF از همان ماشین معتبر است ── */
chk('T2: peer برابر loopback ← XFF معتبر',
  getClientIp(R('9.9.9.9', '127.0.0.1')) === '9.9.9.9');
chk('T3: ::ffff:127.0.0.1 هم loopback است',
  getClientIp(R('9.9.9.9', '::ffff:127.0.0.1')) === '9.9.9.9');

/* ── اعتمادِ صریح ── */
const T1 = parseTrustedProxies('10.0.0.1');
chk('T4: peer مورداعتماد ← XFF',
  getClientIp(R('9.9.9.9', '10.0.0.1'), T1) === '9.9.9.9');
const T2 = parseTrustedProxies('10.0.0.1,10.0.0.2');
chk('T5: زنجیرهٔ چندپراکسی ← چپ‌ترینِ غیرقابل‌اعتماد',
  getClientIp(R('198.51.100.9, 10.0.0.1', '10.0.0.2'), T2) === '198.51.100.9');
chk('T6: همه قابل‌اعتماد ← چپ‌ترین خانه',
  getClientIp(R('10.0.0.9, 10.0.0.1', '10.0.0.2'),
    parseTrustedProxies('10.0.0.9,10.0.0.1,10.0.0.2')) === '10.0.0.9');

/* ── ورودیِ خراب: fail-closed به‌سمت peer ── */
chk('T7: خانهٔ نامعتبر نادیده گرفته می‌شود',
  getClientIp(R('garbage!!, 9.9.9.8', '10.0.0.1'), T1) === '9.9.9.8');
chk('T8: XFF خالی ← peer',
  getClientIp(R('', '10.0.0.5'), T1) === '10.0.0.5');
chk('T9: بدون سوکت و XFF ← null',
  getClientIp({ headers: {} }, T1) === null);
chk('T10: IPv6 معتبر پذیرفته می‌شود',
  getClientIp(R('2001:db8::1', '10.0.0.1'), T1) === '2001:db8::1');

/* ── معنای پارسِ env ── */
chk('T11: unset ← دقیقاً loopback',
  (() => { const s = parseTrustedProxies(undefined);
    return s.has('127.0.0.1') && s.has('::1') && s.size === 2; })());
chk('T12: رشتهٔ خالیِ صریح ← اعتمادِ صفر',
  parseTrustedProxies('').size === 0);
chk('T13: توکنِ نامعتبر حذف می‌شود',
  (() => { const s = parseTrustedProxies('10.0.0.1, nope');
    return s.size === 1 && s.has('10.0.0.1'); })());
chk('T14: defaultTrusted همان loopback است',
  (() => { const s = defaultTrusted();
    return s.has('127.0.0.1') && s.has('::1') && s.size === 2; })());
chk('T15: trusted نامعتبر ← پیش‌فرض',
  getClientIp(R('9.9.9.9', '127.0.0.1'), 'nope') === '9.9.9.9');

console.log(`\nIP-Trust Tests: ${pass}/${pass + fail} passed`);
if(fail > 0) process.exit(1);
