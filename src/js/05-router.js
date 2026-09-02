/* ============================ state / router ============================ */
const S={user:null,boss:null,persona:null,showPicker:false,route:'dashboard',sidebar:false,filters:{},page:1,modal:null,tab:'grades',child:null,busy:false};
const NAV={
 superadmin:[['نظارت کلان',[['dashboard','📊','داشبورد مدیریتی'],['schools','🏫','مدیریت مدارس'],['users','👥','کاربران سامانه']]],['محتوا',[['subjects','📚','دروس'],['announcements','📢','اطلاعیه‌ها'],['calendar','🗓️','تقویم آموزشی']]],['اداره آموزش و پرورش',[['geo','🗺️','تقسیمات کشوری'],['offices','🏛️','تعریف ادارات'],['officedash','📈','داشبورد منطقه‌ای'],['regions','📊','آمار مناطق']]],['کسب‌وکار',[['adminsubs','👨‍👩‍👦','اشتراک اولیا']]],['ارتباطات',[['notifications','🔔','اعلان‌ها']]]],
 manager:[['مدرسه من',[['lifecycle','🎓','چرخه تحصیلی'],['dashboard','📊','داشبورد مدرسه'],['classes','🏛️','کلاس‌ها'],['subjects','📚','دروس'],['schedule','🗓️','برنامه هفتگی'],['calendar','🗓️','تقویم آموزشی']]],['کاربران',[['users','👥','دبیران و دانش‌آموزان']]],['آموزش و انضباط',[['attendance','✅','حضور و غیاب'],['grades','📝','نمرات'],['discipline','⚖️','پرونده انضباطی'],['leaves','📨','درخواست‌های مرخصی']]],['امتحانات',[['exams','📝','فصل و برنامه امتحانات']]],['کادر مدرسه',[['teachers','👨‍🏫','دبیران و مدارس'],['corrections','📮','درخواست‌های اصلاح']]],['مالی',[['tuition','💰','شهریه و امور مالی']]],['ارتباطات',[['announcements','📢','اطلاعیه‌ها'],['notifications','🔔','اعلان‌ها'],['chat','💬','گفتگو']]]],
 teacher:[['کلاس‌های من',[['dashboard','📊','داشبورد'],['classes','🏛️','کلاس‌ها'],['schedule','🗓️','برنامه هفتگی'],['calendar','🗓️','تقویم آموزشی']]],['ثبت اطلاعات',[['attendance','✅','حضور و غیاب'],['grades','📝','ثبت نمره'],['discipline','⚖️','گزارش انضباطی'],['leaves','📨','مرخصی دانش‌آموزان']]],['امتحانات',[['exams','👁️','برنامه مراقبت من']]],['ارتباطات',[['announcements','📢','اطلاعیه‌ها'],['notifications','🔔','اعلان‌ها'],['chat','💬','گفتگو']]]],
 student:[['پرونده من',[['dashboard','📊','خلاصه وضعیت'],['schedule','🗓️','برنامه درسی'],['exams','📝','برنامه امتحانات'],['record','📁','کارنامه و انضباط'],['calendar','🗓️','تقویم آموزشی']]],['امور مالی',[['mytuition','💰','شهریه من']]],['درخواست‌ها',[['leaves','📨','مرخصی']]],['ارتباطات',[['announcements','📢','اطلاعیه‌ها'],['notifications','🔔','اعلان‌ها'],['chat','💬','گفتگو']]]],
 edu_office:[['اداره من',[['officedash','📈','داشبورد آماری منطقه'],['officeschools','🏫','مدارس تحت پوشش']]],['ارتباطات',[['announcements','📢','اطلاعیه‌ها'],['notifications','🔔','اعلان‌ها']]]],
 parent:[['فرزندان من',[['dashboard','📊','خلاصه وضعیت'],['family','🏠','خانواده و مدارس'],['children','👨‍👩‍👦','پرونده فرزندان'],['exams','📝','برنامه امتحانات'],['calendar','🗓️','تقویم آموزشی']]],['امور مالی',[['mytuition','💰','شهریه و اقساط']]],['درخواست‌ها',[['leaves','📨','درخواست مرخصی']]],['ارتباطات',[['announcements','📢','اطلاعیه‌های مدرسه'],['notifications','🔔','اعلان‌ها'],['chat','💬','گفتگو با مدرسه']]]]
};
const TITLES={lifecycle:['چرخه تحصیلی','ارتقای پایه، انتقال، فارغ‌التحصیلی و پرونده‌های ناقص'],dashboard:['داشبورد','نمای کلی از وضعیت'],schools:['مدیریت مدارس','تعریف، ویرایش و نظارت بر مدارس'],users:['کاربران','مدیریت دبیران، دانش‌آموزان و اولیا'],classes:['کلاس‌ها','مدیریت کلاس‌ها و ظرفیت'],subjects:['دروس','تعریف دروس و ساعات هفتگی'],attendance:['حضور و غیاب','ثبت و مشاهده وضعیت حضور'],grades:['نمرات','ثبت و بررسی نمرات درسی'],discipline:['پرونده انضباطی','موارد مثبت و منفی انضباطی'],schedule:['برنامه هفتگی','جدول ساعات درسی'],announcements:['اطلاعیه‌ها','اخبار و اطلاعیه‌های مدرسه'],record:['پرونده تحصیلی من','کارنامه، حضور و غیاب و انضباط'],children:['پرونده فرزندان','وضعیت درسی و انضباطی فرزندان'],notifications:['اعلان‌ها','رویدادهای مهم مربوط به شما'],leaves:['مرخصی','ثبت و بررسی درخواست‌های مرخصی'],calendar:['تقویم آموزشی','رویدادها، امتحانات و تعطیلات'],chat:['گفتگو','ارتباط مستقیم با مدرسه'],tuition:['شهریه و امور مالی','صورتحساب‌ها، اقساط، درآمد و هزینه'],mytuition:['شهریه و اقساط','وضعیت پرداخت و رسیدها'],regions:['آمار مناطق','مقایسه عملکرد مدارس به تفکیک منطقه'],exams:['امتحانات','فصل امتحانات، برنامه جلسات و مراقبت دبیران'],teachers:['دبیران و مدارس','دبیران مشترک، بار کاری و کنترل تداخل'],corrections:['درخواست‌های اصلاح','گزارش اولیا درباره اطلاعات نادرست'],family:['خانواده من','همه فرزندان شما، حتی در مدارس مختلف'],geo:['تقسیمات کشوری','تعریف استان، شهرستان و منطقه'],offices:['ادارات آموزش و پرورش','تعریف اداره کل استان، شهرستان و منطقه به همراه حساب کارشناس'],officedash:['داشبورد اداره','آمار تجمیعی مدارس محدوده'],officeschools:['مدارس تحت پوشش','فهرست و عملکرد مدارس محدوده اداره'],subscription:['اشتراک پنل اولیا','فعال‌سازی و تمدید دسترسی به پرونده فرزندان'],adminsubs:['اشتراک اولیا','تنظیم مهلت تست رایگان، قیمت طرح‌ها و مدیریت اشتراک‌ها']};

