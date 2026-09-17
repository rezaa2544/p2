#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   tools/branch-preflight.js — پیش‌پروازِ انضباطِ شاخه‌های انتشار (چت ۶ — C6-06)
   ───────────────────────────────────────────────────────────────────
   مرجع: شیفت ۲، تختهٔ `docs/daily-mission-boards/2026-09-17/Chat6.md`
   ردیف ۶: «Release branch discipline | stale/shared branch preflight»

   این ابزار «فقط‌خواندنی» است: هیچ شاخه‌ای را حذف/بازنویسی نمی‌کند؛
   حذفِ شاخه‌های کهنه تصمیمِ مالک است، نه خروجیِ این ابزار.

   دو کاربرگ:

   ۱) --fleet [--json] — سرشماریِ شاخه‌ها (منبع: refs/remotes/origin/*
      اگر موجود باشد، وگرنه refs/heads/* — در خروجی ثبت می‌شود):
        • MERGED-STALE : نوکِ شاخه نیا/برابرِ مرجِ اصلی است ⇒ محتوایی
          برای تحویل ندارد؛ نامزدِ حذف (مشورتی).
        • LIVE         : کامیتِ تحویل‌نشده دارد.
        • AGED         : سنِّ کامیت‌دهنده بیش از آستانه (پیش‌فرض ۱۴ روز).
        • خوشه‌های «نوکِ مشترک»: چند نامِ شاخه روی یک کامیت ⇒ نشانهٔ
          شاخهٔ اشتراکی/تکراری (کلاسِ «shared» با شواهدِ گیت، نه حدس).
      خروجی همیشه ۰ است (سرشماری مشورتی) مگر خطای اجرا.

   ۲) --branch <name> [--json] — پیش‌پروازِ سخت‌گیرانهٔ شاخهٔ نامزدِ
      انتشار (هر ردیفِ «سخت» قرمز ⇒ خروجی ۱):
        BP-1 مرجع شاخه حل می‌شود
        BP-2 نوکِ شاخه نیا/برابرِ مرجِ اصلی نیست (چیزی برای تحویل هست)
        BP-3 diff مرجِ اصلی…شاخه ناتهی است
        BP-4 (مشورتی) شاخه بیش از آستانه عقب‌تر از مرجِ اصلی نباشد
        BP-5 (مشورتی) سنِّ نوکِ شاخه گزارش می‌شود
        BP-6 (مشورتی) نوکِ شاخه با نام‌های دیگر مشترک نباشد

   گزینه‌ها:
     --main <ref>      مرجِ اصلی (پیش‌فرض: origin/main، وارون به main)
     --stale-days <n>  آستانهٔ سن (پیش‌فرض ۱۴)
     --behind-warn <n> آستانهٔ عقب‌بودگی برای BP-4 (پیش‌فرض ۲۵)
     --fetch           قبل از سرشماری `git fetch origin --prune` (شبکه)
     --json            خروجی ماشین‌خوان
     --selftest        خودآزماییِ هرمتیک (مخزنِ اسباب‌بازی در tmpdir؛ شبکه نمی‌خواهد)

   قراردادِ سبزی: خروجیِ غیرصفر فقط برای شکستِ واقعی (پیش‌پروازِ قرمز،
   خطای گیت/محیط، یا شکستِ خودآزمایی). سرشماریِ شاخهٔ کهنه به‌تنهایی
   قرمز نمی‌کند — گزارش است، نه گیتِ مسدودساز.

   محدودهٔ اجرا: ابزار روی مخزنِ «فهرستِ کاریِ فراخوانی» (cwd) کار
   می‌کند — مانندِ خودِ گیت؛ پس خودآزمایی می‌تواند آن را روی مخزنِ
   اسباب‌بازیِ ایزوله فراخوانی کند.

   محدودیتِ صادقانه: در کلونِ کم‌عمق (`.git/shallow` موجود) بررسیِ
   نیایی با گرافت محدود است؛ ابزار این را در `notes` ثبت می‌کند.

   اجرا: node tools/branch-preflight.js --fleet | --branch <name> | --selftest
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

/* فهرستِ کاریِ فراخوانی = ریشهٔ مخزنِ موردِ بررسی (مانندِ خودِ گیت) */
const ROOT = process.cwd();

/* ── ابزارک‌ها ─────────────────────────────────────────────────────── */
function git(args) {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim();
}
function resolves(ref) {
  try { git(['rev-parse', '--verify', ref]); return true; } catch (e) { return false; }
}
function revOf(ref) { return git(['rev-parse', ref]); }
function isAncestor(a, b) {
  try { git(['merge-base', '--is-ancestor', a, b]); return true; }
  catch (e) { return false; } /* نه‌نیا؛ یا گرافتِ کم‌عمق — با یادداشت گزارش می‌شود */
}
function countRange(range) {
  try { return parseInt(git(['rev-list', '--count', range]), 10); } catch (e) { return -1; }
}
function pickMainRef(pref) {
  const cands = pref ? [pref] : ['origin/main', 'main'];
  for (const c of cands) if (resolves(c)) return c;
  return null;
}
function ageDaysOf(unix) { return Math.max(0, Math.floor((Date.now() / 1000 - unix) / 86400)); }
const fa = (n) => String(n).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[+d]);

