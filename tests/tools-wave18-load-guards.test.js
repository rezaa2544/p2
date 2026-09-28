#!/usr/bin/env node
/* ═════════════════════════════════════════════════════════════════
   tests/tools-wave18-load-guards.test.js — Wave 18 loader guard gate
   -------------------------------------------------------------------
   tools/wave18-load-to-pg.js is a one-shot CSV→PostgreSQL loader that
   ends with `main()` at module scope, so it cannot be require()d without
   executing. It also has no PostgreSQL available in this environment
   (no psql, no DATABASE_URL), so the happy path cannot run at all.

   Therefore the guards are verified two ways:
     • BEHAVIORAL — the loader is spawned as a child process and we assert
       on exit code + stderr. The path-containment guard and the
       DATABASE_URL / dir-exists checks all run BEFORE any Client is
       constructed, so these need no live database.
     • STATIC — the SQL-identifier validators live inside main()'s scope
       and are unreachable without a database, so they are asserted by
       reading the source with fs.readFileSync and applying regexes.

   W18-G1  `--dir` escaping the repo root (relative AND absolute) → exit 2
           with the Persian containment error, and no DB connection attempt.
   W18-G2  `--dir` inside the repo but nonexistent → exit 2 from the
           dir-exists branch (not a crash/stack trace).
   W18-G3  `--dir` pointing at a real dir inside the repo → gets PAST the
           path guard and fails on the missing DATABASE_URL with exit 2,
           proving the guard does not false-positive on legitimate input.
   W18-G4  Static: TRUNCATE_SQL / COUNT_SQL are complete over TABLES and
           every value is a fixed literal of the expected shape.
   W18-G5  Static: every identifier interpolated into a SQL string is
           derived from tableIdent()/colIdent()/a path-resolved value —
           no unvalidated name can reach SQL text.
   W18-G6  Static: ALLOWED_TABLES is exactly the elements of TABLES, and
           csvPath() containment is built on path.resolve + a
           path.dirname comparison (it cannot be invoked directly).
   ═════════════════════════════════════════════════════════════════ */
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const LOADER = path.join(ROOT, 'tools', 'wave18-load-to-pg.js');
const SRC = fs.readFileSync(LOADER, 'utf8');

/* A clean environment for the behavioral runs: DATABASE_URL must be absent
   so the "DATABASE_URL لازم است" branch is the deterministic outcome. */
const CLEAN_ENV = (() => {
  const env = Object.assign({}, process.env);
  delete env.DATABASE_URL;
  return env;
})();

/* Run the loader as a child process. Always an argv array — never an
   interpreter probe — so the guard surface under test is the real CLI. */
function run(args, env) {
  const r = spawnSync(process.execPath, [LOADER].concat(args), {
    env: env || CLEAN_ENV,
    encoding: 'utf8',
    windowsHide: true,
  });
  return { status: r.status, stderr: String(r.stderr || ''), stdout: String(r.stdout || '') };
}

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log('  ✅ ' + name); }
  catch (err) { fail++; console.error('  ❌ ' + name + '\n     ' + err.message); }
}

console.log('\n🛡 wave18-load-to-pg: input-boundary guards');

// ───────────────────────────── W18-G1: path containment (behavioral)
test('W18-G1a: --dir that escapes the repo root (relative) is rejected with exit 2', () => {
  const r = run(['--dir', '../../etc/passwd']);
  assert.strictEqual(r.status, 2, 'expected exit 2, got ' + r.status + ' :: ' + r.stderr);
  assert.ok(/خارج از ریشه/.test(r.stderr), 'containment message missing: ' + r.stderr);
  /* The guard fires at module scope, before main() runs at all — so there
     must be no DB plumbing in the output: no pg Client, no psql, no socket. */
  assert.ok(!/ECONNREFUSED|connect ETIMEDOUT|psql:/i.test(r.stderr + r.stdout),
    'loader attempted a database connection despite the rejected dir');
  assert.ok(!/^Error:|at Object\.<anonymous>/m.test(r.stderr),
    'rejection came out as an uncaught exception, not a clean exit:\n' + r.stderr);
});

test('W18-G1b: --dir that escapes the repo root (absolute) is rejected with exit 2', () => {
  const r = run(['--dir', 'C:/Windows']);
  assert.strictEqual(r.status, 2, 'expected exit 2, got ' + r.status);
  assert.ok(/خارج از ریشه/.test(r.stderr), 'containment message missing: ' + r.stderr);
});

