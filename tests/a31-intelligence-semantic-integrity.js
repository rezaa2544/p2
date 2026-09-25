#!/usr/bin/env node
/* ═════════════════════════════════════════════════════════════════════
   tests/a31-intelligence-semantic-integrity.js — A-31 / I-02..I-09
   ─────────────────────────────────────────────────────────────────────
   ممیزی معنایی موتورهای هوشمندی: چهار اصلِ الزامی
     ۱) بی‌داده (no-data) هرگز «سالم» تلقی نمی‌شود.
     ۲) صفر رویداد (zero-event) هرگز «کامل/بی‌نقص» تلقی نمی‌شود.
     ۳) شبیه‌سازی (simulation) هرگز «راستی‌آزمایی رانتایمی» تلقی نمی‌شود.
     ۴) متریکِ سخت‌کد هرگز جای خروجیِ واقعیِ موتور نمی‌نشیند.

   یافته‌ها:
     I-02  detectAttendanceRisk: بی‌داده ⇒ ریسک LOW (نباید)
     I-03  analyzeWeeklyAttendancePattern + generatePrincipalActionCenter:
           صفر رویداد ⇒ PERFECT_ATTENDANCE / ساختِ روزِ اوجِ جعلی
     I-04  checkIntelligenceChainHealth: گره‌ها با `|| true` همیشه حاضر؛
           بی‌داده ⇒ HEALTHY
     I-05  auditHumanApprovalCompliance: بی‌داده/بررسی‌نشده ⇒ نرخ تأیید ۱۰۰٪
           و وضعیت COMPLIANT (مثبت کاذب)
     I-06  analyzeRecommendationAccuracy: بی‌داده/بدون ارجاع ⇒ دقت ارجاع ۱۰۰٪؛
           ساختِ تاریخچهٔ پیش‌فرض در مسیر /feedback-learning-memory
     I-07  summary_metrics و گزارش سلامت پلتفرم و پیش‌فرض‌های داشبورد
           حاکمیت: اعدادِ سخت‌کد به‌جای خروجیِ موتورها
     I-08  executeEndToEndChain: شبیه‌سازی با verified:true
     I-09  validateQualityGateStatus: هر ۸ گیت بدونِ اجرا «PASSED» خوداظهاری؛
           گواهی انتشار بدونِ شاهد ⇒ CERTIFIED

   شیوه: هیچ ماکِ جایگزین نمی‌شود — ماژول‌های واقعی فراخوانی می‌شوند و
   بخش زنده با سرورِ واقعیِ اسپاون‌شده از سرورِ اصلی + ورود واقعی اجرا می‌شود.
   اجرا:  node tests/a31-intelligence-semantic-integrity.js
   ═════════════════════════════════════════════════════════════════════ */
'use strict';

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const failures = [];
function chk(id, name, fn) {
  try { fn(); pass++; console.log(`  ✅ [${id}] ${name}`); }
  catch (e) { fail++; failures.push(id); console.log(`  ❌ [${id}] ${name} — ${e.message}`); }
}

/* ── ماژول‌های واقعی زیر آزمون ─────────────────────────────────────── */
const attendanceIntel = require(path.join(ROOT, 'server', 'analytics', 'attendance-intelligence'));
const platformIntegration = require(path.join(ROOT, 'server', 'analytics', 'intelligence-platform-integration'));
const feedbackMemory = require(path.join(ROOT, 'server', 'analytics', 'intelligence-feedback-memory'));
const governanceDash = require(path.join(ROOT, 'server', 'analytics', 'intelligence-governance-dashboard'));
const releaseCert = require(path.join(ROOT, 'server', 'analytics', 'intelligence-release-certification'));
const schoolIntel = require(path.join(ROOT, 'server', 'analytics', 'school-intelligence-center'));

