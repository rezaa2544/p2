#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   تستِ tools/check-authz.js (فاز ۲ بند ۳)
   ───────────────────────────────────────────────────────────────────
   P1 خطاگیریِ واقعی: ۵۳ ناهماهنگیِ شناخته‌شده (تک‌به‌تک ثابت‌شده در
      بازبینی) باید دقیقاً همان فهرست باشد — نه کمتر (چک‌کننده کار
      می‌کند) و نه بیشتر (بی‌حقیقتی/خطایِ کاذب نیست).
   P2 بدونِ خطایِ کاذب: درختِ مصنوعیِ هم‌آرا → خروجی ۰.
   P3 کشفِ انحرافِ تازه: هم‌آن درخت + یک نوشتهٔ بی‌مجوز → خروجی ۱
      با فهرستِ درست.
   ═══════════════════════════════════════════════════════════════════ */
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const FROZEN = [
        "class-membership-save — manager → class_subject_members",
        "bus-event — driver → bus_events",
        "bus-event — driver → notify_queue",
        "bus-need-parent-save — parent → bus_needs",
        "bus-event-student — student → bus_events",
        "bus-event-student — student → notify_queue",
        "bus-loc-driver — driver → bus_locations",
        "bus-loc-student — student → bus_locations",
        "sd-save — manager → sedascores",
        "sd-del — manager → sedascores",
        "imp-preview — manager → nid_conflicts",
        "imp-commit — manager → parent_links",
        "smode-save — edu_office → attendance_modes",
        "smode-save — edu_office → notify_queue",
        "risk-notify — teacher → notifications",
        "invite-parents — manager → parent_subscriptions",
        "mtg-save — teacher → meeting_slots",
        "mtg-book-ok — parent → meeting_slots",
        "mtg-book-ok — parent → notifications",
        "mtg-del — teacher → meeting_slots",
        "year-close — manager → school_years",
        "year-close — manager → student_archive",
        "year-reopen — manager → school_years",
        "promote-run — manager → student_archive",
        "tr-ok — manager → nid_conflicts",
        "conf-dismiss — manager → nid_conflicts",
        "dojo-save — manager → dojo_types",
        "ann-del — edu_office → announcements",
        "ann-save — edu_office → announcements",
        "sms-send — manager → sms_log",
        "sms-send — manager → sms_wallet",
        "sms-topup — manager → sms_wallet",
        "notify-approve — manager → sms_log",
        "notify-approve — manager → sms_wallet",
        "notify-approve-sel — manager → sms_log",
        "notify-approve-sel — manager → sms_wallet",
        "notify-auto-off — manager → schools",
        "notify-save-settings — manager → schools",
        "sms-topup-ok — manager → sms_wallet",
        "vclass-links — manager → vclass_links",
        "vc-join — student → vclass_attendance",
        "vc-leave — student → vclass_attendance",
        "hw-window-save — manager → hw_assignments",
        "hw-lock — manager → hw_assignments",
        "vclass-del — manager → vclass_questions",
        "vclass-q-answer-save — manager → vclass_questions",
        "hw-save — manager → hw_assignments",
        "hw-del — manager → hw_assignments",
        "hw-del — manager → hw_submissions",
        "hw-grade-save — manager → hw_submissions",
        "office-msg-send — edu_office → notifications",
        "sub-save — manager → substitutions",
        "sub-del — manager → substitutions",

];

let pass = 0, fail = 0, errors = [];
function check(name, cond, extra){
  if(cond){ pass++; console.log('  ✅ ' + name); }
  else { fail++; errors.push(name); console.log('  ❌ ' + name + (extra ? ' — ' + extra : '')); }
}
function run(env, cwd){
  try {
    return { code: 0, out: execFileSync('node', ['tools/check-authz.js'], { encoding: 'utf8', env: Object.assign({}, process.env, env), cwd }) };
  } catch (e) {
    return { code: e.status, out: String(e.stdout || '') + String(e.stderr || '') };
  }
}
const strip = out => out.split('\n').filter(l => / — /.test(l) && l.includes('→')).map(l => l.trim().replace(/\s*\([^)]*\)\s*$/, ''));

