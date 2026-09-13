#!/usr/bin/env bash
# tools/openapi-lint.sh — لینتر مشخصات اوپن‌ای‌پی‌آی با اسپکترال (در صورت نصب)
# مأموریت ۳۶ — چت ۶. اگر اسپکترال نصب نباشد، با پیام صریح رد می‌شود (نه سکوت).
set -euo pipefail
cd "$(dirname "$0")/.."

if ! command -v spectral >/dev/null 2>&1; then
  echo "⚠️  spectral نصب نیست — لینت کامل انجام نشد (قید صادقانه)."
  echo "   نصب: npm i -g @stoplight/spectral-cli"
  echo "   جایگزین: node tools/openapi-validate.js (اعتبارسنجی ساختاری)"
  node tools/openapi-validate.js
  exit 0
fi

if [ ! -f .spectral.yaml ]; then
  echo "⚠️  فایل پیکربندی .spectral.yaml نیست — از قواعد پیش‌فرض اوپن‌ای‌پی‌آی استفاده می‌شود."
  spectral lint docs/openapi.yaml --ruleset spectral:oas
else
  spectral lint docs/openapi.yaml
fi
