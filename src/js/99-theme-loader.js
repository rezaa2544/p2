/* ========================================================== */
/* بارگذاری و سوئیچ تم‌های پویا (بدون وابستگی به سایر ماژول‌ها) */
/* یادداشت: دسترسی به حافظهٔ دستگاه از طریقِ لایهٔ داده (Store) —   */
/* قاعدهٔ 00-data-layer: هیچ ماژولی مستقیم به حافظهٔ مرورگر نزند.      */
/* ========================================================== */

(function() {
  // ۱. اعمال تم ذخیره‌شده از حافظهٔ دستگاه در بدو باز شدن برنامه
  var currentTheme = Store.get('payesh_ui_theme', 'theme-2');
  document.documentElement.setAttribute('data-theme', currentTheme);

  // ۲. تابع سراسری سوئیچ تم برای استفاده در کنسول یا اکشن‌های آینده
  window.switchPayeshTheme = function(themeId) {
    var validThemes = ['theme-1', 'theme-2', 'theme-3'];
    if (validThemes.indexOf(themeId) === -1) {
      console.warn('تم نامعتبر: ' + themeId + '. گزینه‌های مجاز: ' + validThemes.join(', '));
      return;
    }
    Store.set('payesh_ui_theme', themeId);
    document.documentElement.setAttribute('data-theme', themeId);
    if (typeof toast === 'function') {
      toast('پوسته به ' + themeId + ' تغییر یافت', 'ok');
    } else {
      console.log('پوسته به ' + themeId + ' تغییر یافت');
    }
  };

  // ۳. راهنمای دیباگ در کنسول
  console.log('✅ تم‌های پویا فعال شدند. برای تغییر تم از دستور زیر استفاده کنید:');
  console.log('switchPayeshTheme("theme-3")');
})();
