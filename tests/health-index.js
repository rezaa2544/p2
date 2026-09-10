#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   health-index — شاخصِ سلامتِ مدرسه (G.1)
   H1  ریاضیِ خالص: افت/تیکت/رنگ و لبه‌ها
   H2  وزن‌دهی: بازتوزیعِ وزنِ عاملِ بی‌داده (اشتراک)
   H3  گردآوری: پنجره‌هایِ ۳۰روزه + فیلترِ مدرسه/وضعیت
   H4  هندلرِ مستقیم: تک‌مدرسه/همه‌مدارس + 401/403/404 (بدونِ HTTP)
   H5  سرتاسریِ HTTP: 401/403/200 + فیلترِ school_id + 404
   اجرا: node tests/health-index.js   (پورتِ ثابت: 9007)
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..');
const H = require('../server/health-index.js');
const REAL_STORE = path.join(ROOT, 'server', 'data', 'payesh.json');
const PORT = 9007;

let pass = 0, fail = 0;
const errs = [];
function chk(name, cond, extra) {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; errs.push(name); console.log('  ❌ ' + name + (extra !== undefined ? ' — ' + String(extra).slice(0, 220) : '')); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ── H1: ریاضیِ خالص ─────────────────────────────────────────────── */
function tH1() {
  console.log('H1 ریاضیِ خالص');
  const d = H.dropScore;
  chk('افتِ ۵۰٪ → ۵۰', d(50, 100).score === 50);
  chk('بدونِ افت → ۰', d(120, 100).score === 0 && d(100, 100).score === 0);
  chk('افتِ کامل → ۱۰۰', d(0, 100).score === 100);
  chk('بدونِ مبنا + فعالیت → ۰', d(7, 0).score === 0 && d(7, 0).noBaseline === true);
  chk('بدونِ مبنا + سکوت → ۵۰ خنثی', d(0, 0).score === 50 && d(0, 0).noData === true);
  chk('ورودیِ منفی/ناقص → امن', d(-5, -3).score === 50 && d(undefined, undefined).score === 50);
  chk('تیکت: ۰/۱/۲/۴/۹ → ۰/۲۵/۵۰/۱۰۰/۱۰۰',
    H.ticketScore(0) === 0 && H.ticketScore(1) === 25 && H.ticketScore(2) === 50 &&
    H.ticketScore(4) === 100 && H.ticketScore(9) === 100);
  chk('مرزِ رنگ: ۰/۳۰ سبز، ۳۱/۶۰ زرد، ۶۱/۱۰۰ قرمز',
    H.colorFor(0) === 'green' && H.colorFor(30) === 'green' &&
    H.colorFor(31) === 'yellow' && H.colorFor(60) === 'yellow' &&
    H.colorFor(61) === 'red' && H.colorFor(100) === 'red');
  chk('برونِ بازه قفل می‌شود', H.colorFor(-5) === 'green' && H.colorFor(500) === 'red');
}

/* ── H2: وزن‌دهی ────────────────────────────────────────────────── */
function tH2() {
  console.log('H2 وزن‌دهی');
  const full = { staffRecent: 10, staffPrev: 10, modRecent: 10, modPrev: 10, openTickets: 0, subOverdue: false };
  const h0 = H.computeHealth(full);
  chk('همه سالم → ۰ سبز', h0.score === 0 && h0.color === 'green' && h0.factors.length === 4);
  /* فقط ۴ تیکت، بقیه سالم، اشتراک بی‌داده: ‎(100×0.30)/0.80 = 37.5 → ۳۸ زرد */
  const h1 = H.computeHealth({ staffRecent: 10, staffPrev: 10, modRecent: 10, modPrev: 10, openTickets: 4 });
  chk('بازتوزیعِ وزن: ۳۸ زرد + ۳ عامل', h1.score === 38 && h1.color === 'yellow' && h1.factors.length === 3,
    JSON.stringify({ s: h1.score, c: h1.color, n: h1.factors.length }));
  chk('دلیلِ حذفِ اشتراک ثبت می‌شود', h1.reasons.some(r => r.indexOf('داده‌ای نیست') >= 0));
  /* افتِ کاملِ هر دو عامل + اشتراکِ عقب‌افتاده: ‎(100×.25+100×.25+0×.30+100×.20) = ۷۰ قرمز */
  const h2 = H.computeHealth({ staffRecent: 0, staffPrev: 100, modRecent: 0, modPrev: 100, openTickets: 0, subOverdue: true });
  chk('افتِ کامل + اشتراکِ عقب‌افتاده → ۷۰ قرمز', h2.score === 70 && h2.color === 'red', 'score=' + h2.score);
  /* خنثیِ دوطرفه (۵۰) با اشتراکِ به‌روز: ‎(50×.25+50×.25+0×.30+0×.20) = ۲۵ سبز */
  const h3 = H.computeHealth({ staffRecent: 0, staffPrev: 0, modRecent: 0, modPrev: 0, openTickets: 0, subOverdue: false });
  chk('سکوتِ کامل + اشتراکِ به‌روز → ۲۵ سبز', h3.score === 25 && h3.color === 'green', 'score=' + h3.score);
  chk('هر عامل دلیل دارد', h2.factors.every(f => typeof f.reason === 'string' && f.reason.length > 0));
}

/* ── H3: گردآوری ────────────────────────────────────────────────── */
function tH3() {
  console.log('H3 گردآوری');
  const NOW = new Date('2026-09-09T12:00:00Z').getTime();
  const iso = (ms) => new Date(ms).toISOString().slice(0, 10);
  const DAY = 24 * 3600 * 1000;
  const store = {
    staff_attendance: [
      { school_id: 1, status: 'present', date: iso(NOW - 5 * DAY) },   /* اخیر */
      { school_id: 1, status: 'late', date: iso(NOW - 40 * DAY) },     /* پیش */
      { school_id: 1, status: 'absent', date: iso(NOW - 5 * DAY) },    /* غیبت = شمرده نمی‌شود */
      { school_id: 1, status: 'present', date: iso(NOW - 70 * DAY) },  /* بیرونِ پنجره */
      { school_id: 2, status: 'present', date: iso(NOW - 5 * DAY) }    /* مدرسهٔ دیگر */
    ],
    attendance: [
      { school_id: 1, date: iso(NOW - 2 * DAY) },
      { school_id: 1, date: iso(NOW - 35 * DAY) },
      { school_id: 1, date: iso(NOW - 90 * DAY) }
    ],
    grades: [
      { school_id: 1, created_at: iso(NOW - 10 * DAY) },
      { school_id: 1, created_at: iso(NOW - 45 * DAY) + 'T08:00:00' }  /* با ساعت — برش می‌خورد */
    ],
    support_tickets: [
      { school_id: 1, status: 'open' },
      { school_id: 1, status: 'review' },
      { school_id: 1, status: 'closed' },
      { school_id: 2, status: 'open' }
    ]
  };
  const g = H.gather(store, 1, NOW);
  chk('کادر: اخیر=۱، پیش=۱', g.staffRecent === 1 && g.staffPrev === 1, JSON.stringify(g));
  chk('ماژول: اخیر=۲، پیش=۲', g.modRecent === 2 && g.modPrev === 2, JSON.stringify(g));
  chk('تیکتِ بازِ مدرسهٔ ۱ = ۲', g.openTickets === 2);
  chk('اشتراک همیشه null (بی‌داده)', g.subOverdue === null);
  const h = H.computeHealth(g);
  chk('سناریویِ گردآوری → ۱۹ سبز', h.score === 19 && h.color === 'green', 'score=' + h.score);
}

/* ── H4: هندلرِ مستقیم ───────────────────────────────────────────── */
async function tH4() {
  console.log('H4 هندلرِ مستقیم');
  const store = {
    schools: [{ id: 1, name: 'الف' }, { id: 2, name: 'ب' }],
    staff_attendance: [], attendance: [], grades: [], support_tickets: []
  };
  const sent = [];
  const fakeAudit = () => {};
  const hi = H.createHealthIndex({
    store,
    sessionFrom: async (req) => req.__user || null,
    sendJson: (res, code, body) => { sent.push({ code, body }); return body; },
    audit: fakeAudit
  });
  const q = (s) => new URLSearchParams(s);
  await hi.apiHealthIndex({ __user: null }, {}, q(''));
  chk('بی‌نشست → ۴۰۱', sent[0].code === 401 && sent[0].body.code === 'no_session');
  await hi.apiHealthIndex({ __user: { id: 2, role: 'manager', school_id: 1 } }, {}, q(''));
  chk('مدیر → ۴۰۳', sent[1].code === 403 && sent[1].body.code === 'forbidden');
  const sa = { id: 1, role: 'superadmin' };
  await hi.apiHealthIndex({ __user: sa }, {}, q('school_id=2'));
  chk('تک‌مدرسه → ۲۰۰ + نامِ ب', sent[2].code === 200 && sent[2].body.school.name === 'ب' && typeof sent[2].body.score === 'number');
  await hi.apiHealthIndex({ __user: sa }, {}, q('school_id=999'));
  chk('مدرسهٔ ناموجود → ۴۰۴', sent[3].code === 404 && sent[3].body.code === 'no_school');
  await hi.apiHealthIndex({ __user: sa }, {}, q(''));
  chk('همه → ۲۰۰ + ۲ مدرسه', sent[4].code === 200 && sent[4].body.schools.length === 2 && sent[4].body.schools[0].color !== undefined);
}

/* ── H5: سرتاسریِ HTTP ───────────────────────────────────────────── */
let tmp = null, server = null;
process.on('exit', () => { try { if (server) server.kill('SIGKILL'); } catch (e) {} try { if (tmp) fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {} });

function httpReq(method, p, body, cookie) {
  return new Promise((resolve) => {
    const data = body ? JSON.stringify(body) : null;
    const req = http.request({
      hostname: '127.0.0.1', port: PORT, path: p, method,
      headers: Object.assign(
        data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {},
        cookie ? { Cookie: cookie } : {}
      )
    }, (res) => {
      let b = '';
      res.on('data', (d) => (b += d));
      res.on('end', () => {
        let j = null; try { j = JSON.parse(b); } catch (e) {}
        resolve({ status: res.statusCode, json: j, headers: res.headers });
      });
    });
    req.on('error', () => resolve({ status: 0, json: null, headers: {} }));
    if (data) req.write(data);
    req.end();
  });
}

async function tH5() {
  console.log('H5 سرتاسریِ HTTP');
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'payesh-hi-'));
  const storeFile = path.join(tmp, 'payesh.json');
  fs.copyFileSync(REAL_STORE, storeFile);
  const env = Object.assign({}, process.env, {
    PORT: String(PORT), HOST: '127.0.0.1',
    PAYESH_STORE: storeFile, PAYESH_AUDIT: path.join(tmp, 'audit.log'),
    PAYESH_KEY: path.join(tmp, 'jwt.key'), PAYESH_DEMO_CODE: '1'
  });
  server = spawn(process.execPath, ['server/index.js'], { cwd: ROOT, env, stdio: 'pipe' });
  let booted = false;
  for (let i = 0; i < 50; i++) {
    const h = await httpReq('GET', '/api/health');
    if (h.status === 200 && h.json && h.json.ok) {
      if (h.json.pid === server.pid) { booted = true; break; }
      try { process.kill(h.json.pid); } catch (e) {}
    }
    if (server.exitCode !== null) break;
    await sleep(300);
  }
  chk('سرور بالا آمد (9007)', booted);
  if (!booted) return;

  const seed = JSON.parse(fs.readFileSync(storeFile, 'utf8'));
  const U = (id) => seed.users.find(u => u.id === id);
  async function login(u) {
    const sc = await httpReq('POST', '/api/auth/send-code', { phone: String(u.phone).replace(/[\s\-()]/g, '') });
    const code = sc.json && sc.json.demo_code;
    const lg = await httpReq('POST', '/api/auth/login', { phone: String(u.phone).replace(/[\s\-()]/g, ''), code, national_id: u.national_id });
    if (!(lg.json && lg.json.ok)) return null;
    const sc2 = lg.headers['set-cookie'];
    return Array.isArray(sc2) ? sc2[0].split(';')[0] : (sc2 || '').split(';')[0];
  }
  const cSA = await login(U(1));
  const cM = await login(U(2));
  chk('دو نشستِ واقعی (سوپرادمین + مدیر)', !!(cSA && cM));

  const anon = await httpReq('GET', '/api/health-index');
  chk('بی‌نشست → ۴۰۱', anon.status === 401, 'status=' + anon.status);
  const mgr = await httpReq('GET', '/api/health-index', null, cM);
  chk('مدیر → ۴۰۳', mgr.status === 403, 'status=' + mgr.status);
  const one = await httpReq('GET', '/api/health-index?school_id=1', null, cSA);
  chk('تک‌مدرسه → ۲۰۰ + امتیاز/رنگ/دلیل',
    one.status === 200 && one.json && one.json.ok && typeof one.json.score === 'number' &&
    ['green', 'yellow', 'red'].indexOf(one.json.color) >= 0 && (one.json.reasons || []).length >= 3,
    'status=' + one.status);
  const all = await httpReq('GET', '/api/health-index', null, cSA);
  chk('همه → ۲۰۰ + آرایهٔ مدارس',
    all.status === 200 && all.json && all.json.ok && Array.isArray(all.json.schools) && all.json.schools.length >= 1,
    'status=' + all.status);
  const bad = await httpReq('GET', '/api/health-index?school_id=999999', null, cSA);
  chk('مدرسهٔ ناموجود → ۴۰۴', bad.status === 404, 'status=' + bad.status);
}

async function main() {
  const t0 = Date.now();
  tH1(); tH2(); tH3(); await tH4(); await tH5();
  try { if (server) server.kill('SIGKILL'); } catch (e) {}
  server = null;
  console.log('──────────────────────────────────────────');
  console.log(`سوئیت سلامت: ${pass}/${pass + fail} موفق (${Date.now() - t0} ms) — ${fail === 0 ? 'بدون خطا ✅' : 'اشکال دارد ❌'}`);
  process.exit(fail === 0 ? 0 : 1);
}
main();
