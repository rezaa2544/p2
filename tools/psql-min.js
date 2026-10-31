#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   tools/psql-min.js — a deliberately SMALL, faithful psql stand-in
   ───────────────────────────────────────────────────────────────────
   Why this exists
     migrations/012_partition_grades_attendance.sql:348 uses
         SELECT w0 FROM mig009_w0 WHERE id = 1 \gset
     `\gset` is a psql META-COMMAND: the server never sees it. Sending the
     file through the `pg` driver therefore dies with
         syntax error at or near "\"
     so the migration — and every suite that applies it — has been NOT-RUN
     on any machine without the psql binary. This closes that gap.

   Scope (intentionally narrow — this is NOT a psql reimplementation)
     Supported : -v NAME=VALUE (repeatable), --quiet/-q, -f FILE, -f - (SQL on
                 stdin), -c COMMAND, positional connection URL (or -d URL),
                 -h/-p/-U/-d overrides, -t/--tuples-only, -A/--no-align,
                 clustered short flags (-tA, -tAq), -w/-X (accepted no-ops:
                 this client never prompts and reads no psqlrc), --version,
                 \gset [prefix], :var / :'var' / :"var" interpolation,
                 BEGIN/COMMIT, DO $$…$$, CREATE PROCEDURE with internal
                 COMMIT, psql-shaped row output, --selftest
     Rejected  : every other meta-command AND every other option (hard fail —
                 silent guessing about what a flag means is how a stand-in
                 starts lying; see "honesty guards")

     M15-01 (2026-10-30): the option set above was widened because the shim's
     stated purpose is "let suites that shell out to psql work on a machine
     without the real binary", and five suites could not: n21-schema-drift,
     n22-hydrate-cap, a35-regression, migration-012-crash-recovery-live and
     wave23-norm-edge-mutations used -h/-p/-U/-d/-t/-A or `-f -` and got a
     GuardError instead of a result. What changed is only the ARGUMENT and
     CONNECTION surface plus row rendering; every guard below still holds, and
     an unknown option or meta-command is still a hard failure.

     TLS policy (explicit, because psql's default is not): sslmode is read from
     the URL, --sslmode, PGSSLMODE, defaulting to `prefer`. `disable` and
     `allow` connect without TLS; `prefer` connects without TLS and retries
     once WITH TLS if the server demands it; `require` forces TLS without
     certificate verification; `verify-ca`/`verify-full` force TLS with
     verification. `prefer` therefore reaches the same *outcome* as psql
     (connection succeeds when the server has no TLS) but does not attempt the
     TLS handshake first — recorded in tools/PSQL_SHIM_GUIDE.md as a deviation.

   Honesty guards (the point of this file)
     G1 an unknown meta-command is a HARD FAILURE, never silently skipped
     G2 an unresolved :var is a HARD FAILURE, never left as literal text
     G3 ON_ERROR_STOP maps a SQL error to exit code 3 (psql's own code)
     G4 :var is NOT interpolated inside comments, single-quoted strings,
        double-quoted identifiers or dollar-quoted bodies
     G5 `::` (the cast operator) is never mistaken for a variable
     G6 \gset requires exactly one row; 0 or >1 rows is an error
     G7 the wrapper tools/bin/psql defers to a real psql found EARLIER in
        PATH, so this shim can never shadow the real binary

   Exit codes: 0 ok · 1 usage/guard violation · 2 NOT-RUN (no DB) · 3 SQL
   error under ON_ERROR_STOP.

   Usage:
     node tools/psql-min.js --selftest
     node tools/psql-min.js -v ON_ERROR_STOP=1 --quiet -f migrations/012_*.sql <url>

   ── Full guide ──────────────────────────────────────────────────────
   See tools/PSQL_SHIM_GUIDE.md for cross-chart usage, the guard table with
   observable symptoms, the verification ledger and the limitations. It lives
   in tools/ (not docs/) because a new docs/*.md is counted by
   tests/docs-freeze-marker.js and would need an rc bump to stay green.

   --selftest output (48 checks: 31 positive, 17 negative), verified:

     $ node tools/psql-min.js --selftest
     psql-min --selftest (pure; no database needed)
       ✅ P1 a ";" inside a single-quoted string does not split
       … P2–P21 (splitting, nesting, interpolation, arg parsing, SQL source)
       ✅ N1 G1 — an unknown meta-command is a hard failure
       … N2–N12 (every guard exercised by a FAILING case)
     psql-min --selftest: 33/33

   Every negative case must exit non-zero — none of them is allowed to skip,
   because a guard that is never exercised by a failing case is not a guard.

   ── Bug history: four real bugs the selftest caught (round 5) ───────
   The first run scored 25/29. Each of these is a trap for the next editor:
     1. \gset is TRAILING in migration 012 ("SELECT … \gset"), not a
        standalone meta-command line — extractMeta had to learn that shape.
     2. :'var' / :"var" need matching before :var, and `::` before both,
        or the cast in 'x'::regclass is eaten as a variable.
     3. The lexer must resolve :'name' BEFORE string lexing; otherwise
        'name' becomes an opaque string and interpolation never sees it.
     4. A meta-command TERMINATES the query buffer. \gset is followed by
        "BEGIN;" in 012, so splitting only on ';' left \gset inside the
        statement — and it reached the server.
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const path = require('path');

const SUPPORTED_META = new Set(['gset']);

/* ── G5/G4: a scanner that knows where SQL text is "real" ─────────────
   Returns a list of segments: { text, interpolatable }. Anything inside a
   comment or a quoted body is emitted as non-interpolatable, so :var can
   never be rewritten there. Block comments nest (PostgreSQL allows it). */
function scanSegments(sql) {
  const segs = [];
  let i = 0;
  let plain = '';
  const pushPlain = () => { if (plain) { segs.push({ text: plain, interp: true }); plain = ''; } };
  const pushOpaque = (t) => { pushPlain(); segs.push({ text: t, interp: false }); };

  while (i < sql.length) {
    const ch = sql[i];
    const two = sql.slice(i, i + 2);

    if (two === '--') {                       /* line comment */
      let j = sql.indexOf('\n', i);
      if (j === -1) j = sql.length;
      pushOpaque(sql.slice(i, j));
      i = j;
      continue;
    }
    if (two === '/*') {                       /* block comment, nestable */
      let depth = 1, j = i + 2;
      while (j < sql.length && depth > 0) {
        if (sql.startsWith('/*', j)) { depth++; j += 2; }
        else if (sql.startsWith('*/', j)) { depth--; j += 2; }
        else j++;
      }
      pushOpaque(sql.slice(i, j));
      i = j;
      continue;
    }
    /* psql resolves :'var' and :"var" BEFORE string lexing, so a quote that
       directly follows a colon is part of a variable reference, not the start
       of a literal. Without this the scanner would swallow 'w0' as an opaque
       string and interpolation would never see it. */
    if ((ch === "'" || ch === '"') && plain.endsWith(':')) {
      const vref = /^(['"])([A-Za-z_][A-Za-z0-9_]*)\1/.exec(sql.slice(i));
      if (vref) { plain += vref[0]; i += vref[0].length; continue; }  /* whole :'name' token */
      /* not a well-formed :'var' — fall through to ordinary string lexing */
    }

    if (ch === "'") {                         /* single-quoted string; '' escapes */
      let j = i + 1;
      while (j < sql.length) {
        if (sql[j] === "'") {
          if (sql[j + 1] === "'") { j += 2; continue; }
          j++; break;
        }
        j++;
      }
      pushOpaque(sql.slice(i, j));
      i = j;
      continue;
    }
    if (ch === '"') {                         /* double-quoted identifier; "" escapes */
      let j = i + 1;
      while (j < sql.length) {
        if (sql[j] === '"') {
          if (sql[j + 1] === '"') { j += 2; continue; }
          j++; break;
        }
        j++;
      }
      pushOpaque(sql.slice(i, j));
      i = j;
      continue;
    }
    /* dollar-quote: $$ or $tag$ — the body is opaque */
    if (ch === '$') {
      const m = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/.exec(sql.slice(i));
      if (m) {
        const tag = m[0];
        const end = sql.indexOf(tag, i + tag.length);
        const j = end === -1 ? sql.length : end + tag.length;
        pushOpaque(sql.slice(i, j));
        i = j;
        continue;
      }
    }
    plain += ch;
    i++;
  }
  pushPlain();
  return segs;
}

/* Split into statements at top-level `;` only. Meta-command lines are
   returned as their own items so the caller can dispatch on them. */
function splitStatements(sql) {
  const out = [];
  let buf = '';
  for (const seg of scanSegments(sql)) {
    if (!seg.interp) { buf += seg.text; continue; }
    for (let k = 0; k < seg.text.length; k++) {
      const ch = seg.text[k];
      /* A line-leading meta-command terminates the query buffer in psql — it
         acts as a statement terminator, NOT as ordinary text. Without this,
         "SELECT w0 … \\gset\nBEGIN;" would be swallowed as one statement and
         the \\gset would reach the server (syntax error at or near "\\"). */
      /* Position does not matter to psql here: a backslash outside quotes and
         comments starts a meta-command wherever it appears, which is why the
         documented idiom "SELECT w0 FROM t WHERE id = 1 \\gset" works. */
      if (ch === '\\' && /[A-Za-z]/.test(seg.text[k + 1] || '')) {
        let nl = seg.text.indexOf('\n', k);
        if (nl === -1) nl = seg.text.length;
        const metaLine = seg.text.slice(k, nl).trim();
        const item = (buf.trim() ? buf.trim() + '\n' : '') + metaLine;
        out.push(item);
        buf = '';
        k = nl - 1;
        continue;
      }
      if (ch === ';') {
        const s = buf.trim();
        if (s) out.push(s);
        buf = '';
      } else buf += ch;
    }
  }
  const tail = buf.trim();
  if (tail) out.push(tail);
  return out;
}

/* A meta-command can appear in two shapes:
     leading  — "\\echo x" is the whole statement
     trailing — "SELECT w0 FROM t WHERE id = 1 \\gset"
   The trailing shape is the one migrations/012 actually uses: \\gset TERMINATES
   the query buffer, so the query is everything before it. A trailing
   backslash-word sitting inside a comment or string must NOT be honoured, so
   only the final INTERPOLATABLE segment is considered. */
function extractMeta(stmt) {
  const lead = /^\s*\\([A-Za-z]+)\b([\s\S]*)$/.exec(stmt);
  if (lead) return { query: '', meta: { name: lead[1], rest: lead[2].trim() } };

  const segs = scanSegments(stmt);
  if (!segs.length) return { query: stmt, meta: null };
  const last = segs[segs.length - 1];
  if (!last.interp) return { query: stmt, meta: null };   /* ends in a comment/string */

  const m = /\s\\([A-Za-z]+)\b(?:[ \t]+(\S+))?[ \t]*$/.exec(last.text);
  if (!m) return { query: stmt, meta: null };
  const before = segs.slice(0, -1).map((x) => x.text).join('') + last.text.slice(0, m.index);
  return { query: before.trim(), meta: { name: m[1], rest: m[2] || '' } };
}

/* kept for callers/tests that only care about the leading shape */
function parseMeta(stmt) {
  return extractMeta(stmt).meta;
}

/* G1: anything we do not faithfully implement is a hard failure. */
function assertSupportedMeta(meta) {
  if (!SUPPORTED_META.has(meta.name)) {
    throw new GuardError('unsupported psql meta-command \\' + meta.name
      + ' — this shim implements only ' + [...SUPPORTED_META].map((s) => '\\' + s).join(', ')
      + '; refusing to skip it silently (use the real psql for that file)');
  }
}

/* G4/G5: interpolate :var only in interpolatable segments. */
function interpolate(segments, vars) {
  let out = '';
  for (const seg of segments) {
    if (!seg.interp) { out += seg.text; continue; }
    /* Order matters: `::` (the cast operator) must be consumed BEFORE a bare
       :name, otherwise `'x'::regclass` would be read as a variable. */
    out += seg.text.replace(
      /::|:'([A-Za-z_][A-Za-z0-9_]*)'|:"([A-Za-z_][A-Za-z0-9_]*)"|:([A-Za-z_][A-Za-z0-9_]*)/g,
      (whole, sq, dq, bare) => {
        if (whole === '::') return '::';                     /* G5 */
        const name = sq || dq || bare;
        if (!(name in vars)) {
          throw new GuardError('unresolved psql variable :' + name
            + ' — refusing to send it to the server as literal text');
        }
        const v = String(vars[name]);
        if (sq) return "'" + v.replace(/'/g, "''") + "'";    /* :'x' → SQL literal */
        if (dq) return '"' + v.replace(/"/g, '""') + '"';    /* :"x" → identifier */
        return v;
      });
  }
  return out;
}

/* G6: psql's \gset requires exactly one row. */
function assertGsetRows(rows, rowCount) {
  if (rowCount === 0) {
    throw new GuardError('\\gset: query returned 0 rows — psql would leave the variables unset, which would later fail as an unresolved :var');
  }
  if (rowCount > 1) {
    throw new GuardError('\\gset: query returned ' + rowCount + ' rows — psql requires exactly one');
  }
  return rows[0];
}

/* منبعِ SQL و مرزِ مسیر — بیرون از run() نشسته تا با --selftest (بدونِ
   دیتابیس) قابلِ اثبات بماند.

   🔴 نقصِ برطرف‌شده (M15-01، ۲۰۲۶-۱۰-۲۳): نسخهٔ پیشین `path.resolve(opts.file)`
   را بی‌شرط صدا می‌زد، حتی وقتی `-c` استفاده می‌شد و `opts.file`-null بود:
     $ node tools/psql-min.js "<dsn>" -c 'SELECT 1;'
     psql-min: The "paths[0]" argument must be of type string. Received null
   یعنی هر مصرف‌کننده‌ای که به `tools/bin/psql` (shimِ همین فایل) اتکا می‌کند —
   یعنی هر ماشینِ بدونِ psqlِ واقعی — روی ساده‌ترین شکلِ `-c` می‌شکست. مرزِ مسیر
   حفظ شده؛ فقط وقتی اعمال می‌شود که واقعاً `-f` داده شده باشد. */
function resolveSqlSource(opts, baseDir, readFile, readStdin) {
  const read = readFile || ((f) => fs.readFileSync(f, 'utf8'));
  const hasFile = opts.file !== null && opts.file !== undefined;
  if (hasFile) {
    /* `-f -` is psql's documented "read the script from stdin". It is not a
       path at all, so the base-directory escape guard below must not run on
       it (it would either reject a legitimate stdin run or try to open a file
       literally named "-"). */
    if (String(opts.file) === '-') {
      const readIn = readStdin || ((() => fs.readFileSync(0, 'utf8')));
      return String(readIn());
    }
    const filePath = path.resolve(baseDir, String(opts.file));
    if (filePath !== baseDir && !filePath.startsWith(baseDir + path.sep)) {
      throw new GuardError('refusing to read file outside the working directory: ' + opts.file);
    }
    return read(filePath);
  }
  return opts.command !== null && opts.command !== undefined ? String(opts.command) : '';
}

const VERSION = '2.0.0';
class GuardError extends Error {}
class SqlError extends Error {}

function truthy(v) {
  return ['1', 'on', 'true', 'yes', 't'].includes(String(v).toLowerCase());
}

/* ── argument parsing ─────────────────────────────────────────────────
   Shape rules, all of them psql's own:
     • a flag and its value may be separate (`-h host`) or joined
       (`-hhost`, `--host=host`);
     • single-letter flags without a value may be clustered (`-tAq`);
     • a cluster may END with a value-taking flag whose value is the next
       argv token (`-tAf script.sql`), which is how psql reads it;
     • anything not in the table below is REFUSED, never guessed. */
const FLAGS_NO_VALUE = { t: 'tuplesOnly', A: 'unaligned', q: 'quiet', w: 'noPassword', X: 'noPsqlrc' };
const LONG_FLAGS_NO_VALUE = {
  '--tuples-only': 'tuplesOnly', '--no-align': 'unaligned', '--quiet': 'quiet',
  '--no-password': 'noPassword', '--no-psqlrc': 'noPsqlrc', '--selftest': 'selftest'
};
const FLAGS_WITH_VALUE = { v: 'var', f: 'file', c: 'command', h: 'host', p: 'port', U: 'user', d: 'dbname', o: 'outFile' };
const LONG_FLAGS_WITH_VALUE = {
  '--file': 'file', '--command': 'command', '--host': 'host', '--port': 'port',
  '--username': 'user', '--dbname': 'dbname', '--variable': 'var', '--pset': 'pset',
  '--sslmode': 'sslmode', '--output': 'outFile'
};

function applyValue(opts, kind, value) {
  if (kind === 'var') {
    if (value === undefined) throw new GuardError('-v requires NAME=VALUE');
    const eq = value.indexOf('=');
    if (eq === -1) opts.vars[value] = ''; else opts.vars[value.slice(0, eq)] = value.slice(eq + 1);
    return;
  }
  if (value === undefined || value === '') throw new GuardError('-' + kind + ' requires a value');
  if (kind === 'file') { opts.file = value; return; }
  if (kind === 'command') { opts.command = value; return; }
  if (kind === 'host') { opts.host = value; return; }
  if (kind === 'port') {
    if (!/^\d+$/.test(value)) throw new GuardError('-p requires a numeric port');
    opts.port = Number(value);
    return;
  }
  if (kind === 'user') { opts.user = value; return; }
  if (kind === 'dbname') {
    /* psql -d accepts a database NAME or a conninfo string. */
    if (/^postgres(ql)?:\/\//i.test(value)) opts.url = value; else opts.dbname = value;
    return;
  }
  if (kind === 'sslmode') {
    const m = String(value).toLowerCase();
    if (!['disable', 'allow', 'prefer', 'require', 'verify-ca', 'verify-full'].includes(m)) {
      throw new GuardError('--sslmode must be one of disable|allow|prefer|require|verify-ca|verify-full');
    }
    opts.sslmode = m;
    return;
  }
  if (kind === 'pset') {
    /* -P pager=off / -P format=unaligned are the two shapes suites use. pager
       is a no-op here (we never page); format is honoured for `unaligned`. */
    const [k, ...rest] = String(value).split('=');
    const v = rest.join('=');
    if (k === 'pager') return;
    if (k === 'format' && v === 'unaligned') { opts.unaligned = true; return; }
    throw new GuardError('-P ' + k + ' is not supported by this shim — refusing to guess');
  }
  if (kind === 'outFile') { opts.outFile = value; return; }
  throw new GuardError('unsupported option kind: ' + kind);
}

function parseArgs(argv) {
  const opts = {
    vars: {}, quiet: false, file: null, url: null, selftest: false, command: null,
    tuplesOnly: false, unaligned: false, host: null, port: null, user: null,
    dbname: null, sslmode: null, outFile: null, version: false
  };
  for (let i = 0; i < argv.length; i++) {
    const a = String(argv[i]);
    if (a === '--selftest') { opts.selftest = true; continue; }
    if (a === '--version' || a === '-V') { opts.version = true; continue; }
    if (a === '-q' || a === '--quiet') { opts.quiet = true; continue; }
    if (a === '--tuples-only') { opts.tuplesOnly = true; continue; }
    if (a === '--no-align') { opts.unaligned = true; continue; }

    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      const name = eq === -1 ? a : a.slice(0, eq);
      if (LONG_FLAGS_NO_VALUE[name] !== undefined) {
        if (eq !== -1) throw new GuardError(name + ' does not take a value');
        opts[LONG_FLAGS_NO_VALUE[name]] = true;
        continue;
      }
      if (LONG_FLAGS_WITH_VALUE[name] !== undefined) {
        applyValue(opts, LONG_FLAGS_WITH_VALUE[name], eq === -1 ? argv[++i] : a.slice(eq + 1));
        continue;
      }
      throw new GuardError('unsupported psql option ' + a + ' — refusing to guess');
    }

    if (a.startsWith('-') && a.length > 1) {
      const letters = a.slice(1).split('');
      for (let j = 0; j < letters.length; j++) {
        const ch = letters[j];
        if (FLAGS_NO_VALUE[ch] !== undefined) { opts[FLAGS_NO_VALUE[ch]] = true; continue; }
        if (FLAGS_WITH_VALUE[ch] !== undefined) {
          const inline = letters.slice(j + 1).join('');
          const value = inline !== '' ? inline : argv[++i];
          applyValue(opts, FLAGS_WITH_VALUE[ch], value);
          j = letters.length;   /* the cluster is consumed by the value-flag */
          continue;
        }
        throw new GuardError('unsupported psql option -' + ch + ' — refusing to guess');
      }
      continue;
    }

    if (opts.url === null) { opts.url = a; continue; }
    throw new GuardError('unexpected extra argument: ' + a);
  }
  return opts;
}

/* ── the real run ─────────────────────────────────────────────────── */
/* ── connection target ────────────────────────────────────────────────
   Precedence, highest first: explicit flags (-h/-p/-U/-d) → the URL →
   PG* environment variables. A URL is parsed here rather than handed to the
   driver so that `sslmode` means exactly one documented thing (see the TLS
   policy in the file header) instead of whatever the driver's query-string
   support happens to do this release. */
function parseConnUrl(raw) {
  const s = String(raw || '');
  if (!/^postgres(ql)?:\/\//i.test(s)) return null;
  let u;
  try { u = new URL(s.replace(/^postgres(ql)?:/i, 'http:')); } catch (e) { return null; }
  const q = u.searchParams;
  return {
    host: u.hostname ? decodeURIComponent(u.hostname) : '',
    port: u.port ? Number(u.port) : undefined,
    user: u.username ? decodeURIComponent(u.username) : '',
    password: u.password ? decodeURIComponent(u.password) : '',
    database: decodeURIComponent(String(u.pathname || '').replace(/^\//, '')),
    sslmode: q.get('sslmode') || ''
  };
}

function buildClientConfig(opts, env) {
  const e = env || process.env;
  const fromUrl = opts.url ? parseConnUrl(opts.url) : null;
  if (opts.url && !fromUrl) throw new GuardError('only postgres:// connection strings are supported');
  const host = opts.host || (fromUrl && fromUrl.host) || e.PGHOST || '';
  const port = opts.port || (fromUrl && fromUrl.port) || (e.PGPORT ? Number(e.PGPORT) : undefined);
  const user = opts.user || (fromUrl && fromUrl.user) || e.PGUSER || '';
  const password = (fromUrl && fromUrl.password) || e.PGPASSWORD || '';
  const database = opts.dbname || (fromUrl && fromUrl.database) || e.PGDATABASE || '';
  if (!host && !database) {
    throw new GuardError('no connection target: pass a postgres:// URL, -d DBNAME (with -h), or PGHOST/PGDATABASE');
  }
  const sslmode = String(opts.sslmode || (fromUrl && fromUrl.sslmode) || e.PGSSLMODE || 'prefer').toLowerCase();
  const cfg = { host: host || undefined, port, user: user || undefined, password, database: database || undefined, connectionTimeoutMillis: 20000 };
  if (sslmode === 'require') cfg.ssl = { rejectUnauthorized: false };
  else if (sslmode === 'verify-ca' || sslmode === 'verify-full') cfg.ssl = true;
  else cfg.ssl = false;   /* disable | allow | prefer (prefer retries with TLS, below) */
  return { cfg, sslmode, wantsTlsRetry: sslmode === 'prefer' };
}

/* psql-shaped row output. In tuples-only mode psql prints bare values; in
   aligned mode it prints a header, a separator and a row-count footer. `-A`
   swaps the padding for a `|` separator and keeps the header. Nothing is
   printed for statements that return no rows. */
function cellText(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object' && !(v instanceof Date)) return JSON.stringify(v);
  if (v instanceof Date) return v.toISOString();
  return String(v);
}

function renderResult(res, opts, write) {
  const out = write || ((s) => process.stdout.write(s));
  const rows = res && Array.isArray(res.rows) ? res.rows : [];
  if (!rows.length) return;
  const cols = (res.fields || []).map((f) => f.name);
  if (opts.unaligned) {
    if (!opts.tuplesOnly) out(cols.join('|') + '\n');
    for (const r of rows) out(cols.map((c) => cellText(r[c])).join('|') + '\n');
  } else {
    const table = [cols].concat(rows.map((r) => cols.map((c) => cellText(r[c]))));
    const width = cols.map((c, i) => Math.max(String(c).length, ...table.slice(1).map((row) => String(row[i]).length)));
    const line = (cells) => cells.map((c, i) => String(c).padEnd(width[i])).join(' | ').replace(/\s+$/, '') + '\n';
    if (!opts.tuplesOnly) {
      out(line(cols));
      out(width.map((w) => '-'.repeat(w)).join('-+-') + '\n');
    }
    for (const row of table.slice(1)) out(line(row));
  }
  if (!opts.quiet && !opts.tuplesOnly) out('(' + rows.length + (rows.length === 1 ? ' row' : ' rows') + ')\n');
}

async function run(opts) {
  let pg;
  try { pg = require('pg'); }
  catch (e) { throw new GuardError('pg driver not resolvable — set NODE_PATH to a node_modules containing pg'); }

  /* 🔴 مرزِ مسیر: -f FILE نسبت به دایرکتوریِ اجرایِ ابزار حل می‌شود و باید
     داخلِ همان دایرکتوری بماند (استفادهٔ مستند: -f migrations/NNN_name.sql).
     resolve + بررسیِ مالک، انحراف از مسیرِ پایه را غیرممکن می‌کند. */
  /* psql: "If neither -c nor -f is specified, psql reads from standard input."
     This shim used to hard-fail that shape, which made every caller that pipes
     a script (`psql <url> -q < script.sql`) look like a broken client. A TTY
     would block forever waiting for input, so an interactive invocation with
     no source stays a guard error instead of hanging. */
  if ((opts.file === null || opts.file === undefined) && (opts.command === null || opts.command === undefined)) {
    if (process.stdin.isTTY) throw new GuardError('nothing to execute (need -f FILE, -c COMMAND, or SQL on stdin)');
    opts.command = fs.readFileSync(0, 'utf8');
  }
  const sql = resolveSqlSource(opts, path.resolve('.'));
  if (!sql) throw new GuardError('nothing to execute (need -f FILE or -c COMMAND)');

  const built = buildClientConfig(opts);
  const client = new pg.Client(built.cfg);
  try {
    await client.connect();
  } catch (e) {
    if (built.wantsTlsRetry) {
      /* sslmode=prefer: psql would have negotiated TLS first and fallen back.
         Here the plain attempt ran first; retry once WITH TLS before calling
         this a connection failure, so a TLS-only server still works. */
      try {
        const retry = new pg.Client(Object.assign({}, built.cfg, { ssl: { rejectUnauthorized: false } }));
        await retry.connect();
        built.cfg.ssl = { rejectUnauthorized: false };
        Object.assign(client, retry);
      } catch (e2) {
        const err = new Error('cannot connect: ' + e.message + ' (TLS retry: ' + e2.message + ')');
        err.notRun = true;
        throw err;
      }
    } else {
      const err = new Error('cannot connect: ' + e.message);
      err.notRun = true;
      throw err;
    }
  }

  const vars = Object.assign({}, opts.vars);
  const onErrorStop = truthy(vars.ON_ERROR_STOP);
  const stmts = splitStatements(sql);
  let n = 0;

  try {
    for (const stmt of stmts) {
      const ex = extractMeta(stmt);
      if (ex.meta) {
        const meta = ex.meta;
        assertSupportedMeta(meta);
        const qText = ex.query;
        const prefix = meta.rest || '';
        if (!qText) throw new GuardError('\\' + meta.name + ' with no query attached');
        const q = interpolate(scanSegments(qText), vars);
        let res;
        /* 🔴 شکلِ پارامتریِ client.query(sql, params): متنِ کوئری از یک فایلِ
           مهاجرتِ خوانده‌شده می‌آید (مسیرش بالاتر مرزبندی شد)؛ psql \gset
           نمی‌تواند $N بگیرد، پس پارامترهای خالی، شکلِ امن است. */
        try { res = await client.query(q, []); }
        catch (e) { throw onErrorStop ? new SqlError(e.message) : e; }
        const row = assertGsetRows(res.rows, res.rowCount);
        for (const k of Object.keys(row)) {
          vars[prefix + k] = row[k] === null ? '' : row[k];
        }
        if (!opts.quiet) process.stderr.write('[psql-min] \\gset set ' + Object.keys(row).map((k) => prefix + k).join(', ') + '\n');
        continue;
      }
      const q = interpolate(scanSegments(stmt), vars);
      try {
        const res = await client.query(q, []);
        renderResult(res, opts);
        n++;
      } catch (e) {
        if (onErrorStop) throw new SqlError(e.message);
        throw e;
      }
    }
  } finally {
    try { await client.end(); } catch (e) {/* intentional no-op */ }
  }
  /* Informational, and on stderr: stdout now carries ONLY query output, which
     is what a caller parsing `-tA -c 'SELECT count(*)'` is entitled to. */
  if (!opts.quiet) process.stderr.write('[psql-min] ' + n + ' statements executed\n');
}

/* ── --selftest: pure, DB-free, so it never silently skips ─────────── */
function selftest() {
  const assert = require('assert');
  let pass = 0;
  const fails = [];
  function t(name, fn) {
    try { fn(); pass++; console.log('  ✅ ' + name); }
    catch (e) { fails.push(name); console.log('  ❌ ' + name + ' — ' + e.message); }
  }
  const throwsGuard = (fn) => {
    try { fn(); } catch (e) { if (e instanceof GuardError) return; throw new Error('wrong error type: ' + e.constructor.name + ': ' + e.message); }
    throw new Error('did not throw');
  };

  console.log('psql-min --selftest (pure; no database needed)\n');

  /* ── positive: splitting ── */
  t('P1 a ";" inside a single-quoted string does not split', () => {
    assert.deepStrictEqual(splitStatements("SELECT 'a;b'; SELECT 2"), ["SELECT 'a;b'", 'SELECT 2']);
  });
  t('P2 a ";" inside a line comment does not split', () => {
    assert.deepStrictEqual(splitStatements('SELECT 1 -- x; y\n; SELECT 2'), ['SELECT 1 -- x; y', 'SELECT 2']);
  });
  t('P3 a ";" inside a block comment does not split', () => {
    assert.deepStrictEqual(splitStatements('SELECT 1 /* a; b */; SELECT 2'), ['SELECT 1 /* a; b */', 'SELECT 2']);
  });
  t('P4 a ";" inside a $$ body does not split', () => {
    assert.deepStrictEqual(splitStatements('DO $$ BEGIN; RAISE NOTICE \'x\'; END $$; SELECT 2'),
      ["DO $$ BEGIN; RAISE NOTICE 'x'; END $$", 'SELECT 2']);
  });
  t('P5 nested block comments are handled', () => {
    assert.deepStrictEqual(splitStatements('SELECT 1 /* a /* b */ c */; SELECT 2'),
      ['SELECT 1 /* a /* b */ c */', 'SELECT 2']);
  });
  t('P6 a named dollar tag is respected', () => {
    assert.deepStrictEqual(splitStatements('CREATE FUNCTION f() RETURNS void AS $body$ BEGIN; END $body$ LANGUAGE plpgsql; SELECT 1').length, 2);
  });
  t('P7 an escaped quote \'\' stays inside the string', () => {
    assert.deepStrictEqual(splitStatements("SELECT 'it''s; here'; SELECT 2"), ["SELECT 'it''s; here'", 'SELECT 2']);
  });
  t('P8 a double-quoted identifier may contain ";"', () => {
    assert.deepStrictEqual(splitStatements('SELECT "a;b" FROM t; SELECT 2'), ['SELECT "a;b" FROM t', 'SELECT 2']);
  });
  t('P9 the 012 \\gset line is recognised as a meta-command', () => {
    const st = splitStatements('SELECT w0 FROM mig009_w0 WHERE id = 1 \\gset')[0];
    const ex = extractMeta(st);
    assert.ok(ex.meta && ex.meta.name === 'gset', 'not parsed as \\gset');
    assert.strictEqual(ex.query, 'SELECT w0 FROM mig009_w0 WHERE id = 1');
  });

  /* ── positive: interpolation ── */
  t('P10 :var is substituted in plain SQL', () => {
    assert.strictEqual(interpolate(scanSegments('SELECT * FROM o WHERE o.chg_id > :w0'), { w0: 42 }),
      'SELECT * FROM o WHERE o.chg_id > 42');
  });
  t('P11 G5 — :: cast is NOT treated as a variable', () => {
    assert.strictEqual(interpolate(scanSegments("SELECT 'attendance_p'::regclass"), {}),
      "SELECT 'attendance_p'::regclass");
  });
  t('P12 G4 — :var inside a block comment is left alone', () => {
    /* the exact shape of migrations/012 line 344 vs line 388 */
    const sql = '/* مرز با :w0 خوانده می‌شود */\nSELECT 1 WHERE c > :w0';
    assert.strictEqual(interpolate(scanSegments(sql), { w0: 7 }),
      '/* مرز با :w0 خوانده می‌شود */\nSELECT 1 WHERE c > 7');
  });
  t('P13 G4 — :var inside a single-quoted string is left alone', () => {
    assert.strictEqual(interpolate(scanSegments("SELECT ':w0' AS s, :w0 AS n"), { w0: 5 }),
      "SELECT ':w0' AS s, 5 AS n");
  });
  t('P14 G4 — :var inside a $$ body is left alone', () => {
    assert.strictEqual(interpolate(scanSegments('DO $$ BEGIN RAISE NOTICE \':w0\'; END $$'), { w0: 5 }),
      'DO $$ BEGIN RAISE NOTICE \':w0\'; END $$');
  });
  t('P15 :\'var\' produces a SQL-quoted literal', () => {
    assert.strictEqual(interpolate(scanSegments("SELECT :'w0'"), { w0: "a'b" }), "SELECT 'a''b'");
  });
  t('P16 :"var" produces a quoted identifier', () => {
    assert.strictEqual(interpolate(scanSegments('SELECT :"w0"'), { w0: 'a"b' }), 'SELECT "a""b"');
  });
  t('P17 \\gset prefix is honoured', () => {
    assert.strictEqual(parseMeta('\\gset pre_').rest, 'pre_');
  });
  t('P18 -v NAME=VALUE is parsed, including "=" in the value', () => {
    const o = parseArgs(['-v', 'ON_ERROR_STOP=1', '--quiet', '-f', 'x.sql', 'postgres://h/db']);
    assert.strictEqual(o.vars.ON_ERROR_STOP, '1');
    assert.strictEqual(o.quiet, true);
    assert.strictEqual(o.file, 'x.sql');
    assert.strictEqual(o.url, 'postgres://h/db');
  });
  t('P19 ON_ERROR_STOP truthiness matches psql (1/on/true/yes)', () => {
    for (const v of ['1', 'on', 'true', 'yes', 'ON', 'True']) assert.strictEqual(truthy(v), true, v);
    for (const v of ['0', 'off', 'false', 'no', '']) assert.strictEqual(truthy(v), false, v);
  });

  /* ── negative: every guard must FAIL, never skip ── */
  t('N1 G1 — an unknown meta-command is a hard failure', () => {
    throwsGuard(() => assertSupportedMeta(parseMeta('\\echo hello')));
  });
  t('N2 G1 — \\if is rejected too', () => {
    throwsGuard(() => assertSupportedMeta(parseMeta('\\if :x')));
  });
  t('N3 G2 — an unresolved :var is a hard failure', () => {
    throwsGuard(() => interpolate(scanSegments('SELECT :missing_thing'), {}));
  });
  t('N4 G2 — an unresolved :\'var\' is a hard failure', () => {
    throwsGuard(() => interpolate(scanSegments("SELECT :'missing'"), {}));
  });
  t('N5 G6 — \\gset with 0 rows is a hard failure', () => {
    throwsGuard(() => assertGsetRows([], 0));
  });
  t('N6 G6 — \\gset with 2 rows is a hard failure', () => {
    throwsGuard(() => assertGsetRows([{ a: 1 }, { a: 2 }], 2));
  });
  t('N7 \\gset with exactly 1 row returns that row', () => {
    assert.deepStrictEqual(assertGsetRows([{ w0: 9 }], 1), { w0: 9 });
  });
  t('N8 an unsupported option is a hard failure', () => {
    throwsGuard(() => parseArgs(['--no-such-flag']));
  });
  t('N9 -v without a value is a hard failure', () => {
    throwsGuard(() => parseArgs(['-v']));
  });
  t('N10 an unterminated dollar-quote does not swallow the rest silently', () => {
    /* opaque tail is preserved verbatim, so the server rejects it loudly */
    const out = interpolate(scanSegments('DO $$ BEGIN'), {});
    assert.strictEqual(out, 'DO $$ BEGIN');
  });

  /* ── M15-01: منبعِ SQL و مرزِ مسیر (crash-of-the-day: -c با opts.file=null) ── */
  t('P20 -c without -f never touches the path guard (no TypeError on null)', () => {
    assert.strictEqual(resolveSqlSource({ file: null, command: 'SELECT 1;' }, '/repo'), 'SELECT 1;');
  });
  t('P21 -f inside the base directory is resolved against it', () => {
    let seen = null;
    const sql = resolveSqlSource({ file: 'migrations/012_x.sql', command: null }, '/repo', (f) => { seen = f; return 'SELECT 2;'; });
    assert.strictEqual(sql, 'SELECT 2;');
    assert.strictEqual(seen, path.resolve('/repo', 'migrations/012_x.sql'));
  });
  t('N11 -f escaping the base directory is a hard failure', () => {
    throwsGuard(() => resolveSqlSource({ file: '../../etc/passwd', command: null }, '/repo', () => 'never read'));
  });
  t('N12 neither -f nor -c yields empty SQL (run() must turn it into a guard error)', () => {
    assert.strictEqual(resolveSqlSource({ file: null, command: null }, '/repo'), '');
  });

  /* ── M15-01 (2026-10-30): the widened option/connection surface ── */
  t('P22 -h/-p/-U/-d and their long forms are parsed into connection fields', () => {
    const o = parseArgs(['-h', '10.0.0.5', '-p', '6432', '-U', 'payesh', '-d', 'payesh_ci']);
    assert.strictEqual(o.host, '10.0.0.5');
    assert.strictEqual(o.port, 6432);
    assert.strictEqual(o.user, 'payesh');
    assert.strictEqual(o.dbname, 'payesh_ci');
    const l = parseArgs(['--host=db', '--port=5433', '--username=u', '--dbname=d']);
    assert.deepStrictEqual([l.host, l.port, l.user, l.dbname], ['db', 5433, 'u', 'd']);
  });
  t('P23 clustered short flags are expanded (-tAq, -tA)', () => {
    const a = parseArgs(['-tAq']);
    assert.ok(a.tuplesOnly && a.unaligned && a.quiet, 'cluster not expanded: ' + JSON.stringify(a));
    const b = parseArgs(['-tA']);
    assert.ok(b.tuplesOnly && b.unaligned && !b.quiet);
  });
  t('P24 a cluster may END with a value-taking flag (psql shape: -tAf file)', () => {
    const o = parseArgs(['-tAf', 'migrations/001_initial.sql', 'postgres://h/db']);
    assert.ok(o.tuplesOnly && o.unaligned);
    assert.strictEqual(o.file, 'migrations/001_initial.sql');
    assert.strictEqual(o.url, 'postgres://h/db');
  });
  t('P25 -d accepts a conninfo string as well as a bare database name', () => {
    const asUrl = parseArgs(['-d', 'postgres://u:p@h:5432/db']);
    assert.strictEqual(asUrl.url, 'postgres://u:p@h:5432/db');
    assert.strictEqual(asUrl.dbname, null);
    const asName = parseArgs(['-d', 'payesh_ci']);
    assert.strictEqual(asName.dbname, 'payesh_ci');
    assert.strictEqual(asName.url, null);
  });
  t('P26 `-f -` reads SQL from stdin, not from a file named -', () => {
    let askedFor = null;
    const sql = resolveSqlSource({ file: '-', command: null }, '/repo', (f) => { askedFor = f; return 'FROM FILE'; }, () => 'FROM STDIN');
    assert.strictEqual(sql, 'FROM STDIN');
    assert.strictEqual(askedFor, null, 'the stdin form must not touch the filesystem');
  });
  t('P27 the connection URL is parsed (host/port/user/password/db/sslmode)', () => {
    const c = parseConnUrl('postgres://payesh:s3cr3t@db.internal:6543/payesh_ci?sslmode=require');
    assert.deepStrictEqual([c.host, c.port, c.user, c.password, c.database, c.sslmode],
      ['db.internal', 6543, 'payesh', 's3cr3t', 'payesh_ci', 'require']);
  });
  t('P28 the TLS policy is explicit: require/verify force TLS, prefer/allow/disable do not', () => {
    const cfg = (sslmode) => buildClientConfig({ url: 'postgres://u@h/db', sslmode }, {});
    assert.deepStrictEqual(cfg('require').cfg.ssl, { rejectUnauthorized: false });
    assert.strictEqual(cfg('verify-full').cfg.ssl, true);
    assert.strictEqual(cfg('disable').cfg.ssl, false);
    assert.strictEqual(cfg('prefer').cfg.ssl, false);
    assert.strictEqual(cfg('prefer').wantsTlsRetry, true, 'prefer must keep its one TLS retry');
    assert.strictEqual(cfg('require').wantsTlsRetry, false);
  });
  t('P29 flags override the URL, and PG* env fills the gaps', () => {
    const c = buildClientConfig({ url: 'postgres://url_user@url_host:1111/url_db', host: 'flag_host', port: 2222 },
      { PGUSER: 'env_user', PGPASSWORD: 'env_pw' });
    assert.strictEqual(c.cfg.host, 'flag_host');
    assert.strictEqual(c.cfg.port, 2222);
    assert.strictEqual(c.cfg.user, 'url_user');
    assert.strictEqual(c.cfg.password, 'env_pw');
    assert.strictEqual(c.cfg.database, 'url_db');
  });
  t('P30 tuples-only + unaligned renders bare values, one row per line', () => {
    let out = '';
    renderResult({ fields: [{ name: 'count' }], rows: [{ count: '7' }] }, { tuplesOnly: true, unaligned: true }, (s) => { out += s; });
    assert.strictEqual(out, '7\n');
    out = '';
    renderResult({ fields: [{ name: 'a' }, { name: 'b' }], rows: [{ a: 1, b: null }] }, { tuplesOnly: true, unaligned: true }, (s) => { out += s; });
    assert.strictEqual(out, '1|\n', 'null must render as an empty field, exactly like psql');
  });
  t('P31 aligned output keeps the header, the separator and the row-count footer', () => {
    let out = '';
    renderResult({ fields: [{ name: 'n' }], rows: [{ n: '2' }, { n: '3' }] }, {}, (s) => { out += s; });
    assert.match(out, /^n\n-\n2\n3\n\(2 rows\)\n$/, JSON.stringify(out));
  });

  t('N13 an unknown LONG option is still a hard failure', () => {
    throwsGuard(() => parseArgs(['--no-such-long-flag']));
  });
  t('N14 an unknown SHORT letter inside a cluster is still a hard failure', () => {
    throwsGuard(() => parseArgs(['-tZq']));
  });
  t('N15 a non-numeric -p is refused instead of being sent to the driver', () => {
    throwsGuard(() => parseArgs(['-p', 'notaport']));
  });
  t('N16 an unsupported --sslmode value is refused', () => {
    throwsGuard(() => parseArgs(['--sslmode=maybe']));
  });
  t('N17 no connection target at all is a guard error, not a mystery failure', () => {
    throwsGuard(() => buildClientConfig({ url: null }, {}));
  });

  console.log('\npsql-min --selftest: ' + pass + '/' + (pass + fails.length)
    + (fails.length ? '  FAILED: ' + fails.join(' | ') : ''));
  return fails.length ? 1 : 0;
}

/* ── entry ────────────────────────────────────────────────────────── */
if (require.main === module) {
  let opts;
  try { opts = parseArgs(process.argv.slice(2)); }
  catch (e) { console.error('psql-min: ' + e.message); process.exit(1); }

  if (opts.selftest) process.exit(selftest());
  /* `psql --version` is how several suites probe "is a client installed?".
     Answering it is not a claim to be PostgreSQL's psql: the string names this
     tool, and the version it reports is the tool's own. */
  if (opts.version) {
    console.log('psql-min (PostgreSQL-compatible stand-in) ' + VERSION + ' — ' + process.version);
    process.exit(0);
  }

  run(opts).then(() => process.exit(0)).catch((e) => {
    if (e instanceof SqlError) { console.error('psql-min: ' + e.message); process.exit(3); }
    if (e instanceof GuardError) { console.error('psql-min: ' + e.message); process.exit(1); }
    if (e && e.notRun) { console.error('psql-min: NOT-RUN — ' + e.message); process.exit(2); }
    console.error('psql-min: ' + (e && e.message ? e.message : e));
    process.exit(1);
  });
}

module.exports = {
  scanSegments, splitStatements, parseMeta, extractMeta, assertSupportedMeta, interpolate,
  assertGsetRows, parseArgs, truthy, GuardError, SqlError, SUPPORTED_META, resolveSqlSource,
  buildClientConfig, parseConnUrl, renderResult, selftest, VERSION
};
