#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   tools/partition-retention.js — نگهداریِ سالانهٔ پارتیشن‌های grades/attendance
   ───────────────────────────────────────────────────────────────────
   چرا: پارتیشن‌بندیِ ۰۰9 «حذفِ میلیون‌سطری» را به «DETACH + DROP یک
   پارتیشن» تبدیل می‌کند (docs/WAVE10_DB_SCALE.md §۳/§۹). سیاستِ پیش‌فرض:
   نگهداریِ ۵ سالِ آموزشی (قابل‌تغییر) — پارتیشن‌های قدیمی‌تر جدا و (اختیاریً
   بایگانی‌شده و) حذف می‌شوند.

   اصول (SKILLS_MASTER — fail-closed):
     · پیش‌فرض dry-run است؛ حذف فقط باِ --apply.
     · فقط پارتیشن‌هایِ با نامِ دقیقِ `<table>_y<YYYY>` — هرگزِ default،
       هرگزِ سالِ جاری/آینده.
     · جدولِ هدف باید partitioned parent باشد (relkind='p').
     · باِ --archive-dir، هر پارتیشن پیش از حذف pg_dump می‌شود؛ شکستِ
       بایگانی ⇒ حذف نمی‌شود.

   کاربرد:
     node tools/partition-retention.js --pg URL [--tables grades,attendance]
          [--keep-years 5] [--archive-dir DIR] [--apply]
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

const { Client } = require('pg');
const { execFile } = require('child_process');
const path = require('path');

function parseArgs(argv) {
  const out = { apply: false, tables: ['grades', 'attendance'], keepYears: 5, pg: null, archiveDir: null };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--apply') out.apply = true;
    else if (a === '--pg') out.pg = argv[++i];
    else if (a === '--tables') out.tables = String(argv[++i] || '').split(',').map((s) => s.trim()).filter(Boolean);
    else if (a === '--keep-years') out.keepYears = Number(argv[++i]);
    else if (a === '--archive-dir') out.archiveDir = argv[++i];
    else { console.error('آرگومان ناشناخته: ' + a); process.exit(2); }
  }
  if (!out.pg) { console.error('لازم: --pg <connection-url>'); process.exit(2); }
  if (!Number.isInteger(out.keepYears) || out.keepYears < 1 || out.keepYears > 50) { console.error('--keep-years باید عدد صحیح ۱..۵۰ باشد'); process.exit(2); }
  if (!out.tables.length) { console.error('--tables خالی است'); process.exit(2); }
  return out;
}

const dump = (args, file) => new Promise((res) => {
  execFile('pg_dump', ['--no-owner', '--no-privileges', '--table', file.table, '--file', file.path, args.pg],
    { env: process.env }, (err) => res(!err));
});

const escapeRegExp = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

(async () => {
  const args = parseArgs(process.argv);
  const year = new Date().getFullYear();
  const cutoff = year - args.keepYears; /* سال‌های <= cutoff حذف می‌شوند (نگهداریِ سال..سال-4) */
  const c = new Client({ connectionString: args.pg });
  await c.connect();
  const log = (m) => console.log('[retention] ' + m);

  log('سیاست: نگهداریِ ' + args.keepYears + ' سال ⇒ حذفِ پارتیشن‌هایِ سالِ ≤ ' + cutoff + ' (امروز: ' + year + ')' + (args.apply ? ' · APPLY' : ' · DRY-RUN'));

  let dropped = 0, kept = 0, refused = 0;
  for (const t of args.tables) {
    /* گارد ۱: والد باید پارتیشن‌شده باشد */
    const rk = await c.query("SELECT relkind::text AS k FROM pg_class WHERE relname = $1 AND relnamespace = 'public'::regnamespace", [t]);
    if (rk.rows.length !== 1 || rk.rows[0].k !== 'p') {
      log('✋ ' + t + ': partitioned parent نیست (relkind=' + (rk.rows[0] ? rk.rows[0].k : 'ندارد') + ') — رد شد');
      refused++; continue;
    }
    const parts = await c.query(
      `SELECT c.relname FROM pg_inherits i JOIN pg_class c ON c.oid = i.inhrelid
       WHERE i.inhparent = $1::regclass ORDER BY 1`, [t]);
    for (const { relname } of parts.rows) {
      /* گارد ۲: فقط الگویِ <table>_y<YYYY> */
      const m = relname.match(new RegExp('^' + escapeRegExp(t) + '_y(\\d{4})$'));
      if (!m) { log('⏭️  ' + relname + ': خارجِ الگویِ سالانه (default/غیره) — دست‌نخورده'); kept++; continue; }
      const py = Number(m[1]);
      /* گارد ۳: هرگزِ سالِ جاری/آینده */
      if (py > cutoff) { log('KEEP ' + relname + ' (سال ' + py + ' > ' + cutoff + ')'); kept++; continue; }
      if (!args.apply) { log('DRY  ' + relname + ' ← حذف می‌شد (سال ' + py + ' ≤ ' + cutoff + ')'); continue; }
      /* بایگانیِ اختیاری — شکست ⇒ حذف نه (fail-closed) */
      if (args.archiveDir) {
        const file = { table: relname, path: path.join(args.archiveDir, relname + '_' + new Date().toISOString().slice(0, 10) + '.sql') };
        log('ARCHIVE ' + relname + ' → ' + file.path);
        const ok = await dump(args, file);
        if (!ok) { log('✋ ' + relname + ': pg_dump شکست خورد — حذف نشد'); refused++; continue; }
      }
      await c.query('ALTER TABLE ' + t + ' DETACH PARTITION ' + relname);
      await c.query('DROP TABLE ' + relname);
      log('DROP ' + relname + ' ✓ (detach + drop)');
      dropped++;
    }
  }
  await c.end();
  log('پایان: حذف=' + dropped + ' · نگه‌داشته=' + kept + ' · رد=' + refused + (args.apply ? '' : ' (dry-run — برایِ اجرا: --apply)'));
  /* fail-closed: در حالتِ apply اگر چیزی رد شده باشد (جدولِ ناپارتیشن‌شده یا
     شکستِ بایگانی) سیگنال بدهیم تا cron/مانیتور ببیند. */
  process.exit(args.apply && refused > 0 ? 1 : 0);
})().catch((e) => { console.error('[retention] FATAL:', e.message); process.exit(2); });
