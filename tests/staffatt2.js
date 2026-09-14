#!/usr/bin/env node
/**
 * تست‌های حضور و غیاب کارکنان (بند B.1 فرناز — چت۱):
 *  - سید قطعی staff_attendance (بدون جابه‌جایی RNG / بدون کاربر تازه)
 *  - ثبت/ویرایش مدیر + upsert با کلید (staff_id+date)
 *  - گارد فقط-مدیر (تابع دامنه + ماتریس canAction هر ۸ نقش)
 *  - اعتبارسنجی fail-closed (وضعیت/تاریخ/آینده/بین‌مدرسه‌ای/غیرکادر)
 *  - نمای ماهانه (شبکهٔ روزها + خلاصهٔ همهٔ همکاران)
 *  - جدایی کامل از حضور دانش‌آموز
 *  - مسیر واقعی کلیک (بازکردن مودال → ذخیره → به‌روزرسانی هدفمند DOM)
 *
 * اجرا:  node tests/staffatt2.js   (نیازمند jsdom)
 */
const fs = require('fs');
const path = require('path');

let JSDOM;
try { ({ JSDOM } = require('jsdom')); }
catch { console.log('⏭️  jsdom نصب نیست — تست رد شد.  (npm i --no-save jsdom)'); process.exit(0); }

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

let pass = 0, fail = 0;
const errors = [];
function test(name, fn) {
  try { fn(); pass++; console.log(`  ✅ ${name}`); }
  catch (e) { fail++; errors.push(`${name}: ${e.message}`); console.log(`  ❌ ${name}\n     ${e.message}`); }
}
function assert(c, m) { if (!c) throw new Error(m || 'شرط برقرار نیست'); }

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
const mgrLogin = () => W(`S.user=db.users.find(function(u){return u.username==='manager1';});S.persona=null;S.boss=null;`);

