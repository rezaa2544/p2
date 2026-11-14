#!/usr/bin/env node
/* ─────────────────────────────────────────────────────────────────
   partition-retention-mutations.js — دروازه‌هایِ fail-closed ابزارِ
   نگهداریِ پارتیشن (M15-11 — آرشیو) با PG ساختگی + جهش (BH-mut)
   ─────────────────────────────────────────────────────────────────
   ابزارِ tools/partition-retention.js نگهبان‌هایی دارد که «حذفِ اشتباه»
   را ناممکن می‌کنند؛ اینجا هر نگهبان جهش داده می‌شود و باید کشته شود:
     M0 (کنترل): DRY-RUN بدونِ --apply = بدونِ حذف + گاردِ relkind
                 رویِ جدولِ عادی حذف را رد می‌کند
     M1: گاردِ relkind خاموش + جدولِ عادی (relkind='r') → باید DROP
         آشکار کند (و قرمز شود) — با جفتِ کنترلِ «گارد روشن = رد»
     M2: گاردِ الگوی نام خاموش → باید DROPِ DEFAULT را آشکار کند
     M3: گاردِ سالِ جاری خاموش → باید DROPِ پارتیشنِ امسال را آشکار کند
     M4: fail-closed بایگانی — حذف باوجودِ شکستِ pg_dump باید آشکار شود
   PG ساختگی: require('pg') در فرزند با preload جایگزین می‌شود؛ جهش روی
   «کپیِ هم‌جوار» اعمال و همان کپی اجرا می‌شود — سورسِ ابزار هرگز
   بازنویسی نمی‌شود (BH-mut).
   ───────────────────────────────────────────────────────────────── */
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const TOOL = 'tools/partition-retention.js';
const FAKE = path.join(__dirname, 'helpers', 'retention-fake-pg.js');

let fails = 0;
function chk(name, cond, extra) {
  console.log('  ' + (cond ? '✅' : '❌') + ' ' + name + (extra ? ' — ' + extra : ''));
  if (!cond) fails++;
}

/* اجرای یک مسیرِ اسکریپت (ابزار یا کپیِ جهش‌یافته) با PG ساختگی */
function runScript(scriptPath, extraArgs, extraEnv) {
  const env = Object.assign({}, process.env, {
    RETENTION_FAKE_PG: '1',
    NODE_OPTIONS: ((process.env.NODE_OPTIONS || '') + ' --require=' + FAKE).trim(),
  }, extraEnv || {});
  try {
    const out = execFileSync('node', [scriptPath, '--pg', 'postgres://fake@127.0.0.1:1/fake'].concat(extraArgs || []), { env, cwd: ROOT, stdio: 'pipe', timeout: 60000 });
    return { code: 0, out: out.toString() };
  } catch (e) {
    return { code: e.status == null ? 1 : e.status, out: String(e.stdout || '') + String(e.stderr || '') };
  }
}

/* ── کنترل‌ها (بدونِ جهش) ── */
console.log('\n▸ کنترل — DRY-RUN و گاردِ relkind (ابزارِ واقعی)');
{
  const r = runScript(TOOL, []);
  chk('M0a dry-run: exit 0', r.code === 0, 'exit=' + r.code);
  chk('M0b گزارشِ DRY برایِ پارتیشنِ قدیمیِ 2019 (≤ cutoff)', /DRY\s+grades_y2019/.test(r.out), (r.out.split('\n').find(l => /grades_y2019/.test(l)) || '').trim().slice(0, 120));
  chk('M0c پارتیشنِ امسال KEEP شد', /KEEP\s+grades_y\d{4}/.test(r.out), '');
  chk('M0d dry-run هیچ DROP واقعی ندارد', !/DROP\s+grades/.test(r.out), '');
  const rPlain = runScript(TOOL, ['--apply'], { RETENTION_FAKE_RELKIND: 'r' });
  chk('M0e جدولِ عادی (relkind=r) با --apply رد شد و DROPی نیست', /partitioned parent نیست/.test(rPlain.out) && !/DROP TABLE/.test(rPlain.out), (rPlain.out.split('\n').find(l => /✋|partitioned/.test(l)) || '').trim().slice(0, 120));
}

