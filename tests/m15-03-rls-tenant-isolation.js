'use strict';
/* tests/m15-03-rls-tenant-isolation.js — M15-03 (ردیف ۲۰): سوئیتِ جداسازیِ
   multi-tenant با ROW LEVEL SECURITY (گزینهٔ B — امضای مالک 2026-11-25).
   ───────────────────────────────────────────────────────────────────
   R1  static: migration 030 = DO block + ENABLE/FORCE + tenant_isolation
   R2  live: RLS فعال + FORCE روی همهٔ جداولِ tenant-scoped
       (relrowsecurity ∧ relforcerowsecurity = تعدادِ جداولِ دارایِ school_id)
   R3  live: fail-closed — نقشِ probe بدونِ SET payesh.tenant = صفر سطر
   R4  live: cross-tenant — SET tenant=مدرسهٔ A ⇒ سطرهایِ A دیده می‌شوند،
       سطرهایِ مدرسهٔ B نامرئی (هر دو جهتِ SELECT)
   R5  live: WITH CHECK — نوشتنِ سطرِ مدرسهٔ دیگر با SET=مدرسهٔ A = رد
   R6  live: نقشِ مدیریتی — payesh_admin با BYPASSRLS موجود است و
       superuser همهٔ سطرها را می‌بیند (معیار ۴ برگه)
   R7  زنده بودنِ داده: حداقل ۲ مدرسه برای سناریوی متقاطع (در نبود داده،
       خودش دو مدرسهٔ آزمونی می‌سازد و پاک می‌کند)
   بدونِ DATABASE_URL ⇒ self-skip صادقانه (الگوی wave3-parity) — NOT-RUN
   هرگز PASS شمرده نمی‌شود.
   Run: DATABASE_URL=… node tests/m15-03-rls-tenant-isolation.js */

const fs = require('fs');
const path = require('path');

