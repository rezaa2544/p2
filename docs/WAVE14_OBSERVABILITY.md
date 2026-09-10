
# Wave 14 — Observability (Metrics · Logs · Traces)

**Wave:** 14 — Observability (Roadmap §17) · **Owner:** Arena 4 + Arena 5
**Branch:** `arena/01a0867f-p2` · **Date:** 2026-09-09
**Status:** ✅ implemented (metrics) · 🟡 logs/traces wired earlier, catalogued here

> **Addendum rule (`docs/NATIONAL_ROADMAP_ARCHITECTURE_ADDENDUM.md`):** this wave is
> evidence-backed. Every metric named below exists in `server/metrics.js` and is
> asserted by `tests/wave14-observability.js`. Nothing in this document is aspirational
> unless it is explicitly marked **DESIGN**.

---

## 1. Why this wave exists

`docs/BOTTLENECK_MAP.md` and `docs/THREAT_MODEL.md` (Wave -1) named the same root risk
from two directions: **we cannot manage what we cannot measure, and we cannot contain a
failure we cannot see.** Before Wave 14 the server had:

| Signal | State before Wave 14 |
|---|---|
| **Traces** | ✅ OpenTelemetry (`server/tracing.js`, `infra/tracing/`) — Wave "tracing-chat3" |
| **Logs** | ✅ structured audit events with masking (`server/audit.js`) |
| **Metrics** | ❌ none. No RPS, no p95, no error rate, no cache hit rate, no pool wait. |

So the two questions that decide a national rollout — *"what is our p95 today?"* and
*"is that a real regression or noise?"* — had no answer. Wave 14 closes the metrics gap
and puts all three signals under one catalogue.

---

## 2. Architecture

```text
                    ┌───────────────────────────────────────────┐
                    │  payesh-server (stateless, N instances)   │
                    │                                           │
   request ───────► │  onRequest() ── res.on('finish')          │
                    │     │            │                        │
                    │     │            └─► observeHttpRequest() │──┐
                    │     ▼                                     │  │
                    │  routes ── db.js ──► observeDb()          │  │  metrics.js
                    │           cache.js ─► cache/rate-limit    │  │  (in-process
                    │           auth  ────► observeAuth()       │  │   registry,
                    │           sync  ────► observeSyncBatch()  │  │   no deps)
                    │                                           │  │
                    │  startRuntimeCollector() ─────────────────┼──┤
                    │     heap / rss / cpu / event-loop lag     │  │
                    │                                           │  ▼
                    │  GET /metrics  ◄── scrapeGate() ──────────┼── Prometheus text 0.0.4
                    └───────────────────────────────────────────┘        │
                                                                         ▼
                                                     Prometheus ──► Alertmanager ──► on-call
                                                          │
                                                          └──► Grafana (dashboards)
   traces:  server/tracing.js ──► OTLP ──► collector ──► Jaeger/Tempo
   logs:    server/audit.js ──► audit.log (masked) ──► shipper ──► Loki/ELK
```

**Decision — no `prom-client`, no OTel Metrics SDK.** The server's contract is
"Runtime deps: Node stdlib only" (`server/index.js` header), and tracing already owns the
OTel pipeline for the *trace* signal. Adding a second metrics pipeline would give us two
sources of truth for the same number. The exposition format is ~40 lines; the value of
`server/metrics.js` is the **discipline** around it (bounded cardinality, label redaction,
fail-closed scraping), not the format writer.

---

## 3. The five design rules (enforced, not advisory)

| # | Rule | Implementation | Test |
|---|---|---|---|
| **R1** | Observability **never** breaks the request path | every recorder is wrapped in try/catch and counts its own failures | `M4` |
| **R2** | **Bounded cardinality** — a hostile or buggy caller cannot grow the registry | `PAYESH_METRICS_MAX_SERIES` (default 1024) per metric; overflow is dropped and counted in `payesh_metrics_dropped_series_total` | `M5`, `M6` |
| **R3** | **No PII, no raw URLs** in labels | `routeTemplate()` collapses paths to a closed allowlist; `/api/…` that does not match becomes `api_unmatched`; SQL text, phone, nid, ip are never labels | `M2`, `M3`, `T7` |
| **R4** | **Fail-closed** scraping | production without `PAYESH_METRICS_TOKEN` ⇒ the endpoint does not exist (404); token compare is timing-safe; dev allows loopback only | `M8`–`M11` |
| **R5** | Labels are **declared** per metric | unknown label key / bad metric name / bad value ⇒ observation dropped and counted, never thrown | `M7` |

