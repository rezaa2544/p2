/* ==========================================================
   انتخابگرِ پوسته (تم) در رابطِ کاربری — دور ۹۰
   ----------------------------------------------------------
   موتورِ تم از پیش در `99-theme-loader.js` وجود داشت و درست کار
   می‌کرد، ولی هیچ راهی در رابط برایِ استفاده از آن نبود — کاربر
   فقط از کنسولِ مرورگر می‌توانست پوسته را عوض کند.

   این ماژول همان موتور را به یک <select> در پاورقیِ نوارِ کناری
   وصل می‌کند. منطقِ ذخیره/اعمال تکرار نمی‌شود؛ فقط
   `switchPayeshTheme` صدا زده می‌شود (تک‌منبعِ حقیقت).

   نگهبان: `tests/theme-picker.js` (جهش‌آزموده).
   ========================================================== */

/** نامِ فارسیِ پوسته‌ها — همان سه شناسه‌ای که موتور معتبر می‌داند. */
const PAYESH_THEMES = [
  ['theme-1', 'کلاسیک'],
  ['theme-2', 'روشن (پیش‌فرض)'],
  ['theme-3', 'شب'],
];

/** پوستهٔ فعلی از حافظهٔ دستگاه — با همان پیش‌فرضِ موتور. */
function currentPayeshTheme(){
  try{
    if(typeof Store!=='undefined' && Store && typeof Store.get==='function'){
      return Store.get('payesh_ui_theme','theme-2');
    }
  }catch(e){}
  return 'theme-2';
}

/** <select>ِ انتخابِ پوسته برایِ پاورقیِ نوارِ کناری. */
function themePickerHtml(){
  const cur = currentPayeshTheme();
  const opts = PAYESH_THEMES.map(function(t){
    return '<option value="'+t[0]+'"'+(t[0]===cur?' selected':'')+'>'+t[1]+'</option>';
  }).join('');
  return '<select class="select sm" data-act="theme-pick" title="پوستهٔ برنامه" '+
         'aria-label="پوستهٔ برنامه" '+
         'style="width:100%;margin-top:6px">'+opts+'</select>';
}

/* اکشنِ تغییرِ پوسته.

   استثنا بر قاعدهٔ دور ۷۹: آن قاعده دربارهٔ آبجکتِ `A` و شنوندهٔ
   `click` است که `el` را در محیّطِ خود دارد. این اکشن از شنوندهٔ
   `change` صدا زده می‌شود که چنین متغیّری ندارد، پس عنصر صراحتاً
   پاس داده می‌شود. */
const THEME_ACTIONS = {
  'theme-pick'(elm){
    const v = elm && elm.value;
    if(typeof switchPayeshTheme === 'function') switchPayeshTheme(v);
  },
};
