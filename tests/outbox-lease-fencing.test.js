#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');

const outbox = fs.readFileSync(require.resolve('../server/outbox.js'), 'utf8');
const worker = fs.readFileSync(require.resolve('../server/worker.js'), 'utf8');
const up = fs.readFileSync(require.resolve('../migrations/021_outbox_processing_lease.sql'), 'utf8');
const down = fs.readFileSync(require.resolve('../migrations/021_outbox_processing_lease.down.sql'), 'utf8');

const checks = [
  ['lease token is persisted by migration', up.includes('processing_token TEXT')],
  ['rollback removes lease token', down.includes('DROP COLUMN IF EXISTS processing_token')],
  ['PG claim generates a fresh token', outbox.includes('const claimToken = crypto.randomUUID()')],
  ['PG claim writes processing token atomically', outbox.includes('processing_token = $3')],
  ['PG claim returns processing token to worker', outbox.includes('RETURNING o.id') && outbox.includes('o.processing_token')],
  ['memory claim generates a fresh token', outbox.includes('e.processing_token = crypto.randomUUID()')],
  ['worker passes claim token on successful completion', worker.includes('outbox.mark(evt.id, {') && worker.includes('}, leaseToken)')],
  ['worker passes claim token on retry/failure transition', worker.includes('outbox.mark(evt.id, patch, leaseToken)')],
  ['worker passes claim token into DLQ transition', worker.includes('outbox.moveToDlq(evt, errMsg, leaseToken)')],
  ['PG mark has a lease-token predicate', outbox.includes('processing_token = $6')],
  ['PG terminal/retry transition clears processing ownership', outbox.includes('processing_at = NULL, processing_token = NULL')],
  ['stale worker ownership mismatch returns without mutation', outbox.includes('evt.processing_token !== String(leaseToken)') && outbox.includes('if (guarded')],
  ['lease-aware DLQ source is selected by token', outbox.includes('FROM server_outbox') && outbox.includes('processing_token = $3')],
  ['lease-aware DLQ source update is fenced', outbox.includes('UPDATE server_outbox') && outbox.includes('WHERE id = $1 AND status = \'processing\' AND processing_token = $3')]
];

checks.forEach(([name, ok]) => assert.ok(ok, name));
console.log('Lease fencing static contract: ' + checks.length + '/' + checks.length + ' PASS');
