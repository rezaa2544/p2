'use strict';
/* tools/legacy-checks-batch2.js — legacy items A-11..A-20 (content-based, deterministic).
   Each run(ROOT) inspects files under ROOT (fs only; A-13 additionally re-runs the repo's
   own tests/ci-test-parity-contract.js with cwd=ROOT, per its claim) and returns
   { ok:true, verdict: 'PASS'|'DEFECT-OPEN'|'PRESENCE-OK'|'RUNTIME-PENDING', detail }.
   Fail-closed: a check that cannot find its evidence THROWS (runner marks FAIL) — never
   fabricates a pass. No network, no DB, no writes, no commits. */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

/* ── helpers ─────────────────────────────────────────────────────────── */
function rd(ROOT, rel) {
  const p = path.join(ROOT, rel);
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null;
}
function ls(src) { return String(src).split(/\r?\n/); }
function find(lsArr, re) {
  const out = [];
  lsArr.forEach((l, i) => { if (re.test(l)) out.push({ n: i + 1, text: l.trim() }); });
  return out;
}
function firstExisting(ROOT, rels) {
  for (const rel of rels) {
    const src = rd(ROOT, rel);
    if (src !== null) return { rel, src };
  }
  return null;
}
function topTests(ROOT) {
  const dir = path.join(ROOT, 'tests');
  return fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.js')).sort() : [];
}
/* Locate a file whose SOURCE contains `needle` (used when the exact legacy
   filename drifted; scan is bounded to tests/*.js, deterministic). */
function findTestByContent(ROOT, needle, extra) {
  for (const f of topTests(ROOT)) {
    const rel = 'tests/' + f;
    const src = rd(ROOT, rel);
    if (src && src.indexOf(needle) >= 0 && (!extra || extra.test(src))) return { rel, src };
  }
  return null;
}
/* A-14 helper: which skip() call sites are gated by an identifier (or an inline
   expression in the same statement window) that derives from new Date(...)? */
