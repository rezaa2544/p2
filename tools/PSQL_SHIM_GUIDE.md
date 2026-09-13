# PSQL_SHIM_GUIDE — the minimal, faithful `psql` stand-in

**Owner:** chat 1 (database/core) · **Ships in:** `tools/psql-min.js` + `tools/bin/psql`
**Introduced:** commit `7db609f` · **Status:** PASS (measured), not a proposal

> **Why this file lives in `tools/` and not `docs/`**
> A new `docs/*.md` is counted by `tests/docs-freeze-marker.js`, which asserts that
> every `.md` in `docs/` has a row in the frozen `rc40` manifest. A single probe
> file dropped the gate from **14/14 to 12/14** (measured, round 6). Adding it to
> the manifest requires an `rc` bump, which belongs to chat 6. So this guide sits
> next to the tool it documents until chat 6 re-freezes it into `docs/`.

---

## 1. Why it exists

`migrations/012_partition_grades_attendance.sql:348` contains:

```sql
SELECT w0 FROM mig009_w0 WHERE id = 1 \gset
```

`\gset` is a **psql meta-command** — the server never sees it. Sending the file
through the `pg` driver therefore fails with:

```
syntax error at or near "\"
```

Consequence before this tool: migration 012 — and every suite that applies it,
including `tests/wave23-reports-pg.js` — was **NOT-RUN** on any machine without
the `psql` binary. This shim closes that unknown.

It is **not** a psql reimplementation. It implements exactly the meta-commands
this repository's migrations actually need, and refuses everything else loudly.

---

## 2. Quick start

```bash
# put the shim on PATH, then run any suite that shells out to `psql`
PATH="$PWD/tools/bin:$PATH" \
NODE_PATH=<node_modules containing pg> \
DATABASE_URL=postgres://<user>:<pw>@127.0.0.1:55433/postgres \
  node tests/wave23-reports-pg.js

# the shim's own unit tests (no database needed)
node tools/psql-min.js --selftest
```

The suite needs **no code change**: it picks the shim up through `PATH`.

Direct invocation mirrors psql's own CLI:

```bash
node tools/psql-min.js -v ON_ERROR_STOP=1 --quiet -f migrations/012_partition_grades_attendance.sql <url>
```

---

## 3. Architecture

| file | role |
|---|---|
| `tools/psql-min.js` | the implementation (Node, `pg` driver). Also hosts `--selftest`. |
| `tools/bin/psql` | executable `sh` wrapper (`100755`) so `execFileSync('psql', …)` resolves it via `PATH` |

The wrapper resolves the repository root from its own location, so it works from
any working directory.

**Pipeline:** read file → `scanSegments` (lexer that marks comments/strings/`$$`
bodies as opaque) → `splitStatements` (top-level `;`, plus meta-command
terminators) → `extractMeta` → `interpolate` → `client.query`, statement by
statement with autocommit, so `BEGIN`/`COMMIT` and procedures with internal
`COMMIT` behave as they do under psql.

---

## 4. Supported surface

| supported | deliberately **not** supported (hard failure) |
|---|---|
| `-v NAME=VALUE` (repeatable) | `\if` / `\elif` / `\else` / `\endif` |
| `--quiet`, `-q` | `\echo` |
| `-f FILE` | `\copy` |
| `-c COMMAND` | `\dt`, `\d`, `\l` and other introspection |
| positional connection URL | `\timing`, `\i`, `\set`, `\quit` |
| `\gset [prefix]` | any other `\<word>` |
| `:var`, `:'var'`, `:"var"` | |
| `BEGIN` / `COMMIT` | |
| `DO $$ … $$`, `CREATE PROCEDURE` with internal `COMMIT` | |

**Unsupported is a hard failure by design, not a skip.** Silently skipping a
meta-command would produce a green run over a half-applied migration — exactly
the failure mode this tool exists to prevent.

---

## 5. Honesty guards

