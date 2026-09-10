#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   جهش‌سنجِ زیرساختِ HA — هر جهش باید یکی از دو سوئیت را بشکاند:
     node tests/ha-config-mutations.js
   الگو: tests/wave12-network-mutations.js (backup/restore + expectFail + خط‌پایه)
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
const { execSync } = require('child_process');
const fs = require('fs');

const SUITES = { ha: 'node tests/ha-config.js', dr: 'node tests/dr-runbook.js' };
const WATCH = ['infra/postgres/docker-compose.ha.yml', 'infra/redis/docker-compose.sentinel.yml',
  'infra/redis/sentinel.conf.template', 'tools/pitr-restore.sh', 'docs/DR_RUNBOOK.md'];
const FILES = {}; WATCH.forEach((f) => { FILES[f] = fs.readFileSync(f, 'utf8'); });

const MUTS = [
  {
    file: 'infra/postgres/docker-compose.ha.yml', suite: 'ha',
    name: 'M1 کاراکترِ tab در compose (خرابیِ سازگارِ YAML)',
    bad: '  pg-primary:\n', mut: '\t  pg-primary:\n',
    expectFail: 'pg-compose: بدونِ tab'
  },
  {
    file: 'tools/pitr-restore.sh', suite: 'ha',
    name: 'M2 حذفِ fail-closed از pitr-restore (set -e برداشته شود)',
    bad: 'set -euo pipefail', mut: '# MUT: set removed',
    expectFail: 'tools/pitr-restore.sh: shebang و pipefail'
  },
  {
    file: 'infra/redis/sentinel.conf.template', suite: 'ha',
    name: 'M3 حذفِ sentinel monitor از الگو',
    bad: 'sentinel monitor __MASTER_NAME__ __MASTER_HOST__ __MASTER_PORT__ __QUORUM__\n', mut: '',
    expectFail: 'sentinel: sentinel monitor __MASTER_NAME__'
  },
  {
    file: 'infra/redis/docker-compose.sentinel.yml', suite: 'ha',
    name: 'M4 هاردکدِ رمز در compose به‌جای env',
    bad: 'REDIS_PASSWORD: ${REDIS_PASSWORD:?REDIS_PASSWORD را در env بگذارید}',
    mut: 'REDIS_PASSWORD: "hunter2supersecret99"',
    expectFail: 'هیچ رازِ هاردکد در فایل‌هایِ infra'
  },
  {
    file: 'docs/DR_RUNBOOK.md', suite: 'dr',
    name: 'M5 ارجاعِ runbook به ابزارِ ناموجود',
    bad: 'tools/failover-postgres.sh', mut: 'tools/gone-postgres.sh', replaceAll: true,
    expectFail: 'همۀ ارجاع‌ها به فایلِ موجود می‌رسند'
  },
  {
    file: 'docs/DR_RUNBOOK.md', suite: 'dr',
    name: 'M6 شکستنِ سقفِ RTO در جدولِ سناریوها (۱۴د → ۴۰د)',
    bad: '≈ ۱۴ دقیقه', mut: '≈ ۴۰ دقیقه',
    expectFail: 'هیچ سناریویی سقفِ مصوب را نمی‌شکند (RTO≤۱۵د/RPO≤۵د)'
  }
];

function restore() { WATCH.forEach((f) => fs.writeFileSync(f, FILES[f])); }

let killed = 0;
console.log('\n▸ جهش‌های زیرساختِ HA/PITR/Failover (M1–M6)');
try {
  MUTS.forEach((m) => {
    const src = fs.readFileSync(m.file, 'utf8');
    if (src.indexOf(m.bad) < 0) { console.log('  ❌ ' + m.name + ': لنگر یافت نشد'); return; }
    fs.writeFileSync(m.file, m.replaceAll ? src.split(m.bad).join(m.mut) : src.replace(m.bad, m.mut));
    let out = '', code = 0;
    try { out = execSync(SUITES[m.suite], { stdio: 'pipe', timeout: 120000 }).toString(); }
    catch (e) { code = (e.status === null ? 1 : e.status); out = ((e.stdout || '') + (e.stderr || '')).toString(); }
    const ok = code !== 0 && out.indexOf('❌ ' + m.expectFail) >= 0;
    if (ok) { killed++; console.log('  ✅ ' + m.name + ' کشته شد'); }
    else console.log('  ❌ ' + m.name + ' زنده ماند' + (code === 0 ? ' (خروجیِ سوئیت ۰ شد)' : ' (❌ ' + m.expectFail + ' دیده نشد)'));
    restore();
  });
} finally { restore(); }

let baseOk = true;
try { execSync(SUITES.ha, { stdio: 'pipe', timeout: 120000 }); execSync(SUITES.dr, { stdio: 'pipe', timeout: 120000 }); }
catch (e) { baseOk = false; }
if (baseOk) console.log('  ✅ پس از بازگردانی، هر دو خطِّ پایه سبز است');
else console.log('  ❌ خطِّ پایه پس از بازگردانی سبز نشد');

const total = MUTS.length + 1;
const all = killed + (baseOk ? 1 : 0);
console.log('\n' + '─'.repeat(52));
console.log(`جهش‌های HA: ${all}/${total} موفق` + (all === total ? ' — بدون خطا ✅' : ` — ${total - all} ناموفق ❌`));
process.exit(all === total ? 0 : 1);
