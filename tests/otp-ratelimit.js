#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   otp-ratelimit — OTPِ ۶رقمی + rate-limitِ توزیع‌شده (R101)
   ───────────────────────────────────────────────────────────────────
   R1  شکلِ کد: ۶ رقم، CSPRNG (۱۰ نمونه متمایز) + hash در otp.json
   R2  سقفِ phone: ۵ ارسال در ۱۵ دقیقه (پیش‌فرض)
   R3  سقفِ روزانهٔ phone: ۲۰ (پیش‌فرض — ۲۱ ارسال)
   R4  سقفِ IP در ارسال: ۱۰ در ۱۵ دقیقه (پیش‌فرض)
   R5  سقفِ IP در login: ۱۰ در ۱۵ دقیقه (پیش‌فرض)
   R6  tries: ۵ کدِ غلط ← کد می‌میرد؛ ارسالِ مجدد ← ورود موفق
   R7  brute-force: ۱۸ تلاش از یک IP ← ۴۲۹ها + هیچ نشستی + سلامتِ سرور
   R8  توزیع‌شدگی: دو نمونه با یک otp.json (cooldown و کد مشترک)
   R9  حالتِ تولید: بدونِ echo + شکلِ یکسانِ موجود/ناموجود
   R10 مهاجرت: کدِ درونِ store (دورهٔ R96) پس از ارتقا کار می‌کند
   R11 رازداری: هیچ plaintext در otp.json/audit/log نیست
   اجرا: node tests/otp-ratelimit.js   (پورت‌ها: 8981–8989)
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..');
const REAL_STORE = path.join(ROOT, 'server', 'data', 'payesh.json');

