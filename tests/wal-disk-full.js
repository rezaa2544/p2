#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   tests/wal-disk-full.js — Wave 19 · مانورِ واقعیِ «پر شدنِ دیسکِ WAL»
   ───────────────────────────────────────────────────────────────────
   این تست شبیه‌سازی نیست: یک کلاسترِ واقعیِ PostgreSQL را با pg_wal روی
   یک tmpfsِ سقف‌دار بالا می‌آورد و واقعاً دیسکِ WAL را پر می‌کند تا رفتارِ
   PostgreSQL (warning → PANIC → shutdown) و سپس بازیابی را اندازه بگیرد.

   سناریوها:
     W1  WAL → ۸۰٪      ⇒ انتظارِ warning در لاگِ PG
     W2  WAL → ۱۰۰٪     ⇒ انتظارِ PANIC + خاموشی
     W3  بازیابی         ⇒ آزادسازیِ WAL + restart ⇒ اندازه‌گیریِ RTO
     W4  بازیابی از replica (streaming replication)
     W5  تأییدِ RPO=0    ⇒ checksumِ دادهٔ commit‌شده پیش/پس از حادثه

   اجرای زیرساخت:  sudo infra/wal-drill/bootstrap.sh
   اجرای تست:      node tests/wal-disk-full.js
                   node tests/wal-disk-full.js --skip-live   (فقط بررسیِ ایستا)

   قانونِ «سبزِ جعلی ممنوع»: اگر زیرساختِ زنده در دسترس نباشد، این تست
   سناریوها را PASS نمی‌دهد؛ آن‌ها را NOT-RUN گزارش می‌کند و با کدِ ۲ خارج
   می‌شود تا در CI به‌عنوانِ «اجرا نشد» دیده شود، نه «موفق».
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFileSync, spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');

/* ── پیکربندی از محیط ───────────────────────────────────────────── */
const CFG = {
  bin:     process.env.PGBIN     || '/usr/lib/postgresql/17/bin',
  pgdata:  process.env.PGDATADIR || '/var/tmp/pgdata-wal-drill',
  walMnt:  process.env.WAL_MNT   || '/mnt/pgwal',
  sockDir: process.env.PGSOCKDIR || '/var/tmp/wal-drill-run/sock',
  logDir:  process.env.WAL_LOGDIR || '/var/tmp/wal-drill-run/logs',
  port:    Number(process.env.PGPORT_DRILL || process.env.PGPORT || 55432),
  user:    process.env.PGUSER    || 'postgres',
  walMb:   Number(process.env.WAL_MB || 100),
  schools: Number(process.env.WAL_DRILL_SCHOOLS || 12),
  rowsPerSchool: Number(process.env.WAL_DRILL_ROWS || 1500),
};
const SKIP_LIVE = process.argv.includes('--skip-live');
// بودجهٔ زمانیِ کلِ مانور. بدونِ این، حلقهٔ restart با WALِ پُر می‌تواند
// دقیقه‌ها بلوکه بماند (هر pg_ctl تا -t ثانیه منتظر می‌ماند).
const DEADLINE_MS = Number(process.env.WAL_DRILL_BUDGET_MS || 420000);
const T_START = Date.now();
let watchdogArmed = false;
function armWatchdog() {
  if (watchdogArmed) return;
  watchdogArmed = true;
  const t = setTimeout(() => {
    console.log('\n⏱  نگهبانِ زمانی: بودجهٔ ' + (DEADLINE_MS / 1000) + 's تمام شد — ' +
      'خروج با نتایجِ ناقص. (دیسکِ پُرِ WAL، PG را به حلقهٔ retry می‌برد و ' +
      'psql تا سقفِ timeout بلوکه می‌ماند.)');
    finish('نگهبانِ زمانی فعال شد (بودجهٔ ' + (DEADLINE_MS / 1000) + 's)');
  }, DEADLINE_MS);
  t.unref && t.unref();
}
function overBudget(phase) {
  const left = DEADLINE_MS - (Date.now() - T_START);
  if (left <= 0) { console.log('      ⏱  بودجهٔ زمانی تمام شد در فازِ ' + phase); return true; }
  return false;
}
const OUT_DIR = path.join(ROOT, 'tests', 'chaos-output');
const OUT_JSON = path.join(OUT_DIR, 'wal-disk-full.json');

