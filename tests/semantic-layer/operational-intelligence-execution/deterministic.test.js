/**
 * آزمون ۱۰: آزمون قطعیت جبری ۱۰۰٪ و بازتولیدپذیری بیت‌به‌بیت در ۱۰ اجرای متوالی
 */

'use strict';

const assert = require('assert');
const {
  createExecutionWorkflow,
  transitionExecutionLifecycle,
  calculateExecutionSLA,
  trackExecutionProgress,
  detectExecutionBlockers,
  buildExecutionDashboard
} = require('../../../server/analytics/operational-intelligence-execution');

function runTests() {
  console.log('▸ تست ۱۰: آزمون قطعیت جبری ۱۰۰٪ و بازتولیدپذیری بیت‌به‌بیت (deterministic)');

  const mockDecision = {
    decision_id: 'DEC-DET-01',
    title: 'تصمیم قطعی آزمایشی',
    domain: 'ACADEMIC',
    urgency: 'WEEKLY',
    assigned_role: 'manager'
  };

  let firstWf = null;
  let firstTrans = null;
  let firstSLA = null;
  let firstProg = null;
  let firstBlk = null;
  let firstDash = null;

  for (let i = 0; i < 10; i++) {
    const wf = createExecutionWorkflow({
      schoolId: 101,
      regionId: 1,
      approvedDecision: mockDecision,
      options: { timestamp: '2026-09-18T12:00:00.000Z' }
    });

    const trans = transitionExecutionLifecycle(wf.tasks[0], {
      to_state: 'IN_PROGRESS',
      actor_id: 'usr-01',
      role: 'manager',
      progress_pct: 40
    }, { timestamp: '2026-09-18T12:00:00.000Z' });

    const sla = calculateExecutionSLA(wf.tasks[0], { timestamp: '2026-09-18T12:00:00.000Z' });

    const prog = trackExecutionProgress(wf.tasks, { timestamp: '2026-09-18T12:00:00.000Z' });

    const blk = detectExecutionBlockers(wf.tasks, { timestamp: '2026-09-18T12:00:00.000Z' });

    const dash = buildExecutionDashboard({
      schoolId: 101,
      regionId: 1,
      workflows: [wf],
      options: { timestamp: '2026-09-18T12:00:00.000Z' }
    });

    const sWf = JSON.stringify(wf);
    const sTrans = JSON.stringify(trans);
    const sSLA = JSON.stringify(sla);
    const sProg = JSON.stringify(prog);
    const sBlk = JSON.stringify(blk);
    const sDash = JSON.stringify(dash);

    if (i === 0) {
      firstWf = sWf;
      firstTrans = sTrans;
      firstSLA = sSLA;
      firstProg = sProg;
      firstBlk = sBlk;
      firstDash = sDash;
    } else {
      assert.strictEqual(sWf, firstWf, `عدم تطابق قطعیت در createExecutionWorkflow در تکرار ${i}`);
      assert.strictEqual(sTrans, firstTrans, `عدم تطابق قطعیت در transitionExecutionLifecycle در تکرار ${i}`);
      assert.strictEqual(sSLA, firstSLA, `عدم تطابق قطعیت در calculateExecutionSLA در تکرار ${i}`);
      assert.strictEqual(sProg, firstProg, `عدم تطابق قطعیت در trackExecutionProgress در تکرار ${i}`);
      assert.strictEqual(sBlk, firstBlk, `عدم تطابق قطعیت در detectExecutionBlockers در تکرار ${i}`);
      assert.strictEqual(sDash, firstDash, `عدم تطابق قطعیت در buildExecutionDashboard در تکرار ${i}`);
    }
  }

  console.log('  ✅ قطعیت جبری ۱۰۰٪ و برابری باینری تمامی توابع در ۱۰ تکرار متوالی اثبات شد');
}

if (require.main === module) {
  runTests();
}

module.exports = { runTests };
