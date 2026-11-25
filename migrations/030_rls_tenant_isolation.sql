-- 030_rls_tenant_isolation.sql — M15-03 (ردیف ۲۰): RLS به‌عنوان دفاعِ عمق‌دار
-- ─────────────────────────────────────────────────────────────────────
-- امضای مالک: گزینهٔ B (docs/M15_ARCHITECTURE_SIGNOFF.md — 2026-11-25).
-- سیاست: روی «هر» جدولی که ستونِ school_id دارد (فهرست از schema واقعی
-- در لحظهٔ اجرا) ROW LEVEL SECURITY فعال و FORCE می‌شود؛ سیاستِ
-- tenant_isolation فقط سطرهای هم‌مدرسه را می‌بیند:
--   * اتصالِ بدونِ SET payesh.tenant = current_setting(...,true)=NULL
--     ⇒ مقایسه NULL ⇒ صفر سطر خواندن و ردِ نوشتن (fail-closed).
--   * postgres (superuser) و payesh_admin (BYPASSRLS) مستثنا هستند —
--     مهاجرت‌ها/ابزارهای مدیریتی از این مسیر (معیار ۴ برگه).
-- لایهٔ کاربرد (inScope + fieldGate) بدونِ تغییر می‌ماند؛ RLS = دفاعِ دوم.
-- Rollback: 030_rls_tenant_isolation.down.sql
BEGIN;

-- نقشِ مدیریتیِ بدونِ RLS (معیار ۴): فقط برایِ مهاجرت/ابزار — NOLOGIN
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'payesh_admin') THEN
    CREATE ROLE payesh_admin NOLOGIN BYPASSRLS;
  END IF;
END $$;

DO $mig$
DECLARE t text;
BEGIN
  FOR t IN
    SELECT c.table_name
    FROM information_schema.columns c
    JOIN information_schema.tables tb
      ON tb.table_schema = c.table_schema AND tb.table_name = c.table_name
     AND tb.table_type = 'BASE TABLE'
    WHERE c.table_schema = 'public'
      AND c.column_name = 'school_id'
    ORDER BY c.table_name
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON public.%I ' ||
      'USING (school_id = NULLIF(current_setting(''payesh.tenant'', true), '''')::int) ' ||
      'WITH CHECK (school_id = NULLIF(current_setting(''payesh.tenant'', true), '''')::int)',
      t);
  END LOOP;
END $mig$;

COMMIT;
