#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   تک‌منبعِ حقیقتِ مجوزها (فاز ۲ بند  — اجرای AD 2.2، قدمِ اول)
   ───────────────────────────────────────────────────────────────────
   چک‌کنندهِٔ build-time:
   ۱. ACTION_ROLES را از src/js/30-authz.js می‌خواند.
   ۲. همهٔ اکشن‌هایی که داده می‌نویسند را استخراج می‌کند — هم اکشن‌هایِ
      A (در ۹ فایلِ 19-actions-*.js و آبجکت‌هایِ *_ACTIONSِ ماژول‌ها)
      و هم تابع‌هایِ کمکی که اکشن‌ها صدا می‌زنند (تا عمق ۲). نوشتار =
      فراخوانیِ insert/update/remove با نامِ مجموعهِٔ ثابت.
   ۳. برای هر اکشن، نقش‌های مجاز (ACTION_ROLES) را با WRITE_PERMS سرور
      (server/sync.js) تطبیق می‌دهد: هر نقشی که اکشن را اجرا می‌کند باید
      حقِ نوشتنِ همهٔ مجموعه‌هایِ آن را داشته باشد — وگرنه عملیات در
      سرور رد می‌شود (role_denied) و صفِ همگام‌سازیِ کلاینت گیر می‌کند.
   ۴. هر ناهماهنگی: فهرست + process.exit(1).

   اجرا:   node tools/check-authz.js              (فقط گزارش)
           node build.js --check                   (build + این چک)
   متغیرهایِ محیطی برای تست: PAYESH_AUTHZ_SRC / PAYESH_SYNC_PATH
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = process.env.PAYESH_AUTHZ_SRC || path.join(ROOT, 'src/js');
const SYNC_PATH = process.env.PAYESH_SYNC_PATH || path.join(ROOT, 'server/sync.js');

/* ─────────────────────────── ابزارهایِ عمومی ─────────────────────── */
function allFiles(){ return fs.readdirSync(SRC).filter(f => f.endsWith('.js')).sort(); }
const readLines = f => fs.readFileSync(path.join(SRC, f), 'utf8').split('\n');

