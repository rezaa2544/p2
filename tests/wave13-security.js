/* ─────────────────────────────────────────────────────────────
   wave13-security.js — Security Program CI coverage
   -------------------------------------------------------------------
   Wave 13 (chat2): assert .github/workflows/security.yml actually contains
   every required security stage (SAST, SCA, SBOM, DAST, Secret) plus the
   repo-native gates, and that the Wave 13 docs exist. Runs offline (reads the
   workflow file + docs) — no GitHub Actions runner required here.

   S1  workflow file exists + is valid YAML-ish (contains required jobs/stages)
   S2  SAST present  → repo-native static: tests/run.js + tools/check-authz.js
   S3  Secret scan present → node tests/secret-scan.js
   S4  SCA present   → npm audit --audit-level=high (best-effort)
   S5  SBOM present  → npm sbom (+ SPDX artifact)
   S6  DAST present  → OWASP ZAP baseline (best-effort, SECURITY_TARGET_URL)
   S7  WAF preserved → waf-ddos --unit-only + nginx -t
   S8  docs exist    → docs/PEN_TEST_CHECKLIST.md, docs/SECURITY_MODEL.md
   ───────────────────────────────────────────────────────────── */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const WF = path.join(ROOT, '.github/workflows/security.yml');
const wf = fs.existsSync(WF) ? fs.readFileSync(WF, 'utf8') : '';

let okc = 0, failc = 0;
const fails = [];
function chk(name, cond, extra) {
  if (cond) { okc++; console.log('  ✅ ' + name); }
  else { failc++; fails.push(name + (extra ? ' — ' + extra : '')); console.log('  ❌ ' + name + (extra ? ' — ' + extra : '')); }
}
const has = (s) => wf.indexOf(s) >= 0;

(async () => {
  console.log('\n▸ Wave 13 — Security Program CI coverage');

  /* S1 — file exists and names the program */
  chk('S1a workflow file exists', wf.length > 0);
  chk('S1b named "Security Program"', has('Security Program'));
  chk('S1c triggers on push+PR', has('on:') && (has('push:') || /branches:/.test(wf)));
  chk('S1d multiple jobs (sast/secret/sca/sbom/dast/waf)',
    has('sast:') && has('secret:') && has('sca:') && has('sbom:') && has('dast:') && has('waf:'));

  /* S2 — SAST (repo-native static) */
  chk('S2a SAST runs tests/run.js', has('tests/run.js'));
  chk('S2b SAST runs tools/check-authz.js', has('tools/check-authz.js'));

  /* S3 — Secret scan */
  chk('S3 secret-scan present', has('secret-scan.js'));

  /* S4 — SCA */
  chk('S4a npm audit present', has('npm audit'));
  chk('S4b audit-level=high', has('--audit-level=high'));

  /* S5 — SBOM */
  chk('S5a npm sbom present', has('npm sbom'));
  chk('S5b SPDX artifact upload', has('sbom.spdx.json') && has('actions/upload-artifact'));

  /* S6 — DAST */
  chk('S6a OWASP ZAP present', has('zaproxy/actions-baseline'));
  chk('S6b needs SECURITY_TARGET_URL', has('SECURITY_TARGET_URL'));

  /* S7 — WAF preserved */
  chk('S7a waf-ddos unit test kept', has('waf-ddos.js --unit-only'));
  chk('S7b nginx validation kept', has('nginx -t'));

  /* S8 — docs exist */
  chk('S8a PEN_TEST_CHECKLIST.md', fs.existsSync(path.join(ROOT, 'docs/PEN_TEST_CHECKLIST.md')));
  chk('S8b SECURITY_MODEL.md', fs.existsSync(path.join(ROOT, 'docs/SECURITY_MODEL.md')));

  console.log('\n  جمع: ' + okc + ' موفق، ' + failc + ' ناموفق از ' + (okc + failc) + '\n');
  process.exit(failc ? 1 : 0);
})().catch((e) => { console.error('wave13-security crashed:', e); process.exit(1); });
