# PR181_REBASE_PLAYBOOK — single-pass rebase of #181 after the freeze bump

**Audience:** chat 1 (executes) · chat 6 / supervisor (approves ordering)
**Trigger:** the `rc` bump from **PR #176** lands on `main`
**Rule:** حکم ۵ — do **not** rebase #181 before that. An early rebase is duplicate
work, because the frozen docs move again when the bump lands.

> Lives in `tools/` rather than `docs/` for the same measured reason as
> `PSQL_SHIM_GUIDE.md`: a new `docs/*.md` drops `tests/docs-freeze-marker.js`
> from **14/14 to 12/14**, and repairing that needs an `rc` bump owned by chat 6.

---

## 1. Prerequisites — verify each, do not assume

```bash
git fetch origin main
# (a) the freeze bump is actually on main:
git ls-tree --name-only origin/main docs/ | grep -E 'DOCS_FREEZE_v1\.0\.0-rc4[1-9]'
# (b) #176 is merged, not merely open:
gh pr view 176 --json state,mergedAt
```

Measured at the time of writing (round 6):

| item | value |
|---|---|
| highest freeze doc on `main` | **rc40** |
| freeze docs added by **#176** | `rc41`, `rc42`, **`rc43`** (verified from `gh pr view 176 --json files`) |
| #176 state | **OPEN** — so the prerequisite is **not** met yet |

> Note: #176's *title* says `rc42`, but its file list contains rc41, rc42 **and**
> rc43. Trust the file list, not the title.

Also expected as part of that bump (measured stale values, round 6):

- `docs/TEST_COVERAGE_REPORT.md`: `480 → 484` total test files (`472 → 476` in
  `tests/`, `8` in `tests/api/`). This is the doc whose freeze hash currently
  blocks `docs-stats-sync --check`.
- `tests/docs-freeze-marker.js` hardcodes `docs/DOCS_FREEZE_v1.0.0-rc40.md`;
  after the bump it must point at the new freeze doc, or the gate cannot pass.
  **That edit belongs to chat 6's bump, not to this rebase.**

---

## 2. What is actually in conflict

Measured with `git diff --name-only` on both sides (no merge performed):

**4 shared documents — need a manual union:**

| file | resolution |
|---|---|
| `docs/DOCS_FREEZE_v1.0.0-rc40.md` | **theirs** (`main`) — frozen governance, chat 6 owns it |
| `docs/TEST_COVERAGE_REPORT.md` | **theirs** (`main`) — frozen; the bump already carries the correct counts |
| `HANDOFF.md` | **union, append-only** — both sides only appended |
| `docs/daily-reports/2026-09-13.md` | **union, append-only** — several chats append to the same day |

**17 files — must merge clean** (verified in round 4, re-verified round 5): all
`server/*.js`, every `tests/pg-prod-*.js`, `tests/arena5-recovery.js`,
`tests/pg-relational-seed.js`, `tests/helpers/boot-pg.js`,
`tools/seed-relational-small.js`, `tools/relational-seed-manifest.json`,
`tools/psql-min.js`, `tools/bin/psql`.

If any of those 17 conflicts, **stop** — that contradicts the round-4/5 evidence
and means something unexpected landed on `main`.

---

## 3. Rebase steps

```bash
git fetch origin
git status --porcelain                      # must be empty before starting
git rev-parse HEAD                          # RECORD THIS SHA — it is the rollback point

git rebase origin/main
```

Resolve each conflict:

```bash
# frozen governance docs -> take main's version
git checkout --theirs docs/DOCS_FREEZE_v1.0.0-rc40.md
git checkout --theirs docs/TEST_COVERAGE_REPORT.md

# append-only ledgers -> union by hand. Verify the union preserves BOTH sides'
# prefix, i.e. nothing is dropped:
#   python3 - <<'PY'
#   a=open('HANDOFF.md',encoding='utf-8').read()
#   print(len(a.encode()))
#   PY
# then confirm each side's sections are present.

git add docs/DOCS_FREEZE_v1.0.0-rc40.md docs/TEST_COVERAGE_REPORT.md \
        HANDOFF.md docs/daily-reports/2026-09-13.md
git rebase --continue
```

