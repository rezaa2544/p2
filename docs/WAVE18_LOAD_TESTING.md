# Wave 18 — National Load Testing

**Wave:** 18 — National Load Testing (Roadmap §21) · **Owner:** Arena 5 + Arena 4
**Branch:** `arena/01a0867f-p2` · **Date:** 2026-09-10
**Status:** 🟡 started — model + dataset + four scenarios are executable in CI;
**the national capacity number is NOT measured here** and cannot be (see §7).

> **Addendum rule:** everything below is either computed code
> (`tools/seed-national.js`), an executable suite (`tests/wave18-load.js`,
> 62/62 green), or a runnable k6 script
> (`tests/performance/suites/national-load-test.js`). No number in this
> document is a guess presented as a measurement.

ROADMAP §21 opens with: **«10M registered user به تنهایی کافی نیست.»** The
dataset has to carry schools, classes, enrollments, attendance, grades,
messages, notifications and audit/events in proportions close to a real
workload — and then Load, Stress, Spike and Soak are mandatory.

---

## 1. The national model (`tools/seed-national.js`)

Every figure is **derived from a stated ratio**, so the model can be audited
and re-derived when a ratio is challenged. `RATIOS` is the only input.

| Stated ratio | Value |
|---|---:|
| `USERS` (Roadmap headline) | 10,000,000 |
| `SCHOOLS` | 110,000 |
| `STUDENTS_PER_CLASS` | 28 |
| student / parent / teacher share | 0.60 / 0.32 / 0.07 |
| `ENROLL_PER_STUDENT` | 1.05 |
| `SUBJECTS_PER_STUDENT` × `TERMS_PER_YEAR` | 12 × 4 |
| `ATTENDANCE_DAYS_PER_YEAR` | 200 |
| messages / notifications per student-year | 0.5 / 20 |
| `AUDIT_PER_WRITE` | 1.2 |
| Mehr window / peak factor | 7,200 s / ×3 |

Derived (printed by `node tools/seed-national.js --model`):

| Quantity | Value | Derivation |
|---|---:|---|
| students | 6,000,000 | 10M × 0.60 |
| parents | 3,200,000 | 10M × 0.32 |
| teachers | 700,000 | 10M × 0.07 |
| staff | 100,000 | remainder — so the shares always sum to 10M |
| schools | 110,000 | stated |
| classes | 214,286 | ⌈students ÷ 28⌉ |
| enrollments | 6,300,000 | students × 1.05 |
| attendance / day | 6,000,000 | every student, once |
| attendance / year | 1,200,000,000 | × 200 days |
| grades / year | 288,000,000 | students × 12 subjects × 4 terms |
| messages / year | 3,000,000 | students × 0.5 |
| notifications / year | 120,000,000 | students × 20 |
| audit events / year | 1,793,160,000 | writes × 1.2 |
| **Mehr writes/sec** | **833** | 6,000,000 ÷ 7,200 s |
| **peak writes/sec** | **2,500** | 833 × 3 |
| **peak API RPS** | **20,000** | 2,500 × 8 reads per write |

### One correction worth recording

The first draft derived classes as `schools × 12`. With 6M students that
silently implies **4.5 pupils per class** — not a school. Classes are now
derived from students and a class size, and `NL4` asserts
`students_per_class === 28` exactly. `classes_per_school` (1.95) survives only
as a diagnostic, which is what it is: 6M students spread over 110k schools is
a partial-rollout world, not a full one.

`NL1–NL10` assert the model is internally consistent — the shares sum exactly,
class size equals the ratio, attendance and grades are derived, the Mehr peak
follows from the window, and changing a ratio recomputes everything.

> **Rounding order matters.** `NL8` first "failed" because it asserted
> `round(round(6e6/7200) × 3)` = 2499 against a model that rounds once, at the
> end, giving 2500. The model was right; the assertion was wrong.

---

## 2. The dataset generator

```bash
node tools/seed-national.js --model                       # print the model
node tools/seed-national.js --scale 0.0001 --out /tmp/n.json
node tools/seed-national.js --scale 0.0001 --out /tmp/n.json --json
```

