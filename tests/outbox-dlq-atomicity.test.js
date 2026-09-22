#!/usr/bin/env node
'use strict';

const assert = require('assert');
const { createOutbox } = require('../server/outbox');

(async () => {
  const statements = [];
  let updateShouldFail = true;
  const store = {
    outbox: [{
      id: 9901, type: 'rr.dlq.atomic', collection: 'classes',
      record_id: 42, actor_id: 1, version: 2, payload: { school_id: 1 },
      status: 'processing', retry_count: 5
    }]
  };

  const db = {
    isPostgres: () => true,
    async transaction(fn) {
      statements.push('BEGIN');
      const client = {
        query: async (sql, params) => {
          statements.push(String(sql).trim().split(/\s+/).slice(0, 4).join(' '));
          if (String(sql).startsWith('INSERT INTO server_outbox_dlq')) return { rows: [] };
          if (String(sql).startsWith('UPDATE server_outbox')) {
            if (updateShouldFail) throw new Error('forced source update failure');
            return { rows: [] };
          }
          if (String(sql) === 'COMMIT') return { rows: [] };
          if (String(sql) === 'ROLLBACK') return { rows: [] };
          throw new Error('unexpected SQL: ' + sql);
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
  assert.strictEqual(first.ok, false, 'DLQ must not claim success when source terminal update fails');
  assert.deepStrictEqual(statements.slice(0, 2), ['BEGIN', 'INSERT INTO server_outbox_dlq']);
  assert.strictEqual(statements.includes('ROLLBACK'), true, 'failed transfer must rollback atomically');
  assert.strictEqual(statements.includes('COMMIT'), false, 'failed transfer must not commit');
  assert.strictEqual(store.outbox[0].status, 'processing', 'memory mirror must not claim terminal success on rollback');

  updateShouldFail = false;
  statements.length = 0;
  const second = await outbox.moveToDlq(store.outbox[0], 'forced');
  assert.strictEqual(second.ok, true);
  assert.strictEqual(second.status, 'dead_letter');
  assert.strictEqual(statements.includes('COMMIT'), true);
  assert.strictEqual(store.outbox[0].status, 'processing', 'PG path must not mutate RAM authority');

  console.log('DLQ atomicity: 2/2 PASS');
})().catch((err) => {
  console.error('DLQ atomicity FAILED:', err && err.stack || err);
  process.exit(1);
});
