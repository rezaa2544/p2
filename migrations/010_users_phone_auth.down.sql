-- 010 down — حذفِ ایندکسِ جستجوی تلفن (بدونِ دست‌زدن به داده)
-- قرارداد §۳۰: بازگشت نیز تراکنشی است
BEGIN;
DROP INDEX IF EXISTS idx_users_phone_auth;
COMMIT;
