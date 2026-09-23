#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   tests/helpers/boot-pg.js — reproducible PostgreSQL harness for the
   live-PG suites (tests/pg-prod-*.js, tests/pg-relational-seed.js)
   ───────────────────────────────────────────────────────────────────
   Why this lives in the repo: the harness used to be created ad hoc in
   the sandbox and evaporated on every reset, which made the live-PG
   suites NOT-RUN for anyone else. Committing the boot script makes the
   suites reproducible from a clean checkout.

   The npm packages are NOT vendored (they are ~87MB of binaries); install
   them outside the repo so the checkout stays small:

     mkdir -p ~/pgws && cd ~/pgws && npm init -y && \
       npm i embedded-postgres@18.4.0-beta.17 @embedded-postgres/linux-x64 pg

   Then, from the repository root:

     NODE_PATH=~/pgws/node_modules node tests/helpers/boot-pg.js
     # in another shell:
     NODE_PATH=~/pgws/node_modules \
       PG_LIVE_PG='postgres://chat1:chat1@127.0.0.1:55433/payesh_chat1' \
       node tests/pg-prod-boot-no-db.js

   Configuration (overridable by env):
     PG_HARNESS_DATADIR  default /tmp/pgdata-chat1   (NOT /opt, NOT $HOME)
     PG_HARNESS_PORT     default 55433
     PG_HARNESS_DB       default payesh_chat1
     PG_HARNESS_USER     default chat1
     PG_HARNESS_PASSWORD default chat1   (local throwaway cluster only)

   It stays in the foreground and prints BOOTED/STOPPED markers so a
   supervising shell can gate on them. SIGTERM/SIGINT stop it cleanly.
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');

let EmbeddedPostgres;
try {
  EmbeddedPostgres = require('embedded-postgres').default;
} catch (e) {
  console.error('boot-pg: embedded-postgres is not resolvable.');
  console.error('  install it OUTSIDE the repo, then pass NODE_PATH, e.g.:');
  console.error('  mkdir -p ~/pgws && cd ~/pgws && npm init -y && npm i embedded-postgres@18.4.0-beta.17 @embedded-postgres/linux-x64');
  console.error('  NODE_PATH=~/pgws/node_modules node tests/helpers/boot-pg.js');
  process.exit(2);
}

const DATADIR = process.env.PG_HARNESS_DATADIR || '/tmp/pgdata-chat1';
const PORT = Number(process.env.PG_HARNESS_PORT || 55433);
const DB = process.env.PG_HARNESS_DB || 'payesh_chat1';
const USER = process.env.PG_HARNESS_USER || 'chat1';
const PASSWORD = process.env.PG_HARNESS_PASSWORD || 'chat1';

/* persistent:true — data survives restart, so a suite never silently
   re-runs initdb and mistakes an empty cluster for a fresh one. */
const pg = new EmbeddedPostgres({
  databaseDir: DATADIR,
  port: PORT,
  user: USER,
  password: PASSWORD,
  persistent: true,
  /* loopback only: this cluster must never be reachable off-box */
  postgresFlags: ['-c', 'listen_addresses=127.0.0.1'],
  onLog: () => {},
  onError: (m) => console.error('[pg]', String(m && m.message ? m.message : m))
});

let stopping = false;
async function stop(code) {
  if (stopping) return;
  stopping = true;
  try { await pg.stop(); } catch (e) {}
  console.log('STOPPED');
  process.exit(code);
}
process.on('SIGTERM', () => stop(0));
process.on('SIGINT', () => stop(0));

(async () => {
  const fresh = !fs.existsSync(DATADIR);
  if (fresh) await pg.initialise();
  await pg.start();
  console.log('STARTED datadir=' + DATADIR + ' port=' + PORT + ' fresh=' + fresh);

  try {
    await pg.createDatabase(DB);
    console.log('DATABASE_CREATED ' + DB);
  } catch (e) {
    console.log('DATABASE_EXISTS_OR_ERROR ' + DB + ' (' + String(e.message).split('\n')[0] + ')');
  }

  /* Prove connectivity with a real query before declaring readiness, and
     echo the bound address so "loopback only" is verified, not assumed. */
  const c = pg.getPgClient(DB, '127.0.0.1');
  await c.connect();
  const v = await c.query('select version() as v, inet_server_addr()::text as addr, inet_server_port() as port');
  console.log('PING_OK ' + v.rows[0].port + ' addr=' + (v.rows[0].addr || 'n/a'));
  console.log('VERSION ' + v.rows[0].v);
  await c.end();

  console.log('BOOTED url=postgres://' + USER + ':***@127.0.0.1:' + PORT + '/' + DB);

  /* Keep this process alive; the cluster itself is a separate OS process. */
  setInterval(() => {}, 1 << 30);
})().catch((e) => {
  console.error('BOOT_FAILED ' + (e && e.message ? e.message : e));
  process.exit(1);
});
