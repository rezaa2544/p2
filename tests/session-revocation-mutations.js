#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   تستِ جهش‌مندی — ابطالِ نشست (P4)
   ───────────────────────────────────────────────────────────────────
   هر جهش باید یکی از دو سوئیت را بشکند؛ وگرنه تست بی‌اثر است و فقط
   سبز نشان می‌دهد. ده جهش، هر کدام یکی از تصمیم‌هایِ حساس را هدف
   می‌گیرند: نوشتن در لایه‌ی دوم، fail-closed، ثبتِ نشست، دروازه،
   پخش، ابطالِ همگانی، شعاعِ انفجار، و کِشِ منفی.
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
const { execSync } = require('child_process');
const fs = require('fs');

const FILES = {
  'server/revocation.js': fs.readFileSync('server/revocation.js', 'utf8'),
  'server/auth.js':       fs.readFileSync('server/auth.js', 'utf8'),
  'server/index.js':      fs.readFileSync('server/index.js', 'utf8'),
};

const MUTS = [
  {
    file: 'server/revocation.js', suite: 'tests/session-revocation.js',
    name: 'M1 ابطال فقط محلی بماند (لایه‌ی دوم نوشته نشود)',
    bad: "      await redis.set(K_REVOKED(jti), '1', 'EX', ttlS);",
    mut: "      /* جهش: نوشتن در لایه‌ی دوم حذف شد */",
    expectFail: 'R5 نمونه‌ی بی‌اشتراک از راهِ L2',
  },
  {
    file: 'server/revocation.js', suite: 'tests/session-revocation.js',
    name: 'M2 خطایِ خواندن ⇒ عبور (fail-open به‌جای fail-closed)',
    bad: "      stats.unknown++;                              /* نمی‌دانیم ⇒ رد می‌کنیم */\n      return true;",
    mut: "      stats.unknown++;\n      return false;",
    expectFail: 'R6 خرابیِ خواندن از Redis',
  },
  {
    file: 'server/revocation.js', suite: 'tests/session-revocation.js',
    name: 'M3 نشست هنگامِ ورود ثبت نشود (ابطالِ همه بی‌هدف می‌ماند)',
    bad: "    list.push({ jti: jti, at: now() });",
    mut: "    /* جهش: ثبت حذف شد */;",
    expectFail: 'R8 «ابطالِ همه‌ی نشست‌ها»',
  },
  {
    file: 'server/revocation.js', suite: 'tests/session-revocation.js',
    name: 'M4 پیامِ پخش محلی علامت نخورد (توزیع‌شدگی از کار بیفتد)',
    bad: "            markLocal(ev.jti, ev.at);",
    mut: "            /* جهش: پیام نادیده گرفته شد */;",
    expectFail: 'R4 نمونه‌ی دوم از راهِ Pub/Sub',
  },
  {
    file: 'server/revocation.js', suite: 'tests/session-revocation.js',
    name: 'M5 ابطالِ همه، دفتر را از لایه‌ی دوم نخواند (راه‌اندازیِ تازه)',
    bad: "    if(!list.length){\n      try{\n        const raw = await redis.get(K_USESSIONS(uid));",
    mut: "    if(false){\n      try{\n        const raw = await redis.get(K_USESSIONS(uid));",
    expectFail: 'R9 ابطالِ همه حتی بدونِ دفترِ محلی',
  },
  {
    file: 'server/revocation.js', suite: 'tests/session-revocation.js',
    name: 'M6 کِشِ پاسخِ منفی هرگز کهنه نشود (پشتبان بیهوش شود)',
    bad: "    negCache.set(jti, now() + NEG_CACHE_MS);",
    mut: "    negCache.set(jti, now() + 86400000);",
    expectFail: 'R16 کِشِ پاسخِ منفی، ابطال را برای همیشه پنهان نمی‌کند',
  },
  {
    file: 'server/index.js', suite: 'tests/session-revocation.js',
    name: 'M7 دروازه‌ی ابطال از مسیر حذف شود',
    bad: "      if(await revocation.isRevokedAsync(gs.jti)){",
    mut: "      if(false){",
    expectFail: 'R1c دروازه با تکیه بر لایه‌ی دوم',
  },
  {
    file: 'server/auth.js', suite: 'tests/session-revocation.js',
    name: 'M8 خروج هیچ نشستی را باطل نکند',
    bad: "        if(rev) await rev.revokeSession(v.payload.jti, 'logout');\n        else store.__revoked_jti[v.payload.jti] = Date.now();",
    mut: "        /* جهش: ابطال حذف شد */;",
    expectFail: 'R1 پس از خروج، همان توکن دیگر کار نمی‌کند',
  },
  {
    file: 'server/revocation.js', suite: 'tests/session-revocation-delete.js',
    name: 'M9 ابطالِ همه، نشست‌هایِ کاربرانِ دیگر را هم بکشد (شعاعِ انفجار)',
    bad: "    let list = byUser.get(uid) || [];",
    mut: "    let list = [].concat.apply([], Array.from(byUser.values()));",
    expectFail: 'D8 ابطالِ یک کاربر، نشستِ کاربرِ دیگر را نکشت',
  },
  {
    file: 'server/auth.js', suite: 'tests/session-revocation-delete.js',
    name: 'M10 حذفِ حساب، نشست‌هایِ دیگر را باطل نکند (فقط همان یکی)',
    bad: "        const n = await rev.revokeAllUserSessions(uid, 'account_deleted');",
    mut: "        const n = 0; /* جهش: فقط نشستِ جاری */",
    expectFail: 'D6 ابطال در فایلِ store پایدار ماند',
  },
  {
    file: 'server/revocation.js', suite: 'tests/session-revocation.js',
    name: 'M11 گزینهٔ سخت‌گیرانه (قطعِ Redis ⇒ رد) بی‌اثر شود',
    bad: "      stats.unknown++;\n      return true;\n    }",
    mut: "      stats.unknown++;\n      return false;\n    }",
    expectFail: 'R17 با PAYESH_REVOKE_REQUIRE_REDIS=1',
  },
  {
    file: 'server/revocation.js', suite: 'tests/session-revocation.js',
    name: 'M12 خرابیِ Redis هنگامِ ابطال، ابطالِ محلی را هم لغو کند',
    bad: "    const fresh = markLocal(jti, at);",
    mut: "    const fresh = false; markLocal(jti, at); /* جهش: شمارش را خراب کن */",
    expectFail: 'R15 وضعیتِ ماژول سالم است',
  }
];

