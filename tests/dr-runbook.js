#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   dr-runbook.js — سنجه‌هایِ سندِ DR_RUNBOOK (پیش‌نیازِ رفعِ P0#3):
     DR-SEC   هر چهار سناریویِ الزامی با ساختارِ «نشانه/تشخیص/اقدام/تأیید/بازگشت»
     DR-TABLE جدولِ RPO/RTO با سقف‌هایِ مصوبِ RELIABILITY_DR_PLAN (RTO≤۱۵د/RPO≤۵د)
     DR-CMD   هر ارجاعی به tools/infra در runbook باید فایلِ واقعی باشد
     DR-DRILL جدولِ ثبتِ مانور و Gیت‌هایِ مشترک
   اجرا: node tests/dr-runbook.js
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0; const errors = [];
function chk(name, cond, extra) {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; errors.push(name + (extra ? ' — ' + String(extra).slice(0, 200) : '')); console.log('  ❌ ' + name + (extra ? '  —  ' + String(extra).slice(0, 200) : '')); }
}
function grp(t) { console.log('\n▸ ' + t); }
const rd = (p) => { try { return fs.readFileSync(path.join(ROOT, p), 'utf8'); } catch (e) { return null; } };
const fa2en = (t) => String(t).replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/[٫،]/g, '.');

const run = rd('docs/DR_RUNBOOK.md');
if (!run) { console.log('❌ docs/DR_RUNBOOK.md نیست'); process.exit(1); }
const plan = rd('docs/RELIABILITY_DR_PLAN.md') || '';

/* ── DR-SEC ── */
grp('DR-SEC — سناریوهایِ الزامی');
const SCEN = [
  ['PG primary', /خرابی Primary PostgreSQL/],
  ['Redis master', /خرابی Redis Master/],
  ['Data-center', /خرابی Data Center/],
  ['corruption/PITR', /فسادِ داده/]
];
SCEN.forEach(([label, re]) => {
  const hit = re.test(run);
  chk('سناریوی «' + label + '» در runbook هست', hit);
  if (hit) {
    /* بخشِ سناریو = از سرفصلِ ## تا سرفصلِ ## بعدی (نه ردیفِ جدول) */
    const headRe = new RegExp('^## [^\\n]*' + re.source, 'm');
    const hm = headRe.exec(run);
    const start = hm ? hm.index : -1;
    const next = /^## /gm; next.lastIndex = start > 0 ? start + 3 : 0;
    const nm = next.exec(run);
    const end = nm ? nm.index : run.length;
    const body = start >= 0 ? run.slice(start, end) : '';
    chk('سناریوی «' + label + '» بلوکِ اقدام با دستورِ tools دارد', /tools\/[a-z-]+\.sh/.test(body));
    chk('سناریوی «' + label + '» بندِ تأیید دارد', /تأیید/.test(body));
    chk('سناریوی «' + label + '» بازگشت/fence را پوشش می‌دهد', /بازگشت|fence/i.test(body));
    chk('سناریوی «' + label + '» RTO یا RPO در متن دارد', /RTO|RPO/.test(body));
  }
});

