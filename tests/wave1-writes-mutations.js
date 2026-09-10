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
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const SUITE = 'node tests/wave1-writes.js';
const MUTS = [
  {
    file: 'server/sms.js',
    bad: "      await mirrorItem(itemOps, { school: q.school_id, queue_id: qid, kind: 'send' });\n",
    mut: "      /* MW1: آینه حذف شد */\n",
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
    bad: [
      '      await db.transaction(async (client) => {',
      '        await db.persistOpWithClient(client, { c: collection, t: \'del\', id: delId });',
      '        if (outbox) await outbox.append(evt, client);',
      '      });'
    ].join('\n'),
    mut: [
      '      await db.persistOp({ c: collection, t: \'del\', id: delId });',
      '      if (outbox) await outbox.append(evt);'
    ].join('\n'),
    name: 'MW3 حذف بدون تراکنش (persistOp + append جداگانه)',
    expectFail: 'W5b'
  },
  {
    file: 'server/outbox.js',
    bad: [
      '    if (client) {',
      '      await client.query(outboxInsertSql, outboxParams(evt)); /* Wave1-W: داخل تراکنش */',
      '      return evt;',
      '    }'
    ].join('\n'),
    mut: [
      '    if (false) { /* MW4: شاخهٔ client حذف شد */',
      '      await client.query(outboxInsertSql, outboxParams(evt));',
      '      return evt;',
      '    }'
    ].join('\n'),
    name: 'MW4 حذفِ شاخهٔ client در outbox.append',
    expectFail: 'W5b'
  },
  {
    file: 'server/sms.js',
    bad: [
      '    try { await db.persistOpsBatch(itemOps); }',
      '    catch(e){ audit(\'sms_mirror_failed\', Object.assign({ ops: itemOps.length }, where,',
      '      { error: String((e && e.message) || e) })); }'
    ].join('\n'),
    mut: '    await db.persistOpsBatch(itemOps);',
    name: 'MW5 حذفِ try/catch آینهٔ sms (نشتِ خطا به کلاینت)',
    expectFail: 'W3a'
  }
];

let killed = 0, alive = 0, envErr = 0;
for (const m of MUTS) {
  const p = path.join(__dirname, '..', m.file);
  const orig = fs.readFileSync(p, 'utf8');
  const n = orig.split(m.bad).length - 1;
  if (n !== 1) {
    console.log(`  ⚠️ ${m.name} — الگو ${n} بار پیدا شد (باید ۱) — رد شد (نه کشته، نه زنده)`);
    envErr++;
    continue;
  }
  fs.writeFileSync(p, orig.replace(m.bad, m.mut));
  let out = '', code = 0;
  try { out = execSync(SUITE, { stdio: 'pipe' }).toString(); }
  catch (e) { out = ((e.stdout || '') + '\n' + (e.stderr || '')).toString(); code = e.status; }
  fs.writeFileSync(p, orig); /* بازگردانی */
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
