#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════
# docs-health.sh — سلامت لینک‌های مستندات
#   همهٔ ارجاع‌های [متن](مسیر) در docs/*.md را استخراج می‌کند،
#   وجود فایل هدف را می‌سنجد و گزارش را در
#   docs/DOCS_HEALTH_REPORT.md ذخیره می‌کند.
#   قواعد حل مسیر:
#     • لینک‌های خارجی (http/https/mailto) و لنگرهای خالی (#...) رد می‌شوند
#     • مسیرهای قالب (مثل 005_NNN_name یا متغیرهای <...>/${...}) رد می‌شوند
#     • قالب گیت‌هاب «/rezaa2544/p2/blob|tree/<branch>/<rest>» به
#       مسیر نسبیِ ریپو تبدیل می‌شود (لینک‌های تاریخیِ ریدمی)
#     • هدف ابتدا نسبت به پوشهٔ سند و سپس نسبت به ریشهٔ ریپو سنجیده می‌شود
#   خروجی: ۰ = بدون لینک شکسته · ۱ = دست‌کم یک لینک شکسته
# اجرا: bash tools/docs-health.sh
# ═══════════════════════════════════════════════════════════════════
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPORT="$ROOT/docs/DOCS_HEALTH_REPORT.md"
NOW="$(date +%Y-%m-%d)"

cd "$ROOT"
node - "$REPORT" "$NOW" <<'NODE'
const fs = require('fs');
const path = require('path');
const [REPORT, NOW] = process.argv.slice(2);
const ROOT = process.cwd();
const docsDir = path.join(ROOT, 'docs');
const files = fs.readdirSync(docsDir).filter((f) => f.endsWith('.md'));
const LINK_RE = /\[[^\]]*\]\(([^)\s]+)\)/g;
const SKIP = /^https?:|^mailto:|^#|^</;
const PLACEHOLDER = /NNN_|<|>|\$\{|\[|\]|\*/;
const GH_FORM = /^\/rezaa2544\/p2\/(?:blob|tree)\/[^/]+\/(.+)$/;
let total = 0, skipped = 0, checked = 0;
const broken = [];
for (const f of files) {
  const txt = fs.readFileSync(path.join(docsDir, f), 'utf8');
  let m;
  while ((m = LINK_RE.exec(txt)) !== null) {
    const target = m[1];
    total++;
    if (SKIP.test(target)) { skipped++; continue; }
    let p = target.split('#')[0];
    if (!p) { skipped++; continue; }
    if (PLACEHOLDER.test(p)) { skipped++; continue; }
    const gh = p.match(GH_FORM);
    if (gh) p = gh[1];
    if (path.isAbsolute(p)) { skipped++; continue; }
    checked++;
    const candidates = [path.resolve(docsDir, p), path.resolve(ROOT, p)];
    if (!candidates.some((c) => fs.existsSync(c))) {
      broken.push({ from: f, target });
    }
  }
}
const uniq = [...new Map(broken.map((b) => [b.from + ' -> ' + b.target, b])).values()];
const lines = [];
lines.push('# 🩺 گزارش سلامت مستندات — DOCS_HEALTH_REPORT');
lines.push('');
lines.push('**تولید:** `tools/docs-health.sh` (ماشینی — دستی ویرایش نکنید) | **تاریخ اجرا:** ' + NOW);
lines.push('');
lines.push('| سنجه | مقدار |');
lines.push('|---|---:|');
lines.push('| اسناد پویش‌شده | ' + files.length + ' |');
lines.push('| کل لینک‌ها | ' + total + ' |');
lines.push('| بررسی‌شده (مسیر داخلی) | ' + checked + ' |');
lines.push('| ردشده (خارجی/لنگر/قالب) | ' + skipped + ' |');
lines.push('| **لینک شکسته** | **' + uniq.length + '** |');
lines.push('');
if (uniq.length === 0) {
  lines.push('**نتیجه: ✅ صفر لینک شکسته — همهٔ ارجاع‌های داخلی به فایل موجود می‌رسند.**');
} else {
  lines.push('## لینک‌های شکسته');
  lines.push('');
  lines.push('| سند مبدأ | هدف |');
  lines.push('|---|---|');
  for (const b of uniq) lines.push('| `docs/' + b.from + '` | `' + b.target + '` |');
}
lines.push('');
lines.push('## قواعد');
lines.push('');
lines.push('- هر لینک شکسته باید رفع شود یا در سند مبدأ به مسیر معتبر تغییر کند؛');
lines.push('  گزارش «قبول» تنها با صفر شکسته صادر می‌شود.');
lines.push('- قالب‌های مسیر (مثل مهاجرت‌های آینده) و لینک‌های خارجی از شمارش خارج‌اند.');
lines.push('- قالب گیت‌هاب `/rezaa2544/p2/blob/...` به مسیر داخل ریپو نگاشت می‌شود.');
fs.writeFileSync(REPORT, lines.join('\n') + '\n', 'utf8');
console.log('docs-health: ' + checked + ' لینک بررسی شد — ' + uniq.length + ' شکسته');
if (uniq.length > 0) {
  uniq.forEach((b) => console.log('  ❌ docs/' + b.from + ' -> ' + b.target));
  process.exit(1);
}
console.log('  ✅ گزارش در docs/DOCS_HEALTH_REPORT.md ذخیره شد');
NODE