/* ── DR-TABLE ── */
grp('DR-TABLE — سقف‌هایِ RPO/RTO');
const tableLines = (run.match(/^\|\s*[۰-۹0-9]+\s*\|.*$/gm) || []).map(fa2en);
chk('جدولِ RPO/RTO با چهار ردیفِ سناریو', tableLines.length >= 4, tableLines.length + ' ردیف');
const rtoCeil = (plan.match(/RTO[^۰-۹0-9]*(15|۱۵)/) || [])[1];
chk('runbook سقفِ RTO مصوبِ سندِ بالادستی («' + (rtoCeil || '؟') + ' دقیقه») را نقل می‌کند', /RTO ≤\s*۱۵ دقیقه|RTO\s*≤\s*15 دقیقه/.test(run));
chk('runbook سقفِ RPO ≤ ۵ دقیقه را نقل می‌کند', /RPO ≤\s*۵ دقیقه|RPO\s*≤\s*5 دقیقه|RPO ≤ ۵/.test(fa2en(run)) || /RPO ≤ ۵ دقیقه/.test(run));
let over = [];
tableLines.forEach((ln, idx) => {
  const cells = ln.split('|').map((c) => c.trim());
  const rpoCell = cells[3] || ''; const rtoCell = cells[4] || '';
  const rtoM = rtoCell.match(/(\d+(?:\.\d+)?)\s*د(?:قیقه)?/);
  if (rtoM && Number(rtoM[1]) > 15) over.push('ردیف ' + (idx + 1) + ': RTO=' + rtoM[1] + 'د > ۱۵د');
  const rpoM = rpoCell.match(/(\d+(?:\.\d+)?)\s*د(?:قیقه)?/);
  if (rpoM && Number(rpoM[1]) > 5) over.push('ردیف ' + (idx + 1) + ': RPO=' + rpoM[1] + 'د > ۵د');
});
chk('هیچ سناریویی سقفِ مصوب را نمی‌شکند (RTO≤۱۵د/RPO≤۵د)', over.length === 0, over.join(' | '));
/* failover خودکار ردیس ≤ ۳۰ ثانیه (طبق سند بالادستی) */
chk('failover خودکارِ ردیس ≤ ۳۰ ثانیه در جدول', /30|۳۰/.test(fa2en(tableLines.join(' '))) && /ثانیه/.test(tableLines.join(' ')));

/* ── DR-CMD ── */
grp('DR-CMD — ارجاع‌هایِ فایلِ زنده');
const refs = [...new Set((run.match(/(?:tools|infra)\/[A-Za-z0-9_./-]+\.(?:sh|yml|ini|template|conf|js)/g) || []))];
chk('ارجاعِ فایل در runbook پیدا شد', refs.length >= 6, String(refs.length));
const dead = refs.filter((r) => !fs.existsSync(path.join(ROOT, r)));
chk('همۀ ارجاع‌ها به فایلِ موجود می‌رسند', dead.length === 0, dead.join(','));
/* دستورهایِ داخلِ بلوک‌ها: دست‌کم pitr/failover/check‌ها صدازده شوند */
['tools/pitr-restore.sh', 'tools/pitr-verify.sh', 'tools/failover-postgres.sh', 'tools/failover-redis.sh'].forEach((t) =>
  chk('runbook ' + path.basename(t) + ' را صدا می‌زند', run.includes(t)));
['post-checks.sh', 'redis-checks.sh'].forEach((t) => chk('runbook ' + t + ' را به‌عنوان گیتِ پسازاقدام دارد', run.includes(t)));

/* ── DR-DRILL ── */
grp('DR-DRILL — ثبتِ مانور و گیت‌هایِ مشترک');
chk('بخشِ drill-log با ستون‌هایِ تاریخ/RTO/RPO/نتیجه', /drill-log/.test(run) && /RTO واقعی/.test(run) && /RPO واقعی/.test(run) && /امضا/.test(run));
chk('گیت‌هایِ مشترک: smoke + check-authz + secret-scan در «پس از بحران»', /tests\/smoke\.js/.test(run) && /tools\/check-authz\.js/.test(run) && /secret-scan/.test(run));
chk('تفکیکِ مسئولیتِ on-call در سند هست', /On-call|مالکیت/.test(run));
chk('سناریوی DC منطقهٔ دوم به CRR/site-replicationِ bucket اشاره دارد', /CRR|site-replication/.test(run));
chk('قاعدهٔ «primaryِ کهنه برگردانده نمی‌شود» (ضد split-brain) در سند هست', /هرگز دو master|split-brain/.test(run));

console.log('\n' + '─'.repeat(52));
console.log(`نتیجه DR Runbook: ${pass}/${pass + fail} موفق` + (fail ? `  —  ${fail} ناموفق ❌` : '  —  بدون خطا ✅'));
if (errors.length) console.log('ناموفق‌ها: ' + errors.join(' | '));
process.exit(fail ? 1 : 0);
