/* ═══════════════════════════════════════════════════════════════════
   tools/minify-source.js — کوچک‌سازیِ محافظه‌کارِ سورس در build (Wave 24)
   -------------------------------------------------------------------
   هدف: index.html < 1.8MB (KPI-1 بریف Wave 24) بدونِ هیچ تغییرِ معنایی.

   چه می‌کند (و فقط همین‌ها):
     ۱. کامنت‌های JS (بلوکی و خطی) خارج از رشته/تمپلیت/regex حذف می‌شوند
        (بلوکی → یک فاصله تا توکن‌ها نچسبند؛ «return[کامنت]x» → «return x»).
     ۲. تورفتگیِ ابتدای خط و فاصلهٔ انتهای خط فقط در «حالت کد» حذف می‌شود.
     ۳. خطوط خالیِ پیاپیِ کد یکی می‌شوند.
     ۴. کامنت/تورفتگی/خط خالیِ CSS حذف می‌شود (رشته‌ها و url(...) دست‌نخورده).

   چه نمی‌کند (عمداً — ایمنی):
     - داخل رشته‌ها، template literalها (حتی HTML چندخطی) و regexها
       بایت‌به‌بایت دست‌نخورده می‌ماند — خروجیِ رندر و متن‌های آزمون‌ها
       عوض نمی‌شود.
     - هیچ newlineِ کدی حذف نمی‌شود مگر خطِ کاملاً خالی → معناشناسیِ ASI
       تغییرناپذیر است.
     - تغییرِ نام/فشرده‌سازیِ توکن ندارد → assertهای ساختاریِ آزمون‌ها
       (مثل «function render(») برقرار می‌مانند.

   کارایی (KPI-2): پیمایشِ تک‌گذر با بافرِ خطِ جاری (بدونِ slice روی
   رشتهٔ بزرگ — نسخهٔ اول O(n²) بود) + ردگیریِ افزایشیِ آخرین توکنِ
   معنادار برای تصمیمِ regex/تقسیم. ~۱.۷MB سورس در کمتر از ۳۰ms.

   تشخیصِ regex در برابرِ تقسیم: heuristic استانداردِ «توکنِ قبلی» —
   پس از ( , = : [ ! & | ? ; { } + - * / % ~ ^ < > و کلیدواژه‌های
   return/case/typeof/... regex مجاز است؛ پس از شناسه/عدد/)/] تقسیم.
   وابستگی: فقط stdlib. خروجی قطعی (deterministic) — لازمهٔ build --check.
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

const KEYWORDS_BEFORE_REGEX = new Set([
  'return', 'case', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete',
  'void', 'do', 'else', 'yield', 'throw', 'await',
]);
const PUNCT_BEFORE_REGEX = '(,=:[!&|?;{}+-*/%~^<>';

/**
 * حذفِ کامنت و تورفتگیِ کد از سورسِ JS — رشته/تمپلیت/regex verbatim.
 * @param {string} src
 * @returns {string}
 */
const IDENT_RE = /[A-Za-z0-9_$\u0080-\uFFFF]/;
/* کاراکترهایی که پیمایشِ سریعِ chunk را می‌شکنند (نیازمندِ حالتِ ویژه) */
const isSpecial = (c) => c === '/' || c === '\'' || c === '"' || c === '`' || c === '\n' || c === '\r';