function partA() {
  console.log('\n▸ بخش A — سطح موتور (کد واقعی، بدون ماک)');

  /* I-02: بی‌داده نباید سالم/کم‌ریسک تلقی شود */
  {
    const r = attendanceIntel.detectAttendanceRisk({ attendance: [], studentId: 77 }, {});
    chk('I-02-E1', 'detectAttendanceRisk: بی‌داده ⇒ وضعیت صریح NO_DATA، نه LOW', () => {
      assert.notStrictEqual(r.risk_level, 'LOW', 'بی‌داده هرگز نباید ریسک LOW بگیرد');
      assert.strictEqual(r.risk_level, 'NO_DATA');
      assert.strictEqual(r.data_status, 'NO_DATA');
      assert.strictEqual(r.absence_rate, null, 'نرخ غیبت بدون داده باید null باشد نه صفر');
    });
  }
  {
    /* کنترل: دادهٔ واقعی با غیبتِ بالا همچنان ریسک درست می‌گیرد */
    const recs = [];
    for (let i = 0; i < 10; i++) {
      recs.push({ student_id: 77, date: `2026-09-${String(i + 1).padStart(2, '0')}`, status: i < 4 ? 'absent' : 'present', school_id: 1 });
    }
    const r = attendanceIntel.detectAttendanceRisk({ attendance: recs, studentId: 77 }, {});
    chk('I-02-E2', 'detectAttendanceRisk: کنترل — دادهٔ واقعی ریسک واقعی می‌گیرد', () => {
      assert.ok(['MEDIUM', 'HIGH', 'CRITICAL'].includes(r.risk_level), 'با ۴۰٪ غیبت باید ریسک غیرِ‌پایین باشد: ' + r.risk_level);
      assert.ok(r.absence_rate > 0);
    });
  }

  /* I-03: صفر رویداد نباید کامل تلقی شود + روز اوج جعلی */
  {
    const r = attendanceIntel.analyzeWeeklyAttendancePattern({ attendance: [], studentId: 77 }, {});
    chk('I-03-E1', 'الگوی هفتگی: صفر رویداد ⇒ NO_DATA، نه PERFECT_ATTENDANCE', () => {
      assert.notStrictEqual(r.weekday_risk_profile, 'PERFECT_ATTENDANCE', 'بدون هیچ رکوردی نباید حضور کامل اعلام شود');
      assert.strictEqual(r.weekday_risk_profile, 'NO_DATA');
      assert.strictEqual(r.data_status, 'NO_DATA');
    });
  }
  {
    const present = ['saturday', 'sunday', 'monday', 'tuesday', 'wednesday']
      .map(d => ({ student_id: 78, weekday: d, status: 'present' }));
    const r = attendanceIntel.analyzeWeeklyAttendancePattern({ attendance: present, studentId: 78 }, {});
    chk('I-03-E2', 'الگوی هفتگی: کنترل — حضورِ کاملِ واقعی همچنان PERFECT است', () => {
      assert.strictEqual(r.weekday_risk_profile, 'PERFECT_ATTENDANCE');
    });
  }
  {
    const actions = schoolIntel.generatePrincipalActionCenter({
      attendance_summary: { chronic_absence_rate: 14.2, peak_absence_day: null }
    }, {});
    chk('I-03-E3', 'مرکز اقدام: بدونِ روزِ اوجِ واقعی، روز جعلی ساخته نمی‌شود', () => {
      const chronic = actions.filter(a => String(a.action || '').includes('غیبت مزمن'));
      assert.ok(chronic.length > 0, 'اقدام غیبت مزمن باید وجود داشته باشد');
      for (const a of chronic) {
        assert.ok(!String(a.action).includes('پایان هفته'), 'روز اوج نباید «پایان هفته» جعل شود: ' + a.action);
      }
    });
  }

  /* I-04: گره‌های زنجیره با || true همیشه حاضر نمی‌شوند */
  {
    const h = platformIntegration.checkIntelligenceChainHealth({ engineOutputs: {} });
    chk('I-04-E1', 'سلامت زنجیره: بی‌داده ⇒ هیچ گره‌ای حاضر نیست و وضعیت سالم نیست', () => {
      assert.strictEqual(h.nodes.insight_engines_present, false, 'گره بینش بدون خروجی نباید حاضر باشد');
      assert.strictEqual(h.nodes.decision_command_present, false);
      assert.strictEqual(h.nodes.execution_workflow_present, false);
      assert.strictEqual(h.nodes.outcome_evaluation_present, false);
      assert.notStrictEqual(h.chain_status, 'HEALTHY', 'بی‌داده هرگز نباید HEALTHY باشد');
      assert.strictEqual(h.data_status, 'NO_DATA');
    });
  }
  {
    const outputs = {
      schoolIntelligence: { score: 85 },
      decisionCommand: { total_decisions: 5 },
      executionDashboard: { total_tasks: 8 },
      outcomeEvaluation: { evaluations_count: 4 },
      zero_ranking: true,
      automated_decision: false
    };
    const h = platformIntegration.checkIntelligenceChainHealth({ engineOutputs: outputs });
    chk('I-04-E2', 'سلامت زنجیره: کنترل — خروجی‌های واقعی ⇒ حضور واقعی و سالم', () => {
      assert.strictEqual(h.nodes.insight_engines_present, true);
      assert.strictEqual(h.nodes.outcome_evaluation_present, true);
      assert.strictEqual(h.chain_status, 'HEALTHY');
    });
  }

  /* I-05: ممیزی تأیید انسانی — مثبت کاذب ممنوع */
  {
    const r = governanceDash.auditHumanApprovalCompliance([], {});
    chk('I-05-E1', 'ممیزی تأیید: بی‌داده ⇒ نه ۱۰۰٪، نه COMPLIANT', () => {
      assert.notStrictEqual(r.approval_rate_pct, 100.0, 'بدون هیچ اقدامی نرخ تأیید ۱۰۰٪ مثبت کاذب است');
      assert.strictEqual(r.approval_rate_pct, null);
      assert.notStrictEqual(r.compliance_status, 'COMPLIANT');
      assert.strictEqual(r.compliance_status, 'NO_DATA');
      assert.strictEqual(r.average_approval_time_hours, null, 'زمان تأیید بدون داده نباید ۱۲ ساعت جعل شود');
    });
  }
  {
    const r = governanceDash.auditHumanApprovalCompliance(
      [{ action_id: 'A1', status: 'GENERATED' }, { action_id: 'A2', status: 'REVIEW_PENDING' }], {});
    chk('I-05-E2', 'ممیزی تأیید: اقداماتِ بررسی‌نشده ⇒ نرخ تأیید ۱۰۰٪ نیست', () => {
      assert.notStrictEqual(r.approval_rate_pct, 100.0);
      assert.strictEqual(r.approval_rate_pct, null);
      assert.strictEqual(r.unreviewed_count, 2);
      assert.notStrictEqual(r.compliance_status, 'COMPLIANT', 'همه‌چیز بررسی‌نشده نمی‌تواند منطبق باشد');
    });
  }
  {
    const r = governanceDash.auditHumanApprovalCompliance(
      [{ action_id: 'A1', decision: 'APPROVED' }, { action_id: 'A2', decision: 'REJECTED', rejected_reason: 'X' }], {});
    chk('I-05-E3', 'ممیزی تأیید: کنترل — دادهٔ واقعی نرخ واقعی می‌دهد (۵۰٪)', () => {
      assert.strictEqual(r.approval_rate_pct, 50.0);
      assert.strictEqual(r.compliance_status, 'COMPLIANT');
    });
  }

  /* I-06: دقت پیشنهادها — بی‌داده/بدون ارجاع ⇒ دقت ۱۰۰٪ ممنوع */
  {
    const r = feedbackMemory.analyzeRecommendationAccuracy([], {});
    chk('I-06-E1', 'دقت پیشنهادها: بی‌داده ⇒ دقت ارجاع ۱۰۰٪ نیست', () => {
      assert.notStrictEqual(r.escalation_accuracy_pct, 100.0);
      assert.strictEqual(r.escalation_accuracy_pct, null);
      assert.strictEqual(r.data_status, 'NO_DATA');
    });
  }
  {
    const history = [
      { action_id: 'A1', decision: 'APPROVED', status: 'COMPLETED', outcome: 'HIGHLY_EFFECTIVE' },
      { action_id: 'A2', decision: 'APPROVED', status: 'COMPLETED', outcome: 'INEFFECTIVE' }
    ];
    const r = feedbackMemory.analyzeRecommendationAccuracy(history, {});
    chk('I-06-E2', 'دقت پیشنهادها: بدونِ هیچ ارجاعی ⇒ دقت ارجاع جعلی ۱۰۰٪ نیست', () => {
      assert.notStrictEqual(r.escalation_accuracy_pct, 100.0);
      assert.strictEqual(r.escalation_accuracy_pct, null);
      assert.strictEqual(r.precision_pct, 50.0, 'دقت واقعی باید از داده بیاید');
    });
  }
  {
    const history = [
      { action_id: 'A1', action_type: 'REGIONAL_RESOURCE', decision: 'APPROVED', district_confirmed: true }
    ];
    const r = feedbackMemory.analyzeRecommendationAccuracy(history, {});
    chk('I-06-E3', 'دقت پیشنهادها: کنترل — ارجاعِ واقعی تأییدشده ⇒ ۱۰۰٪ واقعی', () => {
      assert.strictEqual(r.escalation_accuracy_pct, 100.0);
    });
  }

  /* I-08: شبیه‌سازی هرگز راستی‌آزمایی رانتایمی نیست */
  {
    const chain = releaseCert.executeEndToEndChain({}, {});
    chk('I-08-E1', 'زنجیرهٔ انتها-به-انتها: بدونِ شاهدِ رانتایم، شبیه‌سازی تأییدشده نیست', () => {
      assert.strictEqual(chain.verified, false, 'شبیه‌سازی نباید verified:true بدهد');
      assert.strictEqual(chain.verification_mode, 'SIMULATION');
    });
  }
  {
    const evidence = {};
    for (let i = 1; i <= 12; i++) evidence['STEP_' + String(i).padStart(2, '0')] = { status: 'OBSERVED', observed_at: '2026-09-25T00:00:00.000Z' };
    const chain = releaseCert.executeEndToEndChain({}, { runtimeEvidence: evidence });
    chk('I-08-E2', 'زنجیرهٔ انتها-به-انتها: کنترل — با شاهدِ رانتایم، تأییدِ رانتایمی', () => {
      assert.strictEqual(chain.verification_mode, 'RUNTIME');
      assert.strictEqual(chain.verified, true);
    });
  }

  /* I-09: گیت‌های کیفی خوداظهاری ممنوع */
  {
    const g = releaseCert.validateQualityGateStatus();
    chk('I-09-E1', 'گیت‌های کیفی: بدونِ شاهدِ اجرا ⇒ همهٔ گیت‌ها اجرا‌نشده و مردود', () => {
      assert.strictEqual(g.all_passed, false, 'بدون اجرای واقعی، گیت‌ها نباید پاس باشند');
      const statuses = Object.values(g.gate_details).map(x => x.status);
      assert.ok(statuses.every(s => s === 'NOT_RUN'), 'وضعیت گیت‌ها باید NOT_RUN باشد: ' + statuses.join(','));
      assert.strictEqual(g.passed_gates, 0);
    });
  }
  {
    const evidence = {};
    for (const k of ['semantic_tests', 'api_tests', 'master_regression', 'build_parity', 'authorization_parity', 'secret_scan', 'docs_stats_sync', 'docs_consistency']) {
      evidence[k] = { status: 'PASSED', ran_at: '2026-09-25T00:00:00.000Z' };
    }
    const g = releaseCert.validateQualityGateStatus({ gateResults: evidence });
    chk('I-09-E2', 'گیت‌های کیفی: کنترل — با شاهدِ اجرا، پاسِ واقعی', () => {
      assert.strictEqual(g.all_passed, true);
      assert.strictEqual(g.passed_gates, 8);
    });
  }
  {
    const cert = releaseCert.runPhase3Certification({ schoolId: 101, regionId: 1 }, { timestamp: '2026-09-25T00:00:00.000Z' });
    chk('I-09-E3', 'گواهی انتشار: بدونِ شاهدِ گیت/رانتایم ⇒ صادر نمی‌شود', () => {
      assert.notStrictEqual(cert.certification_status, 'CERTIFIED', 'گواهی بدون شاهد نباید صادر شود');
      assert.strictEqual(cert.release_ready, false);
    });
  }
}

