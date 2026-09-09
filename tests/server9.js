#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   بکاپِ دوره‌ایِ خودکار (باقی‌ماندهٔ OPEN_ITEMS 2.4 — بند 15.2)
   درون‌پروسه، بدون cronِ بیرونی:
     A1  پیش‌فرض (بدون env) → هیچ بکاپِ خودکاری نمی‌سازد
     A2  PAYESH_BACKUP_EVERY_MS=1500 → بکاپ‌های خودکار روی disk + آدیت
         (source:"auto"، user_id:null)
     A3  بکاپِ خودکار هم فقط‌داده است (بدون __*)
     A4  endpointِ دستی کنارِ زمان‌بندی بدونِ مشکل کار می‌کند (superadmin 200 /
         مدیر 403)
   اجرا: node tests/server9.js
   ═══════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const http = require('http');

const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const errors = [];
function chk(name, cond, extra) {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; errors.push(name + (extra !== undefined ? ' — ' + String(extra).slice(0, 160) : '')); console.log('  ❌ ' + name + (extra !== undefined ? ' — ' + String(extra).slice(0, 160) : '')); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function httpReq(port, method, p, body, jar) {
  return new Promise((resolve) => {
    const data = body ? JSON.stringify(body) : null;
    const headers = { 'Content-Type': 'application/json' };
    if (jar) headers['Cookie'] = jar.headers().join('; ');
    if (jar && jar.get('csrf_token')) headers['X-CSRF-Token'] = jar.get('csrf_token');
    const req = http.request({ hostname: '127.0.0.1', port, path: p, method, headers }, (res) => {
      let b = '';
      res.on('data', (d) => (b += d));
      res.on('end', () => {
        if (jar) jar.absorb(res.headers);
        let j = null; try { j = JSON.parse(b); } catch (e) {}
        resolve({ status: res.statusCode, headers: res.headers, json: j, raw: b });
      });
    });
    req.on('error', () => resolve({ status: 0, headers: {}, json: null, raw: '' }));
    if (data) req.write(data);
    req.end();
  });
}
function makeJar() {
  const jar = {};
  return {
    headers() { return Object.keys(jar).map((k) => k + '=' + jar[k]); },
    get(k) { return jar[k]; },
    absorb(h) {
      const sc = h['set-cookie'];
      if (!sc) return;
      sc.forEach((c) => {
        const [pair] = c.split(';');
        const i = pair.indexOf('=');
        if (i > 0) jar[pair.slice(0, i).trim()] = pair.slice(i + 1).trim();
      });
    }
  };
}

async function bootServer(p, env) {
  const s = spawn(process.execPath, ['server/index.js'], {
    cwd: ROOT,
    env: Object.assign({}, process.env, env),
    stdio: 'pipe'
  });
  let booted = false;
  for (let i = 0; i < 50; i++) {
    const h = await httpReq(p, 'GET', '/api/health').then((r) => r.json).catch(() => null);
    if (h && h.ok && h.pid === s.pid) { booted = true; break; }
    if (h && h.ok) break;
    await sleep(300);
  }
  if (!booted) s.kill('SIGKILL');
  return booted ? s : null;
}

async function main() {
  console.log('\n▸ بکاپِ دوره‌ایِ خودکار (2.4 — بند 15.2)');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'payesh-s9-'));