/* منبعِ سرشماری: ترجیحاً شاخه‌های ردیابیِ ریموت، وگرنه شاخه‌های محلی */
function listBranchRefs() {
  let lines = [];
  try {
    lines = git(['for-each-ref', '--format=%(objectname) %(committerdate:unix) %(refname:short)', 'refs/remotes/origin'])
      .split('\n').filter(Boolean);
  } catch (e) { lines = []; }
  let source = 'remote-tracking';
  const usable = lines.filter((l) => !/^[0-9a-f]+ \d+ origin\/(main|HEAD)$/.test(l));
  if (usable.length === 0) {
    source = 'local-heads';
    try {
      lines = git(['for-each-ref', '--format=%(objectname) %(committerdate:unix) %(refname:short)', 'refs/heads'])
        .split('\n').filter(Boolean);
    } catch (e) { lines = []; }
  } else {
    lines = usable;
  }
  const out = [];
  for (const ln of lines) {
    const m = ln.match(/^([0-9a-f]{7,40}) (\d+) (.+)$/);
    if (!m) continue;
    const name = m[3].replace(/^origin\//, '');
    if (name === 'main' || name === 'HEAD') continue;
    out.push({ name, tip: m[1], unix: parseInt(m[2], 10) });
  }
  return { source, refs: out };
}

/* ── سرشماریِ ناوگان (--fleet) ────────────────────────────────────── */
function fleet(opts) {
  const notes = [];
  const shallow = fs.existsSync(path.join(ROOT, '.git', 'shallow'));
  if (shallow) notes.push('کلون کم‌عمق: بررسیِ نیایی با گرافت محدود است.');
  const mainRef = pickMainRef(opts.main);
  if (!mainRef) { console.log('❌ مرجِ اصلی پیدا نشد (origin/main یا main).'); return 1; }

  const { source, refs } = listBranchRefs();
  notes.push('منبعِ سرشماری: ' + (source === 'remote-tracking' ? 'refs/remotes/origin/*' : 'refs/heads/* (شاخه‌های محلی — مرجِ ریموت موجود نبود)'));

  const branches = [];
  const byTip = new Map();
  for (const r of refs) {
    const merged = isAncestor(r.tip, mainRef);
    const rec = {
      name: r.name, tip: r.tip, state: merged ? 'MERGED-STALE' : 'LIVE',
      aheadMain: countRange(mainRef + '..' + r.tip),
      behindMain: countRange(r.tip + '..' + mainRef),
      committerDate: new Date(r.unix * 1000).toISOString(),
      ageDays: ageDaysOf(r.unix),
      aged: ageDaysOf(r.unix) > opts.staleDays,
    };
    branches.push(rec);
    if (!byTip.has(r.tip)) byTip.set(r.tip, []);
    byTip.get(r.tip).push(r.name);
  }
  const sharedTipClusters = [...byTip.entries()]
    .filter(([, ns]) => ns.length > 1)
    .map(([tip, ns]) => ({ tip, branches: ns.sort() }))
    .sort((a, b) => b.branches.length - a.branches.length);

  const out = {
    mode: 'fleet', mainRef, source, generatedAt: new Date().toISOString(),
    thresholds: { staleDays: opts.staleDays },
    counts: {
      total: branches.length,
      mergedStale: branches.filter((b) => b.state === 'MERGED-STALE').length,
      live: branches.filter((b) => b.state === 'LIVE').length,
      aged: branches.filter((b) => b.aged).length,
      sharedTipClusters: sharedTipClusters.length,
      branchesInSharedTips: sharedTipClusters.reduce((s, c) => s + c.branches.length, 0),
    },
    branches, sharedTipClusters, notes,
  };
  if (opts.json) { console.log(JSON.stringify(out, null, 1)); return 0; }
  console.log('پیش‌پروازِ ناوگان — مرجِ اصلی: ' + mainRef + (shallow ? ' (کلون کم‌عمق)' : ''));
  console.log('شاخه‌ها: ' + fa(out.counts.total) + ' · تحویل‌شده/کهنه (نیا یا برابرِ اصلی): ' + fa(out.counts.mergedStale)
    + ' · زنده: ' + fa(out.counts.live) + ' · کهنهٔ سنی (>' + fa(opts.staleDays) + ' روز): ' + fa(out.counts.aged));
  console.log('خوشه‌های نوکِ مشترک (نشانهٔ شاخهٔ اشتراکی/تکراری): ' + fa(out.counts.sharedTipClusters)
    + ' خوشه / ' + fa(out.counts.branchesInSharedTips) + ' شاخه');
  for (const c of sharedTipClusters.slice(0, 10)) {
    console.log('  • ' + c.tip.slice(0, 8) + ' ← ' + c.branches.join('، '));
  }
  const stale = branches.filter((b) => b.state === 'MERGED-STALE');
  if (stale.length) {
    console.log('نامزدهای حذف (مشورتی — حذف فقط با تصمیمِ مالک؛ ابزار حذف نمی‌کند):');
    for (const b of stale.slice(0, 15)) console.log('  • ' + b.name + ' @ ' + b.tip.slice(0, 8));
    if (stale.length > 15) console.log('  … و ' + fa(stale.length - 15) + ' شاخهٔ دیگر');
  }
  notes.forEach((n) => console.log('⚠️ ' + n));
  return 0;
}

/* ── پیش‌پروازِ شاخهٔ نامزد (--branch) ───────────────────────────── */
function branchPreflight(name, opts) {
  const checks = [];
  const chk = (id, hard, ok, msg) => { checks.push({ id, hard, ok, msg }); return ok; };
  const notes = [];
  if (fs.existsSync(path.join(ROOT, '.git', 'shallow'))) notes.push('کلون کم‌عمق: بررسیِ نیایی با گرافت محدود است.');
  const mainRef = pickMainRef(opts.main);
  if (!mainRef) { console.log('❌ مرجِ اصلی پیدا نشد (origin/main یا main).'); return 1; }
  if (!name) { console.log('❌ نام شاخه داده نشد.'); return 1; }

  const refs = ['refs/heads/' + name, 'refs/remotes/origin/' + name];
  const ref = refs.find((r) => resolves(r));
  if (!chk('BP-1', true, !!ref, ref ? 'مرجع شاخه حل شد: ' + ref : 'شاخهٔ «' + name + '» نه محلی است نه در ردیابیِ ریموت.')) {
    emitBranch({ mode: 'branch', branch: name, mainRef, verdict: 'FAIL', checks, notes }, opts);
    return 1;
  }

  const tip = revOf(ref);
  const ancestor = isAncestor(tip, mainRef);
  chk('BP-2', true, !ancestor, ancestor
    ? 'نوکِ شاخه نیا/برابرِ ' + mainRef + ' است — چیزی برای تحویل ندارد (شاخهٔ کهنه).'
    : 'نوکِ شاخه کامیتِ تحویل‌نشده دارد.');
  let diffNonEmpty = false;
  try {
    execFileSync('git', ['diff', '--quiet', mainRef + '...' + tip], { cwd: ROOT, stdio: 'ignore' });
    diffNonEmpty = false;
  } catch (e) { diffNonEmpty = (e.status === 1); }
  chk('BP-3', true, diffNonEmpty, diffNonEmpty ? 'diff مرجِ اصلی…شاخه ناتهی است.' : 'بدونِ هیچ تفاوتِ محتوایی با مرجِ اصلی.');
  const behind = countRange(tip + '..' + mainRef);
  const ahead = countRange(mainRef + '..' + tip);
  chk('BP-4', false, behind >= 0 && behind <= opts.behindWarn,
    behind < 0 ? 'سنجهٔ عقب‌بودگی در دسترس نیست.'
      : behind > opts.behindWarn ? 'پایهٔ شاخه ' + fa(behind) + ' کامیت از ' + mainRef + ' عقب‌تر است (ریسکِ تداخل؛ ادغامِ روزانه توصیه می‌شود).'
      : 'پایهٔ شاخه تازه است (' + fa(behind) + ' کامیت عقب‌تر).');
  let ageDays = -1;
  try { ageDays = ageDaysOf(parseInt(git(['log', '-1', '--format=%ct', tip]), 10)); } catch (e) {}
  chk('BP-5', false, ageDays >= 0 && ageDays <= opts.staleDays,
    ageDays < 0 ? 'سنِّ نوکِ شاخه در دسترس نیست.'
      : 'سنِّ نوکِ شاخه: ' + fa(ageDays) + ' روز' + (ageDays > opts.staleDays ? ' (کهنهٔ سنی)' : ''));
  let shared = [];
  try {
    shared = git(['for-each-ref', '--format=%(objectname) %(refname:short)', 'refs/remotes/origin', 'refs/heads'])
      .split('\n').filter(Boolean)
      .map((l) => l.split(' '))
      .filter(([t, n]) => t === tip && n !== name && n !== 'origin/' + name && n !== 'main' && n !== 'origin/main')
      .map(([, n]) => n);
  } catch (e) {}
  chk('BP-6', false, shared.length === 0,
    shared.length === 0 ? 'نوکِ شاخه با نامِ دیگری مشترک نیست.'
      : 'نوکِ شاخه با ' + fa(shared.length) + ' نامِ دیگر مشترک است: ' + shared.slice(0, 5).join('، ') + ' (ریسکِ شاخهٔ اشتراکی).');

  const hardFail = checks.some((c) => c.hard && !c.ok);
  const out = { mode: 'branch', branch: name, mainRef, verdict: hardFail ? 'FAIL' : 'PASS', aheadMain: ahead, behindMain: behind, checks, notes };
  emitBranch(out, opts);
  return hardFail ? 1 : 0;
}
function emitBranch(out, opts) {
  if (opts.json) { console.log(JSON.stringify(out, null, 1)); return; }
  console.log('پیش‌پروازِ شاخهٔ «' + out.branch + '» در برابرِ ' + out.mainRef + ' — حکم: ' + (out.verdict === 'PASS' ? '✅ پذیرفتنی' : '❌ مردود'));
  for (const c of out.checks) {
    console.log('  ' + (c.ok ? '✅' : (c.hard ? '❌' : '⚠️')) + ' ' + c.id + (c.hard ? '' : ' (مشورتی)') + ' — ' + c.msg);
  }
  out.notes.forEach((n) => console.log('⚠️ ' + n));
}

/* ── خودآزماییِ هرمتیک (--selftest) ───────────────────────────────── */
function selftest() {
  let pass = 0, failn = 0;
  const chk = (name, cond, extra) => {
    if (cond) { pass++; console.log('  ✅ ' + name); }
    else { failn++; console.log('  ❌ ' + name + (extra ? ' — ' + String(extra).slice(0, 160) : '')); }
  };
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'branch-preflight-'));
  const env = Object.assign({}, process.env, {
    GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t.local',
    GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t.local',
  });
  const g = (args, extraEnv) => execFileSync('git', args, { cwd: tmp, env: Object.assign({}, env, extraEnv || {}), encoding: 'utf8' }).toString().trim();
  const tool = __filename;
  const runTool = (args) => {
    try {
      const out = execFileSync(process.execPath, [tool].concat(args), { cwd: tmp, encoding: 'utf8', env });
      return { code: 0, out };
    } catch (e) { return { code: e.status, out: String(e.stdout || '') + String(e.stderr || '') }; }
  };
  try {
    /* ساختِ مخزنِ اسباب‌بازی: ادغام‌شده + زنده + نوکِ مشترک + کامیتِ کهنه */
    g(['init', '-q', '-b', 'main', tmp]);
    fs.writeFileSync(path.join(tmp, 'a.txt'), 'a1\n');
    g(['add', 'a.txt']); g(['commit', '-q', '-m', 'c0']);
    g(['checkout', '-q', '-b', 'merged-br']);
    fs.writeFileSync(path.join(tmp, 'b.txt'), 'b1\n');
    g(['add', 'b.txt']); g(['commit', '-q', '-m', 'c1-merged']);
    g(['checkout', '-q', 'main']);
    g(['merge', '-q', '--no-ff', '-m', 'merge merged-br', 'merged-br']);
    g(['checkout', '-q', '-b', 'live-br']);
    fs.writeFileSync(path.join(tmp, 'c.txt'), 'c1\n');
    g(['add', 'c.txt']); g(['commit', '-q', '-m', 'c2-live']);
    g(['branch', 'dup-a']); g(['branch', 'dup-b']);   /* سه نام روی یک نوک */
    g(['checkout', '-q', 'main']);
    g(['checkout', '-q', '-b', 'aged-br']);
    fs.writeFileSync(path.join(tmp, 'd.txt'), 'd1\n');
    g(['add', 'd.txt']);
    g(['commit', '-q', '-m', 'c-old'], {
      GIT_AUTHOR_DATE: '2020-01-01T00:00:00Z', GIT_COMMITTER_DATE: '2020-01-01T00:00:00Z',
    });
    g(['checkout', '-q', 'main']);

    console.log('■ خودآزماییِ ابزار روی مخزنِ اسباب‌بازی (' + tmp + ')');

    /* ۱) سرشماری */
    const fl = runTool(['--fleet', '--json', '--stale-days', '14']);
    chk('سرشماری خروجی ۰ دارد', fl.code === 0, fl.out);
    let fj = null; try { fj = JSON.parse(fl.out); } catch (e) {}
    chk('سرشماری جی‌سانِ معتبر دارد', !!fj && fj.mode === 'fleet');
    chk('مرجِ اصلی «main» انتخاب شده (بدون ریموت)', fj && fj.mainRef === 'main');
    chk('منبعِ سرشماری شاخه‌های محلی است (بدون ریموت)', fj && fj.source === 'local-heads');
    chk('merged-br در کلاسِ تحویل‌شده/کهنه است', fj && fj.branches.some((b) => b.name === 'merged-br' && b.state === 'MERGED-STALE'));
    chk('live-br در کلاسِ زنده است', fj && fj.branches.some((b) => b.name === 'live-br' && b.state === 'LIVE'));
    chk('aged-br کهنهٔ سنی دارد', fj && fj.branches.some((b) => b.name === 'aged-br' && b.aged === true));
    chk('live-br کهنهٔ سنی ندارد', fj && fj.branches.some((b) => b.name === 'live-br' && b.aged === false));
    chk('خوشهٔ نوکِ مشترک پیدا شد (≥۲ نام)', fj && fj.sharedTipClusters.some((c) => c.branches.length >= 2
      && c.branches.includes('dup-a') && c.branches.includes('dup-b')));
    chk('شمارش‌ها با فهرست هم‌خوان‌اند', fj && fj.counts.total === fj.branches.length
      && fj.counts.mergedStale + fj.counts.live === fj.counts.total);

    /* ۲) پیش‌پروازِ شاخه */
    const okB = runTool(['--branch', 'live-br', '--json']);
    chk('پیش‌پروازِ شاخهٔ زنده: خروجی ۰ + حکمِ پذیرش', okB.code === 0 && /"verdict": "PASS"/.test(okB.out), okB.out);
    const stB = runTool(['--branch', 'merged-br', '--json']);
    chk('پیش‌پروازِ شاخهٔ تحویل‌شده: خروجی ۱ + حکمِ رد (گازِ سخت)', stB.code === 1 && /"verdict": "FAIL"/.test(stB.out), stB.out);
    chk('دلیلِ رد، همان بررسیِ نیایی است (BP-2)', stB.code === 1 && /"id": "BP-2"[\s\S]*?"ok": false/.test(stB.out));
    const noB = runTool(['--branch', 'no-such-branch', '--json']);
    chk('شاخهٔ ناموجود: خروجی ۱ + ردِ BP-1', noB.code === 1 && /"id": "BP-1"[\s\S]*?"ok": false/.test(noB.out));
    const shB = runTool(['--branch', 'dup-a', '--json']);
    chk('نوکِ مشترک در پیش‌پرواز گزارش می‌شود (BP-6 ناراحت)', /"id": "BP-6"[\s\S]*?"ok": false/.test(shB.out));

    /* ۳) خروجیِ انسانی + آستانه‌ها */
    const hu = runTool(['--fleet', '--stale-days', '14']);
    chk('خروجیِ انسانی سرشماری حاوی شمارِ خوشه‌هاست', hu.code === 0 && /خوشه/.test(hu.out));
    const agedOnly = runTool(['--fleet', '--json', '--stale-days', '999999']);
    let aj = null; try { aj = JSON.parse(agedOnly.out); } catch (e) {}
    chk('آستانهٔ بزرگ ⇒ هیچ شاخه‌ای کهنهٔ سنی نیست', aj && aj.counts.aged === 0);

    console.log('نتیجه: ' + fa(pass) + ' موفق / ' + fa(failn) + ' ناموفق (از ' + fa(pass + failn) + ')');
    return failn ? 1 : 0;
  } finally {
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {}
  }
}

