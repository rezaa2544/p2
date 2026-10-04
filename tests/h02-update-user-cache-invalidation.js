#!/usr/bin/env node
/* ═════════════════════════════════════════════════════════════════
   M14-B02-H02 — updateUser targeted bootstrap-cache invalidation
   ───────────────────────────────────────────────────────────────────
   Finding under test (H02, defense-in-depth):
     server/routes/users.js updateUser() ended with only
       cache.invalidateCollection('users', target.school_id)
     and no targeted invalidation of the *changed user's own* bootstrap
     cache. The claim: a successful user mutation must invalidate that
     user's own bootstrap cache (L1 + L2), independent of the
     school-wide sweep.

   The school-wide sweep IS a superset in the common case. The real gap
   it does not cover (proved by the negative proof H02-5):
     getBootstrapCache returns an L1 entry WITHOUT any epoch check
     (cache.js:156) and validates an L2 entry against the school.id
     found INSIDE the cached packet (cache.js:174). So an entry tagged
     under a STALE school id (a previous transfer that left the entry
     behind) is invisible to invalidateCollection(users, currentSchool)
     and survives as stale data. invalidateUser(userId) targets the
     userId directly, independent of school — it closes that invariant
     explicitly.

   Sections
     H02-0  boot hermetic server (current HEAD)
     H02-1  TEST A — L1 populated → REST updateUser → cache invalidated
     H02-2  TEST B — unit level: invalidateUser purges L1 AND L2
     H02-3  TEST C — failed mutation (field_denied) → cache preserved
     H02-4  TEST D — user A mutation → user B (other school) cache intact
     H02-5  negative proof — H02_MUTATE=VULN neuters invalidateUser

   Cache-hit detector (same as B02, no debug flag):
     bootstrap.js stamps server_time fresh on every payload build
     (bootstrap.js:159) and the cached body is returned verbatim
     (index.js:1387). Identical server_time == served cache entry;
     changed server_time == payload rebuilt from the live store.

   Failure semantics under test (TEST C):
     A mutation that cannot commit (field_denied at users.js:248)
     returns BEFORE the invalidation site (users.js:273/285), so the
     cache must stay intact. The invalidation site is only reachable
     after a successful DB + store commit.

   False-green defenses:
     - every early exit prints a summary and process.exit(1)
     - a CANARY (identical server_time on repeat read) precedes every
       negative cache assertion, proving the cache layer was live
     - servers are killed + process.exit() at the end (no orphans)
     - observations are recorded, never assumed
   ═════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..');
const REAL_STORE = path.join(ROOT, 'server', 'data', 'payesh.json');
const MUT = process.env.H02_MUTATE || '';

const PORT = 8995;   /* hermetic server (REST updateUser + bootstrap) */

let pass = 0, fail = 0;
const errors = [];
function chk(name, cond, extra) {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else {
    fail++;
    const detail = extra !== undefined ? ' — ' + String(extra).slice(0, 300) : '';
    errors.push(name + detail);
    console.log('  ❌ ' + name + detail);
  }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const summarize = () => {
  console.log('────────────────────────────────────────────────────────');
  console.log('H02: ' + pass + ' ✅ / ' + fail + ' ❌');
  for (const e of errors) console.log('   ✗ ' + e);
};

const procs = [];
const tmpdirs = [];
const mutatedPaths = [];
process.on('exit', () => {
  for (const p of procs) { try { p.kill('SIGKILL'); } catch (e) {} }
  for (const d of tmpdirs) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (e) {} }
  for (const f of mutatedPaths) { try { fs.unlinkSync(f); } catch (e) {} }
});
function spawnServer(env) {
  const p = spawn(process.execPath, ['server/index.js'], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
  p.log = '';
  p.stdout.on('data', (d) => (p.log += d));
  p.stderr.on('data', (d) => (p.log += d));
  procs.push(p);
  return p;
}
function close(p) { try { p.kill('SIGKILL'); } catch (e) {} }

function req(port, method, p, body, headers) {
  return new Promise((resolve) => {
    const data = body !== undefined ? JSON.stringify(body) : null;
    const r = http.request({
      hostname: '127.0.0.1', port, path: p, method,
      headers: Object.assign(
        data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {},
        headers || {}
      )
    }, (res) => {
      let b = '';
      res.on('data', (d) => (b += d));
      res.on('end', () => {
        let j = null; try { j = JSON.parse(b); } catch (e) {}
        resolve({ status: res.statusCode, json: j, headers: res.headers, text: b });
      });
    });
    r.on('error', () => resolve({ status: 0, json: null, headers: {}, text: '' }));
    if (data) r.write(data);
    r.end();
  });
}

async function boot(port, extraEnv) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'payesh-h02-'));
  tmpdirs.push(d);
  const env = Object.assign({}, process.env, {
    PORT: String(port), HOST: '127.0.0.1',
    PAYESH_STORE: path.join(d, 's.json'),
    PAYESH_AUDIT: path.join(d, 'a.log'),
    PAYESH_KEY: path.join(d, 'k.key'),
    PAYESH_DEMO_CODE: '1',
    PAYESH_OTP_PEPPER: 'h02-repro-pepper',
    /* از memory پروژه: suiteهایی که REST را لمس می‌کنند نیاز به این پرچم
       دارند وگرنه هر درخواست ۵۰۳ می‌شود. */
    PAYESH_ALLOW_DEV_MEMORY_AUTHORITY: '1',
    /* بخشِ hermetic: fallbackِ درون‌حافظه‌ایِ ردیس تا هیچ حالتی بینِ
       بخش‌ها یا اجراها نشت نکند. بخشِ unit-level همین‌طور. */
    REDIS_URL: ''
  }, extraEnv || {});
  fs.copyFileSync(REAL_STORE, env.PAYESH_STORE);
  const p = spawnServer(env);
  for (let i = 0; i < 80; i++) {
    const h = await req(port, 'GET', '/api/health');
    if (h.status === 200 && h.json && h.json.ok && h.json.pid === p.pid) return { proc: p, dir: d, env, port };
    if (p.exitCode !== null) { console.log('  server died:\n' + (p.log || '').slice(-800)); return null; }
    await sleep(300);
  }
  return null;
}

