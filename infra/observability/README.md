# `infra/observability/` — Wave 14

Reference configuration for the metrics signal in `docs/WAVE14_OBSERVABILITY.md`. Nothing here is deployed automatically; the Compose stack is an operator-managed service.

| File | What it is |
|---|---|
| `prometheus.yml` | scrape config, canonical alert rules, and Alertmanager wiring |
| `alert-rules.yml` | Prometheus alerting rules (SLO burn, DB, cache, queue, runtime, security, self-monitoring) |
| `payesh-dashboard.json` | Grafana dashboard (import via Dashboards → New → Import) |

## Bring-up

The API's `PAYESH_METRICS_TOKEN` and the Prometheus credentials file must contain the same strong random value. Keep the API token in its secret store; do not put it in Compose YAML or commit it. The pinned Prometheus image runs as non-root UID/GID `65534:65534` (`nobody`). The token file must be owned by that UID/GID and have mode `0600`, so only the Prometheus process can read it inside the container.

```bash
# Generate once, then deliver PAYESH_METRICS_TOKEN to each API instance
export PAYESH_METRICS_TOKEN="$(openssl rand -hex 32)"
export PROMETHEUS_UID=65534 PROMETHEUS_GID=65534
export PAYESH_METRICS_TOKEN_FILE=/run/secrets/payesh_metrics_token
sudo install -d -m 0700 /run/secrets
sudo install -o "$PROMETHEUS_UID" -g "$PROMETHEUS_GID" -m 0600 /dev/null "$PAYESH_METRICS_TOKEN_FILE"
printf '%s' "$PAYESH_METRICS_TOKEN" | sudo tee "$PAYESH_METRICS_TOKEN_FILE" >/dev/null

# Configure the remaining values in the git-ignored Compose env file
cp infra/observability/env.observability.example infra/observability/.env.observability
$EDITOR infra/observability/.env.observability
# Set GRAFANA_PASSWORD, PAYESH_LOG_DIR, PAYESH_METRICS_TOKEN_FILE,
# PROMETHEUS_UID, PROMETHEUS_GID, and the owner-provided Alertmanager endpoint.

docker compose -f infra/observability/docker-compose.observability.yml \
  --env-file infra/observability/.env.observability up -d
```

`PROMETHEUS_UID`/`PROMETHEUS_GID` must match the owner assigned to the mounted file. If the pinned image changes, verify its runtime identity before changing these values. The file contains no trailing newline. Rotate the value in the API secret store and file together.

## Security notes (read before exposing anything)

- **Never** expose `/metrics` to the public internet. It reveals traffic shape, tenant activity, error rates and internal pool sizes — useful reconnaissance.
- The token file is mode `0600`, owned by the Prometheus process UID, and **never committed** (`.gitignore` covers `.env*`, `*.key`, `*.pem`; `tools/secret-scan.js` is the pre-push gate).
- In production with **no** `PAYESH_METRICS_TOKEN`, the server returns **404** for `/metrics` — the endpoint does not exist. Prometheus will then report the target as down, which is the correct fail-closed outcome.
- Scrape over TLS (`scheme: https`). The token is a bearer credential.

## Verification status

The metric **names and labels** referenced by `alert-rules.yml` and `payesh-dashboard.json` are asserted against `server/metrics.js` by `tests/wave14-observability.js` (drift guard), so a rename in code breaks the test instead of silently blinding the on-call. The rules themselves have **not** been firing-tested against a live Prometheus in a local sandbox; that is recorded honestly in `docs/WAVE14_OBSERVABILITY.md` §8. The M15-01 GitHub workflow is a disposable CI exercise, not production or E4 certification.
