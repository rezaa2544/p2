# payesh-pg-ha — postgres:16 + pgbackrest (WAL archiving و PITR در یک ایمیج)
# چرا ایمیج سفارشی: postgres:16-alpine بستهٔ pgbackrest ندارد و ایمیج
# شخصِ ثالثِ متحرک نمی‌خواهیم؛ نسخهٔ ایمیجِ پایه و pgbackrestِ دیبیان
# قفل‌شده‌اند (تکرارپذیری build).
FROM postgres:16-bookworm
RUN apt-get update -qq \
 && apt-get install -y --no-install-recommends pgbackrest=2.47-1 \
 && rm -rf /var/lib/apt/lists/*
# pgbackrest از /etc/pgbackrest/pgbackrest.conf می‌خواند؛ فایلِ نهایی را
# entrypoint‌های همین دایرکتوری از template + env می‌سازند (هیچ رازی در
# ایمیج نیست).
