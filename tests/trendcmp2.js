#!/usr/bin/env node
/**
 * دور ۷۹ بند ۴ — نمودارِ مقایسه‌ایِ نمره با میانگین کلاس (بند ۴.۹) — پایش
 *
 * B5 دور ۶۹ بجِ عددیِ «· کلاس: X.XX» را ساخت (gradeavg2 قفلش کرد).
 * باقی‌ماندهٔ واقعی: **پوشِ نموداری** روی نمودارِ روند (دور ۴۳) نبود.
 * حالا gradeTrendCard برای هر ستون، تیکِ خط‌چینِ «میانگین کلاس» با
 * همان فرمولِ ارتفاعِ ستون (norm/20) نشان می‌دهد — داخلِ .plot تا
 * صفرِ هر دو یکی باشد؛ منبعِ عدد: classScoreContext (ناشناس، فقط عدد،
 * حداقل ۲ هم‌کلاسیِ دارایِ همان نمره، عضویت از classSubjectMembers).
 *
 *  G1 classScoreContext: avg + avgNorm (نرمالِ ۲۰) درست
 *  G2 نمودار روند: دو تیک با ارتفاعِ درست + لِجِند + توضیحِ تولتیپ
 *  G3 کلاسی که فقط یک نفر نمره دارد: هیچ تیکی
 *  G4 عضویتِ درس (classSubjectMembers) ملاک است — ردّ فردِ خارج از عضویت
 *  G5 پنلِ ولی: همان پوش در نمای فرزند
 *  G6 پاک‌سازی
 *
 * ⚠️ درس (دور ۷۹): پاک‌سازی درونِ main به‌صورتِ همگام اجرا می‌شود و
 * زودتر از زنجیرِ promise‌ی تست‌ها — پاک‌سازی باید خودش یک test در
 * انتهایِ زنجیر باشد.
 *
 * اجرا: node tests/trendcmp2.js   (نیاز: بیلدِ تازه)
 */
const fs = require('fs');
const path = require('path');

let JSDOM;
try { ({ JSDOM } = require('jsdom')); }
catch { console.log('⏭️  jsdom نصب نیست — تست رد شد.  (npm i --no-save jsdom)'); process.exit(1); }

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

let pass = 0, fail = 0;
let __seq = Promise.resolve();
function test(name, fn) {
  const p = __seq.then(() => new Promise((resolve) => {
    let q;
    try { q = fn(); }
    catch (e) { fail++; console.log(`  ❌ ${name}\n     ${e.message}`); resolve(); return; }
    Promise.resolve(q).then(
      () => { pass++; console.log(`  ✅ ${name}`); },
      (e) => { fail++; console.log(`  ❌ ${name}\n     ${e.message}`); }
    ).then(resolve);
  }));
  __seq = p;
}
const assert = (c, m) => { if (!c) throw new Error(m || 'شرط برقرار نیست'); };

const consoleErrors = [];
const dom = new JSDOM(html, {
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  url: 'http://localhost/',
  virtualConsole: new (require('jsdom').VirtualConsole)()
    .on('jsdomError', (e) => consoleErrors.push(e.message))
    .on('error', (m) => consoleErrors.push(String(m))),
});
const win = dom.window;
const W = (expr) => win.eval(expr);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

main().catch((e) => { console.error(e); process.exit(1); });