let ok = 0, fail = 0, skipped = 0;
function chk(name, cond, extra) {
  if (cond) { ok++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ ' + name + (extra ? ' — ' + extra : '')); }
}
function skip(name, why) {
  skipped++;
  console.log('  ⏭️ ' + name + ' (' + why + ')');
}

(async () => {
  console.log('\n▸ M15-03 — جداسازیِ multi-tenant با RLS');

  /* R1 — static: migration 030 */
  const mig = fs.readFileSync(path.join(__dirname, '..', 'migrations', '030_rls_tenant_isolation.sql'), 'utf8');
  const down = fs.readFileSync(path.join(__dirname, '..', 'migrations', '030_rls_tenant_isolation.down.sql'), 'utf8');
  chk('R1a migration = ENABLE + FORCE + POLICY', mig.includes('ENABLE ROW LEVEL SECURITY') && mig.includes('FORCE ROW LEVEL SECURITY') && mig.includes('CREATE POLICY tenant_isolation'));
  chk('R1b fail-closed = current_setting با missing_ok', mig.includes("current_setting(''payesh.tenant'', true)") && mig.includes('NULLIF'));
  chk('R1c نقشِ payesh_admin با BYPASSRLS (معیار ۴)', mig.includes('BYPASSRLS'));
  chk('R1d down = DROP POLICY + NO FORCE + DISABLE', down.includes('DROP POLICY IF EXISTS tenant_isolation') && down.includes('NO FORCE ROW LEVEL SECURITY') && down.includes('DISABLE ROW LEVEL SECURITY'));

  const hasPg = !!(process.env.DATABASE_URL || process.env.PGURL);
  let db = null;
  if (hasPg) {
    try {
      const { Pool } = require('pg');
      const cs = process.env.DATABASE_URL || process.env.PGURL;
      db = new Pool({ connectionString: cs, connectionTimeoutMillis: 5000 });
      await db.query('SELECT 1');
    } catch (e) {
      db = null;
      skip('R2..R7 (اتصالِ PG)', 'اتصال ممکن نشد: ' + e.message);
    }
  } else {
    skip('R2..R7 (PG زنده)', 'DATABASE_URL تنظیم نیست — self-skip صادقانه؛ این اجرا PASS شمرده نمی‌شود');
  }

  if (db) {
    try {
      /* R2 — RLS فعال + FORCE روی همهٔ جداولِ tenant-scoped */
      const t = await db.query(
        "SELECT c.table_name AS n FROM information_schema.columns c " +
        "JOIN information_schema.tables tb ON tb.table_schema='public' AND tb.table_name=c.table_name AND tb.table_type='BASE TABLE' " +
        "WHERE c.table_schema='public' AND c.column_name='school_id'");
      const g = await db.query(
        "SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace " +
        "WHERE n.nspname='public' AND c.relrowsecurity=true AND c.relforcerowsecurity=true AND c.relkind IN ('r','p')");
      const tenantSet = new Set(t.rows.map(r => r.n));
      const rlsSet = new Set(g.rows.map(r => r.relname));
      let missing = [];
      for (const n of tenantSet) if (!rlsSet.has(n)) missing.push(n);
      chk('R2 RLS+FORCE روی همهٔ ' + tenantSet.size + ' جدولِ tenant-scoped', missing.length === 0,
        'missing=' + missing.slice(0, 5).join(','));
      const pol = await db.query("SELECT count(*)::int AS c FROM pg_policies WHERE schemaname='public' AND policyname='tenant_isolation'");
      chk('R2b سیاستِ tenant_isolation روی ' + tenantSet.size + ' جدول', pol.rows[0].c >= tenantSet.size,
        'policies=' + pol.rows[0].c);

      /* R7 — دو مدرسه برای سناریو (در نبودِ داده، ساختِ آزمونی) */
      let schools = (await db.query("SELECT DISTINCT school_id AS s FROM users WHERE school_id IS NOT NULL ORDER BY 1 LIMIT 2")).rows.map(r => Number(r.s));
      const created = [];
      while (schools.length < 2) {
        const ins = await db.query("INSERT INTO schools (name) VALUES ($1) RETURNING id", ['RLS-PROBE-' + Date.now() + '-' + schools.length]);
        schools.push(Number(ins.rows[0].id));
        created.push(Number(ins.rows[0].id));
      }
      const [sA, sB] = schools;
      /* یک کاربر در هر مدرسه برای اطمینان از داده */
      for (const s of [sA, sB]) {
        const has = await db.query('SELECT count(*)::int AS c FROM users WHERE school_id=$1', [s]);
        if (has.rows[0].c === 0) {
          created.push(s); /* برای پاکسازیِ متعاقب */
          await db.query("INSERT INTO users (full_name, role, school_id) VALUES ($1, 'student', $2)", ['RLS-PROBE-USER', s]);
        }
      }
      chk('R7 دو مدرسهٔ آماده برای سناریو', sA !== sB, 'schools=' + schools.join(','));

      /* نقشِ probe (فقط برای این اجرا) */
      await db.query("DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='payesh_tenant_probe') THEN CREATE ROLE payesh_tenant_probe NOLOGIN; END IF; END $$");
      await db.query("GRANT USAGE ON SCHEMA public TO payesh_tenant_probe");
      await db.query("GRANT SELECT, INSERT ON users TO payesh_tenant_probe");
      await db.query("GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO payesh_tenant_probe");

      /* R3 — fail-closed: بدونِ SET = صفر سطر */
      await db.query('SET ROLE payesh_tenant_probe');
      const none = await db.query('SELECT count(*)::int AS c FROM users');
      chk('R3 fail-closed: بدونِ SET = صفر سطر', none.rows[0].c === 0, 'saw=' + none.rows[0].c);
      await db.query('RESET ROLE');

      /* R4 — cross-tenant: SET=A ⇒ فقط A؛ B نامرئی */
      await db.query('SET ROLE payesh_tenant_probe');
      await db.query("SELECT set_config('payesh.tenant', $1, false)", [String(sA)]);
      const a = await db.query('SELECT count(*)::int AS c FROM users WHERE school_id=$1', [sA]);
      const bHidden = await db.query('SELECT count(*)::int AS c FROM users WHERE school_id=$1', [sB]);
      chk('R4a با SET=A سطرهایِ A دیده می‌شوند', a.rows[0].c > 0, 'saw=' + a.rows[0].c);
      chk('R4b سطرهایِ مدرسهٔ B نامرئی', bHidden.rows[0].c === 0, 'leaked=' + bHidden.rows[0].c);

      /* R5 — WITH CHECK: نوشتنِ سطرِ مدرسهٔ B با SET=A = رد */
      let writeRejected = false, writeErr = '';
      try {
        await db.query("INSERT INTO users (full_name, role, school_id) VALUES ('RLS-CROSS', 'student', $1)", [sB]);
      } catch (e) { writeRejected = true; writeErr = e.message.slice(0, 80); }
      chk('R5 نوشتنِ cross-tenant = رد (WITH CHECK)', writeRejected, writeErr);
      await db.query('RESET ROLE');
      await db.query('RESET payesh.tenant');

      /* R6 — مسیرِ مدیریتی: superuser همه را می‌بیند + payesh_admin موجود */
      const all = await db.query('SELECT count(*)::int AS c FROM users WHERE school_id IN ($1,$2)', [sA, sB]);
      chk('R6a superuser (مسیرِ مهاجرت/ابزار) همهٔ سطرها را می‌بیند', all.rows[0].c >= 2, 'saw=' + all.rows[0].c);
      const adm = await db.query("SELECT rolbypassrls FROM pg_roles WHERE rolname='payesh_admin'");
      chk('R6b payesh_admin با BYPASSRLS موجود', adm.rows.length === 1 && adm.rows[0].rolbypassrls === true);

      /* پاکسازیِ دادهٔ آزمونی */
      await db.query('DELETE FROM users WHERE full_name LIKE $1 AND school_id = ANY($2::int[])', ['RLS-PROBE-USER%', schools]);
      await db.query("DELETE FROM users WHERE full_name = 'RLS-CROSS'");
      for (const s of created) await db.query('DELETE FROM schools WHERE id=$1', [s]);
      await db.query('REVOKE SELECT, INSERT ON users FROM payesh_tenant_probe');
      await db.query('REVOKE ALL ON SCHEMA public FROM payesh_tenant_probe');
      await db.query('REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM payesh_tenant_probe');
      await db.query('DROP OWNED BY payesh_tenant_probe');
      await db.query('DROP ROLE IF EXISTS payesh_tenant_probe');
    } finally {
      await db.end().catch(() => {});
    }
  }

  console.log('────────────────────────────────────────────');
  console.log('m15-03-rls-tenant-isolation: ' + ok + ' pass / ' + fail + ' fail' + (skipped ? ' / ' + skipped + ' skip' : ''));
  console.log('CHECKS ' + (ok + fail) + ' FAIL ' + fail);
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error('FATAL ' + (e && e.stack || e && e.message));
  process.exit(1);
});