function stripJs(src){
  const n = src.length;
  const lines = [];      /* خطوطِ نهایی — join در پایان */
  let cur = '';          /* بافرِ خطِ جاری */
  let atLineStart = true;
  /* برای تصمیمِ regex/تقسیم: آخرین کاراکترِ معنادار + آخرین کلمهٔ کامل */
  let lastCh = '';       /* '' = ابتدای فایل */
  let lastWord = '';

  const noteChunk = (chunk) => {
    /* به‌روزکردنِ lastCh/lastWord از انتهایِ یک تکهٔ کدِ بدونِ کاراکترِ ویژه */
    let k = chunk.length - 1;
    while (k >= 0 && (chunk[k] === ' ' || chunk[k] === '\t')) k--;
    if (k < 0) return; /* فقط فضای سفید — وضعیت عوض نمی‌شود */
    lastCh = chunk[k];
    if (IDENT_RE.test(lastCh)){
      let j = k;
      while (j >= 0 && IDENT_RE.test(chunk[j])) j--;
      lastWord = chunk.slice(j + 1, k + 1);
    } else {
      lastWord = '';
    }
  };
  const regexAllowed = () => {
    if (lastCh === '') return true;
    if (PUNCT_BEFORE_REGEX.includes(lastCh)) return true;
    if (IDENT_RE.test(lastCh)) return KEYWORDS_BEFORE_REGEX.has(lastWord);
    return false;
  };
  const endLine = () => {
    const t = /[ \t]$/.test(cur) ? cur.replace(/[ \t]+$/, '') : cur;
    if (t !== '') lines.push(t); /* خطِ خالیِ کد به‌کل حذف — توکنی ندارد */
    cur = '';
    atLineStart = true;
  };

  let i = 0;
  while (i < n){
    let c = src[i];

    if (atLineStart){
      while (c === ' ' || c === '\t'){ i++; c = src[i]; }
      if (i >= n) break;
      atLineStart = false;
    }

    /* ── کامنت‌ها ── */
    if (c === '/' && src[i + 1] === '/'){
      const nl = src.indexOf('\n', i + 2);
      i = nl === -1 ? n : nl;
      continue;
    }
    if (c === '/' && src[i + 1] === '*'){
      const end = src.indexOf('*/', i + 2);
      i = end === -1 ? n : end + 2;
      if (cur !== '' && !cur.endsWith(' ')) cur += ' ';
      continue;
    }

    /* ── رشته‌های ' و " — verbatim (پایانِ رشته با اسکن، سپس یک slice) ── */
    if (c === '\'' || c === '"'){
      const q = c;
      let j = i + 1;
      while (j < n){
        const d = src[j];
        if (d === '\\'){ j += 2; continue; }
        j++;
        if (d === q) break;
      }
      cur += src.slice(i, j);
      i = j;
      lastWord = ''; lastCh = ')'; /* پس از literal: تقسیم، نه regex */
      continue;
    }

    /* ── template literal — بدنه verbatim (newlineها حفظ)، depthِ ${} ── */
    if (c === '`'){
      let j = i + 1;
      let depth = 0;
      let lineFrom = i;
      while (j < n){
        const d = src[j];
        if (d === '\\'){ j += 2; continue; }
        if (d === '\n'){ lines.push(cur + src.slice(lineFrom, j)); cur = ''; lineFrom = j + 1; j++; continue; }
        if (d === '$' && src[j + 1] === '{'){ depth++; j += 2; continue; }
        if (depth > 0 && (d === '\'' || d === '"')){
          const q2 = d; j++;
          while (j < n){
            const e = src[j];
            if (e === '\\'){ j += 2; continue; }
            if (e === '\n'){ lines.push(cur + src.slice(lineFrom, j)); cur = ''; lineFrom = j + 1; j++; continue; }
            j++;
            if (e === q2) break;
          }
          continue;
        }
        if (d === '}' && depth > 0){ depth--; j++; continue; }
        j++;
        if (d === '`' && depth === 0) break;
      }
      cur += src.slice(lineFrom, j);
      i = j;
      lastWord = ''; lastCh = ')';
      continue;
    }

    /* ── regex literal ── */
    if (c === '/' && regexAllowed()){
      let j = i + 1;
      let inClass = false;
      while (j < n){
        const d = src[j];
        if (d === '\n') break; /* سورسِ ناقص — verbatim ادامه */
        if (d === '\\'){ j += 2; continue; }
        j++;
        if (d === '[') inClass = true;
        else if (d === ']') inClass = false;
        else if (d === '/' && !inClass) break;
      }
      while (j < n && /[a-z]/i.test(src[j])) j++;
      cur += src.slice(i, j);
      i = j;
      lastWord = ''; lastCh = ')';
      continue;
    }

    if (c === '\n'){ endLine(); i++; continue; }
    if (c === '\r'){ i++; continue; }

    /* ── تکهٔ کدِ عادی: تا کاراکترِ ویژهٔ بعدی یک‌جا کپی ── */
    let j = i + 1;
    while (j < n && !isSpecial(src[j])) j++;
    const chunk = src.slice(i, j);
    cur += chunk;
    noteChunk(chunk);
    i = j;
  }
  endLine();
  return lines.length ? lines.join('\n') + '\n' : '\n';
}

/**
 * حذفِ کامنت/تورفتگی/خط خالی از CSS — رشته‌ها و url(...) verbatim.
 * @param {string} src
 * @returns {string}
 */
function stripCss(src){
  const n = src.length;
  const lines = [];
  let cur = '';
  let atLineStart = true;
  let i = 0;
  const endLine = () => {
    const t = cur.replace(/[ \t]+$/, '');
    if (t !== '' || (lines.length && lines[lines.length - 1] !== '')) lines.push(t);
    cur = '';
    atLineStart = true;
  };
  while (i < n){
    const c = src[i];
    if (atLineStart){
      if (c === ' ' || c === '\t'){ i++; continue; }
      atLineStart = false;
    }
    if (c === '/' && i + 1 < n && src[i + 1] === '*'){
      const end = src.indexOf('*/', i + 2);
      i = end === -1 ? n : end + 2;
      continue;
    }
    if (c === '\'' || c === '"'){
      const q = c; cur += c; i++;
      while (i < n){ const d = src[i]; cur += d; i++; if (d === '\\'){ if (i < n){ cur += src[i]; i++; } continue; } if (d === q) break; }
      continue;
    }
    if (c === '\n'){ endLine(); i++; continue; }
    if (c === '\r'){ i++; continue; }
    cur += c; i++;
  }
  endLine();
  while (lines.length && lines[lines.length - 1] === '') lines.pop();
  return lines.length ? lines.join('\n') + '\n' : '';
}

module.exports = { stripJs, stripCss };