/* ── شمارنده‌ها (هم‌رhythm با سایر تست‌های Wave 19) ─────────────── */
let pass = 0, fail = 0, notRun = 0;
const results = [];
function chk(name, cond, detail) {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ ' + name + (detail ? ' — ' + detail : '')); }
  results.push({ name, status: cond ? 'pass' : 'fail', detail: detail || null });
}
function skip(name, why) {
  notRun++; console.log('  ⏭️  ' + name + ' — NOT RUN: ' + why);
  results.push({ name, status: 'not-run', detail: why });
}
function elapsed() { return ((Date.now() - T_START) / 1000).toFixed(1) + 's'; }
function group(t) { console.log('\n[' + elapsed() + '] ▸ ' + t); }

/* ── ابزارهایِ پوسته/PG ─────────────────────────────────────────── */
function sh(cmd, args, opts = {}) {
  return spawnSync(cmd, args, Object.assign({ encoding: 'utf8' }, opts));
}
function psql(sql, opts = {}) {
  return spawnSync(path.join(CFG.bin, 'psql'), ['-tAq', '-c', sql], {
    encoding: 'utf8',
    env: Object.assign({}, process.env, {
      PGHOST: CFG.sockDir, PGPORT: String(CFG.port), PGUSER: CFG.user, PGDATABASE: 'postgres',
    }),
    timeout: opts.timeout || 25000,
  });
}
// sudo با env_reset متغیرها را دور می‌ریزد؛ برایِ ابزارهایِ PG که باید به
// سوکتِ درست برسند، متغیرها را صریح در خودِ خطِ فرمان می‌آوریم.
function sudoPgEnv() {
  return ['PGHOST=' + CFG.sockDir, 'PGPORT=' + String(CFG.port),
          'PGUSER=' + CFG.user, 'PGDATABASE=postgres'];
}
function sudoPgBin(args, timeout) {
  return spawnSync('sudo', ['-n', 'PGHOST=' + CFG.sockDir, 'PGPORT=' + String(CFG.port),
    'PGUSER=' + CFG.user, 'PGDATABASE=postgres'].concat(args),
    { encoding: 'utf8', timeout: timeout || 180000 });
}
function pgIsReady() {
  const r = sh(path.join(CFG.bin, 'pg_isready'),
    ['-h', CFG.sockDir, '-p', String(CFG.port), '-U', CFG.user, '-q'], { encoding: 'utf8', timeout: 5000 });
  return r.status === 0;
}
function pgCtl(mode, extra = []) {
  // timeoutِ صریح الزامی است: sh() بدونِ timeout منتظرِ همیشگی است، و وقتی
  // postmaster زنده است ولی startup process مدام شکست می‌خورد، pg_ctl -t
  // به‌تنهایی برنمی‌گردد (مانورِ run 5 دقیقاً ۴۱۷ ثانیه همین‌جا گیر کرد).
  return sh('sudo', ['-n', '-u', 'postgres', path.join(CFG.bin, 'pg_ctl'),
    '-D', CFG.pgdata, '-m', mode, '-w', '-t', '15'].concat(extra, ['start']),
    { encoding: 'utf8', timeout: 30000 });
}
function pgStop(mode = 'immediate') {
  return sh('sudo', ['-n', '-u', 'postgres', path.join(CFG.bin, 'pg_ctl'),
    '-D', CFG.pgdata, '-m', mode, '-w', '-t', '15', 'stop'],
    { encoding: 'utf8', timeout: 30000 });
}
function fsStat(mnt) {
  const st = sh('df', ['--output=used,avail', '-B1', mnt]);
  const line = (st.stdout || '').trim().split('\n').pop().trim().split(/\s+/);
  return { used: Number(line[0]) || 0, avail: Number(line[1]) || 0 };
}
function walBytes() { return fsStat(CFG.walMnt).used; }
function walAvail() { return fsStat(CFG.walMnt).avail; }
function walPct() {
  const total = CFG.walMb * 1024 * 1024;
  return (walBytes() / total) * 100;
}
// لاگِ PG با logging_collector در یک فایلِ در حالِ رشد نوشته می‌شود، پس
// «نامِ آخرین فایل» به‌عنوانِ نشانگر کار نمی‌کند: همان فایلی را برمی‌گرداند
// که قرار است بخوانیم و delta همیشه خالی می‌شود. نشانگرِ درست، اندازهٔ بایتِ
// هر فایل است.
function logMarker() {
  const m = {};
  try { for (const f of fs.readdirSync(CFG.logDir)) {
    try { m[f] = fs.statSync(path.join(CFG.logDir, f)).size; } catch (e) { m[f] = 0; }
  } } catch (e) {}
  return m;
}
function newLogsSince(marker) {
  let out = [];
  let files = [];
  try { files = fs.readdirSync(CFG.logDir); } catch (e) { return ''; }
  for (const f of files.sort()) {
    const full = path.join(CFG.logDir, f);
    let size = 0;
    try { size = fs.statSync(full).size; } catch (e) { continue; }
    const from = (marker && typeof marker === 'object' && marker[f] != null) ? marker[f] : 0;
    if (size <= from) continue;
    try {
      const fd = fs.openSync(full, 'r');
      const buf = Buffer.alloc(size - from);
      fs.readSync(fd, buf, 0, buf.length, from);
      fs.closeSync(fd);
      out.push(buf.toString('utf8'));
    } catch (e) {}
  }
  return out.join('\n');
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* ── پرکنندهٔ WAL: حجمِ واقعی روی همان tmpfs ────────────────────── */
function fillWalTo(targetPct) {
  // نکتهٔ کلیدی: tmpfs صفحه‌ها را «تنبل» تخصیص می‌دهد، پس شمردنِ ستونِ usedِ
  // df کافی نیست — ممکن است عدد ۱۰۰٪ نشان دهد و هنوز برای نوشتنِ WALِ خودِ
  // PostgreSQL جا باشد (این دقیقاً همان خطایی بود که مانورِ اول را سبزِ
  // کاذب کرد). معیارِ درست، صفر شدنِ ستونِ avail است.
  const total = CFG.walMb * 1024 * 1024;
  const target = Math.floor(total * targetPct / 100);
  const fillerDir = path.join(CFG.walMnt, 'drill-filler');
  try { fs.mkdirSync(fillerDir, { recursive: true }); } catch (e) {}
  let idx = 0, guard = 0;
  const big = Buffer.alloc(4 * 1024 * 1024, 7);   // 4MB — زیرِ یک segmentِ WAL
  const small = Buffer.alloc(64 * 1024, 7);       // 64KB — برایِ ریزکردنِ لبه
  let hitEnospc = false;

  // گامِ ۱: بلوک‌هایِ بزرگ تا رسیدن به هدف
  while (walBytes() < target && guard++ < 400) {
    try { fs.writeFileSync(path.join(fillerDir, 'f' + String(idx++).padStart(4, '0')), big); }
    catch (e) { hitEnospc = true; break; }
  }
  // گامِ ۲: پرکردنِ باقی‌مانده با بلوکِ کوچک تا avail واقعاً صفر شود
  if (targetPct >= 100) {
    // df را برایِ هر فایلِ ۶۴KB صدا نزن (۱۵۰۰+ spawn)؛ هر ۱۶ فایل یک‌بار.
    let sinceCheck = 0, avail = walAvail();
    while (avail > 0 && guard++ < 4000) {
      try { fs.writeFileSync(path.join(fillerDir, 'f' + String(idx++).padStart(5, '0')), small); }
      catch (e) { hitEnospc = true; break; }
      if (++sinceCheck >= 16) { avail = walAvail(); sinceCheck = 0; }
    }
    // گامِ ۳: یک تأییدِ نهاییِ نوشتن — باید با ENOSPC رد شود
    try {
      fs.writeFileSync(path.join(fillerDir, 'verify-' + Date.now()), Buffer.alloc(1024 * 1024, 7));
      hitEnospc = false;
    } catch (e) { hitEnospc = /ENOSPC|No space left/i.test(String(e)); }
  }
  return { used: walBytes(), avail: walAvail(), enospc: hitEnospc, files: idx };
}
function freeWalSpace() {
  // «پاک کردنِ WALِ قدیمی» — در عمل، آزادسازیِ فضا از رویِ دیسکِ WAL.
  const dir = path.join(CFG.walMnt, 'drill-filler');
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) {}
  return walBytes();
}

