#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   reza-mirror-check.js — راستی‌آزماییِ آینه‌های `reza/` در برابر `docs/`
   ───────────────────────────────────────────────────────────────────
   • آینهٔ زنده: هر فایلِ `reza/<name>` که همتای `docs/<name>` دارد و **باید**
     بیت‌به‌بیت برابر باشد (مثل `ROADMAP.md`، `NATIONAL_ROADMAP_PROGRESS.md`).
     استثناها در EXCLUDE با دلیل مستند شده‌اند.
   • اسنپ‌شات نقطه‌ای: فایل‌هایی که عمداً آینهٔ زنده نیستند (BH-5)؛ فقط گزارش می‌شوند.
   اجرا: node tools/reza-mirror-check.js          (exit 1 اگر آینه‌ای رانش کرده باشد)
        node tools/reza-mirror-check.js --json
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const REZA = path.join(ROOT, 'reza');
const DOCS = path.join(ROOT, 'docs');

/* فایل‌هایی که هم‌نامِ سندی در docs/ دارند ولی آینهٔ آن نیستند (با دلیل) */
const EXCLUDE = {
  'README.md': 'ایندکسِ خودِ پکیج/زیرپوشه است، نه آینهٔ docs/README.md',
};

/* اسنپ‌شات‌های نقطه‌ای (BH-5) — آینهٔ زندهٔ build نیستند؛ حذف/بازتولید
   تصمیمِ محصول است و این ابزار فقط وضعیتشان را گزارش می‌کند. */
const SNAPSHOTS = [
  ['reza/index.html', 'index.html', 'index.html'],
  ['reza/payesh.html', 'index.html', 'index.html'],
  ['reza/برنامه_نویس/index.html', 'index.html', 'index.html'],
  ['reza/USER_GUIDE.html', 'USER_GUIDE.html', 'USER_GUIDE.html'],
];

const sha = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const rel = (p) => path.relative(ROOT, p).split(path.sep).join('/');

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out); else out.push(p);
  }
  return out;
}

function build() {
  const mirrors = [], drifted = [], skipped = [];
  for (const p of walk(REZA).sort()) {
    if (!p.endsWith('.md')) continue;
    const name = path.basename(p);
    const doc = path.join(DOCS, name);
    if (!fs.existsSync(doc)) continue;                       // سندِ مستقلِ پکیج
    if (EXCLUDE[name]) { skipped.push({ file: rel(p), why: EXCLUDE[name] }); continue; }
    const a = sha(p), b = sha(doc);
    (a === b ? mirrors : drifted).push({ file: rel(p), source: rel(doc), sha: a.slice(0, 16), srcSha: b.slice(0, 16) });
  }
  const snaps = SNAPSHOTS.map(([f, live, label]) => {
    const p = path.join(ROOT, f), l = path.join(ROOT, live);
    return {
      file: f, live, label,
      exists: fs.existsSync(p), liveExists: fs.existsSync(l),
      sha: fs.existsSync(p) ? sha(p).slice(0, 16) : '—',
      liveSha: fs.existsSync(l) ? sha(l).slice(0, 16) : '—',
      equal: fs.existsSync(p) && fs.existsSync(l) && sha(p) === sha(l),
    };
  });
  return { mirrors, drifted, skipped, snaps };
}

function main(argv) {
  const json = argv.includes('--json');
  const r = build();
  if (json) { console.log(JSON.stringify(r, null, 2)); return r.drifted.length ? 1 : 0; }
  console.log('▸ آینه‌های زنده (reza ↔ docs): ' + r.mirrors.length + ' برابر ✅');
  for (const m of r.mirrors) console.log('  ✅ ' + m.file + '  ≡  ' + m.source);
  if (r.skipped.length) { console.log('▸ مستثنا (با دلیل):'); for (const s of r.skipped) console.log('  • ' + s.file + ' — ' + s.why); }
  console.log('▸ اسنپ‌شات‌های نقطه‌ای (BH-5 — مستندشده، بازتولید نشده):');
  for (const s of r.snaps) console.log('  • ' + s.file + '  sha=' + s.sha + (s.equal ? '  (با build زنده برابر)' : '  (≠ build زندهٔ ' + s.live + ')'));
  if (r.drifted.length) {
    console.log('\n❌ آینه‌های رانش‌کرده: ' + r.drifted.length);
    for (const d of r.drifted) console.log('  ❌ ' + d.file + ' (sha=' + d.sha + ') ≠ ' + d.source + ' (sha=' + d.srcSha + ')');
    return 1;
  }
  console.log('\n✅ همهٔ آینه‌های زنده با منبعِ docs/ برابرند.');
  return 0;
}

if (require.main === module) process.exit(main(process.argv.slice(2)));
module.exports = { build, SNAPSHOTS, EXCLUDE };