test('W18-G1c: --truncate does not bypass the path guard', () => {
  const r = run(['--dir', '../../etc', '--truncate']);
  assert.strictEqual(r.status, 2, 'expected exit 2, got ' + r.status);
  assert.ok(/خارج از ریشه/.test(r.stderr), 'containment message missing: ' + r.stderr);
});

// ───────────────────────────── W18-G2: missing dir inside the repo
test('W18-G2: --dir inside the repo but nonexistent → dir-exists branch, exit 2, no crash', () => {
  /* A bogus DATABASE_URL gets us past the URL check so the branch under
     test is the dir-exists one. It still exits before `new Client()`. */
  const env = Object.assign({}, CLEAN_ENV, { DATABASE_URL: 'postgresql://u:p@127.0.0.1:1/none' });
  const r = run(['--dir', 'data/national/definitely-missing-w18'], env);
  assert.strictEqual(r.status, 2, 'expected exit 2, got ' + r.status + ' :: ' + r.stderr);
  assert.ok(/دایرکتوریِ دیتاست پیدا نشد/.test(r.stderr),
    'expected the "dataset dir not found" message, got: ' + r.stderr);
  assert.ok(!/ECONNREFUSED|at Object\.<anonymous>|node:internal/.test(r.stderr),
    'loader crashed or attempted a connection instead of a clean exit:\n' + r.stderr);
});

// ───────────────────────────── W18-G3: legitimate dir passes the guard
test('W18-G3: a real dir inside the repo passes the path guard (fails on DATABASE_URL)', () => {
  /* A temp dir under the repo root is the one thing that must NOT trip the
     containment guard. With no DATABASE_URL the loader then stops at the
     URL check — exit 2 with the Persian message, still no connection. */
  const tmp = path.join(ROOT, 'tmp', 'w18-guard-dirs');
  fs.mkdirSync(tmp, { recursive: true });
  try {
    const r = run(['--dir', path.relative(ROOT, tmp)]);
    assert.strictEqual(r.status, 2, 'expected exit 2, got ' + r.status + ' :: ' + r.stderr);
    assert.ok(/DATABASE_URL لازم است/.test(r.stderr),
      'expected the DATABASE_URL message (guard passed), got: ' + r.stderr);
    assert.ok(!/خارج از ریشه/.test(r.stderr),
      'the path guard false-positived on a legitimate in-repo dir');
    assert.ok(!/ECONNREFUSED|psql:/i.test(r.stderr + r.stdout),
      'loader attempted a database connection without a DATABASE_URL');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
    try { fs.rmdirSync(path.join(ROOT, 'tmp'), { force: true }); } catch (e) { /* best-effort: شاید tmp توسطِ تستِ دیگر در استفاده باشد */ }
  }
});

test('W18-G3b: --dir . (the repo root itself) is inside the boundary and passes', () => {
  /* DIR === ROOT is explicitly allowed by the guard (equality short-circuit),
     so this must also reach the DATABASE_URL check, not the containment one. */
  const r = run(['--dir', '.']);
  assert.strictEqual(r.status, 2, 'expected exit 2, got ' + r.status);
  assert.ok(/DATABASE_URL لازم است/.test(r.stderr),
    'repo root should be allowed past the guard, got: ' + r.stderr);
});

// ───────────────────────────── W18-G4: static SQL statement tables
/* Parse the constant tables out of the source rather than duplicating them,
   so a dropped/added table is caught instead of silently mirrored. */
function parseList(re) {
  const m = SRC.match(re);
  assert.ok(m, 'could not parse ' + re + ' from ' + LOADER);
  return m[1].split(',').map((s) => s.replace(/['"\s]/g, '')).filter(Boolean);
}
function parseFrozen(name) {
  const m = SRC.match(new RegExp('const ' + name + ' = Object\\.freeze\\(\\{([\\s\\S]*?)\\}\\);'));
  assert.ok(m, name + ' not found as an Object.freeze table');
  const out = {};
  let mm;
  const re = /([a-z_]+):\s*'([^']+)'/g;
  while ((mm = re.exec(m[1])) !== null) out[mm[1]] = mm[2];
  return out;
}

const TABLES_LIST = parseList(/const TABLES = \[([^\]]*)\]/);
const TRUNCATE_SQL = parseFrozen('TRUNCATE_SQL');
const COUNT_SQL = parseFrozen('COUNT_SQL');

test('W18-G4a: TABLES is the six expected constants in FK order', () => {
  assert.deepStrictEqual(TABLES_LIST,
    ['schools', 'classes', 'users', 'attendance', 'grades', 'parent_links'],
    'TABLES changed: ' + JSON.stringify(TABLES_LIST));
});