console.log('▸ فاز ۲ بند ۳ — چک‌کنندهٔ هماهنگی مجوزها');

/* ── P1: فهرستِ شناخته‌شده ── */
const real = run({}, ROOT);
check('P1a درختِ فعلی: خروجی ۱ (ناهماهنگی‌هایِ شناخته‌شده)', real.code === 1, 'code=' + real.code);
const realList = strip(real.out);
check('P1b دقیقاً ۵۳ ناهماهنگی — نه کمتر', realList.length === FROZEN.length, 'got=' + realList.length);
const missing = FROZEN.filter(f => !realList.includes(f));
const extra = realList.filter(f => !FROZEN.includes(f));
check('P1c همهٔ ۵۳ موردِ شناخته‌شده گزارش شد', missing.length === 0, 'گمشده: ' + missing.join(' | '));
check('P1d موردِ بی‌ربط/کاذبی گزارش نشد (فریزِ فهرست)', extra.length === 0, 'اضافه: ' + extra.join(' | '));

/* ── P2/P3: درختِ مصنوعی ── */
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'authzchk-'));
const js = path.join(tmp, 'src', 'js');
fs.mkdirSync(js, { recursive: true });
fs.mkdirSync(path.join(tmp, 'server'), { recursive: true });
fs.writeFileSync(path.join(tmp, 'tools-check-authz.js'), '');
const AUTHZ = `var ACTION_ROLES = {
 'act-one': ['manager'],
 'act-two': ['teacher'],
};
`;
const FACT = `function oneActions(e, el, id, a, rawId){
  return {
   'act-one'(){
    insert('users',{id:1});
   }
  };
}
`;
const FACT2 = `function twoActions(e, el, id, a, rawId){
  return {
   'act-two'(){
    insert('grades',{id:1});
   }
  };
}
`;
const SYNC = `const WRITE_PERMS = { manager: ['users'], teacher: ['grades'] };
module.exports = { WRITE_PERMS };
`;
fs.writeFileSync(path.join(js, '30-authz.js'), AUTHZ);
fs.writeFileSync(path.join(js, '19-actions-one.js'), FACT);
fs.writeFileSync(path.join(js, '19-actions-two.js'), FACT2);
fs.writeFileSync(path.join(tmp, 'server', 'sync.js'), SYNC);
const ENV = { PAYESH_AUTHZ_SRC: js, PAYESH_SYNC_PATH: path.join(tmp, 'server', 'sync.js') };

const syn = run(ENV, ROOT);
check('P2 درختِ هم‌آرا: خروجی ۰ و «تطبیق کامل»', syn.code === 0 && /تطبیق کامل/.test(syn.out), 'code=' + syn.code + ' out=' + syn.out.slice(0, 200));

/* انحرافِ تازه: act-one یک مجموعهٔ جدید می‌نویسد که در WRITE_PERMS نیست */
fs.writeFileSync(path.join(js, '19-actions-one.js'), FACT.replace("insert('users',{id:1});", "insert('users',{id:1});\n    insert('sms_log',{id:2});"));
const drift = run(ENV, ROOT);
const driftList = strip(drift.out);
check('P3 انحرافِ تازه: خروجی ۱', drift.code === 1, 'code=' + drift.code);
check('P3 دقیقاً همان انحراف گزارش شد (نه کاذب)',
      driftList.length === 1 && driftList[0] === 'act-one — manager → sms_log',
      'list=' + JSON.stringify(driftList));

fs.rmSync(tmp, { recursive: true, force: true });
console.log('\ncheck-authz (تستِ چک‌کننده): ' + pass + ' بررسی — ' + (fail ? '❌ ' + fail + ' خطا' : '✅ همه سبز'));
if (fail) { console.log(errors.join('\n')); process.exit(1); }
process.exit(0);