/* ─────────────────── نقشهٔ تابع‌هایِ نام‌دارِ کلاینت ─────────────── */
function buildFunctionMap(){
  const map = {};
  for (const f of allFiles()){
    const lines = readLines(f);
    for (let i = 0; i < lines.length; i++){
      const l = lines[i];
      const m = l.match(/^\s*(?:function\s+([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*\{|(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:function\s*\([^)]*\)\s*\{|\([^)]*\)\s*=>\s*\{|\w+\s*=>\s*\{))\s*$/);
      if (!m) continue;
      const name = m[1] || m[2];
      const ind = l.match(/^ */)[0].length;
      let end = -1;
      for (let j = i + 1; j < lines.length; j++){
        if (lines[j].match(/^ */)[0].length === ind && /^\s*\}/.test(lines[j])){ end = j; break; }
      }
      if (end < 0) continue;
      if (!map[name]) map[name] = { file: f, body: lines.slice(i + 1, end).join('\n') };
    }
  }
  return map;
}

/* ─────────────── اکشن‌ها: A (پارسیال‌ها) + آبجکت‌هایِ *_ACTIONS ─────── */
const ENTRY_RE = /^ {2,3}(?:'([a-z0-9-]+)'|([a-z][a-z0-9-]*))\s*\(\s*(?:[a-z]\s*,\s*)?(?:[a-z]\s*,\s*)?(?:[a-z]\s*,\s*)?(?:[a-z])?\s*\)\s*\{/;
const SHORT_RE = /^ {2,3}'([a-z0-9-]+)':/;
const isComment = l => { const t = l.trim(); return t.startsWith('/*') || t.startsWith('*') || t.startsWith('//'); };

function containerRanges(){
  /* [file, firstLine(0-based), lastLine(0-based)] هر ظرفِ اکشن */
  const out = [];
  for (const f of allFiles()){
    const lines = readLines(f);
    if (f.startsWith('19-actions-')){
      /* بدنهٔ تابعِ پارسیال: از `return {` تا خطِ `};` هم‌سطح */
      for (let i = 0; i < lines.length; i++){
        if (/^ {2}return \{\s*$/.test(lines[i])){
          let end = -1;
          for (let j = i + 1; j < lines.length; j++){
            if (lines[j] === '  };'){ end = j; break; }
          }
          if (end > i) out.push([f, i + 1, end - 1]);
        }
      }
      continue;
    }
    const re = /^const\s+[A-Z][A-Z0-9_]*_ACTIONS\s*=\s*\{\s*$/;
    for (let i = 0; i < lines.length; i++){
      if (re.test(lines[i])){
        let end = -1;
        for (let j = i + 1; j < lines.length; j++){
          if (lines[j] === '};'){ end = j; break; }
        }
        if (end > i) out.push([f, i + 1, end - 1]);
      }
    }
  }
  return out;
}

function parseActions(){
  const actions = {};
  for (const [file, first, last] of containerRanges()){
    const lines = readLines(file);
    const starts = [];
    for (let i = first; i <= last; i++){
      if (ENTRY_RE.test(lines[i]) || SHORT_RE.test(lines[i])){
        const m = lines[i].match(ENTRY_RE) || lines[i].match(SHORT_RE);
        starts.push({ name: m[1] || m[2], start: i });
      }
    }
    const entries = [];
    for (let k = 0; k < starts.length; k++){
      let lead = starts[k].start;
      while (lead > first && isComment(lines[lead - 1])) lead--;
      entries.push({ name: starts[k].name, lead, start: starts[k].start });
    }
    for (let k = 0; k < entries.length; k++){
      let end = (k + 1 < entries.length) ? entries[k + 1].lead - 1 : last;
      while (end > entries[k].start && lines[end].trim() === '') end--;
      actions[entries[k].name] = { file, body: lines.slice(entries[k].lead, end + 1).join('\n') };
    }
  }
  return actions;
}

/* ─────────────── استخراجِ مجموعه از یک بدنه ───────────────────────── */
const WRITE_RE = /(?<![\w.])\b(?:insert|update|remove)\(\s*(['"])([a-z_][a-z0-9_]*)\1/g;
function writesOf(body){
  const colls = new Set();
  let m;
  WRITE_RE.lastIndex = 0;
  while ((m = WRITE_RE.exec(body))) colls.add(m[2]);
  return [...colls];
}
function calledFnsOf(body, fnMap){
  const out = new Set();
  const re = /\b([A-Za-z_$][\w$]*)\s*\(/g;
  let m;
  while ((m = re.exec(body))){ if (fnMap[m[1]]) out.add(m[1]); }
  return out;
}

/* ─────────────────── ACTION_ROLES (30-authz.js) ───────────────────── */
function parseActionRoles(){
  const text = fs.readFileSync(path.join(SRC, '30-authz.js'), 'utf8');
  const i0 = text.indexOf('var ACTION_ROLES = {');
  if (i0 < 0) throw new Error('ACTION_ROLES پیدا نشد');
  const lines = text.split('\n');
  const sIdx = lines.findIndex(l => l.includes('var ACTION_ROLES = {'));
  let end = -1;
  for (let i = sIdx + 1; i < lines.length; i++){ if (lines[i] === '};'){ end = i; break; } }
  const body = lines.slice(sIdx + 1, end).join('\n');
  const out = {};
  const re = /'([a-z0-9-]+)'\s*:\s*\[([^\]]*)\]/g;
  let m;
  while ((m = re.exec(body))) out[m[1]] = m[2].split(',').map(s => s.trim().replace(/['"]/g, '')).filter(Boolean);
  return out;
}

/* ─────────────────────────── نتیجه ───────────────────────────────── */
function extract(){
  const fnMap = buildFunctionMap();
  const actions = parseActions();
  const actionRoles = parseActionRoles();
  const result = { actions: {}, unlisted: [] };
  for (const [name, act] of Object.entries(actions)){
    const colls = new Set(writesOf(act.body));
    /* تا عمق ۲: اکشن ← تابعِ کمکی ← تابع. فازِ رندر (render و …) در
       گراف نیست: نوشتارهایِ نمایش (مثلِ subOf در نوارِ اشتراک)
       مالِ اکشن نیست. */
    const UI_PHASE = new Set(['render','renderShell','renderRoute','_renderRouteInner','openModal','closeModal','askConfirm','toast']);
    let frontier = [...calledFnsOf(act.body, fnMap)].filter(f => !UI_PHASE.has(f));
    const seen = new Set([name]);
    for (let d = 0; d < 2 && frontier.length; d++){
      const next = [];
      for (const fn of frontier){
        if (seen.has(fn)) continue;
        seen.add(fn);
        for (const c of writesOf(fnMap[fn].body)) colls.add(c);
        for (const g of calledFnsOf(fnMap[fn].body, fnMap)) if (!seen.has(g) && !UI_PHASE.has(g)) next.push(g);
      }
      frontier = next;
    }
    result.actions[name] = { file: act.file, colls: [...colls].sort() };
    if (colls.size && !actionRoles[name]) result.unlisted.push(name);
  }
  return result;
}

/* استثنایِ محدودشدهٔ سمتِ سرور: teacher روی users فقط با کلیدهایِ
   IEP/DROP (iepUsersUpdate/dropUsersUpdate در sync.js) — بند ۲.۲. */
const SCOPED = { teacher: { users: true } };

function check(ex){
  delete require.cache[require.resolve(SYNC_PATH)];
  const { WRITE_PERMS } = require(SYNC_PATH);
  const canWrite = (role, coll) => {
    const list = WRITE_PERMS[role];
    return !!list && (list.indexOf('*') > -1 || list.indexOf(coll) > -1);
  };
  const violations = [];
  for (const [name, a] of Object.entries(ex.actions)){
    if (!a.colls.length) continue;
    const roles = ex.actionRoles ? ex.actionRoles[name] : undefined;
    if (!roles) continue;
    for (const role of roles){
      for (const coll of a.colls){
        if (SCOPED[role] && SCOPED[role][coll]) continue;
        if (!canWrite(role, coll)) violations.push({ action: name, role, coll, file: a.file });
      }
    }
  }
  return { violations };
}

if (require.main === module){
  const ex = extract();
  ex.actionRoles = parseActionRoles();
  const { violations } = check(ex);
  const nAct = Object.keys(ex.actions).length;
  const nWrite = Object.values(ex.actions).filter(a => a.colls.length).length;
  console.log(`check-authz: اکشن ${nAct} (از آن‌ها ${nWrite} روی داده می‌نویسند)`);
  console.log(`اکشن‌هایِ نویسندهٔ بی‌برچسب (محدودیتِ canAction ندارند؛ fail-closedِ سرور نگهبان است): ${ex.unlisted.length}`);
  if (violations.length){
    console.log(`\n❌ ${violations.length} ناهماهنگی — نقشِ مجاز، حقِ نوشتنِ مجموعه را در WRITE_PERMS ندارد:`);
    for (const v of violations) console.log(`   ${v.action} — ${v.role} → ${v.coll}  (${v.file})`);
    console.log('\nbuild متوقف شد: WRITE_PERMS (server/sync.js) را با واقعیتِ اکشن‌ها همگام کنید.');
    process.exit(1);
  }
  console.log('\n✅ تطبیق کامل: هر اکشنِ نویسنده، نقش‌هایش را در WRITE_PERMS سرور دارد.');
}

module.exports = { extract, check, parseActionRoles, buildFunctionMap };
