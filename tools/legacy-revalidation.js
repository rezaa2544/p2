#!/usr/bin/env node
'use strict';
/* ═══════════════════════════════════════════════════════════════════════════
   tools/legacy-revalidation.js — A-01..A-29 legacy carry-over revalidation
   (Current-HEAD Rule: every legacy item's recorded requirement is re-proven
   against the CURRENT working tree. Historical ATRIA_PASS is never trusted.)

   Verdict vocabulary per item:
     PASS            — the recorded requirement holds on this HEAD
     DEFECT-OPEN     — the recorded requirement is verified to STILL BE OPEN
                       (an honest verified-open state; the item may not be
                       promoted while it stays open)
     PRESENCE-OK     — the recordable requirement (presence/wiring) holds;
                       live-runtime execution is a separate staged step
     DOCS-OK         — the documentation obligation is discharged
     RUNTIME-PENDING — presence proven; runtime execution pending staging
   FAIL is reserved for checks that could not establish their fact (crash,
   missing subject file, unexpected shape). Exit 0 iff every check
   established its fact (PASS / DEFECT-OPEN / PRESENCE-OK / DOCS-OK /
   RUNTIME-PENDING are all "established"); exit 1 on any FAIL.

   Output is machine-parsable:
     A-01 <VERDICT> — <detail>
     ...
     CHECKS 29 FAIL <n>
   ═══════════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const ROOT = path.join(__dirname, '..');
const READ = (p) => { try { return fs.readFileSync(path.join(ROOT, p), 'utf8'); } catch (e) { return null; } };
const EXISTS = (p) => fs.existsSync(path.join(ROOT, p));
const count = (text, re) => (text ? (text.match(re) || []).length : 0);

/* run a repo test/battery and return {exit, tail} — never swallow a crash */
function runNode(rel, envExtra, timeoutMs) {
  /* DEFAULT = in-memory deterministic mode: staging live-routing envs are
     stripped so suites never silently flip to live mode based on the
     operator's shell (the battery + reliability suites went live and red
     when DATABASE_URL pointed at staging). Live evidence runs must use
     runNodeLive() explicitly. */
  const env = Object.assign({}, process.env, envExtra || {});
  delete env.DATABASE_URL; delete env.REDIS_URL;
  const r = cp.spawnSync(process.execPath, [path.join(ROOT, rel)], {
    cwd: ROOT, encoding: 'utf8', timeout: timeoutMs || 300000, env,
    maxBuffer: 64 * 1024 * 1024,
  });
  const out = String(r.stdout || '') + String(r.stderr || '');
  return { exit: r.status, out: out, err: String(r.error || '') };
}
function runNodeLive(rel, envExtra, timeoutMs) {
  /* explicit live mode: keeps DATABASE_URL/REDIS_URL (staging drill evidence) */
  const env = Object.assign({}, process.env, envExtra || {});
  const r = cp.spawnSync(process.execPath, [path.join(ROOT, rel)], {
    cwd: ROOT, encoding: 'utf8', timeout: timeoutMs || 300000, env,
    maxBuffer: 64 * 1024 * 1024,
  });
  const out = String(r.stdout || '') + String(r.stderr || '');
  return { exit: r.status, out: out, err: String(r.error || '') };
}

/* ── shared battery run (one process-wide execution, reused by A-18/20/21/24) ── */
let batteryRun = null;
function battery() {
  if (batteryRun === null) batteryRun = runNode('tests/security-adversarial-a18-a22.test.js', {}, 300000);
  return batteryRun;
}
/* diagnosability: a failed child's reason MUST be visible in the harness output —
   silent exit codes cost a full re-run cycle (observed: the adversarial battery
   flaked red under harness load with its output swallowed). */
function batteryTail(b) {
  if (b.exit === 0) return '';
  const lines = String(b.out || '').trim().split('\n').filter((l) => l.trim());
  const red = lines.filter((l) => /FAIL|❌|not ok|Error/i.test(l)).slice(-4);
  return ' | battery tail: ' + (red.length ? red : lines.slice(-3)).join(' ;; ').slice(0, 400);
}

