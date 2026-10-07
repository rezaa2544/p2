/**
 * tools/peb-runner-v2.js — Payesh Experience Benchmark runner (v2)
 *
 * Differences from v1:
 *   - APPEND-ONLY results (Rule 5: no overwrite). Every run gets a RUN_ID and
 *     is appended to results.jsonl. Nothing is ever overwritten.
 *   - RETRY: infrastructure failures (API 502 / ECONNRESET / timeout) are
 *     retried up to N times and counted as INFRA_FAILURE, never as a model
 *     failure (Rule 6).
 *   - PATCH_FAIL classification (Rule 7): A..F so a patch-syntax failure is
 *     never read as a reasoning failure.
 *   - Retrieval leakage is measured, not assumed (Rule 2).
 *   - 3 valid runs per case+arm before a cell is considered complete (Rule 5).
 *
 * Usage:
 *   node peb-runner-v2.js <mode> [--cases=PEB-01,PEB-02] [--runs=3]
 *     mode = baseline | plus-retrieval | ablation-irrelevant | all
 */
'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const { execSync, execFileSync } = require('child_process');

const REPO = 'C:/Users/R.M/.zcode/workspace/default/p2';
const BENCH = 'C:/Users/R.M/AppData/Local/Temp/peb-bench';
const STORE = path.join(REPO, 'tools', 'experience-store.js');
const RESULTS = path.join(BENCH, 'results.jsonl');
const API_KEY = process.env.HERMES_CUSTOM_ATRIA_DAWN_PREVIEW_API_KEY || process.env.COUCOU_API_KEY;
const MODEL = 'Atria-Dawn-Preview';
// The Atria provider retired the OpenAI-format endpoint; the same key works
// on the Anthropic-format /v1/messages endpoint.
const API_URL = 'https://api.atria-asi.ai/v1/messages';

if (!API_KEY) { console.error('missing API key env'); process.exit(2); }

const CASES = require(path.join(REPO, 'tools', 'experience-benchmark-cases.js'));

// ------------------------------------------------------------------ helpers
const tokens = (s) => (s || '').match(/\S+/g) || [];
const run = (cmd, cwd, timeout) => {
  try {
    return { ok: true, out: execSync(cmd, { cwd: cwd || REPO, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: timeout || 120000 }) };
  } catch (e) { return { ok: false, out: String((e.stdout || e.stderr || e.message) || '') }; }
};

// classify a PATCH_FAIL into Rule 7 buckets
function classifyPatchFail(errText, diffText) {
  const t = String(errText || '');
  if (/CRLF|line ending|\r\n/i.test(t)) return 'D-CRLF';
  if (/corrupt patch/i.test(t)) return 'B-syntax';
  if (/does not apply|patch failed/i.test(t)) return 'C-path';
  if (/ENOENT|no such file/i.test(t)) return 'C-path';
  return 'A-reasoning'; // applied cleanly but the patch was semantically wrong
}
const isInfra = (e) => /API 5\d\d|timeout|upstream_unavailable|ECONNRESET|socket hang up|ECONNREFUSED|Protocol .* not supported/i.test(String(e || ''));

// ------------------------------------------------------------------ api
function apiChat(messages, maxTokens) {
  // Anthropic-format request body for /v1/messages
  const body = JSON.stringify({ model: MODEL, messages, max_tokens: maxTokens || 16384, temperature: 0.2 });
  const attempt = () => new Promise((resolve, reject) => {
    const req = (API_URL.startsWith('https') ? https : http).request(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY, 'anthropic-version': '2023-06-01', 'Content-Length': Buffer.byteLength(body) },
      timeout: 360000,
    }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        if (res.statusCode !== 200) return reject(new Error(`API ${res.statusCode}: ${data.slice(0, 200)}`));
        try {
          const j = JSON.parse(data);
          // Anthropic format: content[] blocks, text blocks carry the answer.
          // Thinking blocks are excluded — only the final text block is the patch.
          const blocks = Array.isArray(j.content) ? j.content : [];
          const text = blocks.filter(b => b && b.type === 'text').map(b => b.text).join('\n');
          resolve({ text: text || '', finish: j.stop_reason });
        } catch (e) { reject(new Error('bad json: ' + data.slice(0, 200))); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.write(body);
    req.end();
  });
  return (async () => {
    for (let i = 0; i < 2; i++) {
      try { return await attempt(); }
      catch (e) { if (!isInfra(e.message) || i === 1) throw e; await new Promise(r => setTimeout(r, 5000)); }
    }
    throw new Error('unreachable');
  })();
}