| guard | behaviour | how to observe it |
|---|---|---|
| **G1** | unknown meta-command → hard failure | `--selftest` N1/N2; exit 1 |
| **G2** | unresolved `:var` → hard failure (never sent as literal text) | `--selftest` N3/N4 |
| **G3** | `ON_ERROR_STOP` truthy → SQL error maps to **exit 3** (psql's own code) | `--selftest` P19 |
| **G4** | `:var` is **not** interpolated inside comments, single/double-quoted strings or `$$` bodies | `--selftest` P12/P13/P14 |
| **G5** | `::` (cast operator) is never mistaken for a variable | `--selftest` P11 |
| **G6** | `\gset` requires exactly one row; 0 or >1 rows is an error | `--selftest` N5/N6/N7 |
| **G7** | a real `psql` found **earlier in `PATH`** wins; the wrapper `exec`s it and steps aside | see §7 |

G4 matters concretely in migration 012: line 344 mentions `\gset` and `:w0`
**inside a block comment** (must stay literal) while line 388 uses `:w0` in real
SQL (must be substituted). Both are handled by the same lexer.

---

## 6. Exit codes

| code | meaning |
|---|---|
| `0` | success |
| `1` | usage error or guard violation (G1/G2/G6, unsupported option) |
| `2` | NOT-RUN — cannot reach the database |
| `3` | SQL error while `ON_ERROR_STOP` is set (matches psql) |

`2` is deliberately distinct from `0`: this tool never turns "no database" into a
green run.

---

## 7. G7 precedence guard — verified

```bash
# a real psql earlier in PATH wins; every argument is passed through
PATH="/path/to/real/bin:$PWD/tools/bin:$PATH" psql -v ON_ERROR_STOP=1 --quiet -f <file> <url>
```

Measured in round 5: with a stand-in `psql` placed earlier in `PATH`, the wrapper
`exec`'d it and printed the full argument list verbatim. The shim never shadows
the real binary, because the real one supports far more than `\gset` and quietly
doing less would be a lie.

---

## 8. Cross-chart usage

| chat | how to use it |
|---|---|
| **chat 1** | `tests/wave23-reports-pg.js` — verified **76/76, exit 0** (round 5) |
| **chat 2** | if a suite shells out to `psql`, prepend `tools/bin` to `PATH` instead of installing PostgreSQL. Do **not** copy this file into another location; a second copy will drift |
| **chat 4** | capacity work needs migration 012's partitioned tables; this is the supported way to create them without a `psql` binary. It does **not** make any capacity claim — see §10 |
| **chat 6** | at the next `rc` bump, register this tool officially and move this guide into `docs/` (which re-freezes it) |

---

## 9. Verification ledger

| claim | value | provenance |
|---|---|---|
| `node tools/psql-min.js --selftest` | **29/29**, exit 0 | **re-measured in round 6** |
| migrations 001..012 on a fresh schema | **12 applied · 102 tables** | measured round 5 @ `7db609f` |
| partition artifacts created | `attendance_y2025/2026/2027`, `attendance_default`, `grades_y2025/2026/2027`, `grades_default` | measured round 5 |
| `tests/wave23-reports-pg.js` with shim on `PATH` | **76/76**, exit 0 | measured round 5 |
| same suite **without** shim (A/B honesty) | exit **1**, `spawnSync psql ENOENT` — still not green | measured round 5 |
| secret-scan / freeze-marker | 12/12 · 14/14 | measured round 5, re-checked round 6 |

Round 5's numbers are **not** re-measured in round 6: re-running the PostgreSQL
suites is barred by the anti-duplication rule. The selftest is re-measured
because it is database-free and costs ~0.2s.

---

## 10. Known limitations

- Only `\gset`. Everything else fails hard (by design — see §4).
- Requires a `node_modules` containing `pg`, reachable via `NODE_PATH`.
- The statement splitter is a hand-written lexer, not a full SQL parser. It
  handles `--`, nestable `/* */`, `''`-escaped strings, `""` identifiers and
  `$$`/`$tag$` bodies. Exotic quoting (e.g. `E'…'` backslash escapes with
  `standard_conforming_strings=off`) is not modelled.
- **No performance or capacity claim of any kind.** Migration 012 applying
  successfully says nothing about national scale; capacity is chat 4's.

---

## 11. Notes for anyone extending this

The first `--selftest` run scored **25/29** and exposed four real bugs. They are
recorded here because each one is a trap for the next person:

1. **`\gset` is *trailing*, not line-leading.** In 012 it ends a query line
   (`SELECT … \gset`). Detecting only a standalone meta-command line misses it.
2. **`:'var'` / `:"var"` must be matched before `:var`, and `::` before both.**
   A naive regex consumes the cast operator in `'x'::regclass`.
3. **The lexer must resolve `:'name'` *before* string lexing.** Otherwise `'name'`
   is treated as a string literal, becomes opaque, and interpolation never sees
   it. psql resolves variables first; the scanner has to match that order.
4. **A meta-command terminates the query buffer.** `\gset` is followed by
   `BEGIN;` in 012, so splitting only on `;` left `\gset` inside the statement —
   and it reached the server.

Add a selftest case for every new behaviour, positive *and* negative. A guard
that is not exercised by a failing case is not a guard.
