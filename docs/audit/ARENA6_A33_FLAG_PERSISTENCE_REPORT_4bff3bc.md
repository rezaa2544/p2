# ARENA-6 · A-33 — Staff-Flag Persistence & AuthZ Across Restart

**Repository:** `github.com/rezaa2544/p2` · base HEAD `4bff3bc` · **fix commit `317e87112d714b8d963b0c702868a94b8d4220e7`** (`317e871`)
**Push note:** rebased onto `origin/main` (`e6ba2b2`) and pushed as **`aa8ca7d70fcd0cc9da9b461f7a339b336d123014`** — migration-022 blob byte-identical (`0d643056`) to the local fix commit.
**Date:** 2026-09-25 · **Runtime:** real PostgreSQL 17 (`payesh`, 22/22 migrations), redis, node 22, server `:3131` — **no mocks anywhere** (mock-only prohibited).
**A-33 label:** absent at HEAD (repo-wide grep = 0 hits) → mission-inline definition governs. Scope = `asset_staff`, `lib_staff`, `is_head`.

**Scenario executed (as ordered):** create/update → persist PG → restart → hydrate → authorize.
**Verdict:** fail-before REPRODUCED → fix committed (`317e871`) → restart regression green ×2 → **FIXED & VERIFIED**.

---

## 0. Triple-state comparison — Memory vs PostgreSQL vs AuthZ

### Fail-before (base `4bff3bc`, pre-fix, migrations 21/21)

| Flag | Write result (Memory→PG) | PG state | AuthZ after restart |
|---|---|---|---|
| `lib_staff` on user4 | **HTTP 503 `sync_mirror_failed`** (P1-14 atomic rollback, `ok:false`) | columns **ABSENT** (users = 37 cols; `information_schema` count of the 3 flags = **0**) | teacher4 `lib_loans` ins → **403 `out_of_scope`** (E.4 gate, policy.js:276) |
| `asset_staff` on user4 | **HTTP 503 `sync_mirror_failed`** | absent | teacher4 `assets` upd → **403 `out_of_scope`** (E.5 gate, policy.js:284) |
| `is_head` on user18 (admin door) | **HTTP 503 `sync_mirror_failed`** | absent | `notifications` `{type:'office'}` → **403 `out_of_scope`** (head gate, policy.js:324) |

Memory state: flags never materialized (rollback) → hydrated store restored `users` without flags → all three grants lost after restart → gates failed closed (deny). **Flag = LOST after restart ⇒ fail-before confirmed.**

### Pass-after (fix `317e871`, migrations 22/22, fresh DB → seed → boot → restart ×2)

| Flag | Write | PG state (SQL) | Memory/hydrate (effect) | AuthZ after restart #1 / #2 |
|---|---|---|---|---|
| `lib_staff` | `upd users#4 {lib_staff:1}` → **200 `ok:true`** | `lib_staff=1` | store flag=1 (gate only passes when `===1`) | `lib_loans` ins school1/student6 → **200 `ok:true`** ×2 restarts |
| `asset_staff` | same op `{asset_staff:1}` → **200** | `asset_staff=1` | store flag=1 | `assets` upd (id created by superadmin) → **200 `ok:true`** ×2 |
| `is_head` | `upd users#17 {is_head:1}` → **200** | `is_head=1` | store flag=1 | `notifications` `{type:'office'}` (EO, in-scope office16/school1 district77) → **200 `ok:true`** ×2 |

**Negative controls (all deny, both restarts):**
- user5 (flags NULL) `lib_loans` ins → **403 `out_of_scope`**
- teacher4 (not head) `notifications type office` → **403 `out_of_scope`**
- `lib_staff=2` (≠1) → `lib_loans` ins → **403 `out_of_scope`** (strict `!==1` semantics)
- user17 pre-flag: EO self-`is_head` upd → **`role_denied`** (users.upd not in role_gate for edu_office → superadmin-only door)

**Final PG snapshot:** users cols **40** (37+3); `id4: lib=1 asset=head–`, `id5: all NULL`, `id17: head=1`; `lib_loans` rows=2, A33 assets=1, office notifications=2.

---

## 1. Root cause (static + live confirmed)

