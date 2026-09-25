#!/usr/bin/env node
/* W-2 clean re-run (post-restore): teacher sync IEP write on NON-taught student 20, current HEAD, honest by. */
'use strict';
const crypto = require('crypto');
const fs = require('fs');
const Redis = require('/home/user/p2/node_modules/ioredis');
const redis = new Redis('redis://127.0.0.1:6379');
const BASE = 'http://127.0.0.1:3000';
const CODE = '424242';
const OUT = '/home/user/idor-evidence-w2r4.jsonl';
fs.writeFileSync(OUT, '');
async function api(p, { method = 'GET', cookie, body } = {}) {
  const h = {};
  if (body) h['content-type'] = 'application/json';
  if (cookie) h.cookie = cookie;
  const r = await fetch(BASE + p, { method, headers: h, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch (e) {}
  return { status: r.status, json: j, text: t, setCookie: r.headers.get('set-cookie') };
}
async function login(phone, nid) {
  await api('/api/auth/send-code', { method: 'POST', body: { phone } });
  await new Promise(r => setTimeout(r, 150));
  const raw = await redis.get('payesh:otp:state');
  const doc = raw ? JSON.parse(raw) : { v: 1, codes: {}, cd: {}, login_fail: {}, tomb: {}, seq: 0 };
  if (!doc.codes[phone]) doc.codes[phone] = { at: Date.now(), tries: 0 };
  doc.codes[phone].h = crypto.createHash('sha256').update(CODE + '|' + phone).digest('hex');
  doc.codes[phone].at = Date.now() + 2;
  doc.seq = (doc.seq || 0) + 1;
  await redis.set('payesh:otp:state', JSON.stringify(doc));
  const ln = await api('/api/auth/login', { method: 'POST', body: { phone, code: CODE, national_id: nid } });
  const m = ln.setCookie && ln.setCookie.match(/payesh_session=([^;]+)/);
  if (!m) throw new Error('login ' + phone + ' -> ' + ln.status + ' ' + ln.text.slice(0, 150));
  return 'payesh_session=' + m[1];
}
const row = (o) => { fs.appendFileSync(OUT, JSON.stringify(o) + '\n'); console.log(o.id + ' [' + o.actor + ' ' + o.method + ' ' + o.url + '] actual=' + o.actual + (o.op ? ' (' + o.op + ')' : '') + ' // ' + o.note); };
(async () => {
  const T1 = await login('09121000020', '1000000020');
  // W-2: sync IEP on NON-taught student 20 (class 5; T1 teaches c1-homeroom + c2)
  const r = await api('/api/sync', { method: 'POST', cookie: T1, body: { ops: [{ uid: 'r4-w2-final', c: 'users', t: 'upd', id: 20, data: { iep_notes: 'ROUND4-W2' }, by: 4 }] } });
  const res0 = r.json && r.json.results && r.json.results[0];
  row({ id: 'W2-final', actor: 'T1', method: 'POST', url: '/api/sync (users upd id:20 iep_notes ROUND4-W2)', expect: [403], actual: r.status, op: res0 && (res0.code || (res0.ok ? 'ok' : '?')), note: 'W-2 current HEAD clean re-run: defect = 200/ok + PG marker', evidence: r.text.slice(0, 250), t: new Date().toISOString() });
  // PG marker check
  const { execSync } = require('child_process');
  const pg = execSync('psql "postgres://payesh:payesh@127.0.0.1:5432/payesh_db_idor" -t -c "SELECT iep_notes FROM users WHERE id=20;"').toString().trim();
  row({ id: 'W2-final-pg', actor: 'psql', method: 'SELECT', url: 'users.id=20.iep_notes', expect: [null], actual: pg || '(null)', note: 'PG persistence check — defect proven if ROUND4-W2', evidence: pg, t: new Date().toISOString() });
  // control: T1 sync IEP on TAUGHT student 6 (should also be 200 — same code path, in-scope)
  const rc = await api('/api/sync', { method: 'POST', cookie: T1, body: { ops: [{ uid: 'r4-w2-final-ctl', c: 'users', t: 'upd', id: 6, data: { iep_notes: 'ROUND4-W2-CTL' }, by: 4 }] } });
  const res1 = rc.json && rc.json.results && rc.json.results[0];
  row({ id: 'W2-final-ctl', actor: 'T1', method: 'POST', url: '/api/sync (users upd id:6 iep_notes ROUND4-W2-CTL)', expect: [200], actual: rc.status, op: res1 && (res1.code || (res1.ok ? 'ok' : '?')), note: 'control: T1 sync IEP on TAUGHT student 6 (legitimate)', evidence: rc.text.slice(0, 200), t: new Date().toISOString() });
  const pg2 = execSync('psql "postgres://payesh:payesh@127.0.0.1:5432/payesh_db_idor" -t -c "SELECT iep_notes FROM users WHERE id=6;"').toString().trim();
  row({ id: 'W2-final-ctl-pg', actor: 'psql', method: 'SELECT', url: 'users.id=6.iep_notes', expect: ['ROUND4-W2-CTL'], actual: pg2 || '(null)', note: 'control PG check', evidence: pg2, t: new Date().toISOString() });
  await redis.quit();
})().catch(e => { console.error('ERR ' + e.message); process.exit(1); });