// ------------------------------------------------------------------ probes
function buildProbe(c, wt) {
  const q = (file, code) => `node -e "${code.replace(/"/g, '\\"')}"`;
  const F = c.scope;
  switch (c.id) {
    case 'PEB-01':
      return q(F, `const s=require('fs').readFileSync('${F}','utf8');
        if(/DEV_OTP_BYPASS[^;]*!==\\\\s*'0'/.test(s)){process.exit(1);}
        if(!/===\\\\s*'1'/.test(s)){process.exit(1);}
        process.exit(0);`);
    case 'PEB-02':
      return q(F, `const s=require('fs').readFileSync('${F}','utf8');
        if(!/exitCode\\\\s*===\\\\s*null/.test(s)){process.exit(1);}
        process.exit(0);`);
    case 'PEB-03':
      return q(F, `const s=require('fs').readFileSync('${F}','utf8');
        if(!/redis\\\\.ping|rdp\\\\.ok|redisOk/.test(s)){process.exit(1);}
        if(/isHealthy\\\\s*=\\\\s*rdy/.test(s)){process.exit(1);}
        process.exit(0);`);
    case 'PEB-04':
      return q(F, `const s=require('fs').readFileSync('${F}','utf8');
        if(!/splitSql|splitStatements|dollar|\\\\$\\\\$|multi-?statement/i.test(s)){process.exit(1);}
        if(!/pg.?client|Client|fallback|unavailable/i.test(s)){process.exit(1);}
        process.exit(0);`);
    case 'PEB-05':
      return q(F, `const s=require('fs').readFileSync('${F}','utf8');
        if(!/userInvQueue|invalidateUser/.test(s)){process.exit(1);}
        process.exit(0);`);
    case 'PEB-06':
      return q(F, `const s=require('fs').readFileSync('${F}','utf8');
        const m=s.indexOf('clusterRetryStrategy');
        if(m<0){process.exit(1);}
        const w=s.slice(m, m+260);
        if(/return\\\\s+null/.test(w)){process.exit(1);}
        process.exit(0);`);
    case 'PEB-07':
      return q(F, `const s=require('fs').readFileSync('${F}','utf8');
        if(!/\\\\.\\\\.[/\\\\\\\\]/.test(s)&&!/DOTDOT/.test(s)){process.exit(1);}
        if(!/ALLOWED_SNAP_PATHS|SNAP_PATH_RE|allow-?list|whitelist/i.test(s)){process.exit(1);}
        process.exit(0);`);
    case 'PEB-08':
      return q(F, `const s=require('fs').readFileSync('${F}','utf8');
        if(/require\\\\(path\\\\.join/.test(s)){process.exit(1);}
        if(!/require\\\\(['\\\"]\\\\.\\\\/?/.test(s)){process.exit(1);}
        process.exit(0);`);
    case 'PEB-09':
      return q(F, `const s=require('fs').readFileSync('${F}','utf8');
        if(!/GRADE_ORDINALS/.test(s)){process.exit(1);}
        if(!/'دهم'/.test(s)){process.exit(1);}
        if(!/k === 'grade'/.test(s)){process.exit(1);}
        process.exit(0);`);
    case 'PEB-10':
      return q(F, `const s=require('fs').readFileSync('${F}','utf8');
        if(!/PAYESH_OTP_PEPPER/.test(s)){process.exit(1);}
        if(/PAYESH_OTP_PEPPER['\\\"]?\\s*[:=]\\s*['\\\"]\\s*['\\\"]/.test(s)){process.exit(1);}
        process.exit(0);`);
    default:
      return null;
  }
}

