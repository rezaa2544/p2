# M15-17 Evidence — horizontally scalable WebSocket hub (Redis pub/sub, no sticky sessions)

- **Verification id:** M15-17
- **Scope token:** `M15-17:WS-HUB-PUBSUB`
- **Date:** 2026-11-12 (current HEAD)

## Ground truth at verification

The repo had **no WebSocket layer at all** (no ws/socket.io dependency, no
upgrade handling) — realtime delivery would have been per-instance local
fan-out, forcing sticky sessions at multi-instance scale (fragile: an instance
restart breaks the session affinity).

## Change

- **`ws` (v8.22.2)** added — the minimal standard WS implementation (the repo
  already carries ioredis; a WS server is impossible with Node stdlib alone).
- **`server/ws-hub.js`** (NEW): `createWsHub({ httpServer, sessionFrom })` —
  - the upgrade auth = the session via `?token=` (browsers cannot send custom
    WS headers); unauthenticated upgrade = 401 + destroy;
  - the client topic model: `global` by default; `tenant:<schoolId>` only for
    the OWN tenant (or the superadmin) — the cross-tenant subscribe = refused
    with `tenant_isolation`, no membership;
  - the fan-out = ONE shared Redis pub/sub channel; every hub delivers to its
    LOCAL clients only → **no sticky sessions needed**;
  - the heartbeat ping/pong (unref'd — never holds the process) + the dead
    connection reaping.

## Guard test (`tests/m15-17-ws-hub.test.js`) — CHECKS 10 FAIL 0, exit 0, TWICE
(in-memory bus AND the live staging Redis sentinel)

W1 the unauthenticated upgrade rejected · W2 a broadcast via a DIFFERENT hub
instance reaches the client (the sticky-free proof) · W3a/b/c THREE hub
instances, one bus: a broadcast via hub[2] reaches the clients on hub[0] and
hub[1], each holding an independent local set (hub[2] = the publisher,
legitimately zero clients) · W4a the cross-tenant subscribe refused · W4b no
cross-tenant leak · W4c the own-tenant delivery · W4d the superadmin may
subscribe anywhere · W5 the subscribe ack.

**Mutation negative proof:** the tenant-isolation guard mutated away →
**W4a + W4b fail** (the cross-tenant subscribe ACCEPTED + the other school's
broadcast LEAKS to the wrong tenant) — caught, reverted, 10/0 restored.

## Notes

- `M15-17:WS-HUB-PUBSUB — RUNTIME-VERIFIED` (in-memory + live Redis; the mutation caught).
- Wiring: the hub is a primitive for the realtime lanes; the route handlers
  call `broadcast(topic, payload)` where an event must reach the connected
  clients across ALL instances.
- The first live run failed BY DESIGN: with REDIS_URL configured but the
  driver uninitialized, the hub's subscribe hit the documented fail-closed
  contract (`REDIS_UNAVAILABLE`) — the test now follows the same
  initialization contract as the other live-Redis suites.
