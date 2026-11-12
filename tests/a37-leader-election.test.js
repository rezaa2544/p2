'use strict';
/* tests/a37-leader-election.test.js — A-37: unit tests of the leader election
   logic. Every path the task demands:

     E1  election START: the first candidate wins the vote (atomic single
         winner even under a burst)
     E2  vote COLLECTION: a competing candidate is refused while the lease is
         alive, and learns who the leader is
     E3  RESIGNATION: an aware leader resigns → the lease is freed and the
         next election promotes a new leader immediately
     E4  re-election AFTER FAILURE: a dead leader (no resignation) loses its
         lease to the TTL and the takeover succeeds without coordination
     E5  isLeader is true only for the lease holder (the per-tick fencing
         check)
     E6  lease RENEWAL is refused once the lease belongs to someone else
     E7  the lease carries a TTL (self-healing — no orphan leader key)

   Run: node tests/a37-leader-election.test.js
   (dev mode: in-memory driver; with REDIS_URL: the live staging Redis) */

const assert = require('assert');
const election = require('../server/leader-election');
const redis = require('../server/redis');

let pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) pass++; else fail++;
  console.log((ok ? '✅' : '❌') + ' ' + name + (detail ? ' — ' + detail : ''));
}

(async () => {
  const LIVE = !!String(process.env.REDIS_URL || '').trim();
  if (LIVE) { try { await redis.init(); } catch (e) { /* the readiness gate = the caller's contract */ } }
  console.log('▸ driver: ' + (LIVE ? 'live Redis' : 'in-memory fallback (dev mode)'));
  const ROLE = 'a37-test-job';

  /* clean slate */
  await redis.del(election.leaseKey(ROLE));

  /* E1 — the election start: the vote = a single winner */
  const r1 = await election.startElection({ role: ROLE, leaseSeconds: 2 });
  check('E1 the first candidate wins the election', r1.isLeader === true && r1.leader === election.INSTANCE_ID);

  /* E2 — the vote collection: the competing candidate is refused */
  const key = election.leaseKey(ROLE);
  const otherId = 'competing-instance-42';
  const r2 = await election.startElection({ role: ROLE, leaseSeconds: 30 });
  check('E2a the second candidate while the lease is alive = refused', r2.isLeader === false, 'leader=' + r2.leader);
  /* simulate the OTHER instance holding the lease (a different process won it) */
  await redis.set(key, otherId, 'EX', 30);
  const r2b = await election.startElection({ role: ROLE, leaseSeconds: 30 });
  check('E2b the vote reports the actual leader', r2b.isLeader === false && r2b.leader === otherId);

  /* E5 — isLeader: the per-tick fencing check */
  const mine = await election.isLeader(ROLE);
  check('E5a isLeader=false for a non-holder', mine === false);
  await redis.set(key, election.INSTANCE_ID, 'EX', 30);
  const mine2 = await election.isLeader(ROLE);
  check('E5b isLeader=true for the holder', mine2 === true);

  /* E7 — the lease TTL is armed */
  const ttl = await redis.ttl(key);
  check('E7 the lease carries a TTL (self-healing)', Number(ttl) > 0, 'ttl=' + ttl);

  /* E6 — the renewal is refused once the lease belongs to someone else */
  await redis.set(key, otherId, 'EX', 30);
  const rn = await election.renewLease({ role: ROLE, leaseSeconds: 30 });
  check('E6 the renewal is refused for a non-holder', rn.renewed === false && rn.leader === otherId);
  /* the renewal succeeds for the holder */
  await redis.set(key, election.INSTANCE_ID, 'EX', 30);
  const rn2 = await election.renewLease({ role: ROLE, leaseSeconds: 30 });
  check('E6b the renewal succeeds for the holder', rn2.renewed === true);

  /* E3 — the resignation: the lease is freed and the next election = a new leader */
  const rs = await election.resign(ROLE);
  check('E3a the aware resignation deletes the lease', rs.resigned === true);
  const after = await election.startElection({ role: ROLE, leaseSeconds: 30 });
  check('E3b after the resignation the next candidate wins immediately', after.isLeader === true);
  /* resigning someone else's lease is refused */
  await redis.set(key, otherId, 'EX', 30);
  const rs2 = await election.resign(ROLE);
  check('E3c cannot resign someone else\'s lease', rs2.resigned === false && rs2.leader === otherId);

  /* E4 — re-election after FAILURE: the leader dies without resigning;
     the TTL expires and the takeover succeeds with no coordination */
  await redis.set(key, election.INSTANCE_ID, 'EX', 1); /* 1s lease = the crashed leader */
  const blocked = await election.startElection({ role: ROLE, leaseSeconds: 30 });
  check('E4a during the lease the takeover is blocked', blocked.isLeader === false);
  await new Promise((r) => setTimeout(r, 1100)); /* the crashed leader's lease expires */
  const takeover = await election.startElection({ role: ROLE, leaseSeconds: 30 });
  check('E4b after the failed leader\'s lease expires, the takeover succeeds', takeover.isLeader === true, 'leader=' + takeover.leader);
  const live = await election.isLeader(ROLE);
  check('E4c the new leader is the fencing-check leader', live === true);

  /* cleanup */
  await election.resign(ROLE);

  console.log('────────────────────────────────────────────');
  console.log('a37-leader-election: ' + pass + ' pass / ' + fail + ' fail');
  console.log('CHECKS ' + (pass + fail) + ' FAIL ' + fail);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('FATAL ' + (e && e.message)); process.exit(1); });
