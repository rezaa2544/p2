#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   tools/reseed-from-pg.js — Wave 1: PG → JSON emergency reseed
   -------------------------------------------------------------------
   Failover rule (docs/WAVE1_WRITES_INVENTORY.md §4): periodic JSON persist
   is OFF while PostgreSQL is live, so after a PG-era the payesh.json file
   may be stale. Before booting in memory mode, run this against the LIVE
   PG to rebuild a fresh payesh.json from the authoritative database.

   Usage:  DATABASE_URL=postgres://... node tools/reseed-from-pg.js
   Writes: server/data/payesh.json (0600, atomic tmp+rename). Refuses to
   overwrite unless PG answered and returned at least the users table.
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'server', 'data', 'payesh.json');

(async () => {
  if (!process.env.DATABASE_URL) {
    console.error('refusing: DATABASE_URL is not set (need a LIVE PostgreSQL)');
    process.exit(2);
  }
  const db = require('../server/db');
  const store = { __processed_uids: {}, __revoked_jti: {}, __auth: { codes: {}, login_fail: {}, code_rate: {}, enum: {} } };
  const info = await db.init(store);
  if (!db.isPostgres()) {
    console.error('refusing: PostgreSQL not reachable (' + (info.warning || 'unknown') + ')');
    process.exit(2);
  }
  const h = await db.hydrateStoreFromPg(store);
  if (!Array.isArray(store.users) || store.users.length === 0) {
    console.error('refusing: PG answered but users table came back empty — not overwriting');
    try { await db.close(); } catch (e) {}
    process.exit(2);
  }
  const tmp = OUT + '.tmp';
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(tmp, JSON.stringify(store), { encoding: 'utf8', mode: 0o600 });
  fs.renameSync(tmp, OUT);
  console.log('reseeded ' + OUT + ' from PostgreSQL (' + h.hydrated + ' collections)');
  try { await db.close(); } catch (e) {}
})().catch((e) => { console.error('reseed failed:', e.message); process.exit(1); });