**Failure scenario we planned for:** an attacker hits `/api/v1/students/<random id>` in a
loop. A naive `route = req.url` label would create one series per id — unbounded memory
growth driven by an unauthenticated request (a metrics-induced OOM, i.e. an availability
attack). R2 + R3 make that structurally impossible: the id never becomes a label, and even
a hypothetical unbounded label is capped and counted.

---

## 4. Metric catalogue

Everything below is emitted by `server/metrics.js`. `# TYPE` is authoritative.

### 4.1 HTTP (RED: Rate, Errors, Duration)

| Metric | Type | Labels | Purpose |
|---|---|---|---|
| `payesh_http_requests_total` | counter | `route`, `method`, `code` | RPS and error rate (`code` ∈ 2xx/4xx/5xx) |
| `payesh_http_request_duration_seconds` | histogram | `route`, `method` | p50/p95/p99 latency |
| `payesh_http_responses_bytes_total` | counter | `route` | payload-size regressions |

`route` is a **template** (`/api/v1/students/:id`), never a concrete path.

### 4.2 Auth / abuse

| Metric | Type | Labels | Purpose |
|---|---|---|---|
| `payesh_auth_otp_requests_total` | counter | `outcome` = `sent` \| `rate_limited` \| `rejected` | OTP-send pressure |
| `payesh_auth_login_total` | counter | `outcome` = `ok` \| `failed` \| `rate_limited` \| `rejected` | credential stuffing |
| `payesh_auth_rejections_total` | counter | `stage` = `count` \| `warn` \| `slow1` \| `slow2` \| `revoke` | R97 enumeration guard escalation |

Outcomes are derived from the HTTP status `server/auth.js` already chose — no new decision
points were introduced, so metrics cannot drift from behaviour.

### 4.3 Sync / A01

| Metric | Type | Labels | Purpose |
|---|---|---|---|
| `payesh_sync_requests_total` | counter | `code` | sync health |
| `payesh_sync_batch_ops` | histogram | — | offline-queue drain size per push (buckets 1…500) |
| `payesh_sync_conflicts_total` | counter | `collection` | optimistic-concurrency conflicts |

### 4.4 Database

| Metric | Type | Labels | Purpose |
|---|---|---|---|
| `payesh_db_query_duration_seconds` | histogram | `op`, `target` | SQL latency; `op` ∈ `query` \| `query_read` \| `transaction` |
| `payesh_db_query_errors_total` | counter | `op`, `target` | error rate by path |
| `payesh_db_slow_queries_total` | counter | `op`, `target` | > `PAYESH_DB_SLOW_MS` (default 250) |
| `payesh_db_pool_connections` | gauge | `pool`, `state` | total / idle per pool (`primary`, `read_replica`) |
| `payesh_db_pool_waiting` | gauge | `pool` | **connection-pool wait** — the leading indicator of exhaustion |

SQL text is **never** a label: it would leak student data into the monitoring stack and
explode cardinality.

### 4.5 Cache / Redis / rate limit

| Metric | Type | Labels | Purpose |
|---|---|---|---|
| `payesh_cache_lookups_total` | counter | `layer` (`l1_memory`\|`l2_redis`), `outcome` (`hit`\|`miss`) | **cache hit rate** |
| `payesh_cache_invalidations_total` | counter | `scope` (`school`\|`global`) | invalidation storms |
| `payesh_rate_limit_decisions_total` | counter | `action`, `decision` (`allowed`\|`denied`) | distributed limiter pressure |

### 4.6 Async / queue