/* ── بخش B — سرور زنده روی PostgreSQL واقعی (بدون ماک) ─────────────── */
const MIG_DIR = path.join(ROOT, 'migrations');
const ADMIN_URL = 'postgres://payesh:payesh@127.0.0.1:5432/payesh_ci';
const DB_NAME = 'payesh_a31_' + process.pid;
const DB_URL = `postgres://payesh:payesh@127.0.0.1:5432/${DB_NAME}`;

async function pgQ(connStr, sql, params) {
  const { Client } = require(path.join(ROOT, 'node_modules', 'pg'));
  const c = new Client({ connectionString: connStr });
  await c.connect();
  try { return await c.query(sql, params); } finally { await c.end(); }
}

async function freshDb() {
  try { await pgQ(ADMIN_URL, `DROP DATABASE IF EXISTS ${DB_NAME} WITH (FORCE)`); }
  catch (e) { try { await pgQ(ADMIN_URL, `DROP DATABASE IF EXISTS ${DB_NAME}`); } catch (_) {} }
  await pgQ(ADMIN_URL, `CREATE DATABASE ${DB_NAME}`);
  const { Client } = require(path.join(ROOT, 'node_modules', 'pg'));
  const c = new Client({ connectionString: DB_URL });
  await c.connect();
  const files = fs.readdirSync(MIG_DIR).filter(f => /^\d+.*\.sql$/.test(f) && !f.includes('.down.')).sort();
  for (const f of files) {
    const sql = fs.readFileSync(path.join(MIG_DIR, f), 'utf8')
      .replace(/^\s*BEGIN;\s*$/gm, '').replace(/^\s*COMMIT;\s*$/gm, '');
    try { await c.query(sql); } catch (e) { console.log('[MIG] ' + f + ' ERR: ' + e.message.slice(0, 110)); }
  }
  await c.end();
  return files.length;
}

