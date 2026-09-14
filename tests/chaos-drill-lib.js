#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   chaos-drill-lib.js — هارنسِ مشترکِ drillهای آشوب (چت ۵، P0-5)

   زیرساختِ واقعی را بالا می‌آورد:
     • PostgreSQL 17 واقعی (initdb + pg_ctl؛ دیتابیسِ تازه در هر drill)
     • Redis واقعی (redis-server با پورتِ آزاد)
     • یک نمونهٔ API (node server/index.js) با PG/Redis وصل
   و ابزارهای سنجش می‌دهد: http با jar، login، ack-write، readiness/liveness،
   متریک‌های Prometheus، sha256، سنجشِ زمان.

   قواعد:
     • اگر باینری‌های PG/Redis نبود ⇒ NOT-RUN با exit 2 (سبزِ جعلی ممنوع).
     • هیچ داده‌ای از server/data/ دست‌کاری نمی‌شود؛ کپیِ store در tmp.
     • همه‌چیز در mkdtemp و در پایان پاک می‌شود.
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const net = require('net');
const crypto = require('crypto');
const { spawn, execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const PG_BIN = process.env.CHAOS_PG_BIN || '/usr/lib/postgresql/17/bin';
const pgBin = (n) => path.join(PG_BIN, n);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sha256 = (b) => crypto.createHash('sha256').update(b).digest('hex');
const sha256File = (p) => sha256(fs.readFileSync(p));
const nowIso = () => new Date().toISOString();

/* رازهای drill در زمانِ اجرا ساخته می‌شوند (هیچ رشتهٔ شبه‌کلیدی در مخزن نمی‌ماند).
   ثابت در طولِ یک اجرا ⇒ ری‌استارتِ نمونهٔ API داخلِ همان drill، نشست را حفظ می‌کند. */
const CHAOS_JWT_SECRET = crypto.randomBytes(32).toString('hex');
const CHAOS_METRICS_TOKEN = crypto.randomBytes(24).toString('hex');

function have(bin) {
  try { execFileSync('sh', ['-c', 'command -v ' + bin], { stdio: 'ignore' }); return true; } catch (e) { return false; }
}
function infraAvailable() {
  return { postgres: fs.existsSync(pgBin('initdb')), redis: have('redis-server'), redisCli: have('redis-cli') };
}
/** آیا این محیط tmpfs نصب می‌کند؟ (فشارِ دیسک به آن نیاز دارد) */
function canMountTmpfs() {
  try {
    const probe = fs.mkdtempSync(path.join(os.tmpdir(), 'chaos-mnt-'));
    execFileSync('sudo', ['-n', 'mount', '-t', 'tmpfs', '-o', 'size=4m', 'tmpfs', probe], { stdio: 'ignore' });
    execFileSync('sudo', ['-n', 'umount', '-l', probe], { stdio: 'ignore' });
    fs.rmSync(probe, { recursive: true, force: true });
    return true;
  } catch (e) { return false; }
}
function notRun(reason) {
  console.log('\n' + '─'.repeat(66));
  console.log('NOT-RUN: ' + reason);
  console.log('INFRA_REQUIRED: postgresql-17 (initdb/pg_ctl) + redis-server');
  console.log('─'.repeat(66));
  process.exit(2);
}

/* ── پورتِ آزاد ─────────────────────────────────────────────────── */
function freePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.on('error', reject);
    s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); });
  });
}
function waitPort(port, timeoutMs) {
  const t0 = Date.now();
  return new Promise((resolve, reject) => {
    (function attempt() {
      const s = net.connect({ port, host: '127.0.0.1' });
      s.on('connect', () => { s.destroy(); resolve(Date.now() - t0); });
      s.on('error', () => {
        s.destroy();
        if (Date.now() - t0 > timeoutMs) return reject(new Error('port ' + port + ' not open in ' + timeoutMs + 'ms'));
        setTimeout(attempt, 50);
      });
    })();
  });
}