const CHECKS = [];
function add(id, fn) { CHECKS.push({ id: id, fn: fn }); }

/* ── A-01 — analytics schools query parameterized + readCollection loop + warn fallback ── */
add('A-01', () => {
  const t = READ('server/routes/analytics.js');
  if (t === null) throw new Error('server/routes/analytics.js missing');
  const paramQ = /SELECT \* FROM schools WHERE district_id = \$1/.test(t);
  /* the six collections are iterated (for (const cn of REGION_COLL)) with one
     readCollection call inside the loop — verify the LIST has >= 6 entries */
  const listDef = (t.match(/REGION_COLL\s*=\s*\[([^\]]*)\]/) || [])[1] || '';
  const listLen = (listDef.match(/['"]/g) || []).length / 2;
  const loopCall = /for \(const cn of REGION_COLL\)/.test(t) && /readCollection\(cn\)/.test(t);
  const warn = count(t, /console\.warn\(/g);
  const ok = paramQ && listLen >= 6 && loopCall && warn >= 2;
  return { ok: ok, verdict: ok ? 'PASS' : 'FAIL',
    detail: 'district_id=$1=' + paramQ + ', REGION_COLL entries=' + listLen + ', loop-read=' + loopCall + ', console.warn=' + warn };
});

/* ── A-02 — health-index analytics db access (discharge the deferral) ── */
add('A-02', () => {
  /* The claimed subject file no longer exists at this HEAD: the health-index
     concern lives in school-health-dashboard.js. The deferral is DISCHARGED
     only when that successor module itself has db access (the canonical
     pgLive + query/readCollection pattern with a loud fallback). */
  if (!EXISTS('server/analytics/health-index.js')) {
    const succ = READ('server/analytics/school-health-dashboard.js');
    if (succ === null) throw new Error('successor school-health-dashboard.js missing');
    const hits = count(succ, /\bdb\.|isPostgres|readCollection/g);
    const loader = /loadSchoolHealthInputs/.test(succ);
    const loud = /school-health-dashboard\] PG read failed/.test(succ);
    const ok = hits >= 1 && loader && loud;
    return { ok: ok, verdict: ok ? 'PASS' : 'DEFECT-OPEN',
      detail: 'subject file removed; successor school-health-dashboard.js db-idiom hits=' + hits + ', loader=' + loader + ', loud-fallback=' + loud + (ok ? ' — deferral discharged' : ' — RAM-only defect still open') };
  }
  const t = READ('server/analytics/health-index.js');
  const hits = count(t, /\bdb\.|isPostgres|readCollection/g);
  return { ok: true, verdict: hits === 0 ? 'DEFECT-OPEN' : 'FAIL',
    detail: 'db-idiom hits in health-index.js = ' + hits + ' (0 = defect still open, verified)' };
});

/* ── A-03 — analytics + semantic-analytics fallback paths warn, not fail silently ── */
add('A-03', () => {
  const a = READ('server/routes/analytics.js');
  const s = READ('server/routes/semantic-analytics.js');
  if (a === null || s === null) throw new Error('analytics or semantic-analytics route missing');
  const ok = count(a, /console\.warn/g) >= 2 && count(s, /console\.warn/g) >= 1;
  return { ok: ok, verdict: ok ? 'PASS' : 'FAIL',
    detail: 'analytics.js warns=' + count(a, /console\.warn/g) + ', semantic-analytics.js warns=' + count(s, /console\.warn/g) };
});

/* ── A-04 — ids.js monotonic lastIssued counter ── */
add('A-04', () => {
  const t = READ('server/ids.js');
  if (t === null) throw new Error('server/ids.js missing');
  const hasMap = /lastIssued\s*=\s*new Map\(\)/.test(t);
  const monotonic = /Math\.max\(localMax\(list\), lastIssued\.get\(col\)/.test(t);
  const set = /lastIssued\.set\(/.test(t);
  const ok = hasMap && monotonic && set;
  return { ok: ok, verdict: ok ? 'PASS' : 'FAIL',
    detail: 'lastIssued Map=' + hasMap + ', Math.max guard=' + monotonic + ', set=' + set };
});

/* ── A-05 — auto-backup honest no-op under PG-live ── */
add('A-05', () => {
  const admin = READ('server/admin.js');
  const idx = READ('server/index.js');
  if (admin === null || idx === null) throw new Error('admin.js/index.js missing');
  const fn = /function startAutoBackup\(ms\)/.test(admin);
  const honest = /auto-backup: PG is authoritative/.test(admin);
  const wired = /startAutoBackup\(BACKUP_EVERY_MS\)/.test(idx);
  const ok = fn && honest && wired;
  return { ok: ok, verdict: ok ? 'PASS' : 'FAIL',
    detail: 'startAutoBackup=' + fn + ', PG-honest-warn=' + honest + ', index wiring=' + wired };
});

/* ── A-06 — sms module: memoization, queueById, monotonic nextId, idempotency ── */
add('A-06', () => {
  /* locate the sms module wherever it lives */
  let smsPath = null;
  const cands = ['server/routes/sms.js', 'server/sms.js', 'server/routes/notifications.js'];
  for (const c of cands) if (EXISTS(c)) { smsPath = c; break; }
  if (!smsPath) {
    const dir = path.join(ROOT, 'server');
    const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => {
      const p = path.join(d, e.name);
      return e.isDirectory() ? walk(p) : (/sms/i.test(e.name) && e.name.endsWith('.js') ? [p] : []);
    });
    const found = walk(dir);
    smsPath = found.length ? path.relative(ROOT, found[0]) : null;
  }
  if (!smsPath) return { ok: false, verdict: 'FAIL', detail: 'no sms module found under server/' };
  const t = READ(smsPath);
  const memo = /cache\s*=\s*new Map\(\)/.test(t);
  const qById = /queueById/.test(t);
  const nextId = /nextId/.test(t);
  const idem = /(idHigh\s*=\s*new Map|idx\s*=\s*new Set)/.test(t);
  const facts = [memo, qById, nextId, idem];
  const ok = facts.every(Boolean);
  return { ok: ok, verdict: ok ? 'PASS' : 'FAIL',
    detail: smsPath + ' memo=' + memo + ' queueById=' + qById + ' nextId=' + nextId + ' idempotency=' + idem };
});

/* ── A-07 — __skip sentinel + NOT-RUN counter in the three wave tests ── */
add('A-07', () => {
  const files = ['tests/wave1-reads.js', 'tests/wave3-query2.js', 'tests/bell2.js'];
  const facts = files.map((f) => {
    const t = READ(f);
    if (t === null) return [f, false, false];
    return [f, /__skip/.test(t), /NOT-RUN|notrun/.test(t)];
  });
  const ok = facts.every((f) => f[1] && f[2]);
  return { ok: ok, verdict: ok ? 'PASS' : 'FAIL',
    detail: facts.map((f) => f[0].split('/').pop() + '(skip=' + f[1] + ',notrun=' + f[2] + ')').join(' ') };
});

/* ── A-08 — construction-level fake-green sweep over tests/ ── */
add('A-08', () => {
  /* documented legitimate exceptions (inspected by the Atria audit and by this
     revalidation) */
  const EXC = {
    'tests/demo-thursday.js': 'LEGITIMATE — real assertions with non-chk idioms / exit-code semantics',
    'tests/session8-gc.js': 'LEGITIMATE — real assertions with non-chk idioms / exit-code semantics',
    'tests/server11-child.js': 'LEGITIMATE — spawned worker child (server11 parent asserts on its STATUS/RESP protocol lines)',
  };
  /* A file is flagged only if it exits 0 while containing NO verification
     idiom at all (chk/check/assert/expect/ok/probe/pass/verify/EVID.push/axe/
     push-of-evidence). Assertion failures throw and crash the process with a
     nonzero exit, so an assertion-bearing file CANNOT be always-green by
     construction; a file with an explicit exit(0) and no verification idiom
     anywhere can. */
  const flagged = [];
  const stripComments = (src) => src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/\/\/[^\n]*/g, (m) => m.replace(/[^\n]/g, ' '));
  const walk = (d, out) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.name === 'node_modules' || e.name === '.git') continue;
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p, out);
      else if (e.name.endsWith('.js')) {
        const rel = path.relative(ROOT, p).replace(/\\/g, '/');
        const t = stripComments(fs.readFileSync(p, 'utf8'));
        if (!/process\.exit\(0\)|(?<![.\w])exit\(0\)/.test(t)) continue;
        const hasEvidence = /\bchk\(|\bcheck\(|\bassert|assert\.|expect\(|\bok\(|\bprobe\(|\bpass\(|\bverify\(|EVID\.push|axe|\.push\(\{|STATUS:/.test(t);
        const hasFailPath = /exit\([123]\)|process\.exitCode\s*=\s*[123]|\bfailures\b|failedSuites|\bSURVIVED\b|\bKILLED\b|self-check failed|exit\((?!0\))/.test(t);
        if (!hasEvidence && !hasFailPath && !EXC[rel]) flagged.push(rel);
      }
    }
  };
  walk(path.join(ROOT, 'tests'), []);
  const undocumented = flagged.filter((f) => !EXC[f]);
  const ok = undocumented.length === 0;
  return { ok: ok, verdict: ok ? 'PASS' : 'DEFECT-OPEN',
    detail: 'flagged=' + flagged.length + ' [' + flagged.slice(0, 6).join(',') + '] undocumented=' + undocumented.length };
});

/* ── A-09 — codacy threshold is meaningful (INT_MAX weakness was fixed) ── */
add('A-09', () => {
  const t = READ('.github/workflows/codacy.yml');
  if (t === null) throw new Error('.github/workflows/codacy.yml missing');
  const intMax = /max-allowed-issues:\s*2147483647/.test(t);
  const m = t.match(/max-allowed-issues:\s*(\d+)/);
  const thr = m ? Number(m[1]) : null;
  const ok = !intMax && thr !== null && thr > 0 && thr < 100000;
  return { ok: ok, verdict: ok ? 'PASS' : 'DEFECT-OPEN',
    detail: 'max-allowed-issues=' + thr + ' (INT_MAX weakness fixed: ' + !intMax + ')' };
});

/* ── A-10 — CodeQL: echo-only stub removed, default setup configured (real scan) ── */
add('A-10', () => {
  const stubGone = !EXISTS('.github/workflows/codeql.yml');
  const note = READ('docs/verification/evidence/a10-codeql-default-setup.note.md');
  const recorded = note !== null && /state=configured/.test(note) && /code-scanning\/default-setup/.test(note);
  const ok = stubGone && recorded;
  return { ok: ok, verdict: ok ? 'PASS' : 'DEFECT-OPEN',
    detail: 'echo-only stub removed=' + stubGone + ', default-setup evidence note=' + recorded };
});

/* ── A-11 — documented-skip contract verified on HEAD (vendor scope = known
   limitation). The carried requirement is the substitute control: the Fortify
   gap is documented loudly (skip with NOT-EXECUTED reason + no fake green) and
   the substitute security program (security.yml) stays wired. The original
   vendor-gated scope (real Fortify scan credentials) remains vendor-blocked
   (VENDORS task) and is declared as a known limitation, not silently dropped. */
add('A-11', () => {
  const t = READ('.github/workflows/fortify.yml');
  if (t === null) throw new Error('.github/workflows/fortify.yml missing');
  const skip = /Skipping Fortify/.test(t) && /NOT EXECUTED/.test(t);
  const loud = /cannot be green without a real Fortify scan/.test(t);
  const sec = READ('.github/workflows/security.yml');
  const substitute = sec !== null && /security-events|schedule|pull_request/.test(sec);
  const ok = skip && loud && substitute;
  return { ok: ok, verdict: ok ? 'PASS' : 'FAIL',
    detail: 'documented-skip contract verified on HEAD: skip=' + skip + ', loud-not-green=' + loud +
      ', substitute security program present=' + substitute +
      ' | original vendor scope (real Fortify scan credentials) remains vendor-blocked — known limitation, VENDORS task' };
});

/* ── A-12 — canonical regression runner is wired into package.json AND CI ── */
add('A-12', () => {
  const pkg = READ('package.json');
  const wf = READ('.github/workflows/node.js.yml');
  if (pkg === null || wf === null) throw new Error('package.json/node.js.yml missing');
  const inPkg = /"test:all":\s*"[^"]*run-all-tests\.sh"/.test(pkg);
  const inWf = /npm run test:all/.test(wf);
  const ok = inPkg && inWf;
  return { ok: ok, verdict: ok ? 'PASS' : 'DEFECT-OPEN',
    detail: 'package.json test:all=' + inPkg + ', node.js.yml npm run test:all=' + inWf };
});

/* ── A-13 — parity contract is recursive with zero orphan budget ── */
add('A-13', () => {
  const t = READ('tests/ci-test-parity-contract.js');
  if (t === null) throw new Error('parity contract missing');
  const recursive = /jsUnder\('tests\/api'\)/.test(t);
  const budget = /ORPHAN_BUDGET\s*=\s*0/.test(t);
  const r = runNode('tests/ci-test-parity-contract.js', {}, 120000);
  const green = r.exit === 0 && /0 fail/.test(r.out);
  const ok = recursive && budget && green;
  return { ok: ok, verdict: ok ? 'PASS' : 'FAIL',
    detail: 'recursive=' + recursive + ', budget0=' + budget + ', run exit=' + r.exit + ' | ' + (r.out.match(/TEST\/CI parity: [^\n]*/) || ['(no summary)'])[0] };
});

/* ── A-14 — bell2 explicit NOT-RUN (no date-dependent skip) ── */
add('A-14', () => {
  const t = READ('tests/bell2.js');
  if (t === null) throw new Error('tests/bell2.js missing');
  const hasSkip = /__skip/.test(t);
  const dateSkip = /new Date\([^)]*\)[^;\n]*(skip|__skip)/i.test(t);
  const ok = hasSkip && !dateSkip;
  return { ok: ok, verdict: ok ? 'PASS' : 'FAIL',
    detail: '__skip=' + hasSkip + ', date-dependent-skip=' + dateSkip };
});

/* ── A-15 — offline-sync-drill S2c asserts three ok=true ── */
add('A-15', () => {
  const t = READ('tests/offline-sync-drill.js');
  if (t === null) throw new Error('tests/offline-sync-drill.js missing');
  const s2c = /S2c/.test(t) && /ok=true|ok === true|ok: true/.test(t);
  const ok = s2c;
  return { ok: ok, verdict: ok ? 'PASS' : 'FAIL', detail: 'S2c ok=true assertion present=' + s2c };
});

/* ── A-16 — chaos-drill-lib pg status by exit code ── */
add('A-16', () => {
  const t = READ('tests/chaos-drill-lib.js');
  if (t === null) throw new Error('tests/chaos-drill-lib.js missing');
  const byExit = /pg_ctl'\), \['-D', this\.pgData, 'status'\][^)]*stdio: 'ignore'/.test(t) ||
    /exit codeِ pg_ctl status/.test(t);
  const ok = byExit;
  return { ok: ok, verdict: ok ? 'PASS' : 'FAIL', detail: 'exit-code pg_ctl status check=' + byExit };
});

/* ── A-17 — real toast + real zeroing assertions ── */
add('A-17', () => {
  const cf = READ('tests/client-features.js');
  const mg = READ('tests/multigrade2.js');
  if (cf === null || mg === null) throw new Error('client-features/multigrade2 missing');
  const toast = /A-17: assertion/.test(cf) || (/#toasts/.test(cf) && /assert\(/.test(cf));
  const zero = /class_subject_members/.test(mg) && /assert|chk/.test(mg);
  const ok = toast && zero;
  return { ok: ok, verdict: ok ? 'PASS' : 'FAIL',
    detail: 'client-features real toast=' + toast + ', multigrade2 real zeroing=' + zero };
});

/* ── A-18 — conflict resolution monotonic + target-scoped (+ adversarial battery) ── */
add('A-18', () => {
  const r = battery();
  const green = r.exit === 0 && /checks passed/.test(r.out);
  const a18 = /A-18/.test(r.out);
  const ok = green && a18;
  return { ok: ok, verdict: ok ? 'PASS' : 'FAIL',
    detail: 'adversarial battery exit=' + r.exit + ', A-18 covered=' + a18 + ' | ' + (r.out.match(/A-18\.\.A-22 security battery: [^\n]*/) || ['(no summary)'])[0] + batteryTail(r) };
});

/* ── A-19 — studentRecordOk canonical gate (idor + semantic-analytics + battery) ── */
add('A-19', () => {
  const idor = READ('server/idor.js');
  const sa = READ('server/routes/semantic-analytics.js');
  if (idor === null || sa === null) throw new Error('idor.js/semantic-analytics.js missing');
  const inIdor = /policy\.studentRecordOk\(store, s, st, opts\)/.test(idor);
  const inSa = count(sa, /policy\.studentRecordOk\(/g) >= 2;
  const ok = inIdor && inSa;
  return { ok: ok, verdict: ok ? 'PASS' : 'FAIL',
    detail: 'idor.js gate=' + inIdor + ', semantic-analytics refs=' + count(sa, /policy\.studentRecordOk\(/g) };
});

/* ── A-20 — strict OCC on all 5 PATCH paths (+ adversarial battery) ── */
add('A-20', () => {
  const r = battery();
  const green = r.exit === 0;
  const inv = (r.out.match(/strict OCC wired in (\w+)/g) || []).length;
  const neg = /A-20 negative: production PATCH without base_version is rejected/.test(r.out);
  const ok = green && inv >= 5 && neg;
  return { ok: ok, verdict: ok ? 'PASS' : 'FAIL',
    detail: 'battery exit=' + r.exit + ', OCC-wired entities=' + inv + ', negative present=' + neg + batteryTail(r) };
});

/* ── A-21 — same-school homeroom + enrolled-class + class/subject validation ── */
add('A-21', () => {
  const cls = READ('server/routes/classes.js');
  const batt = battery();
  if (cls === null) throw new Error('classes.js missing');
  const a21 = /A-21: homeroom_teacher_id/.test(cls) && /same-school/i.test(cls) === false ? /A-21/.test(cls) : /A-21/.test(cls);
  const batteryA21 = /A-21 positive: same-school teacher binding succeeds/.test(batt.out);
  const ok = a21 && batteryA21 && batt.exit === 0;
  return { ok: ok, verdict: ok ? 'PASS' : 'FAIL',
    detail: 'classes.js A-21 validation=' + a21 + ', battery A-21=' + batteryA21 + ', battery exit=' + batt.exit + batteryTail(batt) };
});

/* ── A-22 — redis commandTimeout + boot fail-fast REDIS_URL-only shape ── */
add('A-22', () => {
  const redis = READ('server/redis.js');
  const idx = READ('server/index.js');
  if (redis === null || idx === null) throw new Error('redis.js/index.js missing');
  const cmdT = /commandTimeout:\s*Number\(env\.PAYESH_REDIS_COMMAND_TIMEOUT_MS\)\s*\|\|\s*2000/.test(redis);
  const boot = /A-22 \(re-audit\): این مسیرِ انتهایی همچنین باید شکلِ «فقط REDIS_URL» را/.test(idx) ||
    /REDIS_URL-only/.test(idx);
  const ok = cmdT && boot;
  return { ok: ok, verdict: ok ? 'PASS' : 'FAIL',
    detail: 'commandTimeout=' + cmdT + ', boot REDIS_URL-only gate=' + boot };
});

/* ── A-23 — regional p_value totalHard/totalExams with null guard ── */
add('A-23', () => {
  const t = READ('server/analytics/regional-intelligence-network.js');
  if (t === null) throw new Error('regional-intelligence-network.js missing');
  const exact = /average_difficulty_p_value:\s*totalExams > 0 \? Math\.round\(\(totalHard \/ totalExams\) \* 100\) \/ 100 : null/.test(t);
  const ok = exact;
  return { ok: ok, verdict: ok ? 'PASS' : 'FAIL', detail: 'exact guarded derivation=' + exact };
});

/* ── A-24 — A-18/A-20 fixes carried on main (battery green) ── */
add('A-24', () => {
  const r = battery();
  const ok = r.exit === 0;
  return { ok: ok, verdict: ok ? 'PASS' : 'FAIL',
    detail: 'A-18..A-22 battery green on current main=' + (r.exit === 0) + batteryTail(r) };
});

/* ── A-25 — outbox presence + wiring + real-PG crash/DLQ drill ── */
add('A-25', () => {
  const wired = EXISTS('server/outbox.js') && /createOutbox/.test(READ('server/index.js') || '');
  const t1 = EXISTS('tests/phase2-outbox-failover.js');
  const t2 = EXISTS('tests/outbox-runtime-reliability.test.js');
  const r = runNode('tests/outbox-runtime-reliability.test.js', {}, 180000);
  /* when DATABASE_URL points at a live staging PostgreSQL, the real-PG
     crash/restart/DLQ drill runs as the runtime evidence (10/10 = green) */
  if (wired && t1 && t2 && r.exit === 0 && String(process.env.DATABASE_URL || '').trim()) {
    const dr = runNodeLive('tests/phase2-outbox-failover.js', {}, 420000);
    const ok10 = dr.exit === 0 && /10\/10/.test(dr.out);
    const tail = ok10 ? '' : ' | drill tail: ' + String(dr.out || '').trim().split('\n').slice(-3).join(' ;; ').slice(0, 300);
    return { ok: ok10, verdict: ok10 ? 'PASS' : 'RUNTIME-PENDING',
      detail: 'wired=' + wired + ', in-memory suite exit=' + r.exit +
        ', real-PG crash/DLQ drill exit=' + dr.exit + ' | ' + (dr.out.match(/PHASE2 OUTBOX FAILOVER: [^\n]*/) || ['(no summary)'])[0] + tail };
  }
  return { ok: wired && t1 && t2 && r.exit === 0, verdict: 'RUNTIME-PENDING',
    detail: 'wired=' + wired + ', phase2-present=' + t1 + ', runtime-reliability-present=' + t2 +
      ', local in-memory suite exit=' + r.exit + ' (real-PG crash/DLQ drill pending staging DATABASE_URL)' };
});

/* ── A-26 — documented-skip contract verified on HEAD (vendor scope = known
   limitation). The carried requirement is the substitute state: the echo-only
   CodeQL stub is gone (real default-setup evidence note exists), the Fortify
   skip is documented, and the Codacy threshold is sane. The original vendor
   scope (vendor SaaS credentials) remains vendor-blocked (VENDORS task) and is
   declared as a known limitation, not silently dropped. */
add('A-26', () => {
  const codeqlGone = !EXISTS('.github/workflows/codeql.yml');
  const fort = READ('.github/workflows/fortify.yml');
  const cod = READ('.github/workflows/codacy.yml');
  const fortSkip = fort !== null && /NOT EXECUTED/.test(fort);
  const codSane = cod !== null && !/max-allowed-issues:\s*2147483647/.test(cod);
  const ok = codeqlGone && fortSkip && codSane;
  return { ok: ok, verdict: ok ? 'PASS' : 'FAIL',
    detail: 'documented-skip contract verified on HEAD: codeql-stub-removed=' + codeqlGone +
      ', fortify-documented-skip=' + fortSkip + ', codacy-threshold-sane=' + codSane +
      ' | original vendor scope (vendor SaaS credentials) remains vendor-blocked — known limitation, VENDORS task' };
});

/* ── A-27 — real PG/Redis DR environment ── */
add('A-27', () => {
  const note = READ('docs/verification/evidence/a27-staging-dr-environment.note.md');
  const recorded = note !== null && /docker compose/.test(note) && /pg-primary/.test(note) && /redis-master/.test(note);
  /* drills executed and recorded in the note ⇒ RUNTIME-VERIFIED; note without
     drill results stays RUNTIME-PENDING; no note = DEFECT-OPEN */
  const drills = note !== null && /PROMOTE_OK/.test(note) && /10\/10/.test(note) && /6\/6 PASS/.test(note);
  const ok = recorded;
  const verdict = !recorded ? 'DEFECT-OPEN' : (drills ? 'RUNTIME-VERIFIED' : 'RUNTIME-PENDING');
  return { ok: ok, verdict: verdict,
    detail: 'staging DR environment note=' + recorded + ', live drill results recorded (outbox 10/10 + PROMOTE_OK + post-checks 6/6)=' + drills };
});

/* ── A-28 — RAM-authoritative control planes design documentation ── */
add('A-28', () => {
  const doc = READ('docs/design/control-plane-authority-mode.md');
  const ok = doc !== null && /authority mode/i.test(doc) && /control-plane|control plane/i.test(doc) && /_provincialStateStore/.test(doc);
  return { ok: ok, verdict: ok ? 'DOCS-OK' : 'DEFECT-OPEN',
    detail: 'authoritative design doc docs/design/control-plane-authority-mode.md = ' + (doc !== null) + (ok ? ' (obligation documented; implementation tracked in Phase 8.3/C2)' : ' — missing') };
});

/* ── A-29 — Roadmap/engine version reconciliation ── */
add('A-29', () => {
  const pkg = READ('package.json');
  const rm = READ('docs/ROADMAP.md');
  if (pkg === null || rm === null) throw new Error('package.json/ROADMAP.md missing');
  const engines = (pkg.match(/"node":\s*">=([\d]+)/) || [])[1];
  const roadmapNode = /Node\s*22/.test(rm);
  const ok = engines === '22' && roadmapNode;
  return { ok: ok, verdict: ok ? 'DOCS-OK' : 'DEFECT-OPEN',
    detail: 'engines.node>=' + engines + ', roadmap says Node 22=' + roadmapNode };
});

/* ═══ runner ═══ */
(async () => {
  console.log('==== LEGACY REVALIDATION (A-01..A-29) on current HEAD ====');
  let pass = 0, fail = 0;
  const cachedBatteries = new Map();
  const origAdd = CHECKS.map((c) => c);
  for (const c of origAdd) {
    try {
      const r = await c.fn();
      if (r.ok) pass++; else fail++;
      console.log(c.id + ' ' + r.verdict + ' — ' + r.detail);
    } catch (e) {
      fail++;
      console.log(c.id + ' FAIL — check crashed: ' + String(e.message || e).slice(0, 200));
    }
  }
  console.log('CHECKS ' + CHECKS.length + ' FAIL ' + fail);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('harness crashed: ' + (e && e.stack || e)); process.exit(1); });
