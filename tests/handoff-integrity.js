#!/usr/bin/env node
/**
 * handoff-integrity.js — نگهبانِ دفترچهٔ تحویل (Bug Hunt نشست ۹)
 * ══════════════════════════════════════════════════════════════════
 * چرا این تست وجود دارد: در PR #78 کلِ HANDOFF.md با رمزگذاریِ اشتباه
 * نوشته شده بود (بایت‌های UTF-8 که با Windows-1256 خوانده و دوباره
 * UTF-8 نوشته شده‌اند). نتیجه: ۱۹۵۶ خطِ فارسیِ ناخوانا (نمونه:
 * «ط¯ظپطھط±ع†ظ‡ظ” طھط­ظˆغŒظ„ ع©ط§ط±») و جایگزینیِ همهٔ ورودی‌های
 * سشن‌های قبلی با نسخهٔ خراب. هیچ تستی این را نمی‌گرفت.
 *
 *   H1 کدگذاریِ فایل: UTF-8 معتبر، بی‌BOM، بی‌NUL، پایانِ خطِ LF
 *   H2 سند مو‌جی‌بِیک نیست (دو نشانگر: دنبالهٔ قطعیِ «â€» + چگالیِ
 *      نویسه‌های نمادین لاتین در خطوطِ فارسی)
 *   H3 دفترچه فقط-افزودنی است: سرتیترهای نسخهٔ قبلی (HEAD^ و
 *      origin/main) گم نمی‌شوند — این دقیقاً چیزی است که #78 می‌شکست
 *   H4 ساختار: سرتیترِ سند + ورودی‌ها سرِ جایشان‌اند
 *
 * نکتهٔ صداقتی دربارهٔ آشکارساز: Node رمزگشایِ cp1256 ندارد، پس H2 جدولِ
 * رمزگذاری نیست؛ یک نشانگرِ امضایی است که دو طرفِ مرز کالیبره شده:
 * روی فایلِ خرابِ واقعیِ PR #78 ⇒ ۱۷۱۹ خط از ۱۹۵۶ (۸۷٪) و روی ۱۰۷۸ فایلِ
 * متنیِ این مخزن ⇒ صفر. آستانهٔ ۵٪ فاصلهٔ امنی از هر دو سو دارد.
 * اجرا: node tests/handoff-integrity.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const FILE = path.join(ROOT, 'HANDOFF.md');
const FILES = ['HANDOFF.md'];

let pass = 0, fail = 0;
const failures = [];
const assert = (c, m) => { if (!c) throw new Error(m || 'شرط برقرار نیست'); };
function test(name, fn) {
  try { fn(); pass++; console.log(`  ✅ ${name}`); }
  catch (e) { fail++; failures.push({ name, msg: e.message }); console.log(`  ❌ ${name}\n     ${e.message}`); }
}

/* ── آشکارسازِ مو‌جی‌بِیک ──────────────────────────────────────────────
   SUSP = نویسه‌هایی که در متنِ فارسیِ سالم تقریباً هرگز نمی‌آیند و در
   مو‌جی‌بِیکِ cp1256/cp1252 پشتِ سرِ هم ظاهر می‌شوند (نمادهای Latin-1 و
   نویسه‌های ویژهٔ Windows-1252). نویسه‌های مجازِ فارسی (گیومهٔ «»، ·،
   نیم‌خط، …، درجه، درصد، ضرب) از فهرست بیرون گذاشته شده‌اند. */
const SUSP = new Set(
  Array.from({ length: 0x60 }, (_, i) => String.fromCharCode(0xa0 + i))
    .concat(['\u20ac', '\u0192', '\u201a', '\u201e', '\u2026', '\u2020', '\u2021', '\u02c6', '\u2030', '\u2039', '\u0152', '\u0153'])
);
['\u00ab', '\u00bb', '\u00b7', '\u00d7', '\u00f7', '\u00a0', '\u2026', '\u00b1', '\u00b0',
 '\u00b2', '\u00b3', '\u00b5', '\u00b6', '\u00bc', '\u00bd', '\u00be', '\u00ba', '\u00aa',
 '\u00ae', '\u00a9', '\u00a7', '\u00a3', '\u00a5', '\u00a4', '\u00ac', '\u00a8', '\u02c6',
 '\u2030', '\u2039', '\u203a', '\u0192', '\u201a', '\u201e', '\u2020', '\u2021',
 '\u0152', '\u0153'].forEach((c) => SUSP.delete(c));

const hasPersian = (l) => [...l].some((c) => c >= '\u0600' && c <= '\u06ff');
/** خطِ «مشکوک»: یا دنبالهٔ قطعیِ â€ (بایت‌های E2 80 xx که با cp1252 خوانده
 *  شده‌اند: نیم‌فاصله، خطِ تیره، گیومهٔ مجعد) یا ≥۴ نویسهٔ نمادینِ بیرون از
 *  خطِ فارسیِ سالم. */
function suspiciousLine(l) {
  if (!hasPersian(l)) return false;
  if (l.includes('\u00e2\u20ac')) return true;
  let n = 0;
  for (const c of l) if (SUSP.has(c)) n++;
  return n >= 4;
}

