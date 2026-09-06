/* ═══════════════════════════════════════════════════════════════════
   سیاست حریم خصوصی — قابل دسترس درونِ برنامه
   (ملاک گوگل‌پلی: سیاست حریم خصوصی باید هم در لیستِ فروشگاه و هم
   داخلِ خودِ اپ قابل دسترس باشد. نسخهٔ کاملِ منتشرشده:
   docs/PRIVACY_POLICY.md — همین متن باید با آن هم‌گام بماند.)
   ═══════════════════════════════════════════════════════════════════ */
function privacyPolicyHtml(){
  var d = '<div style="line-height:2;max-height:62vh;overflow:auto">';
  d += '<p class="small muted" style="margin-top:0">سامانهٔ هوشمند مدیریت مدرسه «پایش» — آخرین به‌روزرسانی: ۱۴۰۵/۰۶/۱۵</p>';
  d += '<h4 style="margin:10px 0 4px">۱. چه داده‌ای داریم</h4><p class="small" style="margin:0 0 8px">'
    + 'فقط داده‌هایی که برای کارِ روزمرهٔ مدرسه ضروری‌اند: شناسهٔ کاربران (نام، نقش، مدرسه)، '
    + 'اطلاعات تحصیلی دانش‌آموزان (حضور، نمرات، انضباط) که خودِ کادر مدرسه ثبت می‌کند، '
    + 'و شمارهٔ تلفنِ اولیا (و گاه دانش‌آموز به‌عنوانِ تماس) فقط برای اطلاع‌رسانی‌های مدرسه. در نسخهٔ نمایشی که الان می‌بینید، همهٔ این‌ها دادهٔ نمونه است.</p>';
  d += '<h4 style="margin:10px 0 4px">۲. داده کجا می‌ماند و کجا می‌رود</h4><p class="small" style="margin:0 0 8px">'
    + 'در نسخهٔ کنونی (دمو) داده **فقط روی دستگاهِ خودِ شما** می‌ماند و این برنامه **هیچ درخواستی به شبکه نمی‌فرستد** — نه آنالیز، نه تبلیغ، نه سرویسِ سوم. '
    + 'در نسخهٔ تولید، داده روی سرورِ اختصاصیِ سامانه می‌ماند و هر مبادله با اتصالِ رمزنگاری‌شده (HTTPS) انجام می‌شود.</p>';
  d += '<h4 style="margin:10px 0 4px">۳. چه چیزی جمع **نمی‌کنیم**</h4><p class="small" style="margin:0 0 8px">'
    + 'هیچ آمارگیریِ رفتاری (آنالیز/ردیابی) نداریم، هیچ SDKِ تبلیغاتی یا سرویسِ شخصِ سوم در برنامه نیست، '
    + 'دادهٔ کاربر **فروشیده یا با کسی به‌اشتراک گذاشته نمی‌شود** و کد ملی در هیچ پیامک یا خروجی نمایشی نمی‌رود.</p>';
  d += '<h4 style="margin:10px 0 4px">۴. موقعیت‌ مکانی</h4><p class="small" style="margin:0 0 8px">'
    + 'فقط برای سرویسِ مدرسه: موقعیتِ واقعیِ سرویس برای **ولیِ دانش‌آموزی که از سرویس استفاده می‌کند** و کادر مدرسه دیده می‌شود — '
    + 'تنها برای دیدنِ خطِ مسیر و رویدادهای سوار/پیاده. همیشه می‌توانید اجازهٔ موقعیت را از خودِ دستگاه قطع کنید.</p>';
  d += '<h4 style="margin:10px 0 4px">۵. حریم دانش‌آموزان</h4><p class="small" style="margin:0 0 8px">'
    + 'این برنامه برای کودکان طراحی **نمی‌شود**؛ مخاطبش کادر مدرسه و اولیاست. اطلاعات هر دانش‌آموز فقط برای والدینِ متصلِ او و کادرِ مجازِ مدرسهٔ خودش قابل دسترس است — '
    + 'این قاعده در سطحِ داده اعمال می‌شود، نه فقط در ظاهر.</p>';
  d += '<h4 style="margin:10px 0 4px">۶. امنیت حساب</h4><p class="small" style="margin:0 0 8px">'
    + 'ورود با احراز هویت (شمارهٔ همراه + کد پیامکی + استعلامِ کد ملی) انجام می‌شود و در هیچ نسخه‌ای رمز عبور وجود ندارد. '
    + 'در نسخهٔ نمایشی، هرگز حسابِ مدیریتی خود را با دیگران به اشتراک نگذارید. درخواستِ کد برای شمارهٔ ناشناخته پاسخِ یک‌شکل می‌دهد (وجودِ حساب لو نمی‌رود) و «خروج از حساب» نشست‌ها را برای همیشه باطل می‌کند.</p>';
  d += '<h4 style="margin:10px 0 4px">۷. حذف حساب و داده</h4><p class="small" style="margin:0 0 8px">'
    + 'هر حساب می‌تواند از **داخلِ برنامه** (این صفحه) و از **یک صفحهٔ وبِ جداگانه** درخواستِ حذف دهد؛ '
    + 'پس از تأیید، همهٔ داده‌های مرتبط (حساب، پیوندِ اولیا با فرزندان، پیام‌های فرستاده‌شده) **کاملاً حذف می‌شود** '
    + 'و نه فقط غیرفعال. دادهٔ حساب از دادهٔ زنده فوراً حذف می‌شود؛ نسخه‌هایِ محدودِ پشتیبانِ خودکار تا جایگزینیِ دوره‌ای، ممکن است دادهٔ قبل از حذف را داشته باشند. در نسخهٔ نمایشی، این عملیات داده‌های همین دستگاه را هم پاک می‌کند.</p>';
  d += '<div style="margin:0 0 14px;padding:12px 14px;border:1px solid #fecaca;background:#fef2f2;border-radius:10px">'
    + '<b style="color:#dc2626">حذفِ حساب</b>'
    + '<p class="small" style="margin:6px 0 10px">با حذف، همهٔ داده‌های حساب شما <b>برای همیشه</b> پاک می‌شود — این کار قابل بازگشت نیست.</p>'
    + '<button type="button" data-act="delete-account-req" '
    + 'style="background:#dc2626;color:#fff;border:0;border-radius:10px;padding:9px 18px;font-size:14px;font-family:inherit;cursor:pointer">درخواستِ حذفِ حساب</button></div>';
  d += '<h4 style="margin:10px 0 4px">۸. تماس</h4><p class="small" style="margin:0">'
    + 'سؤال یا درخواستِ مربوط به داده‌هایتان را از راهِ پشتیبانیِ سامانه (داخلِ برنامه) ارسال کنید؛ '
    + 'شمارهٔ تماسِ داده (تلفن) در زمانِ انتشارِ رسمی تکمیل خواهد شد.</p>';
  return d + '</div>';
}
/** بازکردنِ سیاستِ حریم خصوصی (از صفحهٔ ورود و هر جای دیگر) */
function openPrivacyPolicy(){
  if(typeof openModal !== 'function' || typeof modalTpl !== 'function') return;
  openModal(modalTpl('سیاست حریم خصوصی — پایش', privacyPolicyHtml(), ''));
}