// retrieval leakage probe (Rule 2): does retrieved text contain the answer?
function leakageCheck(retrieved, c) {
  if (!retrieved || retrieved.trim() === 'EMPTY_RETRIEVAL') return { leaked: false, kind: 'none' };
  const t = String(retrieved);
  const fixSha = String(c.fix_commit || '').slice(0, 8);
  const hits = [];
  if (fixSha && fixSha.length >= 7 && t.includes(fixSha)) hits.push('fix_sha');
  // solution-shaped identifiers from the real fix
  const solMarkers = {
    'PEB-01': ["=== '1'", 'DEV_OTP_BYPASS'],
    'PEB-02': ['exitCode === null'],
    'PEB-03': ['redisOk', 'redis.ping'],
    'PEB-04': ['splitSql', 'splitStatements'],
    'PEB-05': ['userInvQueue', 'invalidateUser'],
    'PEB-06': ['clusterRetryStrategy'],
    'PEB-07': ['ALLOWED_SNAP_PATHS', 'SNAP_PATH_RE'],
    'PEB-08': ["require('../server"],
    'PEB-09': ['GRADE_ORDINALS', "'دهم'"],
    'PEB-10': ['PAYESH_OTP_PEPPER', 'otp-ratelimit-shared-pepper'],
  };
  for (const m of (solMarkers[c.id] || [])) if (t.includes(m)) hits.push(m);
  return { leaked: hits.length > 0, kind: hits.join(',') || 'none' };
}

// ------------------------------------------------------------------ repair
// (imported from v1 logic: recompute hunk counts + re-anchor by context)
function repairHunks(patchText, targetAbs) {
  let fileLines = [];
  try { fileLines = fs.readFileSync(targetAbs, 'utf8').split(/\r?\n/); }
  catch { return null; }
  const norm2 = (s) => String(s || '').replace(/\s+$/, '');
  const lines = patchText.split('\n');
  const out = [];
  let i = 0;
  let prevOldEnd = 0;
  const headers = [];
  let sawHeader = false;
  while (i < lines.length) {
    if (/^diff --git/.test(lines[i])) { out.push(lines[i]); sawHeader = true; i++; continue; }
    if (/^(---|\+\+\+) /.test(lines[i])) { out.push(lines[i]); i++; continue; }
    const m = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(lines[i]);
    if (!m) { i++; continue; }
    const j = i + 1;
    const clean = [];
    for (let k = j; k < lines.length; k++) {
      const t = lines[k][0];
      if (t === '+' || t === '-' || t === ' ') clean.push(lines[k]);
      else break;
    }
    if (!clean.length) { i = j; continue; }
    let ctx = 0, add = 0, del = 0;
    for (const b of clean) { const t = b[0]; if (t === '+') add++; else if (t === '-') del++; else ctx++; }

    const oldPrefix = [];
    for (const b of clean) { const t = b[0]; if (t === ' ' || t === '-') oldPrefix.push(b.slice(1)); else break; }
    const hay = fileLines.map(norm2);
    let oldStart = -1;
    const hint = parseInt(m[1], 10) - 1;
    const findFrom = (startK) => {
      for (let k = startK; k <= fileLines.length - oldPrefix.length; k++) {
        let ok = true;
        for (let d = 0; d < oldPrefix.length; d++) { if (hay[k + d] !== norm2(oldPrefix[d])) { ok = false; break; } }
        if (ok) return k;
      }
      return -1;
    };
    if (oldPrefix.length) {
      for (let k = Math.min(hint, fileLines.length - oldPrefix.length); k >= prevOldEnd; k--) {
        let ok = true;
        for (let d = 0; d < oldPrefix.length; d++) { if (hay[k + d] !== norm2(oldPrefix[d])) { ok = false; break; } }
        if (ok) { oldStart = k + 1; break; }
      }
      if (oldStart < 0) { const f = findFrom(Math.max(hint, prevOldEnd)); if (f >= 0) oldStart = f + 1; }
      if (oldStart < 0) { const f = findFrom(prevOldEnd); if (f >= 0) oldStart = f + 1; }
      if (oldStart < 0) {
        let best = oldPrefix.reduce((a, b) => (b.trim().length > a.trim().length ? b : a), '');
        for (let k = prevOldEnd; k < fileLines.length; k++) { if (hay[k] === norm2(best)) { oldStart = k + 1; break; } }
      }
    }
    if (oldStart < 0) { i = j; continue; }

    let validated = [];
    let fi = oldStart - 1;
    for (const b of clean) {
      const t = b[0];
      if (t === '+') { validated.push(b); continue; }
      if (t === '-') { if (fi < fileLines.length && norm2(fileLines[fi]) === norm2(b.slice(1))) { validated.push(b); fi++; } continue; }
      if (fi < fileLines.length && norm2(fileLines[fi]) === norm2(b.slice(1))) { validated.push(b); fi++; }
    }
    let vctx = 0, vadd = 0, vdel = 0;
    for (const b of validated) { const t = b[0]; if (t === '+') vadd++; else if (t === '-') vdel++; else vctx++; }
    if (vctx + vadd + vdel === 0) { i = j; continue; }
    const vneedle = (() => { for (const b of validated) { const t = b[0]; if (t === ' ' || t === '-') return b.slice(1); } return null; })();
    let vStart = -1;
    if (vneedle !== null) {
      for (let k = Math.min(oldStart - 1, fileLines.length - 1); k >= prevOldEnd; k--) { if (norm2(fileLines[k]) === norm2(vneedle)) { vStart = k + 1; break; } }
      if (vStart < 0) for (let k = Math.max(oldStart - 1, prevOldEnd); k < fileLines.length; k++) { if (norm2(fileLines[k]) === norm2(vneedle)) { vStart = k + 1; break; } }
      if (vStart < 0) for (let k = prevOldEnd; k < fileLines.length; k++) { if (norm2(fileLines[k]) === norm2(vneedle)) { vStart = k + 1; break; } }
    }
    if (vStart < 0) { i = j; continue; }
    const newStartHint = parseInt(m[3], 10);
    const oldCount = vctx + vdel;
    const newCount = vctx + vadd;
    const newStart = newStartHint > 0 ? newStartHint : vStart;
    out.push(`@@ -${vStart},${oldCount} +${newStart},${newCount} @@`);
    for (const b of validated) out.push(b);
    prevOldEnd = vStart + oldCount;
    i = j;
  }
  if (!sawHeader || out.length < 4) return null;
  return out.join('\n') + '\n';
}

