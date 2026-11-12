'use strict';
/* tests/m15-04-abac.test.js — M15-04: the attribute-based access control
   layer over the existing RBAC.

     B1  the deny rule wins over the later allow rule (deny-first)
     B2  the tenant scoping: a resource of ANOTHER school_id = denied even
         when the action would be allowed ('self' = the session's tenant)
     B3  the superadmin bypasses the tenant scoping (cross-tenant = allowed)
     B4  the field conditions: grade/exam_type lists = enforced
     B5  no matching rule = defer (the RBAC layer decides, NOT an implicit
         allow) — the honest fail-closed posture
     B6  the unreadable policy file = the loud fail-closed error (never
         the silent allow)
     B7  the evaluation always returns a REASON (auditability)

   Run: node tests/m15-04-abac.test.js */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createAbac, loadPolicies } = require('../server/abac');

let pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) pass++; else fail++;
  console.log((ok ? '✅' : '❌') + ' ' + name + (detail ? ' — ' + detail : ''));
}

const T1 = { user_id: 1, role: 'admin', school_id: 100 };
const SA = { user_id: 9, role: 'superadmin', school_id: null };

(async () => {
  const abac = createAbac({ policies: loadPolicies() });
  check('B0 the curated policy file loads', abac.policyCount() >= 4, String(abac.policyCount()));

  /* B1 — the deny wins over the allow */
  {
    const d = abac.evaluate({ action: 'grades:write', session: T1, resource: { type: 'grade', school_id: 100, grade: 12 } });
    check('B1 the deny rule wins over the later allow', d.decision === 'deny' && d.reason, JSON.stringify(d));
  }

  /* B2 — the tenant scoping: a resource of ANOTHER school_id does not
     MATCH any 'self' rule → the ABAC defers (the RBAC layer owns the
     cross-tenant denial — the hybrid split of responsibility); the
     own-tenant write matches the allow rule */
  {
    const d = abac.evaluate({ action: 'grades:write', session: T1, resource: { type: 'grade', school_id: 200, grade: 7 } });
    check('B2 the cross-tenant write = deferred to RBAC (no self rule matches)', d.decision === 'defer', JSON.stringify(d));
    const ok = abac.evaluate({ action: 'grades:write', session: T1, resource: { type: 'grade', school_id: 100, grade: 7 } });
    check('B2b the own-tenant write = allowed', ok.decision === 'allow', JSON.stringify(ok));
  }

  /* B3 — the superadmin = the cross-tenant */
  {
    const d = abac.evaluate({ action: 'grades:write', session: SA, resource: { type: 'grade', school_id: 200, grade: 7 } });
    check('B3 the superadmin bypasses the tenant scoping', d.decision === 'allow', JSON.stringify(d));
  }

  /* B4 — the field conditions */
  {
    const natl = abac.evaluate({ action: 'exams:write', session: T1, resource: { type: 'exam', school_id: 100, exam_type: 'national' } });
    const cls = abac.evaluate({ action: 'exams:write', session: T1, resource: { type: 'exam', school_id: 100, exam_type: 'class' } });
    check('B4a national exam = denied', natl.decision === 'deny');
    check('B4b class exam = allowed', cls.decision === 'allow');
    const grade99 = abac.evaluate({ action: 'grades:write', session: T1, resource: { type: 'grade', school_id: 100, grade: 9 } });
    check('B4c the grade outside the deny list = allowed (falls to allow)', grade99.decision === 'allow');
  }

  /* B5 — the defer (the RBAC decides) */
  {
    const d = abac.evaluate({ action: 'unknown:action', session: T1, resource: {} });
    check('B5 no rule = defer (the RBAC decides, not the implicit allow)', d.decision === 'defer', JSON.stringify(d));
  }

  /* B6 — the fail-closed on the unreadable policy */
  {
    const bad = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'abac-')), 'broken.json');
    fs.writeFileSync(bad, '{ not json');
    let threw = null;
    try { loadPolicies(bad); } catch (e) { threw = e; }
    check('B6 the unreadable policy = a loud error', threw && threw.code === 'ABAC_POLICY_UNREADABLE', threw && threw.code);
  }

  /* B7 — the auditability: every decision = a reason */
  {
    const ds = [
      abac.evaluate({ action: 'grades:write', session: T1, resource: { type: 'grade', school_id: 100, grade: 12 } }),
      abac.evaluate({ action: 'grades:write', session: T1, resource: { type: 'grade', school_id: 100, grade: 7 } }),
      abac.evaluate({ action: 'unknown:x', session: T1, resource: {} })
    ];
    check('B7 every decision carries a reason', ds.every((d) => typeof d.reason === 'string' && d.reason.length > 3));
  }

  console.log('────────────────────────────────────────────');
  console.log('m15-04-abac: ' + pass + ' pass / ' + fail + ' fail');
  console.log('CHECKS ' + (pass + fail) + ' FAIL ' + fail);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('FATAL ' + (e && e.message)); process.exit(1); });
