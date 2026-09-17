/* ═══════════════════════════════════════════════════════════════════
   اعتبارسنجی فرم‌ها با نشانه‌گذاری دیداری
   ═══════════════════════════════════════════════════════════════════
   خواستهٔ کاربر:
   «وقتی یک قسمت الزامی خالی گذاشته می‌شود و خطا می‌دهد، بهتر است
   دور آن قسمت قرمز شود تا کاربر بفهمد کدام بخش است و سردرگم نشود.»

   طراحی: به‌جای ویرایش ۶۲ نقطهٔ اعتبارسنجی، یک لایهٔ مرکزی ساخته شد.
   تابع `need(id, پیام)` هم پیام می‌دهد، هم فیلد را قرمز می‌کند،
   هم روی آن فوکوس می‌گذارد. اولین فیلد خطادار به دید می‌آید.

   ارتقای C8-06:
   اعتبارسنجی فوری در لحظه (Blur/Focusout) + بازیابی فوری خطا در لحظه تایپ (Input)
   پشتیبانی از فرمت‌های پرکاربرد (شماره همراه، کد ملی، نمره تحصیلی).
   ═══════════════════════════════════════════════════════════════════ */

/** تبدیل ارقام فارسی و عربی به لاتین برای اعتبارسنجی یکنواخت */
function _toLatinDigits(str){
  if(typeof toLatinDigits === 'function') return toLatinDigits(str);
  return String(str || '').replace(/[۰-۹]/g, function(d){ return '۰۱۲۳۴۵۶۷۸۹'.indexOf(d); })
                          .replace(/[٠-٩]/g, function(d){ return '٠١٢٣٤٥٦٧٨٩'.indexOf(d); });
}

/** پاک‌کردن نشانهٔ خطا از همهٔ فیلدهای یک ظرف (پیش از اعتبارسنجی تازه) */
function clearFieldErrors(scope){
  var root = scope || (typeof document !== 'undefined' ? document : null);
  if(!root || !root.querySelectorAll) return;
  var marked = root.querySelectorAll('.has-error');
  for(var i = 0; i < marked.length; i++) marked[i].classList.remove('has-error');
  var msgs = root.querySelectorAll('.field-error-msg');
  for(var j = 0; j < msgs.length; j++) msgs[j].remove();
}

/**
 * نشانه‌گذاری یک فیلد به‌عنوان خطادار.
 * کادر قرمز روی خود فیلد و پیام کوتاه زیر آن.
 */
function markFieldError(id, msg){
  if(typeof document === 'undefined') return false;
  var el = document.getElementById(id);
  if(!el) return false;
  el.classList.add('has-error');
  /* پیام زیر فیلد، داخل همان ظرف field */
  var wrap = el.closest ? el.closest('.field') : null;
  if(wrap && msg && !wrap.querySelector('.field-error-msg')){
    var p = document.createElement('div');
    p.className = 'field-error-msg';
    p.textContent = msg;
    wrap.appendChild(p);
  }
  return true;
}

/** بردن فیلد به دید و گذاشتن فوکوس روی آن */
function focusField(id){
  if(typeof document === 'undefined') return;
  var el = document.getElementById(id);
  if(!el) return;
  try{
    if(el.scrollIntoView) el.scrollIntoView({ block:'center', behavior:'smooth' });
    setTimeout(function(){ try{ el.focus(); }catch(e){} }, 120);
  }catch(e){}
}

/**
 * بررسی یک فیلد الزامی.
 * اگر خالی باشد: پیام می‌دهد، کادر قرمز می‌گذارد، فوکوس می‌کند و
 * true برمی‌گرداند (یعنی «خطا هست، ادامه نده»).
 *
 *   if(need('c_name','نام کلاس الزامی است')) return;
 */
function need(id, msg){
  if(typeof document === 'undefined') return false;
  var el = document.getElementById(id);
  var val = el ? String(el.value == null ? '' : el.value).trim() : '';
  if(val) return false;
  markFieldError(id, 'این فیلد الزامی است');
  focusField(id);
  if(typeof toast === 'function') toast(msg || 'این قسمت الزامی است', 'err');
  return true;
}

/**
 * بررسی چند فیلد الزامی با هم.
 * همهٔ فیلدهای خالی قرمز می‌شوند، ولی فوکوس روی اولین آن‌ها می‌رود.
 *
 *   if(needAll([['s_name','نام مدرسه'],['s_code','کد مدرسه']])) return;
 */
function needAll(pairs){
  if(typeof document === 'undefined') return false;
  clearFieldErrors(document.getElementById('modal') || document);
  var first = null, names = [];
  pairs.forEach(function(p){
    var id = p[0], label = p[1];
    var el = document.getElementById(id);
    var val = el ? String(el.value == null ? '' : el.value).trim() : '';
    if(!val){
      markFieldError(id, 'این فیلد الزامی است');
      names.push(label);
      if(!first) first = id;
    }
  });
  if(!first) return false;
  focusField(first);
  if(typeof toast === 'function')
    toast(names.length === 1 ? names[0] + ' الزامی است'
      : 'این موارد الزامی‌اند: ' + names.join('، '), 'err');
  return true;
}

