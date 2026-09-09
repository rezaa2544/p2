#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   scripts/migrate.js — نسخه‌دارِ پایگاه‌داده (node-pg-migrate)
   -------------------------------------------------------------------
   دستورها:
     up               اعمالِ همهٔ migrationهایِ درانتظار
     down [N=1]       برگرداندنِ N قدم (پیش‌فرض ۱؛ در production نیازمند --force)
     status           جدولِ applied/pending (+ خطا اگر فایلِ applied گم شده)
     create <name>    ساختِ فایلِ migration تازه (قالبِ .sql با مارکرِ Up/Down)

   اصول (SKILLS_MASTER):
   • بدونِ DATABASE_URL هیچ کاری نمی‌شود (fail-closed؛ بدونِ پیش‌فرضِ پنهان).
   • رشتهٔ اتصال هرگز کامل لاگ نمی‌شود (ماسکِ رمز).
   • down در production فقط با --force صریح.
   • فایل‌هایِ appliedشده نباید عوض شوند (status مغایرت را گزارش می‌دهد؛
     node-pg-migrate خودش رکوردِ pgmigrations را نگه می‌دارد).

   اجرا:
     DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/DB node scripts/migrate.js up
     npm run migrate:up | migrate:down | migrate:status
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DIR = path.join(ROOT, 'migrations');
const TABLE = 'pgmigrations';

function maskUrl(u){
  return String(u || '').replace(/(:\/\/[^:/@]+:)[^@]+(@)/, '$1***$2');
}

function needDbUrl(){
  const u = process.env.DATABASE_URL;
  if(!u){
    console.error('❌ DATABASE_URL is required (refusing to run without an explicit target).');
    console.error('   Example: DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/DB npm run migrate:up');
    process.exit(1);
  }
  return u;
}

function migrationFiles(){
  if(!fs.existsSync(DIR)) return [];
  return fs.readdirSync(DIR)
    .filter(f => f.endsWith('.sql'))
    .sort()
    .map(f => ({ name: f.slice(0, -4), file: f }));
}

async function pgClient(databaseUrl){
  let pg;
  try { pg = require('pg'); }
  catch(e){
    console.error('❌ pg driver is not installed (npm i pg).');
    process.exit(1);
  }
  const client = new pg.Client({ connectionString: databaseUrl, connectionTimeoutMillis: 8000 });
  await client.connect();
  return client;
}

async function cmdStatus(databaseUrl){
  const files = migrationFiles();
  const client = await pgClient(databaseUrl);
  try {
    await client.query(`CREATE TABLE IF NOT EXISTS ${TABLE} (id SERIAL PRIMARY KEY, name VARCHAR(255) NOT NULL, run_on TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
    const r = await client.query(`SELECT name, run_on FROM ${TABLE} ORDER BY id`);
    const applied = r.rows.map(x => x.name);
    const appliedSet = new Set(applied);
    console.log('target: ' + maskUrl(databaseUrl));
    console.log('migrations dir: migrations/ (' + files.length + ' files)');
    for(const f of files){
      console.log('  ' + (appliedSet.has(f.name) ? '✅ applied  ' : '⏳ pending  ') + f.name);
    }
    const missing = applied.filter(n => !files.some(f => f.name === n));
    if(missing.length){
      console.error('❌ applied migration file(s) missing from disk (history was rewritten!): ' + missing.join(', '));
      process.exit(1);
    }
    const pending = files.filter(f => !appliedSet.has(f.name)).length;
    console.log(pending === 0 ? 'status: up to date ✅' : 'status: ' + pending + ' pending ⏳');
  } finally {
    try { await client.end(); } catch(e){}
  }
}

async function cmdCreate(name){
  if(!name || !/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(name)){
    console.error('❌ create needs a safe name: letters/digits/_/- (got: ' + JSON.stringify(name) + ')');
    process.exit(1);
  }
  const files = migrationFiles();
  let max = 0;
  for(const f of files){
    const m = f.name.match(/^(\d+)_/);
    if(m) max = Math.max(max, parseInt(m[1], 10));
  }
  const next = String(max + 1).padStart(3, '0');
  const file = `${next}_${name}.sql`;
  const body = `-- Migration ${next}: ${name}\n-- Created: ${new Date().toISOString()}\n-- NOTE: never edit a migration after it was applied anywhere.\n\n-- Up Migration\n\n-- TODO: up SQL here\n\n-- Down Migration\n\n-- TODO: down SQL here (must fully revert the Up section)\n`;
  fs.writeFileSync(path.join(DIR, file), body);
  console.log('✅ created migrations/' + file);
}

async function cmdRun(databaseUrl, direction, count){
  let runner;
  try { ({ runner } = require('node-pg-migrate')); }
  catch(e){
    console.error('❌ node-pg-migrate is not installed (npm i -D node-pg-migrate).');
    process.exit(1);
  }
  console.log(`target: ${maskUrl(databaseUrl)}  direction: ${direction}${direction === 'down' ? ` (count=${count})` : ''}`);
  const applied = await runner({
    databaseUrl,
    dir: DIR,
    direction,
    count: direction === 'down' ? count : undefined,
    migrationsTable: TABLE,
    verbose: true,
  });
  if(!applied || applied.length === 0){
    console.log(direction === 'up' ? 'nothing to apply — up to date ✅' : 'nothing to revert ✅');
  } else {
    console.log(`✅ ${direction}: ${applied.length} migration(s) — ` + applied.map(a => a.name || a).join(', '));
  }
}

async function main(){
  const [cmd, arg, flag] = process.argv.slice(2);
  if(cmd === 'create'){ await cmdCreate(arg); return; }
  if(cmd !== 'up' && cmd !== 'down' && cmd !== 'status'){
    console.error('usage: migrate.js <up|down [N]|status|create <name>>');
    process.exit(1);
  }
  const databaseUrl = needDbUrl();
  if(cmd === 'status'){ await cmdStatus(databaseUrl); return; }
  if(cmd === 'down'){
    const n = arg == null ? 1 : Number(arg);
    if(!Number.isInteger(n) || n < 1){
      console.error('❌ down count must be a positive integer (got: ' + JSON.stringify(arg) + ')');
      process.exit(1);
    }
    if(process.env.NODE_ENV === 'production' && flag !== '--force' && arg !== '--force'){
      console.error('❌ refusing down in production without explicit --force.');
      process.exit(1);
    }
    await cmdRun(databaseUrl, 'down', n);
    return;
  }
  await cmdRun(databaseUrl, 'up');
}

if(require.main === module){
  main().catch(e => { console.error('migration failed:', e && e.message ? e.message : e); process.exit(1); });
}

module.exports = { maskUrl, migrationFiles };
