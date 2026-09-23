/* ========================================================== */
/* بارگذاری و سوئیچ تم‌های پویا                                 */
/* دسترسی به حافظه فقط از طریق لایهٔ داده (Store) انجام می‌شود. */
/* قاعدهٔ 00-data-layer: هیچ ماژولی مستقیم به حافظهٔ مرورگر نزند. */
/* ========================================================== */

(function() {
  var validThemes = ['theme-1', 'theme-2', 'theme-3'];
  var defaultTheme = 'theme-2';

  /* این فایل ممکن است در بیلدی اجرا شود که لایهٔ داده هنوز بارگذاری
     نشده است؛ نبودن Store نباید کل برنامه را با ReferenceError متوقف کند. */
  function readTheme() {
    try {
      if (typeof Store !== 'undefined' && Store && typeof Store.get === 'function') {
        var stored = Store.get('payesh_ui_theme', defaultTheme);
        return validThemes.indexOf(stored) !== -1 ? stored : defaultTheme;
      }
    } catch (e) {}
    return defaultTheme;
  }

  function saveTheme(themeId) {
    try {
      if (typeof Store !== 'undefined' && Store && typeof Store.set === 'function') {
        return Store.set('payesh_ui_theme', themeId);
      }
    } catch (e) {}
    return false;
  }

  function applyTheme(themeId) {
    document.documentElement.setAttribute('data-theme', themeId);
  }

  // ۱. اعمال تم ذخیره‌شده در بدو باز شدن برنامه
  applyTheme(readTheme());

  // ۲. تابع سراسری سوئیچ تم برای استفاده در رابط یا کنسول
  window.switchPayeshTheme = function(themeId) {
    if (validThemes.indexOf(themeId) === -1) {
      console.warn('تم نامعتبر: ' + themeId + '. گزینه‌های مجاز: ' + validThemes.join(', '));
      return false;
    }

    var saved = saveTheme(themeId);
    applyTheme(themeId);

    if (typeof toast === 'function') {
      toast('پوسته به ' + themeId + ' تغییر یافت', 'ok');
    } else {
      console.log('پوسته به ' + themeId + ' تغییر یافت');
    }
    if (!saved) {
      console.warn('تم اعمال شد، اما ذخیره‌سازی در لایهٔ داده در دسترس نبود.');
    }
    return true;
  };

  // ۳. راهنمای دیباگ در کنسول
  console.log('✅ تم‌های پویا فعال شدند. برای تغییر تم از دستور زیر استفاده کنید:');
  console.log('switchPayeshTheme("theme-3")');
})();