test('W18-G4b: TRUNCATE_SQL and COUNT_SQL have an entry for every table in TABLES', () => {
  TABLES_LIST.forEach((t) => {
    assert.ok(Object.prototype.hasOwnProperty.call(TRUNCATE_SQL, t), 'TRUNCATE_SQL missing entry for ' + t);
    assert.ok(Object.prototype.hasOwnProperty.call(COUNT_SQL, t), 'COUNT_SQL missing entry for ' + t);
  });
  /* No extra keys either — a stray table would mean a statement the allowlist
     does not know about. */
  assert.deepStrictEqual(Object.keys(TRUNCATE_SQL).sort(), TABLES_LIST.slice().sort(),
    'TRUNCATE_SQL keys ≠ TABLES');
  assert.deepStrictEqual(Object.keys(COUNT_SQL).sort(), TABLES_LIST.slice().sort(),
    'COUNT_SQL keys ≠ TABLES');
});

test('W18-G4c: every statement value is a fixed literal of the expected shape', () => {
  /* Shape-locked literals: if any of these were ever built by concatenation,
     the regex would fail to match. */
  TABLES_LIST.forEach((t) => {
    assert.ok(/^truncate table [a-z_]+ cascade$/.test(TRUNCATE_SQL[t]),
      'TRUNCATE_SQL[' + t + '] is not the fixed literal shape: ' + TRUNCATE_SQL[t]);
    assert.ok(/^select count\(\*\) from [a-z_]+$/.test(COUNT_SQL[t]),
      'COUNT_SQL[' + t + '] is not the fixed literal shape: ' + COUNT_SQL[t]);
    /* and each names the table it belongs to */
    assert.ok(TRUNCATE_SQL[t].indexOf(t) > -1, 'TRUNCATE_SQL[' + t + '] does not name ' + t);
    assert.ok(COUNT_SQL[t].indexOf(t) > -1, 'COUNT_SQL[' + t + '] does not name ' + t);
  });
});

// ───────────────────────────── W18-G5: no unvalidated identifier reaches SQL
/* METHOD (documented approximation). SQL text in this loader appears in two
   places: strings passed to client.query(...) and the string passed to
   psqlCopy(...). Identifiers can only enter that text through ${...}
   interpolation in a template literal (the parameterized queries use $1/$2
   and carry no identifiers at all). So:
     1. Collect every template literal that looks like SQL (contains one of
        the DML/DDL keywords) and pull out its ${...} interpolations.
     2. For each interpolated name, require a SAFE_DERIVATION proof elsewhere
        in the file — an assignment whose right-hand side is tableIdent(...),
        colIdent(...), a colIdent-mapped join, or a path-resolved/constant
        value. This is a syntactic data-flow check: it proves each name that
        reaches SQL text is produced by a validator, not that it is merely
        "a variable we trust".
     3. Separately, assert no SQL call site uses `+` concatenation, which is
        the shape an injection would take if interpolation were removed.
   What it does NOT prove: runtime values of literals. That is fine —
   TABLES and the CSV header are the only sources, and W18-G4/G6 cover them. */
const SQL_KEYWORDS = /\b(?:select|insert|update|alter|truncate|copy|from\s|where\s)/i;
const INTERP = /\$\{([^}]+)\}/g;

