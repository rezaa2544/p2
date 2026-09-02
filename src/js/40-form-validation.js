/* ═══════════════════════════════════════════════════════════════════
   اعتبارسنجی فرم‌ها با نشانه‌گذاری دیداری
   ═══════════════════════════════════════════════════════════════════
   خواستهٔ کاربر:
   «وقتی یک قسمت الزامی خالی گذاشته می‌شود و خطا می‌دهد، بهتر است
   دور آن قسمت قرمز شود تا کاربر بفهمد کدام بخش است و سردرگم نشود.»

   طراحی: به‌جای ویرایش ۶۲ نقطهٔ اعتبارسنجی، یک لایهٔ مرکزی ساخته شد.
   تابع `need(id, پیام)` هم پیام می‌دهد، هم فیلد را قرمز می‌کند،
   هم روی آن فوکوس می‌گذارد. اولین فیلد خطادار به دید می‌آید.

   ⚠️ برای فیلدهای تازه از همین الگو استفاده کن، نه toast خام.
   ═══════════════════════════════════════════════════════════════════ */

/** پاک‌کردن نشانهٔ خطا از همهٔ فیلدهای یک ظرف (پیش از اعتبارسنجی تازه) */
function clearFieldErrors(scope){
  var root = scope || document;
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

/* پاک‌شدن خودکار نشانهٔ خطا به‌محض تایپ یا تغییر کاربر */
document.addEventListener('input', function(e){
  if(e.target && e.target.classList && e.target.classList.contains('has-error')){
    e.target.classList.remove('has-error');
    var wrap = e.target.closest ? e.target.closest('.field') : null;
    if(wrap){
      var m = wrap.querySelector('.field-error-msg');
      if(m) m.remove();
    }
  }
});
document.addEventListener('change', function(e){
  if(e.target && e.target.classList && e.target.classList.contains('has-error')){
    e.target.classList.remove('has-error');
    var wrap = e.target.closest ? e.target.closest('.field') : null;
    if(wrap){
      var m = wrap.querySelector('.field-error-msg');
      if(m) m.remove();
    }
  }
});