/**
 * اعتبارسنجی دلخواه روی یک فیلد (نه فقط خالی‌بودن).
 *
 *   if(invalid('u_nid', !validNid(V('u_nid')), 'کد ملی معتبر نیست')) return;
 */
function invalid(id, condition, msg){
  if(!condition) return false;
  markFieldError(id, msg);
  focusField(id);
  if(typeof toast === 'function') toast(msg, 'err');
  return true;
}

/** اعتبارسنجی شماره همراه ایرانی (۱۱ رقم با پیش‌شماره ۰۹) */
function validatePhone(phone){
  if(!phone) return true;
  var clean = _toLatinDigits(String(phone).trim());
  return /^09\d{9}$/.test(clean);
}

/** اعتبارسنجی کد ملی ده رقمی با الگوریتم کنترلی رسمی */
function validateNid(nid){
  if(!nid) return true;
  var clean = _toLatinDigits(String(nid).trim());
  if(typeof validNid === 'function') return validNid(clean);
  if(!/^\d{10}$/.test(clean)) return false;
  var c = parseInt(clean[9], 10);
  var sum = 0;
  for(var i = 0; i < 9; i++) sum += parseInt(clean[i], 10) * (10 - i);
  var r = sum % 11;
  return (r < 2 && c === r) || (r >= 2 && c === (11 - r));
}

/** اعتبارسنجی نمره عددی (پیش‌فرض ۰ تا ۲۰) */
function validateScore(score, min, max){
  if(score == null || String(score).trim() === '') return true;
  var minVal = (min != null) ? min : 0;
  var maxVal = (max != null) ? max : 20;
  var clean = _toLatinDigits(String(score).trim());
  var n = Number(clean);
  return !isNaN(n) && n >= minVal && n <= maxVal;
}

/** اعتبارسنجی تک‌فیلد بر اساس خصیصه‌های داده‌ای (data-validate / required) */
function validateInput(el){
  if(!el) return true;
  var id = el.id;
  var val = String(el.value == null ? '' : el.value).trim();
  var isReq = el.hasAttribute('required') || (el.dataset && el.dataset.required === 'true');
  if(isReq && !val){
    if(id) markFieldError(id, 'این فیلد الزامی است');
    return false;
  }
  var kind = el.dataset ? el.dataset.validate : null;
  if(!kind || !val) return true;
  if(kind === 'phone' && !validatePhone(val)){
    if(id) markFieldError(id, 'شماره همراه باید ۱۱ رقم با پیش‌شماره ۰۹ باشد');
    return false;
  }
  if(kind === 'nid' && !validateNid(val)){
    if(id) markFieldError(id, 'کد ملی ۱۰ رقمی معتبر نیست');
    return false;
  }
  if(kind === 'score' && !validateScore(val)){
    if(id) markFieldError(id, 'نمره باید عددی بین ۰ تا ۲۰ باشد');
    return false;
  }
  return true;
}

/** بازیابی فوری خطا در صورت رفع عیب در حین تایپ */
function recoverInput(el){
  if(!el || !el.classList || !el.classList.contains('has-error')) return;
  var val = String(el.value == null ? '' : el.value).trim();
  var isReq = el.hasAttribute('required') || (el.dataset && el.dataset.required === 'true');
  var kind = el.dataset ? el.dataset.validate : null;

  var stillInvalid = false;
  if(isReq && !val) stillInvalid = true;
  else if(kind === 'phone' && val && !validatePhone(val)) stillInvalid = true;
  else if(kind === 'nid' && val && !validateNid(val)) stillInvalid = true;
  else if(kind === 'score' && val && !validateScore(val)) stillInvalid = true;

  if(!stillInvalid){
    el.classList.remove('has-error');
    var wrap = el.closest ? el.closest('.field') : null;
    if(wrap){
      var m = wrap.querySelector('.field-error-msg');
      if(m) m.remove();
    }
  }
}

if(typeof document !== 'undefined'){
  /* اعتبارسنجی فوری با خروج از فیلد (Blur/Focusout) */
  document.addEventListener('focusout', function(e){
    if(e.target && e.target.matches && e.target.matches('input, select, textarea')){
      validateInput(e.target);
    }
  });

  /* پاک‌شدن و بازیابی خودکار نشانهٔ خطا به‌محض اصلاح ورودی توسط کاربر */
  document.addEventListener('input', function(e){
    if(e.target) recoverInput(e.target);
  });
  document.addEventListener('change', function(e){
    if(e.target) recoverInput(e.target);
  });
}

if(typeof module !== 'undefined' && module.exports){
  module.exports = {
    clearFieldErrors: clearFieldErrors,
    markFieldError: markFieldError,
    focusField: focusField,
    need: need,
    needAll: needAll,
    invalid: invalid,
    validatePhone: validatePhone,
    validateNid: validateNid,
    validateScore: validateScore,
    validateInput: validateInput,
    recoverInput: recoverInput
  };
}

