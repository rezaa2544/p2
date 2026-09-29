/* ═══════════════════════════════════════════════════════════════════════
   server/revocation-fallback.js — durable revocation journal + replay
   ────────────────────────────────────────────────────────────────────────
   A-22 — MISSION 02 fix.

   DEFECT (reproduced, tests/reaudit-redis-outage.js S3d, HEAD 691f8d6):

     During a Redis outage the read path already fails CLOSED: sessionFrom()
     catches REVOCATION_UNAVAILABLE and denies the session (S3c, verified).

     But the WRITE path is lossy. revocation.revokeSession() catches the
     Redis error and returns false, and server/auth.js apiLogout ignored
     that return value. So the denylist entry is never written. When Redis
     comes back, ioredis reconnects and reads start hitting Redis again —
     and the read finds nothing, because the write was dropped. The revoked
     session becomes VALID AGAIN after recovery.

     That is a genuine security window: revocation is honoured while Redis
     is down (fail-closed) and silently un-honoured once it returns. No
     amount of read-path hardening fixes it; the missing write has to be
     replayed.

   INVARIANT (the security contract this module enforces):

     "A revocation that the application reported as successful must not
      become un-applied when Redis recovers. The denylist write is durable:
      if Redis could not accept it at revocation time, it is replayed as
      soon as Redis is reachable again, and in the interim the fail-closed
      read path keeps the session denied."

   DESIGN — why a durable journal rather than an in-memory retry queue:

     An in-memory retry queue dies with the process; a logout followed by a
     restart would silently lose the revocation. The journal is a small JSON
     file in the store's own data directory, so it survives restarts and is
     visible to every instance that shares that directory — the same channel
     the store file already uses between instances. It holds only
     { jti, exp }: no user data, no request bodies, no secrets.

     Entries self-expire with the token's own `exp`: once the JWT has
     expired it cannot be presented at all, so keeping the entry longer
     would be dishonest bookkeeping. This also bounds the file size under
     sustained outage.

   TRADEOFF (documented, Mission 02 §6):

     fast path (Redis up)   → one extra stat/read of a tiny file on revocation
                              reads; negligible. Journal stays empty.
     outage path            → revocations are journaled; reads stay fail-closed
                              as they already were, so availability for valid
                              sessions is unchanged from HEAD behaviour.
     recovery               → replay flushes the journal into Redis. The window
                              in which a revoked session could be re-accepted
                              closes at most one replay cycle after recovery
                              (bounded by PAYESH_REVOKE_REPLAY_MS, default 2 s).

     No new infrastructure, no new service, no change to the fail-closed
     read contract. This is strictly stronger than HEAD: HEAD loses the
     write permanently; this bounds the loss to the outage plus one cycle.
   ═══════════════════════════════════════════════════════════════════════ */
'use strict';

const fs = require('fs');
const path = require('path');

const JOURNAL_NAME = 'revocation-journal.json';

/* Bound the journal so a long outage cannot grow it without limit. Entries
   past token expiry are already pruned on read; this is the hard cap. */
const MAX_JOURNAL_ENTRIES = 4096;

function journalPath(dataDir) {
  return path.join(dataDir || path.join(__dirname, '..', 'data'), JOURNAL_NAME);
}

function _load(dataDir) {
  try {
    const parsed = JSON.parse(fs.readFileSync(journalPath(dataDir), 'utf8'));
    if (parsed && Array.isArray(parsed.entries)) return parsed;
  } catch (e) { /* absent or corrupt → start fresh; reads never throw */ }
  return { entries: [] };
}

function _save(dataDir, entries) {
  try {
    fs.writeFileSync(journalPath(dataDir), JSON.stringify({ entries }, null, 0), 'utf8');
    return true;
  } catch (e) { return false; }
}

/* ── write side: record a revocation Redis did not confirm ── */

function appendJournal(dataDir, entry) {
  if (!entry || typeof entry.jti !== 'string') return false;
  const entries = _load(dataDir).entries.filter((e) => e && e.jti !== entry.jti);
  entries.push({ jti: entry.jti, exp: Number(entry.exp) || 0, at: Date.now() });
  if (entries.length > MAX_JOURNAL_ENTRIES) {
    entries.sort((a, b) => a.exp - b.exp);
    entries.splice(0, entries.length - MAX_JOURNAL_ENTRIES);
  }
  return _save(dataDir, entries);
}

/* Entries are only meaningful while the JWT could still be presented. */
function pruneExpired(entries, nowSec) {
  const now = Number.isFinite(nowSec) ? nowSec : Math.floor(Date.now() / 1000);
  return entries.filter((e) => e && typeof e.jti === 'string' && (Number(e.exp) || 0) > now);
}

function readJournal(dataDir) {
  return pruneExpired(_load(dataDir).entries);
}

function clearJournal(dataDir) {
  return _save(dataDir, []);
}

/* ── read side: is this jti recorded in the durable journal? ── */

function journalContains(dataDir, jti) {
  if (!jti || typeof jti !== 'string') return false;
  return readJournal(dataDir).some((e) => e.jti === jti);
}

/* ── recovery: replay journaled revocations into a live Redis ──
   Called on the read path; if Redis is reachable, drain the journal into it
   so the fast path becomes authoritative again. Returns the number of
   entries actually replayed. The caller supplies the set function so this
   module stays decoupled from the redis client. */
async function replayJournal(dataDir, setFn) {
  const entries = readJournal(dataDir);
  if (entries.length === 0) return 0;
  let replayed = 0;
  const remaining = [];
  for (const e of entries) {
    const ttl = Math.max(1, Number(e.exp) - Math.floor(Date.now() / 1000));
    try {
      await setFn(e.jti, ttl);
      replayed++;
    } catch (err) {
      /* Redis still not writable → keep the entry for the next cycle. */
      remaining.push(e);
    }
  }
  if (replayed > 0) _save(dataDir, remaining);
  return replayed;
}

module.exports = {
  journalPath,
  appendJournal,
  readJournal,
  clearJournal,
  pruneExpired,
  journalContains,
  replayJournal,
  MAX_JOURNAL_ENTRIES,
};