/* ── جهش‌ها ── */
function mutantRun(name, bad, mut, extraArgs, extraEnv, probe) {
  const abs = path.join(ROOT, TOOL);
  const src0 = fs.readFileSync(abs, 'utf8').replace(/\r\n/g, '\n');
  const n = src0.indexOf(bad);
  if (n < 0) { chk(name + ' (الگوی اصلی یافت نشد — جهش ناممکن)', false, ''); return; }
  const mutant = abs.replace(/\.js$/, '.rt-mutated.js');
  fs.writeFileSync(mutant, src0.replace(bad, mut, 1));
  try {
    const r = runScript(mutant, extraArgs, extraEnv);
    chk(name, probe(r.out), r.out.split('\n').filter(l => /DROP|DETACH|ARCHIVE|✋|FATAL/.test(l)).slice(0, 3).join(' | ').slice(0, 200));
  } finally {
    try { fs.unlinkSync(mutant); } catch (_) {}
  }
}

console.log('\n▸ M1 — گاردِ relkind خاموش (همان سناریوی M0e با گاردِ خنثی)');
mutantRun(
  'M1 جدولِ عادی بدونِ گاردِ relkind حذف می‌شود ⇒ سوئیت قرمز',
  "if (rk.rows.length !== 1 || rk.rows[0].k !== 'p') {",
  "if (false) { /* MUTATION: relkind guard off */",
  ['--apply'], { RETENTION_FAKE_RELKIND: 'r' },
  (out) => /DROP grades_y\d{4}/.test(out)
);

console.log('\n▸ M2 — گاردِ الگویِ نام خاموش');
/* جهش روی regex: «همه‌چیز الگوست» — default هم py=NaN می‌گیرد و (NaN > cutoff = false)
   به مسیرِ DROP می‌افتد؛ نکتهٔ ظریف: derefِ m[1] روی null می‌ترکد پس کلِ if را
   حذف نمی‌کنیم — الگو را گشاد می‌کنیم. */
mutantRun(
  'M2 پارتیشنِ DEFAULT بدونِ گاردِ الگو حذف می‌شود ⇒ سوئیت قرمز',
  "const m = relname.match(new RegExp('^' + escapeRegExp(t) + '_y(\\\\d{4})$'));",
  "const m = relname.match(/.*/); /* MUTATION: name pattern matches all */",
  ['--apply'], {},
  (out) => /DROP grades_default/.test(out)
);

console.log('\n▸ M3 — گاردِ سالِ جاری خاموش');
/* جهش: کلِ ifِ گاردِ سال حذف (جایگزینِ بدونِ آکولادِ یتیم) — flow به مسیرِ
   حذف می‌افتد؛ امسال هم DROP می‌شود. */
mutantRun(
  'M3 پارتیشنِ امسال بدونِ گاردِ سال حذف می‌شود ⇒ سوئیت قرمز',
  "if (py > cutoff) { log('KEEP ' + relname + ' (سال ' + py + ' > ' + cutoff + ')'); kept++; continue; }",
  "; /* MUTATION: current-year guard off */",
  ['--apply'], {},
  (out) => new RegExp('DROP grades_y' + new Date().getFullYear()).test(out)
);

console.log('\n▸ M4 — fail-closed بایگانی');
mutantRun(
  'M4 حذف باوجودِ شکستِ pg_dump ⇒ سوئیت قرمز',
  "if (!ok) { log('✋ ' + relname + ': pg_dump شکست خورد — حذف نشد'); refused++; continue; }",
  "if (false) { /* MUTATION: archive fail-closed off */ }",
  ['--apply', '--archive-dir', path.join(ROOT, '.tmp-rt-arch')], {},
  (out) => /DROP grades_y\d{4}/.test(out) && !/pg_dump شکست خورد/.test(out)
);

console.log('\n──────────────────────────────────────────');
console.log('partition-retention-mutations: ' + (fails === 0 ? 'همه سبز ✅' : fails + ' شکست ❌'));
process.exit(fails === 0 ? 0 : 1);
