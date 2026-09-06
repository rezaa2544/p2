#!/usr/bin/env node
/* server11-child — فرزندِ جدا برایِ سناریوهایی که envِ متفاوت می‌خواهند
   (S1 بدونِ in-configure، S5 سقفِ کوچک، S8 dry-run).
   استدعا: node tests/server11-child.js <root> <mode>   mode ∈ {nocfg, cap, dry}
   خروجی: خطوط STATUS:<n> / RESP:<json> / AUDIT:<yes|no> / MSG:<prefix> */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = process.argv[2];
const MODE = process.argv[3] || 'nocfg';
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'payesh-s11c-'));
const REAL = path.join(ROOT, 'server', 'data', 'payesh.json');
const T_STORE = path.join(TMP, 'store.json');
const T_AUDIT = path.join(TMP, 'audit.log');
fs.copyFileSync(REAL, T_STORE);
process.env.PAYESH_STORE = T_STORE;
process.env.PAYESH_AUDIT = T_AUDIT;
process.env.PAYESH_KEY = path.join(TMP, 'key');
process.env.PAYESH_DEMO_CODE = '1';
/* env از والد ارث می‌رود — اول پاک، بعدِ طبقِ mode */
delete process.env.PAYESH_SMS_PROVIDER;
delete process.env.PAYESH_SMS_DRY_RUN;
delete process.env.PAYESH_SMS_MOCK_FAIL;
delete process.env.PAYESH_SMS_MAX_PER_DAY;
if(MODE !== 'nocfg') process.env.PAYESH_SMS_PROVIDER = 'mock';
if(MODE === 'cap') process.env.PAYESH_SMS_MAX_PER_DAY = '1';
if(MODE === 'dry') process.env.PAYESH_SMS_DRY_RUN = '1';

const { server, store } = require(path.join(ROOT, 'server', 'index.js'));
const SA = store.users.find(u => u.role === 'superadmin');

server.listen(0, async () => {
  try {
    const BASE = 'http://localhost:' + server.address().port;
    let r = await fetch(BASE + '/api/auth/send-code', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone: String(SA.phone).replace(/\D/g, '') }) });
    let j = await r.json();
    r = await fetch(BASE + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone: String(SA.phone).replace(/\D/g, ''), code: j.demo_code, national_id: String(SA.national_id) }) });
    const ck = ((r.headers.get('set-cookie') || '').match(/payesh_session=[^;]+/) || [])[0];
    if(!ck) { console.log('STATUS:0'); console.log('RESP:{"err":"no cookie"}'); return finish(); }

    /* آیتمِ صف: ۲ ولیِ موجودِ seed (17, 1025)، ۱ قطعه → هزینه ۲ */
    if(!store.notify_queue) store.notify_queue = [];
    const maxQ = store.notify_queue.reduce((a, q) => Math.max(a, q.id || 0), 0);
    const item = { id: maxQ + 1, school_id: 1, kind: 'childtest', student_id: 16, class_id: 1,
      parent_ids: [17, 1025], body: 'پیامکِ آزمایشِ فرزند', parts: 1, status: 'pending',
      created_at: new Date().toISOString() };
    store.notify_queue.push(item);
    let w = store.sms_wallet.find(x => x.school_id === 1);
    if(!w){ w = { id: 1, school_id: 1, balance: 100 }; store.sms_wallet.push(w); }
    else w.balance = 100;

    r = await fetch(BASE + '/api/sms/send', { method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: ck },
      body: JSON.stringify({ queue_ids: [item.id] }) });
    j = await r.json();
    console.log('STATUS:' + r.status);
    console.log('RESP:' + JSON.stringify(j));
    if(MODE === 'cap'){
      const aud = fs.existsSync(T_AUDIT) ? fs.readFileSync(T_AUDIT, 'utf8') : '';
      console.log('AUDIT:' + (aud.indexOf('sms_cap') > -1 ? 'yes' : 'no'));
    }
    if(MODE === 'dry'){
      const log = (store.sms_log || []).find(l => l.queue_id === item.id && l.status === 'sent');
      console.log('MSG:' + (log && log.provider_msg ? String(log.provider_msg).slice(0, 4) : 'none'));
    }
    finish();
  } catch (e) {
    console.log('STATUS:0');
    console.log('RESP:{"err":' + JSON.stringify(String(e && e.message || e)) + '}');
    finish();
  }
  function finish(){ try{ server.close(); }catch(e){} process.exit(0); }
});
