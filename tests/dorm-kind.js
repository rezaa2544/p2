#!/usr/bin/env node
/* S5 فرناز: تمایز پانسیون از اقامت کامل — اجرا: node tests/dorm-kind.js (پورت‌ها: 9033–9034) */
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');
const { spawn } = require('child_process');
const ROOT = path.join(__dirname, '..');

let JSDOM, VirtualConsole;
try { ({ JSDOM, VirtualConsole } = require('jsdom')); }
catch { console.log('jsdom نصب نیست — سئوت رد شد.'); process.exit(0); }
const V = require(path.join(ROOT, 'server', 'validate.js'));

let okc = 0, failc = 0;
const fails = [];
function chk(name, cond, extra) {
  if (cond) { okc++; console.log('  PASS ' + name); }
  else { failc++; fails.push(name + (extra ? ' — ' + extra : '')); console.log('  FAIL ' + name + (extra ? ' — ' + extra : '')); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* F-CSRF-01: نگهبانِ مرکزیِ CSRF سرور، جهش‌های احراز‌شده را بدونِ
   X-CSRF-Token رد می‌کند. تست هم مثلِ مرورگر عمل می‌کند: کوکیِ csrf_token
   را از شیشهٔ کوکی می‌خواند و در سرآیند بازمی‌گرداند (double-submit). */
const csrfHdr = (c) => { const m = /(?:^|;\s*)csrf_token=([^;]+)/.exec(String(c || '')); return m ? { 'X-CSRF-Token': m[1] } : {}; };
const jarOf = (h) => (Array.isArray(h) ? h.join(', ') : String(h || ''))
  .split(/,(?=\s*[A-Za-z0-9_!#$%&'*+\-.^`|~]+=)/)
  .map((c) => c.split(';')[0].trim()).filter(Boolean).join('; ');
function httpReq(port, method, p, body, cookie) {
  const headers = { 'Content-Type': 'application/json' };
  if (cookie) { headers['Cookie'] = cookie; Object.assign(headers, csrfHdr(cookie)); }
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
  return jarOf(sc);
}

let tmp = null, srv = null;
process.on('exit', () => {
  try { if (srv) srv.kill('SIGKILL'); } catch (e) {}
  try { if (tmp) fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {}
});

async function main() {
  console.log('S5 — dorm-kind suite');
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const dom = new JSDOM(html, {
    runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://localhost/',
    virtualConsole: new VirtualConsole().on('jsdomError', () => {}).on('error', () => {}),
  });
  const win = dom.window;
  const W = (expr) => win.eval(expr);
  await sleep(2000);
  const mgr = JSON.parse(W('JSON.stringify((function(){var m=db.users.find(u=>u.role==="manager"&&u.school_id);S.user=m;S.persona=null;S.boss=null;return {id:m.id,school:m.school_id};})())'));
  const SID = mgr.school;
  W('byId("schools",' + SID + ').capabilities=Object.assign(byId("schools",' + SID + ').capabilities||{},{has_dorm:1});');
  const RID = W('insert("dorm_rooms",{school_id:' + SID + ',name:"DK Room",capacity:10,created_at:todayISO()}).id');
  const mkStu = (un) => W('insert("users",{school_id:' + SID + ',role:"student",full_name:"DK ' + un + '",username:"' + un + '",password:"123456",active:1,created_at:todayISO()}).id');
  const s1 = mkStu('dk_s1'), s2 = mkStu('dk_s2'), s3 = mkStu('dk_s3');
  chk('D0 setup room+students', !!(RID && s1 && s2 && s3));

  W('dormActions(null,null,' + RID + ')["dorm-assign"]();');
  const opts = W('Array.prototype.map.call(document.getElementById("dorm_kind").options,function(o){return o.value;}).join(",")');
  chk('D1 modal has kind select full/pansion', opts === 'full,pansion', 'got=' + opts);

  W('document.getElementById("dorm_kind").value="full";');
  W('dormActions(null,{dataset:{sid:"' + s1 + '"}},' + RID + ')["dorm-assign-pick"]();');
  const k1 = W('(dormAssignOf(' + s1 + ')||{}).kind');
  chk('D2 assign full persists', k1 === 'full', 'got=' + k1);

  W('dormActions(null,null,' + RID + ')["dorm-assign"]();');
  W('document.getElementById("dorm_kind").value="pansion";');
  W('dormActions(null,{dataset:{sid:"' + s2 + '"}},' + RID + ')["dorm-assign-pick"]();');
  const k2 = W('(dormAssignOf(' + s2 + ')||{}).kind');
  chk('D3 assign pansion persists', k2 === 'pansion', 'got=' + k2);

  const nBefore = W('db.dorm_assignments.length');
  W('dormActions(null,null,' + RID + ')["dorm-assign"]();');
  W('document.getElementById("dorm_kind").outerHTML=\'<input class="input" id="dorm_kind" value="x" />\';');
  W('dormActions(null,{dataset:{sid:"' + s3 + '"}},' + RID + ')["dorm-assign-pick"]();');
  const nAfter = W('db.dorm_assignments.length');
  chk('D4 invalid kind rejected (no insert)', nAfter === nBefore, nBefore + '->' + nAfter);
  W('closeModal();');

  const s4 = mkStu('dk_s4');
  W('insert("dorm_assignments",{school_id:' + SID + ',room_id:' + RID + ',student_id:' + s4 + ',since:todayISO()});');
  const dk = W('dormKindOf(dormAssignOf(' + s4 + '))');
  const dl = W('dormKindLabel(dormAssignOf(' + s4 + '))');
  chk('D5 legacy record defaults to full', dk === 'full' && dl.indexOf('اقامت کامل') > -1, dk + '/' + dl);
  const dlp = W('dormKindLabel({kind:"pansion"})');
  chk('D6 pansion label', dlp.indexOf('پانسیون') > -1, dlp);

  const page = W('viewDorm()');
  chk('D7 page shows both chips', page.indexOf('اقامت کامل') > -1 && page.indexOf('پانسیون') > -1);

  const wp = JSON.parse(fs.readFileSync(path.join(ROOT, 'authz', 'write-perms.json'), 'utf8'));
  chk('D8 kind in dorm_assignments allowlist', ((wp.fields || {}).dorm_assignments || []).indexOf('kind') > -1);

  const rule = V.ruleFor('dorm_assignments', 'kind');
  chk('D9a ruleFor is enum full/pansion', rule && rule.type === 'enum' && (rule.values || rule.enum || []).join(',') === 'full,pansion', JSON.stringify(rule));
  chk('D9b checkRule pansion ok', V.checkRule('pansion', rule) === null);
  chk('D9c checkRule xxx fails', V.checkRule('xxx', rule) !== null);

  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'payesh-dk-'));
  const storeFile = path.join(tmp, 'payesh.json');
  fs.copyFileSync(path.join(ROOT, 'server/data/payesh.json'), storeFile);
  const keyFile = path.join(tmp, 'jwt.key');
  const auditFile = path.join(tmp, 'audit.log');
  const src = JSON.parse(fs.readFileSync(storeFile, 'utf8'));
  const M1 = src.users.find(u => u.role === 'manager' && u.school_id === 1);
  chk('D10a seed manager exists', !!M1);
  if (!M1) { console.log('dorm-kind: ' + okc + ' pass / ' + failc + ' fail'); process.exit(1); }
  let port = null;
  for (const p of [9033, 9034]) {
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
  chk('D10b server booted', port !== null);
  if (port === null) { console.log('dorm-kind: ' + okc + ' pass / ' + failc + ' fail'); process.exit(1); }
  const sc = await httpReq(port, 'POST', '/api/auth/send-code', { phone: M1.phone });
  const code = sc.json && sc.json.demo_code;
  const lg = await httpReq(port, 'POST', '/api/auth/login', { phone: M1.phone, code: code, national_id: M1.national_id });
  const ck = cookieFrom(lg);
  chk('D10c manager login', !!(lg.json && lg.json.ok && ck));
  let uidN = 1;
  const syncIns = async (data) => {
    const r = await httpReq(port, 'POST', '/api/sync', { ops: [{ uid: 'dk' + (uidN++), t: 'ins', c: 'dorm_assignments', by: M1.id, data: data }] }, ck);
    return (r.json && r.json.results && r.json.results[0]) || {};
  };
  const r1 = await syncIns({ school_id: 1, room_id: 1, student_id: 1, kind: 'pansion' });
  chk('D10d sync kind=pansion accepted', r1.ok === true, JSON.stringify(r1));
  const r2 = await syncIns({ school_id: 1, room_id: 1, student_id: 1, kind: 'xxx' });
  chk('D11 sync kind=xxx rejected', r2.ok === false, JSON.stringify(r2));

  console.log('dorm-kind: ' + okc + ' pass / ' + failc + ' fail');
  if (failc) { console.log('FAILURES:'); fails.forEach(f => console.log(' - ' + f)); }
  try { if (srv) srv.kill('SIGKILL'); } catch (e) {}
  try { dom.window.close(); } catch (e) {}
  process.exit(failc ? 1 : 0);
}
main().catch(e => { console.error('FATAL', e); process.exit(1); });
