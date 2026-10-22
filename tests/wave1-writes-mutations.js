#!/usr/bin/env node
/* ─────────────────────────────────────────────────────────────
   wave1-writes-mutations.js — جهش‌مندیِ Wave 1 (بخش دوم: Writes)
   ─────────────────────────────────────────────────────────────
   پنج جهش روی کدِ جدید؛ هر کدام باید توسط tests/wave1-writes.js
   کشته شود (تستِ «کشته نمی‌شود» = پوششِ توخالی):
     MW1 حذفِ آینهٔ آیتمِ موفقِ sms   → W1b
     MW2 حذفِ derived از دستهٔ sync   → W4b
     MW3 حذفِ سرویس بدون تراکنش      → W5b
     MW4 حذفِ شاخهٔ client در outbox  → W5b
     MW5 حذفِ try/catch آینهٔ sms     → W3a
   بدون build (سوئیت مستقیماً ماژول‌هایِ server را require می‌کند).
   ───────────────────────────────────────────────────────────── */
'use strict';
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
/* BH-mut فاز ۲ (الگوی امن p06/p11): جهش در کپیِ جدا؛ سورس اصلی و
   بازنویسی نمی‌شود — بازگردانیِ دستی حذف شد. */
const { session } = require('./helpers/mutant-kit');
const kit = session('w1w-mut-');
const ROOT = path.join(__dirname, '..');

const SUITE = ['tests/wave1-writes.js'];
const MUTS = [
  {
    file: 'server/sms.js',
    bad: "      const mirrorOk = await mirrorItem(itemOps, { school: q.school_id, queue_id: qid, kind: 'send' });\n",
    mut: "      const mirrorOk = true; /* MW1: آینه حذف شد */\n",
    name: 'MW1 حذفِ آینهٔ آیتمِ موفقِ sms',
    expectFail: 'W1b'
  },
  {
    file: 'server/sync.js',
    bad: '    const batchAll = mirror.concat(derived);\n',
    mut: '    const batchAll = mirror; /* MW2: derived حذف شد */\n',
    name: 'MW2 حذفِ نوشت‌هایِ مشتق از دستهٔ sync',
    expectFail: 'W4b'
  },
  {
    file: 'server/delete-service.js',
    bad: "        await db.transaction(async (client) => {\n          await db.persistOpWithClient(client, delOp);\n          if (outbox) await outbox.append(evt, client);\n          /* N-36 — حذفِ کاربر هم یک رویدادِ ابطالِ scope:user در همان\n             تراکنش می‌سازد. handlerِ cache.user_changed رویِ هر نمونه\n             invalidateUser را اجرا می‌کند (del + epoch:user + publish). */\n          if (outbox && collection === 'users' && Number.isFinite(delId)) {\n            await cacheEvents.appendDurable(outbox,\n              cacheEvents.userChanged(delId, meta.actor ? meta.actor.id : null, evt.version, 'delete'), client);\n          }\n        });",
    mut: "        await db.persistOp(delOp); if (outbox) await outbox.append(evt);",
    name: 'MW3 حذف بدون تراکنش (persistOp + append جداگانه)',
    expectFail: 'W5b'
  },
  {
    file: 'server/outbox.js',
    bad: "    if (client) {\n      try { await insertOnce(client); /* Wave1-W: داخل تراکنش */ }\n      catch (e) { rollbackMirror(e); }\n      return evt;\n    }",
    mut: "    if (false) { return evt; }",
    name: 'MW4 حذفِ شاخهٔ client در outbox.append',
    expectFail: 'W5b'
  },
  {
    file: 'server/sms.js',
    bad: [
      '    try { await db.persistOpsBatch(itemOps); return true; }',
      '    catch(e){',
      '      audit(\'sms_mirror_failed\', Object.assign({ ops: itemOps.length }, where,',
      '        { error: String((e && e.message) || e), code: (e && e.code) || null }));',
      '      return false;',
      '    }'
    ].join('\n'),
    mut: '    await db.persistOpsBatch(itemOps); return true;',
    name: 'MW5 حذفِ try/catch آینهٔ sms (نشتِ خطا به کلاینت)',
    expectFail: 'W3a'
  }
];

let killed = 0, alive = 0, envErr = 0;
let prevAbs = null;
for (const m of MUTS) {
  const p = path.join(__dirname, '..', m.file);
  if (prevAbs && prevAbs !== p) kit.clear(prevAbs);
  prevAbs = p;
  const orig = fs.readFileSync(p, 'utf8');
  const n = orig.split(m.bad).length - 1;
  if (n !== 1) {
    console.log(`  ⚠️ ${m.name} — الگو ${n} بار پیدا شد (باید ۱) — رد شد (نه کشته، نه زنده)`);
    envErr++;
    continue;
  }
  kit.mutant(p, orig.replace(m.bad, m.mut)); /* کپی جدا؛ سورس اصلی دست‌نخورده */
  let out = '', code = 0;
  try { out = execFileSync('node', SUITE, { stdio: 'pipe', env: kit.env(), cwd: ROOT }).toString(); }
  catch (e) { out = ((e.stdout || '') + '\n' + (e.stderr || '')).toString(); code = e.status; }
  const failed = code !== 0;
  const sawFail = out.indexOf('❌') >= 0 && out.indexOf(m.expectFail) >= 0;
  if (failed && sawFail) {
    killed++;
    console.log(`  ✅ ${m.name} — کشته شد (${m.expectFail})`);
  } else if (!failed) {
    alive++;
    console.log(`  ❌ ${m.name} — جهش زنده ماند (تست شکست نداشت!)`);
  } else {
    envErr++;
    console.log(`  ⚠️ ${m.name} — خطای محیطی (چکِ ${m.expectFail} چاپ نشد — مرگِ زودهنگام)`);
  }
}
console.log(`\nwave1-writes-mutations: ${killed + alive + envErr} جهش — کشته ${killed} · زنده ${alive} · خطای محیطی ${envErr}`);
process.exit(alive === 0 && envErr === 0 ? 0 : 1);