console.log('\n▸ نگهبانِ دفترچهٔ تحویل — handoff-integrity (Bug Hunt نشست ۹)');

for (const rel of FILES) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) { fail++; console.log(`  ❌ ${rel} پیدا نشد`); continue; }
  const raw = fs.readFileSync(abs);
  const text = raw.toString('utf8');
  const lines = text.split('\n');
  const faLines = lines.filter(hasPersian);
  const suspLines = lines.filter(suspiciousLine);
  const ratio = faLines.length ? suspLines.length / faLines.length : 0;
  console.log(`   ${rel} — ${lines.length} خط · ${faLines.length} خطِ فارسی · ${suspLines.length} خطِ مشکوک (${(ratio * 100).toFixed(1)}%)`);

  test(`${rel} H1 کدگذاری: UTF-8 معتبر، بی‌BOM، بی‌NUL، LF`, () => {
    assert(!raw.slice(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf])), 'فایل BOM دارد');
    assert(!raw.includes(0), 'فایل بایتِ NUL دارد');
    assert(!raw.includes(0x0d), 'پایانِ خطِ CR/CRLF دارد (مخزن LF است)');
    assert(!text.includes('\ufffd'), 'نویسهٔ جانشین (U+FFFD) دارد — رمزگشایی خراب شده');
  });

  test(`${rel} H2 سند مو‌جی‌بِیک نیست (نشانگرِ کالیبره‌شده روی PR #78)`, () => {
    assert(ratio <= 0.05,
      `${suspLines.length} از ${faLines.length} خطِ فارسی (${(ratio * 100).toFixed(0)}%) مو‌جی‌بِیک است`
      + ` — نمونه: «${(suspLines[0] || '').slice(0, 60)}»`);
    /* نشانگرِ قطعی: حتی یک خط هم نباید دنبالهٔ â€ داشته باشد */
    const hard = lines.filter((l) => l.includes('\u00e2\u20ac'));
    assert(hard.length === 0, `${hard.length} خط دنبالهٔ قطعیِ â€ دارد — نمونه: «${(hard[0] || '').slice(0, 60)}»`);
  });

  test(`${rel} H3 دفترچه فقط-افزودنی است: سرتیترهای origin/main گم نمی‌شوند`, () => {
    /* مرجعِ مقایسه عمداً origin/main است، نه HEAD^: کامیتِ «رفعِ خرابیِ
       رمزگذاری» به‌درستی سرتیترهای مو‌جی‌بِیکِ HEAD^ را حذف می‌کند، پس
       ملاکِ ورودی‌ها همان تنهٔ مشترک است. (خطوط پیام فقط هنگامِ شکست
       ساخته می‌شوند — وگرنه خودِ گزارش می‌تواند استثنا بدهد.) */
    const heads = (t) => t.split('\n').filter((l) => l.startsWith('## ')).map((l) => l.trim());
    const now = heads(text);
    assert(now.length > 0, 'دفترچه هیچ ورودی‌ای ندارد');
    const g = (args) => spawnSync('git', ['-C', ROOT].concat(args), { encoding: 'utf8' });
    if (g(['rev-parse', '--git-dir']).status !== 0) {
      console.log('     ⏭️  مرجعِ گیت در دسترس نیست — بررسیِ فقط-افزودنی رد شد');
      return;
    }
    const refs = ['origin/main', 'HEAD^'];
    for (const ref of refs) {
      const r = g(['show', ref + ':' + rel]);
      if (r.status !== 0 || !r.stdout) continue;
      const prev = heads(r.stdout);
      if (prev.some((h) => suspiciousLine(h))) continue; /* مرجعِ خودش خراب است */
      const lost = prev.filter((h) => !now.includes(h));
      if (lost.length) assert(false, `${lost.length} سرتیتر نسبت به ${ref} گم شده — نمونه: «${String(lost[0]).slice(0, 70)}»`);
    }
  });

  test(`${rel} H4 ساختار: سرتیترِ سند و ورودی‌ها سرِ جایشان‌اند`, () => {
    assert(!lines[0].replace('\ufeff', '').trim().startsWith('\u00a0'), 'خطِ اول نامعتبر');
    assert(lines[0].replace('\ufeff', '').trim().startsWith('# '),
      'خطِ اول سرتیترِ سند نیست: ' + lines[0].slice(0, 60));
    const first = lines.findIndex((l) => l.startsWith('## '));
    assert(first > 0 && first < 40, 'نخستین ورودی در جایِ غیرمنتظره (خطِ ' + (first + 1) + ')');
  });
}

console.log('────────────────────────────────────────────');
if (fail) console.log(`handoff-integrity: ${pass}/${pass + fail} ❌\n` + failures.map((f) => '   ' + f.name + ' — ' + f.msg).join('\n'));
else console.log(`handoff-integrity: ${pass}/${pass} ✅`);
console.log('────────────────────────────────────────────');
process.exit(fail ? 1 : 0);