| Metric | Type | Labels | Purpose |
|---|---|---|---|
| `payesh_outbox_depth` | gauge | `status` (`pending`\|`processed`\|`failed`\|`legacy`\|`total`) | queue growth = worker not keeping up |
| `payesh_worker_events_total` | counter | `outcome` | worker success/failure |

### 4.7 Runtime

| Metric | Type | Labels | Purpose |
|---|---|---|---|
| `payesh_node_heap_used_bytes`, `payesh_node_heap_total_bytes` | gauge | — | **memory leak** (soak) |
| `payesh_node_rss_bytes` | gauge | — | RSS growth |
| `payesh_node_eventloop_lag_seconds` | gauge | — | **event-loop lag** — the real "server is saturated" signal |
| `payesh_node_cpu_seconds_total` | gauge | `mode` (`user`\|`system`) | CPU burn |
| `payesh_node_uptime_seconds` | gauge | — | restart detection |
| `payesh_build_info` | gauge | `version`, `phase` | deploy correlation |
| `payesh_metrics_dropped_series_total` | counter | — | the cardinality guard firing (should be 0) |

`payesh_node_cpu_seconds_total` is declared as a **gauge** on purpose: we `set` an absolute
seconds value from `process.cpuUsage()`. Declaring a counter and then setting it would be a
lie in the exposition format.

---

## 5. SLOs and alerting

Targets below are the Wave 14 contract. They are intentionally conservative until Wave 18
(national load test) replaces them with measured numbers — see §9.

| SLO | Target | Prometheus expression |
|---|---|---|
| Availability | 99.95 % / 30 d | `1 - sum(rate(payesh_http_requests_total{code=~"5.."}[5m])) / sum(rate(payesh_http_requests_total[5m]))` |
| Latency | p95 < 300 ms, p99 < 1 s | `histogram_quantile(0.95, sum by (le) (rate(payesh_http_request_duration_seconds_bucket[5m])))` |
| DB | p95 < 50 ms | `histogram_quantile(0.95, sum by (le)(rate(payesh_db_query_duration_seconds_bucket[5m])))` |
| Cache | hit rate > 80 % | `sum(rate(payesh_cache_lookups_total{outcome="hit"}[15m])) / sum(rate(payesh_cache_lookups_total[15m]))` |
| Error budget burn | < 2 % / h | see `CriticalErrorBudgetBurn` in `infra/observability/alerts.yml` |

Alert rules live in **`infra/observability/alerts.yml`** (Prometheus rule format) and cover:
5xx spike, latency SLO breach, error-budget burn, DB pool saturation, DB error rate, slow
queries, cache-miss storm, outbox backlog, event-loop lag, heap growth, restart loop,
scrape-down, and **the cardinality guard firing** (an alert on our own safety valve).

Dashboards live in **`infra/observability/payesh-dashboard.json`** (Grafana, import-ready):
Overview (RED), Database, Cache & Redis, Sync & Queue, Runtime.

---

## 6. The other two signals

### 6.1 Traces (already live)
`server/tracing.js` initialises OTel **before** `http` is required, propagates the trace id
into `req.context.trace_id` and the `X-Trace-Id` response header, and scrubs URLs/query
strings before they reach span attributes (`redactUrl`, `scrubUrlAttributes`). Sampling and
exporter config: `infra/tracing/`. **Correlation:** the `X-Trace-Id` header lets an on-call
engineer go from a Prometheus spike → the exact trace → the audit event.

### 6.2 Logs (already live)
`server/audit.js` writes masked, structured events (`authz_failure`, `enum_warn`,
`backup_created`, `metrics_denied`, …). Wave 14 added `metrics_denied` so a rejected scrape
is itself auditable. **Rule (unchanged):** no password, full national id, or token ever
reaches a log line.

**Log/metric boundary:** metrics answer *how much / how fast / how many*; logs answer *which
actor and why*. PII belongs only in the masked log, never in a label.

---

## 7. Operations

### 7.1 Configuration