function sqlTemplateLiterals(src) {
  const out = [];
  const re = /`([^`]*)`/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    if (SQL_KEYWORDS.test(m[1])) out.push(m[1]);
  }
  return out;
}

const SAFE_DERIVATION = {
  /* name → regex that proves the name was produced by a validator */
  tbl: /\btbl\s*=\s*tableIdent\(/,
  col: /\bcol\s*=\s*colIdent\(/,
  list: /\blist\s*=\s*keep\.map\(\s*\w+\s*=>\s*colIdent\(/,
  src: /\bsrc\s*=\s*(?:csv\b|path\.resolve\()/,   /* csv = csvPath(DIR, t), validated in W18-G6 */
  dflt: /\bdflt\s*=\s*\/int\|numeric/,            /* a type-tested literal '1' / "'w18'" */
};

test('W18-G5: every identifier interpolated into SQL is validator-derived', () => {
  const sqlStrings = sqlTemplateLiterals(SRC);
  assert.ok(sqlStrings.length >= 4, 'expected to find several SQL template literals, got ' + sqlStrings.length);
  const unchecked = [];
  sqlStrings.forEach((s) => {
    let im;
    INTERP.lastIndex = 0;
    while ((im = INTERP.exec(s)) !== null) {
      const expr = im[1].trim();
      /* inline validator call or a constant-statement lookup: safe by construction */
      if (/^(?:tableIdent|colIdent)\(/.test(expr)) return;
      if (/^(?:TRUNCATE|COUNT)_SQL\[/.test(expr)) return;
      /* otherwise it is a bare name — it must have a proven derivation */
      const proof = SAFE_DERIVATION[expr];
      if (!proof || !proof.test(SRC)) unchecked.push(expr);
    }
  });
  assert.deepStrictEqual(unchecked, [],
    'interpolated into SQL without a validator derivation: ' + unchecked.join(', '));
});

test('W18-G5b: no SQL call site builds its statement by concatenation', () => {
  const lines = SRC.split('\n');
  const bad = [];
  lines.forEach((ln) => {
    if (/(?:client\.query|psqlCopy)\(/.test(ln) && /\+/.test(ln)) {
      bad.push(ln.trim());
    }
  });
  assert.deepStrictEqual(bad, [],
    'SQL statement built with `+` concatenation (injection shape):\n     ' + bad.join('\n     '));
});

test('W18-G5c: parameterized queries carry no interpolated identifiers', () => {
  /* Every client.query that is NOT one of the two identifier-bearing sites
     (the ALTER and the \copy) must be interpolation-free. */
  const sqlStrings = sqlTemplateLiterals(SRC);
  const withInterp = sqlStrings.filter((s) => INTERP.test(s));
  INTERP.lastIndex = 0;
  assert.deepStrictEqual(withInterp.length, 2,
    'expected exactly 2 SQL strings carrying identifiers (ALTER + \\copy), got: ' +
    JSON.stringify(withInterp));
});

// ───────────────────────────── W18-G6: allowlist + csvPath containment (static)
test('W18-G6a: ALLOWED_TABLES is exactly the elements of TABLES', () => {
  assert.ok(/const ALLOWED_TABLES\s*=\s*new Set\(TABLES\)/.test(SRC),
    'ALLOWED_TABLES is not `new Set(TABLES)` — the allowlist could drift from TABLES');
  /* and tableIdent is the only gate, comparing against that set */
  assert.ok(/function tableIdent\(name\)\s*\{[\s\S]*?ALLOWED_TABLES\.has\(/.test(SRC),
    'tableIdent() does not test membership against ALLOWED_TABLES');
  assert.ok(/throw new Error\('unsafe SQL table name/.test(SRC),
    'tableIdent() does not throw on a non-allowlisted name');
});

test('W18-G6b: tableIdent/colIdent reject hostile names before any SQL is built', () => {
  assert.ok(/const SQL_IDENT = \/~?\^\[a-zA-Z_\]\[a-zA-Z0-9_\]\*~?\$\//.test(SRC),
    'SQL_IDENT identifier pattern missing or weakened');
  assert.ok(/function colIdent\(name\)\s*\{[\s\S]*?SQL_IDENT\.test\(s\)[\s\S]*?throw new Error\('unsafe SQL column name/.test(SRC),
    'colIdent() does not validate against SQL_IDENT and throw');
});

test('W18-G6c: csvPath() containment is resolve + dirname comparison (static)', () => {
  /* csvPath cannot be invoked (it lives under `main()`'s call chain and the
     module exits at load), so its logic is asserted from the source: the
     joined path must resolve inside the resolved dir, compared by dirname. */
  const m = SRC.match(/function csvPath\(dir, table\)\s*\{([\s\S]*?)\n\}/);
  assert.ok(m, 'csvPath() body not found');
  const body = m[1];
  assert.ok(/path\.resolve\(dir,/.test(body),
    'csvPath() does not resolve the joined path: ' + body.trim());
  assert.ok(/path\.dirname\(p\)\s*!==\s*path\.resolve\(dir\)/.test(body),
    'csvPath() does not compare dirname against the resolved dir');
  assert.ok(/throw new Error\('CSV path escapes/.test(body),
    'csvPath() does not throw when the path escapes');
  /* and it validates the table name before touching the filesystem */
  assert.ok(/tableIdent\(table\)/.test(body), 'csvPath() does not validate the table name');
  /* the same containment re-check guards the temp aligned-CSV path in main() */
  assert.ok(/aligned CSV path escapes/.test(SRC),
    'the aligned-CSV path in main() lost its containment re-check');
});

// ───────────────────────────── نتیجه
const total = pass + fail;
console.log('\n' + '─'.repeat(52));
console.log(`wave18 load guards: ${pass}/${total} تست موفق` + (fail ? `  —  ${fail} ناموفق` : '  —  بدون خطا ✅'));
console.log('─'.repeat(52) + '\n');
process.exit(fail ? 1 : 0);
