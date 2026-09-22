#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════
#   docs-export.sh — خروجی برون‌خطی (اچ‌تی‌ام‌ال) کتابخانهٔ مستندات
#   ─────────────────────────────────────────────────────────────────
#   نیازمند: پنداک (اختیاری — اگر نبود، اسکریپت با کد ۰ و پیام خارج می‌شود)
#   خروجی:  docs/_export/ (گیت‌ایگنورد؛ هرگز کامیت نمی‌شود)
#     ├── index.html   فهرست با لینک به همهٔ اسناد
#     ├── style.css    پوستهٔ فارسی راست‌به‌چپ
#     └── html/*.html  یک فایل به ازای هر سند
#   اجرا:   bash tools/docs-export.sh
# ═══════════════════════════════════════════════════════════════════
set -u
cd "$(dirname "$0")/.." || exit 1
OUT=docs/_export
HTML="$OUT/html"

# ۱) پنداک نبود؟ خروج موفق با پیام (درب‌ها را نمی‌شکنیم — ابزار اختیاری است)
if ! command -v pandoc >/dev/null 2>&1; then
  echo "pandoc not installed — docs-export skipped (exit 0). نصب: راهنمای docs/DOCS_EXPORT_GUIDE.md"
  exit 0
fi

rm -rf "$OUT"
mkdir -p "$HTML"

# ۲) پوستهٔ فارسی راست‌به‌چپ
cat > "$OUT/style.css" <<'CSS'
/* پوستهٔ خروجی مستندات «پایش» — فارسی، راست‌به‌چپ */
html { direction: rtl; }
body {
  font-family: "Vazirmatn", "IRANSansX", Tahoma, sans-serif;
  max-width: 60rem; margin: 2rem auto; padding: 0 1rem;
  line-height: 1.9; color: #1c2733; background: #fdfdfd;
}
h1, h2, h3 { line-height: 1.5; }
h1 { border-bottom: 3px solid #14705a; padding-bottom: .4rem; }
h2 { color: #14705a; }
a { color: #0f6bd7; text-decoration: none; }
a:hover { text-decoration: underline; }
code { background: #eef2f5; padding: .1rem .35rem; border-radius: 4px; direction: ltr; display: inline-block; }
pre { direction: ltr; text-align: left; background: #0f172a; color: #e2e8f0; padding: 1rem; border-radius: 8px; overflow-x: auto; }
pre code { background: none; color: inherit; display: inline; }
table { border-collapse: collapse; width: 100%; margin: 1rem 0; }
th, td { border: 1px solid #cbd5e1; padding: .45rem .6rem; text-align: right; }
th { background: #eef2f5; }
blockquote { border-right: 4px solid #14705a; margin-right: 0; padding-right: 1rem; color: #475569; }
footer { margin-top: 3rem; color: #64748b; font-size: .85rem; border-top: 1px solid #e2e8f0; padding-top: 1rem; }
CSS

# ۳) تبدیل تک‌تک اسناد
COUNT=0
ROWS=""
for f in $(ls docs/*.md | sort); do
  base=$(basename "$f" .md)
  title=$(head -1 "$f" | sed 's/^#* *//')
  pandoc "$f" -f markdown -t html5 -s --metadata title="$title" \
    --css ../style.css -o "$HTML/$base.html" >/dev/null 2>&1 || { echo "  ⚠️ تبدیل $f ناموفق بود"; continue; }
  COUNT=$((COUNT + 1))
  ROWS="$ROWS    <li><a href=\"html/$base.html\">$title</a> <code>$base.md</code></li>\n"
done

# ۴) فهرست
cat > "$OUT/index.html" <<HTML
<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
<meta charset="utf-8">
<title>کتابخانهٔ مستندات پایش — خروجی برون‌خطی</title>
<link rel="stylesheet" href="style.css">
</head>
<body>
<h1>📚 کتابخانهٔ مستندات پایش</h1>
<p>خروجی خودکار از <code>tools/docs-export.sh</code> — $COUNT سند، تولید: $(date -u +%Y-%m-%d)</p>
<ol>
$(printf "%b" "$ROWS")
</ol>
<footer>نسخهٔ بسته: v1.0.0-rc1 · مجوز: داخلی</footer>
</body>
</html>
HTML

echo "✅ خروجی برون‌خطی: $COUNT سند در $OUT/ (فهرست: $OUT/index.html)"