| Env | Default | Meaning |
|---|---|---|
| `PAYESH_METRICS` | `1` | `0` disables `/metrics` entirely (404) |
| `PAYESH_METRICS_TOKEN` | — | bearer token for `/metrics`. **Required in production.** |
| `PAYESH_METRICS_MAX_SERIES` | `1024` | per-metric label-series cap (R2) |
| `PAYESH_METRICS_INTERVAL_MS` | `5000` | runtime sampling period (min 250 ms) |
| `PAYESH_DB_SLOW_MS` | `250` | slow-query threshold |

### 7.2 Scrape matrix (verified live, see §8)

| Environment | `PAYESH_METRICS_TOKEN` | Result |
|---|---|---|
| production | unset | **404** — endpoint does not exist |
| production | set | 200 with correct `Bearer`, **403** otherwise |
| dev/test | unset | 200 from loopback, **403** from any other address |
| any | `PAYESH_METRICS=0` | **404** |

A Prometheus scrape config for this is in `infra/observability/prometheus.yml`.

### 7.3 Runbook pointers
- `payesh_db_pool_waiting > 0` sustained → see `docs/DATABASE_PERFORMANCE_OPTIMIZATION.md`
  and Wave 10's replica routing (`docs/WAVE10_DB_SCALE.md`).
- `payesh_outbox_depth{status="pending"}` growing → worker is behind or failing; check
  `payesh_worker_events_total{outcome="failed"}` and `docs/ASYNC_ARCHITECTURE.md`.
- `payesh_node_eventloop_lag_seconds` high with low CPU → a synchronous hot path; profile
  per `docs/BOTTLENECK_MAP.md`.
- `payesh_metrics_dropped_series_total` increasing → a label is unbounded. **Treat as a bug**,
  find the recorder, do not raise the cap.

---

## 8. Verification (what was actually executed)

| Check | Command | Result |
|---|---|---|
| Registry unit + policy suite | `node tests/wave14-observability.js` | **see §10** |
| Registry mutation suite | `node tests/wave14-observability-mutations.js` | **see §10** |
| Server boots, `/metrics` renders real series | `PORT=8123 node server/index.js` + `curl /metrics` | 200; `payesh_http_requests_total`, latency histogram, `payesh_outbox_depth`, `payesh_node_heap_used_bytes`, `payesh_build_info` all present, `payesh_metrics_dropped_series_total 0` |
| Scrape gate, 4 configurations | see §7.2 matrix | 404 / 403 / 200 exactly as specified |
| Regression | `node tests/smoke.js` · `node tools/check-authz.js` · `node tests/secret-scan.js` | see §10 |

**Honest gap:** no live Prometheus/Grafana instance was run in this sandbox, so the alert
*expressions* are not yet firing-tested against real time series — they are syntactically
Prometheus rules and are asserted for presence by the Wave 14 suite. The metric **names and
labels they reference** are asserted to exist in `server/metrics.js`, so a rename cannot
silently break the alerts (drift guard `T8`).

---

## 9. What Wave 14 deliberately does **not** do

- **Wave 15** owns `/liveness`, `/readiness` vs `/health` semantics and graceful shutdown
  (stop traffic → drain → stop workers → **flush telemetry** → close DB/Redis). The
  collector here is `unref`'d precisely so shutdown sequencing stays Wave 15's decision.
- **Wave 18** owns the *numbers*. The SLO targets in §5 are placeholders until the national
  load test measures real p95/p99 at 10 M-user scale.
- **Exemplars / trace-to-metric links** (Prometheus exemplars pointing at a trace id) are
  **DESIGN** only — they need the OTLP metrics path we chose not to add.

---

## 10. Gate summary

Recorded in the Wave 14 commit series and in `HANDOFF.md`:

- `tests/wave14-observability.js` — registry, policy, exposition, drift guards
- `tests/wave14-observability-mutations.js` — mutation kills (guard removed, gate opened, …)
- `node tests/smoke.js` → **547/547** (unchanged — no client code touched)
- `node tools/check-authz.js` → **exit 0**
- `node tests/secret-scan.js` → **11/11**

---

# ویو ۱۴ — Observability (سابقهٔ اجرا)

