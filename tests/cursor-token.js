#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   cursor-token.js — PR #60 (Delta Hardening Phase 2): signed, TTL-bound
   delta-pull cursor. The module shipped without a dedicated suite; this file
   is that suite (باگ‌هانت چت ۵، نشست ۷ — بستنِ شکافِ پوشش).

   قراردادِ سنجیده‌شده:
     C1  کلیدِ قوی ⇒ enabled؛ بی‌کلید ⇒ خاموش (fail-closed)
     C2  قالبِ توکن: pc1.<b64url(payload)>.<b64url(HMAC)> + فیلدهای payload
     C3  roundtrip: verify(sign(since)).payload.since === since
     C4  دست‌کاریِ payload ⇒ cursor_invalid (امضا اول بررسی می‌شود)
     C5  دست‌کاریِ امضا ⇒ cursor_invalid
     C6  منقضی ⇒ cursor_expired
     C7  منقضیِ جعلی (امضای نامعتبر) ⇒ cursor_invalid، نه expired
     C8  iat در آیندهٔ دور (> MAX_SKEW_S) ⇒ cursor_invalid
     C9  قالب‌های بدشکل (پیشوند/تعداد بخش/اندازه) ⇒ cursor_invalid
     C10 خاموش‌بودن ⇒ cursor_unavailable (هرگز silent trust)
     C11 کلمپِ TTL: 60..86400 + پیش‌فرضِ ۳۶۰۰ + env
     C12 جداسازیِ دامنه: کلیدِ امضا = sha256("payesh.cursor.v1|secret") نه خودِ راز
     C13 رازِ کوتاه (<۳۲) نادیده ⇒ خاموش
     C14 since نامعتبر ⇒ sign = null
     C15 jti یکتا در دو امضا
     C16 نسخهٔ ناشناخته (v:2) با امضای درست ⇒ باز هم invalid
     C17 هم‌ارزیِ کلید از منابع مختلف (چند-نمونه‌ای): explicit ≡ env با همان رشته
     C18 سیم‌کشیِ pull.js: کدهای سه‌گانه + cursor_renewal:'full_pull' + next_cursor
   اجرا: node tests/cursor-token.js (بدونِ سرور/پورت)
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { createCursor, resolveSecret, ttlSeconds, DEFAULT_TTL_S, MIN_TTL_S, MAX_TTL_S } =
  require('../server/cursor.js');

let okc = 0, failc = 0;
const fails = [];
function chk(name, cond, extra) {
  if (cond) { okc++; console.log('  ✅ ' + name); }
  else { failc++; fails.push(name + (extra ? ' — ' + extra : '')); console.log('  ❌ ' + name + (extra ? ' — ' + extra : '')); }
}
const ROOT = path.join(__dirname, '..');
const STRONG = 'a'.repeat(48);
const b64u = (s) => Buffer.from(s).toString('base64url');
/* امضایِ ساختگی با دانستنِ کلیدِ مشتق‌شده — برای تست‌های آدم‌ورزی (نه نفوذ) */
const signPayload = (secret, payloadObj) => {
  const key = resolveSecret(secret);
  const body = b64u(JSON.stringify(payloadObj));
  const sig = crypto.createHmac('sha256', key).update('pc1.' + body).digest();
  return 'pc1.' + body + '.' + Buffer.from(sig).toString('base64url');
};

/* ── env را در تمامِ سوئیت دست‌نخورده نگه می‌داریم ── */
const savedEnv = {
  CURSOR: process.env.PAYESH_CURSOR_SECRET,
  JWT: process.env.PAYESH_JWT_SECRET,
  TTL: process.env.PAYESH_CURSOR_TTL_S
};
const restoreEnv = () => {
  for (const [k, v] of [['PAYESH_CURSOR_SECRET', savedEnv.CURSOR], ['PAYESH_JWT_SECRET', savedEnv.JWT], ['PAYESH_CURSOR_TTL_S', savedEnv.TTL]]) {
    if (v === undefined) delete process.env[k]; else process.env[k] = v;
  }
};
delete process.env.PAYESH_CURSOR_SECRET; delete process.env.PAYESH_JWT_SECRET; delete process.env.PAYESH_CURSOR_TTL_S;

console.log('\n▸ PR #60 — نشانهٔ کرسرِ امضاشده (server/cursor.js)');

