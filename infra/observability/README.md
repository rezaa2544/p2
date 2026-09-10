# `infra/observability/` — Wave 14

Reference configuration for the **metrics** signal of `docs/WAVE14_OBSERVABILITY.md`.
Nothing here is deployed automatically; it is the artefact an operator imports.

| File | What it is |
|---|---|
| `prometheus.yml` | scrape config + rule/alertmanager wiring |
| `alerts.yml` | Prometheus alerting rules (SLO burn, DB, cache, queue, runtime, security, self-monitoring) |
| `payesh-dashboard.json` | Grafana dashboard (import via Dashboards → New → Import) |

## Bring-up

```bash
# 1. server side — /metrics is fail-closed, so a token is mandatory off-loopback
export PAYESH_METRICS_TOKEN="$(openssl rand -hex 32)"
install -m 0600 /dev/null /etc/prometheus/payesh-metrics.token
printf '%s' "$PAYESH_METRICS_TOKEN" > /etc/prometheus/payesh-metrics.token

# 2. Prometheus
prometheus --config.file=infra/observability/prometheus.yml

# 3. Grafana: import payesh-dashboard.json, pick the Prometheus datasource
```

## Security notes (read before exposing anything)

- **Never** expose `/metrics` to the public internet. It reveals traffic shape, tenant
  activity, error rates and internal pool sizes — useful reconnaissance.
- The token file is `0600` and **never committed** (`.gitignore` covers `.env*`, `*.key`,
  `*.pem`; `tools/secret-scan.js` is the pre-push gate).
- In production with **no** `PAYESH_METRICS_TOKEN`, the server returns **404** for
  `/metrics` — the endpoint does not exist. Prometheus will then report the target as down,
  which is the correct outcome: a misconfigured deploy should be loud.
- Scrape over TLS (`scheme: https`). The token is a bearer credential.

## Verification status

The metric **names and labels** referenced by `alerts.yml` and `payesh-dashboard.json` are
asserted against `server/metrics.js` by `tests/wave14-observability.js` (drift guard), so a
rename in code breaks the test instead of silently blinding the on-call. The rules
themselves have **not** been firing-tested against a live Prometheus in the sandbox — that
is recorded honestly in `docs/WAVE14_OBSERVABILITY.md` §8.
