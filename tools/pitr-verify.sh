#!/usr/bin/env bash
# Strict restore verifier. A checksum printed without an approved comparison is
# not verification. See docs/DR_EVIDENCE_CONTRACT.md for manifest provenance.
set -euo pipefail
MANIFEST="${PITR_EXPECT_MANIFEST:-}"; DATA_DIR="${PITR_EXPECT_DATA_DIR:-}"
export PGDATABASE="${PGDATABASE:-payesh}" PGUSER="${PGUSER:-postgres}" PGCONNECT_TIMEOUT="${PGCONNECT_TIMEOUT:-5}"
while [ $# -gt 0 ]; do
  case "$1" in
    --manifest) [ $# -ge 2 ] || exit 2; MANIFEST="$2"; shift 2;;
    --expect-data-dir) [ $# -ge 2 ] || exit 2; DATA_DIR="$2"; shift 2;;
    --host-dir) [ $# -ge 2 ] || exit 2; export PGHOST="$2"; shift 2;;
    --port) [ $# -ge 2 ] || exit 2; export PGPORT="$2"; shift 2;;
    *) echo "FAIL: unsupported option $1; supply --manifest and --expect-data-dir" >&2; exit 2;;
  esac
done
[ -r "$MANIFEST" ] && [ -n "$DATA_DIR" ] || { echo 'FAIL: approved expected manifest and explicit restore data_directory required' >&2; exit 1; }
exec python3 "$(dirname "$0")/pitr-manifest.py" --verify "$MANIFEST" --expect-data-dir "$DATA_DIR"
