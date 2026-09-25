#!/usr/bin/env node
/* A-04 runtime reproduction (probe — NOT project code).
 * Uses the REAL server/ids.js createIds() with the memory-store path
 * (db null => guardedMaxPlusOne) and the REAL caller pattern from
 * server/sync.js: `id = await ids.nextId(c, list)` … awaits … `list.push(record)`.
 * Mode 2: DATABASE_URL set => same harness against the live PG sequence path.
 * Reports duplicate ids across concurrent simulated push handlers.
 */
'use strict';
const path = require('path');
const { createIds } = require(path.join(__dirname, '..', 'server', 'ids'));

const N = Number(process.env.A04_N || 300);

async function main() {
  let db = null;
  if (process.env.DATABASE_URL) {
    const { Client } = require('pg');
    db = new Client({ connectionString: process.env.DATABASE_URL });
    db.isPostgres = () => true; /* same trick as tests/id-collision.js */
    await db.connect();
  }
  const ids = createIds({ db, cache: null });
  const store = { notifications: [] };

  async function handler(i) {
    /* real pattern: fetch id via ids service … */
    const id = await ids.nextId('notifications', store.notifications);
    /* … other awaited work in the handler before the record is stored … */
    await new Promise((r) => setTimeout(r, 1 + Math.floor(Math.random() * 5)));
    store.notifications.push({ id, i });
  }

  const t0 = Date.now();
  await Promise.all(Array.from({ length: N }, (_, i) => handler(i)));
  const ms = Date.now() - t0;

  const seen = new Map();
  for (const rec of store.notifications) seen.set(rec.id, (seen.get(rec.id) || 0) + 1);
  const dups = [...seen.entries()].filter(([, c]) => c > 1);
  const unique = seen.size;
  console.log(JSON.stringify({
    mode: db ? 'postgres' : 'memory',
    N, stored: store.notifications.length, unique_ids: unique,
    duplicate_ids: dups.length, duplicate_rows: dups.reduce((a, [, c]) => a + (c - 1), 0),
    sample: dups.slice(0, 5).map(([id, c]) => ({ id, count: c })),
    wall_ms: ms,
  }));
  if (db) await db.end();
  /* exit 0 either way — this is a measurement probe, not a pass/fail gate */
}
main().catch((e) => { console.error('FAIL', e); process.exit(1); });