const nidOf = (id) => String(1000000000 + id).slice(-10);
const phOf = (id) => '090' + String(10000000 + id).slice(-8);

async function seedDb() {
  const { Client } = require(path.join(ROOT, 'node_modules', 'pg'));
  const c = new Client({ connectionString: DB_URL });
  await c.connect();
  const I = async (tbl, obj) => {
    const keys = Object.keys(obj);
    await c.query(`INSERT INTO ${tbl} (${keys.map(k => '"' + k + '"').join(',')}) VALUES (${keys.map((_, i) => '$' + (i + 1)).join(',')})`, keys.map(k => obj[k]));
  };
  await I('schools', { id: 100, name: 'مدرسه آلفا', active: true, province_id: 1, county_id: 11, district_id: 111, gender: 'مختلط', type: 'governmental' });
  await I('schools', { id: 101, name: 'مدرسه بدون داده', active: true, province_id: 1, county_id: 11, district_id: 111, gender: 'مختلط', type: 'governmental' });
  const U = (id, role, school_id, extra) => Object.assign({ id, role, school_id, active: true, full_name: 'کاربر ' + id, phone: phOf(id), national_id: nidOf(id), status: 'active' }, extra || {});
  await I('users', U(102, 'manager', 100));
  await I('users', U(103, 'manager', 101));
  await I('users', U(110, 'student', 100, { grade_level: '10' }));
  await I('classes', { id: 501, school_id: 100, name: 'کلاس ۱', grade_level: '10' });
  await I('enrollments', { id: 1, student_id: 110, class_id: 501, school_id: 100 });
  /* مدرسهٔ ۱۰۰ یک رکورد حضور دارد؛ مدرسهٔ ۱۰۱ عمداً هیچ رکوردی ندارد */
  await I('attendance', { id: 9101, student_id: 110, school_id: 100, class_id: 501, date: '2026-09-20', status: 'present' });
  await c.end();
}