`generate(scale, {cap, classCap, minRows})` returns a store with the **same
shape** as `server/data/payesh.json` at `scale` of the national world, so a
real server boots on it. `scale: 1` would be ~10M users and tens of GB; CI runs
`1e-4` with `cap: 200`, producing a 158 KB store.

Three rules the generator enforces, each with a test:

| Rule | Check |
|---|---|
| **never write inside the repository** — a generated dataset is not source | `DS7` (exit 2 + message), `DS8` (no file left behind) |
| scale must be in `(0, 1]` | `DS9` (exit 2) |
| generated users carry `active: 1` | found by a failure — see below |
| referential integrity: every student → real school + class, every grade → real student + subject | `DS3`, `DS4` |

`active: 1` was not in the first version. `server/auth.js:270` does
`if(!user.active) return fail('inactive')`, so every generated user was
rejected at login and all four scenarios died on `no_session`. The generator
now sets `active`, `username`, `password` and `created_at`, with a comment
naming the line that requires them.

---

## 3. The four mandatory scenarios

Run by `tests/wave18-load.js` (62/62) against a real server on port 9061
booted on the generated dataset.

### Load — normal and peak (`LD1–LD9`)
* **normal**: 300 mixed requests, bounded concurrency 64. Asserts 0 5xx,
  measurable rps, p95 < 500 ms, p99 < 1500 ms, and that
  `payesh_http_requests_total` moved by **exactly** the request count.
* **peak**: the same mix at 1200 requests. Asserts 0 5xx, throughput above
  normal, and — the honest peak assertion — that p99 **degrades without
  collapsing** (≤ 20× normal).
* **writes/sec**: 60 parallel sync writes, measured, with every write landing.

### Stress — to the breaking point (`ST1–ST6`)
Ramp 50 → 150 → 300 → 500 concurrent, recording p99 and errors at each level.
The assertion is **not** "a breaking point was found" — on this machine none
was reached, and pretending otherwise would be a fabricated result. It is:
the ramp completed, the outcome (breaking point **or** "none below 500") is
reported, the server is still healthy, writes still work, an oversized batch
is refused **413 and not 500**, and `payesh_http_requests_total{code=~"5.."}`
is exactly 0.

### Spike (`SP1–SP4`)
Calm baseline → 600-request burst → recovery. Asserts the burst really is a
burst (all issued inside a few hundred ms), 0 5xx, p95 inside budget, and
latency back within 10× of calm.

### Soak — the six leak detectors §21 names (`SK1–SK10`)

| §21 leak class | Detector |
|---|---|
| memory leak | `SK2` heap end < 3× start |
| GC degradation | `SK3` `payesh_node_eventloop_lag_seconds` finite and < 1 s |
| (symptom of both) | `SK4` last-third p95 ≤ 3× first-third |
| connection leak | `SK5` a fresh socket is still served |
| queue growth | `SK6` `payesh_outbox_depth` ≤ cap |
| cache growth | `SK9` see below |
| DB bloat | `SK10` store file did not grow during a read-only soak |
| cardinality growth | `SK7`/`SK8` series bounded, drop counter at 0 |

`SK9` deserves its own note. `payesh_cache_*` series exist but stay at zero:
this build serves these routes straight off the JSON store, so nothing is
looked up. A declared-but-idle series is not evidence of cache use, so the
check branches and **names the case** instead of asserting a growth that never
happens. On PostgreSQL + Redis the other branch fires.

---

## 4. Measurement coverage (§21 asks for nine)

| Measurement | Here | Source |
|---|---|---|
| API RPS | ✅ | measured elapsed time |
| writes/sec | ✅ | measured (`LD9`) |
| sync records/sec | ✅ | `payesh_sync_requests_total` |
| p50 / p95 / p99 | ✅ | `payesh_http_request_duration_seconds` + local timings |
| CPU | ✅ | `payesh_node_cpu_seconds_total` |
| RAM | ✅ | `payesh_node_rss_bytes`, `payesh_node_heap_used_bytes` |
| network | 🟡 | `payesh_http_responses_bytes_total` — egress only, no NIC counters |
| **DB TPS** | ❌ | no SQL on the JSON-store path |
| **Redis ops/sec** | ❌ | no Redis in this configuration |

`MS1–MS6` assert that at least seven of the nine are produced **and that the
two missing ones are named**. A coverage check that quietly drops the
unmeasurable rows is worse than no coverage check.

