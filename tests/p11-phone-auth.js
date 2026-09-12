#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   p11-phone-auth.js — P1-1 (Wave 18 §۵-۴): جستجوی auth بر اساسِ تلفن
   ─────────────────────────────────────────────────────────────────
   قراردادِ جدید: userByPhone در حالتِ PG-live از ایندکسِ عبارتیِ
   010 می‌آید (کاربرِ خارج از آینهٔ سقف‌دار هم پیدا می‌شود)؛ بدونِ
   PG همان اسکنِ آینه؛ خطایِ PG ⇒ degrade به آینه، نه کرش.

   P1  مسیر فایل (بدون db): کاربرِ با فرمتِ کثیفِ تلفن پیدا و login سبز
   P2  ناشناس: send-code همیشه شکلِ یکسان (بدون enumeration)؛ login ⇒ 401
   P3  PG-live: کاربری که *فقط* در PG است (آینه خالی) — send-code کد
       می‌سازد و login موفق ⇒ auth از PG است، نه اسکنِ آینه
   P4  قرارداد «نبود در PG = نبود»: کاربرِ فقط-آینه با PG زنده ⇒
       send-code شکلِ sent می‌دهد ولی کدی ثبت نمی‌شود
   P5  tie-break: دو کاربر با ۱۰ رقمِ آخرِ یکسان ⇒ همان اولینِ به
       ترتیب id (سازگار با find قبلی)؛ متنِ کوئری ORDER BY id LIMIT 1
   P6  pg-mem (regexp_replace ندارد): خطای SQL ⇒ fallback آینه،
       login همچنان سبز (degrade)
   P7  سازگاری عبارتِ ایندکس: همان عبارتِ نرمال‌سازی در migration 010
       و در کوئریِ auth (کلیدِ Index Scan)

   جهش‌کشی (P11_MUTATE): M1..M4 — هرکدام باید تست را قرمز کنند.
   اجرا: node tests/p11-phone-auth.js
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const path = require('path');

const MUT = process.env.P11_MUTATE || '';
if(MUT){
  const target = 'server/auth.js';
  const p = path.join(__dirname, '..', target);
  let src = fs.readFileSync(p, 'utf8');
  const M = {
    /* بازگشت به اسکنِ همیشگیِ آینه (P3 می‌میرد: کاربر فقط-PG گم می‌شود) */
    M1: ["if(db && typeof db.isPostgres === 'function' && db.isPostgres()){", "if(false){"],
    /* نبود در PG ⇒ جستجوی دوباره در آینه (P4 می‌میرد) */
    M2: ["if(r && r.rows && r.rows.length) return r.rows[0];\n        return null;", "if(r && r.rows && r.rows.length) return r.rows[0];"],
    /* حذف degrade (P6 می‌میرد: خطای pg-mem کرش می‌کند) */
    M3: ["}catch(e){\n        console.error('[AUTH] userByPhone: PG lookup failed, falling back to mirror —', e.message);\n      }", "}catch(e){ throw e; }"],
    /* حذف tie-break کوئری (P5-ب می‌میرد) */
    M4: ["ORDER BY id LIMIT 1',", "',"],
  };
  if(!M[MUT]){ console.error('جهش ناشناخته:', MUT); process.exit(2); }
  const [a, b] = M[MUT];
  if(src.split(a).length - 1 !== (MUT === 'M4' ? 1 : 1)){ console.error('الگوی جهش مچ نشد:', MUT); process.exit(2); }
  fs.writeFileSync(p, src.replace(a, b));
  console.log('[mutated]', MUT, '→', target);
}

/* سقف‌های rate-limit بالاتر از تعداد فراخوانی‌های تست — رفتارِ خودِ سقف‌ها
   در otp-ratelimit.js گیت‌شده است؛ اینجا فقط مسیرِ lookup تست می‌شود. */
process.env.PAYESH_SMS_IP_LIMIT = '10000';
process.env.PAYESH_SMS_PHONE_LIMIT = '10000';
process.env.PAYESH_LOGIN_IP_LIMIT = '10000';
process.env.PAYESH_LOGIN_PHONE_LIMIT = '10000';

const { createAuth } = require('../server/auth');