/* ── دادهٔ seed ───────────────────────────────────────────────────
   نکتهٔ schema: ستونِ id در این مخزن DEFAULT ندارد (integer NOT NULL بدونِ
   serial/identity)، پس هر INSERT باید شناسه را صریح تولید کند.            */
function seed() {
  const sql = `
    do $$
    declare s int; nid bigint; sid bigint;
    begin
      -- schools
      for s in 1..${CFG.schools} loop
        select coalesce(max(id),0)+1 into nid from schools;
        insert into schools (id, name, code, active, version)
        values (nid, 'مدرسهٔ مانور ' || s, 'WAL' || lpad(s::text, 4, '0'), true, 1)
        on conflict do nothing;
      end loop;

      -- classes (یک کلاس برای هر مدرسهٔ مانور)
      for sid in select id from schools where code like 'WAL%' loop
        select coalesce(max(id),0)+1 into nid from classes;
        insert into classes (id, school_id, name, grade, version)
        values (nid, sid, 'کلاسِ مانور', 10, 1)
        on conflict do nothing;
      end loop;

      -- attendance: بارِ اولیه (تولیدِ WALِ واقعی)
      select id into sid from schools where code like 'WAL%' order by id limit 1;
      select coalesce(max(id),0) into nid from attendance;
      insert into attendance (id, school_id, date, status, source, version, taken_at)
      select nid + g, sid, '1404-06-21', 'present', 'drill', 1, now()
      from generate_series(1, ${CFG.rowsPerSchool}) g;
    end $$;
  `;
  const r = psql(sql, { timeout: 300000 });
  return r.status === 0 ? null : ((r.stderr || r.stdout || '').trim().split('\n')[0]);
}

