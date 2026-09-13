#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   Wave 19 — تست‌هایِ تستِ آشوب و شکست (ابزار + طرح + سازگاری با قوانین)
   پوشش:
     C1  tools/chaos-test.sh وجود دارد + bash -n سالم
     C2  --help: exit 0 + نامِ هر 5 سناریو + DRY_RUN/--live + مسیرِ خروجی
     C3  DRY_RUNِ هر 5 سناریو: exit 0 + 4 فایلِ خروجی (before/after/timeline/summary)
     C4  docs/WAVE19_CHAOS_PLAN.md: 5 سناریویِ الزامی + ابزار + ک6 + pending
     C5  سازگاریِ فرضیه‌ها با قوانینِ پروژه (atomik store، fail-open،
         503ِ readiness، صفر data loss، crash-free disk-full)
     C6  tests/chaos-output/ در .gitignore
     C7  سوئیتِ k6ِ فاز ۵ (chaos-redis-test.js) سالم + اتصالِ سند
     C8  خروجیِ ماشین‌خوان سالم (JSON معتبر) + گاردِ مسیرِ live
         (break فقط DRY_RUN · probe همزمان با خرابی · دُمِ بازیابی · 000ERR)
   اجرا: node tests/wave19-chaos.js
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const SH = path.join(ROOT, 'tools', 'chaos-test.sh');
const DOC = path.join(ROOT, 'docs', 'WAVE19_CHAOS_PLAN.md');
const K6 = path.join(ROOT, 'tests', 'performance', 'suites', 'chaos-redis-test.js');
const SCEN = ['kill-api', 'redis-down', 'pg-down', 'net-latency', 'disk-full'];

let pass = 0, fail = 0;
function chk(name, cond, detail){
  if(cond){ pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ ' + name + (detail ? ' — ' + detail : '')); }
}
const read = (p) => fs.readFileSync(p, 'utf8');
const sh = (args) => spawnSync('bash', [SH, ...args], { cwd: ROOT, encoding: 'utf8' });

/* ── C1: اسکریپت ─────────────────────────────────────────────────── */
{
  chk('C1a tools/chaos-test.sh وجود دارد', fs.existsSync(SH));
  const s = fs.existsSync(SH) ? read(SH) : '';
  chk('C1b shebangِ bash', s.startsWith('#!/usr/bin/env bash'));
  const syn = spawnSync('bash', ['-n', SH], { encoding: 'utf8' });
  chk('C1c bash -n بدونِ خطایِ syntax', syn.status === 0, (syn.stderr || '').slice(0, 200));
}

/* ── C2: --help ──────────────────────────────────────────────────── */
{
  const h = sh(['--help']);
  chk('C2a --help exit 0', h.status === 0, 'status=' + h.status);
  chk('C2b 5 سناریویِ الزامی در help', SCEN.every(x => h.stdout.indexOf(x) > -1));
  chk('C2c مدلِ ایمنی (DRY_RUN پیش‌فرض + --live)', h.stdout.indexOf('DRY_RUN') > -1 && h.stdout.indexOf('--live') > -1);
  chk('C2d مسیرِ خروجیِ chaos-output', h.stdout.indexOf('chaos-output') > -1);
}

/* ── C3: DRY_RUN هر 5 سناریو ─────────────────────────────────────── */
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'payesh-w19-'));
{
  const all = sh(['all', '--out-dir', TMP]);
  chk('C3a DRY_RUN all exit 0', all.status === 0, (all.stderr || '').slice(0, 300));
  const missing = [];
  for(const sc of SCEN){
    for(const f of [sc + '-before.json', sc + '-after.json', sc + '-timeline.csv', sc + '-summary.txt']){
      if(!fs.existsSync(path.join(TMP, f))) missing.push(f);
    }
  }
  chk('C3b 4 فایل برایِ هر 5 سناریو (20 فایل)', missing.length === 0, missing.slice(0, 4).join(','));
  const before = fs.existsSync(path.join(TMP, 'redis-down-before.json')) ? read(path.join(TMP, 'redis-down-before.json')) : '';
  chk('C3c snapshot ساختارِ JSON دارد (3 endpoint)', /"scenario"\s*:\s*"redis-down"/.test(before)
    && before.indexOf('/api/liveness') > -1 && before.indexOf('/api/readiness') > -1 && before.indexOf('/api/health') > -1);
  const tl = fs.existsSync(path.join(TMP, 'disk-full-timeline.csv')) ? read(path.join(TMP, 'disk-full-timeline.csv')) : '';
  chk('C3d timeline سربرگِ صحیح دارد', tl.startsWith('ts,endpoint,status,ms'));
  /* اجرایِ تک‌سناریویی هم سالم */
  const one = sh(['kill-api', '--out-dir', path.join(TMP, 'single')]);
  chk('C3e DRY_RUN تک‌سناریو exit 0', one.status === 0);
}