let killed = 0;
for(const m of MUTS){
  const src = FILES[m.file];
  if(src.indexOf(m.bad) < 0){ console.log(`  ❌ ${m.name}: الگوی جهش در ${m.file} پیدا نشد`); continue; }
  fs.writeFileSync(m.file, src.replace(m.bad, m.mut));
  let out = '';
  try { execSync('node ' + m.suite, { stdio: 'pipe' }); out = 'PASSED (no failure)'; }
  catch(e){ out = String(e.stdout || '') + String(e.stderr || ''); }
  const killedThis = /❌/.test(out) && out.includes(m.expectFail);
  for(const f of Object.keys(FILES)) fs.writeFileSync(f, FILES[f]);
  console.log(`  ${killedThis ? '✅' : '❌'} ${m.name} — ${killedThis ? 'کشته شد' : 'زنده ماند! (' + ((out.split('\n').find(l => l.includes('❌')) || out.slice(0,120))) + ')'}`);
  if(killedThis) killed++;
}

/* بازگشت به سبز */
let green = true;
for(const s of ['tests/session-revocation.js', 'tests/session-revocation-delete.js']){
  let out = '';
  try { out = execSync('node ' + s, { stdio: 'pipe' }).toString(); } catch(e){ out = String(e.stdout || ''); }
  const ok = /همه سبز/.test(out) || /\/0 قرمز/.test(out);
  if(!ok){ green = false; console.log('  ⚠️ پس از بازگشت، ' + s + ' سبز نیست:\n' + out.split('\n').slice(-6).join('\n')); }
}
console.log(`\nجهش: ${killed}/${MUTS.length} کشته` + (killed === MUTS.length && green ? ' ✅ (هر دو سوئیت پس از بازگشت سبز)' : ' ⚠️'));
process.exit(killed === MUTS.length && green ? 0 : 1);