/* ── session helpers ───────────────────────────────────────────── */
async function login(port, phone, national_id, label) {
  const sc = await req(port, 'POST', '/api/auth/send-code', { phone });
  const code = sc.json && sc.json.demo_code;
  if (!code) {
    console.log('  [login' + (label ? '/' + label : '') + '] send-code → HTTP ' + sc.status + ' ' + String(sc.text).slice(0, 200));
    return null;
  }
  const lg = await req(port, 'POST', '/api/auth/login', { phone, code, national_id });
  if (lg.status !== 200 || !lg.json || !lg.json.ok) {
    console.log('  [login' + (label ? '/' + label : '') + '] login → HTTP ' + lg.status + ' ' + String(sc.text).slice(0, 200));
    return null;
  }
  const cookie = (lg.headers['set-cookie'] || [])[0];
  return { cookie: cookie ? cookie.split(';')[0] : '', user: lg.json.user };
}
function bootstrap(port, cookie) {
  return req(port, 'GET', '/api/v1/bootstrap', undefined, cookie ? { Cookie: cookie } : {});
}
function patchUser(port, cookie, id, body) {
  return req(port, 'PATCH', '/api/v1/users/' + id, body, cookie ? { Cookie: cookie } : {});
}
/* خلاصهٔ یک خوانش — مبنایِ تمامِ assertionها */
function snap(r) {
  const j = r.json;
  return {
    status: r.status,
    school: j && j.school ? j.school.id : null,
    role: j && j.user ? j.user.role : null,
    name: j && j.user ? j.user.full_name : null,
    st: j ? j.server_time : null
  };
}
const sameSt = (a, b) => !!a && !!b && a.st === b.st;

/* ── unit-level helpers (TEST B + TEST E) ─────────────────────── */
const payload = (uid, schoolId, role) => ({
  user: { id: uid, role, full_name: 'unit-h02' },
  school: schoolId == null ? null : { id: schoolId, name: 'unit-school' },
  server_time: 'unit-stamp'
});
const bootstrapKey = (uid) => 'payesh:cache:bootstrap:' + uid;

