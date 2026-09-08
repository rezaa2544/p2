#!/usr/bin/env node
/* ─────────────────────────────────────────────────────────────
   server11-mutations.js — جهش‌مندیِ «درگاهِ پیامک» (tests/server11-sms.js)
   شش جهشِ سمتِ سرور؛ هر کدام باید تستِ مربوطه را بکشد:
     M1 حذفِ کسرِ کیف (wallet)          → S2
     M2 ایدمپوتانسِ کلِ وقت «دوباره»     → S2/S3
     M3 نقشِ همه‌گیر (حذفِ گارد)          → S6
     M4 گاردِ «بدونِ in-configure» حذف   → S1
     M5 سقفِ روزانه حذف                  → S5
     M6 نوشتنِ log موفقِ حذف (dup همیشگی) → S2
   ───────────────────────────────────────────────────────────── */
'use strict';
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SUITE = path.join(ROOT, 'tests', 'server11-sms.js');

const MUTS = [
  {
    file: 'server/sms.js',
    bad: 'w.balance = Number(w.balance || 0) - cost;',
    mut: 'w.balance = Number(w.balance || 0);',
    name: 'M1 حذفِ کسرِ کیف (wallet)', expect: 'S2'
  },
  {
    file: 'server/sms.js',
    bad: 'const dup = store.sms_log.some(l => l.status === \'sent\' && l.queue_id === qid && l.user_id === r.parent.id);',
    mut: 'const dup = true;',
    name: 'M2 ایدمپوتانسِ کلِ وقت «دوباره»', expect: 'S2/S3'
  },
  {
    file: 'server/sms.js',
    bad: "if(s.role !== 'superadmin') return sendJson(res, 403, { ok: false, code: 'forbidden' });",
    mut: 'if(false) return sendJson(res, 403, { ok: false, code: \'forbidden\' });',
    name: 'M3 نقشِ همه‌گیر (حذفِ گارد)', expect: 'S6'
  },
  {
    file: 'server/sms.js',
    bad: "if(!configured) return sendJson(res, 503, { ok: false, code: 'sms_not_configured' });",
    mut: 'if(false) return sendJson(res, 503, { ok: false, code: \'sms_not_configured\' });',
    name: 'M4 گاردِ «بدونِ in-configure» حذف', expect: 'S1'
  },
  {
    file: 'server/sms.js',
    bad: 'if(usedToday(it.q.school_id) + bySchool[it.q.school_id] > MAX_PER_DAY){',
    mut: 'if(false){',
    name: 'M5 سقفِ روزانه حذف', expect: 'S5'
  },
  {
    file: 'server/sms.js',
    bad: 'if(failCode){',
    mut: 'if(false){',
    name: 'M6 «همه یا هیچ» حذف (شکست نادیده)', expect: 'S4'
  }
];

function runSuite(){
  const r = spawnSync('node', ['--max-old-space-size=1500', SUITE], { encoding: 'utf8', cwd: ROOT });
  return { code: r.status, out: (r.stdout || '') + (r.stderr || '') };
}

/* مرگِ محیطی: خروجیِ خالی/کرش = حافظه — هرگز «کشته شد»ِ کاذب (R93) */
const crashed = (x) => x.out.trim() === '' || /JavaScript heap out of memory|FATAL|aborting/.test(x.out);
/* سبزِ پیش از جهش */
let base = runSuite();
if(crashed(base)){ const b2 = runSuite(); if(!crashed(b2)) base = b2; }
if(crashed(base)){ console.error('پایه: خطای محیطی — فرآیند بدون خروجی/با کرش (حافظه) — تست اجرا نشد'); process.exit(2); }
if(base.code !== 0){ console.error('پایه سبز نیست:\n' + base.out.split('\n').slice(-6).join('\n')); process.exit(2); }
console.log('پایه: ' + (base.out.match(/(\d+) بررسی/) || [])[1] + ' بررسی سبز');

let ok = 0;
for(const m of MUTS){
  const fp = path.join(ROOT, m.file);
  const orig = fs.readFileSync(fp, 'utf8');
  const n = orig.split(m.bad).length - 1;
  if(n !== 1){ console.log('  FAIL ' + m.name + ' :: anchor count ' + n); process.exit(1); }
  fs.writeFileSync(fp, orig.replace(m.bad, m.mut), 'utf8');
  let r = runSuite();
  if(crashed(r)){ const r2 = runSuite(); if(!crashed(r2)) r = r2; }
  fs.writeFileSync(fp, orig, 'utf8');
  if(crashed(r)){ console.log('  FAIL ' + m.name + ' — خطای محیطی: فرآیند بدون خروجی/با کرش (حافظه) — نه کشته و نه زنده شمرده شد'); process.exit(1); }
  const killed = r.code !== 0;
  if(killed){ ok++; console.log('  PASS ' + m.name + ' — کشته شد (' + m.expect + ')'); }
  else { console.log('  FAIL ' + m.name + ' — زنده ماند!'); process.exit(1); }
}
const after = runSuite();
if(after.code !== 0){ console.log('  FAIL بازگشت: پس از restore سبز نیست'); process.exit(1); }
console.log('\n' + ok + '/' + MUTS.length + ' جهش — ✅ همه کشته شدند');
