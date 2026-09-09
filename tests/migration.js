#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   tests/migration.js — ابزارِ migration نسخه‌دار (node-pg-migrate)
   -------------------------------------------------------------------
   • فایل‌ها ترتیبی + مارکرِ Up/Down + پوششِ همهٔ کالکشن‌هایِ model.json
   • اعمالِ واقعیِ up/down روی PostgreSQL واقعیِ درون‌پروسه (PGlite):
     ۸۴ جدول، ایندکس‌ها، FKها، برگشتِ کامل به صفر
   • رفتارِ fail-closed اسکریپت: بدونِ DATABASE_URL، ماسکِ رمز، نامِ ناامن
   توجه: خط‌هایِ CREATE EXTENSION در PGlite اجرا نمی‌شوند (اکستنشن ندارد؛
   изделиه در PG واقعی اعمال می‌شود) — بودنشان در فایل جداگانه سنجیده می‌شود.
   اجرا:  node tests/migration.js   (نیازمند: @electric-sql/pglite)
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const DIR = path.join(ROOT, 'migrations');

let pass = 0, fail = 0;
async function test(name, fn){
  try { await fn(); pass++; console.log('  ✅ ' + name); }
  catch(e){ fail++; console.error('  ❌ ' + name + '\n     ' + (e && e.message)); }
}
const files = () => fs.readdirSync(DIR).filter(f => f.endsWith('.sql')).sort();
const read = f => fs.readFileSync(path.join(DIR, f), 'utf8');
const upOf = t => t.split('-- Up Migration')[1].split('-- Down Migration')[0];
const downOf = t => t.split('-- Down Migration')[1];
const stripExt = s => s.split('\n').filter(l => !/^\s*CREATE EXTENSION/i.test(l)).join('\n');

async function main(){
  console.log('\n🔍 Migration Tests (versioned PG migrations)');
  const model = JSON.parse(fs.readFileSync(path.join(ROOT, 'authz', 'model.json'), 'utf8'));
  const colls = Object.keys(model.collections || {});

  await test('MG1: migration files sequenced with Up/Down markers', async () => {
    const fs_ = files();
    assert.ok(fs_.length >= 2, 'want ≥2 migrations');
    assert.ok(fs_[0].startsWith('001_') && fs_[1].startsWith('002_'), 'want 001/002 prefix');
    for(const f of fs_){
      const t = read(f);
      assert.ok(t.includes('-- Up Migration'), f + ' missing Up marker');
      assert.ok(t.includes('-- Down Migration'), f + ' missing Down marker');
      assert.ok(upOf(t).trim().length > 100, f + ' empty Up');
      assert.ok(downOf(t).trim().length > 10, f + ' empty Down');
    }
  });

  await test('MG2: every model.json collection has CREATE TABLE in 001', async () => {
    const up = upOf(read('001_initial.sql'));
    const missing = colls.filter(c => !new RegExp(`CREATE TABLE IF NOT EXISTS ${c} \\(`, 'i').test(up));
    assert.deepStrictEqual(missing, [], 'missing tables: ' + missing.join(','));
    assert.ok(/CREATE EXTENSION/i.test(up), 'extensions section must exist (applied by real PG)');
  });

  let PGlite;
  try { ({ PGlite } = await import('@electric-sql/pglite')); }
  catch(e){ console.log('⏭️  @electric-sql/pglite نصب نیست — MG3..MG5 رد شد.'); }

  if(PGlite){
    await test('MG3: PGlite up 001 → 84 tables (81 + 3 internal)', async () => {
      const db = new PGlite();
      try {
        await db.exec(stripExt(upOf(read('001_initial.sql'))));
        const r = await db.query("SELECT count(*) c FROM pg_tables WHERE schemaname='public'");
        assert.strictEqual(Number(r.rows[0].c), 84, 'table count');
        for(const t of ['users','schools','attendance','grades','schedule','server_processed_uids']){
          const x = await db.query('SELECT 1 FROM pg_tables WHERE tablename=$1', [t]);
          assert.strictEqual(x.rows.length, 1, 'table ' + t + ' exists');
        }
      } finally { await db.close(); }
    });

    await test('MG4: PGlite up 002 → indexes + FKs', async () => {
      const db = new PGlite();
      try {
        await db.exec(stripExt(upOf(read('001_initial.sql'))));
        await db.exec(stripExt(upOf(read('002_indexes.sql'))));
        for(const ix of ['idx_users_school_role','idx_attendance_school_class_date','idx_schools_capabilities']){
          const x = await db.query('SELECT 1 FROM pg_indexes WHERE indexname=$1', [ix]);
          assert.strictEqual(x.rows.length, 1, 'index ' + ix + ' exists');
        }
        const fk = await db.query("SELECT count(*) c FROM pg_constraint WHERE contype='f'");
        assert.ok(Number(fk.rows[0].c) > 50, 'FK count: ' + fk.rows[0].c);
      } finally { await db.close(); }
    });

    await test('MG5: PGlite down 002+001 → zero tables (full revert)', async () => {
      const db = new PGlite();
      try {
        await db.exec(stripExt(upOf(read('001_initial.sql'))));
        await db.exec(stripExt(upOf(read('002_indexes.sql'))));
        await db.exec(stripExt(downOf(read('002_indexes.sql'))));
        await db.exec(stripExt(downOf(read('001_initial.sql'))));
        const r = await db.query("SELECT count(*) c FROM pg_tables WHERE schemaname='public'");
        assert.strictEqual(Number(r.rows[0].c), 0, 'tables left: ' + r.rows[0].c);
      } finally { await db.close(); }
    });
  }

  await test('MG6: wrapper fail-closed without DATABASE_URL', async () => {
    const env = Object.assign({}, process.env);
    delete env.DATABASE_URL;
    let out = '', code = 0;
    try { execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'migrate.js'), 'status'], { env, stdio: 'pipe' }); }
    catch(e){ code = e.status; out = String(e.stdout || '') + String(e.stderr || ''); }
    assert.strictEqual(code, 1, 'must exit 1');
    assert.ok(out.includes('DATABASE_URL is required'), 'must name the missing var');
  });

  await test('MG7: wrapper masks password in logged URL', async () => {
    const { maskUrl } = require(path.join(ROOT, 'scripts', 'migrate.js'));
    const m = maskUrl('postgresql://payesh:S3cr3t-pass@localhost:5432/payesh');
    assert.ok(!m.includes('S3cr3t-pass'), 'password leaked: ' + m);
    assert.ok(m.includes('***') && m.includes('localhost'), 'host kept, password masked: ' + m);
  });

  await test('MG8: migrate:create rejects unsafe names (no file written)', async () => {
    const before = files().length;
    let code = 0;
    try {
      execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'migrate.js'), 'create', '../../evil'],
        { env: process.env, stdio: 'pipe' });
    } catch(e){ code = e.status; }
    assert.strictEqual(code, 1, 'must exit 1');
    assert.strictEqual(files().length, before, 'no file must be created');
  });

  console.log(`\nMigration Tests: ${pass}/${pass + fail} passed`);
  if(fail > 0) process.exit(1);
}

if(require.main === module){ main().catch(e => { console.error(e); process.exit(1); }); }