/* ── پروکسیِ TCP برای تزریقِ خرابیِ شبکه (بدیلِ tc netem که در این سندباکس نیست)
   حالت‌ها:
     passthrough : عبورِ سالم
     delay       : تأخیرِ ms پیش از رساندنِ درخواست به سرور
     abort       : بستنِ اتصال پیش از رسیدنِ درخواست (سرور هرگز آن را نمی‌بیند)
     swallow     : رساندنِ درخواست به سرور ولی بلعیدنِ پاسخ (کلاینت timeout می‌خورد
                   در حالی که سرور درخواست را اعمال کرده — سناریوی کلاسیکِ
                   «timeout ولی اعمال‌شده» برای سنجشِ idempotency)
   شاهدها: شمارِ اتصال/قطع/بلع — تا تزریق قابلِ اثبات باشد، نه ادعا. */
function startProxy(targetPort) {
  const st = { mode: 'passthrough', delayMs: 0, connections: 0, aborted: 0, swallowed: 0, delayed: 0, forwarded: 0 };
  const srv = net.createServer((client) => {
    st.connections++;
    const up = net.connect({ port: targetPort, host: '127.0.0.1' });
    let buffered = [], mode = st.mode, delayMs = st.delayMs, flushed = false;
    const flush = () => { if (flushed) return; flushed = true; buffered.forEach((b) => up.write(b)); buffered = []; };
    client.on('data', (chunk) => {
      mode = st.mode;
      if (mode === 'abort') { st.aborted++; client.destroy(); up.destroy(); return; }
      if (mode === 'delay') {
        buffered.push(chunk);
        if (!flushed) { st.delayed++; setTimeout(flush, st.delayMs); }
        return;
      }
      st.forwarded++;
      up.write(chunk);
    });
    up.on('data', (chunk) => { if (st.mode === 'swallow') { st.swallowed++; return; } if (!client.destroyed) client.write(chunk); else {} });
    up.on('error', () => { try { client.destroy(); } catch (e) {} });
    client.on('error', () => { try { up.destroy(); } catch (e) {} });
    client.on('close', () => { try { up.destroy(); } catch (e) {} });
    up.on('close', () => { try { client.destroy(); } catch (e) {} });
  });
  return new Promise((resolve) => {
    srv.listen(0, '127.0.0.1', () => {
      resolve({
        port: srv.address().port, state: st,
        setMode(m, ms) { st.mode = m; if (ms) st.delayMs = ms; },
        stop() { try { srv.close(); } catch (e) {} }
      });
    });
  });
}

/* ── HTTP با jar و مهلت ─────────────────────────────────────────── */
function httpReq(port, method, p, body, opts) {
  opts = opts || {};
  const jar = opts.jar;
  const timeoutMs = opts.timeoutMs || 10000;
  return new Promise((resolve) => {
    const t0 = Date.now();
    const data = body == null ? null : JSON.stringify(body);
    const headers = { 'Content-Type': 'application/json' };
    if (jar) headers['Cookie'] = jar.headers().join('; ');
    if (opts.bearer) headers['Authorization'] = 'Bearer ' + opts.bearer;
    if (opts.headers) Object.assign(headers, opts.headers);
    const req = http.request({ hostname: '127.0.0.1', port, path: p, method, headers }, (res) => {
      let b = '';
      res.on('data', (d) => (b += d));
      res.on('end', () => {
        if (jar) jar.absorb(res.headers);
        let j = null; try { j = JSON.parse(b); } catch (e) {}
        resolve({ status: res.statusCode, headers: res.headers, json: j, raw: b, ms: Date.now() - t0, error: null });
      });
    });
    req.setTimeout(timeoutMs, () => { req.destroy(new Error('client_timeout')); });
    req.on('error', (e) => resolve({ status: 0, headers: {}, json: null, raw: '', ms: Date.now() - t0, error: e.message }));
    if (data) req.write(data);
    req.end();
  });
}
function makeJar() {
  const jar = {};
  return {
    headers() { return Object.keys(jar).map((k) => k + '=' + jar[k]); },
    absorb(h) {
      const sc = h['set-cookie'];
      if (!sc) return;
      sc.forEach((c) => {
        const pair = c.split(';')[0];
        const i = pair.indexOf('=');
        if (i > 0) jar[pair.slice(0, i).trim()] = pair.slice(i + 1).trim();
      });
    }
  };
}