// ------------------------------------------------------------------ one run
function appendResult(rec) {
  try { fs.appendFileSync(RESULTS, JSON.stringify(rec) + '\n', 'utf-8'); } catch (e) { /* */ }
}

async function oneRun(c, arm, runNo, attemptNo) {
  const runId = `${c.id}-${arm === 'baseline' ? 'A' : arm === 'plus-retrieval' ? 'B' : arm === 'ablation-irrelevant' ? 'C' : 'X'}-R${String(runNo).padStart(2, '0')}${attemptNo && attemptNo > 1 ? '#' + attemptNo : ''}`;
  const rec = {
    run_id: runId, case_id: c.id, category: c.category, arm, run_no: runNo, attempt_no: attemptNo || 1,
    started_at: new Date().toISOString(), head: null,
    retrieval: 'NONE', retrieved_ids: [], leakage: null,
    model_calls: 0, tokens_in: 0, tokens_out: 0, finish_reason: null,
    patch_applied: null, patch_error: null, patch_fail_class: null,
    changed_files: 0, scope_ok: null, forbidden_ok: null, secret_ok: null,
    tests_pass: null, test_harness: null, probe_pass: null, probe_out: null,
    diff_similarity: 0, duration_ms: 0, outcome: null, infra_failure: false,
  };
  const t0 = Date.now();
  try { rec.head = execSync('git rev-parse HEAD', { cwd: REPO, encoding: 'utf8' }).trim(); } catch { /* */ }

  const wt = path.join(BENCH, `${runId}-wt`);
  try { fs.rmSync(wt, { recursive: true, force: true }); } catch { /* */ }
  try { run(`git worktree remove --force "${wt}"`, REPO); } catch { /* */ }
  try { run(`git worktree prune`, REPO); } catch { /* */ }
  const wtr = run(`git worktree add --detach "${wt}" ${c.start}`, REPO);
  if (!wtr.ok) { rec.outcome = 'WORKTREE_FAIL'; rec.duration_ms = Date.now() - t0; appendResult(rec); return rec; }

  const nm = path.join(wt, 'node_modules');
  if (!fs.existsSync(nm)) { try { fs.cpSync(path.join(REPO, 'node_modules'), nm, { recursive: true, force: true }); } catch { /* */ } }
  const sd = path.join(wt, 'server', 'data');
  try { fs.mkdirSync(sd, { recursive: true }); fs.cpSync(path.join(REPO, 'server', 'data', 'payesh.json'), path.join(sd, 'payesh.json'), { force: true }); } catch { /* */ }

  try {
    // retrieval
    let retrieved = '';
    if (arm === 'plus-retrieval' || arm === 'ablation-irrelevant') {
      if (arm === 'ablation-irrelevant') {
        // Arm C: identical prompt-size inflation with NO engineering content.
        // If C ≈ B, retrieval is just prompt padding; if C ≈ A, content matters.
        retrieved = JSON.stringify([
          { experience_id: 'ABLATION-FILLER-001', problem_class: 'filler', reusable_pattern: 'Consider the operational environment before changing code.', anti_pattern: 'None.', severity: 'low', confidence: 0.5, head_status: 'HEAD_INDEPENDENT' },
          { experience_id: 'ABLATION-FILLER-002', problem_class: 'filler', reusable_pattern: 'Review existing tests where available.', anti_pattern: 'None.', severity: 'low', confidence: 0.5, head_status: 'HEAD_INDEPENDENT' },
          { experience_id: 'ABLATION-FILLER-003', problem_class: 'filler', reusable_pattern: 'Prefer minimal changes over rewrites.', anti_pattern: 'None.', severity: 'low', confidence: 0.5, head_status: 'HEAD_INDEPENDENT' },
        ], null, 1);
        rec.retrieval = 'IRRELEVANT';
        try { rec.retrieved_ids = JSON.parse(retrieved).map(e => e.experience_id); } catch { /* */ }
        rec.leakage = { leaked: false, kind: 'irrelevant-filler' };
      } else {
        try {
          retrieved = execFileSync('node', [STORE, 'get', `${c.category} ${c.scope} false-green verification evidence`],
            { cwd: REPO, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
          rec.retrieval = retrieved.trim() === 'EMPTY_RETRIEVAL' ? 'EMPTY' : 'RETRIEVED';
          try { rec.retrieved_ids = (JSON.parse(retrieved)).map(e => e.experience_id); } catch { /* */ }
          rec.leakage = leakageCheck(retrieved, c);
        } catch { rec.retrieval = 'EMPTY'; }
      }
    }

    const targetRel = c.scope;
    const targetAbs = path.join(wt, targetRel);
    let fileContent = '';
    try { fileContent = fs.readFileSync(targetAbs, 'utf8'); } catch { rec.outcome = 'NO_TARGET_FILE'; rec.duration_ms = Date.now() - t0; appendResult(rec); return rec; }

    const lines = fileContent.split('\n');
    const numbered = lines.map((l, i) => `${String(i + 1).padStart(5)}| ${l}`).join('\n');
    const sys = 'You are a patch generator. Output ONLY a machine-applicable unified diff. ' +
      'First line must be "diff --git". No prose, no explanation, no markdown fences. ' +
      'Every line after the headers starts with "+", "-", " ", "@@", "---", "+++", or "diff". ' +
      'If you need to think, do not output the thinking. Only the diff.';
    let user = `DEFECT: ${c.prompt}\n\nFORBIDDEN SHORTCUTS: ${c.forbidden.join('; ')}\n\nFILE ${targetRel} (${lines.length} lines):\n\n${numbered}`;
    if ((arm === 'plus-retrieval' && rec.retrieval === 'RETRIEVED') || arm === 'ablation-irrelevant') {
      user = `RELEVANT VERIFIED ENGINEERING EXPERIENCE (apply these lessons):\n${retrieved.slice(0, 6000)}\n\n---\n\n${user}`;
    }
    rec.tokens_in = tokens(user).length;

    rec.model_calls = 1;
    let reply = '';
    try {
      const r = await apiChat([{ role: 'system', content: sys }, { role: 'user', content: user }], 16384);
      reply = r.text || '';
      rec.finish_reason = r.finish;
      rec.tokens_out = tokens(reply).length;
    } catch (e) {
      rec.infra_failure = isInfra(e.message);
      rec.outcome = rec.infra_failure ? 'INFRA_FAILURE' : 'API_ERROR';
      rec.patch_error = String(e.message).slice(0, 200);
      rec.duration_ms = Date.now() - t0;
      appendResult(rec);
      return rec;
    }
    if (!reply || !reply.trim()) { rec.outcome = 'EMPTY_REPLY'; rec.infra_failure = true; rec.duration_ms = Date.now() - t0; appendResult(rec); return rec; }

    let diffText = reply.trim().replace(/^```[a-zA-Z]*\n?/, '').replace(/```$/, '').trim();
    const diffStart = diffText.indexOf('diff --git');
    if (diffStart > 0) diffText = diffText.slice(diffStart);
    else if (diffText.indexOf('@@') >= 0 && !diffText.startsWith('diff --git')) {
      diffText = `diff --git a/${targetRel} b/${targetRel}\n--- a/${targetRel}\n+++ b/${targetRel}\n` + diffText;
    }
    const hunks = diffText.split('\n');
    let lastHunk = -1;
    for (let i = 0; i < hunks.length; i++) if (hunks[i].startsWith('@@')) lastHunk = i;
    if (lastHunk >= 0) {
      let end = hunks.length;
      for (let i = lastHunk + 1; i < hunks.length; i++) {
        const l = hunks[i];
        if (l && !/^[+\-\\ ]/.test(l) && !l.startsWith('No newline') && !/^@@/.test(l)) { end = i; break; }
      }
      diffText = hunks.slice(0, end).join('\n');
    }
    diffText = diffText.split('\n').filter(l => !l.trim().startsWith('```')).join('\n').trim();
    const repaired = repairHunks(diffText, targetAbs);
    if (repaired) diffText = repaired;

    const patchPath = path.join(wt, 'peb-delivered.patch');
    fs.writeFileSync(patchPath, diffText, 'utf8');
    let applyOk = false, applyErr = '';
    const a1 = run(`git -C . apply --whitespace=nowarn peb-delivered.patch`, wt);
    if (a1.ok) applyOk = true;
    else { applyErr = String(a1.out).slice(0, 200); const a2 = run(`git -C . apply --whitespace=fix peb-delivered.patch`, wt); if (a2.ok) applyOk = true; else applyErr = String(a2.out).slice(0, 200); }
    rec.patch_applied = applyOk;
    if (!applyOk) {
      rec.patch_error = applyErr;
      rec.patch_fail_class = classifyPatchFail(applyErr, diffText);
      rec.outcome = 'PATCH_FAIL';
      rec.duration_ms = Date.now() - t0;
      appendResult(rec);
      return rec;
    }

    const diff = run('git -C . diff --unified=0', wt).out || '';
    const changed = diff.split('\n').filter(l => l.startsWith('+++ ')).map(l => l.slice(4).trim().replace(/^[ab]\//, ''));
    rec.changed_files = changed.length;
    rec.scope_ok = changed.length > 0 && changed.every(f => f === c.scope || (f.startsWith('tests/') && f.endsWith('.js')));
    rec.forbidden_ok = c.forbidden.every(f => !diff.includes(f));
    rec.secret_ok = !/gh[pousr]_[A-Za-z0-9]{36,}|AKIA[0-9A-Z]{16}|eyJ[A-Za-z0-9_\-]{10,}\./.test(diff);

    const fixDiff = (() => { try { return execSync(`git -C "${REPO}" show ${c.fix_commit} -- ${c.scope}`, { encoding: 'utf8', timeout: 30000 }); } catch { return ''; } })();
    // overlap metric: shared non-space diff lines
    const a = new Set(diff.split('\n').map(l => l.replace(/\s+/g, ' ').trim()).filter(l => l && !l.startsWith('index') && !l.startsWith('diff') && !l.startsWith('---') && !l.startsWith('+++')));
    const b = new Set(fixDiff.split('\n').map(l => l.replace(/\s+/g, ' ').trim()).filter(l => l && !l.startsWith('index') && !l.startsWith('diff') && !l.startsWith('---') && !l.startsWith('+++')));
    let inter = 0; for (const x of a) if (b.has(x)) inter++;
    rec.diff_similarity = a.size ? Math.round(inter / a.size * 1000) / 10 : 0;

    const tr = run('node tests/run.js', wt, 300000);
    rec.tests_pass = !!tr.ok;
    rec.test_harness = 'tests/run.js';

    const probe = buildProbe(c, wt);
    if (probe) { const pr = run(probe, wt, 60000); rec.probe_pass = !!pr.ok; rec.probe_out = String(pr.out).split('\n').filter(Boolean).slice(-1)[0] || ''; }

    rec.outcome = (rec.tests_pass && rec.scope_ok && rec.forbidden_ok && rec.secret_ok && rec.probe_pass !== false) ? 'PASS' : 'FAIL';
  } catch (err) {
    rec.outcome = 'ERROR';
    rec.patch_error = String(err.message).slice(0, 300);
  }
  rec.duration_ms = Date.now() - t0;
  appendResult(rec);
  console.log(`[done] ${runId} -> ${rec.outcome} probe=${rec.probe_pass} sim=${rec.diff_similarity} dur=${rec.duration_ms}ms`);
  return rec;
}

// ------------------------------------------------------------------ main
async function main() {
  const mode = process.argv[2] || 'baseline';
  const onlyArg = process.argv.find(a => a.startsWith('--cases'));
  const onlyIds = onlyArg ? onlyArg.slice(onlyArg.indexOf('=') + 1).split(',').filter(Boolean) : [];
  const runsArg = process.argv.find(a => a.startsWith('--runs'));
  const wantRuns = runsArg ? parseInt(runsArg.slice(runsArg.indexOf('=') + 1), 10) : 3;
  if (!['baseline', 'plus-retrieval', 'ablation-irrelevant', 'all', 'ablation'].includes(mode)) { console.error('mode must be baseline | plus-retrieval | ablation-irrelevant | all | ablation'); process.exit(1); }

  const cases = onlyIds.length ? CASES.filter(c => onlyIds.includes(c.id)) : CASES;
  const arms = mode === 'all' ? ['baseline', 'plus-retrieval'] : mode === 'ablation' ? ['ablation-irrelevant'] : [mode];

  // read what we already have so we only run what is missing (append-only)
  const have = {};
  try { if (fs.existsSync(RESULTS)) for (const ln of fs.readFileSync(RESULTS, 'utf8').split('\n')) { if (!ln.trim()) continue; const r = JSON.parse(ln); if (r.outcome !== 'INFRA_FAILURE') have[`${r.case_id}|${r.arm}`] = (have[`${r.case_id}|${r.arm}`] || 0) + 1; } } catch { /* */ }

  const seen = {};
  try { if (fs.existsSync(RESULTS)) for (const ln of fs.readFileSync(RESULTS, 'utf8').split('\n')) { if (!ln.trim()) continue; const r = JSON.parse(ln); seen[r.run_id] = (seen[r.run_id] || 0) + 1; } } catch { /* */ }

  for (const c of cases) {
    for (const arm of arms) {
      for (let n = 1; n <= wantRuns; n++) {
        const got = have[`${c.id}|${arm}`] || 0;
        if (got >= n) continue;
        // unique RUN_ID: increment the attempt suffix until unused (Rule 5)
        let attempt = 1;
        let baseId = `${c.id}-${arm === 'baseline' ? 'A' : arm === 'plus-retrieval' ? 'B' : arm === 'ablation-irrelevant' ? 'C' : 'X'}-R${String(n).padStart(2, '0')}`;
        while (seen[`${baseId}#${attempt}`] || seen[baseId]) { attempt++; }
        await oneRun(c, arm, n, attempt);
      }
    }
  }
  console.log('[runner-v2] all requested runs complete');
}

main().catch(e => { console.error('FATAL', e); process.exit(1); });
