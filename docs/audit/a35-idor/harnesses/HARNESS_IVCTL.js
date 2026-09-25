#!/usr/bin/env node
/* Intervention/discipline W-dimension control (valid model fields only, no class_id). */
'use strict';
const crypto = require('crypto');
const fs = require('fs');
const { execSync } = require('child_process');
const Redis = require('/home/user/p2/node_modules/ioredis');
const redis = new Redis('redis://127.0.0.1:6379');
const BASE = 'http://127.0.0.1:3000';
const CODE = '424242';
const PG = 'psql "postgres://payesh:payesh@127.0.0.1:5432/payesh_db_idor"';
const OUT = '/home/user/idor-evidence-ivctl.jsonl';
fs.writeFileSync(OUT, '');
const row = (o) => { fs.appendFileSync(OUT, JSON.stringify(o) + '\n'); console.log(o.id + ' [' + o.actor + '] actual=' + o.actual + (o.op ? ' (' + o.op + ')' : '') + ' // ' + o.note); };
async function api(p, { method = 'GET', cookie, body } = {}) {
  const h = {}; if (body) h['content-type'] = 'application/json'; if (cookie) h.cookie = cookie;
  const r = await fetch(BASE + p, { method, headers: h, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch (e) {}
  return { status: r.status, json: j, text: t, setCookie: r.headers.get('set-cookie') };
}
async function login(phone, nid) {
  await api('/api/auth/send-code', { method: 'POST', body: { phone } });
  await new Promise(r => setTimeout(r, 250));
  const raw = await redis.get('payesh:otp:state');
  const doc = raw ? JSON.parse(raw) : { v: 1, codes: {}, cd: {}, login_fail: {}, tomb: {}, seq: 0 };
  if (!doc.codes[phone]) doc.codes[phone] = { at: Date.now(), tries: 0 };
  doc.codes[phone].h = crypto.createHash('sha256').update(CODE + '|' + phone).digest('hex');
  doc.codes[phone].at = Date.now() + 2;
  doc.seq = (doc.seq || 0) + 1;
  await redis.set('payesh:otp:state', JSON.stringify(doc));
  const ln = await api('/api/auth/login', { method: 'POST', body: { phone, code: CODE, national_id: nid } });
  const m = ln.setCookie && ln.setCookie.match(/payesh_session=([^;]+)/);
  if (!m) throw new Error('login ' + phone + ' -> ' + ln.status + ' ' + ln.text.slice(0, 200));
  return 'payesh_session=' + m[1];
}
(async () => {
  const T1 = await login('09121000020', '1000000020');
  const M1 = await login('09121000010', '1000000010');
  // valid discipline fields only: student_id, school_id, kind, title, points, date
  const r = await api('/api/sync', { method: 'POST', cookie: T1, body: { ops: [{ uid: 'ivctl-2', c: 'discipline', t: 'ins', data: { student_id: 6, school_id: 1, kind: 'praise', title: 'audit-ctl-' + Date.now(), points: 0, date: '2026-01-01' }, by: 4 }] } });
  const op = r.json && r.json.results && r.json.results[0];
  row({ id: 'IVCTL-1', actor: 'T1', expect: [200], actual: r.status, op: op && (op.code || (op.ok ? 'ok' : '?')), note: 'control: teacher discipline ins on TAUGHT student 6, valid fields only (defect if not ok)', evidence: r.text.slice(0, 220), t: new Date().toISOString() });
  const pgRow = execSync(PG + ' -t -A -c "SELECT id FROM discipline WHERE title LIKE \'audit-ctl-%\' ORDER BY id DESC LIMIT 1;"').toString().trim();
  row({ id: 'IVCTL-1-pg', actor: 'psql', expect: [true], actual: pgRow || '(none)', note: 'PG row created?', t: new Date().toISOString() });
  // owner M1 deletes it (del = manager/SA)
  if (pgRow) {
    const d = await api('/api/sync', { method: 'POST', cookie: M1, body: { ops: [{ uid: 'ivctl-del', c: 'discipline', t: 'del', id: Number(pgRow), by: 2 }] } });
    const dop = d.json && d.json.results && d.json.results[0];
    row({ id: 'IVCTL-del', actor: 'M1', expect: [200], actual: d.status, op: dop && (dop.code || (dop.ok ? 'ok' : '?')), note: 'owner manager deletes discipline row (del=manager/SA)', evidence: d.text.slice(0, 180), t: new Date().toISOString() });
  }
  await redis.quit();
})().catch(e => { console.error('ERR ' + e.message); process.exit(1); });