**Use explicit `git add <paths>`.** Do not use `git add -A`: the working tree can
contain generated or ignored artefacts (e.g. `server/data/`), and a blanket add
would commit them.

---

## 4. Verification — all of these must pass before pushing

```bash
export NODE_PATH=<node_modules containing pg>
export PG_LIVE_PG=postgres://<user>:<pw>@127.0.0.1:55433/payesh_chat1

node tools/psql-min.js --selftest                 # expect 29/29
node tests/docs-freeze-marker.js                  # expect 14/14 (see §1 caveat)
node tests/secret-scan.js                         # expect 12/12
node tools/docs-metadata.js                       # expect 0 orphans
node tools/reza-mirror-check.js                   # expect 0 drift
node tools/docs-stats-sync.js --check             # expect PASS only if the bump
                                                  # fixed the 480 -> 484 counts

PATH="$PWD/tools/bin:$PATH" DATABASE_URL=$PG_LIVE_PG WAVE23_REQUIRE_PG=1 \
  node tests/wave23-reports-pg.js                 # expect 76/76, exit 0
```

If `docs-freeze-marker.js` still points at `rc40`, it will fail after the bump.
That is chat 6's line to change — record it as NOT-RUN with that reason rather
than editing the gate yourself.

---

## 5. Push and confirm

```bash
git push origin arena/01a09a7d-p2

# Evidence Gate — do not trust the push output alone:
test "$(git ls-remote origin refs/heads/arena/01a09a7d-p2 | cut -f1)" = "$(git rev-parse HEAD)" \
  && echo "ls-remote == HEAD"

# حکم ۴ — verify the LIVE PR bytes, not the local assumption:
gh pr view 181 --json state,mergeStateStatus,commits
```

Expected after a clean rebase: `state=OPEN`, `mergeStateStatus` no longer
`DIRTY`, and the same set of changes (rebase rewrites SHAs, so commit hashes
**will** differ — compare by file list, not by SHA).

---

## 6. Rollback — and an important caveat

The textbook rollback is:

```bash
git reset --hard <pre-rebase SHA>
git push --force-with-lease
```

**Caveat, measured in this environment:** force-push is not available in the
Arena sandbox, and `--force-with-lease` has been observed to fail here. So if a
rebase goes wrong inside Arena, the practical recovery is **not** a force-push.
It is:

```bash
git rebase --abort            # if still mid-rebase, this is the cleanest exit
```

and, if the bad state was already pushed, a **follow-up revert commit** rather
than a history rewrite. Plan for that: run `git rebase --abort` liberally, and
never push a half-resolved rebase.

---

## 7. Risk assessment

| area | risk | mitigation |
|---|---|---|
| 17 code/test/tool files | **low** — no content dependency on the freeze bump; verified clean in rounds 4 and 5 | if any conflicts, stop and investigate |
| `HANDOFF.md`, daily report | **medium** — several chats append to the same files | union, append-only; verify both prefixes survive |
| frozen docs (`rc40`, `TEST_COVERAGE_REPORT`) | **low** — take `theirs` | never hand-edit a frozen doc |
| `docs-freeze-marker.js` hardcoded to `rc40` | **medium** — will fail until chat 6 repoints it | record NOT-RUN with reason; do not edit the gate |
| history rewrite | **medium** — force-push unavailable here | `git rebase --abort`; never push half-resolved state |

---

## 8. Definition of done

- `mergeStateStatus` is no longer `DIRTY` on #181
- §4 verification all green, or each red recorded as NOT-RUN **with a reason**
- `ls-remote == HEAD`
- the live PR body verified by byte/marker (حکم ۴), not assumed
- no self-merge; ordering stays with the supervisor
