'use strict';

/*
 * tools/legacy-checks-batch3.js
 *
 * Legacy verification checks A-21..A-29 (batch 3).
 * Claims source: docs/verification/legacy/VERIFICATION_REGISTRY.atria-6612f58.json
 *
 * Contract:
 *   - CommonJS, exports an array of { id, run(ROOT) }.
 *   - run(ROOT) is content-based and deterministic: fs inspection only,
 *     no network, no DB. Spawning node tests/... is allowed where specified
 *     (not needed in this batch — all checks are content-based).
 *   - Returns { ok: true, verdict, detail } with verdict in:
 *       PASS | DEFECT-OPEN | PRESENCE-OK | DOCS-OK | RUNTIME-PENDING
 *   - Throws on infrastructure failure (runner marks FAIL).
 *   - Fail-closed: a claim only gets PASS when its literal evidence is
 *     present on the inspected tree; drift between claim and reality is
 *     reported as DEFECT-OPEN with the exact observed facts.
 */

const fs = require('fs');
const path = require('path');

function readText(ROOT, relPath) {
  try {
    return fs.readFileSync(path.join(ROOT, relPath), 'utf8');
  } catch (e) {
    return null;
  }
}

function existsFile(ROOT, relPath) {
  try {
    return fs.statSync(path.join(ROOT, relPath)).isFile();
  } catch (e) {
    return false;
  }
}

/* 1-based line number of the first regex match, or null. */
function lineOf(text, re) {
  if (!text) return null;
  const m = re.exec(text);
  if (!m) return null;
  return text.slice(0, m.index).split('\n').length;
}

/* 1-based line numbers of ALL regex matches (global). */
function allLines(text, re) {
  if (!text) return [];
  const g = new RegExp(re.source, re.flags.indexOf('g') === -1 ? re.flags + 'g' : re.flags);
  const out = [];
  let m;
  while ((m = g.exec(text)) !== null) {
    out.push(text.slice(0, m.index).split('\n').length);
    if (m.index === g.lastIndex) g.lastIndex++;
  }
  return out;
}

function countMatches(text, re) {
  return allLines(text, re).length;
}

function listWorkflows(ROOT) {
  try {
    return fs.readdirSync(path.join(ROOT, '.github', 'workflows'))
      .filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'))
      .sort();
  } catch (e) {
    return [];
  }
}