async function main() {
  const seed = JSON.parse(fs.readFileSync(REAL_STORE, 'utf8'));
  const users = seed.users || [];
  const pick = (role, uid) => users.find(u => u.role === role && u.id === uid);
  const superadmin = pick('superadmin', 1);   /* school null —PATCH مجاز  */
  const teacher   = pick('teacher', 4);       /* school 1 — هدفِ TEST A/C/D */
  const teacher2  = pick('teacher', 246);     /* school 2 — شاهدِ TEST D   */

  if (!superadmin || !teacher || !teacher2) {
    console.log('❌ seed فاقد کاربرانِ لازم است', !!superadmin, !!teacher, !!teacher2);
    summarize(); process.exit(1);
  }
  console.log('  targets: teacher id=' + teacher.id + ' (school ' + teacher.school_id +
    '), teacher2 id=' + teacher2.id + ' (school ' + teacher2.school_id +
    '), superadmin id=' + superadmin.id);
  if (MUT) console.log('— H02: حالتِ جهش — فقط رأیِ جهش (H02-5) اجرا می‌شود —');

  /* ════════════════════════════════════════════════════════════════
     H02-2 / H02-5: unit-level cache layer (همیشه لازم — چه با سرور
     چه بدونِ آن) — L1+L2 purge + negative proof مکانیزم
     ════════════════════════════════════════════════════════════════ */
  console.log('— H02-u: لایهٔ کش (unit level) —');
  process.env.REDIS_URL = ''; /* fallbackِ درون‌حافظه‌ای — ایزوله */
  let cacheMod = null;
  try { cacheMod = require('../server/cache.js'); }
  catch (e) { console.log('  ! require cache.js شکست خورد: ' + e.message); }
  chk('ماژولِ کش بارگذاری شد', !!cacheMod);
  if (cacheMod) {
    const rin = await cacheMod.init();
    chk('cache.init موفق (fallback درون‌حافظه‌ای)', !!(rin && rin.ok), JSON.stringify(rin));
  }

  if (!MUT && cacheMod && cacheMod.init) {
    /* ═══ H02-2: TEST B — invalidateUser هم L1 و هم L2 را پاک می‌کند ═══ */
    console.log('— H02-2: TEST B — پاکسازیِ L1+L2 توسط invalidateUser —');
    const redisMod = require('../server/redis');
    const uB = 9105, sB = 30;
    await cacheMod.setBootstrapCache(uB, payload(uB, sB, 'teacher'), 300);
    const bL1 = await cacheMod.getBootstrapCache(uB);
    chk('TEST B: setBootstrapCache → خوانش L1 برمی‌گردد', !!bL1);
    const bL2raw = await redisMod.get(bootstrapKey(uB));
    chk('TEST B: کلیدِ L2 واقعاً در ردیس نوشته شد', typeof bL2raw === 'string' && bL2raw.length > 0,
      typeof bL2raw === 'string' ? ('len=' + bL2raw.length) : String(bL2raw));
    await cacheMod.invalidateUser(uB);
    const bAfter = await cacheMod.getBootstrapCache(uB);
    chk('TEST B: پس از invalidateUser → getBootstrapCache === null (L1 پاک شد)', bAfter === null,
      JSON.stringify(bAfter && { school: bAfter.school && bAfter.school.id }));
    const bL2after = await redisMod.get(bootstrapKey(uB));
    chk('TEST B: کلیدِ L2 هم del شد', bL2after === null || bL2after === undefined,
      String(bL2after === undefined ? 'undefined' : (typeof bL2after === 'string' ? 'len=' + bL2after.length : bL2after)));
  }

  if (!MUT) {
    /* ════════════════════════════════════════════════════════════════
       H02-0: boot hermetic server روی current HEAD
       ════════════════════════════════════════════════════════════════ */
    console.log('— H02-0: بوتِ سرورِ hermetic —');
    const srv = await boot(PORT);
    chk('سرور روی پورت ' + PORT + ' بالا آمد', !!srv);
    if (!srv) { summarize(); process.exit(1); }

    const sa = await login(PORT, superadmin.phone, superadmin.national_id, 'superadmin');
    const t4 = await login(PORT, teacher.phone, teacher.national_id, 'teacher4');
    const t246 = await login(PORT, teacher2.phone, teacher2.national_id, 'teacher246');
    chk('ورودِ superadmin', !!sa);
    chk('ورودِ teacher id=4 (هدف)', !!t4);
    chk('ورودِ teacher id=246 (شاهد، مدرسهٔ ۲)', !!t246);
    if (!sa || !t4 || !t246) { for (const p of procs) close(p); summarize(); process.exit(1); }

    /* ════════════════════════════════════════════════════════════════
       H02-1: TEST A — L1 populated → REST updateUser → invalidate
       ════════════════════════════════════════════════════════════════ */
    console.log('— H02-1: TEST A — کشِ L1 پر → PATCH → انقضا —');
    const a0 = snap(await bootstrap(PORT, t4.cookie));
    chk('TEST A: bootstrap اول ۲۰۰ داد', a0.status === 200, a0.status);
    const a0b = snap(await bootstrap(PORT, t4.cookie));
    /* CANARY: کش زنده است — خوانشِ تکرار همان ورودی را می‌دهد */
    chk('TEST A CANARY: خوانشِ تکرار همان server_time (کش زنده)', sameSt(a0, a0b),
      a0.st + ' vs ' + a0b.st);
    chk('TEST A CANARY: نامِ اولیه برابرِ seed', a0.name === teacher.full_name, JSON.stringify(a0.name));

    const newName = 'H02-TEST-A ' + Date.now();
    const patchA = await patchUser(PORT, sa.cookie, teacher.id, { full_name: newName, base_version: 1 });
    chk('TEST A: PATCH /api/v1/users/4 → ۲۰۰', patchA.status === 200,
      patchA.status + ' ' + String(patchA.text).slice(0, 160));
    chk('TEST A: پاسخِ PATCH ok=true', !!(patchA.json && patchA.json.ok), String(patchA.text).slice(0, 160));

    const a1 = snap(await bootstrap(PORT, t4.cookie));
    chk('TEST A: بعد از PATCH، server_time تغییر کرد (کش invalidate شد)', !sameSt(a0, a1),
      a0.st + ' vs ' + a1.st);
    chk('TEST A: payload تازه، نامِ جدید را دارد', a1.name === newName, JSON.stringify(a1.name) + ' vs ' + JSON.stringify(newName));

    /* ════════════════════════════════════════════════════════════════
       H02-3: TEST C — mutation ناموفق → کش نباید invalidate شود
       ════════════════════════════════════════════════════════════════ */
    console.log('— H02-3: TEST C — mutation ناموفق → کش سالم —');
    const c0 = snap(await bootstrap(PORT, t4.cookie));
    chk('TEST C: bootstrap پایه ۲۰۰', c0.status === 200, c0.status);
    /* field_denied: `role` در allowlistِ مدیریت نیست (users.js:243) ⇒
       ۴۰۳ قبل از هر DB mutation و قبل از سایتِ invalidation */
    const patchC = await patchUser(PORT, sa.cookie, teacher.id, { role: 'student' });
    chk('TEST C: PATCH با فیلدِ ممنوع → ۴۰۳ field_denied',
      patchC.status === 403 && patchC.json && patchC.json.code === 'field_denied',
      patchC.status + ' ' + String(patchC.json && patchC.json.code));
    const c1 = snap(await bootstrap(PORT, t4.cookie));
    /* همان server_time ⇒ ورودی هنوز زنده است ⇒ invalidation اجرا نشد */
    chk('TEST C CANARY/حکم: server_time یکسان (کش invalidate نشد)', sameSt(c0, c1),
      c0.st + ' vs ' + c1.st);
    chk('TEST C: نقش در payload تغییر نکرده', c1.role === 'teacher', JSON.stringify(c1.role));

    /* ════════════════════════════════════════════════════════════════
       H02-4: TEST D — mutation کاربر A → کش کاربر B سالم
       ════════════════════════════════════════════════════════════════ */
    console.log('— H02-4: TEST D — کاربرِ A → کشِ کاربرِ B (مدرسهٔ دیگر) سالم —');
    const d0 = snap(await bootstrap(PORT, t246.cookie));
    chk('TEST D: bootstrap شاهد (مدرسهٔ ۲) ۲۰۰', d0.status === 200, d0.status);
    chk('TEST D: شاهد در مدرسهٔ ۲ است', d0.school === teacher2.school_id, JSON.stringify(d0.school));
    const d0b = snap(await bootstrap(PORT, t246.cookie));
    chk('TEST D CANARY: کشِ شاهد زنده است (server_time ثابت)', sameSt(d0, d0b), d0.st + ' vs ' + d0b.st);

    const patchD = await patchUser(PORT, sa.cookie, teacher.id, { full_name: 'H02-TEST-D ' + Date.now(), base_version: 2 });
    chk('TEST D: PATCH روی کاربرِ A (مدرسهٔ ۱) → ۲۰۰', patchD.status === 200,
      patchD.status + ' ' + String(patchD.text).slice(0, 160));
    const d1 = snap(await bootstrap(PORT, t246.cookie));
    /* invalidateCollection('users', 1) + invalidateUser(4) هر دو فقط
       مدرسهٔ ۱ / کاربرِ ۴ را پاک می‌کنند — شاهد در مدرسهٔ ۲ باید سالم بماند */
    chk('TEST D: server_time شاهد تغییر نکرد (کشِ کاربرِ دیگر دست‌نخورده)', sameSt(d0, d1),
      d0.st + ' vs ' + d1.st);
    chk('TEST D: مدرسهٔ شاهد هنوز ۲ است', d1.school === teacher2.school_id, JSON.stringify(d1.school));

    for (const p of procs) close(p);
  }

  /* ════════════════════════════════════════════════════════════════
     H02-5: negative proof (H02_MUTATE=VULN) — stale school tag
     ════════════════════════════════════════════════════════════════ */
  console.log('— H02-5: رأیِ جهش (negative proof) — stale-school-tag —');
  {
    const CACHE_PATH = path.join(ROOT, 'server', 'cache.js');
    const M = {
      /* VULN: مکانیزمِ invalidateUser — همان چیزی که اصلاحِ H02 به آن
         تکیه می‌کند — no-op می‌شود. assertionِ پاکسازیِ ورودی باید
         تحتِ این جهش قرمز شود. */
      VULN: [
        'async function invalidateUser(userId) {\r\n  localUserBootstrapCache.delete(Number(userId));',
        'async function invalidateUser(userId) {\r\n  return; /* H02 VULN */\r\n  localUserBootstrapCache.delete(Number(userId));',
      ],
    };

    if (MUT && !M[MUT]) {
      console.log('  ⏭ جهش ناشناخته: ' + String(MUT) + ' (این بخش فقط با H02_MUTATE=VULN اجرا می‌شود)');
    } else if (!cacheMod) {
      console.log('  ⏭ لایهٔ کش بارگذاری نشد — رأیِ جهش نمی‌تواند اجرا شود');
    } else {
      let mod = cacheMod;
      if (MUT === 'VULN') {
        const p = path.resolve(ROOT, 'server', 'cache.h02-mutated.js');
        if (path.dirname(p) !== path.join(ROOT, 'server')) throw new Error('h02: mutated path escapes server/');
        const live = fs.readFileSync(CACHE_PATH, 'utf8');
        if (live.split(M.VULN[0]).length - 1 !== 1) {
          console.error('الگوی جهش مچ نشد (cache.js invalidateUser)');
          summarize(); process.exit(2);
        }
        fs.writeFileSync(p, live.replace(M.VULN[0], M.VULN[1]));
        mutatedPaths.push(p);
        delete require.cache[require.resolve(p)];
        mod = require(p);
        await mod.init();
        console.log('  جهش اعمال شد: invalidateUser → no-op');
      }

      /* سناریو: ورودیِ کاربر زیرِ برچسبِ مدرسهٔ *قدیمی* نشسته
         (انتقالِ قبلی که stale مانده). updateUser مدرسهٔ *فعلی* را
         به invalidateCollection می‌دهد — آن ورودی را پیدا نمی‌کند.
         تنها invalidateUser(userId) آن را پاک می‌کند. */
      const u = 9106, sOld = 31, sCurrent = 32;
      await mod.setBootstrapCache(u, payload(u, sOld, 'teacher'), 300);
      const before = await mod.getBootstrapCache(u);
      chk('H02-5 setup: ورودی زیرِ مدرسهٔ قدیمی در کش نوشته شد', !!before,
        JSON.stringify(before && { school: before.school && before.school.id }));

      /* دقیقاً دنبالهٔ post-commit در users.js:273+285 */
      await mod.invalidateCollection('users', sCurrent);
      await mod.invalidateUser(u);

      const got = await mod.getBootstrapCache(u);
      console.log('  gate: getBootstrapCache(' + u + ') → ' +
        (got ? 'STALE ' + JSON.stringify({ school: got.school && got.school.id }) : 'null'));
      chk('H02-5 حکم: دنبالهٔ اصلاح باید ورودی را پاک کند (این assertion باید تحتِ جهش FAIL شود)',
        got === null, JSON.stringify(got && { school: got.school && got.school.id }));

      /* مکانیزمِ school-wide همچنان باید کار کند — جهش فقط
         invalidateUser را خنثی کرد. */
      await mod.setBootstrapCache(u, payload(u, sOld, 'teacher'), 300);
      await mod.invalidateSchool(sOld);
      const got2 = await mod.getBootstrapCache(u);
      chk('H02-5 کنترل: invalidateSchool(مدرسهٔ قدیمی) ورودی را پاک کرد (مکانیزمِ school سالم)',
        got2 === null, JSON.stringify(got2 && { school: got2.school && got2.school.id }));
    }
  }

  /* ── summary ─────────────────────────────────────────────────── */
  for (const p of procs) close(p);
  summarize();
  process.exit(fail ? 1 : 0);
}

main().catch((e) => {
  console.error('FATAL', e);
  for (const p of procs) { try { p.kill('SIGKILL'); } catch (_) {} }
  process.exit(2);
});