/* ── C1/C2/C3: قالب، roundtrip، فیلدها ── */
{
  const c = createCursor({ secret: STRONG });
  chk('C1a رازِ قوی ⇒ enabled', c.enabled === true);
  chk('C1b بی‌کلید ⇒ خاموش و sign=null', createCursor({}).enabled === false && createCursor({}).sign('2026-09-11T00:00:00Z') === null);

  const since = '2026-09-11T03:04:05.000Z';
  const tok = c.sign(since);
  chk('C2a قالبِ سه‌بخشیِ pc1', /^pc1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(String(tok)), String(tok).slice(0, 24) + '…');
  const payload = JSON.parse(Buffer.from(String(tok).split('.')[1], 'base64url').toString('utf8'));
  chk('C2b فیلدهای payload (v=1, since, iat, exp, jti)', payload.v === 1 && payload.since === since
    && Number.isFinite(payload.iat) && payload.exp === payload.iat + c.ttlS && /^[0-9a-f]{16}$/.test(payload.jti));
  const v = c.verify(tok);
  chk('C3 roundtrip: verify(sign(since)).payload.since', v.ok === true && v.payload.since === since);
}

/* ── C4/C5: دست‌کاری ── */
{
  const c = createCursor({ secret: STRONG });
  const tok = c.sign('2026-09-11T00:00:00Z');
  const [p, body, sig] = String(tok).split('.');
  const evil = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  evil.since = '2020-01-01T00:00:00Z';
  const tampered = p + '.' + b64u(JSON.stringify(evil)) + '.' + sig;
  chk('C4 دست‌کاریِ payload ⇒ cursor_invalid', c.verify(tampered).code === 'cursor_invalid', JSON.stringify(c.verify(tampered)));
  const flip = sig.slice(0, -2) + (sig.endsWith('AA') ? 'BB' : 'AA');
  chk('C5 دست‌کاریِ امضا ⇒ cursor_invalid', c.verify(p + '.' + body + '.' + flip).code === 'cursor_invalid');
}

/* ── C6/C7/C8: زمان ── */
{
  let t = 1_800_000_000;
  const c = createCursor({ secret: STRONG, ttlS: 600, now: () => t });
  const tok = c.sign('2026-09-11T00:00:00Z');
  chk('C6a داخلِ TTL ⇒ ok', c.verify(tok).ok === true);
  t += 600;                                  /* دقیقاً سرِ exp */
  chk('C6b در exp ⇒ cursor_expired (مرز شامل)', c.verify(tok).code === 'cursor_expired');
  /* C7: منقضی اما جعلی — امضای نامعتبر نباید expired بگیرد */
  const forged = 'pc1.' + b64u(JSON.stringify({ v: 1, since: '2026-09-11T00:00:00Z', iat: 1, exp: 2, jti: 'ff'.repeat(8) })) + '.' + b64u('x');
  chk('C7 منقضیِ جعلی ⇒ cursor_invalid (امضا اول)', c.verify(forged).code === 'cursor_invalid');
  /* C8: iat در آیندهٔ دور */
  const fut = signPayload(STRONG, { v: 1, since: '2026-09-11T00:00:00Z', iat: t + 301, exp: t + 999, jti: 'ab'.repeat(8) });
  chk('C8 iat جلوتر از MAX_SKEW (۳۰۰s) ⇒ cursor_invalid', c.verify(fut).code === 'cursor_invalid');
  const near = signPayload(STRONG, { v: 1, since: '2026-09-11T00:00:00Z', iat: t + 299, exp: t + 999, jti: 'cd'.repeat(8) });
  chk('C8b لبهٔ مجازِ skew (۲۹۹s) ⇒ ok', c.verify(near).ok === true);
}

/* ── C9/C10: قالبِ بدشکل و خاموشی ── */
{
  const c = createCursor({ secret: STRONG });
  const bad = [
    '', 'x', 'pc1', 'pc1.body', 'pc2.' + b64u('{}') + '.' + b64u('x'),
    'pc1.' + b64u('not-json') + '.' + b64u('x'), 'pc1.' + b64u('{"v":2}') + '.' + b64u('x'),
    'pc1.' + b64u('null') + '.' + b64u('x'), 'pc1.' + b64u('[]') + '.' + b64u('x')
  ];
  chk('C9a قالب‌های بدشکل/نسخهٔ ناسازگار ⇒ cursor_invalid', bad.every((b) => c.verify(b).code === 'cursor_invalid'), bad.map((b) => c.verify(b).code).join(','));
  chk('C9b توکنِ بزرگ‌تر از ۴۰۹۶ بایت ⇒ cursor_invalid', c.verify('pc1.' + 'A'.repeat(5000) + '.x').code === 'cursor_invalid');
  chk('C9c توکنِ غیررشته (عدد/null) ⇒ cursor_invalid', c.verify(123).code === 'cursor_invalid' && c.verify(null).code === 'cursor_invalid');
  const off = createCursor({});
  chk('C10 خاموش: verify ⇒ cursor_unavailable (نه silent trust)', off.verify('pc1.x.y').code === 'cursor_unavailable');
}