/* ── حذف حساب (قفل ۹.۵ — ملاک حذفِ حسابِ گوگل‌پلی) ─────────────
   در حالتِ سروری: سرور داده‌های شخصیِ حساب را حذف می‌کند (و نشست‌ها
   می‌میرند)؛ در هر حالت، داده‌های این دستگاه هم پاک می‌شود.
   صفحهٔ وبِ جداگانه: /account-deletion (فقط روی سرور). */
function requestAccountDeletion(){
  if(typeof S === 'undefined' || !S.user){
    if(typeof toast === 'function') toast('برای حذف حساب باید وارد شده باشید', 'err');
    return;
  }
  if(typeof askConfirm !== 'function') return;
  askConfirm('با این کار حسابِ شما و همهٔ داده‌های مرتبط (پیوندِ فرزندان، پیام‌های فرستاده‌شده و ...) برای همیشه حذف می‌شود — قابل بازگشت نیست. ادامه می‌دهید؟', function(){
    doDeleteAccount();
  });
}
function clearDeviceData(){
  try{ (Store.keys() || []).forEach(function(k){ Store.remove(k); }); }catch(e){}
  try{
    if(typeof indexedDB !== 'undefined' && indexedDB.databases){
      indexedDB.databases().then(function(list){
        list.forEach(function(db){ try{ indexedDB.deleteDatabase(db.name); }catch(e){} });
      }).catch(function(){});
    }
  }catch(e){}
  try{ if(typeof SYNC !== 'undefined'){ SYNC.queue = []; } }catch(e){}
  S.user = null; S.persona = null; S.boss = null;
  try{ if(typeof refreshSyncBadge === 'function') refreshSyncBadge(); }catch(e){}
}
function doDeleteAccount(){
  var isSrv = (typeof DATA_MODE !== 'undefined' && DATA_MODE === 'server');
  var finish = function(){
    clearDeviceData();
    if(typeof toast === 'function')
      toast(isSrv ? 'حساب و داده‌های مرتبط از سرور حذف شد — صفحه تازه می‌شود'
                  : 'داده‌های این دستگاه پاک شد — صفحه تازه می‌شود', 'ok');
    setTimeout(function(){ try{ location.reload(); }catch(e){} }, 900);
  };
  if(!isSrv){ finish(); return; }
  if(typeof Api === 'undefined' || typeof Api.request !== 'function'){ finish(); return; }
  Api.request('/api/auth/delete-account', { method: 'POST', raw: true }).then(function(r){
    if(r && r.status === 200 && r.body && r.body.ok === true){ finish(); return; }
    if(typeof toast === 'function')
      toast('حذف از سرور ناموفق بود: ' + ((r && r.body && r.body.message) || 'خطای ناشناخته'), 'err');
  }).catch(function(e){
    if(typeof toast === 'function') toast('حذف از سرور ناموفق بود: ' + (e && e.message || 'خطا'), 'err');
  });
}