let pass = 0, fail = 0;
const errors = [];
function chk(name, cond, extra) {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; errors.push(name + (extra !== undefined ? ' — ' + String(extra).slice(0, 250) : '')); console.log('  ❌ ' + name + (extra !== undefined ? ' — ' + String(extra).slice(0, 250) : '')); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const normPhone = (p) => String(p || '').replace(/[\s\-()]/g, '');

const procs = [];
const tmpdirs = [];
const serverLogs = [];
function spawnServer(env) {
  const p = spawn(process.execPath, ['server/index.js'], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
  p.log = '';
  p.stdout.on('data', (d) => (p.log += d));
  p.stderr.on('data', (d) => (p.log += d));
  procs.push(p);
  return p;
}
process.on('exit', () => {
  for (const p of procs) { try { p.kill('SIGKILL'); } catch (e) {} }
  for (const d of tmpdirs) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (e) {} }
});
function close(p) {
  serverLogs.push(p.log || '');
  try { p.kill('SIGKILL'); } catch (e) {}
}

function req(method, port, p, body, headers) {
  return new Promise((resolve) => {
    const data = body !== undefined ? JSON.stringify(body) : null;
    const r = http.request({
      hostname: '127.0.0.1', port, path: p, method,
      headers: Object.assign(
        data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {},
        headers || {}
      )
    }, (res) => {
      let b = '';
      res.on('data', (d) => (b += d));
      res.on('end', () => {
        let j = null; try { j = JSON.parse(b); } catch (e) {}
        resolve({ status: res.statusCode, json: j, headers: res.headers, text: b });
      });
    });
    r.on('error', () => resolve({ status: 0, json: null, headers: {}, text: '' }));
    if (data) r.write(data);
    r.end();
  });
}

async function boot(port, extraEnv, dir, storeName) {
  const d = dir || fs.mkdtempSync(path.join(os.tmpdir(), 'payesh-otp-'));
  if (!dir) tmpdirs.push(d);
  const env = Object.assign({}, process.env, {
    PORT: String(port), HOST: '127.0.0.1',
    PAYESH_STORE: path.join(d, storeName || 's.json'),
    PAYESH_AUDIT: path.join(d, 'a-' + port + '.log'),
    PAYESH_KEY: path.join(d, 'k-' + port + '.key'),
    PAYESH_DEMO_CODE: '1'
  }, extraEnv || {});
  if (env.PAYESH_STORE_CONTENT) {
    fs.writeFileSync(env.PAYESH_STORE, env.PAYESH_STORE_CONTENT);
    delete env.PAYESH_STORE_CONTENT;
  } else if (!fs.existsSync(env.PAYESH_STORE)) {
    fs.copyFileSync(REAL_STORE, env.PAYESH_STORE);
  }
  const p = spawnServer(env);
  for (let i = 0; i < 50; i++) {
    const h = await req('GET', port, '/api/health');
    if (h.status === 200 && h.json && h.json.ok) {
      if (h.json.pid === p.pid) return { proc: p, dir: d, env };
      try { process.kill(h.json.pid); } catch (e) {} /* سرورِ ماندهٔ اجرایِ پیشین */
    }
    if (p.exitCode !== null) return null;
    await sleep(300);
  }
  return null;
}

async function main() {
  const seed = JSON.parse(fs.readFileSync(REAL_STORE, 'utf8'));
  const known = seed.users.filter(u => u.phone && u.national_id && u.active !== 0).slice(0, 14);
  if (known.length < 14) { console.log('❌ seed کم‌جمعیت است (کاربرِ کمتر از ۱۴)'); process.exit(1); }
  const knownPhones = new Set(known.map(u => normPhone(u.phone)));
  const unknown = [];
  for (let i = 1; unknown.length < 12; i++) {
    const ph = '090000000' + String(i).padStart(2, '0');
    if (!knownPhones.has(ph) && !seed.users.some(u => normPhone(u.phone) === ph)) unknown.push(ph);
  }
  const NID = '0012345678';
  const sampled = []; /* plaintextهایِ نمونه — برایِ R11 */

  /* ── R1: شکل + CSPRNG + hash در otp.json (پیش‌فرض‌ها) ── */
  console.log('— R1: شکلِ کد —');
  {
    const s = await boot(8981);
    chk('R0 سرورِ 8981 بالا آمد', !!s);
    if (!s) return;
    for (let i = 0; i < 10; i++) {
      const u = known[i];
      const r = await req('POST', 8981, '/api/auth/send-code', { phone: normPhone(u.phone) });
      chk('R1a send برایِ کاربرِ ' + u.id + ' ← ۲۰۰', r.status === 200 && r.json && r.json.code === 'sent', r.status);
      if (r.json && r.json.demo_code) sampled.push(r.json.demo_code);
    }
    const shape = sampled.length === 10 && sampled.every(c => /^\d{6}$/.test(c));
    chk('R1b هر ۱۰ کد ۶رقمی‌اند', shape, JSON.stringify(sampled));
    chk('R1c هر ۱۰ کد متمایز‌اند (CSPRNG)', new Set(sampled).size === sampled.length);
    const otpFile = path.join(s.dir, 'otp.json'); /* مسیرِ پیش‌فرض */
    const otpTxt = fs.existsSync(otpFile) ? fs.readFileSync(otpFile, 'utf8') : '';
    chk('R1d فایلِ otp.json در کنارِ store ساخته شد', otpTxt.length > 50);
    chk('R1e فقط hash در otp.json (۶۴hex + بی‌plaintext)',
      /\{[^{}]*"h":"[0-9a-f]{64}"/.test(otpTxt) && !sampled.some(c => otpTxt.indexOf('"' + c + '"') > -1));
    close(s.proc);
  }

  /* ── R2: سقفِ phone (۵ در ۱۵ دقیقه — پیش‌فرض) ── */
  console.log('— R2: سقفِ phone —');
  {
    const s = await boot(8982, { PAYESH_SMS_COOLDOWN_S: '0' });
    chk('R0 سرورِ 8982 بالا آمد', !!s);
    if (!s) return;
    const ph = normPhone(known[10].phone);
    let ok = 0, limited = -1;
    for (let i = 0; i < 7; i++) {
      const r = await req('POST', 8982, '/api/auth/send-code', { phone: ph });
      if (r.status === 200) ok++;
      else if (r.status === 429 && limited < 0) limited = i + 1;
    }
    chk('R2a پنج ارسالِ نخست ۲۰۰', ok === 5, 'ok=' + ok);
    chk('R2b ارسالِ ششم ۴۲۹ (سقفِ پیش‌فرضِ ۵)', limited === 6, '429 در #' + limited);
    close(s.proc);
  }

  /* ── R3: سقفِ روزانه (۲۰ — پیش‌فرض) ── */
  console.log('— R3: سقفِ روزانه —');
  {
    const s = await boot(8983, { PAYESH_SMS_COOLDOWN_S: '0', PAYESH_SMS_WINDOW_S: '2' });
    chk('R0 سرورِ 8983 بالا آمد', !!s);
    if (!s) return;
    const ph = normPhone(known[11].phone);
    let ok = 0, first429 = -1;
    for (let i = 0; i < 21; i++) {
      if (i > 0 && i % 5 === 0) await sleep(2200); /* لغزشِ پنجرهٔ phone */
      const r = await req('POST', 8983, '/api/auth/send-code', { phone: ph });
      if (r.status === 200) ok++;
      else if (r.status === 429 && first429 < 0) first429 = i + 1;
    }
    chk('R3a بیست ارسال ۲۰۰', ok === 20, 'ok=' + ok);
    chk('R3b ارسالِ ۲۱م ۴۲۹ (سقفِ پیش‌فرضِ ۲۰)', first429 === 21, '429 در #' + first429);
    await sleep(2200); /* پنجرهٔ phone پاک شد — اگر ۴۲۹ِ روزانه باشد می‌ماند */
    const r = await req('POST', 8983, '/api/auth/send-code', { phone: ph });
    chk('R3c پس از لغزشِ پنجره هنوز ۴۲۹ (یعنی سقفِ روزانه، نه phone)', r.status === 429, r.status);
    close(s.proc);
  }

  /* ── R4: سقفِ IP در ارسال (۱۰ در ۱۵ دقیقه — پیش‌فرض) ── */
  console.log('— R4: سقفِ IP (ارسال) —');
  {
    const s = await boot(8984);
    chk('R0 سرورِ 8984 بالا آمد', !!s);
    if (!s) return;
    let ok = 0, first429 = -1;
    for (let i = 0; i < 11; i++) {
      const r = await req('POST', 8984, '/api/auth/send-code', { phone: unknown[i] });
      if (r.status === 200) ok++;
      else if (r.status === 429 && first429 < 0) first429 = i + 1;
    }
    chk('R4a ده ارسالِ نخست ۲۰۰ (شکلِ یکسانِ ناموجود)', ok === 10, 'ok=' + ok);
    chk('R4b ارسالِ ۱۱م ۴۲۹ (سقفِ پیش‌فرضِ ۱۰/IP)', first429 === 11, '429 در #' + first429);
    close(s.proc);
  }

  /* ── R5+R6+R7: سقفِ IP در login + tries + brute-force ── */
  console.log('— R5/R6/R7: سقفِ IP در login —');
  {
    const s = await boot(8985, { PAYESH_SMS_COOLDOWN_S: '0' });
    chk('R0 سرورِ 8985 بالا آمد', !!s);
    if (!s) return;
    const XFF9 = { 'X-Forwarded-For': '9.9.9.9' };
    let n401 = 0, first429 = -1;
    for (let i = 0; i < 11; i++) {
      const r = await req('POST', 8985, '/api/auth/login',
        { phone: unknown[i], code: '000000', national_id: NID }, XFF9);
      if (r.status === 401) n401++;
      else if (r.status === 429 && first429 < 0) first429 = i + 1;
    }
    chk('R5a ده loginِ نخست ۴۰۱', n401 === 10, '401=' + n401);
    chk('R5b یازدهمین login از همان IP ← ۴۲۹', first429 === 11, '429 در #' + first429);

    /* R6: tries — با IPِ واقعی (تمیز) */
    const u = known[12];
    const ph = normPhone(u.phone);
    const sc = await req('POST', 8985, '/api/auth/send-code', { phone: ph });
    const good = sc.json && sc.json.demo_code;
    chk('R6a ارسال برایِ tries ← ۲۰۰ + کد', sc.status === 200 && /^\d{6}$/.test(good || ''), sc.status);
    let wrongOk = 0, wrongSess = false;
    for (let i = 0; i < 5; i++) {
      const w = await req('POST', 8985, '/api/auth/login', { phone: ph, code: '000000', national_id: u.national_id });
      if (w.status === 401) wrongOk++;
      if (w.status === 200 || w.headers['set-cookie']) wrongSess = true;
    }
    chk('R6a2 هر ۵ کدِ غلط ۴۰۱ + بی‌نشست', wrongOk === 5 && !wrongSess, '401×' + wrongOk);
    const dead = await req('POST', 8985, '/api/auth/login', { phone: ph, code: good, national_id: u.national_id });
    chk('R6b پس از ۵ غلط، کدِ درست هم ۴۰۱ (کد کِلی شد)', dead.status === 401 && dead.json.code === 'bad_code', dead.status);
    const sc2 = await req('POST', 8985, '/api/auth/send-code', { phone: ph });
    const good2 = sc2.json && sc2.json.demo_code;
    if (good2) sampled.push(good2);
    const lg = await req('POST', 8985, '/api/auth/login', { phone: ph, code: good2, national_id: u.national_id });
    chk('R6c ارسالِ مجدد + کدِ درست ← ۲۰۰ + کوکی', lg.status === 200 && !!(lg.headers['set-cookie']), lg.status);

    /* R7: brute-force از IPِ جعلیِ دیگر — ۱۲ تلاش (تأخیرِ تصاعدی هر تلاش را
       کند می‌کند، پس ۱۲ کافی است: ۱۰ تایِ نخست ۴۰۱ و دو تایِ آخر ۴۲۹) */
    const XFF8 = { 'X-Forwarded-For': '9.9.9.8' };
    let c429 = 0, leakedSession = false;
    for (let i = 0; i < 12; i++) {
      const v = known[i % 3];
      const r = await req('POST', 8985, '/api/auth/login',
        { phone: normPhone(v.phone), code: '111111', national_id: v.national_id }, XFF8);
      if (r.status === 429) c429++;
      if (r.status === 200 || r.headers['set-cookie']) leakedSession = true;
    }
    chk('R7a دوازده تلاش ← ۲ بارِ آخر ۴۲۹', c429 >= 2, '429×' + c429);
    chk('R7b هیچ نشستی صادر نشد', !leakedSession);
    const ctl = await req('POST', 8985, '/api/auth/login',
      { phone: ph, code: good2, national_id: u.national_id });
    chk('R7c ورودِ سالم از IPِ واقعی هنوز ۲۰۰... (کد مصرف شده ⇒ ۴۰۱ ولی نه ۴۲۹)',
      ctl.status === 401 && ctl.json.code === 'bad_code', ctl.status + ' ' + JSON.stringify(ctl.json));
    const h = await req('GET', 8985, '/api/health');
    chk('R7d سرور پس از حمله سالم است', h.status === 200 && h.json && h.json.ok);
    close(s.proc);
  }

  /* ── R8: توزیع‌شدگی — دو نمونه، یک otp.json ── */
  console.log('— R8: توزیع‌شدگی —');
  {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'payesh-otp-pair-'));
    tmpdirs.push(d);
    const sharedOtp = path.join(d, 'shared-otp.json');
    const A = await boot(8986, { PAYESH_OTP_FILE: sharedOtp }, d, 'a.json');
    const B = await boot(8987, { PAYESH_OTP_FILE: sharedOtp }, d, 'b.json');
    chk('R0 هر دو نمونه بالا آمدند', !!(A && B));
    if (!(A && B)) return;
    const u = known[13];
    const ph = normPhone(u.phone);
    const rA = await req('POST', 8986, '/api/auth/send-code', { phone: ph });
    const codeA = rA.json && rA.json.demo_code;
    if (codeA) sampled.push(codeA);
    chk('R8a ارسال از نمونهٔ A ← ۲۰۰', rA.status === 200 && /^\d{6}$/.test(codeA || ''), rA.status);
    const rB = await req('POST', 8987, '/api/auth/send-code', { phone: ph });
    chk('R8b ارسالِ فوری از نمونهٔ B ← ۴۲۹ (cooldownِ مشترک)', rB.status === 429, rB.status);
    const lgB = await req('POST', 8987, '/api/auth/login', { phone: ph, code: codeA, national_id: u.national_id });
    chk('R8c ورود با کدِ A در نمونهٔ B ← ۲۰۰ (کدِ مشترک)', lgB.status === 200, lgB.status);
    close(A.proc); close(B.proc);
  }

  /* ── R9: حالتِ تولید (بی‌echo) ── */
  console.log('— R9: تولید —');
  {
    const s = await boot(8988, { PAYESH_DEMO_CODE: '0' });
    chk('R0 سرورِ 8988 بالا آمد', !!s);
    if (!s) return;
    const ph = normPhone(known[0].phone);
    const rk = await req('POST', 8988, '/api/auth/send-code', { phone: ph });
    const ru = await req('POST', 8988, '/api/auth/send-code', { phone: unknown[11] });
    chk('R9a موجود: ۲۰۰ بدونِ demo_code', rk.status === 200 && !('demo_code' in (rk.json || {})) && Object.keys(rk.json).length === 2, JSON.stringify(rk.json));
    chk('R9b ناموجود: همانِ shape (enum guard)', ru.status === 200 && JSON.stringify(ru.json) === JSON.stringify(rk.json), JSON.stringify(ru.json));
    close(s.proc);
  }

  /* ── R10: مهاجرت از store (دورهٔ R96) ── */
  console.log('— R10: مهاجرت —');
  {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'payesh-otp-mig-'));
    tmpdirs.push(d);
    const legacy = JSON.parse(fs.readFileSync(REAL_STORE, 'utf8'));
    const u1 = legacy.users.find(x => x.id === known[0].id);
    const u2 = legacy.users.find(x => x.id === known[1].id);
    const p1 = normPhone(u1.phone), p2 = normPhone(u2.phone);
    const oldCode = '1234'; /* کدِ ۴رقمیِ دورهٔ پیشین */
    legacy.__auth = legacy.__auth || {};
    legacy.__auth.codes = {};
    legacy.__auth.codes[p1] = {
      h: crypto.createHash('sha256').update(oldCode + '|' + p1).digest('hex'),
      at: Date.now(), user_id: u1.id, tries: 0
    };
    legacy.__auth.code_cd = {};
    legacy.__auth.code_cd[p2] = Date.now(); /* cooldownِ به‌ارث‌رسیده */
    const s = await boot(8989, { PAYESH_STORE_CONTENT: JSON.stringify(legacy) }, d, 'mig.json');
    chk('R0 سرورِ 8989 بالا آمد', !!s);
    if (!s) return;
    const lg = await req('POST', 8989, '/api/auth/login', { phone: p1, code: oldCode, national_id: u1.national_id });
    chk('R10a کدِ قدیمی پس از ارتقا کار می‌کند', lg.status === 200, lg.status + ' ' + JSON.stringify(lg.json));
    const rCd = await req('POST', 8989, '/api/auth/send-code', { phone: p2 });
    chk('R10b سقفِ قدیمی (cooldown) مهاجرت کرد ← ۴۲۹', rCd.status === 429, rCd.status);
    const otpTxt = fs.existsSync(path.join(d, 'otp.json')) ? fs.readFileSync(path.join(d, 'otp.json'), 'utf8') : '';
    chk('R10c پس از مهاجرت otp.json ساخته شد', otpTxt.indexOf('"v":1') > -1);
    await sleep(2500); /* persistِ store */
    const after = JSON.parse(fs.readFileSync(path.join(d, 'mig.json'), 'utf8'));
    chk('R10d کلیدهایِ legacy از store پاک شدند',
      !(after.__auth && (after.__auth.codes || after.__auth.code_cd)), JSON.stringify(Object.keys((after.__auth) || {})));
    close(s.proc);
  }

  /* ── R11: رازداریِ سراسری ── */
  console.log('— R11: رازداری —');
  {
    let leak = '';
    for (const d of tmpdirs) {
      const files = fs.readdirSync(d).filter(f => f.endsWith('.json') || f.endsWith('.log'));
      for (const f of files) {
        const t = fs.readFileSync(path.join(d, f), 'utf8');
        for (const c of sampled) {
          if (t.indexOf('"' + c + '"') > -1) leak = f + ' ← ' + c;
        }
      }
    }
    for (const log of serverLogs) {
      for (const c of sampled) {
        if (log.indexOf(c) > -1) leak = 'server-stdout ← ' + c;
      }
    }
    chk('R11a هیچ plaintext در otp.json/audit/store/log نیست (' + sampled.length + ' نمونه)', !leak, leak);
  }

  console.log('\n────────────────────────────────────────────────────');
  console.log(`otp-ratelimit: ${pass} ✅ / ${fail} ❌`);
  if (errors.length) errors.slice(0, 12).forEach(e => console.log('   ' + e));
  process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error('FATAL', e); process.exit(1); });