/* ── C11: کلمپِ TTL ── */
{
  chk('C11a کف: ttlS=1 ⇒ ۶۰', createCursor({ secret: STRONG, ttlS: 1 }).ttlS === MIN_TTL_S);
  chk('C11b سقف: ttlS=10^9 ⇒ ۸۶۴۰۰', createCursor({ secret: STRONG, ttlS: 1e9 }).ttlS === MAX_TTL_S);
  chk('C11c پیش‌فرضِ ۳۶۰۰', createCursor({ secret: STRONG }).ttlS === DEFAULT_TTL_S);
  process.env.PAYESH_CURSOR_TTL_S = '7200';
  chk('C11d env تنظیم می‌کند', createCursor({ secret: STRONG }).ttlS === 7200 && ttlSeconds() === 7200);
  process.env.PAYESH_CURSOR_TTL_S = 'not-a-number';
  chk('C11e env نامعتبر ⇒ پیش‌فرض (نه NaN)', createCursor({ secret: STRONG }).ttlS === DEFAULT_TTL_S);
  delete process.env.PAYESH_CURSOR_TTL_S;
}

/* ── C12/C13: جداسازیِ دامنه و رازِ کوتاه ── */
{
  const expected = crypto.createHash('sha256').update('payesh.cursor.v1|' + STRONG).digest('hex');
  chk('C12a کلیدِ مشتق = sha256("payesh.cursor.v1|secret")', resolveSecret(STRONG) === expected);
  chk('C12b کلیدِ مشتق هرگز خودِ راز نیست', resolveSecret(STRONG) !== STRONG && resolveSecret(STRONG) !== crypto.createHash('sha256').update(STRONG).digest('hex'));
  const jwt = 'jwt-secret'.repeat(8);
  const cJwt = createCursor({ secret: jwt });
  const derivedJwt = crypto.createHash('sha256').update('payesh.cursor.v1|' + jwt).digest('hex');
  const t = cJwt.sign('2026-09-11T00:00:00Z');
  const sig = Buffer.from(String(t).split('.')[2], 'base64url');
  const rawJwtSig = crypto.createHmac('sha256', jwt).update(String(t).split('.').slice(0, 2).join('.')).digest();
  chk('C12c امضا با کلیدِ خام JWT معتبر نمی‌شود (domain separation)', !sig.equals(rawJwtSig)
    && crypto.createHmac('sha256', derivedJwt).update(String(t).split('.').slice(0, 2).join('.')).digest().equals(sig));
  chk('C13 رازِ کوتاه (<۳۲ بایت) نادیده ⇒ خاموش', resolveSecret('short') === null && createCursor({ secret: 'short' }).enabled === false);
}

/* ── C14/C15/C16/C17: ورودی و نسخه و چند-نمونه‌ای ── */
{
  const c = createCursor({ secret: STRONG });
  chk('C14 since نامعتبر/خالی ⇒ sign=null', c.sign('') === null && c.sign('نه-تاریخ') === null && c.sign(null) === null);
  chk('C15 jti یکتا در دو امضا', c.sign('2026-09-11T00:00:00Z') !== c.sign('2026-09-11T00:00:00Z'));
  const v2 = signPayload(STRONG, { v: 2, since: '2026-09-11T00:00:00Z', iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 60, jti: 'ee'.repeat(8) });
  chk('C16 v:2 با امضای درست ⇒ باز هم cursor_invalid', c.verify(v2).code === 'cursor_invalid');
  process.env.PAYESH_JWT_SECRET = STRONG;
  const viaEnv = createCursor({});
  const viaExplicit = createCursor({ secret: STRONG });
  const tEnv = viaEnv.sign('2026-09-11T00:00:00Z');
  chk('C17 چند-نمونه‌ای: کلیدِ env(JWT) ≡ کلیدِ explicit با همان رشته', viaEnv.enabled && viaExplicit.verify(tEnv).ok === true);
  delete process.env.PAYESH_JWT_SECRET;
}

/* ── C18: سیم‌کشیِ pull.js (پینِ ساکن — به‌همراهِ راستی‌آزمایی زندهٔ نشست) ── */
{
  const pull = fs.readFileSync(path.join(ROOT, 'server', 'pull.js'), 'utf8');
  chk('C18a pull هر سه کدِ شکست را مصرف می‌کند', pull.includes('cursor_expired') && pull.includes('cursor_invalid') && pull.includes('cursor_unavailable'));
  chk('C18b ناوبریِ بازگشت: cursor_renewal: \'full_pull\'', /cursor_renewal:\s*'full_pull'/.test(pull));
  chk('C18c next_cursor فقط از signerِ enabled + TTL در پاسخ', /cursor\.enabled\s*\?\s*cursor\.sign\(/.test(pull) && /cursor_ttl_s/.test(pull));
}

restoreEnv();
console.log('');
console.log('────────────────────────────────────────────────────');
if (failc) { console.log('cursor-token: ' + okc + '/' + (okc + failc) + ' موفق ❌\n' + fails.map((f) => '   ' + f).join('\n')); }
else console.log('cursor-token: ' + okc + '/' + okc + ' موفق ✅');
console.log('────────────────────────────────────────────────────');
process.exit(failc ? 1 : 0);