async function partB() {
  console.log('\n▸ بخش B — سرور زنده روی PostgreSQL واقعی (مسیرهای واقعی + ورود واقعی)');
  const migCount = await freshDb();
  console.log(`  [DB] ${DB_NAME} migrated (${migCount} files)`);
  await seedDb();

  process.env.DATABASE_URL = DB_URL;
  process.env.REDIS_URL = 'redis://127.0.0.1:6379';
  process.env.PAYESH_JWT_SECRET = 'a'.repeat(32) + 'b'.repeat(32);
  process.env.PAYESH_DEMO_CODE = '1';
  process.env.PAYESH_ENV = 'test';
  process.env.PAYESH_SMS_COOLDOWN_S = '0';
  process.env.PAYESH_SMS_IP_LIMIT = '100000';
  process.env.PAYESH_SMS_PHONE_LIMIT = '10000';
  process.env.PAYESH_LOGIN_IP_LIMIT = '100000';
  process.env.PAYESH_LOGIN_PHONE_LIMIT = '10000';
  process.env.PAYESH_SMS_DAILY_CAP = '10000';
  delete process.env.NODE_ENV;

  const { server } = require(path.join(ROOT, 'server', 'index.js'));
  let BASE = '';
  await new Promise((resolve) => server.listen(0, '127.0.0.1', () => { BASE = `http://127.0.0.1:${server.address().port}`; resolve(); }));

  const req = async (method, p, { body, cookie } = {}) => {
    const res = await fetch(BASE + p, {
      method,
      headers: Object.assign(body ? { 'Content-Type': 'application/json' } : {}, cookie ? { Cookie: cookie } : {}),
      body: body ? JSON.stringify(body) : undefined
    });
    let json = null; try { json = await res.json(); } catch (e) {}
    return { status: res.status, json, headers: res.headers };
  };
  /* آمادگیِ زیرساخت: اتصالِ ردیس ناهمگام است؛ برای ارسالِ کد تلاش مجدد می‌کنیم */
  const waitInfra = async () => {
    for (let i = 0; i < 40; i++) {
      const sc = await req('POST', '/api/auth/send-code', { body: { phone: phOf(102) } });
      if (sc.status === 200) return true;
      await new Promise(r => setTimeout(r, 250));
    }
    return false;
  };
  const loginAs = async (id) => {
    let sc = await req('POST', '/api/auth/send-code', { body: { phone: phOf(id) } });
    for (let i = 0; i < 20 && sc.status !== 200; i++) {
      await new Promise(r => setTimeout(r, 250));
      sc = await req('POST', '/api/auth/send-code', { body: { phone: phOf(id) } });
    }
    assert.strictEqual(sc.status, 200, 'send-code failed: ' + JSON.stringify(sc.json));
    const code = sc.json && sc.json.demo_code;
    const lg = await req('POST', '/api/auth/login', { body: { phone: phOf(id), code, national_id: nidOf(id) } });
    assert.strictEqual(lg.status, 200, 'login failed for ' + id + ': ' + JSON.stringify(lg.json));
    const m = String(lg.headers.get('set-cookie') || '').match(/payesh_session=[^;]+/);
    return m ? m[0] : null;
  };

  try {
    assert.ok(await waitInfra(), 'زیرساخت (ردیس) آماده نشد');
    const ckA = await loginAs(102); /* مدیر مدرسهٔ ۱۰۰ (با داده) */
    const ckB = await loginAs(103); /* مدیر مدرسهٔ ۱۰۱ (بی‌داده) */

    /* I-03 زنده: مدرسهٔ بدون رکورد حضور نباید «حضور کامل» بگیرد */
    {
      const r = await req('GET', '/api/v1/analytics/attendance-risk?school_id=101', { cookie: ckB });
      chk('I-03-L1', 'مسیر /attendance-risk: مدرسهٔ بی‌داده ⇒ الگوی هفتگی کاملِ جعلی نیست', () => {
        assert.strictEqual(r.status, 200, 'status=' + r.status + ' ' + JSON.stringify(r.json).slice(0, 120));
        const weekly = r.json && r.json.weekly_pattern;
        assert.ok(weekly, 'weekly_pattern باید در پاسخ باشد');
        assert.notStrictEqual(weekly.weekday_risk_profile, 'PERFECT_ATTENDANCE', 'مدرسهٔ بدون هیچ رکوردی نباید حضور کامل بگیرد');
        assert.strictEqual(weekly.weekday_risk_profile, 'NO_DATA');
      });
    }

    /* I-04/I-07 زنده: پلتفرم هوشمندی — بدون خروجی موتور */
    {
      const r = await req('GET', '/api/v1/analytics/intelligence-platform?school_id=100', { cookie: ckA });
      chk('I-04-L1', 'مسیر /intelligence-platform: بی‌دادهٔ موتور ⇒ زنجیره سالم نیست', () => {
        assert.strictEqual(r.status, 200, 'status=' + r.status + ' ' + JSON.stringify(r.json).slice(0, 120));
        const snap = r.json.intelligence_platform;
        assert.ok(snap.chain_health, 'chain_health باید در پاسخ باشد');
        assert.notStrictEqual(snap.chain_health.chain_status, 'HEALTHY', 'بدون خروجی موتورها، زنجیره سالم نیست');
      });
      chk('I-07-L1', 'مسیر /intelligence-platform: متریک‌های خلاصه نباید سخت‌کد باشند', () => {
        const snap = r.json.intelligence_platform;
        const m = snap.summary_metrics;
        assert.notStrictEqual(m.school_intelligence_score, 86.5, 'متریک سخت‌کد نباید جای خروجی موتور بنشیند');
        assert.notStrictEqual(m.health_index, 84.0);
        assert.strictEqual(m.school_intelligence_score, null, 'بدون خروجی موتور، مقدار باید null باشد');
        assert.strictEqual(m.decision_items_count, null);
        assert.strictEqual(snap.data_status, 'NO_DATA');
      });
    }

    /* I-08/I-09 زنده: گواهی انتشار بدون شاهد صادر نمی‌شود */
    {
      const r = await req('GET', '/api/v1/analytics/intelligence-certification?school_id=100', { cookie: ckA });
      chk('I-08/09-L1', 'مسیر /intelligence-certification: بدون شاهدِ گیت/رانتایم ⇒ گواهی صادر نیست', () => {
        assert.strictEqual(r.status, 200, 'status=' + r.status);
        const cert = r.json.intelligence_certification;
        assert.notStrictEqual(cert.certification_status, 'CERTIFIED', 'گواهی خوداظهاری ممنوع');
        assert.strictEqual(cert.release_ready, false);
        assert.strictEqual(cert.quality_gates.all_passed, false);
        assert.strictEqual(cert.e2e_chain_execution.verified, false);
        assert.strictEqual(cert.e2e_chain_execution.verification_mode, 'SIMULATION');
      });
    }

    /* I-05 زنده: داشبورد حاکمیت برای مدرسهٔ بدون اقدام */
    {
      const r = await req('GET', '/api/v1/analytics/intelligence-governance?school_id=100', { cookie: ckA });
      chk('I-05-L1', 'مسیر /intelligence-governance: بی‌اقدام ⇒ انطباقِ ۱۰۰٪ جعلی نیست', () => {
        assert.strictEqual(r.status, 200, 'status=' + r.status);
        const snap = r.json.governance_snapshot;
        assert.ok(snap, 'governance_snapshot باید در پاسخ باشد');
        const hc = snap.human_control_metrics;
        assert.ok(hc, 'human_control_metrics باید در پاسخ باشد');
        assert.notStrictEqual(hc.approval_rate_pct, 100.0, 'بدون هیچ اقدامی نرخ تأیید ۱۰۰٪ مثبت کاذب است');
        assert.strictEqual(hc.approval_rate_pct, null);
        assert.notStrictEqual(hc.compliance_status, 'COMPLIANT');
      });
    }

    /* I-06 زنده: حافظهٔ بازخورد — مدرسهٔ بدون مداخله */
    {
      const r = await req('GET', '/api/v1/analytics/feedback-learning-memory?school_id=100', { cookie: ckA });
      chk('I-06-L1', 'مسیر /feedback-learning-memory: بی‌مداخله ⇒ تاریخچهٔ پیش‌فرض ساخته نمی‌شود', () => {
        assert.strictEqual(r.status, 200, 'status=' + r.status);
        const profile = r.json.learning_profile;
        const acc = profile.accuracy_report;
        assert.ok(acc, 'accuracy_report باید در پاسخ باشد');
        assert.strictEqual(acc.total_recommendations, 0, 'مدرسهٔ بدون مداخله نباید پیشنهاد جعلی بگیرد');
        assert.notStrictEqual(acc.escalation_accuracy_pct, 100.0);
        assert.strictEqual(acc.escalation_accuracy_pct, null);
      });
    }
  } finally {
    try { server.close(); } catch (e) {}
  }
}

(async () => {
  console.log('A-31 — تمامیت معنایی/گواهی موتورهای هوشمندی (I-02..I-09)');
  partA();
  await partB();
  console.log('\n──────────────────────────────────────────');
  console.log(`a31-intelligence-semantic-integrity: ${pass}/${pass + fail} موفق ${fail === 0 ? '✅' : '❌'}`);
  if (failures.length) console.log('ناموفق‌ها: ' + failures.join(', '));
  /* پاک‌سازی: موتورهای پس‌زمینهٔ سرور ممکن است هنوز زنده باشند؛ خروجِ سریع
     پیش از هر تیکِ بعدی، از خطای «پایگاه‌داده حذف شد» جلوگیری می‌کند. */
  pgQ(ADMIN_URL, `DROP DATABASE IF EXISTS ${DB_NAME} WITH (FORCE)`).catch(() => {});
  process.exit(fail === 0 ? 0 : 1);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
