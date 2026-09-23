#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');

const outbox = fs.readFileSync(require.resolve('../server/outbox.js'), 'utf8');
const worker = fs.readFileSync(require.resolve('../server/worker.js'), 'utf8');
const up = fs.readFileSync(require.resolve('../migrations/021_outbox_processing_lease.sql'), 'utf8');
const down = fs.readFileSync(require.resolve('../migrations/021_outbox_processing_lease.down.sql'), 'utf8');

const checks = [
  ['lease token is persisted by migration', /ADD COLUMN IF NOT EXISTS processing_token TEXT/.test(up)],
  ['rollback removes lease token', /DROP COLUMN IF EXISTS processing_token/.test(down)],
  ['PG claim generates a fresh token', /const claimToken = crypto\.randomUUID\(\)/.test(outbox)],
  ['PG claim writes processing token atomically', /processing_token = \$3/.test(outbox)],
  ['PG claim returns processing token to worker', /RETURNING[\s\S]*processing_token/.test(outbox)],
  ['memory claim generates a fresh token', /e\.processing_token = crypto\.randomUUID\(\)/.test(outbox)],
  ['worker passes claim token on successful completion', /outbox\.mark\(evt\.id, \{[\s\S]*\}, leaseToken\)/.test(worker)],
  ['worker passes claim token on retry/failure transition', /outbox\.mark\(evt\.id, patch, leaseToken\)/.test(worker)],
  ['worker passes claim token into DLQ transition', /outbox\.moveToDlq\(evt, errMsg, leaseToken\)/.test(worker)],
  ['PG mark guards processing state and token', /status = \'processing\' AND processing_token = \$6/.test(outbox)],
  ['PG terminal/retry transition clears processing ownership', /processing_at = NULL, processing_token = NULL/.test(outbox)],
  ['stale worker transition is rejected instead of mutating memory', /if \(guarded && \(evt\.status \|\| \'pending\'\) === \'processing\' && evt\.processing_token !== String\(leaseToken\)\)\s*\{\s*return null;/.test(outbox)],
  ['lease-aware DLQ inserts only for current token', /FROM server_outbox\s+WHERE id = \$1 AND status = \'processing\' AND processing_token = \$3/.test(outbox)],
  ['lease-aware DLQ source update is fenced', /UPDATE server_outbox[\s\S]*WHERE id = \$1 AND status = \'processing\' AND processing_token = \$3/.test(outbox)]
];

checks.forEach(([name, ok]) => assert.ok(ok, name));
console.log('Lease fencing static contract: ' + checks.length + '/' + checks.length + ' PASS');