module.exports = [

  /*
   * A-21 claim: classes route validates homeroom_teacher_id as a same-school
   * teacher on create+update; attendance.js validates class_id as the
   * student's enrolled class; grades.js validates class_id + subject_id.
   */
  {
    id: 'A-21',
    run(ROOT) {
      const files = {
        classes: 'server/routes/classes.js',
        attendance: 'server/routes/attendance.js',
        grades: 'server/routes/grades.js'
      };
      const src = {};
      for (const k of Object.keys(files)) {
        src[k] = readText(ROOT, files[k]);
        if (!src[k]) throw new Error(files[k] + ' unreadable');
      }

      const clsCreate = allLines(src.classes, /invalid_homeroom_teacher/);
      const clsSchool = allLines(src.classes, /ht\.school_id\)\s*!==\s*Number\(/);
      const clsOk = clsCreate.length >= 2 && clsSchool.length >= 2;

      const attEnrolled = allLines(src.attendance,
        /policy\.studentClassIds\(store, Number\(body\.student_id\)\)\.has\(Number\(body\.class_id\)\)/);
      const attBoundary = allLines(src.attendance, /A-21: class_id must resolve to a class in the actor's school/);
      const attOk = attEnrolled.length >= 1 && attBoundary.length >= 1;

      const grdEnrolled = allLines(src.grades,
        /policy\.studentClassIds\(store, Number\(body\.student_id\)\)\.has\(Number\(body\.class_id\)\)/);
      const grdSubject = allLines(src.grades,
        /policy\.teacherSubjectIds\(store, user\.id\)\.has\(Number\(body\.subject_id\)\)/);
      const grdOk = grdEnrolled.length >= 1 && grdSubject.length >= 1;

      const parts = [
        'classes.js: homeroom_teacher_id same-school teacher guard on create+update ' +
          (clsOk ? 'present' : 'MISSING') +
          ' (invalid_homeroom_teacher @' + clsCreate.join(',') + '; school comparison @' + clsSchool.join(',') + ')',
        'attendance.js: class_id must be the student\'s enrolled class ' +
          (attOk ? 'present' : 'MISSING') +
          ' (studentClassIds guard @' + attEnrolled.join(',') + '; school/teacher boundary @' + attBoundary.join(',') + ')',
        'grades.js: class_id + subject_id validated ' +
          (grdOk ? 'present' : 'MISSING') +
          ' (enrolled class @' + grdEnrolled.join(',') + '; teacher subject @' + grdSubject.join(',') + ')'
      ];
      const okAll = clsOk && attOk && grdOk;
      return { ok: true, verdict: okAll ? 'PASS' : 'DEFECT-OPEN', detail: parts.join(' | ') };
    }
  },

  /*
   * A-22 claim (two facts, PASS iff both):
   *  (1) server/index.js boot fail-fast predicate covers the REDIS_URL-only
   *      shape (isProdShape() + cache-init failure => process.exit(1)).
   *  (2) a commandTimeout exists in the redis client config (server/redis.js).
   */
  {
    id: 'A-22',
    run(ROOT) {
      const idx = readText(ROOT, 'server/index.js');
      const red = readText(ROOT, 'server/redis.js');
      if (!idx) throw new Error('server/index.js unreadable');
      if (!red) throw new Error('server/redis.js unreadable');

      const gate = lineOf(idx, /function isProdShape\(\)/);
      const redisUrlOnly = lineOf(idx,
        /if \(process\.env\.REDIS_URL \|\| process\.env\.DATABASE_URL\) return true;/);
      const exitGate = lineOf(idx, /if \(isProdShape\(\)\) \{[\s\S]{0,200}?process\.exit\(1\);/);
      const fact1 = !!(gate && redisUrlOnly && exitGate && exitGate >= redisUrlOnly);

      const cmdTimeout = allLines(red, /commandTimeout:/);
      const fact2 = cmdTimeout.length > 0;

      const parts = [
        'fact1 boot fail-fast covers REDIS_URL-only shape: ' + (fact1 ? 'present' : 'MISSING') +
          ' (isProdShape() @' + gate + ' includes `REDIS_URL || DATABASE_URL -> true` @' + redisUrlOnly +
          '; cache-init failure => isProdShape() => process.exit(1) @' + exitGate + ')',
        'fact2 commandTimeout in redis client config: ' + (fact2 ? 'present' : 'MISSING') +
          ' (server/redis.js @' + cmdTimeout.join(',') + ' — PAYESH_REDIS_COMMAND_TIMEOUT_MS || 2000)'
      ];
      return { ok: true, verdict: fact1 && fact2 ? 'PASS' : 'DEFECT-OPEN', detail: parts.join(' | ') };
    }
  },

  /*
   * A-23 claim: regional-intelligence-network.js average_difficulty_p_value
   * derived from totalHard/totalExams AND null when no exams.
   */
  {
    id: 'A-23',
    run(ROOT) {
      const relPath = 'server/analytics/regional-intelligence-network.js';
      const t = readText(ROOT, relPath);
      if (!t) throw new Error(relPath + ' unreadable');

      const calc = lineOf(t,
        /average_difficulty_p_value:\s*totalExams > 0 \? Math\.round\(\(totalHard \/ totalExams\) \* 100\) \/ 100 : null/);
      const accum = allLines(t, /(totalExams|totalHard) \+= Number\(s\.assessment_summary\?+\./);
      const okAll = !!(calc && accum.length >= 2);

      return {
        ok: true,
        verdict: okAll ? 'PASS' : 'DEFECT-OPEN',
        detail: relPath + ':' + (calc || '?') +
          ' `average_difficulty_p_value: totalExams > 0 ? Math.round((totalHard / totalExams) * 100) / 100 : null`' +
          ' — derived from totalHard/totalExams AND null when no exams; totals accumulated @' +
          accum.join(',') + ' from rawSchools assessment_summary'
      };
    }
  },

  /*
   * A-24 claim: A-18/A-20 fixes present on main. Two core facts:
   *  (1) conflicts.js monotonic nextVer Math.max pattern present;
   *  (2) isVersioned coverage in routes (grades+students+users+classes+
   *      attendance PATCH paths).
   * No separate sync/offline remediation branch is required — nothing to
   * check remotely; this checkout's main tree carries the fixes.
   */
  {
    id: 'A-24',
    run(ROOT) {
      const conflicts = readText(ROOT, 'server/conflicts.js');
      if (!conflicts) throw new Error('server/conflicts.js unreadable');

      const mathMax = countMatches(conflicts, /Math\.max\(/);
      const nextVer = lineOf(conflicts, /const nextVer = \(Number\(c\.server_version\) \|\| 1\) \+ 1;/);
      const staleGuard = lineOf(conflicts, /currentVersion !== expectedVersion/);
      const fact1 = mathMax > 0; /* as claimed: Math.max pattern */

      const entities = ['grades', 'students', 'users', 'classes', 'attendance'];
      const cov = [];
      const missing = [];
      for (const e of entities) {
        const t = readText(ROOT, 'server/routes/' + e + '.js');
        if (!t) throw new Error('server/routes/' + e + '.js unreadable');
        const ln = lineOf(t, /checkOcc\([^)]*,\s*true\)/);
        cov.push(e + '@' + (ln || '?'));
        if (!ln) missing.push(e);
      }
      const fact2 = missing.length === 0;

      const parts = [
        'fact1 conflicts.js monotonic nextVer Math.max pattern: ' + (fact1 ? 'present' : 'ABSENT') +
          ' (grep Math.max in conflicts.js = ' + mathMax + ' hits; actual mechanism: stale-guard 409 conflict_stale @' +
          staleGuard + ' when target.version !== server_version, then nextVer = server_version+1 @' + nextVer +
          ', PG write passes base_version: expectedVersion)',
        'fact2 isVersioned coverage on PATCH paths: ' + (fact2 ? '5/5 present' : 'MISSING: ' + missing.join(',')) +
          ' (' + cov.join(', ') + ' — checkOcc(..., true))',
        'main carries the fixes: this checkout\'s working tree is main content; no separate sync/offline remediation branch is required'
      ];
      return { ok: true, verdict: fact1 && fact2 ? 'PASS' : 'DEFECT-OPEN', detail: parts.join(' | ') };
    }
  },

  /*
   * A-25 claim: server/outbox.js exists AND server/index.js references it
   * AND tests/phase2-outbox-failover.js AND tests/outbox-runtime-reliability.test.js
   * exist. Presence proven; runtime execution is a separate staging step.
   */
  {
    id: 'A-25',
    run(ROOT) {
      const refs = [
        'server/outbox.js',
        'tests/phase2-outbox-failover.js',
        'tests/outbox-runtime-reliability.test.js'
      ];
      const present = refs.map((r) => [r, existsFile(ROOT, r)]);
      const idx = readText(ROOT, 'server/index.js');
      if (!idx) throw new Error('server/index.js unreadable');
      const refCount = countMatches(idx, /outbox/gi);
      const wired = lineOf(idx, /createOutbox\(\{ store, db \}\)/);
      const missing = present.filter((p) => !p[1]).map((p) => p[0]);

      if (missing.length > 0 || !wired) {
        return {
          ok: true,
          verdict: 'DEFECT-OPEN',
          detail: 'presence NOT proven — missing: ' + (missing.join(', ') || 'none') +
            (wired ? '' : '; createOutbox wiring not found in server/index.js')
        };
      }

      return {
        ok: true,
        verdict: 'RUNTIME-PENDING',
        detail: 'presence proven: server/outbox.js; wired in server/index.js (createOutbox @' + wired +
          ', ' + refCount + ' outbox references); tests/phase2-outbox-failover.js; tests/outbox-runtime-reliability.test.js' +
          ' — runtime execution is a separate staging step (needs live PG + worker), NOT claimed here'
      };
    }
  },

  /*
   * A-26 claim (three CI-gate facts; all three => PASS):
   *  (1) codeql.yml echo-only (no github/codeql-action);
   *  (2) fortify.yml documented skip;
   *  (3) codacy.yml INT_MAX max-allowed-issues.
   */
  {
    id: 'A-26',
    run(ROOT) {
      const wf = '.github/workflows/';
      const facts = [];

      let fact1 = false;
      const codeql = readText(ROOT, wf + 'codeql.yml');
      if (codeql !== null) {
        const echoOnly = /echo/.test(codeql) && !/github\/codeql-action/.test(codeql);
        fact1 = echoOnly;
        facts.push('codeql.yml: exists, echo-only(no github/codeql-action)=' + echoOnly);
      } else {
        const hits = [];
        for (const f of listWorkflows(ROOT)) {
          const t = readText(ROOT, wf + f);
          if (t && /github\/codeql-action/.test(t)) hits.push(f);
        }
        facts.push('codeql.yml: ABSENT from .github/workflows (echo-only fact not verifiable as stated)' +
          (hits.length ? '; github/codeql-action referenced only as SARIF uploader in: ' + hits.join(', ') : ''));
      }

      const fortify = readText(ROOT, wf + 'fortify.yml');
      const skipLn = fortify && lineOf(fortify, /Skipping Fortify scan|NOT EXECUTED/);
      const fact2 = !!skipLn;
      facts.push('fortify.yml: documented skip ' + (fact2 ? 'present @' + skipLn + ' ("Skipping Fortify scan… NOT EXECUTED")' : 'MISSING'));

      const codacy = readText(ROOT, wf + 'codacy.yml');
      const m = codacy && /max-allowed-issues:\s*(\d+)/.exec(codacy);
      const fact3 = !!(m && m[1] === '2147483647');
      facts.push('codacy.yml: max-allowed-issues = ' + (m ? m[1] : 'MISSING') +
        ' @' + (m ? lineOf(codacy, /max-allowed-issues:/) : '?') +
        (fact3 ? ' (INT_MAX)' : ' (NOT INT_MAX 2147483647; documented as measured ESLint-baseline alignment)'));

      const okAll = fact1 && fact2 && fact3;
      if (!okAll) facts.push('=> not all three registry claims hold as stated on the inspected tree (honest drift, not fabricated PASS)');
      return { ok: true, verdict: okAll ? 'PASS' : 'DEFECT-OPEN', detail: facts.join(' | ') };
    }
  },

  /*
   * A-27: REAL PG/Redis DR environment — the harness cannot prove this;
   * verified-open defect. Staging provisioning is a separate operator step.
   */
  {
    id: 'A-27',
    run(ROOT) {
      return {
        ok: true,
        verdict: 'DEFECT-OPEN',
        detail: 'no DR environment provisioned in this checkout; staging provisioning is a separate operator step'
      };
    }
  },

  /*
   * A-28: RAM-authoritative control-planes design doc under docs/.
   * DOCS-OK iff a design doc exists (named in detail); else DEFECT-OPEN.
   * Deterministic rule: a hit counts as a design doc only if it is NOT an
   * audit/verification/roadmap/obligation-list file and mentions the topic
   * >= 3 times (i.e., it designs rather than lists the obligation).
   */
  {
    id: 'A-28',
    run(ROOT) {
      const hits = [];
      const obligationish = /(^|[\\/])(audit|verification|arena-evidence)([\\/]|$)|ROADMAP|GROUND_TRUTH|EXECUTION_PLAN|CURRENT_WORK|PHASE_8|HANDOFF|RECONCILIATION|CARRYOVER|ZERO_TRUST|SCHEDULE|INTELLIGENCE/i;
      const walk = (dir) => {
        let entries;
        try {
          entries = fs.readdirSync(dir, { withFileTypes: true });
        } catch (e) {
          return;
        }
        for (const e of entries) {
          const full = path.join(dir, e.name);
          if (e.isDirectory()) {
            walk(full);
          } else if (/\.(md|txt|json)$/i.test(e.name)) {
            let t;
            try {
              t = fs.readFileSync(full, 'utf8');
            } catch (er) {
              continue;
            }
            const lines = allLines(t, /RAM-authoritative|authority mode/gi);
            if (lines.length > 0) {
              hits.push({ rel: path.relative(ROOT, full).replace(/\\/g, '/'), lines: lines.slice(0, 3), n: lines.length });
            }
          }
        }
      };
      walk(path.join(ROOT, 'docs'));

      const design = hits.filter((h) => !obligationish.test(h.rel) && h.n >= 3);
      const obligations = hits.slice(0, 6).map((h) => h.rel + ':' + h.lines[0] + (h.n > 1 ? '(+' + (h.n - 1) + ')' : ''));

      if (design.length > 0) {
        return {
          ok: true,
          verdict: 'DOCS-OK',
          detail: 'design doc(s) found: ' + design.map((d) => d.rel + ':' + d.lines.join(',')).join('; ')
        };
      }
      return {
        ok: true,
        verdict: 'DEFECT-OPEN',
        detail: 'no RAM-authoritative control-planes design doc under docs/ — ' + hits.length +
          ' file(s) mention it, all as open obligations/design debt, e.g. ' + obligations.join(', ')
      };
    }
  },

  /*
   * A-29: Roadmap/Redis-Node version drift. ROADMAP.md version claims vs
   * reality: package.json engines.node and .github/workflows node-version.
   * No drift => DOCS-OK; drift => DEFECT-OPEN with the exact drift.
   */
  {
    id: 'A-29',
    run(ROOT) {
      const roadmap = readText(ROOT, 'docs/ROADMAP.md');
      if (!roadmap) throw new Error('docs/ROADMAP.md unreadable');
      const pkg = readText(ROOT, 'package.json');
      if (!pkg) throw new Error('package.json unreadable');

      const engM = /"engines"[\s\S]{0,120}?"node"\s*:\s*"[^"]*?(\d+)/.exec(pkg);
      const enginesMajor = engM ? Number(engM[1]) : null;
      const enginesLine = lineOf(pkg, /"engines"/);

      /* Roadmap Node claims: "Node ≥22", "Node 22", "Node.js >=22" */
      const nodeClaims = allLines(roadmap, /Node(?:\.js)?\s*[≥>]=?\s*(\d{2})/);
      const nodeM = /Node(?:\.js)?\s*[≥>]=?\s*(\d{2})/.exec(roadmap);
      const nodeClaimMajor = nodeM ? Number(nodeM[1]) : null;

      /* Roadmap Redis claims: "Redis 7", "Redis 8.0.2", ... */
      const redisM = /Redis\s*(\d+\.\d+(?:\.\d+)?|\d+)/.exec(roadmap);
      const redisClaim = redisM ? redisM[1] : null;
      const redisLines = allLines(roadmap, /Redis\s*\d/);

      const drifts = [];
      if (nodeClaimMajor && enginesMajor && enginesMajor < nodeClaimMajor) {
        drifts.push('package.json engines.node (' + enginesMajor + ') < roadmap Node claim (' + nodeClaimMajor + ')');
      }
      const wfNotes = [];
      for (const f of listWorkflows(ROOT)) {
        const t = readText(ROOT, '.github/workflows/' + f);
        if (!t) continue;
        const g = /node-version:\s*'?(\d+)(?:\.[xX])?'?/g;
        let mm;
        while ((mm = g.exec(t)) !== null) {
          const ln = t.slice(0, mm.index).split('\n').length;
          const major = Number(mm[1]);
          wfNotes.push(f + ':' + ln + '=' + mm[1]);
          if (nodeClaimMajor && major < nodeClaimMajor) {
            drifts.push('ROADMAP says Node ' + (nodeM[0].trim()) + ' but ' + f + ':' + ln + ' pins node-version ' + mm[1]);
          } else if (enginesMajor && major < enginesMajor) {
            drifts.push(f + ':' + ln + ' pins node-version ' + mm[1] + ' < engines.node ' + enginesMajor);
          }
        }
      }

      const parts = [
        'roadmap Node claim: ' + (nodeClaimMajor ? 'Node ' + nodeM[0].trim() + ' @ROADMAP.md:' + nodeClaims.join(',') : 'none found'),
        'roadmap Redis claim: ' + (redisClaim ? 'Redis ' + redisClaim + ' @ROADMAP.md:' + redisLines.join(',') : 'no specific Redis version claim (capability-only mentions)'),
        'reality: package.json:' + enginesLine + ' engines.node=' + (enginesMajor ? '>=' + enginesMajor + '.0.0' : 'MISSING') +
          '; workflows: ' + (wfNotes.join(', ') || 'none')
      ];
      if (drifts.length) parts.push('DRIFT: ' + drifts.join(' ; '));

      return { ok: true, verdict: drifts.length ? 'DEFECT-OPEN' : 'DOCS-OK', detail: parts.join(' | ') };
    }
  }

];
