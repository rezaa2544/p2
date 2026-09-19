#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   p11-phone-auth-live.js — گیتِ زندهٔ P1-1 روی PostgreSQL واقعی
   ─────────────────────────────────────────────────────────────────
   L1  زنجیرهٔ مهاجرت‌های ۰۰۱..۰۱۰ روی DB خالی، بدونِ خطا
   L2  ایندکسِ idx_users_phone_auth پس از ۰۱۰ در کاتالوگ موجود است
   L3  کوئریِ عینِ auth (userByPhone): فرمتِ کثیف/نرمال + tie ⇒
       همان کاربری که tie-break آینه برمی‌گرداند (کوچک‌ترین id)
   L4  EXPLAIN: Index Scan با idx_users_phone_auth (نه Seq Scan)
   L5  رفت/برگشت: down 010 ⇒ ایندکس حذف؛ re-apply ⇒ برگشت (روی DB
       دارایِ داده)
   L6  auth عملکردی روی PG زنده: کاربری که *فقط* در PG است (آینهٔ
       خالی) — send-code کد می‌سازد و login موفق ⇒ auth از PG است
   L7  کاربرِ ناموجود در PG ⇒ send-code شکلِ یکسان، بدونِ کد

   بدونِ P11_LIVE_PG (connection string) یا ماژولِ pg: self-skip.
   اجرا:
     P11_LIVE_PG='postgres://p11:p11@127.0.0.1:5432/payesh_p11' \
       node tests/p11-phone-auth-live.js
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const PGURL = process.env.P11_LIVE_PG || '';
let pg = null;
try { pg = require('pg'); } catch(e) { pg = null; }

if(!PGURL || !pg){
  console.log('⏭ p11-phone-auth-live: self-skip — P11_LIVE_PG یا ماژول pg نیست');
  process.exit(1);
}

let pass = 0, fail = 0, fails = [];
function chk(name, cond, extra){
  if(cond){ pass++; console.log('  ✅', name); }
  else { fail++; fails.push(name + (extra ? ' — ' + extra : '')); console.log('  ❌', name, extra ? '— ' + extra : ''); }
}