let pass = 0, fail = 0, fails = [];
function chk(name, cond, extra){
  if(cond){ pass++; console.log('  ✅', name); }
  else { fail++; fails.push(name + (extra ? ' — ' + extra : '')); console.log('  ❌', name, extra ? '— ' + extra : ''); }
}
function mkOtp(){
  const data = { cd: {}, codes: {}, login_fail: {} };
  return {
    data,
    save: async () => {},
    reloadIfChanged: async () => {},
    deleteCode: (ph) => { delete data.codes[ph]; },
  };
}
function mkCtx(store, db){
  return {
    store, db,
    JWT_SECRET: 'p11-test-secret-0123456789-0123456789-0123456789',
    SESSION_NAME: 'sid', SESSION_TTL_S: 3600, CODE_TTL_MS: 10 * 60 * 1000,
    DEMO_CODE_ECHO: true,
    audit: () => {},
    isHttps: () => false,
    markDirty: () => {},
    otp: mkOtp(),
  };
}
function mkRes(){
  const res = { headers: {}, statusCode: null, body: null };
  res.writeHead = (code) => { res.statusCode = code; };
  res.setHeader = (k, v) => { res.headers[k.toLowerCase()] = v; };
  res.end = (b) => { res.body = b ? JSON.parse(b) : null; };
  return res;
}
const mkReq = () => ({ socket: { remoteAddress: '127.0.0.1' }, headers: {} });
async function sendCode(auth, phone){
  const res = mkRes();
  await auth.apiSendCode(mkReq(), res, { phone });
  return res;
}
async function login(auth, phone, code, nid){
  const res = mkRes();
  await auth.apiLogin(mkReq(), res, { phone, code, national_id: nid });
  return res;
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/* ── دیتاست مشترک ── */
const users = [
  { id: 3,  role: 'manager', school_id: 1, national_id: '0011111111', active: true,  full_name: 'مدیر', phone: '0912 345 6789' },
  { id: 7,  role: 'parent',  school_id: 1, national_id: '0022222222', active: true,  full_name: 'والد', phone: '09121112222' },
  { id: 9,  role: 'parent',  school_id: 1, national_id: '0033333333', active: true,  full_name: 'والد-دوم', phone: '00 98 912-111-2222' }, /* tie با id=7 */
  { id: 11, role: 'student', school_id: 1, national_id: '0044444444', active: true,  full_name: 'دانش‌آموز', phone: '0935-000-1111' },
];

(async function main(){
  console.log('P1-1 phone-auth — unit (file-mode / fake-PG / pg-mem)\n');

  /* ══ P1: مسیر فایل (db = null) ══ */
  {
    const auth = createAuth(mkCtx({ users: JSON.parse(JSON.stringify(users)) }, null));
    const s = await sendCode(auth, '09123456789');       /* فرمت تمیز — کاربر با فرمت کثیف '0912 345 6789' */
    chk('P1a send-code: 200 sent (فرمت کثیفِ آینه نرمال شد)', s.statusCode === 200 && s.body.ok === true && s.body.code === 'sent');
    chk('P1b send-code: کد برای کاربرِ موجود ساخته شد (demo echo)', typeof s.body.demo_code === 'string' && s.body.demo_code.length === 6);
    const l = await login(auth, '0912 345 6789', s.body.demo_code, '0011111111');
    chk('P1c login: 200 و شناسهٔ درست', l.statusCode === 200 && l.body.ok === true && l.body.user && l.body.user.id === 3,
        JSON.stringify(l.body).slice(0, 80));
  }

  /* ══ P2: ناشناس — بدون enumeration ══ */
  {
    const auth = createAuth(mkCtx({ users: JSON.parse(JSON.stringify(users)) }, null));
    const s = await sendCode(auth, '09990000000');
    chk('P2a ناشناس: همان شکلِ sent (نه 404)', s.statusCode === 200 && s.body.ok === true && s.body.code === 'sent');
    chk('P2b ناشناس: بدون demo_code (کدی ثبت نشد)', s.body.demo_code === undefined);
    const l = await login(auth, '09990000000', '123456', '0011111111');
    chk('P2c ناشناس: login ⇒ 401 bad_code', l.statusCode === 401 && l.body.code === 'bad_code');
  }

  /* ══ P3: PG-live — کاربرِ فقط-PG (آینهٔ خالی) ══ */
  {
    const pgOnly = { id: 77, role: 'manager', school_id: 1, national_id: '0055555555', active: true, full_name: 'دور از آینه', phone: '09155550000' };
    const db = {
      isPostgres: () => true,
      query: async (text, params) => {
        if(String(text).indexOf('FROM users') !== -1 && params[0] === '9155550000') return { rows: [pgOnly] };
        return { rows: [] };
      },
    };
    const auth = createAuth(mkCtx({ users: [] }, db));   /* آینهٔ خالی! */
    const s = await sendCode(auth, '0915-555-0000');     /* فرمت کثیف — نرمال‌سازی در auth */
    chk('P3a فقط-PG: send-code کد ساخت (کاربر از PG آمد، نه آینه)', s.statusCode === 200 && typeof s.body.demo_code === 'string');
    const l = await login(auth, '09155550000', s.body.demo_code, '0055555555');
    chk('P3b فقط-PG: login موفق — auth از PG است نه اسکنِ آینه',
        l.statusCode === 200 && l.body.ok === true && l.body.user.id === 77,
        JSON.stringify(l.body).slice(0, 80));
  }

  /* ══ P4: قرارداد «نبود در PG = نبود» ══ */
  {
    const db = { isPostgres: () => true, query: async () => ({ rows: [] }) };  /* PG زنده ولی کاربر را ندارد */
    const auth = createAuth(mkCtx({ users: JSON.parse(JSON.stringify(users)) }, db));
    const s = await sendCode(auth, '09123456789');
    chk('P4a فقط-آینه + PG زنده: شکلِ sent (بدون leakage)', s.statusCode === 200 && s.body.code === 'sent');
    chk('P4b فقط-آینه + PG زنده: کدی ساخته نشد (PG مرجع است)', s.body.demo_code === undefined);
  }

  /* ══ P5: tie-break ══ */
  {
    const auth = createAuth(mkCtx({ users: JSON.parse(JSON.stringify(users)) }, null));
    const s = await sendCode(auth, '0912-111-2222');   /* فرمت کثیف — کلیدِ کد = رشتهٔ نرمال */
    chk('P5a tie: کد ساخته شد', typeof s.body.demo_code === 'string');
    const l = await login(auth, '09121112222', s.body.demo_code, '0022222222');
    chk('P5b tie: اولین به ترتیب id برنده (id=7 نه id=9 — سازگار با find)',
        l.statusCode === 200 && l.body.user && l.body.user.id === 7,
        JSON.stringify(l.body.user || l.body).slice(0, 80));
    const src = fs.readFileSync(path.join(__dirname, '..', 'server/auth.js'), 'utf8');
    /* عبارت باید در خودِ کوئری SQL باشد — نه صرفاً در کامنت‌ها (درسِ جهش M4) */
    chk('P5c کوئریِ PG همان tie-break را دارد (ORDER BY id LIMIT 1)', src.indexOf(String.fromCharCode(39) + 'ORDER BY id LIMIT 1' + String.fromCharCode(39)) !== -1);
  }

  /* ══ P6: pg-mem واقعی — خطای SQL ⇒ degrade به آینه ══ */
  {
    let pgmem = null;
    try { pgmem = require('pg-mem'); } catch(e) { pgmem = null; }
    if(!pgmem){ console.log('  ⏭ P6 self-skip: pg-mem نصب نیست'); }
    else {
      const mem = pgmem.newDb();
      mem.public.none('CREATE TABLE users (id INTEGER PRIMARY KEY, phone VARCHAR(20))');
      mem.public.none("INSERT INTO users (id, phone) VALUES (3, '0912 345 6789')");
      const pg = mem.adapters.createPg();          /* { Pool, Client } */
      const pool = new pg.Pool();
      const db = { isPostgres: () => true, query: async (t, p) => pool.query(t, p) };
      const auth = createAuth(mkCtx({ users: JSON.parse(JSON.stringify(users)) }, db));
      const s = await sendCode(auth, '09123456789');
      chk('P6a pg-mem بدونِ regexp_replace: کرش نکرد (degrade)', s.statusCode === 200);
      chk('P6b pg-mem: fallback به آینه — کاربرِ آینه‌ای پیدا شد', typeof s.body.demo_code === 'string');
    }
  }

  /* ══ P7: سازگاری عبارتِ ایندکس با کوئریِ auth ══ */
  {
    const mig = fs.readFileSync(path.join(__dirname, '..', 'migrations/010_users_phone_auth.sql'), 'utf8');
    const src = fs.readFileSync(path.join(__dirname, '..', 'server/auth.js'), 'utf8');
    chk('P7a migration عبارتِ نرمال‌سازیِ همین کد را ایندکس می‌کند',
        mig.indexOf("right(regexp_replace(phone, '[\\s\\-()]', '', 'g'), 10)") !== -1 &&
        src.indexOf("right(regexp_replace(phone, $2, \\'\\', \\'g\\'), 10)") !== -1);
    const d = fs.readFileSync(path.join(__dirname, '..', 'migrations/010_users_phone_auth.down.sql'), 'utf8');
    chk('P7b down مهاجرت ایندکس را برمی‌دارد', d.indexOf('DROP INDEX IF EXISTS idx_users_phone_auth') !== -1);
  }

  console.log('\n────────────────────────────────────────────');
  if(fail){ console.log(' موارد ناموفق:'); fails.forEach(f => console.log('  - ' + f)); }
  console.log(`P1-1 phone-auth: ${pass} سبز / ${fail} قرمز ${fail ? '❌' : '— بدون خطا ✅'}`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