/* ── C8: سلامتِ خروجی و گاردِ مسیرِ live (درس‌های مانورِ 2026-09-13) ── */
{
  const src = fs.existsSync(SH) ? read(SH) : '';
  /* C8a — هر ۱۰ فایلِ JSONِ تولیدشده باید واقعاً JSON معتبر باشد.
     شاهدِ قرمزِ مانورِ 2026-09-13: snapshotها کامای انتهایی داشتند و
     JSON.parse می‌شکست — خروجیِ «ماشین‌خوان» ابزار قابلِ مصرف نبود. */
  const bad = [];
  for(const sc of SCEN){
    for(const ph of ['before', 'after']){
      const p = path.join(TMP, sc + '-' + ph + '.json');
      if(!fs.existsSync(p)) continue;
      try { JSON.parse(read(p)); } catch(e){ bad.push(sc + '-' + ph + ': ' + e.message.slice(0, 60)); }
    }
  }
  chk('C8a snapshotها JSONِ معتبرند (بدون کامای انتهایی)', bad.length === 0, bad.slice(0, 2).join(' | '));
  /* C8b–C8f — گاردِ semanticsِ مسیرِ live روی خودِ اسکریپت:
     باگِ اصلیِ آن روز: break غیرشرطی در probe_loop ⇒ timeline فقط پیش از
     تزریق خرابی می‌چرخید و پنجرهٔ خرابی هرگز ثبت نمی‌شد. */
  chk('C8b break فقط در شاخهٔ DRY_RUN (نه LIVE)',
    /else\s*\n\s*break # DRY_RUN/.test(src));
  chk('C8c در LIVE حلقهٔ probe همزمان با تزریقِ خرابی می‌چرخد (پس‌زمینه)',
    /probe_loop "\$name" & probe_bg=\$!/.test(src));
  chk('C8d پیش از snapshotِ after، دُمِ probeها منتظر می‌ماند',
    /\[ -n "\$probe_bg" \] && wait "\$probe_bg"/.test(src));
  chk('C8e پنجرهٔ probe دُمِ بازیابی دارد (DURATION + ۲ بازه)',
    /DURATION \+ PROBE_INTERVAL \* 2/.test(src));
  chk('C8f چکِ kill-api فرمتِ واقعیِ خطا (000ERR) را می‌گیرد',
    src.includes("grep -qE ',(503|[0-9]*ERR)'"));
}

/* ── C4: سندِ طرح ────────────────────────────────────────────────── */
{
  chk('C4a docs/WAVE19_CHAOS_PLAN.md وجود دارد', fs.existsSync(DOC));
  const d = fs.existsSync(DOC) ? read(DOC) : '';
  chk('C4b 5 سناریویِ الزامی در سند',
    /کشتنِ یک نمونهٔ API/.test(d) && /قطعِ Redis/.test(d) && /قطعِ PostgreSQL/.test(d) && /کندی شبکه/.test(d) && /پر شدنِ دیسک/.test(d));
  chk('C4c ارجاع به chaos-test.sh و chaos-redis-test.js (فاز ۵)',
    /chaos-test\.sh/.test(d) && /chaos-redis-test\.js/.test(d));
  chk('C4d وضعیتِ pending (زیرساختِ زنده) ثبت شده', /در انتظار/.test(d) && /ساندباکس/.test(d));
  chk('C4e معیارهایِ پذیرش (جدول) وجود دارد', /معیارهایِ پذیرش/.test(d));
}

/* ── C5: سازگاریِ فرضیه‌ها با قوانینِ پروژه ─────────────────────── */
{
  const d = fs.existsSync(DOC) ? read(DOC) : '';
  chk('C5a atomik store: «هرگز خراب نمی‌شود» (tmp+rename) مستند است', /tmp\+rename/.test(d) && /خراب نمی‌شود/.test(d));
  chk('C5b پنجرهٔ flush (2s) + mirror پیش از ack (صفر loss با PG) مستند است', /persistStore هر 2s|هر 2s/.test(d) && /پیش از پاسخ/.test(d));
  chk('C5c rate-limit fail-open (افتِ Redis ≠ خود-DDoS) مستند است', /fail-open/.test(d));
  chk('C5d قراردادِ 503ِ readiness (Wave 15) مستند است', /readiness ⇒ \*\*503\*\*/.test(d) || /readiness 503/.test(d));
  chk('C5e صفر data loss برایِ Redis/PG صریح است', (d.match(/از دست رفتنِ داده = صفر/g) || []).length >= 2);
  chk('C5f disk-full: crash-free (try/catchِ persistStore) + سقفِ ایمنی مستند است', /never crash|کرش نمی‌کند/.test(d) && /سقفِ ایمنی/.test(d));
  chk('C5g محدودیتِ شناخته‌شدهٔ reconnect (restart پس از قطعِ طولانی) صادقانه ثبت شده', /restart فرایند لازم است/.test(d));
}

/* ── C6: gitignore ───────────────────────────────────────────────── */
{
  const g = read(path.join(ROOT, '.gitignore'));
  chk('C6 tests/chaos-output/ در .gitignore', g.indexOf('tests/chaos-output/') > -1);
}

/* ── C7: سوئیتِ k6ِ فاز ۵ ───────────────────────────────────────── */
{
  chk('C7a chaos-redis-test.js (فاز ۵) وجود دارد', fs.existsSync(K6));
  const k = fs.existsSync(K6) ? read(K6) : '';
  chk('C7b thresholds: بدونِ 500 + p95<400 + صحتِ نشست',
    /no 500 internal server error/.test(k) && /p\(95\)<400/.test(k) && /jwt verified/.test(k));
  chk('C7c متریک‌هایِ آشوب (circuit-breaker/latency) تعریف شده', /circuitBreakerTrips/.test(k) && /redisLatency/.test(k));
}

try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {}
console.log('────────────────────────────────────────────');
console.log('Wave 19 — Chaos: ' + pass + '/' + (pass + fail) + ' موفق' + (fail ? ' — ' + fail + ' خطا ❌' : '  —  بدون خطا ✅'));
process.exit(fail ? 1 : 0);
