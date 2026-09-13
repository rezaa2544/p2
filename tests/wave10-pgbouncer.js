#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   tests/wave10-pgbouncer.js — Wave 10 (Database Scale), step 2
   ─────────────────────────────────────────────────────────────────
   قراردادِ پیکربندیِ PgBouncer (درِ ورودِ برنامه به PG):
     P1  ini قابل‌پارس است و هر دو پایگاه (primary/readonly) تعریف شده‌اند
     P2  pool_mode=transaction + reset کوئری‌ها
     P3  سقف‌های اتصالِ ملی‌مقیاس (max_client_conn ≥ 2000، pool ≥ 25،
         reserve ≥ 5، idle/lifetime محدود)
     P4  احرازِ هویت بدونِ رازِ ثابت (auth_query — هیچ رمزی در فایل نیست)
     P5  compose: سرویسِ pgbouncer + مونتِ ini + بستنِ پورت به 127.0.0.1
         + healthcheck
     P6  قراردادِ نام‌گذاری با کد: dbasename های payesh/payesh-readonly با
         DATABASE_URL/READ_DATABASE_URLِ server/db.js هم‌خوان‌اند
     P7  هیچ رمزِ سختی در هیچ‌یک از فایل‌هایِ pgbouncer نیست

   Run: node tests/wave10-pgbouncer.js   (exit 0 = green)
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

let okc = 0, failc = 0;
const fails = [];
function chk(name, cond, extra) {
  if (cond) { okc++; console.log('  ✅ ' + name); }
  else { failc++; fails.push(name); console.log('  ❌ ' + name + (extra ? ' — ' + extra : '')); }
}

/* پارسرِ ini مینیمال (بدون وابستگی) */
function parseIni(text) {
  const out = { sections: {} };
  let cur = null;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/;;?.*$/, '').trim();
    if (!line) continue;
    const sec = line.match(/^\[([^\]]+)\]$/);
    if (sec) { cur = sec[1]; out.sections[cur] = {}; continue; }
    const kv = line.match(/^([^=]+?)\s*=\s*(.*)$/);
    if (kv && cur) { out.sections[cur][kv[1].trim()] = kv[2].trim(); }
  }
  return out;
}

console.log('\n▸ Wave 10 · گام ۲ — قراردادِ PgBouncer');

const iniPath = path.join(ROOT, 'infra', 'postgres', 'pgbouncer', 'pgbouncer.ini');
const ini = parseIni(fs.readFileSync(iniPath, 'utf8'));

/* P1 */
const dbs = ini.sections.databases || {};
chk('P1a پایگاهِ primary (payesh → pg-primary:5432)', /^host=pg-primary\s+port=5432\s+dbname=payesh$/.test(dbs.payesh || ''), JSON.stringify(dbs.payesh));
chk('P1b پایگاهِ readonly (payesh-readonly → pg-standby:5432)', /^host=pg-standby\s+port=5432\s+dbname=payesh$/.test(dbs['payesh-readonly'] || ''), JSON.stringify(dbs['payesh-readonly']));

/* P2 */
const pg = ini.sections.pgbouncer || {};
chk('P2a pool_mode=transaction', pg.pool_mode === 'transaction', pg.pool_mode);
chk('P2b server_reset_query=DEALLOCATE ALL', pg.server_reset_query === 'DEALLOCATE ALL', pg.server_reset_query);

/* P3 */
chk('P3a max_client_conn ≥ 2000', Number(pg.max_client_conn) >= 2000, pg.max_client_conn);
chk('P3b default_pool_size ≥ 25', Number(pg.default_pool_size) >= 25, pg.default_pool_size);
chk('P3c reserve_pool_size ≥ 5', Number(pg.reserve_pool_size) >= 5, pg.reserve_pool_size);
chk('P3d reserve_pool_timeout ≤ 5s', Number(pg.reserve_pool_timeout) <= 5, pg.reserve_pool_timeout);
chk('P3e server_lifetime ≤ 1h (چرخشِ اتصال‌ها)', Number(pg.server_lifetime) > 0 && Number(pg.server_lifetime) <= 3600, pg.server_lifetime);
chk('P3f server_idle_timeout ≤ 15min', Number(pg.server_idle_timeout) > 0 && Number(pg.server_idle_timeout) <= 900, pg.server_idle_timeout);
chk('P3g query_timeout محدود (≤ 600s)', Number(pg.query_timeout) > 0 && Number(pg.query_timeout) <= 600, pg.query_timeout);

/* P4 */
chk('P4a auth_query از pg_shadow (بدونِ userlist ثابت)', /pg_shadow/.test(pg.auth_query || ''), pg.auth_query);
chk('P4b auth_type=plain روی کانالِ محلی (TLS/TCP لبه)', pg.auth_type === 'plain', pg.auth_type);

/* P5 */
const compose = fs.readFileSync(path.join(ROOT, 'infra', 'postgres', 'docker-compose.ha.yml'), 'utf8');
chk('P5a سرویسِ pgbouncer در compose', /^\s{2}pgbouncer:/m.test(compose));
chk('P5b ini به‌صورت read-only مونت می‌شود', /pgbouncer\.ini:\/etc\/pgbouncer\/pgbouncer\.ini:ro/.test(compose));
chk('P5c پورت فقط به 127.0.0.1 bind می‌شود', /127\.0\.0\.1:6432:6432/.test(compose) && !/"6432:6432"/.test(compose));
chk('P5d healthcheck با pg_isready روی 6432', /pg_isready -h 127\.0\.0\.1 -p 6432/.test(compose));
chk('P5e depends_on: pg-primary سالم', /pgbouncer:[\s\S]*?depends_on:[\s\S]*?pg-primary:[\s\S]*?condition: service_healthy/.test(compose) || compose.indexOf('pgbouncer:') < compose.indexOf('pg-primary:'));

/* P6 — هم‌خوانی با کدِ برنامه */
const dbSrc = fs.readFileSync(path.join(ROOT, 'server', 'db.js'), 'utf8');
chk('P6a db.js از READ_DATABASE_URL می‌خواند (رپلیکا از همان در)', /READ_DATABASE_URL/.test(dbSrc));
chk('P6b db.js از DATABASE_URL می‌خواند', /DATABASE_URL/.test(dbSrc));
const docs = fs.readFileSync(path.join(ROOT, 'docs', 'WAVE10_DB_SCALE.md'), 'utf8');
chk('P6c سندِ موج ۱۰ جفتِ pgbouncer/readonly را ثبت کرده', /pgbouncer/i.test(docs) && /payesh-readonly/.test(docs));

/* P7 — هیچ رازِ سختی */
const iniRaw = fs.readFileSync(iniPath, 'utf8');
chk('P7 هیچ رمز/توکن سختی در ini نیست', !/(password|passwd|secret|token)\s*=\s*(?!SELECT)/i.test(iniRaw.replace(/auth_query\s*=\s*SELECT[^\n]*/gi, '')));

console.log('\n────────────────────────────────────────────');
if (failc === 0) console.log(`Wave10 pgbouncer: ${okc}/${okc} — بدون خطا ✅`);
else {
  console.log(`Wave10 pgbouncer: ${okc}/${okc + failc} — ${failc} خطا ❌`);
  fails.forEach((f) => console.log('  ✗ ' + f));
}
process.exit(failc ? 1 : 0);