async function main() {
  await sleep(500);
  W('window.ATT0=db.attendance.length');

  test('S1 بوت بدون خطا + سید حضور کادر', () => {
    assert(consoleErrors.length === 0, consoleErrors.slice(0, 2).join(' | '));
    const n = Number(W('db.staff_attendance.length'));
    /* ۶ مدرسه × ۱۲ دبیر × ۵ روز کاری؛ اگر امروز کاری باشد یک روز کم می‌شود (امروز خالی) */
    assert(n === 288 || n === 360, 'تعداد سید نامعتبر: ' + n);
    assert(Number(W(`db.users.length`)) === 1036, 'کاربر تازه ساخته شد!' /* SIM-01: +guard1 (seed-completeness) */);
    assert(W(`!!db.users.find(function(u){return u.username==='manager1';})`), 'حساب نمونه جابه‌جا شد');
  });

  test('S2 ثبت مدیر (امروزِ خالیِ قطعی) با همهٔ فیلدها', () => {
    mgrLogin();
    const r = JSON.parse(W(`(function(){
      var t=staffOfSchool(S.user.school_id)[0];
      var res=markStaffAttendance(t.id,todayISO(),'late','یادداشت آزمون');
      if(!res.ok)return JSON.stringify({err:res.msg});
      var rec=staffAttRec(t.id,todayISO());
      return JSON.stringify({id:res.id,school:rec.school_id,staff:rec.staff_id,date:rec.date,
        status:rec.status,note:rec.note,by:rec.registered_by,me:S.user.id});
    })()`));
    assert(!r.err, 'ثبت ناموفق: ' + r.err);
    assert(r.school === Number(W('S.user.school_id')), 'school_id از نشست نیست');
    assert(r.by === r.me, 'registered_by باید خودِ مدیر باشد');
    assert(r.status === 'late' && r.note === 'یادداشت آزمون', 'فیلدها درست ذخیره نشد');
  });

  test('S3 ثبت دوبارهٔ همان روز = ویرایش (تک‌رکورد)', () => {
    mgrLogin();
    const r = JSON.parse(W(`(function(){
      var t=staffOfSchool(S.user.school_id)[0];
      var res=markStaffAttendance(t.id,todayISO(),'present','');
      var n=db.staff_attendance.filter(function(x){return x.staff_id===t.id&&x.date===todayISO();}).length;
      return JSON.stringify({ok:res.ok,updated:res.updated,n:n,st:staffAttRec(t.id,todayISO()).status});
    })()`));
    assert(r.ok && r.updated === true, 'باید ویرایش شود');
    assert(r.n === 1, 'رکورد تکراری ساخته شد: ' + r.n);
    assert(r.st === 'present', 'وضعیت به‌روز نشد');
  });

  test('S4 فقط مدیر: تابع دامنه همهٔ نقش‌های غیرمدیر را رد می‌کند', () => {
    const roles = ['teacher', 'student', 'parent'];
    for (const role of roles){
      const r = W(`(function(){
        S.user=db.users.find(function(u){return u.role==='${role}';});S.persona=null;S.boss=null;
        var t=staffOfSchool(S.user.school_id)[0]||staffOfSchool(db.users.find(function(u){return u.role==='manager';}).school_id)[0];
        return markStaffAttendance(t.id,todayISO(),'present','').ok;
      })()`);
      assert(r === false, role + ' توانست ثبت کند!');
    }
    /* ماتریس کامل canAction هر ۸ نقش (حتی نقش‌های بدون کاربر نمونه) */
    const m = JSON.parse(W(`JSON.stringify(['manager','superadmin','teacher','student','parent','counselor','driver','edu_office'].map(function(r){
      return [r,canAction('staffatt-save',r),canAction('staffatt-day',r)];
    }))`));
    for (const row of m){
      const want = (row[0] === 'manager' || row[0] === 'superadmin');
      assert(row[1] === want && row[2] === want, 'canAction نادرست برای ' + row[0]);
    }
    mgrLogin();
  });

  test('S5 اعتبارسنجی fail-closed', () => {
    mgrLogin();
    const r = JSON.parse(W(`(function(){
      var t=staffOfSchool(S.user.school_id)[0];
      var other=staffOfSchool(db.schools.filter(function(s){return s.id!==S.user.school_id;})[0].id)[0];
      var stu=db.users.find(function(u){return u.role==='student'&&u.school_id===S.user.school_id;});
      var future=addDaysISO(todayISO(),1);
      return JSON.stringify({
        badStatus: markStaffAttendance(t.id,todayISO(),'sick','').ok,
        badDate1: markStaffAttendance(t.id,'2026-13-99','present','').ok,
        badDate2: markStaffAttendance(t.id,'x','present','').ok,
        future: markStaffAttendance(t.id,future,'present','').ok,
        crossSchool: markStaffAttendance(other.id,todayISO(),'present','').ok,
        notStaff: markStaffAttendance(stu.id,todayISO(),'present','').ok,
        ghost: markStaffAttendance(999999,todayISO(),'present','').ok
      });
    })()`));
    for (const k of Object.keys(r)) assert(r[k] === false, k + ' باید رد می‌شد');
    /* یادداشت بلند برش می‌خورد (نه رد، نه سرریز) */
    const n = Number(W(`(function(){
      var t=staffOfSchool(S.user.school_id)[1];
      var longNote=new Array(2501).join('x');
      var res=markStaffAttendance(t.id,todayISO(),'present',longNote);
      if(!res.ok)return -1;
      return staffAttRec(t.id,todayISO()).note.length;
    })()`));
    assert(n === 2000, 'طول یادداشت باید ۲۰۰۰ شود: ' + n);
  });

  test('S6 نمای ماهانه رندر می‌شود (شبکه + خلاصه)', () => {
    mgrLogin();
    W(`S.route='staffatt';S.staffatt=null;`);
    const h = W('renderRoute()');
    const wantMonth = W(`(function(){var m=staffAttState();return STAFF_ATT_MONTHS[m.jm-1];})()`);
    assert(h.indexOf('حضور و غیاب کادر') > -1, 'عنوان نما نیست');
    assert(h.indexOf(wantMonth) > -1, 'برچسب ماه نیست');
    const cells = (h.match(/data-act="staffatt-day"/g) || []).length;
    const todayJ = Number(W(`(function(){var t=todayISO().split('-');return toJalali(+t[0],+t[1],+t[2])[2];})()`));
    /* فقط روزهای امروز و گذشته فعال‌اند (روزهای آینده غیرفعال) */
    assert(cells === todayJ, 'خانه‌های فعال باید ' + todayJ + ' باشد: ' + cells);
    assert(/id="sas_\d+"/.test(h), 'سطر خلاصه نیست');
  });

  test('S7 خلاصهٔ ماهانه با بازشماریِ مستقل می‌خواند (+ رکورد ماه دیگر)', () => {
    mgrLogin();
    const ok = W(`(function(){
      S.route='staffatt';
      var mst=staffAttState();
      /* رکوردِ ماهِ دیگر (۴۰ روز پیش همیشه ماهِ دیگری است) — نباید در خلاصه بیاید */
      var t2=staffOfSchool(S.user.school_id)[2];
      var old=daysAgoISO(40);
      var oj=toJalali(+old.slice(0,4),+old.slice(5,7),+old.slice(8,10));
      if(oj[0]===mst.jy&&oj[1]===mst.jm)return 'SETUP:ماه یکی شد!';
      var ins=markStaffAttendance(t2.id,old,'absent','ماه دیگر');
      if(!ins.ok)return 'SETUP:'+ins.msg;
      /* بازشماریِ مستقل: بدونِ staffAttMonthRecs، مستقیم با toJalali */
      var sum=staffAttSummary(S.user.school_id,mst.jy,mst.jm);
      for(var i=0;i<sum.length;i++){
        var s=sum[i],p=0,a=0,l=0;
        var rows=db.staff_attendance;
        for(var k=0;k<rows.length;k++){
          var r=rows[k];
          if(r.school_id!==S.user.school_id||r.staff_id!==s.id)continue;
          var q=String(r.date).split('-');
          var j=toJalali(+q[0],+q[1],+q[2]);
          if(j[0]!==mst.jy||j[1]!==mst.jm)continue;
          if(r.status==='present')p++;else if(r.status==='absent')a++;else if(r.status==='late')l++;
        }
        if(s.present!==p||s.absent!==a||s.late!==l)return 'MISS:'+s.id;
      }
      return 'OK:'+sum.length;
    })()`);
    assert(String(ok).indexOf('OK:') === 0, 'خلاصه نادرست: ' + ok);
  });

  test('S8 جدایی کامل از حضور دانش‌آموز', () => {
    assert(Number(W('ATT0')) === Number(W('db.attendance.length')), 'حضور دانش‌آموز دست خورد!');
    const bad = Number(W(`db.staff_attendance.filter(function(r){
      return r.student_id!==undefined||r.class_id!==undefined;
    }).length`));
    assert(bad === 0, 'کلید دانش‌آموزی در رکورد کادر!');
    const att = Number(W(`db.attendance.filter(function(r){
      return r.staff_id!==undefined;
    }).length`));
    assert(att === 0, 'کلید کادری در رکورد دانش‌آموز!');
  });

  test('S9 دبیر به روت دسترسی ندارد', () => {
    W(`S.user=db.users.find(function(u){return u.username==='teacher1_1';});S.persona=null;S.boss=null;S.route='staffatt';`);
    assert(W('renderRoute()').indexOf('دسترسی مجاز نیست') > -1, 'دبیر وارد نما شد!');
    const inMenu = W(`navFor(S.user).some(function(g){
      return (g[1]||[]).some(function(it){return it[0]==='staffatt';});
    })`);
    assert(inMenu === false, 'روت در منوی دبیر هست!');
    mgrLogin();
    const inMgr = W(`navFor(S.user).some(function(g){
      return (g[1]||[]).some(function(it){return it[0]==='staffatt';});
    })`);
    assert(inMgr === true, 'روت در منوی مدیر نیست!');
  });

  test('S10 مسیر واقعی کلیک: خانه → مودال → ذخیره → خانه و سطر', () => {
    mgrLogin();
    W(`S.route='staffatt';S.staffatt=null;`);
    /* رندر واقعی در DOM (renderRoute فقط رشته برمی‌گرداند) */
    W(`document.getElementById('root').innerHTML=renderRoute();`);
    const sid = Number(W('S.staffatt.staffId'));
    const today = W('todayISO()');
    const cell = win.document.getElementById('sac_' + sid + '_' + today);
    assert(cell, 'خانهٔ امروز در DOM نیست');
    cell.click();
    const modal = win.document.getElementById('modal').innerHTML;
    assert(modal.indexOf('staffatt-save') > -1, 'مودال باز نشد');
    win.document.getElementById('staffatt_f_status').value = 'absent';
    win.document.querySelector('#modal [data-act="staffatt-save"]').click();
    assert(win.document.getElementById('modal').innerHTML === '', 'مودال بسته نشد');
    const got = W(`(staffAttRec(${sid},'${today}')||{}).status`);
    assert(got === 'absent', 'رکورد ساخته نشد: ' + got);
    const cellHtml = win.document.getElementById('sac_' + sid + '_' + today).innerHTML;
    assert(cellHtml.indexOf('غایب') > -1, 'خانه به‌روز نشد');
    const rowHtml = win.document.getElementById('sas_' + sid).innerHTML;
    assert(rowHtml.length > 10, 'سطر خلاصه به‌روز نشد');
  });

  const total = pass + fail;
  console.log(`تست حضور کادر: ${pass}/${total} موفق` + (fail ? `  —  ${fail} ناموفق` : '  —  بدون خطا ✅'));
  if (consoleErrors.length){
    console.log(`\n⚠️ خطاهای کنسول (${consoleErrors.length}):`);
    consoleErrors.slice(0, 5).forEach((e) => console.log('   ' + String(e).slice(0, 160)));
  }
  console.log('─'.repeat(52) + '\n');
  dom.window.close();
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
