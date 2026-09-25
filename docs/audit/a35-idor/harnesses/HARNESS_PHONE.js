#!/usr/bin/env node
/* A-35 phone-normalization probe (run against instance with PAYESH_SMS_PHONE_LIMIT=2, COOLDOWN_S=0).
   Question: do raw phone variants ('0912...', '912...', '+98912...') split the per-phone
   rate-limit/cooldown buckets (raw-string keying) while resolving to the SAME user (tail-10 match)? */
'use strict';
const crypto = require('crypto');
const fs = require('fs');
const Redis = require('/home/user/p2/node_modules/ioredis');
const redis = new Redis('redis://127.0.0.1:6379');
const BASE = 'http://127.0.0.1:3000';
const OUT = '/home/user/idor-evidence-a35-phone.jsonl';
fs.writeFileSync(OUT, '');
const row = (o) => { fs.appendFileSync(OUT, JSON.stringify(o) + '\n'); console.log(o.id + ' [' + o.actor + '] actual=' + o.actual + (o.op ? ' (' + o.op + ')' : '') + ' // ' + o.note); };
async function api(p, { method = 'GET', cookie, body, ip } = {}) {
  const h = {}; if (body) h['content-type'] = 'application/json'; if (cookie) h.cookie = cookie; if (ip) h['x-forwarded-for'] = ip;
  const r = await fetch(BASE + p, { method, headers: h, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch (e) {}
  return { status: r.status, json: j, text: t, setCookie: r.headers.get('set-cookie') };
}
(async () => {
  const P = '09121000010';
  // 1) exhaust per-raw-string bucket (limit=2)
  for (let i = 1; i <= 3; i++) {
    const r = await api('/api/auth/send-code', { method: 'POST', body: { phone: P }, ip: '10.70.1.' + i });
    row({ id: 'A35-50.' + i, actor: 'ANON', expect: [200, 200, 429], actual: r.status, op: r.json && r.json.code, note: 'send-code base form x' + i + ' (expect 429 on #3: per-phone limit=2)', t: new Date().toISOString() });
  }
  // 2) variant buckets — if 200: bucket-splitting bypass (different raw key, same user)
  const variants = ['+989121000010', '00989121000010', '9121000010'];
  for (const v of variants) {
    const r = await api('/api/auth/send-code', { method: 'POST', body: { phone: v }, ip: '10.70.2.' + Math.floor(Math.random() * 250) });
    row({ id: 'A35-51-' + v.slice(0, 6), actor: 'ANON', expect: [429], actual: r.status, op: r.json && r.json.code, note: 'send-code variant ' + v + ' after base-form exhaustion (secure: still 429; defect: 200 = fresh bucket)', t: new Date().toISOString() });
  }
  // 3) cross-format code reuse must NOT work (hash bound to raw string) — user resolves via tail-10
  const sc = await api('/api/auth/send-code', { method: 'POST', body: { phone: '+989121000010' }, ip: '10.70.3.1' });
  row({ id: 'A35-52a', actor: 'ANON', expect: [200, 429], actual: sc.status, op: sc.json && sc.json.code, note: 'send-code variant (fresh bucket expected if 51 bypassed) — demo code needed', t: new Date().toISOString() });
  let dc = sc.json && (sc.json.demo_code || (sc.json.data || {}).demo_code);
  // this instance is production env → no demo_code; skip cross-format login proof here (no code access).
  console.log('  (prod env: no demo_code — cross-format login test deferred to dev-gate round)');
  await redis.quit();
})().catch(e => { console.error('ERR ' + e.message); process.exit(1); });
