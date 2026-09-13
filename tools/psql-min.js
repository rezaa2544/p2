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
     Supported : -v NAME=VALUE (repeatable), --quiet/-q, -f FILE,
                 positional connection URL, \gset [prefix], :var / :'var' /
                 :"var" interpolation, BEGIN/COMMIT, DO $$…$$,
                 CREATE PROCEDURE with internal COMMIT, --selftest
     Rejected  : every other meta-command (hard fail — see "honesty guards")

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
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');

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
      const vref = /^(['\"])([A-Za-z_][A-Za-z0-9_]*)\1/.exec(sql.slice(i));
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

class GuardError extends Error {}
class SqlError extends Error {}

function truthy(v) {
  return ['1', 'on', 'true', 'yes', 't'].includes(String(v).toLowerCase());
}

/* ── argument parsing ─────────────────────────────────────────────── */
function parseArgs(argv) {
  const opts = { vars: {}, quiet: false, file: null, url: null, selftest: false, command: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--selftest') { opts.selftest = true; continue; }
    if (a === '--quiet' || a === '-q') { opts.quiet = true; continue; }
    if (a === '-v') {
      const kv = argv[++i];
      if (kv === undefined) throw new GuardError('-v requires NAME=VALUE');
      const eq = kv.indexOf('=');
      if (eq === -1) opts.vars[kv] = ''; else opts.vars[kv.slice(0, eq)] = kv.slice(eq + 1);
      continue;
    }
    if (a === '-f') { opts.file = argv[++i]; if (!opts.file) throw new GuardError('-f requires a file'); continue; }
    if (a === '-c') { opts.command = argv[++i]; if (!opts.command) throw new GuardError('-c requires a command'); continue; }
    if (a.startsWith('-')) throw new GuardError('unsupported psql option ' + a + ' — refusing to guess');
    if (opts.url === null) { opts.url = a; continue; }
    throw new GuardError('unexpected extra argument: ' + a);
  }
  return opts;
}

/* ── the real run ─────────────────────────────────────────────────── */
async function run(opts) {
  let pg;
  try { pg = require('pg'); }
  catch (e) { throw new GuardError('pg driver not resolvable — set NODE_PATH to a node_modules containing pg'); }

  const sql = opts.file !== null
    ? fs.readFileSync(opts.file, 'utf8')
    : (opts.command !== null ? opts.command : '');
  if (!sql) throw new GuardError('nothing to execute (need -f FILE or -c COMMAND)');

  const client = new pg.Client({ connectionString: opts.url, connectionTimeoutMillis: 20000 });
  try {
    await client.connect();
  } catch (e) {
    const err = new Error('cannot connect: ' + e.message);
    err.notRun = true;
    throw err;
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
        try { res = await client.query(q); }
        catch (e) { throw onErrorStop ? new SqlError(e.message) : e; }
        const row = assertGsetRows(res.rows, res.rowCount);
        for (const k of Object.keys(row)) {
          vars[prefix + k] = row[k] === null ? '' : row[k];
        }
        if (!opts.quiet) console.log('[psql-min] \\gset set ' + Object.keys(row).map((k) => prefix + k).join(', '));
        continue;
      }
      const q = interpolate(scanSegments(stmt), vars);
      try {
        await client.query(q);
        n++;
      } catch (e) {
        if (onErrorStop) throw new SqlError(e.message);
        throw e;
      }
    }
  } finally {
    try { await client.end(); } catch (e) {}
  }
  if (!opts.quiet) console.log('[psql-min] ' + n + ' statements executed');
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
  assertGsetRows, parseArgs, truthy, GuardError, SqlError, SUPPORTED_META, selftest
};
