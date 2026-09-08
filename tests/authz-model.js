#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   authz-model — مدلِ مرکزیِ مجوز (R96, P0-1/P0-2)
   ───────────────────────────────────────────────────────────────────
   A) هر کلیدِ فیلدی که کلاینت با insert/update/add می‌نویسد باید در
      مدلِ آن مجموعه باشد (وگرنه دروازهٔ فیلد آن را می‌کُشد).
   B) هر مجموعهٔ seed باید در مدل باشد (مگر فهرستِ demo-only).
   C) فیلدهای رکوردهای seed ⊆ فیلدهای مدل (+version که سرور مدیریت
      می‌کند).
   D) بردارِ نقش‌ها — assertions حداقلیِ مستقیم روی مدل (نه روی
      جدولِ مشتق‌شده، تا test circular نباشد) + canOp از sync.js.
   اجرا: node tests/authz-model.js
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'src', 'js');
const MODEL = path.join(ROOT, 'authz', 'model.json');

let pass = 0, fail = 0;
const errors = [];
function chk(name, cond, extra) {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; errors.push(name + (extra !== undefined ? ' — ' + String(extra).slice(0, 200) : '')); console.log('  ❌ ' + name + (extra !== undefined ? ' — ' + String(extra).slice(0, 200) : '')); }
}

/* ── A) استخراجِ فیلدهای کلاینت از insert/update/add ─────────────── */
/* برایِ هر فراخوانی، آرگومانِ اول (نامِ مجموعه) و اولین آبجکتِ
   لیترالیِ آرگومان‌ها را می‌یابد و کلیدهای سطحِ یک را برمی‌گرداند.
   اگر آبجکت spread دارد، null برمی‌گرداند (تست را شکست نمی‌دهد). */
