-- ═══════════════════════════════════════════════════════════════════
-- 010_users_phone_auth.sql — P1-1 (Wave 18 §۵-۴): ایندکسِ عبارتیِ
-- جستجوی کاربرِ auth بر اساسِ تلفن
--
-- send-code/login (server/auth.js: userByPhone) کاربر را با کلیدِ
-- «۱۰ رقمِ آخرِ تلفنِ نرمال‌شده» می‌جویند (حذفِ فاصله/خط تیره/پرانتز).
-- همین عبارت اینجاست تا lookup در PG یک Index Scan باشد، نه Seq Scan
-- روی جدولِ میلیون‌ردیفی (Wave 18 §۵-۴: اسکنِ خطیِ آینه/جدول در
-- دیتاستِ ملی).
--
-- tie-break سازگار با رفتارِ قبلیِ آینه: کوئری ORDER BY id LIMIT 1
-- دارد و hydration نیز ORDER BY id است — پس همان کاربری برمی‌گردد
-- که find() روی آینه برمی‌گرداند.
--
-- الگوی ۰۰۷: CREATE INDEX IF NOT EXISTS (idempotent؛ فقط روی جدولِ
-- موجود، بدون تغییرِ داده).
-- ═══════════════════════════════════════════════════════════════════
-- قرارداد §۳۰ مهاجرت‌ها: هر مهاجرت تراکنشی است (BEGIN/COMMIT)
BEGIN;
CREATE INDEX IF NOT EXISTS idx_users_phone_auth
  ON users (right(regexp_replace(phone, '[\s\-()]', '', 'g'), 10));
COMMIT;