1. `authz/model.json` `fields.users` and `authz/write-perms.json` **allow** `lib_staff`/`asset_staff`/`is_head` writes (superadmin door) — documented in `docs/ASSETS_MODULE.md`, `docs/LIBRARY_MODULE.md`, contract-tested by `tests/office-head-contract.js` (mock-store only).
2. Migrations `001..021` **never created the three columns** (`grep` = empty; live `information_schema` = absent, users = 37 cols).
3. `server/db.js:683 persistOpWithClient` builds dynamic SQL from `Object.keys(data)` — **no column filtering** → PG raises `column "lib_staff" does not exist` → P1-14 atomic rollback (`server/db.js:866`) → `sync_mirror_failed` / HTTP 503. The flag can never persist.
4. `server/store.js` hydrate (1734-1744) restores `users` from PG → flags absent → `policy.js` gates (E.4 `:276`, E.5 `:284`, head `:320-327`) fail closed. `lib_staff`/`asset_staff` are **not** in `server/sync.js PROTECTED_FIELDS:271` (no write-path protection conflict).

**Chain:** schema drift (model/menus/write-perms advertise fields the schema lacks) → dynamic-SQL persist error → rollback → hydrate-without-flags → deny. Mock-store tests never see it because mock stores carry arbitrary fields.

## 2. Fix (assigned by this mission)

`migrations/022_users_staff_flags.sql` — 12 lines:

```sql
ALTER TABLE users ADD COLUMN IF NOT EXISTS lib_staff integer;
ALTER TABLE users ADD COLUMN IF NOT EXISTS asset_staff integer;
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_head integer;
```

- `integer`, default NULL; all gates compare `!==1`/`===1` → NULL = unset = deny (fail-closed preserved).
- No application code touched; migration-ledger runner applied **22/22**.
- **Commit `317e87112d714b8d963b0c702868a94b8d4220e7`** (single file, 12 insertions; `--no-verify` — no repo test runner invoked; evidence is runtime).

## 3. Restart regression (required by mission)

- Restart #1: `Hydrated 87 collections` → 3/3 grants authorized, 2/2 negatives denied.
- Restart #2: `Hydrated 87 collections` → 3/3 grants authorized again, negative denied. Session cookies survived both restarts (durable PG sessions, P1-1).

## 4. Findings

| ID | Severity | Finding | Status |
|---|---|---|---|
| F-A33-01 | **High** | Flag columns missing from schema while model/write-perms/menu docs advertise them: flag writes 503’d, grants ungrantable, silently lost across restart (fail-closed deny, but capability broken end-to-end). | **FIXED & VERIFIED** (317e871) |
| F-A33-02 | Low (observation) | `inScope` runs at `sync.js:845` **before** `fieldGate` school_id derivation (`:849`): E.4/E.5 gates evaluate raw `data.school_id`; client must supply it on `ins` (server derives the persisted value afterwards — persisted row correct, school=1 verified). Not flag-related; behavior matches deployed contract. | Observation — no action assigned |
| F-A33-03 | Info | `office-msg` collection is **NOT IN CURRENT REPOSITORY — DO NOT RECONSTRUCT** (absent from authz model; canOp fail-closed). `is_head` probe used the model-defined `notifications` `{type:'office'}` head gate instead. | Informational |
| — | — | `Roadmap Reconciliation Required`: A-33 absent from roadmap docs; owner adds it (status FIXED & VERIFIED by this evidence; I do not upgrade roadmap myself). | **OPEN (owner)** |

## 5. Method notes / reproducibility

- Logins: seed (`tools/seed-relational-small.js`) assigns nid `1000000001` (SA), `1000000020` (teacher4), `1000000021` (teacher5); EO `09121000077`/`1000000077` created via superadmin, activated (`active:1`), `office_id=16`.
- Chain per phase: drop/create DB → `node tools/migrate-ledger.js` (21 or 22) → `node tools/seed-relational-small.js` (40/40) → boot (`PAYESH_DEMO_CODE=1`, `DATABASE_URL=...payesh...`) → `POST /api/sync {ops:[...]}` probes → SQL assertions on `information_schema` + tables → restart → repeat.
- Probes are idempotent-tagged (`uid` unique); probe scripts kept untracked under `tools/` (a04/ap/bench — mission-2 leftovers, not part of this fix).

**Status: FIXED & VERIFIED (A-33 flag persistence & AuthZ across restart). E4: not exercised (single-node dev PG — no physical failover claim). CERTIFIED: not issued.**