function extractWriteCalls(fileText) {
  const out = [];
  const re = /\b(insert|update|add)\s*\(\s*['"]([a-z_]+)['"]/g;
  let m;
  while ((m = re.exec(fileText))) {
    const coll = m[2];
    /* شروعِ آرگومان‌ها: بعد از اولین '(' */
    let i = re.lastIndex;
    /* اولین '{' را تا عمقِ پرانتزِ فراخوانی=0 بگرد */
    let depth = 1, j = i, braceAt = -1;
    for (; j < fileText.length && depth > 0; j++) {
      const ch = fileText[j];
      if (ch === '(') depth++;
      else if (ch === ')') depth--;
      else if (ch === '{' && depth === 1) { braceAt = j; break; }
      else if (ch === "'") { j = skipStr(fileText, j, "'"); }
      else if (ch === '"') { j = skipStr(fileText, j, '"'); }
    }
    if (braceAt < 0) continue;
    const objEnd = matchBrace(fileText, braceAt);
    if (objEnd < 0) continue;
    const obj = fileText.slice(braceAt, objEnd + 1);
    if (/\.\.\./.test(obj)) continue; /* spread — نمی‌شود قطعی دانست */
    const fields = topLevelKeys(obj);
    if (fields) out.push({ coll, fields, line: fileText.slice(0, m.index).split('\n').length });
  }
  return out;
}
function skipStr(s, i, q) {
  for (let k = i + 1; k < s.length; k++) {
    if (s[k] === '\\') k++;
    else if (s[k] === q) return k;
  }
  return s.length - 1;
}
function matchBrace(s, openIdx) {
  let depth = 0;
  for (let k = openIdx; k < s.length; k++) {
    const ch = s[k];
    if (ch === '{') depth++;
    else if (ch === '}') { depth--; if (depth === 0) return k; }
    else if (ch === "'") k = skipStr(s, k, "'");
    else if (ch === '"') k = skipStr(s, k, '"');
  }
  return -1;
}
function topLevelKeys(obj) {
  const keys = [];
  let depth = 0;
  let inStr = null;
  for (let k = 0; k < obj.length; k++) {
    const ch = obj[k];
    if (inStr) { if (ch === '\\') k++; else if (ch === inStr) inStr = null; continue; }
    if (ch === "'" || ch === '"') { inStr = ch; continue; }
    if (ch === '{' || ch === '(' || ch === '[') depth++;
    else if (ch === '}' || ch === ')' || ch === ']') depth--;
    else if (ch === ':' && depth === 1) {
      /* کلید: آخرِ متنِ قبلِ ':' — ident یا 'string'.
         فقط اگر قبلِ کلید (بعد از whitespace) '{' یا ',' باشد —
         وگرنه ':' متعلق به ternary/a.b است، نه کلیدِ آبجکت. */
      let a = k - 1;
      while (a >= 0 && /\s/.test(obj[a])) a--;
      let b = a;
      if (obj[a] === "'" || obj[a] === '"') {
        b = a - 1;
        while (b >= 0 && obj[b] !== obj[a]) b--;
      } else {
        while (b >= 0 && /[\w$]/.test(obj[b])) b--;
      }
      let pre = b - 1;
      while (pre >= 0 && /\s/.test(obj[pre])) pre--;
      if (obj[pre] !== '{' && obj[pre] !== ',') continue;
      const key = obj.slice(b + 1, a + 1);
      if (key && /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(key) && !/^\d+$/.test(key)) keys.push(key);
    }
  }
  return keys;
}

const model = JSON.parse(fs.readFileSync(MODEL, 'utf8'));
const colls = model.collections;
const seeded = JSON.parse(fs.readFileSync(path.join(ROOT, 'server', 'data', 'payesh.json'), 'utf8'));

/* فهرستِ مجموعه‌های seed (آرایه‌های تاپ‌لوول) */
const seedColls = Object.keys(seeded).filter(k => Array.isArray(seeded[k]));
/* demo-only — فقط در دمو با add() می‌سازند، همگام‌سازی‌شان سروری نیست */
const DEMO_ONLY = { tuition_plans: 1 };

console.log('');
console.log('— A) فیلدهای نوشته‌شدهٔ کلاینت ⊆ مدل —');
const clientFields = {};
let callSites = 0, spreadSkipped = 0;
for (const f of fs.readdirSync(SRC).filter(x => x.endsWith('.js'))) {
  const t = fs.readFileSync(path.join(SRC, f), 'utf8');
  for (const c of extractWriteCalls(t)) {
    callSites++;
    for (const k of c.fields) (clientFields[c.coll] = clientFields[c.coll] || new Set()).add(k);
  }
}
let missingFieldFails = 0;
for (const coll of Object.keys(clientFields).sort()) {
  if (!colls[coll]) { chk('کلاینت: ' + coll, false, 'در مدل نیست (کلاینت می‌نویسد)'); missingFieldFails++; continue; }
  /* password در users: خارج از جهانِ فیلد (استثنایِ اختصاصیِ دروازه — فقط ins/manager) */
  const extra = [...clientFields[coll]].filter(k => !colls[coll].fields.includes(k) && !(coll === 'users' && k === 'password'));
  chk('کلاینت: ' + coll + ' (' + clientFields[coll].size + ' فیلد)', extra.length === 0, 'خارج از مدل: ' + extra.join(','));
  if (extra.length) missingFieldFails++;
}
chk('A) کلِ فراخوانی‌های extractable شمارش شدند (> 40)', callSites > 40, 'callSites=' + callSites);

/* A2: فراخوانی‌هایِ تست‌ها (tests/*.js) هم — مثلِ S5 server3 که
   فیلدِ role را روی notifications می‌نویست */
console.log('');
console.log('— A2) فیلدهای نوشته‌شدهٔ تست‌ها ⊆ مدل —');
const testDir = path.join(__dirname);
for (const f of fs.readdirSync(testDir).filter(x => x.endsWith('.js') && x !== 'authz-model.js')) {
  const t = fs.readFileSync(path.join(testDir, f), 'utf8');
  for (const c of extractWriteCalls(t)) {
    if (!colls[c.coll]) { chk('تست: ' + f + ' → ' + c.coll, false, 'مجموعه در مدل نیست'); continue; }
    const extra = c.fields.filter(k => !colls[c.coll].fields.includes(k) && !(c.coll === 'users' && k === 'password'));
    if (extra.length) chk('تست: ' + f + ' → ' + c.coll + '.' + extra.join(','), false, 'خارج از مدل');
  }
}
chk('A2) اسکنِ تکمیل شد', true);

console.log('');
console.log('— B) مجموعه‌های seed در مدل —');
for (const c of seedColls.sort()) {
  if (DEMO_ONLY[c]) continue;
  chk('B) ' + c, !!colls[c], 'در مدل نیست');
}

console.log('');
console.log('— C) فیلدهای seed ⊆ مدل (+version) —');
for (const c of seedColls.sort()) {
  if (!colls[c]) continue;
  const uf = new Set();
  for (const r of seeded[c].slice(0, 40)) if (r && typeof r === 'object') for (const k of Object.keys(r)) uf.add(k);
  /* version: سرور مدیریت می‌کند — password در users: seed اولیه، سمتِ کلاینت فقط در ins/manager */
  const extra = [...uf].filter(k => !colls[c].fields.includes(k) && k !== 'version' && !(c === 'users' && k === 'password'));
  chk('C) ' + c, extra.length === 0, 'فیلدِ seed بیرون از مدل: ' + extra.join(','));
}

console.log('');
console.log('— D) بردارِ نقش‌ها (assertions مستقیم روی مدل) —');
/* سیاستِ del: وراثت از legacy (WRITE_PERMS بدونِ تفکیکِ op) — مدل
   باید دقیقاً همان مجموعه‌ها باشد؛ سفت‌کردن (ownership روی del)
   به‌عنوانِ «باقی‌مانده» در گزارشِ R96 ثبت شده است. */
const inModel = (c, role, op) => !!(colls[c] && Array.isArray(colls[c][op]) && colls[c][op].includes(role));
const delSetOf = (role) => seedColls.filter(c => inModel(c, role, 'del')).sort();
chk('D1) teacher می‌تواند grades بنویسد', inModel('grades', 'teacher', 'ins') && inModel('grades', 'teacher', 'upd'));
chk('D2) teacher: del grades (وارثِ legacy)', inModel('grades', 'teacher', 'del'));
chk('D3) student: hw_submissions + messages دارد، grades نه',
  inModel('hw_submissions', 'student', 'ins') && inModel('messages', 'student', 'ins') && !inModel('grades', 'student', 'ins'));
chk('D4) del-setِ student = دقیقاً لیستِ legacy',
  JSON.stringify(delSetOf('student')) === JSON.stringify(
    ['messages','hw_submissions','vclass_questions','counselor_msgs','bus_events','notify_queue','bus_locations','vclass_attendance','notifications'].sort()),
  JSON.stringify(delSetOf('student')));
chk('D5) parent: hw_submissions نه — فقط مکاتبه', !inModel('hw_submissions', 'parent', 'upd') && inModel('messages', 'parent', 'ins'));
chk('D6) manager: users ins+upd، teacher: users ins نه', inModel('users', 'manager', 'ins') && inModel('users', 'manager', 'upd') && !inModel('users', 'teacher', 'ins'));
chk('D7) del-setِ driver = {bus_events, bus_locations, notify_queue}',
  JSON.stringify(delSetOf('driver')) === JSON.stringify(['bus_events','bus_locations','notify_queue']),
  JSON.stringify(delSetOf('driver')));
chk('D8) counselor: counselor_msgs ins', inModel('counselor_msgs', 'counselor', 'ins'));
chk('D9) edu_office: teacher_schools (GRANTS R96)', inModel('teacher_schools', 'edu_office', 'upd'));
chk('D10) manager: exams + calendar + makeup_classes (GRANTS R96)',
  inModel('exams', 'manager', 'ins') && inModel('calendar', 'manager', 'ins') && inModel('makeup_classes', 'manager', 'ins'));
chk('D11) del روی users فقط manager/superadmin',
  inModel('users', 'manager', 'del') &&
  !['teacher', 'edu_office', 'counselor', 'student', 'parent', 'driver'].some(r => inModel('users', r, 'del')));

/* canOp از خودِ sync.js (مصرف‌کنندهٔ مدل) — fail-closed روی ناخواسته */
const { canOp, ROLE_LEVEL } = require(path.join(ROOT, 'server', 'sync.js'));
chk('D12) canOp: superadmin همه‌چیز', canOp('superadmin', 'grades', 'ins') && canOp('superadmin', 'grades', 'del'));
chk('D13) canOp: مجموعهٔ ناشناخته = رد (حتی superadmin)', canOp('superadmin', 'totally_unknown_coll', 'ins') === false);
chk('D14) canOp: نقشِ ناشناخته = رد', canOp('hacker', 'grades', 'ins') === false);
chk('D15) ROLE_LEVEL نردبان درست',
  ROLE_LEVEL.student === 0 && ROLE_LEVEL.parent === 1 && ROLE_LEVEL.driver === 1 &&
  ROLE_LEVEL.counselor === 3 && ROLE_LEVEL.teacher === 3 && ROLE_LEVEL.edu_office === 3 &&
  ROLE_LEVEL.manager === 4 && ROLE_LEVEL.superadmin === 5);

console.log('');
console.log('────────────────────────────────────────────────────');
if (fail === 0) console.log('authz-model: ' + pass + '/' + pass + ' سبز ✅');
else {
  console.log('authz-model: ' + pass + ' سبز / ' + fail + ' قرمز ❌');
  for (const e of errors) console.log('   ' + e);
  process.exit(1);
}