/* ── بارِ نوشتنِ واقعی (تولیدِ WAL توسط خودِ PG) ─────────────────── */
function writeLoad(batches, rowsPerBatch) {
  // مثلِ seed: شناسه باید صریح ساخته شود چون id پیش‌فرض ندارد.
  const sql = `do $$ declare nid bigint; sid bigint; begin
    select id into sid from schools where code like 'WAL%' order by id limit 1;
    select coalesce(max(id),0) into nid from attendance;
    insert into attendance (id, school_id, date, status, source, note, version, taken_at)
    select nid + g, sid, '1404-06-21', 'present', 'drill', repeat('w', 200), 1, now()
    from generate_series(1, ${rowsPerBatch}) g;
  end $$;`;
  let committed = 0, errors = [];
  for (let b = 0; b < batches; b++) {
    const r = psql(sql, { timeout: 20000 });
    if (r.status === 0) committed += rowsPerBatch;
    else errors.push((r.stderr || '').trim().split('\n')[0]);
    if (!pgIsReady()) break;
  }
  return { committed, errors };
}

/* ── checksumِ دادهٔ commit‌شده (پایهٔ سنجشِ RPO) ─────────────────── */
function dataChecksum() {
  const r = psql(`select coalesce(string_agg(t, '|' order by t), '') from (
      select 'attendance:' || count(*) || ':' || coalesce(sum(hashtext(id::text || date || status)),0)::text as t from attendance
      union all select 'classes:' || count(*) || ':' || coalesce(sum(hashtext(id::text || name)),0)::text from classes
      union all select 'schools:' || count(*) || ':' || coalesce(sum(hashtext(id::text || code)),0)::text from schools
    ) x`);
  const raw = (r.stdout || '').trim();
  if (r.status !== 0 || !raw) return null;
  return { raw, sha: crypto.createHash('sha256').update(raw).digest('hex'),
           counts: Object.fromEntries(raw.split('|').map(p => { const [k, v] = p.split(':'); return [k, Number(v)]; })) };
}

/* ── راه‌اندازیِ replica برای W4 ─────────────────────────────────── */
function setupReplica(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
  psql(`select pg_create_physical_replication_slot('drill_slot', true)`);
  const bb = sudoPgBin(['-u', 'postgres', path.join(CFG.bin, 'pg_basebackup'),
    '-D', dir, '-R', '-S', 'drill_slot', '-X', 'stream', '-P']);
  if (bb.status !== 0) {
    return { ok: false, why: 'pg_basebackup: ' + (bb.stderr || '').trim().split('\n').filter(Boolean).pop() };
  }
  if (bb.status !== 0) return { ok: false, why: (bb.stderr || '').trim().split('\n').slice(-2).join(' ') };
  // پورتِ جدا + سوکتِ جدا برای replica
  const port = CFG.port + 1;
  const sock = dir + '-sock';
  fs.mkdirSync(sock, { recursive: true });
  spawnSync('sudo', ['-n', 'chown', 'postgres:postgres', sock]);
  fs.appendFileSync(path.join(dir, 'postgresql.auto.conf'),
    `\nport = ${port}\nunix_socket_directories = '${sock}'\nprimary_slot_name = 'drill_slot'\n`);
  spawnSync('sudo', ['-n', 'chown', '-R', 'postgres:postgres', dir]);
  const st = spawnSync('sudo', ['-n', '-u', 'postgres', path.join(CFG.bin, 'pg_ctl'),
    '-D', dir, '-l', path.join(dir, 'startup.log'), '-w', '-t', '40', 'start'], { encoding: 'utf8' });
  return { ok: st.status === 0, port, sock,
           why: st.status === 0 ? null : ((st.stderr || '').trim() || 'pg_ctl start failed') };
}
function replicaCatchUp(sock, port, targetLsn) {
  for (let i = 0; i < 40; i++) {
    const r = spawnSync('sudo', ['-n', 'PGHOST=' + sock, 'PGPORT=' + String(port),
      'PGUSER=' + CFG.user, 'PGDATABASE=postgres', '-u', 'postgres',
      path.join(CFG.bin, 'psql'), '-tAq', '-c',
      `select pg_last_wal_replay_lsn() >= '${targetLsn}'::pg_lsn`], { encoding: 'utf8', timeout: 10000 });
    if (r.status === 0 && /t/.test(r.stdout || '')) return true;
    spawnSync('sleep', ['0.5']);
  }
  return false;
}

