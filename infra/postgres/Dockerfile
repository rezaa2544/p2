# payesh-pg-ha — postgres:16 + pgbackrest (WAL archiving و PITR در یک ایمیج)
# postgres:16-bookworm را نگه می‌داریم و در همان build، candidate واقعیِ
# Debian Bookworm را به نسخهٔ exact تبدیل می‌کنیم. نسخهٔ انتخاب/نصب‌شده در
# image ثبت و در گزارشِ DR با dpkg-query دوباره تأیید می‌شود؛ pin منقضی‌شده
# نباید به حدس یا حذفِ بررسیِ runtime منجر شود.
FROM postgres:16-bookworm
RUN set -eu; \
    apt-get update -qq; \
    candidate="$(apt-cache policy pgbackrest | awk '/^[[:space:]]*Candidate:/ { print $2; exit }')"; \
    if [ -z "$candidate" ] || [ "$candidate" = "(none)" ]; then \
      echo 'pgbackrest_apt_candidate_unavailable' >&2; exit 1; \
    fi; \
    echo "Resolved pgbackrest Debian package candidate: $candidate"; \
    apt-get install -y --no-install-recommends "pgbackrest=$candidate"; \
    installed="$(dpkg-query -W -f='${Version}' pgbackrest)"; \
    if [ "$installed" != "$candidate" ]; then \
      echo 'pgbackrest_installed_version_does_not_match_exact_candidate' >&2; exit 1; \
    fi; \
    printf '%s\n' "$installed" > /usr/local/share/payesh-pgbackrest-package-version; \
    chmod 0444 /usr/local/share/payesh-pgbackrest-package-version; \
    rm -rf /var/lib/apt/lists/*
# pgbackrest از /etc/pgbackrest/pgbackrest.conf می‌خواند؛ فایلِ نهایی را
# entrypoint‌های همین دایرکتوری از template + env می‌سازند (هیچ رازی در
# ایمیج نیست).
