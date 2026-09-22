#!/usr/bin/env node
'use strict';
const assert = require('assert');
const { createOutbox } = require('../server/outbox');

(async () => {
  const statements = [];
  let updateShouldFail = true;
  const store = { outbox: [{
    id: 9901, type: 'rr.dlq.atomic', collection: 'classes', record_id: 42,
    actor_id: 1, version: 2, payload: { school_id: 1 },
    status: 'processing', retry_count: 5
  }] };

  const db = {
    isPostgres: () => true,
    async transaction(fn) {
      statements.push('BEGIN');
      const client = {
        query: async (sql) => {
          const text = String(sql).trim();
          statements.push(text.split(/\s+/).slice(0, 4).join(' '));
          if (text.startsWith('INSERT INTO server_outbox_dlq')) return { rows: [] };
          if (text.startsWith('UPDATE server_outbox')) {
            if (updateShouldFail) throw new Error('forced source update failure');
            return { rows: [] };
          }
          throw new Error('unexpected SQL: ' + text);
        }
      };
      try {
        const result = await fn(client);
        statements.push('COMMIT');
        return result;
      } catch (e) {
        statements.push('ROLLBACK');
        throw e;
      }
    },
    async query() { throw new Error('non-transactional PG query path used'); }
  };

  const outbox = createOutbox({ store, db });

  const first = await outbox.moveToDlq(store.outbox[0], 'forced');
  assert.strictEqual(first.ok, false, 'source terminal failure must not report DLQ success');
  assert.strictEqual(statements[0], 'BEGIN');
  assert.ok(statements[1].startsWith('INSERT INTO server_outbox_dlq'));
  assert.ok(statements.includes('ROLLBACK'), 'failed source transition must rollback');
  assert.ok(!statements.includes('COMMIT'), 'failed transfer must not commit');
  assert.strictEqual(store.outbox[0].status, 'processing', 'PG rollback must not mutate RAM authority');

  updateShouldFail = false;
  statements.length = 0;
  const second = await outbox.moveToDlq(store.outbox[0], 'forced');
  assert.deepStrictEqual(second, {
    ok: true, id: 9901, status: 'dead_letter', error_message: 'forced'
  });
  assert.ok(statements.includes('COMMIT'));
  assert.ok(statements.includes('UPDATE server_outbox'));
  assert.strictEqual(store.outbox[0].status, 'processing', 'PG path must not mutate RAM authority');

  console.log('DLQ atomicity current-head regression: 2/2 PASS');
})().catch((err) => {
  console.error('DLQ atomicity current-head regression FAILED:', err && err.stack || err);
  process.exit(1);
});
