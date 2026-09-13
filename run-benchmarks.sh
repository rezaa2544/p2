#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════
# run-benchmarks.sh — Root Entrypoint for Payesh k6 Load Testing
# ═══════════════════════════════════════════════════════════════════
exec bash "$(dirname "$0")/tests/performance/run-benchmarks.sh" "$@"
