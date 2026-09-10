#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   ha-config.js — اعتبارسنجیِ زیرساختِ HA/PITR (بدونِ داکر در sandbox؛
   همهٔ ایستگاه‌ها متنی/ساختاری‌اند و fail-closed):
     CFG-FILE  وجودِ فایل‌ها
     CFG-YAML  ساختارِ compose + پین‌شدنِ ایمیج‌ها + placeholderهای هم‌خوان
     CFG-SH    bash -n + shebang + set -euo pipefail + بیتِ اجرایی
     CFG-ENV   هر ${VAR:?} اجباریِ compose در env.ha.example پوشش دارد
     CFG-SEC   هیچ رازِ هاردکدِ غیرالگو در infra/ نیست
     CFG-DOC   envهایِ نوشته‌شده در اسناد، همان‌هایی‌اند که سرور می‌خواند
     CFG-PGB   pgbouncer.ini: auth_query معتبر (usename) + هر دو db
     CFG-DEEP  (اختیاری) python3-yaml / docker compose config — در نبودشان ⏭️
   اجرا: node tests/ha-config.js
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const ROOT = path.join(__dirname, '..');

let pass = 0, fail = 0; const errors = [];
function chk(name, cond, extra) {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; errors.push(name + (extra ? ' — ' + String(extra).slice(0, 200) : '')); console.log('  ❌ ' + name + (extra ? '  —  ' + String(extra).slice(0, 200) : '')); }
}
function grp(t) { console.log('\n▸ ' + t); }
const rd = (p) => { try { return fs.readFileSync(path.join(ROOT, p), 'utf8'); } catch (e) { return null; } };

/* ── CFG-FILE ── */
grp('CFG-FILE — وجودِ فایل‌ها');
const FILES = [
  'infra/postgres/docker-compose.ha.yml', 'infra/postgres/Dockerfile',
  'infra/postgres/recovery.conf.template', 'infra/postgres/pgbackrest.conf.template',
  'infra/postgres/pgbouncer/pgbouncer.ini', 'infra/postgres/env.ha.example',
  'infra/postgres/entrypoints/render-config.sh', 'infra/postgres/entrypoints/primary-entrypoint.sh',
  'infra/postgres/entrypoints/standby-entrypoint.sh', 'infra/postgres/init/01-replication.sh',
  'infra/postgres/post-checks.sh',
  'infra/redis/docker-compose.sentinel.yml', 'infra/redis/sentinel.conf.template', 'infra/redis/redis-checks.sh',
  'tools/pitr-restore.sh', 'tools/pitr-verify.sh', 'tools/failover-postgres.sh', 'tools/failover-redis.sh',
  'docs/HA_POSTGRES.md', 'docs/HA_REDIS.md', 'docs/DR_RUNBOOK.md'
];
FILES.forEach((f) => chk('وجود ' + f, rd(f) != null));