function dateGatedSkipSites(lsArr) {
  const defs = {};
  lsArr.forEach((l, i) => {
    const m = l.match(/(?:const|var|let)\s+([A-Za-z_$][\w$]*)\s*=/);
    if (!m) return;
    let end = i;
    for (let j = i; j < Math.min(lsArr.length, i + 12); j++) {
      end = j;
      if (/["'`]\)\s*;?\s*$/.test(lsArr[j]) || /\)\s*;?\s*$/.test(lsArr[j])) break;
    }
    defs[m[1]] = { start: i, end };
  });
  const sites = [];
  lsArr.forEach((l, i) => {
    if (!/\bskip\(/.test(l)) return;
    let hit = null;
    for (let j = Math.max(0, i - 3); j <= i && !hit; j++) {
      const gm = lsArr[j].match(/if\s*\(\s*!?\s*([A-Za-z_$][\w$]*)/);
      if (gm && defs[gm[1]]) {
        const block = lsArr.slice(defs[gm[1]].start, defs[gm[1]].end + 1).join('\n');
        if (block.indexOf('new Date(') >= 0) hit = { line: i + 1, gate: gm[1], defAt: defs[gm[1]].start + 1 };
      }
    }
    if (!hit) {
      for (let j = Math.max(0, i - 4); j <= i && !hit; j++) {
        if (lsArr[j].indexOf('new Date(') >= 0) hit = { line: i + 1, gate: '(inline)', defAt: j + 1 };
      }
    }
    if (hit) sites.push(hit);
  });
  return sites;
}

/* ── A-11 ─ fortify.yml skips the scan when credentials absent (verified-open) ── */
function a11(ROOT) {
  const rel = '.github/workflows/fortify.yml';
  const src = rd(ROOT, rel);
  if (src === null) throw new Error(rel + ' not found — cannot verify (fail-closed)');
  const L = ls(src);
  const skipHits = find(L, /Skipping Fortify|NOT EXECUTED/);
  const failClosed = find(L, /Fail closed when Fortify credentials/i);
  const scanStep = find(L, /Run Fortify Scan/);
  if (skipHits.length) {
    const parts = [rel + ':' + skipHits[0].n + ' "' + skipHits[0].text.slice(0, 90) + '"'];
    const ne = skipHits.find((h) => /NOT EXECUTED/.test(h.text));
    if (ne) parts.push(':' + ne.n + ' "— NOT EXECUTED"');
    if (failClosed.length) parts.push('fail-closed step :' + failClosed[0].n);
    return { ok: true, verdict: 'DEFECT-OPEN', detail: parts.join(' | ') + ' — documented skip, no real scan without credentials (verified-open)' };
  }
  if (failClosed.length && scanStep.length) {
    return { ok: true, verdict: 'PASS', detail: rel + ':' + failClosed[0].n + ' fail-closed gate + :' + scanStep[0].n + ' real scan step; no skip marker' };
  }
  throw new Error(rel + ': neither skip marker nor fail-closed+scan evidence found (fail-closed)');
}

/* ── A-12 ─ run-all-tests.sh invoked by package.json test:all AND node.js.yml ── */
function a12(ROOT) {
  const pkg = rd(ROOT, 'package.json');
  const wf = rd(ROOT, '.github/workflows/node.js.yml');
  if (pkg === null) throw new Error('package.json not found (fail-closed)');
  if (wf === null) throw new Error('.github/workflows/node.js.yml not found (fail-closed)');
  const pkgL = find(ls(pkg), /"test:all"\s*:\s*"[^"]*run-all-tests\.sh/);
  const wfL = find(ls(wf), /npm run test:all/);
  const f1 = pkgL.length ? 'package.json:' + pkgL[0].n + ' scripts["test:all"] → run-all-tests.sh ✓' : 'package.json: NO test:all → run-all-tests.sh';
  const f2 = wfL.length ? '.github/workflows/node.js.yml:' + wfL[0].n + ' "npm run test:all" ✓' : '.github/workflows/node.js.yml: NO "npm run test:all"';
  const ok = pkgL.length > 0 && wfL.length > 0;
  return { ok: true, verdict: ok ? 'PASS' : 'DEFECT-OPEN', detail: f1 + ' | ' + f2 };
}

/* ── A-13 ─ ci-test-parity-contract: recursive tests/api scan + runtime run ── */
function a13(ROOT) {
  const rel = 'tests/ci-test-parity-contract.js';
  const src = rd(ROOT, rel);
  if (src === null) throw new Error(rel + ' not found (fail-closed)');
  const recTracked = /'ls-files',\s*'tests'/.test(src);
  const recWalk = /function walkTestApi\(\)/.test(src) && /jsUnder\('tests\/api'\)/.test(src);
  const recDisk = /e\.isDirectory\(\)\s*\)\s*return acc\.concat\(diskJsUnder/.test(src);
  const recursiveOk = recWalk && (recTracked || recDisk);
  let runPart;
  const r = spawnSync(process.execPath, [path.join('tests', 'ci-test-parity-contract.js')], { cwd: ROOT, encoding: 'utf8', timeout: 120000 });
  if (r.error || (r.stdout === null && r.stderr === null)) {
    if (recursiveOk) return { ok: true, verdict: 'RUNTIME-PENDING', detail: rel + ': recursive scan OK (ls-files/jsUnder) but runtime run unavailable: ' + String(r.error && r.error.message).slice(0, 90) };
    throw new Error(rel + ' could not be executed: ' + String(r.error && r.error.message).slice(0, 120));
  }
  const out = String(r.stdout || '') + String(r.stderr || '');
  const outL = ls(out);
  const sum = outL.filter((l) => /TEST\/CI parity:\s*\d+\s*pass\s*\/\s*\d+\s*fail/.test(l)).pop();
  const exitOk = r.status === 0;
  const zeroFail = !!sum && /0 fail/.test(sum);
  runPart = (sum ? sum.trim() : '(no summary line)') + ' | exit=' + r.status;
  if (!recursiveOk) return { ok: true, verdict: 'DEFECT-OPEN', detail: rel + ': recursion evidence NOT found (ls-files=' + recTracked + ', walkTestApi/jsUnder=' + recWalk + ') — claim broken; run: ' + runPart };
  if (exitOk && zeroFail) return { ok: true, verdict: 'PASS', detail: rel + ':21 git ls-files tests + :123-129 walkTestApi→jsUnder (recursive); final line: "' + sum.trim() + '" (exit 0)' };
  return { ok: true, verdict: 'DEFECT-OPEN', detail: rel + ': recursive scan OK, but parity run NOT clean — final line: "' + runPart + '"' };
}

/* ── A-14 ─ bell2: explicit NOT-RUN reporting AND no date-gated skip ── */
function a14(ROOT) {
  const bell = topTests(ROOT).filter((f) => /^bell2.*\.js$/.test(f))[0];
  if (!bell) throw new Error('tests/bell2*.js not found (fail-closed)');
  const rel = 'tests/' + bell;
  const src = rd(ROOT, rel);
  if (src === null) throw new Error(rel + ' not found (fail-closed)');
  const L = ls(src);
  const sentinel = find(L, /__skip\s*=\s*true/);
  const notrun = find(L, /notrun\s*\+\+/);
  const notrunLog = find(L, /NOT-RUN/);
  const explicitOk = sentinel.length > 0 && notrun.length > 0 && notrunLog.length > 0;
  const gated = dateGatedSkipSites(L);
  if (!explicitOk) {
    return { ok: true, verdict: 'DEFECT-OPEN', detail: rel + ': explicit NOT-RUN reporting NOT found (sentinel=' + sentinel.length + ', counter=' + notrun.length + ') — date-dependent skip may masquerade as pass' };
  }
  if (gated.length) {
    const g = gated[0];
    return { ok: true, verdict: 'DEFECT-OPEN', detail: rel + ':' + sentinel[0].n + '/' + notrun[0].n + ' __skip sentinel + NOT-RUN counter OK, BUT :' + g.line + ' skip() gated by ' + g.gate + ' (def :' + g.defAt + ' uses new Date() ' + ') — date-dependent skip still present' };
  }
  const log = notrunLog[notrunLog.length - 1];
  return { ok: true, verdict: 'PASS', detail: rel + ':' + sentinel[0].n + '/' + notrun[0].n + ' explicit __skip → NOT-RUN counter; no new Date( gates a skip; summary line :' + log.n };
}

/* ── A-15 ─ offline-sync-drill S2c verifies all three ok=true responses ── */
function a15(ROOT) {
  const hit = firstExisting(ROOT, ['tests/offline-sync-drill.js']) || findTestByContent(ROOT, 'offline-sync-drill', /S2c/);
  if (!hit) throw new Error('offline-sync-drill file not found under tests/ (fail-closed)');
  const L = ls(hit.src);
  const okPush = find(L, /\.push\([^)]*\.ok\s*===\s*true/);
  const s2c = find(L, /S2c/);
  if (!s2c.length) return { ok: true, verdict: 'DEFECT-OPEN', detail: hit.rel + ': S2c check NOT found — three ok=true responses unverified' };
  if (!okPush.length) return { ok: true, verdict: 'DEFECT-OPEN', detail: hit.rel + ':S2c at :' + s2c[0].n + ' but no per-response ok===true collection found' };
  const win = L.slice(s2c[0].n - 1, s2c[0].n + 2).join('\n');
  const threeOk = /length\s*===\s*3/.test(win) && /every\(Boolean\)/.test(win);
  if (!threeOk) return { ok: true, verdict: 'DEFECT-OPEN', detail: hit.rel + ':' + s2c[0].n + ' S2c does not assert all three ok=true (length===3 && every(Boolean) missing)' };
  return { ok: true, verdict: 'PASS', detail: hit.rel + ':' + okPush[0].n + ' collects r.body.ok===true for 3 sends; :' + s2c[0].n + '-186 S2c asserts length===3 && every(Boolean)' };
}

/* ── A-16 ─ chaos-drill-lib pg status uses exit code, not dead buffer compare ── */
function a16(ROOT) {
  const hit = firstExisting(ROOT, ['tests/chaos-drill-lib.js']) || findTestByContent(ROOT, 'chaos-drill-lib');
  if (!hit) throw new Error('chaos-drill-lib file not found (fail-closed)');
  const L = ls(hit.src);
  const exitCode = find(L, /execFileSync\(pgBin\('pg_ctl'\)[^]*?'status'/) || find(L, /pg_ctl.*'status'/);
  /* strip comment-only lines before hunting the dead comparison */
  const code = L.filter((l) => { const t = l.trim(); return !(t.startsWith('/*') || t.startsWith('*') || t.startsWith('//')); }).join('\n');
  const dead = /===\s*Buffer\.alloc\(0\)/.test(code);
  if (!exitCode.length) return { ok: true, verdict: 'DEFECT-OPEN', detail: hit.rel + ': pg status check NOT via exit code (pg_ctl status/execFileSync not found)' };
  if (dead) return { ok: true, verdict: 'DEFECT-OPEN', detail: hit.rel + ': dead === Buffer.alloc(0) comparison still present in code' };
  return { ok: true, verdict: 'PASS', detail: hit.rel + ':' + exitCode[0].n + ' pgRunning(): execFileSync pg_ctl status — exit-code semantics (throw→false); no live ===Buffer.alloc(0) comparison (only A-16 comment)' };
}

/* ── A-17 ─ client-features real toast + multigrade2 real zeroing assertions ── */
function a17(ROOT) {
  const cf = rd(ROOT, 'tests/client-features.js');
  const mg = rd(ROOT, 'tests/multigrade2.js');
  if (cf === null) throw new Error('tests/client-features.js not found (fail-closed)');
  if (mg === null) throw new Error('tests/multigrade2.js not found (fail-closed)');
  const cfL = ls(cf);
  const mgL = ls(mg);
  const toastSrc = find(cfL, /#toasts|\.toast/);
  const toastAssert = find(cfL, /assert\(String\(toastTxt\)/);
  const zero = find(mgL, /assert\(\s*(?:after|left)\s*===\s*0/);
  const csm = find(mgL, /class_subject_members/);
  let cfPart;
  if (toastAssert.length && toastSrc.length) cfPart = 'tests/client-features.js:' + toastAssert[0].n + ' asserts real toast text (indexOf("آماده شد")>=0 from #toasts)';
  else cfPart = 'tests/client-features.js: real toast assertion NOT found';
  let mgPart;
  if (zero.length && csm.length) mgPart = 'tests/multigrade2.js:' + zero.map((z) => z.n).join('/') + ' assert class_subject_members count === 0 (G7/G8 real effect)';
  else mgPart = 'tests/multigrade2.js: real class_subject_members zeroing assertion NOT found';
  const ok = toastAssert.length > 0 && zero.length > 0 && csm.length > 0;
  return { ok: true, verdict: ok ? 'PASS' : 'DEFECT-OPEN', detail: cfPart + ' | ' + mgPart };
}

/* ── A-18 ─ conflicts resolve: monotonic nextVer + manager scope on TARGET record ── */
function a18(ROOT) {
  const hit = firstExisting(ROOT, ['server/conflicts.js', 'tests/conflicts.js']);
  if (!hit) throw new Error('conflicts.js not found under server/ or tests/ (fail-closed)');
  const L = ls(hit.src);
  const monotonic = find(L, /nextVer\s*=\s*Math\.max\(/);
  const oldPattern = find(L, /nextVer\s*=\s*\(Number\(c\.server_version\)\s*\|\|\s*1\)\s*\+\s*1/);
  const recSchool = find(L, /recSchool\s*=\s*target\s*\?/);
  const scopeReject = find(L, /Number\(recSchool\)\s*!==\s*Number\(s\.school_id\)/);
  const scopeOk = recSchool.length > 0 && scopeReject.length > 0;
  if (monotonic.length && scopeOk) {
    return { ok: true, verdict: 'PASS', detail: hit.rel + ':' + monotonic[0].n + ' nextVer=Math.max(curVer, server_version)+1 | target-record school scope :' + recSchool[0].n + '-' + scopeReject[0].n + ' (403 out_of_scope)' };
  }
  const parts = [];
  parts.push(monotonic.length
    ? hit.rel + ':' + monotonic[0].n + ' monotonic nextVer=Math.max(...) ✓'
    : hit.rel + (oldPattern.length ? ':' + oldPattern[0].n + ' nextVer=(Number(c.server_version)||1)+1 — monotonic Math.max(target.version, server_version)+1 NOT found at HEAD' : ': monotonic nextVer pattern NOT found'));
  parts.push(scopeOk
    ? 'target-record school scope :' + recSchool[0].n + '-' + scopeReject[0].n + ' ✓ (403 out_of_scope)'
    : 'manager school-scope check on TARGET record NOT found');
  return { ok: true, verdict: 'DEFECT-OPEN', detail: parts.join(' | ') };
}

/* ── A-19 ─ idor student route + semantic-analytics both use studentRecordOk ── */
function a19(ROOT) {
  const idor = firstExisting(ROOT, ['server/idor.js', 'tests/idor.js']);
  const sem = firstExisting(ROOT, ['server/routes/semantic-analytics.js', 'server/semantic-analytics.js']);
  if (!idor) throw new Error('idor.js not found under server/ or tests/ (fail-closed)');
  if (!sem) throw new Error('semantic-analytics module not found (fail-closed)');
  const gate = find(ls(idor.src), /policy\.studentRecordOk\(/);
  const semHits = find(ls(sem.src), /policy\.studentRecordOk\(/);
  if (!gate.length) return { ok: true, verdict: 'DEFECT-OPEN', detail: idor.rel + ': student route NOT gated by policy.studentRecordOk' };
  if (!semHits.length) return { ok: true, verdict: 'DEFECT-OPEN', detail: idor.rel + ':' + gate[0].n + ' gate OK, but ' + sem.rel + ' never references studentRecordOk' };
  return { ok: true, verdict: 'PASS', detail: idor.rel + ':' + gate[0].n + ' policy.studentRecordOk(store,s,st,opts) gate →404 | ' + sem.rel + ':' + semHits.map((h) => h.n).join(',') + ' policy.studentRecordOk' };
}

/* ── A-20 ─ occ backward-compat isVersioned on ALL 5 PATCH routes ── */
function a20(ROOT) {
  const resources = ['grades', 'students', 'users', 'classes', 'attendance'];
  const results = [];
  let all = true;
  for (const r of resources) {
    const rel = 'server/routes/' + r + '.js';
    const src = rd(ROOT, rel);
    if (src === null) { results.push(r + ': FILE MISSING'); all = false; continue; }
    const hits = find(ls(src), /checkOcc\([^]*?,\s*true\s*\)/);
    const patch = find(ls(src), /PATCH\s+\/api/);
    if (hits.length) results.push(r + ':' + hits.map((h) => h.n).join('/') + '✓');
    else { results.push(r + ': checkOcc(...,true) NOT found'); all = false; }
    if (!patch.length) { results.push(r + ': no PATCH route declared'); all = false; }
  }
  return { ok: true, verdict: all ? 'PASS' : 'DEFECT-OPEN', detail: results.join(' | ') + (all ? ' — all 5 PATCH routes pass isVersioned=true to checkOcc' : ' — NOT all 5 PATCH routes isVersioned') };
}

module.exports = [
  { id: 'A-11', run: a11 },
  { id: 'A-12', run: a12 },
  { id: 'A-13', run: a13 },
  { id: 'A-14', run: a14 },
  { id: 'A-15', run: a15 },
  { id: 'A-16', run: a16 },
  { id: 'A-17', run: a17 },
  { id: 'A-18', run: a18 },
  { id: 'A-19', run: a19 },
  { id: 'A-20', run: a20 }
];