/* ── صبرِ شرطی: اولین لحظه‌ای که شرط برقرار شود (زمانِ سپری‌شده برمی‌گردد) ── */
async function until(fn, { timeoutMs = 30000, stepMs = 20, label = '' } = {}) {
  const t0 = Date.now();
  for (;;) {
    let ok = false, extra = null;
    try { const r = await fn(); ok = !!(r && r.ok !== undefined ? r.ok : r); extra = (r && r.extra) || null; } catch (e) { extra = e.message; }
    if (ok) return { ok: true, ms: Date.now() - t0, extra };
    if (Date.now() - t0 > timeoutMs) return { ok: false, ms: Date.now() - t0, extra: extra || (label ? label + ' timeout' : 'timeout') };
    await sleep(stepMs);
  }
}

/* ── psql/redis-cli ─────────────────────────────────────────────── */
function psql(pgPort, sql, { db = 'payesh', timeout = 30000 } = {}) {
  try {
    return execFileSync(pgBin('psql'), ['-h', '127.0.0.1', '-p', String(pgPort), '-U', 'postgres', '-d', db, '-tA', '-c', sql],
      { encoding: 'utf8', timeout }).trim();
  } catch (e) { return 'ERR:' + String((e.stderr || e.message) || '').trim().slice(0, 200); }
}
function redisCli(port, args, timeout = 15000) {
  try {
    return execFileSync('redis-cli', ['-p', String(port)].concat(args), { encoding: 'utf8', timeout }).trim();
  } catch (e) { return 'ERR:' + String(e.message || '').slice(0, 200); }
}

/* ── پاک‌سازیِ یتیم‌های اجراهای قبلی ──────────────────────────────
   چرا نه pkill -f: الگویِ regex روی کلِ cmdline می‌افتد و رشته‌های نامرتبط
   (مثل نامِ همین اسکریپت در خطِ فرمان) را هم می‌گیرد ⇒ خودکشی. اینجا
   مستقیم /proc خوانده می‌شود و فقط پروسه‌های postgres/redis-server که
   مسیرِ دادهٔ chaos-drill دارند کشته می‌شوند. */
function sweepOrphans() {
  let killed = 0;
  let pids = [];
  try { pids = fs.readdirSync('/proc').filter((n) => /^\d+$/.test(n)); } catch (e) { return 0; }
  for (const pid of pids) {
    if (Number(pid) === process.pid) continue;
    let cmd = '';
    try { cmd = fs.readFileSync('/proc/' + pid + '/cmdline', 'utf8').replace(/\0/g, ' '); } catch (e) { continue; }
    /* فقط اگر «فایلِ اجراییِ» پروسه واقعاً postgres/redis-server باشد
       (نخستین توکنِ cmdline) — نه متنی که تصادفاً در خطِ فرمانِ پروسه‌های دیگر آمده. */
    const exe = cmd.trim().split(' ')[0] || '';
    const base = exe.split('/').pop();
    const isPg = base === 'postgres' && cmd.includes('/tmp/chaos-drill-') && cmd.includes('pgdata');
    const isRd = base === 'redis-server' && cmd.includes('/tmp/chaos-drill-');
    /* node یتیمِ API: cmdline شاملِ server/index.js و cwd داخلِ دایرکتوریِ drill */
    let isApi = false;
    if ((base === 'node' || base === 'sh') && cmd.includes('server/index.js')) {
      /* محیطِ پروسهٔ API حاویِ PAYESH_STORE/DATABASE_URL با مسیرِ drill است — نشانهٔ قطعی */
      try { isApi = fs.readFileSync('/proc/' + pid + '/environ', 'utf8').includes('/tmp/chaos-drill-'); } catch (e) { isApi = false; }
    }
    if (isPg || isRd || isApi) { try { process.kill(Number(pid), 'SIGKILL'); killed++; } catch (e) {} }
  }
  if (killed) console.log('[cleanup] ' + killed + ' پروسهٔ یتیمِ اجراهای قبلی کشته شد');
  return killed;
}

/* ── تبدیلِ مقدارِ store به literalِ امنِ SQL (نوع‌آگاه) ───────────
   psql -c پارامتر نمی‌پذیرد؛ پس literal می‌سازیم و کوتیشن‌ها را
   دوبرابر می‌کنیم ('' ) — نه چسباندنِ رشتهٔ خام. */