/* ---------- پیمایش و دکمه بازگشت (سازگار با دکمه Back گوشی) ---------- */
S.stack=[];
function snapshot(){return {route:S.route,filters:Object.assign({},S.filters),tab:S.tab,page:S.page,child:S.child};}
function go(route,silent){
  if(S.route!==route){S.stack.push(snapshot()); if(S.stack.length>40)S.stack.shift();}
  S.route=route;S.page=1;S.filters={};S.sidebar=false;S.tab='grades';
  if(!silent)pushHist(route);
  render();
}
function pushHist(route){ try{history.pushState({r:route,n:S.stack.length},'','#'+route);}catch(e){} }
/** بازگشت یک مرحله: اول مودال، بعد منوی کناری، بعد صفحه قبل */
function goBack(){
  if($('#modal')&&$('#modal').innerHTML){closeModal();return true;}
  if(S.sidebar){S.sidebar=false;render();return true;}
  const prev=S.stack.pop();
  if(prev){
    S.route=prev.route; S.filters=prev.filters||{}; S.tab=prev.tab||'grades';
    S.page=prev.page||1; S.child=prev.child; S.sidebar=false; render(); return true;
  }
  const home=S.user?(S.user.role==='edu_office'?'officedash':'dashboard'):null;
  if(home&&S.route!==home){S.route=home;S.page=1;S.filters={};render();return true;}
  return false;   // چیزی برای بازگشت نیست ⇒ رفتار پیش‌فرض مرورگر
}
window.addEventListener('popstate',()=>{
  if(goBack()) pushHist(S.route);        // در برنامه ماندیم؛ ورودی تاریخچه را بازمی‌گردانیم
});