## فازِ ۱ (چت ۳ — مرج‌شده در PR #22): Tracing
OTel در `server/tracing.js` — W3C trace برای هر درخواست، `X-Trace-Id`،
`trace_id` در خطوطِ JSON لاگ ممیزی، no-PII (`redactForSpan`/`redactUrl`)،
fail-open، export OTLP/HTTP. ایمیج‌های Jaeger در `infra/tracing/`.

## فازِ ۲ (۲۰۲۶-۰۹-۱۰ — این سشن): Metrics + استقرارِ زنده
**چرا فازِ ۲ لازم بود:** چک‌لیستِ Production Readiness سه ❌ روی محور
Observability داشت (dashboards / alerts / live deployment) — کدِ tracing
بود اما هیچ scrape target و هیچ استکِ قابل‌اجرایِ واقعی نداشت.

| بخش | تحویل |
|---|---|
| Exporter | `server/metrics.js` — Prometheus text، صفرِ وابستگیِ جدید؛ http histogram/counters با tapِ `res finish`، guardهایِ کاردینالیتی (route bounded، self-scrape حذف)، lag با `monitorEventLoopDelay`، GC با `PerformanceObserver`، heap با `v8`؛ pullsِ زمان-اسکرپ (redis ping / db healthCheck / outbox count) تک‌تک guard شده ⇒ سرویسِ مرده = `*_up=0` نه /metrics شکسته. وایرینگ `index.js`: مسیرِ `/metrics` (+ دروازهٔ اختیاریِ `METRICS_TOKEN`) و `metrics.attach(server)` |
| استک | `infra/observability/docker-compose.observability.yml` — prometheus v2.54.1، alertmanager v0.27.0، grafana 11.2.0، loki/promtail 3.1.1، otelcol-contrib 0.100.0، jaeger 1.59؛ همۀ bind‌ها 127.0.0.1؛ env-file (`GRAFANA_PASSWORD` اجباری) |
| قوانین | `alert-rules.yml` هفت‌گانهٔ بحرانی با آستانه‌هایِ مصوب — نام‌های متریک با metrics.js قفلِ متقابل |
| داشبورد | `dashboards/payesh-main.json` (۱۰ پنل) + `payesh-logs.json` (جست‌وجوی trace_id) + provisioningِ دیتاسورس‌ها با uidهایِ `payesh-prom/loki/jaeger` و لینکِ exemplar→Jaeger |
| تست | `tests/observability-config.js` **55/55** · `tests/observability-dashboards.js` **30/30** · `tests/observability-config-mutations.js` **6/6** (M1 حذفِ قانون، M2 رانشِ p95، M3 رانشِ پورت OTLP، M4 رانشِ مسیرِ اسکرپ، M5 رانشِ نامِ متریک + خط‌پایه) |

**نکاتِ طراحی:**
1. **ضدرانشِ سه‌جانبه:** تست‌ها نامِ متریک را بینِ `metrics.js ⇄ alert-rules ⇄ dashboards` و پورتِ OTLP را بینِ `tracing.js ⇄ compose` می‌پایند — تغییرِ یک‌طرفه CI را می‌شکند (این دقیقاً همان چیزی است که M3/M4/M5 اثبات می‌کنند).
2. **امنی:** edge هرگز `/metrics` را روت نمی‌کند (nginx فقط `/api/` و استاتیک)؛ اسکرپ از داخلِ میزبان/شبکه؛ توکن اختیاری.
3. **هزینه:** تاپِ درخواست ≈ ۲ فراخوانیِ hrtime در `finish`؛ کارهایِ گران فقط زمانِ اسکرپ (۱۵ث). smoke بدونِ تغییرِ رفتار سبز ماند (۵۴۷/۵۴۷).
4. **راهنمای استقرار + Import:** `docs/OBSERVABILITY_DEPLOYMENT.md`.

## باقی‌مانده (محیطِ واقعی)
- اجرایِ compose روی میزبان + تأییدِ targets UP در `/targets`
- تنظیمِ __WEBHOOK_URL__ واقعی و یک آلتِ تست (`amtool` یا injectِ خطایِ مصنوعی)
- در صورتِ نیازِ دیتاسنتر-دومی: scrape config با targetهایِ منطقه (مستند در prometheus.yml)