/* ── CFG-YAML ── */
grp('CFG-YAML — ساختار');
function yamlSanity(label, src, requiredServices) {
  if (!src) return;
  chk(label + ': بدونِ tab', !src.includes('\t'));
  chk(label + ': بدونِ CRLF', !src.includes('\r\n'));
  const opens = (src.match(/\$\{/g) || []).length;
  const closes = (src.match(/\}/g) || []).length;
  chk(label + ': پلاهدارهایِ ${ متوازن', opens <= closes, opens + '/' + closes);
  chk(label + ': ایمیج‌ها پین‌شده (نه latest)', !/image:\s*\S+:latest\s*$/m.test(src));
  const servicesBlock = src.split('\nservices:')[1] || '';
  requiredServices.forEach((s) => chk(label + ': سرویس «' + s + '»', new RegExp('\\n  ' + s + ':').test(servicesBlock)));
  chk(label + ': restart برایِ همهٔ سرویس‌هایِ stateful', (servicesBlock.match(/restart: unless-stopped/g) || []).length >= 4);
  chk(label + ': bind روی 127.0.0.1 (نه 0.0.0.0 در host)', !/ports:\s*\n\s*- "0\.0\.0\.0:/.test(src));
}
const pgCompose = rd('infra/postgres/docker-compose.ha.yml');
const redisCompose = rd('infra/redis/docker-compose.sentinel.yml');
yamlSanity('pg-compose', pgCompose, ['pg-primary', 'pg-standby', 'pgbouncer', 'pg-backup', 'minio']);
yamlSanity('redis-compose', redisCompose, ['redis-master', 'redis-replica-1', 'redis-replica-2', 'sentinel-1', 'sentinel-2', 'sentinel-3']);
/* placeholderهایِ template باید دقیقاً توسطِ sed/render پوشیده شوند */
function placeholders(src) { return [...new Set((src.match(/__[A-Z0-9_]+__/g) || []))]; }
const sentTpl = rd('infra/redis/sentinel.conf.template') || '';
const sentPlaceholders = placeholders(sentTpl);
const sedCovers = (redisCompose.match(/s\|(__[A-Z0-9_]+__)\|/g) || []).map((x) => x.replace(/^s\|/, '').replace(/\|$/, ''));
chk('redis: همهٔ placeholderهایِ sentinel با sed پوشیده می‌شوند',
  sentPlaceholders.every((p) => sedCovers.includes(p)), sentPlaceholders.filter((p) => !sedCovers.includes(p)).join(','));
const pbTpl = rd('infra/postgres/pgbackrest.conf.template') || '';
const render = rd('infra/postgres/entrypoints/render-config.sh') || '';
const pbMissing = placeholders(pbTpl).filter((p) => !render.includes(p));
chk('pg: همهٔ placeholderهایِ pgbackrest در render-config پوشیده می‌شوند', pbMissing.length === 0, pbMissing.join(','));

/* ── CFG-SH ── */
grp('CFG-SH — اسکریپت‌ها');
const SH = ['infra/postgres/entrypoints/render-config.sh', 'infra/postgres/entrypoints/primary-entrypoint.sh',
  'infra/postgres/entrypoints/standby-entrypoint.sh', 'infra/postgres/init/01-replication.sh',
  'infra/postgres/post-checks.sh', 'infra/redis/redis-checks.sh',
  'tools/pitr-restore.sh', 'tools/pitr-verify.sh', 'tools/failover-postgres.sh', 'tools/failover-redis.sh'];
SH.forEach((f) => {
  const src = rd(f); if (!src) return;
  const r = spawnSync('bash', ['-n', path.join(ROOT, f)], { encoding: 'utf8' });
  chk(f + ': نحو (bash -n)', r.status === 0, (r.stderr || '').slice(0, 120));
  chk(f + ': shebang و pipefail', src.startsWith('#!') && /set -euo pipefail/.test(src));
  try { fs.accessSync(path.join(ROOT, f), fs.constants.X_OK); chk(f + ': بیتِ اجرایی', true); }
  catch (e) { chk(f + ': بیتِ اجرایی', false); }
});

/* ── CFG-TPL — الگوهایِ recovery/sentinel ── */
grp('CFG-TPL — الگوها');
{
  const recTpl = rd('infra/postgres/recovery.conf.template') || '';
  chk('recovery.template: primary_conninfo + restore_command + hot_standby',
    /primary_conninfo/.test(recTpl) && /restore_command/.test(recTpl) && /hot_standby = on/.test(recTpl));
  chk('recovery.template: راهنمایِ PG12+ (standby.signal/recovery.signal) دارد', /standby\.signal/.test(recTpl) && /recovery\.signal/.test(recTpl));
  const sentT = rd('infra/redis/sentinel.conf.template') || '';
  chk('sentinel: sentinel monitor __MASTER_NAME__', /sentinel monitor __MASTER_NAME__ __MASTER_HOST__ __MASTER_PORT__ __QUORUM__/.test(sentT));
  chk('sentinel: down-after و failover-timeout و parallel-syncs',
    /sentinel down-after-milliseconds __MASTER_NAME__ __DOWN_AFTER__/.test(sentT)
    && /sentinel failover-timeout __MASTER_NAME__ __FAILOVER_TIMEOUT__/.test(sentT)
    && /sentinel parallel-syncs/.test(sentT));
  chk('sentinel: resolve-hostnames برایِ محیطِ container', /sentinel resolve-hostnames yes/.test(sentT));
  chk('sentinel: احرازِ placeholder-محور (requirepass/auth-pass/masterauth)',
    /requirepass __REDIS_PASSWORD__/.test(sentT) && /sentinel auth-pass __MASTER_NAME__ __REDIS_PASSWORD__/.test(sentT)
    && /masterauth __REDIS_PASSWORD__/.test(sentT));
  chk('sentinel: فرمان‌هایِ تخریبیِ sentinel بسته', /rename-command FLUSHALL ""/.test(sentT));
}

/* ── CFG-ENV ── */
grp('CFG-ENV — قراردادِ env-file');
const envExample = rd('infra/postgres/env.ha.example') || '';
const requiredVars = [...new Set(((pgCompose || '').match(/\$\{([A-Z0-9_]+):\?/g) || []).map((m) => m.slice(2, -2)))];
const uncovered = requiredVars.filter((v) => !new RegExp('(^|\\n)\\s*#?\\s*' + v + '=').test(envExample));
chk('همهٔ ${VAR:?} اجباری در env.ha.example دیده می‌شوند', uncovered.length === 0, uncovered.join(','));
const filledSecrets = (envExample.match(/^[A-Z0-9_]*(PASSWORD|SECRET|KEY)[A-Z0-9_]*=.+$/gm) || []);
chk('env-example: هیچ کلیدِ رازی مقدارِ پر ندارد', filledSecrets.length === 0, filledSecrets.join(' | ').slice(0, 120));

/* ── CFG-SEC ── */
grp('CFG-SEC — الگوهایِ راز');
/* رازِ هاردکد = مقدارِ «عینی» که حتی یکِ $ (compose/env) یا __ (template) در
   خودِ مقدار نباشد؛ ارجاع‌هایِ ${VAR} و پیشوندِ $VAR مجازند. */
const secretPat = /(?:password|passwd|secret|token|api[-_]?key)[ \t]*[:=][ \t]*["']?\$?[A-Za-z0-9+\/._-]{12,}/i;
const secretValueLiteral = (m) => { const v = (m.match(/[:=]\s*["']?([^"']*)/) || [])[1] || ''; return !v.includes('$') && !v.includes('__'); };
let secHits = [];
['infra/postgres/docker-compose.ha.yml', 'infra/redis/docker-compose.sentinel.yml',
 'infra/postgres/pgbouncer/pgbouncer.ini', 'infra/postgres/recovery.conf.template',
 'infra/postgres/env.ha.example', 'infra/postgres/pgbackrest.conf.template',
 'infra/redis/sentinel.conf.template'].forEach((f) => {
  const s = rd(f); if (!s) return;
  (s.match(new RegExp(secretPat.source, 'gi')) || []).forEach((hit) => { if (secretValueLiteral(hit)) secHits.push(f + ' → ' + hit); });
});
chk('هیچ رازِ هاردکد در فایل‌هایِ infra', secHits.length === 0, secHits.join(','));

/* ── CFG-DOC ── */
grp('CFG-DOC — اسناد ≡ کدِ سرور');
const dbjs = rd('server/db.js') || ''; const redisjs = rd('server/redis.js') || '';
const pgDoc = rd('docs/HA_POSTGRES.md') || ''; const redisDoc = rd('docs/HA_REDIS.md') || '';
chk('HA_POSTGRES از DATABASE_URL/READ_DATABASE_URL (و این‌ها در db.js زنده‌اند)',
  /DATABASE_URL/.test(pgDoc) && /READ_DATABASE_URL/.test(pgDoc)
  && dbjs.includes('READ_DATABASE_URL') && dbjs.includes('DATABASE_URL'));
chk('HA_REDIS از REDIS_SENTINELS/REDIS_SENTINEL_NAME (مطابق redis.js) و mymaster',
  /REDIS_SENTINELS/.test(redisDoc) && /REDIS_SENTINEL_NAME/.test(redisDoc)
  && redisjs.includes('REDIS_SENTINELS') && redisjs.includes('REDIS_SENTINEL_NAME')
  && /mymaster/.test(redisDoc) && redisjs.includes("'mymaster'"));
chk('DR_RUNBOOK هر دو فایلِ infra را صدا می‌زند',
  /infra\/postgres\/docker-compose\.ha\.yml/.test(rd('docs/DR_RUNBOOK.md') || '')
  && /infra\/redis\/docker-compose\.sentinel\.yml/.test(rd('docs/DR_RUNBOOK.md') || ''));

/* ── CFG-PGB ── */
grp('CFG-PGB — pgbouncer.ini');
const pgb = rd('infra/postgres/pgbouncer/pgbouncer.ini') || '';
chk('auth_query با ستونِ صحیحِ pg_shadow (usename — نه username)', /auth_query = SELECT usename, passwd FROM pg_shadow WHERE usename = \$1/.test(pgb) && !/WHERE username/.test(pgb));
chk('هر دو دیتابیسِ primary/readonly تعریف شده', /^payesh\s+=/m.test(pgb) && /^payesh-readonly\s+=/m.test(pgb));
chk('pool_mode=transaction + max_client_conn قفل', /pool_mode = transaction/.test(pgb) && /max_client_conn = 2000/.test(pgb));

/* ── CFG-DEEP (اختیاری: در نبودِ ابزار ⏭️) ── */
grp('CFG-DEEP — اعتبارسنجیِ عمیقِ انتخابی');
let yamlOk = null;
try { const r = spawnSync('python3', ['-c', 'import yaml'], { encoding: 'utf8' }); yamlOk = r.status === 0; } catch (e) {}
if (yamlOk) {
  for (const f of ['infra/postgres/docker-compose.ha.yml', 'infra/redis/docker-compose.sentinel.yml']) {
    const r = spawnSync('python3', ['-c', `import yaml,sys; list(yaml.safe_load_all(open(${JSON.stringify(path.join(ROOT, f))})))`], { encoding: 'utf8' });
    chk('yaml.safe_load: ' + f, r.status === 0, (r.stderr || '').slice(0, 160));
  }
} else console.log('     ⏭️  python3-yaml نیست — parse عمیقِ YAML در CI اجرا می‌شود');
let hasDocker = false;
try { hasDocker = spawnSync('docker', ['--version'], { encoding: 'utf8' }).status === 0; } catch (e) {}
console.log(hasDocker ? '     (docker هست — می‌توان «docker compose config» را دستی زد)' : '     ⏭️  docker نیست (sandbox) — config-check در محیطِ میزبان');

console.log('\n' + '─'.repeat(52));
console.log(`نتیجه HA Config: ${pass}/${pass + fail} موفق` + (fail ? `  —  ${fail} ناموفق ❌` : '  —  بدون خطا ✅'));
if (errors.length) console.log('ناموفق‌ها: ' + errors.join(' | '));
process.exit(fail ? 1 : 0);