---

## 5. The k6 handoff

`tests/performance/suites/national-load-test.js` is the instrument for the
real run. `K61–K66` verify it exists, defines all four scenarios
(`load_normal` + `load_peak`, `stress_ramp`, `spike_mehr`, `soak_endurance`),
carries `thresholds` including `http_req_failed: rate<0.001`, reads its target
from `__ENV` (no hardcoded host), and points at the national model.

```bash
k6 run -e PAYESH_BASE_URL=… -e SCENARIO=load   tests/performance/suites/national-load-test.js
k6 run -e SCENARIO=stress …    # also: spike, soak, all
```

Thresholds are the SLOs from `docs/WAVE14_OBSERVABILITY.md`:
`p50<120ms · p95<300ms · p99<1000ms · http_req_failed<0.001`.
The read:write mix is 8:1, matching the model.

**`command -v k6` on this machine returns nothing.** The script is not
executed here. That is a fact about the sandbox, not a gap in the script.

---

## 6. What was measured (sandbox, 62/62 run)

```
model : 10,000,000 users · 110,000 schools · 214,286 classes · 288,000,000 grades/yr · peak 20,000 rps
load  : {"normal_rps":1220,"peak_rps":1667,"writes_per_sec":984,
         "normal":{"p50":32.1,"p95":229.5,"p99":234.9},
         "peak":{"p50":34.6,"p95":60.9,"p99":67.8}}
stress: {"curve":[{"conc":50,"p99":17.8,"errs":0},{"conc":150,"p99":44.5,"errs":0},
                  {"conc":300,"p99":34.9,"errs":0},{"conc":500,"p99":34.7,"errs":0}],
         "broke":null}
spike : {"burst_ms":295,"spike_p95":62.3,"calm_p95":4.2,"recovered_p95":3.6}
soak  : {"rounds":30,"requests":480,"seconds":0.21,"p95_first":5.6,"p95_last":6.2,
         "heap_mb":12,"store_kb":170}
جمع: 62 موفق، 0 ناموفق از 62
```

**These are sandbox numbers on a 158 KB store.** They are asserted against
loose budgets on purpose. What transfers to the national run is the *shape* of
every assertion — the leak detectors, the graceful-degradation checks, the
measurement coverage — not the values.

---

## 7. What this does **not** prove

- **No national capacity number.** 1200 requests against a 158 KB store in a
  sandbox says nothing about 20,000 rps. `HANDOFF.md:218` already records the
  same limitation for Wave 12's figures: *«نتیجه ظرفیت ملی نیست و باید در
  Wave 18 تکرار شود.»* This wave builds the instrument; it does not run it.
- **k6 is not installed here** and `soak_endurance` defaults to 2 h (the
  existing `soak-24h-test.js` defaults to 24 h). Neither is a CI workload.
- **The soak is 0.2 s, not days.** It proves the detectors work; it cannot
  find a leak that takes hours to show.
- **DB TPS and Redis ops/sec are absent** because this configuration has
  neither. They appear only on the PostgreSQL + Redis deployment (Waves 1/6).
- **The stress ramp found no breaking point** below 500 concurrent. That is a
  statement about this machine, not about production headroom.
- **The model's ratios are engineering assumptions.** `SCHOOLS=110,000`,
  `STUDENTS_PER_CLASS=28`, the 8:1 read:write mix and the 3× Mehr peak factor
  are stated inputs, not measurements. `NL10` makes them cheap to change;
  someone with real telemetry should.

---

## 8. Next steps to close Wave 18

1. Install k6 in CI and run `SCENARIO=load` nightly against staging.
2. Replace the model's ratios with measured ones from a pilot school's
   telemetry (`PAYESH_*` metrics already exist after Wave 14).
3. Re-run on PostgreSQL + Redis so DB TPS and Redis ops/sec become measurable.
4. Run `SCENARIO=soak` for 24 h and wire `SK2`–`SK10` to the results.
5. Only then write a capacity number into `docs/CAPACITY.md`.

---

## 9. Running it

```bash
node tools/seed-national.js --model          # the 10M world, auditable
node tests/wave18-load.js                    # 62 checks, ~6 s
bash scripts/run-all-tests.sh                # auto-discovered, port 9061 serialised
```
