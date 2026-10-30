# The one red in this run — read this before reading the count

`EXITCODES.txt` buckets suites by keyword. Its single bucket for this run says `POSTGRES 1`
because the suite's log mentions `psql`/PostgreSQL. That bucket name is the tool's guess; this
file is the measurement.

**Suite:** `wal-disk-full` · **exit 2** · **runtime 0s** · verdict: **5 scenarios NOT-RUN**.

The suite self-reports:

```
[0.0s] ▸ مانورِ زنده
  ⏭️  W1 WAL→۸۰٪ warning — NOT RUN: PostgreSQL روی پورتِ 5432 پاسخ نمی‌دهد
  ⏭️  W2 WAL→۱۰۰٪ PANIC — NOT RUN: ...
  ⏭️  W3 بازیابی + RTO — NOT RUN: ...
  ⏭️  W4 بازیابی از replica — NOT RUN: ...
  ⏭️  W5 تأییدِ RPO=0 — NOT RUN: ...
WAL disk-full drill: 9/14 موفق — 5 سناریو NOT-RUN ⏭️
خروجیِ ۲: «اجرا نشد» با «موفق» فرق دارد (سبزِ جعلی ممنوع).
```

Its nine static checks pass (`9/14`), and it deliberately exits **2** rather than pretending the
five live scenarios ran. Exit 2 is "not run", not "passed" and not "failed" — the distinction the
suite exists to enforce.

## Why the five scenarios cannot run in this sandbox

The drill provisions its own cluster **as the OS user `postgres`** and fills a size-limited tmpfs
behind the WAL directory. Measured here:

| requirement | measurement |
|---|---|
| `sudo -n mount -t tmpfs` | **works** (the sibling `chaos-drill-disk-pressure` uses it and passes: 96 MB tmpfs, real `ENOSPC` and `PANIC: could not write to file "pg_wal/…"` in the PostgreSQL log, recovery 28.9 s) |
| a `postgres`-owned data directory for `sudo -u postgres initdb` | **impossible**: `chown postgres:postgres` → `Operation not permitted` (uid 1001, not root), so `initdb -D …` cannot create the cluster |
| the client tools the drill shells out to (`pg_isready`) | not shipped by `@embedded-postgres` and not shimmed (only `psql` and `createdb` are) |

The probe that produces "PostgreSQL روی پورتِ 5432 پاسخ نمیدهد" is the suite's own readiness gate
(`pg_isready`); with that binary absent it correctly refuses to proceed rather than assume.

## What would make it run

- a machine where the executing user can `chown` a directory to `postgres` (any normal CI runner
  with the PostgreSQL client package), or
- `sudo -u postgres` execution of a shimmed `pg_isready` **and** a pre-owned data directory.

Neither exists here, and faking the mount or faking the readiness probe is exactly what
`false-green` means in this repository. The suite stays red-by-design (exit 2) and is labelled
**NOT RUN**, never "environment pass".
