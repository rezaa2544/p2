#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   server/seed.js — build the server store from the demo world
   -------------------------------------------------------------------
   The demo data generator (src/js/02-demo-data.js) runs with a FIXED
   seed (SEED=20260901), so the generated db is deterministic: every
   build produces the same users, phones, national ids, classes and
   parent links. We run the real built app once in jsdom or Node vm,
   take its `db`, and freeze it as the server's store.

   => the server's identity base is EXACTLY the world the client shows
      (same records, same ids) — no duplicated data model, no drift.

   PUB-01 — read this before deploying anything built from this file:
     the dataset is DETERMINISTIC and reproducible from the public repo.
     Every phone, national_id and relationship in it can be recomputed by
     anyone who reads src/js/02-demo-data.js. That is intentional for the
     offline demo contract (client and server must show the same world),
     and it is exactly why this dataset must NEVER serve as the identity
     base of a real deployment: it is public knowledge by construction.
     A production deployment seeds its own data and does not ship this
     file's output. The generator no longer emits a `password` field at
     all (the product has no password concept — docs/PLAN_PHONE_AUTH.md),
     and index.js strips any residual one at load.

   Usage:  node server/seed.js        (writes server/data/payesh.json)
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const DATA_DIR = path.join(__dirname, 'data');
const OUT = path.join(DATA_DIR, 'payesh.json');

function saveDb(db) {
  if (!db || !Array.isArray(db.users) || db.users.length < 10) {
    throw new Error('db not ready or invalid user count');
  }
  /* PUB-01: refuse to freeze a store that still carries a password field —
     the generator no longer emits one, so this is a hard guard against a
     regression sneaking a universal credential back into the dataset. */
  const offenders = db.users.filter((u) => u && Object.prototype.hasOwnProperty.call(u, 'password'));
  if (offenders.length) {
    throw new Error('PUB-01: ' + offenders.length + ' generated user record(s) carry a `password` field — the product has no password concept; refusing to write a store with a universal credential');
  }
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = OUT + '.tmp';
  /* Wave 24 (KPI-3): قالبِ ASCII-escaped — پارسِ بوتِ سرور سریع‌تر */
  fs.writeFileSync(tmp, require('./json-fast').stringifyAscii(db), { encoding: 'utf8', mode: 0o600 }); /* PII — owner-only (S-73-3) */
  fs.renameSync(tmp, OUT);
  try { fs.chmodSync(OUT, 0o600); } catch (e) {}
  const kb = (Buffer.byteLength(JSON.stringify(db), 'utf8') / 1024).toFixed(0);
  console.log('✅ store written: ' + OUT + '  (' + kb + ' KB)');
  console.log('   users: ' + db.users.length +
    ' | schools: ' + db.schools.length +
    ' | classes: ' + db.classes.length +
    ' | parent_links: ' + db.parent_links.length);
  console.log('   ⚠️ PUB-01: this dataset is deterministic and reproducible from the public repo —');
  console.log('      demo data only; never the identity base of a real deployment.');
}

function seedWithVm() {
  const scriptMatch = html.match(/<script nonce="__PAYESH_NONCE__">\n([\s\S]*?)\n<\/script>/);
  if (!scriptMatch) {
    throw new Error('Could not find script block in index.html');
  }
  const js = scriptMatch[1];
  const dummyElem = { innerHTML: '', style: {}, setAttribute: () => {}, querySelector: () => null, querySelectorAll: () => [], appendChild: () => {}, remove: () => {} };
  const mockDoc = {
    documentElement: { setAttribute: () => {}, style: {} },
    body: dummyElem,
    createElement: () => dummyElem,
    querySelector: () => dummyElem,
    querySelectorAll: () => [],
    getElementById: () => dummyElem,
    addEventListener: () => {},
    removeEventListener: () => {}
  };
  const mockWindow = {
    scrollTo: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    setTimeout, clearTimeout, setInterval, clearInterval,
    console,
    crypto: require('crypto').webcrypto,
    location: { href: 'http://localhost/', search: '', hash: '' },
    navigator: { userAgent: 'node' },
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    sessionStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    document: mockDoc
  };
  mockWindow.window = mockWindow;
  mockWindow.self = mockWindow;

  const ctx = vm.createContext(mockWindow);
  vm.runInContext(js, ctx);

  setTimeout(() => {
    try {
      const db = vm.runInContext('typeof db !== "undefined" ? db : null', ctx);
      saveDb(db);
      process.exit(0);
    } catch (err) {
      console.error('❌ seed (vm fallback) failed:', err.message);
      process.exit(1);
    }
  }, 1000);
}

let JSDOM;
try {
  ({ JSDOM } = require('jsdom'));
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
      saveDb(db);
    }catch(e){
      console.log('jsdom execution failed, falling back to VM runner:', e.message);
      dom.window.close();
      seedWithVm();
      return;
    }
    dom.window.close();
    process.exit(0);
  }, 3000);
} catch (e) {
  seedWithVm();
}
