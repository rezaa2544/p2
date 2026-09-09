#!/usr/bin/env node
/**
 * E.1 جهش‌کشی — «نمره‌های تئوری/عملی هنرستان»
 * 5 جهش هدفمند باید هرکدام توسط tests/vocational-grades.js کشته شوند:
 *  - حذف is_vocational از ذخیرهٔ ترکیبی (V5)
 *  - شکستن میانگین (t+p)/2 (V5)
 *  - پنهان‌کردنِ ستون‌های نما (V10)
 *  - ازبین‌رفتنِ قسمتِ عملی در ذخیره (V5)
 *  - حذفِ رندرِ قسمت‌ها از فرم (V3)
 *
 * اجرا:  node tests/vocational-grades-mutations.js
 * زمان:  ~2 دقیقه (هر جهش = build + اجرای کامل تست)
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const FILES = {
  actions: path.join(ROOT, 'src/js/19-actions-core.js'),
  grades: path.join(ROOT, 'src/js/13-grades.js'),
  modals: path.join(ROOT, 'src/js/18-modals.js'),
};
const src = {};
for (const k of Object.keys(FILES)) src[k] = fs.readFileSync(FILES[k], 'utf8');

const MUTS = [
  {
    file: 'actions',
    name: 'M1 is_vocational از ذخیرهٔ ترکیبی حذف شود',
    bad: "      data={score:score,term:V('g_term'),exam_type:V('g_type'),kind:'theory',theoretical_score:t,practical_score:p,is_vocational:true};",
    mut: "      data={score:score,term:V('g_term'),exam_type:V('g_type'),kind:'theory',theoretical_score:t,practical_score:p};",
    expectFail: 'is_vocational ذخیره نشد',
  },
  {
    file: 'actions',
    name: 'M2 میانگینِ قسمت‌ها بشود فقط تئوری',
    bad: '      const score=Math.round(((t!=null&&p!=null)?(t+p)/2:(t!=null?t:p))*100)/100;',
    mut: '      const score=Math.round(((t!=null&&p!=null)?t:(t!=null?t:p))*100)/100;',
    expectFail: 'score باید (۱۴+۱۶)/۲',
  },
  {
    file: 'grades',
    name: 'M3 ستون‌های تئوری/عملی هرگز نمایش داده نشوند',
    bad: "  const _ws=u.role==='student'?workshopStudent(u.id):workshopSchool((byId('classes',cid)||{}).school_id);",
    mut: '  const _ws=false;',
    expectFail: 'ستون‌های تئوری/عملی در کلاسِ کارگاهی نیستند',
  },
  {
    file: 'actions',
    name: 'M4 قسمتِ عملی هرگز ذخیره نشود',
    bad: "      data={score:score,term:V('g_term'),exam_type:V('g_type'),kind:'theory',theoretical_score:t,practical_score:p,is_vocational:true};",
    mut: "      data={score:score,term:V('g_term'),exam_type:V('g_type'),kind:'theory',theoretical_score:t,practical_score:null,is_vocational:true};",
    expectFail: 'قسمت‌ها درست ذخیره نشدند',
  },
  {
    file: 'modals',
    name: 'M5 قسمت‌های تئوری/عملی از فرم حذف شوند',
    bad: "    ${_gparts}</div>`,'grade-save'));",
    mut: "    </div>`,'grade-save'));",
    expectFail: 'فیلدِ «نمرهٔ تئوری» در فرم نیست',
  },
];

let killed = 0;
for (const m of MUTS) {
  if (src[m.file].split(m.bad).length !== 2) {
    console.log(`  ⚠️  ${m.name}: الگوی جهش پیدا نشد — کد عوض شده؟`);
    continue;
  }
  fs.writeFileSync(FILES[m.file], src[m.file].replace(m.bad, m.mut));
  try {
    execSync('node build.js', { stdio: 'pipe' });
  } catch (e) {
    console.log(`  ✅ ${m.name} (build شکست — کشته شد)`);
    killed++;
    continue;
  }
  let out;
  try {
    out = execSync('node tests/vocational-grades.js', { stdio: 'pipe', encoding: 'utf8' });
    console.log(`  ❌ ${m.name}: جهش زنده ماند!`);
  } catch (e) {
    out = (e.stdout || '') + String(e.message);
    if (out.includes('❌') && out.includes(m.expectFail)) {
      console.log(`  ✅ ${m.name} کشته شد`);
      killed++;
    } else {
      console.log(`  ⚠️  ${m.name}: کشته شد اما نه با پیامِ انتظار (${m.expectFail})`);
    }
  }
  fs.writeFileSync(FILES[m.file], src[m.file]);
}

/* بازبینیِ خطِ پایه (بدون جهش) */
execSync('node build.js', { stdio: 'pipe' });
try {
  execSync('node tests/vocational-grades.js', { stdio: 'pipe' });
  console.log('  ✅ خطِ پایه (بدون جهش) سبز است');
} catch (e) {
  console.log('  ❌ خطِ پایه شکست — جهش‌ها را دوباره بررسی کنید');
}
console.log(`\nvocational-grades-mutations: ${killed}/${MUTS.length} جهش کشته شد ${killed === MUTS.length ? '✅' : '❌'}`);
process.exit(killed === MUTS.length ? 0 : 1);
