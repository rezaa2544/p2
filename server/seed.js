#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   server/seed.js — build the server store from the demo world
   -------------------------------------------------------------------
   The demo data generator (src/js/02-demo-data.js) runs with a FIXED
   seed (SEED=20260901), so the generated db is deterministic: every
   build produces the same users, phones, national ids, classes and
   parent links. We run the real built app once in jsdom, take its
   `db`, and freeze it as the server's store.

   => the server's identity base is EXACTLY the world the client shows
      (same records, same ids) — no duplicated data model, no drift.

   Usage:  node server/seed.js        (writes server/data/payesh.json)
   Dev only: needs jsdom (npm i --no-save jsdom). The runtime server
   itself does NOT need jsdom.
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const path = require('path');

let JSDOM;
try { ({ JSDOM } = require('jsdom')); }
catch { console.error('jsdom not installed — run: npm i --no-save jsdom'); process.exit(1); }

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const DATA_DIR = path.join(__dirname, 'data');
const OUT = path.join(DATA_DIR, 'payesh.json');

const dom = new JSDOM(html, {
  runScripts: 'dangerously',
  resources: 'usable',
  url: 'http://localhost/',
  pretendToBeVisual: true,
  beforeParse(window){
    window.scrollTo = () => {};
  }
});

setTimeout(() => {
  try{
    const db = dom.window.eval('typeof db !== "undefined" ? db : null');
    if(!db || !Array.isArray(db.users) || db.users.length < 10){
      console.error('❌ db not ready in jsdom — is the app generating demo data?');
      process.exit(1);
    }
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const tmp = OUT + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(db), { encoding: 'utf8', mode: 0o600 }); /* PII — owner-only (S-73-3) */
    fs.renameSync(tmp, OUT);
    try{ fs.chmodSync(OUT, 0o600); }catch(e){}
    const kb = (Buffer.byteLength(JSON.stringify(db), 'utf8') / 1024).toFixed(0);
    console.log('✅ store written: ' + OUT + '  (' + kb + ' KB)');
    console.log('   users: ' + db.users.length +
      ' | schools: ' + db.schools.length +
      ' | classes: ' + db.classes.length +
      ' | parent_links: ' + db.parent_links.length);
  }catch(e){
    console.error('❌ seed failed: ' + (e && e.message));
    process.exit(1);
  }finally{
    dom.window.close();
    process.exit(0);
  }
}, 4000);
