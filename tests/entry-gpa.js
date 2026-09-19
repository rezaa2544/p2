#!/usr/bin/env node
/* S4 فرناز: فیلدِ معدلِ ورودیِ دانش‌آموز — اجرا: node tests/entry-gpa.js (پورت‌ها: 9031–9032) */
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');
const { spawn } = require('child_process');
const ROOT = path.join(__dirname, '..');

let JSDOM, VirtualConsole;
try { ({ JSDOM, VirtualConsole } = require('jsdom')); }
catch { console.log('jsdom نصب نیست — سئوت رد شد.'); process.exit(1); }
const V = require(path.join(ROOT, 'server', 'validate.js'));

let okc = 0, failc = 0;
const fails = [];
function chk(name, cond, extra) {
  if (cond) { okc++; console.log('  PASS ' + name); }
  else { failc++; fails.push(name + (extra ? ' — ' + extra : '')); console.log('  FAIL ' + name + (extra ? ' — ' + extra : '')); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function httpReq(port, method, p, body, cookie) {
  const headers = { 'Content-Type': 'application/json' };
  if (cookie) headers['Cookie'] = cookie;
  return new Promise((resolve) => {
    const data = body === undefined ? null : JSON.stringify(body);
    const req = http.request({ hostname: '127.0.0.1', port, path: p, method, headers }, (res) => {
      let b = '';
      res.on('data', (d) => (b += d));
      res.on('end', () => { let j = null; try { j = JSON.parse(b); } catch (e) {} resolve({ status: res.statusCode, json: j, text: b, setCookie: res.headers['set-cookie'] }); });
    });
    req.on('error', () => resolve({ status: 0, json: null, text: '' }));
    if (data) req.write(data);
    req.end();
  });
}
function cookieFrom(r) {
  const sc = r.setCookie || [];
  for (const c of Array.isArray(sc) ? sc : [sc]) {
    const kv = String(c).split(';')[0];
    const i = kv.indexOf('=');
    if (i > 0) return kv.slice(0, i) + '=' + kv.slice(i + 1);
  }
  return '';
}

let tmp = null, srv = null;
process.on('exit', () => {
  try { if (srv) srv.kill('SIGKILL'); } catch (e) {}
  try { if (tmp) fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {}
});

async function main() {
  console.log('S4 — entry-gpa suite');
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const dom = new JSDOM(html, {
    runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://localhost/',
    virtualConsole: new VirtualConsole().on('jsdomError', () => {}).on('error', () => {}),
  });
  const win = dom.window;
  const W = (expr) => win.eval(expr);
  const clickSave = () => W('(function(){var b=document.querySelector(\'#modal button[data-act="user-save"]\');if(!b)return "missing";b.click();return "clicked";})()');
  await sleep(2000);
  W('S.user=db.users.find(u=>u.role==="manager"&&u.school_id);S.persona=null;S.boss=null;');

  W('userModal(null);');
  chk('E1 modal has u_entry_gpa field', W('!!document.getElementById("u_entry_gpa")'));
  W('closeModal();');

  W('userModal(null);');
  W('document.getElementById("u_name").value="EG Tester";');
  W('document.getElementById("u_user").value="eg_test_001";');
  W('document.getElementById("u_role").value="student";');
  W('document.getElementById("u_entry_gpa").value="17.5";');
  chk('E2a save clicked', clickSave() === 'clicked');
  const gpa2 = W('(db.users.find(function(u){return u.username==="eg_test_001";})||{}).entry_gpa');
  chk('E2b gpa 17.5 persisted', gpa2 === 17.5, 'got=' + gpa2);
  const sid = W('(db.users.find(function(u){return u.username==="eg_test_001";})||{}).id');

  W('userModal(byId("users",' + sid + '));');
  W('document.getElementById("u_entry_gpa").value="۱۸";');
  clickSave();
  const gpa3 = W('(byId("users",' + sid + ')||{}).entry_gpa');
  chk('E3 persian digits ۱۸ -> 18', gpa3 === 18, 'got=' + gpa3);

  const badCases = [['21', 'E4'], ['-1', 'E5'], ['abc', 'E6']];
  for (const pair of badCases) {
    const val = pair[0], tag = pair[1];
    W('userModal(byId("users",' + sid + '));');
    W('document.getElementById("u_entry_gpa").value=' + JSON.stringify(val) + ';');
    clickSave();
    const still = W('(byId("users",' + sid + ')||{}).entry_gpa');
    const modalOpen = W('!!document.getElementById("u_entry_gpa")');
    chk(tag + ' value ' + val + ' rejected (stays 18, modal open)', still === 18 && modalOpen === true, 'got=' + still + ' modal=' + modalOpen);
    W('closeModal();');
  }

  W('userModal(byId("users",' + sid + '));');
  W('document.getElementById("u_entry_gpa").value="";');
  clickSave();
  const gpa7 = W('(byId("users",' + sid + ')||{}).entry_gpa');
  chk('E7 empty -> null', gpa7 === null, 'got=' + String(gpa7));

  W('userModal(null);');
  W('document.getElementById("u_name").value="EG Teacher";');
  W('document.getElementById("u_user").value="eg_test_t01";');
  W('document.getElementById("u_role").value="teacher";');
  W('document.getElementById("u_entry_gpa").value="15";');
  clickSave();
  const gpa8 = W('(db.users.find(function(u){return u.username==="eg_test_t01";})||{}).entry_gpa');
  chk('E8 teacher ignores gpa', gpa8 === undefined, 'got=' + String(gpa8));

  W('userModal(byId("users",' + sid + '));');
  W('document.getElementById("u_entry_gpa").value="16.25";');
  clickSave();
  const card = W('studentProfileCard(' + sid + ')');
  const faNum = W('fa(16.25)');
  chk('E9 profile card shows entry gpa', card.indexOf('معدل ورودی') > -1 && card.indexOf(faNum) > -1, 'fa=' + faNum);

  const wp = JSON.parse(fs.readFileSync(path.join(ROOT, 'authz', 'write-perms.json'), 'utf8'));
  chk('E10 entry_gpa in users allowlist', (wp.fields.users || []).indexOf('entry_gpa') > -1);

  const rule = V.ruleFor('users', 'entry_gpa');
  chk('E11a ruleFor is score', rule && rule.type === 'score', JSON.stringify(rule));
  chk('E11b checkRule(19) ok', V.checkRule(19, rule) === null, String(V.checkRule(19, rule)));
  chk('E11c checkRule(25) fails', V.checkRule(25, rule) !== null);

  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'payesh-eg-'));
  const storeFile = path.join(tmp, 'payesh.json');
  fs.copyFileSync(path.join(ROOT, 'server/data/payesh.json'), storeFile);
  const keyFile = path.join(tmp, 'jwt.key');
  const auditFile = path.join(tmp, 'audit.log');
  const src = JSON.parse(fs.readFileSync(storeFile, 'utf8'));
  const M1 = src.users.find(u => u.role === 'manager' && u.school_id === 1);
  chk('E12a seed manager exists', !!M1);
  if (!M1) { console.log('entry-gpa: ' + okc + ' pass / ' + failc + ' fail'); process.exit(1); }
  let port = null;
  for (const p of [9031, 9032]) {
    const s = spawn(process.execPath, ['server/index.js'], {
      cwd: ROOT,
      env: Object.assign({}, process.env, {
        PORT: String(p), HOST: '127.0.0.1',
        PAYESH_STORE: storeFile, PAYESH_AUDIT: auditFile, PAYESH_KEY: keyFile, PAYESH_DEMO_CODE: '1'
      }),
      stdio: 'pipe'
    });
    let booted = false;
    for (let i = 0; i < 50; i++) {
      const h = await httpReq(p, 'GET', '/api/health').then(r => r.json).catch(() => null);
      if (h && h.ok && h.pid === s.pid) { booted = true; break; }
      if (h && h.ok) break;
      await sleep(300);
    }
    if (booted) { port = p; srv = s; break; }
    s.kill('SIGKILL');
  }
  chk('E12b server booted', port !== null);
  if (port === null) { console.log('entry-gpa: ' + okc + ' pass / ' + failc + ' fail'); process.exit(1); }
  const sc = await httpReq(port, 'POST', '/api/auth/send-code', { phone: M1.phone });
  const code = sc.json && sc.json.demo_code;
  const lg = await httpReq(port, 'POST', '/api/auth/login', { phone: M1.phone, code: code, national_id: M1.national_id });
  const ck = cookieFrom(lg);
  chk('E12c manager login', !!(lg.json && lg.json.ok && ck));
  let uidN = 1;
  const syncUpd = async (data) => {
    const r = await httpReq(port, 'POST', '/api/sync', { ops: [{ uid: 'eg' + (uidN++), t: 'upd', c: 'users', id: M1.id, by: M1.id, data: data }] }, ck);
    return (r.json && r.json.results && r.json.results[0]) || {};
  };
  const r1 = await syncUpd({ entry_gpa: 19 });
  chk('E12d sync entry_gpa=19 accepted', !!(r1 && r1.ok === true), JSON.stringify(r1));
  const r2 = await syncUpd({ entry_gpa: 25 });
  chk('E13 sync entry_gpa=25 rejected', !!(r2 && r2.ok === false), JSON.stringify(r2));

  console.log('entry-gpa: ' + okc + ' pass / ' + failc + ' fail');
  if (failc) { console.log('FAILURES:'); fails.forEach(f => console.log(' - ' + f)); }
  try { if (srv) srv.kill('SIGKILL'); } catch (e) {}
  try { dom.window.close(); } catch (e) {}
  process.exit(failc ? 1 : 0);
}
main().catch(e => { console.error('FATAL', e); process.exit(1); });