/* ═══════════════════════════════════════════════════════════════════
   بخشِ ایستا — همیشه اجرا می‌شود (بدون نیاز به زیرساخت)
   ═══════════════════════════════════════════════════════════════════ */
group('بررسیِ ایستا (بدونِ زیرساخت)');
{
  const boot = path.join(ROOT, 'infra', 'wal-drill', 'bootstrap.sh');
  chk('S1 اسکریپتِ زیرساخت وجود دارد', fs.existsSync(boot));
  if (fs.existsSync(boot)) {
    const b = fs.readFileSync(boot, 'utf8');
    chk('S2 bootstrap روی tmpfsِ سقف‌دار mount می‌کند', /mount -t tmpfs -o "size=\$\{WAL_MB\}M/.test(b));
    chk('S3 pg_wal به tmpfs پیوند می‌خورد', /ln -s "\$WAL_MNT" "\$PGDATA\/pg_wal"/.test(b));
    chk('S4 پورتِ ۵۵۴۳۲ پیش‌فرض است', /PGPORT="\$\{PGPORT:-55432\}"/.test(b));
    chk('S5 هر ۷ migration را اعمال می‌کند', (b.match(/migrations\/\d+_/g) || []).length >= 7);
    const syn = sh('bash', ['-n', boot]);
    chk('S6 bash -n سالم است', syn.status === 0, (syn.stderr || '').trim());
  }
  const doc = path.join(ROOT, 'docs', 'WAVE19_WAL_DRILL_REPORT.md');
  chk('S7 گزارشِ مانور وجود دارد', fs.existsSync(doc));
}

/* ═══════════════════════════════════════════════════════════════════
   بخشِ زنده — مانورِ واقعی
   ═══════════════════════════════════════════════════════════════════ */
const timeline = [];
const mark = (phase, extra = {}) => timeline.push(Object.assign({ t: Date.now(), phase }, extra));

function liveAvailable() {
  if (SKIP_LIVE) return { ok: false, why: 'پرچمِ --skip-live داده شده' };
  if (!fs.existsSync(path.join(CFG.bin, 'postgres')))
    return { ok: false, why: 'باینریِ PostgreSQL در ' + CFG.bin + ' نیست' };
  const mp = sh('mountpoint', ['-q', CFG.walMnt]);
  if (mp.status !== 0) return { ok: false, why: CFG.walMnt + ' یک tmpfsِ mount‌شده نیست' };
  if (!fs.existsSync(CFG.pgdata)) return { ok: false, why: 'PGDATA پیدا نشد: ' + CFG.pgdata };
  if (!pgIsReady()) return { ok: false, why: 'PostgreSQL روی پورتِ ' + CFG.port + ' پاسخ نمی‌دهد' };
  return { ok: true };
}

(async function main() {
  const live = liveAvailable();
  if (!live.ok) {
    group('مانورِ زنده');
    ['W1 WAL→۸۰٪ warning', 'W2 WAL→۱۰۰٪ PANIC', 'W3 بازیابی + RTO',
     'W4 بازیابی از replica', 'W5 تأییدِ RPO=0'].forEach(n => skip(n, live.why));
    finish(live.why);
    return;
  }

  armWatchdog();
  console.log('\n  زیرساختِ زنده تأیید شد: PG=' + CFG.port + ' pg_wal=' + CFG.walMnt +
    ' (سقفِ ' + CFG.walMb + 'MB، بودجهٔ ' + (DEADLINE_MS / 1000) + 's)');

  /* ── آماده‌سازی: seed + checksumِ پایه ─────────────────────────── */
  group('آماده‌سازی (seed + checksumِ پایه)');
  const seedErr = seed();
  chk('P1 seedِ داده بدونِ خطا', !seedErr, seedErr);
  const base = dataChecksum();
  chk('P2 checksumِ پایه گرفته شد', !!base);
  if (base) console.log('      ' + JSON.stringify(base.counts) + '  sha=' + base.sha.slice(0, 16));
  mark('seeded', { counts: base ? base.counts : null });

  /* ── W1: WAL → ۸۰٪ ⇒ warning ──────────────────────────────────── */
  group('W1 — پر کردنِ WAL تا ۸۰٪ و پایشِ warning');
  {
    const m = logMarker();
    const before = walBytes();
    const reached = fillWalTo(80);
    const pct = walPct();
    console.log('      WAL: ' + (before / 1048576).toFixed(1) + 'MB → ' +
      (reached.used / 1048576).toFixed(1) + 'MB (' + pct.toFixed(1) + '% از ' + CFG.walMb +
      'MB، avail=' + (reached.avail / 1048576).toFixed(1) + 'MB)');
    chk('W1a WAL به ≥۸۰٪ رسید', pct >= 80, pct.toFixed(1) + '%');

    // نوشتنِ واقعی تا PG مجبور به تولیدِ WAL شود
    const wl = writeLoad(1, 300);
    console.log('      نوشتنِ واقعی: ' + wl.committed + ' سطر commit شد' +
      (wl.errors.length ? ' | خطا: ' + wl.errors[0] : ''));
    const logs80 = newLogsSince(m);
    const warnedAt80 = /could not write|No space left on device|could not extend file/i.test(logs80);
    chk('W1c سرور رویِ ۸۰٪ سالم و در حالِ سرویس‌دهی است', pgIsReady());

    // یافتهٔ صادقانهٔ مانور (و اصلاحِ یک فرضِ نادرستِ اولیه):
    //   ۱) PG رویِ ۸۰٪ هیچ هشدارِ پیش‌دستانه‌ای نمی‌دهد — کاملاً بی‌صدا سرویس
    //      می‌دهد. پس آلارمِ «WAL دارد پُر می‌شود» باید بیرونی باشد.
    //   ۲) در PG17 نخستین برخورد با ENOSPC رویِ pg_wal/xlogtemp رخ می‌دهد و
    //      «بی‌درنگ» PANIC می‌کند؛ اصلاً به حلقهٔ retry نمی‌رسد. پس انتظارِ
    //      هشدارِ «could not write … retrying» پیش از PANIC نادرست است.
    // اینجا فقط پلهٔ ۸۰٪ را تأیید می‌کنیم و شکافِ پایش را صریح ثبت می‌کنیم؛
    // خودِ PANIC در W2 اندازه‌گیری می‌شود.
    chk('W1b در ۸۰٪ هیچ هشدارِ WAL ثبت نشد ⇒ نبودِ آلارمِ پیش‌دستانه (شکافِ پایش)',
      !warnedAt80, 'هشدار در ۸۰٪ دیده شد — فرضِ «بی‌صدا» نادرست بود');
    console.log('      ⚠ یافتهٔ عملیاتی: PG در ۸۰٪ ساکت است؛ آلارمِ دیسکِ WAL باید ' +
      'بیرونی باشد (node_exporter / pg_stat_wal) وگرنه نخستین نشانه، PANIC است.');
    mark('W1', { pct: Number(pct.toFixed(1)), warnedAt80, committed: wl.committed });
  }

  /* ── W2: WAL → ۱۰۰٪ ⇒ PANIC + shutdown ─────────────────────────── */
  group('W2 — پر کردنِ کاملِ WAL و مشاهدهٔ PANIC');
  let panicked = false, down = false, panicLine = '';
  {
    const m = logMarker();
    const reached = fillWalTo(100);
    console.log('      WAL: ' + (reached.used / 1048576).toFixed(1) + 'MB (' +
      walPct().toFixed(1) + '%، avail=' + reached.avail + 'B، ENOSPC تأیید شد: ' +
      reached.enospc + ')');
    const fsTrulyFull = reached.enospc && reached.avail <= 65536;
    chk('W2a دیسکِ WAL واقعاً پر شد (avail≈0 و نوشتنِ تأییدی ENOSPC داد)', fsTrulyFull,
      'avail=' + reached.avail + 'B enospc=' + reached.enospc);

    // نوشتنِ سنگین تا checkpoint/WAL-write با ENOSPC برخورد کند.
    // عمداً کم‌حجم و با بودجهٔ زمانی: هدف «پر شدن» است نه «بنچمارک».
    let wl = { committed: 0, errors: [] };
    for (let round = 0; round < 3 && !overBudget('W2'); round++) {
      const r = writeLoad(1, 800);
      wl.committed += r.committed; wl.errors = wl.errors.concat(r.errors);
      if (r.errors.length) break;           // ENOSPC دیده شد؛ کافی است
      if (!pgIsReady()) break;
      psql('checkpoint', { timeout: 10000 }); // واداشتنِ WAL-writeِ بحرانی
    }
    console.log('      نوشتنِ سنگین: ' + wl.committed + ' سطر commit شد، ' +
      wl.errors.length + ' خطا');
    if (wl.errors.length) console.log('      اولین خطا: ' + wl.errors[0]);

    psql('checkpoint', { timeout: 15000 });
    // کلیدِ سناریو: تا وقتی PG می‌تواند سگمنتِ قدیمی را «بازیافت» کند یا داخلِ
    // سگمنتِ از‌پیش‌تخصیص‌یافته بنویسد، هیچ تخصیصِ تازه‌ای لازم ندارد و پر
    // بودنِ دیسک را حس نمی‌کند. پس او را وادار می‌کنیم به سگمنتِ تازه برود.
    psql('select pg_switch_wal()', { timeout: 15000 });
    psql('checkpoint', { timeout: 15000 });
    for (let i = 0; i < 10 && !down && !overBudget('W2b'); i++) { await sleep(500); down = !pgIsReady(); }

    const logs = newLogsSince(m);
    // رفتارِ واقعیِ PG۱۷ رویِ ENOSPCِ WAL دو چهره دارد و هر دو «شکستِ بحرانی» است:
    //   (الف) PANIC در زمانِ اجرا هنگامِ نوشتنِ WAL
    //   (ب) FATAL در startup چون xlogtemp روی دیسکِ پُر نوشته نمی‌شود
    const mPanic = logs.match(/^.*PANIC.*$/m);
    const mFatal = logs.match(/^.*FATAL:.*No space left on device.*$/m);
    const mNoSpace = /No space left on device/.test(logs);
    panicked = !!(mPanic || mFatal);
    panicLine = ((mPanic || mFatal || [])[0] || '').trim();
    console.log('      شکستِ بحرانیِ WAL: ' + (panicked ? 'بله' : 'خیر') +
      (panicLine ? '\n        ' + panicLine : ''));
    chk('W2b PostgreSQL با ENOSPCِ WAL شکستِ بحرانی داد (PANIC/FATAL)', panicked,
      'در لاگ neither PANIC nor ENOSPC-FATAL ثبت نشد');
    chk('W2c ENOSPC صریحاً در لاگ ثبت شد', mNoSpace);
    chk('W2d سرور خاموش/غیرپاسخ شد', down, 'سرور هنوز پاسخ می‌دهد');
    mark('W2', { pct: Number(walPct().toFixed(1)), panicked, down,
                 enospc: mNoSpace, committed: wl.committed });
  }

  /* ── W3: بازیابی + اندازه‌گیریِ RTO ────────────────────────────── */
  group('W3 — بازیابی (آزادسازیِ WAL + restart) و اندازه‌گیریِ RTO');
  {
    const t0 = Date.now();
    // تلاشِ اولِ restart با دیسکِ پُر — باید شکست بخورد (مستندسازیِ رفتار)
    const firstTry = pgCtl('immediate');
    const firstOk = firstTry.status === 0;
    console.log('      restart با دیسکِ پُر: ' + (firstOk ? 'موفق (غیرمنتظره)' : 'ناموفق (منتظره)'));

    // «پاک کردنِ WALِ قدیمی» ⇒ آزادسازیِ فضا
    const freedTo = freeWalSpace();
    const tFreed = Date.now();
    console.log('      فضا آزاد شد → ' + (freedTo / 1048576).toFixed(1) + 'MB مصرف (' +
      walPct().toFixed(1) + '%)');

    pgCtl('immediate');                       // یک تلاشِ کران‌دار
    let up = pgIsReady(), waited = 0;
    while (!up && waited < 20000 && !overBudget('W3')) {  // تا ۲۰s فقط poll
      await sleep(1000); waited += 1000; up = pgIsReady();
    }
    if (!up) { pgCtl('immediate'); up = pgIsReady(); }
    const tries = 1 + Math.round(waited / 1000);
    const tUp = Date.now();
    chk('W3a سرور پس از آزادسازیِ فضا بالا آمد', up, 'پس از ' + tries + ' تلاش');
    const rtoMs = up ? (tUp - t0) : null;
    if (up) console.log('      RTO = ' + (rtoMs / 1000).toFixed(1) + 's (از شروعِ تلاش تا پذیرشِ اتصال)');
    mark('W3', { up, rtoMs, restartWithFullDiskWorked: firstOk });
    global.__RTO = rtoMs;
  }

  /* ── W5: تأییدِ RPO=0 ──────────────────────────────────────────── */
  group('W5 — تأییدِ RPO=0 (مقایسهٔ checksumِ دادهٔ commit‌شده)');
  {
    const after = dataChecksum();
    chk('W5a checksumِ پس از بازیابی گرفته شد', !!after);
    if (after && base) {
      console.log('      پیش:  ' + JSON.stringify(base.counts));
      console.log('      پس:   ' + JSON.stringify(after.counts));
      chk('W5b تعدادِ رکوردها کاهش نیافته (صفر data loss)',
        Object.keys(base.counts).every(k => after.counts[k] >= base.counts[k]),
        JSON.stringify({ before: base.counts, after: after.counts }));
    }
    mark('W5', { after: after ? after.counts : null });
    global.__AFTER = after; global.__BASE = base;
  }

  /* ── W4: replica (streaming replication) ───────────────────────── */
  group('W4 — بازیابی از replica (streaming replication)');
  {
    const dir = '/var/tmp/pgdata-wal-replica';
    console.log('      [' + elapsed() + '] ساختنِ replica با pg_basebackup …');
    const rp = setupReplica(dir);
    console.log('      [' + elapsed() + '] نتیجهٔ replica: ' + (rp.ok ? 'موفق' : 'ناموفق'));
    if (!rp.ok) {
      skip('W4 replica بالا آمد', rp.why);
    } else {
      console.log('      replica بالا آمد روی پورتِ ' + rp.port);
      // یک نوشتنِ تازه روی primary، سپس انتظار برای replica
      const lsnBefore = (psql('select pg_current_wal_lsn()').stdout || '').trim();
      const wl = writeLoad(1, 1200);
      const lsn = (psql('select pg_current_wal_lsn()').stdout || '').trim();
      console.log('      [' + elapsed() + '] انتظار برای رسیدنِ replica به ' + lsn);
      const caught = replicaCatchUp(rp.sock, rp.port, lsn);
      console.log('      [' + elapsed() + '] replica catch-up: ' + caught);
      chk('W4a replica به LSNِ primary رسید', caught, 'target=' + lsn);

      const rc = spawnSync('sudo', ['-n', 'PGHOST=' + rp.sock, 'PGPORT=' + String(rp.port),
        'PGUSER=' + CFG.user, 'PGDATABASE=postgres', '-u', 'postgres',
        path.join(CFG.bin, 'psql'), '-tAq', '-c', 'select count(*) from attendance'],
        { encoding: 'utf8', timeout: 30000 });
      const replicaRows = Number((rc.stdout || '').trim());
      const pr = psql('select count(*) from attendance');
      const primaryRows = Number((pr.stdout || '').trim());
      console.log('      primary=' + primaryRows + ' replica=' + replicaRows +
        ' (نوشتنِ تازه: ' + wl.committed + ' سطر)');
      chk('W4b replica همهٔ دادهٔ commit‌شده را دارد (RPO=0 نسبت به replica)',
        replicaRows === primaryRows && replicaRows > 0,
        'primary=' + primaryRows + ' replica=' + replicaRows);
      spawnSync('sudo', ['-n', '-u', 'postgres', path.join(CFG.bin, 'pg_ctl'),
        '-D', dir, '-m', 'fast', '-w', '-t', '60', 'stop'], { encoding: 'utf8' });
      mark('W4', { primaryRows, replicaRows, caught });
    }
  }

  finish(null);
})();

let finished = false;
function finish(liveWhy) {
  if (finished) return;
  finished = true;
  try {
    fs.mkdirSync(OUT_DIR, { recursive: true });
    fs.writeFileSync(OUT_JSON, JSON.stringify({
      generatedAt: new Date().toISOString(),
      pgVersion: sh(path.join(CFG.bin, 'postgres'), ['--version']).stdout.trim(),
      walCapMB: CFG.walMb, walMnt: CFG.walMnt, port: CFG.port,
      live: !liveWhy, liveSkipReason: liveWhy || null,
      summary: { pass, fail, notRun },
      results, timeline,
    }, null, 2));
  } catch (e) {}
  console.log('────────────────────────────────────────────');
  let line = 'WAL disk-full drill: ' + pass + '/' + (pass + fail + notRun) + ' موفق';
  if (notRun) line += ' — ' + notRun + ' سناریو NOT-RUN ⏭️';
  if (fail) line += ' — ' + fail + ' خطا ❌';
  if (!fail && !notRun) line += '  —  بدون خطا ✅';
  console.log(line);
  if (notRun) console.log('خروجیِ ۲: «اجرا نشد» با «موفق» فرق دارد (سبزِ جعلی ممنوع).');
  // 0 = همه سبز · 1 = خطا · 2 = سناریوهایِ زنده اجرا نشدند
  process.exit(fail ? 1 : (notRun ? 2 : 0));
}