process.on('exit', () => { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {} }); /* پاک‌سازیِ tmp تا /tmp پر نشود */
  const mk = (n) => {
    const dir = path.join(tmp, n);
    fs.mkdirSync(dir);
    const storeFile = path.join(dir, 'payesh.json');
    fs.copyFileSync(path.join(ROOT, 'server/data/payesh.json'), storeFile);
    const st0 = JSON.parse(fs.readFileSync(storeFile, 'utf8'));
    const T0 = new Date().toISOString().slice(0, 10);
    if (st0.attendance_modes) {
      st0.attendance_modes = st0.attendance_modes.filter(m => !(m.school_id === 1 && m.date === T0 && m.mode === 'virtual'));
      fs.writeFileSync(storeFile, JSON.stringify(st0));
    }
    return { dir, storeFile, keyFile: path.join(dir, 'jwt.key'), auditFile: path.join(dir, 'audit.log'), backupsDir: path.join(dir, 'backups') };
  };
  const A = mk('off');
  const B = mk('auto');
  const baseEnv = (d) => ({
    PORT: String(d.port), HOST: '127.0.0.1',
    PAYESH_STORE: d.storeFile, PAYESH_AUDIT: d.auditFile, PAYESH_KEY: d.keyFile,
    PAYESH_DEMO_CODE: '1'
  });

  /* ── سرور A: پیش‌فرض (خودکار خاموش) ── */
  let srvA = null;
  for (const p of [8994]) {
    A.port = p;
    srvA = await bootServer(p, baseEnv(A));
  }
  chk('A0a سرورِ پیش‌فرض بالا آمد', srvA !== null);

  /* ── سرور B: خودکار هر ۱۵۰ms ── */
  let srvB = null;
  for (const p of [8995]) {
    B.port = p;
    const env = baseEnv(B);
    env.PAYESH_BACKUP_EVERY_MS = '1500';
    srvB = await bootServer(p, env);
  }
  chk('A0b سرورِ خودکار بالا آمد', srvB !== null);
  if (!srvA || !srvB) { process.exit(1); }

  /* صبر تا ۲+ تیک در سرور B (و هم‌زمان، هیچ تیکی در A نباشد) */
  await sleep(4200);

  const filesA = fs.existsSync(A.backupsDir) ? fs.readdirSync(A.backupsDir).filter(f => f.endsWith('.json')) : [];
  const filesB = fs.existsSync(B.backupsDir) ? fs.readdirSync(B.backupsDir).filter(f => f.endsWith('.json')) : [];

  chk('A1 بدون env → هیچ بکاپِ خودکاری (فولدر خالی/غایب)',
    filesA.length === 0, JSON.stringify(filesA));
  chk('A2 با env → چند بکاپِ خودکار روی disk',
    filesB.length >= 2, 'تعداد: ' + filesB.length);

  const auditB = fs.existsSync(B.auditFile) ? fs.readFileSync(B.auditFile, 'utf8') : '';
  const autoLines = auditB.split('\n').filter(l => l.indexOf('"source":"auto"') > -1);
  chk('A2 آدیت: backup_created با source:"auto" و user_id:null',
    autoLines.length >= 2 && /"user_id":null/.test(autoLines[0]), autoLines[0] || 'خالی');
  const auditA = fs.existsSync(A.auditFile) ? fs.readFileSync(A.auditFile, 'utf8') : '';
  chk('A1 آدیتِ سرورِ پیش‌فرض: هیچ backup_created ندارد',
    auditA.indexOf('backup_created') === -1, auditA.slice(-120));

  /* A3: بکاپِ خودکار هم فقط‌داده است */
  let parsedB = null;
  try { parsedB = JSON.parse(fs.readFileSync(path.join(B.backupsDir, filesB[filesB.length - 1]), 'utf8')); } catch (e) {}
  chk('A3 بکاپِ خودکار فقط‌داده (بدون __*) و users کامل',
    !!parsedB && !Object.keys(parsedB).some(k => k.indexOf('__') === 0) &&
    Array.isArray(parsedB.users) && parsedB.users.length > 0,
    parsedB ? Object.keys(parsedB).filter(k => k.indexOf('__') === 0).join(',') : 'parse-fail');

  /* A4: endpointِ دستی کنارِ زمان‌بندی */
  const su = JSON.parse(fs.readFileSync(B.storeFile, 'utf8'));
  async function loginAs(u) {
    const jar = makeJar();
    const send = await httpReq(B.port, 'POST', '/api/auth/send-code', { phone: u.phone }, jar);
    const code = send.json && send.json.demo_code;
    await httpReq(B.port, 'POST', '/api/auth/login', { phone: u.phone, code: String(code || ''), national_id: u.national_id }, jar);
    return jar;
  }
  const before = filesB.length;
  const saJar = await loginAs(su.users.find(u => u.role === 'superadmin'));
  const manual = await httpReq(B.port, 'POST', '/api/admin/backup', {}, saJar);
  const after = fs.existsSync(B.backupsDir) ? fs.readdirSync(B.backupsDir).filter(f => f.endsWith('.json')).length : 0;
  /* ⚠️ تایمرِ خودکار ممکن است وسطِ این کار هم تیک بزند؛ پس شمارشِ
     دقیق نمی‌سنجیم — فایلِ پاسخ باید روی disk باشد و کلِ تعداد زیاد شده باشد */
  chk('A4a دستی (superadmin): 200 + فایلِ پاسخ روی disk',
    manual.status === 200 && manual.json && manual.json.ok === true &&
    typeof manual.json.file === 'string' &&
    fs.existsSync(path.join(B.backupsDir, manual.json.file)) && after >= before + 1,
    manual.raw + ' (' + before + '→' + after + ')');
  const mgrJar = await loginAs(su.users.find(u => u.role === 'manager' && u.school_id === 1));
  const mgr = await httpReq(B.port, 'POST', '/api/admin/backup', {}, mgrJar);
  chk('A4b دستی (مدیر): 403 forbidden', mgr.status === 403 && mgr.json && mgr.json.code === 'forbidden', mgr.raw);

  /* آدیتِ دستی باید source:"manual" + user_id عددی باشد */
  const auditB2 = fs.readFileSync(B.auditFile, 'utf8');
  const manualLines = auditB2.split('\n').filter(l => l.indexOf('"source":"manual"') > -1);
  chk('A4 آدیت: backup_created با source:"manual" و user_id عددی',
    manualLines.length >= 1 && /"user_id":\d+/.test(manualLines[0]), manualLines[0] || 'خالی');

  srvA.kill('SIGKILL');
  srvB.kill('SIGKILL');
  await sleep(200);

  console.log('\n' + '─'.repeat(52));
  console.log(`server9 (بکاپِ خودکار): ${pass} بررسی — ✅ ${pass} · ❌ ${fail}`);
  if (fail) { console.log(errors.join('\n')); process.exit(1); }
}
main().catch((e) => { console.error(e); process.exit(1); });
