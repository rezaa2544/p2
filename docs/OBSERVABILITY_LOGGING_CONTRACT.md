# Observability logging contract

## Canonical stream

The application logging source is **stdout/stderr**. The application must not create a second in-process logger solely for Promtail.

For the file-based Promtail deployment in `infra/observability/docker-compose.observability.yml`, the host process supervisor is responsible for redirecting the combined application stdout/stderr stream to:

`$PAYESH_LOG_DIR/server.log`

`server/audit.js` remains the canonical structured audit sink and writes `audit.log` under the configured audit path.

## Why Promtail tails files

The observability compose stack runs Promtail separately from the application process. It cannot consume the application's stdout directly. Therefore the deployment boundary must provide the file stream expected by `infra/observability/promtail.yml`.

This is a deployment contract, not an application logging implementation.

## Readiness checks

A deployment is not observability-ready unless:

1. `$PAYESH_LOG_DIR/server.log` exists and is writable by the host logging path.
2. Application stdout/stderr is redirected to that file by the process supervisor/container runtime.
3. `$PAYESH_LOG_DIR/audit.log` exists when audit traffic is expected.
4. Promtail can read both files.
5. A test request produces a line in `server.log`, and an audit-producing request produces a JSON line in `audit.log`.

If the host supervisor has no file-redirect contract, do **not** add a second application logger merely to satisfy Promtail. Either configure the supervisor/container log driver to materialize the file stream or change the deployment architecture to a native stdout collector as a separate, explicitly owned task.

## False-green rule

A syntactically valid Promtail configuration is not evidence that logs are flowing. A live drill must observe a newly generated application line arriving at Loki.