(async function main(){
  console.log('P1-1 phone-auth — live PostgreSQL\n');
  const pool = new pg.Pool({ connectionString: PGURL, max: 4 });

  /* ══ L1: زنجیرهٔ ۰۰۱..۰۱۰ ══ */
  const migDir = path.join(__dirname, '..', 'migrations');
  const migs = fs.readdirSync(migDir).filter(f => /^\d+_.+\.sql$/.test(f) && !/\.down\.sql$/.test(f)).sort();
  let chainOk = true, lastErr = '';
  for(const m of migs){
    try {
      const sql = fs.readFileSync(path.join(migDir, m), 'utf8');
      /* ری‌تارگت (مرج #82): مهاجرتِ 012 متاکامندِ psql دارد (\gset) و از
         pool.query عبور نمی‌کند — قراردادِ خودِ مهاجرت اجرایِ psql است. */
      if (/^[^\n]*\\gset\s*$/m.test(sql) || /^\\[a-z]/m.test(sql)) {
        require('child_process').execFileSync('psql',
          ['-v', 'ON_ERROR_STOP=1', '--quiet', '-f', path.join(migDir, m), PGURL], { stdio: 'pipe' });
      } else {
        await pool.query(sql);
      }
    }
    catch(e){ chainOk = false; lastErr = m + ': ' + String(e.stderr || e.message).slice(0, 140); break; }
  }
  chk('L1 زنجیرهٔ ' + migs.length + ' مهاجرت روی DB خالی سبز (تا 010)', chainOk && migs.some(m => m.startsWith('010_')), lastErr);

  /* ══ L2: ایندکس در کاتالوگ ══ */
  const idx = (await pool.query("SELECT indexname FROM pg_indexes WHERE indexname = 'idx_users_phone_auth'")).rows;
  chk('L2 idx_users_phone_auth در کاتالوگ موجود است', idx.length === 1);

  /* ══ L3: seed + کوئریِ عینِ auth ══ */
  await pool.query(`INSERT INTO schools (id, version, active, created_at, updated_at)
    VALUES (1, 1, true, now(), now()) ON CONFLICT (id) DO NOTHING`);   /* fk_users_school */
  await pool.query('DELETE FROM users WHERE id >= 9000');
  await pool.query(`INSERT INTO users (id, school_id, role, full_name, phone, national_id, active, created_at, updated_at) VALUES
    (9001, 1, 'manager', 'فرمت کثیف', '0912 345 6789', '0011111111', true, now(), now()),
    (9002, 1, 'parent',  'tie-a',     '09121112222',   '0022222222', true, now(), now()),
    (9003, 1, 'parent',  'tie-b',     '00 98 912-111-2222', '0033333333', true, now(), now()),
    (9004, 1, 'student', 'نرمال',     '09350000111',   '0044444444', true, now(), now())`);
  const AUTH_SQL = 'SELECT id, role, school_id, national_id, active, full_name, phone ' +
    'FROM users WHERE right(regexp_replace(phone, $2, \'\', \'g\'), 10) = $1 ORDER BY id LIMIT 1';
  const AUTH_ARGS = (tail) => [tail, '[\\s\\-()]'];
  const dirty = (await pool.query(AUTH_SQL, AUTH_ARGS('9123456789'))).rows;
  chk('L3a فرمت کثیف (فاصله/خط تیره) پیدا شد', dirty.length === 1 && dirty[0].id === 9001);
  const tie = (await pool.query(AUTH_SQL, AUTH_ARGS('9121112222'))).rows;
  chk('L3b tie: کوچک‌ترین id برنده (سازگار با find آینه)', tie.length === 1 && tie[0].id === 9002, JSON.stringify(tie.map(r => r.id)));

  /* ══ L4: EXPLAIN — Index Scan نه Seq Scan ══ */
  const plan = (await pool.query('EXPLAIN ' + AUTH_SQL, AUTH_ARGS('9121112222'))).rows.map(r => Object.values(r)[0]).join('\n');
  chk('L4a EXPLAIN: Index Scan با idx_users_phone_auth', plan.indexOf('Index Scan') !== -1 && plan.indexOf('idx_users_phone_auth') !== -1, plan.split('\n')[0]);
  chk('L4b EXPLAIN: بدون Seq Scan روی users', plan.indexOf('Seq Scan on users') === -1, plan.split('\n')[0]);

  /* ══ L5: رفت/برگشت ══ */
  await pool.query(fs.readFileSync(path.join(migDir, '010_users_phone_auth.down.sql'), 'utf8'));
  const gone = (await pool.query("SELECT indexname FROM pg_indexes WHERE indexname = 'idx_users_phone_auth'")).rows;
  chk('L5a down 010: ایندکس حذف شد (روی DB دارایِ داده)', gone.length === 0);
  await pool.query(fs.readFileSync(path.join(migDir, '010_users_phone_auth.sql'), 'utf8'));
  const back = (await pool.query("SELECT indexname FROM pg_indexes WHERE indexname = 'idx_users_phone_auth'")).rows;
  const stillThere = (await pool.query(AUTH_SQL, AUTH_ARGS('9123456789'))).rows;
  chk('L5b re-apply 010: ایندکس برگشت و داده سالم ماند', back.length === 1 && stillThere.length === 1 && stillThere[0].id === 9001);

  /* ══ L6: auth عملکردی — کاربرِ فقط-PG، آینهٔ خالی ══ */
  process.env.PAYESH_SMS_IP_LIMIT = '10000';
  process.env.PAYESH_SMS_PHONE_LIMIT = '10000';
  process.env.PAYESH_LOGIN_IP_LIMIT = '10000';
  process.env.PAYESH_LOGIN_PHONE_LIMIT = '10000';
  const { createAuth } = require('../server/auth');
  const db = {
    isPostgres: () => true,
    query: async (t, p) => pool.query(t, p),
    readOne: async (name, id) => {
      const r = await pool.query('SELECT * FROM "' + String(name).replace(/"/g, '') + '" WHERE id = $1 LIMIT 1', [Number(id)]);
      return (r && r.rows && r.rows[0]) || null;
    },
  };
  const otp = { data: { cd: {}, codes: {}, login_fail: {} }, save: async () => {}, reloadIfChanged: async () => {}, deleteCode: (ph) => { delete otp.data.codes[ph]; } };
  const auth = createAuth({
    /* آینهٔ خالی — کاربر فقط در PG است؛ __revoked_jti همان‌طور که سرور واقعی
       می‌سازد اینجا هم هست (jwtVerify به آن نیاز دارد) */
    store: { users: [], __revoked_jti: {} }, db,
    JWT_SECRET: 'p11-live-secret-0123456789-0123456789-0123456789',
    SESSION_NAME: 'sid', SESSION_TTL_S: 3600, CODE_TTL_MS: 600000,
    DEMO_CODE_ECHO: true, audit: () => {}, isHttps: () => false, markDirty: () => {}, otp,
  });
  const mkRes = () => { const r = { headers: {} }; r.writeHead = c => { r.statusCode = c; }; r.setHeader = (k, v) => { r.headers[String(k).toLowerCase()] = v; }; r.end = b => { r.body = b ? JSON.parse(b) : null; }; return r; };
  const req = { socket: { remoteAddress: '127.0.0.9' }, headers: {} };
  const s = mkRes();
  await auth.apiSendCode(req, s, { phone: '0912-345-6789' });
  chk('L6a فقط-PG (آینهٔ خالی): send-code کد ساخت', s.statusCode === 200 && typeof s.body.demo_code === 'string', JSON.stringify(s.body));
  const l = mkRes();
  await auth.apiLogin({ socket: { remoteAddress: '127.0.0.9' }, headers: {} }, l, { phone: '09123456789', code: s.body.demo_code, national_id: '0011111111' });
  chk('L6b فقط-PG: login موفق — auth از PG است نه اسکنِ آینه',
      l.statusCode === 200 && l.body.ok === true && l.body.user && l.body.user.id === 9001,
      JSON.stringify(l.body).slice(0, 90));

  /* ══ L7: ناشناس در PG ══ */
  const s2 = mkRes();
  await auth.apiSendCode({ socket: { remoteAddress: '127.0.0.9' }, headers: {} }, s2, { phone: '09990000000' });
  chk('L7 ناشناس: شکلِ sent بدون کد (بدون enumeration)', s2.statusCode === 200 && s2.body.ok === true && s2.body.demo_code === undefined, JSON.stringify(s2.body));

  /* ══ L8 — باگ بازبین: نشستِ کاربرِ فقط-PG باید در درخواست بعدی هم حل شود ══ */
  const reqWithCookie = (cookie) => ({ socket: { remoteAddress: '127.0.0.9' }, headers: { cookie } });
  const cookie1 = String(l.headers['set-cookie'] || '').split(';')[0];   /* از L6b */
  const sess = await auth.sessionFrom(reqWithCookie(cookie1));
  chk('L8a sessionFrom کاربرِ فقط-PG (آینهٔ خالی) از PG حل شد',
      sess && sess.id === 9001 && sess.role === 'manager', JSON.stringify(sess && sess.id));
  const me = mkRes();
  await auth.apiMe(reqWithCookie(cookie1), me);
  chk('L8b /api/auth/me برای کاربرِ فقط-PG: 200 و هویت درست',
      me.statusCode === 200 && me.body.ok === true && me.body.user && me.body.user.id === 9001,
      JSON.stringify(me.body).slice(0, 90));
  /* نشستِ کاربرِ ناموجود در PG: مرد (fail-closed) */
  const tokGone8 = auth.jwtSign({ sub: 999999, role: 'manager', school_id: 1, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 600, jti: 'jt_l8c', sv: 0 });
  const resGone8 = mkRes();
  await auth.apiMe(reqWithCookie('sid=' + tokGone8), resGone8);
  chk('L8c نشستِ کاربرِ حذف‌شده از PG مرد (fail-closed)', resGone8.statusCode === 401);

  await pool.end();
  console.log('\n────────────────────────────────────────────');
  if(fail){ console.log(' موارد ناموفق:'); fails.forEach(f => console.log('  - ' + f)); }
  console.log(`P1-1 phone-auth live: ${pass} سبز / ${fail} قرمز ${fail ? '❌' : '— بدون خطا ✅'}`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