async function main() {
  await sleep(400);
  console.log('\n▸ نمودارِ مقایسه‌ایِ نمره با میانگین کلاس (بند ۴.۹)');

  test('G0 بوت بدون خطا', () => {
    assert(consoleErrors.length === 0, consoleErrors.slice(0, 2).join(' | '));
  });

  /* ── ستاپ قطعی: درسِ تازه + سه دانش‌آموزِ یک کلاس ── */
  const fx = JSON.parse(W(`JSON.stringify((function(){
    var sc = db.schools[0].id;
    var cls = db.classes.filter(function(c){return c.school_id===sc;})[0];
    var kids = studentsOfClass(cls.id).filter(function(u){return u.role==='student';});
    var s1 = kids[0], s2 = kids[1], s3 = kids[2];
    /* s4 از کلاسِ دیگر است تا نمره‌هایش در میانگینِ cls حساب نشود */
    var s4 = db.users.find(function(u){
      return u.role==='student'&&u.school_id===sc&&kids.every(function(k){return k.id!==u.id;});
    });
    if(!(s1&&s2&&s3&&s4)) return null;
    var subj = insert('subjects',{school_id:sc,name:'درس تست ۴٫۹',code:'',weekly_hours:2,grade:'',field:''});
    var mk = function(st,term,sc2,at){ return insert('grades',{school_id:sc,student_id:st.id,class_id:cls.id,
      subject_id:subj.id,term:term,exam_type:'ک',score:sc2,max_score:20,created_at:at}); };
    var ids = {};
    [mk(s1,'اول',10,'2026-09-01'), mk(s1,'دوم',15,'2026-10-01'),
     mk(s2,'اول',14,'2026-09-02'), mk(s2,'دوم',12,'2026-10-02'),
     mk(s3,'اول',14,'2026-09-03'), mk(s3,'دوم',12,'2026-10-03')].forEach(function(g){ ids[g.id]=1; });
    /* کلاسِ تک‌نفره برای G3 */
    var c2 = insert('classes',{school_id:sc,name:'کلاس تست تک‌نفره',grade:'یازدهم',capacity:5,grade_level:11});
    insert('enrollments',{school_id:sc,class_id:c2.id,student_id:s4.id});
    [mk(s4,'اول',11,'2026-09-04'), mk(s4,'دوم',13,'2026-10-04')].forEach(function(g){ ids[g.id]=1; });
    /* ولیِ s1 برای G5 */
    var par = insert('users',{school_id:sc,role:'parent',full_name:'ولی تست ۴٫۹',
      username:'par_trend_test_'+Math.random().toString(36).slice(2,7),active:1,created_at:todayISO()});
    insert('parent_links',{school_id:sc,parent_id:par.id,student_id:s1.id,created_at:todayISO()});
    return {sc:sc, cls:cls.id, c2:c2.id, subj:subj.id, s1:s1.id, s2:s2.id, s3:s3.id, s4:s4.id,
            par:par.id, gradeIds:Object.keys(ids).map(Number)};
  })())`));
  if(!fx) throw new Error('ستاپ ممکن نیست: به ۴ دانش‌آموز (۳ در یک کلاس + ۱ در کلاسِ دیگر) نمی‌رسید');

  test('G1 classScoreContext: avg + avgNorm درست (۱۰+۱۴+۱۴)/۳', () => {
    const k1 = fx.subj + '|اول|ک', k2 = fx.subj + '|دوم|ک';
    const r = JSON.parse(W(`JSON.stringify(classScoreContext(${fx.cls})[${JSON.stringify(k1)}])`));
    assert(r && Math.abs(r.avg - (10+14+14)/3) < 0.001, 'avg درست نیست: ' + JSON.stringify(r));
    assert(r && Math.abs(r.avgNorm - (10+14+14)/3) < 0.001, 'avgNorm درست نیست: ' + JSON.stringify(r));
    assert(r && r.n === 3 && r.students === 3, 'شمارنده‌ها درست نیستند: ' + JSON.stringify(r));
    const r2 = JSON.parse(W(`JSON.stringify(classScoreContext(${fx.cls})[${JSON.stringify(k2)}])`));
    assert(r2 && Math.abs(r2.avgNorm - 13) < 0.001, 'میانگینِ نوبت دوم ≠ ۱۳: ' + JSON.stringify(r2));
  });

  test('G2 نمودار روند: دو تیکِ میانگین + لِجِند + تولتیپ', () => {
    const h = W(`(function(){S.trendSub=${fx.subj};return gradeTrendCard(${fx.s1});})()`);
    const ticks = (h.match(/avg-tick/g) || []).length;
    assert(ticks === 2, 'باید دقیقاً دو تیک باشد، شد: ' + ticks);
    assert(h.indexOf('bottom:63.3%') > -1, 'تیکِ نخست (۱۲٫۶۷ از ۲۰ = ۳٫۳٪) نیست');
    assert(h.indexOf('bottom:65.0%') > -1, 'تیکِ دوم (۱۳ از ۲۰ = ۵٪) نیست');
    assert(h.indexOf('میانگین کلاس (حداقل ۲ هم‌کلاسی') > -1, 'لِجِندِ میانگین کلاس نیست');
    assert(h.indexOf('میانگین کلاس: ۱۲٫۶۷') > -1, 'توضیحِ تولتیپِ میانگین نیست');
  });

  test('G3 کلاسِ تک‌نفره: هیچ تیکی (میانگینِ تک‌نفره بی‌معناست)', () => {
    const h = W(`(function(){S.trendSub=${fx.subj};return gradeTrendCard(${fx.s4});})()`);
    assert(h.indexOf('trend-chart') > -1, 'نمودار رندر نشد');
    assert(h.indexOf('avg-tick') === -1, 'تیکِ میانگینِ تک‌نفره نباید باشد');
    assert(h.indexOf('میانگین کلاس (حداقل ۲ هم‌کلاسی') === -1, 'لِجِند بدونِ داده نباید باشد');
  });

  test('G4 عضویتِ درس ملاک است — نمرهٔ غیرعضو در میانگین نیست', () => {
    /* عضویتِ صریحِ (کلاس، درس) فقط s1 و s2 → نمرهٔ s3 خارج می‌شود */
    W(`(function(){
      var keep=[${fx.s1},${fx.s2}];
      keep.forEach(function(st){
        var has=(db.class_subject_members||[]).some(function(x){return x.class_id===${fx.cls}&&x.subject_id===${fx.subj}&&x.student_id===st;});
        if(!has) insert('class_subject_members',{class_id:${fx.cls},subject_id:${fx.subj},student_id:st});
      });
    })()`);
    try {
      const k4 = fx.subj + '|اول|ک';
      const r = JSON.parse(W(`JSON.stringify(classScoreContext(${fx.cls})[${JSON.stringify(k4)}])`));
      assert(r && Math.abs(r.avg - 12) < 0.001, 'میانگین باید ۱۲ (بدونِ s3) شود: ' + JSON.stringify(r));
      const h = W(`(function(){S.trendSub=${fx.subj};return gradeTrendCard(${fx.s1});})()`);
      assert(h.indexOf('bottom:60.0%') > -1, 'تیک باید به ۶۰٪ (۲ از ۲) برود');
    } finally {
      W(`(db.class_subject_members||[]).slice().forEach(function(x){
        if(x.class_id===${fx.cls}&&x.subject_id===${fx.subj}) remove('class_subject_members',x.id);});`);
    }
  });

  test('G5 پنلِ ولی: همان پوش در نمای فرزند', () => {
    const h = W(`(function(){
      S.user=byId('users',${fx.par});S.persona=null;S.boss=null;
      S.route='children';S.tab='grades';S.child=${fx.s1};S.filters={};S.trendSub=${fx.subj};
      return renderRoute();
    })()`);
    assert(h.indexOf('avg-tick') > -1, 'پوشِ میانگین در پنلِ ولی نیست');
    assert(h.indexOf('میانگین کلاس (حداقل ۲ هم‌کلاسی') > -1, 'لِجِند در پنلِ ولی نیست');
  });

  test('G6 پاک‌سازی', () => {
    W(`(function(){
      (db.grades||[]).slice().forEach(function(g){ if(g.subject_id===${fx.subj}) remove('grades',g.id); });
      (db.class_subject_members||[]).slice().forEach(function(x){ if(x.subject_id===${fx.subj}) remove('class_subject_members',x.id); });
      (db.enrollments||[]).slice().forEach(function(e){ if(e.class_id===${fx.c2}) remove('enrollments',e.id); });
      (db.parent_links||[]).slice().forEach(function(l){ if(l.parent_id===${fx.par}) remove('parent_links',l.id); });
      remove('subjects',${fx.subj}); remove('classes',${fx.c2}); remove('users',${fx.par});
      S.user=null;S.route='dashboard';S.child=null;S.trendSub=0;
    })()`);
    assert(W(`db.grades.filter(function(g){return g.subject_id===${fx.subj};}).length`) === 0, 'پاک‌سازی کامل نشد');
  });

  await sleep(150);
  console.log(`\ntrendcmp2: ${pass + fail} بررسی — ✅ ${pass} · ❌ ${fail}`);
  process.exit(fail ? 1 : 0);
}