/* ── رابطِ خطِ فرمان ──────────────────────────────────────────────── */
if (require.main === module) {
  const argv = process.argv.slice(2);
  const opts = { json: argv.includes('--json'), staleDays: 14, behindWarn: 25, fetch: argv.includes('--fetch') };
  const idxStale = argv.indexOf('--stale-days');
  if (idxStale > -1) opts.staleDays = parseInt(argv[idxStale + 1], 10) || 14;
  const idxBehind = argv.indexOf('--behind-warn');
  if (idxBehind > -1) opts.behindWarn = parseInt(argv[idxBehind + 1], 10) || 25;
  const idxMain = argv.indexOf('--main');
  if (idxMain > -1) opts.main = argv[idxMain + 1];

  if (argv.includes('--selftest')) process.exit(selftest());
  if (opts.fetch) { try { git(['fetch', 'origin', '--prune']); } catch (e) { console.log('⚠️ fetch ناموفق — ادامه با مراجعِ موجود.'); } }
  const idxBranch = argv.indexOf('--branch');
  if (idxBranch > -1) process.exit(branchPreflight(argv[idxBranch + 1], opts));
  if (argv.includes('--fleet')) process.exit(fleet(opts));
  console.log('کاربرگ: --fleet | --branch <name> | --selftest  (گزینه‌ها: --json، --main <ref>، --stale-days <n>، --behind-warn <n>، --fetch)');
  process.exit(2);
}
module.exports = { fleet, branchPreflight, selftest };