function litForPg(v, dataType) {
  if (v === null || v === undefined) return 'NULL';
  const t = String(dataType || '').toLowerCase();
  const q = (s) => "'" + String(s).replace(/'/g, "''") + "'";
  if (typeof v === 'object') { const j = JSON.stringify(v); return /json/.test(t) ? q(j) + '::' + t : q(j); }
  if (t === 'boolean') return (v === true || v === 1 || v === '1' || v === 'true') ? 'TRUE' : 'FALSE';
  if (/int|numeric|real|double|decimal/.test(t)) { const n = Number(v); return Number.isFinite(n) ? String(n) : 'NULL'; }
  if (typeof v === 'boolean') return q(v ? 'true' : 'false');
  return q(v);
}
const serializeForPg = litForPg;

/* ═══ زیرساخت ═════════════════════════════════════════════════════ */
class Infra {
  constructor() { this.dir = null; this.pg = null; this.redisProc = null; this.diskMounted = false; this.diskDir = null; }
  static async start(opts = {}) {
    const ia = infraAvailable();
    if (!ia.postgres || !ia.redis) notRun('باینریِ PostgreSQL/Redis در دسترس نیست (' + JSON.stringify(ia) + ')');
    sweepOrphans();
    const it = new Infra();
    it.stopped = false;
    it.dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chaos-drill-'));
    it.pgPort = opts.pgPort || await freePort();
    it.redisPort = opts.redisPort || await freePort();
    /* disk: { mount:true, sizeMb } ⇒ دادهٔ PG/استور/آدیت روی یک tmpfs با اندازهٔ محدود
       نصب می‌شود تا فشارِ دیسک (ENOSPC) واقعاً تزریق‌شدنی باشد. */
    let base = it.dir;
    if (opts.disk && opts.disk.mount) {
      base = path.join(it.dir, 'disk');
      fs.mkdirSync(base, { recursive: true });
      execFileSync('sudo', ['-n', 'mount', '-t', 'tmpfs', '-o', 'size=' + (opts.disk.sizeMb || 300) + 'm', 'tmpfs', base], { stdio: 'ignore' });
      it.diskMounted = true;
      it.diskDir = base;
      console.log('[disk] tmpfs نصب شد روی ' + base + ' (size=' + (opts.disk.sizeMb || 300) + 'MB) — free=' + it.diskFreeKb() + 'KB');
    }
    it.pgData = path.join(base, 'pgdata');
    it.pgLog = path.join(base, 'pg.log');
    it.storeFile = path.join(base, 'payesh.json');
    it.auditFile = path.join(base, 'audit.log');
    it.keyFile = path.join(base, 'jwt.key');
    it.schemaLog = path.join(it.dir, 'schema.log');

    // تجهیزِ دیتابیس
    execFileSync(pgBin('initdb'), ['-D', it.pgData, '-U', 'postgres', '--auth=trust', '-E', 'UTF8', '--locale=C'], { stdio: 'ignore' });
    fs.appendFileSync(path.join(it.pgData, 'postgresql.conf'),
      '\nport=' + it.pgPort + "\nlisten_addresses='127.0.0.1'\nunix_socket_directories='" + it.dir + "'\nmax_connections=40\nlog_line_prefix='%m [%p] '\n" +
      /* ردپای حافظهٔ کوچک: سندباکس ~۲GB دارد؛ fsync دست‌نخورده و ایمنیِ دوام حفظ می‌شود. */
      'shared_buffers=32MB\nmin_wal_size=32MB\nmax_wal_size=48MB\ncheckpoint_timeout=60s\n');
    execFileSync(pgBin('pg_ctl'), ['-D', it.pgData, '-l', it.pgLog, '-w', '-t', '40', 'start'], { stdio: 'ignore' });
    execFileSync(pgBin('createdb'), ['-h', '127.0.0.1', '-p', String(it.pgPort), '-U', 'postgres', 'payesh']);

    // اسکیما + مهاجرت‌ها (مسیر رسمی)
    const log = [];
    const runSql = (file) => {
      const r = execFileSync('sh', ['-c', 'psql -h 127.0.0.1 -p ' + it.pgPort + ' -U postgres -d payesh -v ON_ERROR_STOP=0 -f ' + JSON.stringify(file) + ' 2>&1 || true'],
        { encoding: 'utf8', timeout: 60000 });
      const errs = r.split('\n').filter((l) => /ERROR|FATAL/.test(l));
      if (errs.length) log.push(path.basename(file) + ': ' + errs.slice(0, 2).join(' | '));
    };
    runSql(path.join(ROOT, 'server/schema.sql'));
    const migs = fs.readdirSync(path.join(ROOT, 'migrations')).filter((f) => f.endsWith('.sql') && !f.endsWith('.down.sql')).sort();
    for (const m of migs) runSql(path.join(ROOT, 'migrations', m));
    fs.writeFileSync(it.schemaLog, log.join('\n'));
    // جدول‌های الزامی برای drill
    if (psql(it.pgPort, "SELECT to_regclass('server_outbox')") !== 'server_outbox') psql(it.pgPort, 'CREATE TABLE server_outbox (id BIGSERIAL PRIMARY KEY, type TEXT, collection TEXT, record_id BIGINT, actor_id BIGINT, version BIGINT, payload JSONB, status TEXT DEFAULT \'pending\', created_at TIMESTAMPTZ DEFAULT NOW());');
    if (psql(it.pgPort, "SELECT to_regclass('payesh_outbox_id_seq')") !== 'payesh_outbox_id_seq') psql(it.pgPort, 'CREATE SEQUENCE payesh_outbox_id_seq');

    // Redis
    it.redisDir = path.join(it.dir, 'redis');
    fs.mkdirSync(it.redisDir, { recursive: true });
    it.redisProc = spawn('redis-server', ['--port', String(it.redisPort), '--dir', it.redisDir, '--save', '', '--appendonly', 'no', '--daemonize', 'no'],
      { stdio: 'ignore', detached: false });
    await waitPort(it.redisPort, 15000);

    // کپیِ seed store (server/data دست‌نخورده می‌ماند)
    const seed = path.join(ROOT, 'server/data/payesh.json');
    if (!fs.existsSync(seed)) throw new Error('seed store نیست: ' + seed + ' — اول `node server/seed.js` را اجرا کنید');
    fs.copyFileSync(seed, it.storeFile);
    it.pids = { pg: 0, redis: it.redisProc.pid };
    it.installCleanup();
    return it;
  }
  store() { return JSON.parse(fs.readFileSync(this.storeFile, 'utf8')); }
  psql(sql) { return psql(this.pgPort, sql); }
  redis(args) { return redisCli(this.redisPort, args); }

  /* ── seedِ PG از store ─────────────────────────────────────────
     چرا لازم است: با DATABASE_URL، سرور store را از PG هیدرات می‌کند
     (index.js: «PG is authoritative — replace store domain collections»).
     پس برای سناریوهای PG-live باید کالکشن‌های لازم در PG باشند.
     فقط کالکشن‌های لازم seed می‌شوند (سرعت + کمترین سطح). */
  seedPg(collections) {
    const st = this.store();
    const report = {};
    for (const coll of collections) {
      const rows = Array.isArray(st[coll]) ? st[coll] : [];
      if (this.psql("SELECT to_regclass('" + coll + "')") !== coll) { report[coll] = 'no-table'; continue; }
      const colsRaw = this.psql("SELECT column_name||':'||data_type FROM information_schema.columns WHERE table_name='" + coll + "' ORDER BY ordinal_position");
      const cols = colsRaw.split('\n').filter(Boolean).map((l) => l.split(':'));
      const typeOf = {};
      cols.forEach((c) => { typeOf[c[0]] = c[1]; });
      let inserted = 0, errors = 0;
      for (let i = 0; i < rows.length; i += 100) {
        const chunk = rows.slice(i, i + 100);
        const used = cols.map((c) => c[0]).filter((n) => chunk.some((r) => r[n] !== undefined));
        if (!used.length) continue;
        const tuples = chunk.map((r) => '(' + used.map((n) => litForPg(r[n], typeOf[n])).join(',') + ')');
        const sql = 'INSERT INTO ' + coll + ' ("' + used.join('","') + '") VALUES ' + tuples.join(',') + ' ON CONFLICT DO NOTHING';
        const out = this.psql(sql);
        if (out.startsWith('ERR:')) { errors++; if (errors === 1) report[coll + '_err'] = out.slice(4, 110); } else inserted += chunk.length;
      }
      /* توالیِ ستونِ id را جلو ببر (INSERT با idِ صریح آن را جلو نمی‌برد) —
         وگرنه نوشت‌های بعدیِ اپ به تصادمِ کلیدِ اصلی می‌خورند. */
      this.psql("SELECT setval(pg_get_serial_sequence('" + coll + "','id'), COALESCE((SELECT MAX(id) FROM " + coll + "),1))");
      report[coll] = inserted + '/' + rows.length + (errors ? ' (' + errors + ' chunk-err)' : '');
    }
    return report;
  }
  stopRedis(mode) {
    // mode: 'shutdown' (خاموشیِ تمیزِ واقعی) | 'kill9'
    if (!this.redisProc) return;
    try {
      if (mode === 'kill9') process.kill(this.redisProc.pid, 'SIGKILL');
      else redisCli(this.redisPort, ['shutdown', 'nosave']);
    } catch (e) {}
  }
  async startRedisAgain() {
    this.redisDir = this.redisDir || path.join(this.dir, 'redis');
    this.redisProc = spawn('redis-server', ['--port', String(this.redisPort), '--dir', this.redisDir, '--save', '', '--appendonly', 'no', '--daemonize', 'no'], { stdio: 'ignore' });
    await waitPort(this.redisPort, 15000);
  }
  /* ── ابزارهای فشارِ دیسک ─────────────────────────────────────── */
  diskFreeKb() {
    try { return Number(execFileSync('df', ['--output=avail', '-k', this.diskDir], { encoding: 'utf8' }).trim().split('\n').pop().trim()); }
    catch (e) { return null; }
  }
  /** پر کردنِ tmpfs تا وقتی که فقط targetKb آزاد بماند (با fallocate) */
  fillDiskToFreeKb(targetKb) {
    const free = this.diskFreeKb();
    if (free == null) return { ok: false, error: 'df failed' };
    const allocKb = free - targetKb;
    if (allocKb <= 0) return { ok: true, allocatedKb: 0, freeKb: free };
    this.filler = path.join(this.diskDir, 'filler.bin');
    execFileSync('fallocate', ['-l', allocKb + 'K', this.filler], { stdio: 'ignore' });
    return { ok: true, allocatedKb: allocKb, freeKb: this.diskFreeKb() };
  }
  clearDiskFiller() {
    try { if (this.filler && fs.existsSync(this.filler)) fs.unlinkSync(this.filler); } catch (e) {}
    return this.diskFreeKb();
  }
  pgStop(mode) { execFileSync(pgBin('pg_ctl'), ['-D', this.pgData, '-m', mode || 'fast', 'stop'], { stdio: 'ignore' }); return this; }
  pgStart() { execFileSync(pgBin('pg_ctl'), ['-D', this.pgData, '-l', this.pgLog, '-w', '-t', '40', 'start'], { stdio: 'ignore' }); return this; }
  pgRunning() { try { return execFileSync(pgBin('pg_ctl'), ['-D', this.pgData, 'status'], { stdio: 'ignore', timeout: 5000 }) === Buffer.alloc(0) || true; } catch (e) { return false; } }
  /** ثبتِ پاک‌سازیِ خودکار (تا کشته‌شدنِ drill، tmpfs/پروسه یتیم نگذارد) */
  installCleanup() {
    const self = this;
    const run = () => { try { self.stop(); } catch (e) {} };
    process.once('exit', run);
    process.once('SIGTERM', () => { run(); process.exit(143); });
    process.once('SIGINT', () => { run(); process.exit(130); });
    return this;
  }
  stop() {
    if (this.stopped) return this;
    this.stopped = true;
    try { if (this.redisProc && !this.redisProc.killed) this.redisProc.kill('SIGKILL'); } catch (e) {}
    try { if (fs.existsSync(path.join(this.pgData, 'postmaster.pid'))) this.pgStop('immediate'); } catch (e) {}
    try { if (this.diskMounted) execFileSync('sudo', ['-n', 'umount', '-l', this.diskDir], { stdio: 'ignore' }); } catch (e) {}
    try { fs.rmSync(this.dir, { recursive: true, force: true }); } catch (e) {}
  }
}

/* ═══ نمونهٔ API ══════════════════════════════════════════════════ */
function apiEnv(infra, extra) {
  return Object.assign({
    PORT: null, HOST: '127.0.0.1',
    PAYESH_STORE: infra.storeFile,
    PAYESH_AUDIT: infra.auditFile,
    PAYESH_KEY: infra.keyFile,
    PAYESH_DEMO_CODE: '1',
    PAYESH_JWT_SECRET: CHAOS_JWT_SECRET,
    PAYESH_METRICS_TOKEN: CHAOS_METRICS_TOKEN,
    PAYESH_ENV: 'production',
    PAYESH_BEHIND_PROXY: '1',
    NODE_ENV: 'production',
    DATABASE_URL: 'postgres://postgres@127.0.0.1:' + infra.pgPort + '/payesh',
    REDIS_URL: 'redis://127.0.0.1:' + infra.redisPort,
    PAYESH_WORKER_INTERVAL_MS: '200',
    PAYESH_WORKER_MAX_RETRIES: '3',
    PAYESH_TEST_SLOW_MS: '5000'
  }, extra || {});
}
/**
 * @param {object} opts { infra, extraEnv, supervisor } supervisor=true ⇒ حلقهٔ پوسته (auto-restart)
 */
async function startApi(opts) {
  const infra = opts.infra;
  const port = await freePort();
  const env = apiEnv(infra, Object.assign({ PORT: String(port) }, opts.extraEnv || {}));
  const logFile = path.join(infra.dir, 'api-' + port + '.log');
  const out = fs.openSync(logFile, 'a');
  const cmd = opts.supervisor
    ? 'while :; do ' + JSON.stringify(process.execPath) + ' server/index.js; echo "[supervisor] api exited rc=$? at $(date -u +%H:%M:%S.%3N)"; sleep 0.05; done'
    : JSON.stringify(process.execPath) + ' server/index.js';
  /* detached:true ⇒ گروهِ پروسهٔ مستقل؛ با kill(-pid) هم پوسته و هم node کشته می‌شوند
     (وگرنه sh می‌مرد و node یتیم می‌ماند — نشتیِ مشاهده‌شده در باتریِ اول). */
  const proc = spawn('sh', ['-c', cmd], { cwd: ROOT, env, stdio: ['ignore', out, out], detached: true });
  const api = {
    port, proc, logFile, pid: null, startedAt: nowIso(),
    logs() { try { return fs.readFileSync(logFile, 'utf8'); } catch (e) { return ''; } },
    async waitReady(timeoutMs) {
      const r = await until(async () => {
        const l = await httpReq(port, 'GET', '/api/liveness', null, { timeoutMs: 1500 });
        if (l.status === 200 && l.json && l.json.pid) { api.pid = l.json.pid; return true; }
        return false;
      }, { timeoutMs: timeoutMs || 25000, stepMs: 50, label: 'liveness' });
      return r;
    },
    /** PID واقعیِ node از /api/liveness (نه pid پوستهٔ supervisor) */
    async currentNodePid() {
      const l = await httpReq(port, 'GET', '/api/liveness', null, { timeoutMs: 1500 });
      if (l.status === 200 && l.json && l.json.pid) { api.pid = l.json.pid; return l.json.pid; }
      return null;
    },
    kill9(pid) { try { process.kill(pid || api.pid, 'SIGKILL'); return true; } catch (e) { return false; } },
    stop() { try { process.kill(-proc.pid, 'SIGKILL'); } catch (e) {} try { proc.kill('SIGKILL'); } catch (e) {} }
  };
  const r = await api.waitReady(opts.timeoutMs || 25000);
  if (!r.ok) { api.stop(); throw new Error('API بالا نیامد (' + r.ms + 'ms) — لاگ: ' + api.logs().slice(-1200)); }
  return api;
}

/* ── لاگین با کوکی (send-code → demo_code → login) ──────────────── */
async function loginAs(port, user) {
  const jar = makeJar();
  const s = await httpReq(port, 'POST', '/api/auth/send-code', { phone: user.phone }, { jar, timeoutMs: 10000 });
  const code = (s.json && (s.json.demo_code || (s.json.data && s.json.data.demo_code))) || null;
  const l = await httpReq(port, 'POST', '/api/auth/login', { phone: user.phone, code: String(code || ''), national_id: user.national_id }, { jar, timeoutMs: 10000 });
  return { jar, send: s, login: l, ok: l.status === 200 };
}

/* ── خوانش‌های عملیاتی ─────────────────────────────────────────── */
const readiness = (port, t) => httpReq(port, 'GET', '/api/readiness', null, { timeoutMs: t || 3000 });
const liveness = (port, t) => httpReq(port, 'GET', '/api/liveness', null, { timeoutMs: t || 3000 });
const health = (port, t) => httpReq(port, 'GET', '/api/health', null, { timeoutMs: t || 4000 });
async function metricsText(port) {
  const r = await httpReq(port, 'GET', '/metrics', null, { bearer: CHAOS_METRICS_TOKEN, timeoutMs: 5000 });
  return r.status === 200 ? r.raw : '';
}
/** مقدار یک سریِ Prometheus از متنِ متریک‌ها */
function metricValue(text, name, labels) {
  const re = new RegExp('^' + name + '(\\{[^}]*\\})?\\s+([0-9.eE+-]+)$', 'gm');
  let m, sum = 0, found = false;
  while ((m = re.exec(text)) !== null) {
    if (!labels || !m[1] || Object.keys(labels).every((k) => m[1].includes(k + '="' + labels[k] + '"'))) { sum += Number(m[2]); found = true; }
  }
  return found ? sum : null;
}

/* ── نوشتِ ack‌شدهٔ sync ──────────────────────────────────────── */
function mkOp(spec) {
  const seq = (mkOp._s = (mkOp._s || 0) + 1);
  return {
    uid: spec.uid || ('chaos-' + process.pid + '-' + Date.now() + '-' + seq),
    c: spec.collection, t: spec.type, id: spec.id == null ? null : spec.id,
    data: spec.data || {}, by: spec.by, at: new Date().toISOString()
  };
}
async function syncWrite(port, jar, spec, timeoutMs) {
  const op = mkOp(spec);
  const r = await httpReq(port, 'POST', '/api/sync', { ops: [op] }, { jar, timeoutMs: timeoutMs || 12000 });
  const applied = r.status === 200 && !(r.json && r.json.errors && r.json.errors.length);
  return { op, status: r.status, json: r.json, ms: r.ms, error: r.error, acked: applied, raw: r.raw.slice(0, 400) };
}
async function syncBatch(port, jar, specs, timeoutMs) {
  const ops = specs.map(mkOp);
  const r = await httpReq(port, 'POST', '/api/sync', { ops }, { jar, timeoutMs: timeoutMs || 15000 });
  return { ops, status: r.status, json: r.json, ms: r.ms, error: r.error, raw: r.raw.slice(0, 400) };
}

/* ── لاگِ آدیت: شمارِ رویدادهای مشخص ──────────────────────────── */
function auditCount(infra, needle) {
  try {
    const t = fs.readFileSync(infra.auditFile, 'utf8');
    return t.split('\n').filter((l) => l.includes(needle)).length;
  } catch (e) { return 0; }
}

/* ── گزارشِ نتیجه (ماشین‌خوان + آدم‌خوان) ─────────────────────── */
function report(drill, rows, metrics, verdictNote) {
  const failed = rows.filter((r) => !r.ok);
  console.log('\n' + '─'.repeat(66));
  console.log('RESULT_JSON: ' + JSON.stringify({ drill, verdict: failed.length ? 'FAIL' : 'PASS', checks: rows.length, failed: failed.length, metrics }, null, 0));
  console.log('─'.repeat(66));
  if (failed.length) {
    console.log('VERDICT: FAIL — ' + failed.map((r) => r.name).join(' | '));
    console.log((verdictNote || '') + '');
    process.exit(1);
  }
  console.log('VERDICT: PASS' + (verdictNote ? ' — ' + verdictNote : ''));
  process.exit(0);
}
function check(rows, name, cond, detail) {
  rows.push({ name, ok: !!cond, detail: detail === undefined ? '' : String(detail).slice(0, 300) });
  console.log((cond ? '  ✅ ' : '  ❌ ') + name + (detail !== undefined ? '  —  ' + String(detail).slice(0, 220) : ''));
  return !!cond;
}

module.exports = {
  ROOT, PG_BIN, pgBin, sleep, sha256, sha256File, nowIso, freePort, waitPort, until,
  httpReq, makeJar, psql, redisCli, Infra, startApi, loginAs, startProxy,
  readiness, liveness, health, metricsText, metricValue,
  syncWrite, syncBatch, mkOp, auditCount, report, check, infraAvailable, canMountTmpfs, notRun, serializeForPg,
  CHAOS_JWT_SECRET, CHAOS_METRICS_TOKEN
};
