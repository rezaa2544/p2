/* ============ ویزارد ورود اطلاعات از اکسل ============
   چهار مرحله: انتخاب فایل ← نگاشت ستون‌ها ← بررسی خطاها ← ثبت نهایی

   چرا خوانندهٔ اکسل بومی نوشته شده؟
   پروژه «صفر وابستگی» است، پس نمی‌توان کتابخانهٔ بیرونی آورد.
   فایل xlsx در واقع یک بایگانی zip است؛ با خواندن ساختار zip و
   باز کردن فشرده‌سازی به کمک DecompressionStream مرورگر، محتوای
   xml برگه‌ها استخراج می‌شود. اگر مرورگر این قابلیت را نداشته
   باشد، پیام روشن داده می‌شود و csv همچنان کار می‌کند.

   اصل طراحی: مدرسه نباید فایلش را با قالب ما تطبیق دهد؛
   سامانه باید فایل موجود مدرسه را با هر ترتیب ستونی بفهمد.
   ======================================================= */

/** یکسان‌سازی نویسه‌های عربی/فارسی برای مقایسهٔ عنوان ستون‌ها */
var normHdr = function(x){
  return String(x || '')
    .replace(/[ىي]/g, 'ی').replace(/ك/g, 'ک')
    .replace(/\u200c/g, '')
    .replace(/[_\-.:،؛/\\()]/g, ' ')
    .replace(/\s+/g, ' ').trim().toLowerCase();
};

/** تبدیل ارقام فارسی و عربی به لاتین */
var toLatinDigits = function(x){
  return String(x || '')
    .replace(/[۰-۹]/g, function(d){ return String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)); })
    .replace(/[٠-٩]/g, function(d){ return String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)); });
};

/**
 * خواندن عدد اعشاری از متن فارسی.
 * در فایل‌های واقعی مدرسه معدل به شکل «۱۲/۸۸» یا «۱۲٫۸۸» نوشته می‌شود؛
 * یعنی ممیز با اسلش یا ممیز فارسی، نه نقطهٔ لاتین.
 */
var toNumFa = function(x){
  var t = toLatinDigits(x).replace(/[٫،]/g, '.').replace(/\//g, '.').replace(/[^\d.]/g, '');
  var parts = t.split('.');
  if(parts.length > 2) t = parts[0] + '.' + parts.slice(1).join('');
  return t === '' ? null : Number(t);
};

/** فیلدهای قابل ورود: کلید، عنوان، الزامی، مترادف‌ها */
var IMP_FIELDS = {
  students: [
    /* هویت — در فایل‌های واقعی مدرسه «نام» و «نام خانوادگی» جدا هستند */
    ['first_name','نام',0,['نام','نام دانش آموز','اسم']],
    ['last_name','نام خانوادگی',0,['نام خانوادگی','فامیل','فامیلی','نام فامیل']],
    ['full_name','نام و نام خانوادگی',0,['نام و نام خانوادگی','نام کامل','نام و نام‌خانوادگی']],
    ['national_id','کد ملی',0,['کد ملی','کدملی','شماره ملی','شماره‌ملی']],
    ['birth_date','تاریخ تولد',0,['تاریخ تولد','تولد','ت تولد']],
    ['gender','جنسیت',0,['جنسیت','جنس']],
    ['shenasname_serial','سریال شناسنامه',0,['سریال شناسنامه','سریال','شماره شناسنامه']],
    ['shenasname_seri','سری شناسنامه',0,['سری شناسنامه','سری']],
    /* تحصیلی */
    ['class_name','کلاس',0,['کلاس','نام کلاس','پایه و کلاس']],
    ['field','رشته',0,['رشته','رشته تحصیلی','گرایش']],
    ['last_gpa','معدل سال گذشته',0,['معدل سال گذشته','معدل قبلی','معدل']],
    ['failed_count','تعداد درس افتاده',0,['تعداد درس افتاده','درس افتاده','مردودی']],
    /* پدر */
    ['father_name','نام پدر',0,['نام پدر','پدر']],
    ['father_nid','کد ملی پدر',0,['کد ملی پدر','کدملی پدر','کد ملی ولی']],
    ['father_edu','تحصیلات پدر',0,['تحصیلات پدر','مدرک پدر']],
    ['father_alive','وضعیت حیات پدر',0,['وضعیت حیات پدر','حیات پدر']],
    ['father_job','شغل پدر',0,['شغل پدر','حرفه پدر']],
    ['father_phone','موبایل پدر',0,['موبایل پدر','شماره پدر','تلفن پدر','همراه پدر']],
    /* مادر */
    ['mother_name','نام مادر',0,['نام مادر','مادر']],
    ['mother_nid','کد ملی مادر',0,['کد ملی مادر','کدملی مادر']],
    ['mother_edu','تحصیلات مادر',0,['تحصیلات مادر','مدرک مادر']],
    ['mother_alive','وضعیت حیات مادر',0,['وضعیت حیات مادر','حیات مادر']],
    ['mother_job','شغل مادر',0,['شغل مادر','حرفه مادر']],
    ['mother_phone','موبایل مادر',0,['موبایل مادر','شماره مادر','تلفن مادر','همراه مادر']],
    /* سرپرست و خانواده */
    ['guardian','سرپرست دانش آموز',0,['سرپرست دانش آموز','سرپرست','ولی']],
    ['guardian_alive','وضعیت حیات',0,['وضعیت حیات','حیات']],
    ['sisters','تعداد خواهر',0,['تعداد خواهر','خواهر']],
    ['brothers','تعداد برادر',0,['تعداد برادر','برادر']],
    /* حمایتی */
    ['covered','تحت پوشش',0,['تحت پوشش','تحت‌پوشش']],
    ['org_type','نوع ارگان',0,['نوع ارگان','ارگان','نهاد حمایتی']],
    ['org_percent','درصد',0,['درصد','درصد حمایت']],
    ['talent','استعداد یابی',0,['استعداد یابی','استعدادیابی','استعداد']],
    /* تماس و نشانی */
    ['phone','موبایل دانش آموز',0,['موبایل دانش آموز','موبایل دانش‌آموز','همراه دانش آموز','موبایل','شماره تماس']],
    ['landline','شماره ثابت',0,['شماره ثابت','تلفن ثابت','ثابت','تلفن منزل']],
    ['residence','محل سکونت',0,['محل سکونت','سکونت','شهر یا روستا']],
    ['village','نام روستا',0,['نام روستا','روستا']],
    ['residence_status','وضعیت اقامت',0,['وضعیت اقامت','اقامت','تابعیت']],
    ['address','آدرس',0,['آدرس','نشانی','ادرس']]
  ],
  teachers: [
    ['first_name','نام',0,['نام','نام دبیر','نام معلم','اسم']],
    ['last_name','نام خانوادگی',0,['نام خانوادگی','فامیل','فامیلی']],
    ['full_name','نام و نام خانوادگی',0,['نام و نام خانوادگی','نام کامل']],
    ['national_id','کد ملی',0,['کد ملی','کدملی','شماره ملی']],
    ['phone','موبایل',0,['موبایل','تلفن همراه','شماره تماس','همراه']],
    ['subject','درس تخصصی',0,['درس','تخصص','رشته','درس تخصصی']],
    ['degree','مدرک تحصیلی',0,['مدرک','تحصیلات','مدرک تحصیلی']],
    ['address','آدرس',0,['آدرس','نشانی']]
  ]
};

/* ستون‌هایی که هرگز نباید نگاشت شوند (شماره ردیف و ستون‌های خالی) */
var IMP_IGNORE = ['ردیف','شماره','رديف','#','ش'];

/* فیلدهای تکمیلی که مستقیم روی رکورد کاربر ذخیره می‌شوند */
var IMP_EXTRA_FIELDS = ['first_name','last_name','field','last_gpa','failed_count',
  'father_name','father_edu','father_alive','father_job','father_phone',
  'mother_name','mother_edu','mother_alive','mother_job','mother_phone',
  'guardian','guardian_alive','sisters','brothers',
  'covered','org_type','org_percent','talent',
  'landline','residence','village','residence_status','address',
  'shenasname_serial','shenasname_seri','degree'];

/** خواندن csv با پشتیبانی از کاما، نقطه‌ویرگول و تب */
function parseCSV(text){
  var lines = String(text).replace(/^\uFEFF/, '').split(/\r?\n/).filter(function(l){ return l.trim(); });
  return lines.map(function(l){
    return l.split(/[,;\t]/).map(function(c){ return c.replace(/^"|"$/g, '').trim(); });
  });
}

/** آیا مرورگر از باز کردن فشرده‌سازی پشتیبانی می‌کند؟ */
function canReadXlsx(){
  return typeof DecompressionStream !== 'undefined' && typeof Blob !== 'undefined';
}

/**
 * خواندن فایل xlsx بدون هیچ کتابخانه‌ای.
 * ساختار zip خوانده می‌شود، سپس xml برگه‌ها تحلیل می‌گردد.
 */
async function parseXLSX(file){
  var buf = new Uint8Array(await file.arrayBuffer());
  var dv = new DataView(buf.buffer);
  /* یافتن انتهای فهرست مرکزی بایگانی */
  var eocd = -1;
  for(var i = buf.length - 22; i >= 0; i--){
    if(dv.getUint32(i, true) === 0x06054b50){ eocd = i; break; }
  }
  if(eocd < 0) throw new Error('فایل اکسل معتبر نیست');
  var count = dv.getUint16(eocd + 10, true), cdOff = dv.getUint32(eocd + 16, true);
  var files = {}, p = cdOff;
  for(var n = 0; n < count; n++){
    if(dv.getUint32(p, true) !== 0x02014b50) break;
    var method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true);
    var nameLen = dv.getUint16(p + 28, true), extraLen = dv.getUint16(p + 30, true),
        cmtLen = dv.getUint16(p + 32, true);
    var lho = dv.getUint32(p + 42, true);
    var name = new TextDecoder().decode(buf.slice(p + 46, p + 46 + nameLen));
    var lNameLen = dv.getUint16(lho + 26, true), lExtraLen = dv.getUint16(lho + 28, true);
    var dataStart = lho + 30 + lNameLen + lExtraLen;
    files[name] = { method: method, data: buf.slice(dataStart, dataStart + csize) };
    p += 46 + nameLen + extraLen + cmtLen;
  }
  var inflate = async function(e){
    if(!e) return '';
    if(e.method === 0) return new TextDecoder().decode(e.data);
    if(!canReadXlsx()) throw new Error('مرورگر شما از خواندن xlsx پشتیبانی نمی‌کند؛ فایل را csv ذخیره کنید');
    var ds = new DecompressionStream('deflate-raw');
    var stream = new Blob([e.data]).stream().pipeThrough(ds);
    return new TextDecoder().decode(new Uint8Array(await new Response(stream).arrayBuffer()));
  };
  var unent = function(x){
    return String(x).replace(/&amp;/g,'&').replace(/&lt;/g,'<')
      .replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'");
  };
  var sharedXml = await inflate(files['xl/sharedStrings.xml']);
  var shared = (sharedXml.match(/<si>[\s\S]*?<\/si>/g) || []).map(function(si){
    var parts = si.match(/<t[^>]*>([\s\S]*?)<\/t>/g) || [];
    return unent(parts.map(function(t){ return t.replace(/<[^>]*>/g, ''); }).join(''));
  });
  var wbXml = await inflate(files['xl/workbook.xml']);
  var sheetNames = (wbXml.match(/<sheet[^>]*name="([^"]*)"/g) || []).map(function(m){
    return (m.match(/name="([^"]*)"/) || [])[1] || '';
  });
  var sheets = [], idx = 1;
  while(files['xl/worksheets/sheet' + idx + '.xml']){
    var xml = await inflate(files['xl/worksheets/sheet' + idx + '.xml']);
    var rows = [];
    (xml.match(/<row[^>]*>[\s\S]*?<\/row>/g) || []).forEach(function(rowXml){
      var cells = [];
      var re = /<c([^>]*)>([\s\S]*?)<\/c>|<c([^>]*)\/>/g, cm;
      while((cm = re.exec(rowXml)) !== null){
        var attrs = cm[1] || cm[3] || '', inner = cm[2] || '';
        var ref = (attrs.match(/r="([A-Z]+)/) || [])[1] || '';
        var col = 0;
        for(var c2 = 0; c2 < ref.length; c2++) col = col * 26 + (ref.charCodeAt(c2) - 64);
        var t = (attrs.match(/t="([^"]*)"/) || [])[1];
        var v = (inner.match(/<v>([\s\S]*?)<\/v>/) || [])[1] || '';
        if(t === 's') v = shared[Number(v)] || '';
        else if(t === 'inlineStr') v = unent((inner.match(/<t[^>]*>([\s\S]*?)<\/t>/) || [])[1] || '');
        else v = unent(v);
        cells[Math.max(0, col - 1)] = String(v);
      }
      rows.push(cells);
    });
    sheets.push({ name: sheetNames[idx - 1] || ('برگه ' + idx), rows: rows });
    idx++;
  }
  return sheets;
}

/** حدس هوشمند نگاشت ستون‌ها بر پایهٔ عنوان و مترادف‌ها */
function suggestMap(headers, entity){
  var out = {}, used = {};
  headers.forEach(function(h, i){
    var nh = normHdr(h);
    if(!nh) return;
    /* ستون شماره ردیف داده نیست؛ نگاشت نمی‌شود */
    if(IMP_IGNORE.indexOf(nh) > -1) return;
    var best = null, score = 0;
    IMP_FIELDS[entity].forEach(function(fld){
      var key = fld[0];
      if(used[key]) return;
      [fld[1]].concat(fld[3]).forEach(function(sy){
        var ns = normHdr(sy), sc = 0;
        if(nh === ns) sc = 100;
        else if(nh.indexOf(ns) > -1 || ns.indexOf(nh) > -1) sc = 70 + Math.min(20, ns.length);
        if(sc > score){ score = sc; best = key; }
      });
    });
    if(best && score >= 70){ out[i] = best; used[best] = true; }
  });
  return out;
}

/** تشخیص ردیف تیتر (پرمحتواترین ردیف میان پنج ردیف نخست) */
function prepSheet(rows, entity){
  var hi = 0, best = 0;
  rows.slice(0, 5).forEach(function(r, i){
    var n = r.filter(function(c){ return String(c || '').trim(); }).length;
    if(n > best){ best = n; hi = i; }
  });
  var headers = (rows[hi] || []).map(function(h){ return String(h == null ? '' : h).trim(); });
  var body = rows.slice(hi + 1).filter(function(r){
    return r.some(function(c){ return String(c == null ? '' : c).trim(); });
  });
  return { headers: headers, rows: body, mapping: suggestMap(headers, entity) };
}

/**
 * اعتبارسنجی ردیف‌ها پیش از ثبت.
 * هیچ داده‌ای اینجا نوشته نمی‌شود جز ثبت تعارض کد ملی.
 */
function validateImport(rows, mapping, entity){
  var sid = S.user.school_id, seen = {}, out = [], newClasses = [];
  var classes = visibleClasses();
  var clsByName = Object.create(null);
  classes.forEach(function(c){ clsByName[normHdr(c.name)] = c; });

  rows.forEach(function(row, i){
    var o = {};
    Object.keys(mapping).forEach(function(idx){
      var fk = mapping[idx];
      if(fk) o[fk] = String(row[Number(idx)] == null ? '' : row[Number(idx)]).trim();
    });
    var errors = [], warns = [], data = {};

    /* فایل‌های واقعی مدرسه «نام» و «نام خانوادگی» را جدا دارند؛
       هر دو حالت پشتیبانی می‌شود و در نبود نام کامل، از دو ستون ساخته می‌شود */
    var fn = (o.first_name || '').replace(/\s+/g, ' ').trim();
    var ln = (o.last_name || '').replace(/\s+/g, ' ').trim();
    data.full_name = (o.full_name || '').replace(/\s+/g, ' ').trim()
      || (fn + ' ' + ln).trim();
    if(fn) data.first_name = fn;
    if(ln) data.last_name = ln;
    if(data.full_name.length < 3) errors.push('نام و نام خانوادگی الزامی است');

    var nid = toLatinDigits(o.national_id).replace(/\D/g, '');
    if(nid){
      if(!validNid(nid)) errors.push('کد ملی «' + nid + '» معتبر نیست');
      else if(seen[nid]) errors.push('کد ملی در همین فایل تکراری است');
      else {
        seen[nid] = true;
        var owner = (typeof nidOwner === 'function') ? nidOwner(nid) : null;
        if(owner){
          if(owner.school_id === sid && owner.role === 'student'){
            warns.push('قبلاً ثبت شده — به‌روزرسانی می‌شود');
            data.existing_id = owner.id;
          } else {
            errors.push('کد ملی متعلق به «' + owner.full_name + '» در '
              + ((byId('schools', owner.school_id) || {}).name || 'مدرسه دیگر') + ' است');
            if(entity === 'students' && owner.role === 'student' && typeof recordConflict === 'function')
              recordConflict(sid, nid, data.full_name, owner, 'excel');
          }
        }
        data.national_id = nid;
      }
    } else warns.push('بدون کد ملی');

    /* موبایل دانش‌آموز و پدر جدا نگه داشته می‌شوند */
    var ph = toLatinDigits(o.phone).replace(/\D/g, '');
    if(ph && /^09\d{9}$/.test(ph)) data.phone = ph;
    else if(ph) warns.push('موبایل دانش‌آموز نامعتبر است');
    var fph = toLatinDigits(o.father_phone).replace(/\D/g, '');
    if(fph && /^09\d{9}$/.test(fph)) data.father_phone = fph;
    else if(fph) warns.push('موبایل پدر نامعتبر است');
    /* اگر دانش‌آموز شماره ندارد، شمارهٔ پدر جای تماس اصلی می‌نشیند */
    if(!data.phone && data.father_phone) data.phone = data.father_phone;

    if(entity === 'students'){
      var cname = (o.class_name || '').trim();
      if(cname){
        var cls = clsByName[normHdr(cname)];
        if(cls) data.class_id = cls.id;
        else {
          data.new_class = cname;
          if(newClasses.indexOf(cname) < 0) newClasses.push(cname);
          warns.push('کلاس «' + cname + '» ساخته می‌شود');
        }
      } else warns.push('بدون کلاس');

      if(o.birth_date){
        var iso = '';
        try{ iso = jalaliToIso(o.birth_date) || ''; }catch(e){ iso = ''; }
        if(!iso && /^\d{4}-\d{2}-\d{2}$/.test(o.birth_date)) iso = o.birth_date;
        if(iso) data.birth_date = iso; else warns.push('تاریخ تولد خوانده نشد');
      }
      var g = normHdr(o.gender);
      data.gender = /پسر|مذکر/.test(g) ? 'پسر' : /دختر|مونث|مؤنث/.test(g) ? 'دختر' : null;
      ['father_nid','mother_nid'].forEach(function(k){
        var v = toLatinDigits(o[k]).replace(/\D/g, '');
        if(v && validNid(v)) data[k] = v;
        else if(v) warns.push('کد ملی ' + (k === 'father_nid' ? 'پدر' : 'مادر') + ' نامعتبر است');
      });
      data.father_name = (o.father_name || '').trim() || null;
      data.mother_name = (o.mother_name || '').trim() || null;

      /* شمارهٔ مادر جدا از پدر نگه داشته می‌شود */
      var mph = toLatinDigits(o.mother_phone).replace(/\D/g, '');
      if(mph && /^09\d{9}$/.test(mph)) data.mother_phone = mph;
      else if(mph) warns.push('موبایل مادر نامعتبر است');

      /* اطلاعات تکمیلی — بدون اعتبارسنجی سخت‌گیرانه، چون اختیاری‌اند */
      ['father_edu','mother_edu','father_job','mother_job','guardian',
       'field','residence','village','residence_status','address',
       'shenasname_serial','shenasname_seri','talent','org_type'].forEach(function(k){
        var v = (o[k] || '').trim();
        if(v) data[k] = v;
      });

      /* وضعیت حیات: هر عبارتی که «فوت» داشته باشد یعنی درگذشته */
      ['father_alive','mother_alive','guardian_alive'].forEach(function(k){
        var v = normHdr(o[k]);
        if(!v) return;
        data[k] = /فوت|مرحوم|متوفی/.test(v) ? 'فوت' : 'در قید حیات';
      });

      /* اعداد */
      ['sisters','brothers','failed_count','org_percent'].forEach(function(k){
        var n = toNumFa(o[k]);
        if(n !== null && !isNaN(n)) data[k] = n;
      });
      /* معدل در فایل واقعی به شکل «۱۲/۸۸» است — اسلش نقش ممیز دارد */
      var g = toNumFa(o.last_gpa);
      if(g !== null && !isNaN(g)){
        if(g >= 0 && g <= 20) data.last_gpa = g;
        else warns.push('معدل «' + esc(String(o.last_gpa)) + '» خارج از بازهٔ ۰ تا ۲۰ است');
      }

      /* تحت پوشش: بلی/خیر */
      var cov = normHdr(o.covered);
      if(cov) data.covered = /بل[ىی]|بله|دارد|آر[ىی]/.test(cov) ? 1 : 0;

      /* شمارهٔ ثابت */
      var land = toLatinDigits(o.landline).replace(/\D/g, '');
      if(land) data.landline = land;
    } else {
      data.subject = (o.subject || '').trim() || null;
      ['degree','address'].forEach(function(k){
        var v = (o[k] || '').trim();
        if(v) data[k] = v;
      });
    }
    out.push({ row: i + 1, data: data, errors: errors, warns: warns, ok: errors.length === 0 });
  });

  return { rows: out, newClasses: newClasses, counts: {
    total: out.length,
    ok: out.filter(function(r){ return r.ok; }).length,
    failed: out.filter(function(r){ return !r.ok; }).length,
    updates: out.filter(function(r){ return r.ok && r.data.existing_id; }).length } };
}

/** ثبت نهایی — همهٔ نوشتن‌ها در یک دسته تا رابط قفل نشود */
function commitImport(st){
  var sid = S.user.school_id, p = st.preview;
  var report = { created:0, updated:0, parents:0, classes:0, skipped:p.counts.failed };
  batchWrites(function(){
    p.newClasses.forEach(function(cn){
      if(visibleClasses().some(function(c){ return normHdr(c.name) === normHdr(cn); })) return;
      insert('classes', { school_id: sid, name: cn,
        grade: cn.split(' ')[0] || null, field: cn.split(' ').slice(1).join(' ') || null,
        capacity: 40, grade_level: (typeof gradeFromName === 'function') ? gradeFromName(cn) : null });
      report.classes++;
    });
    var seq = db.users.length;
    var taken = Object.create(null);
    db.users.forEach(function(u){ taken[u.username] = true; });
    var freeName = function(pre){
      var un = pre + (++seq);
      while(taken[un]) un = pre + (++seq);
      taken[un] = true;
      return un;
    };
    p.rows.forEach(function(r){
      if(!r.ok) return;
      var d = r.data, uid = d.existing_id;
      if(uid){
        var cur = byId('users', uid) || {};
        var patch = { full_name: d.full_name, phone: d.phone || cur.phone,
          father_nid: d.father_nid || cur.father_nid, mother_nid: d.mother_nid || cur.mother_nid,
          birth_date: d.birth_date || cur.birth_date };
        /* فیلدهای تکمیلی فقط وقتی در فایل آمده‌اند به‌روز می‌شوند */
        IMP_EXTRA_FIELDS.forEach(function(k){
          if(d[k] !== undefined && d[k] !== null && d[k] !== '') patch[k] = d[k];
        });
        update('users', uid, patch);
        report.updated++;
      } else {
        var rec = insert('users', { school_id: sid,
          role: st.entity === 'students' ? 'student' : 'teacher',
          full_name: d.full_name, username: freeName(st.entity === 'students' ? 'st' : 'tc'),
          password: '123456', national_id: d.national_id || null, phone: d.phone || '',
          active: 1, father_nid: d.father_nid || null, mother_nid: d.mother_nid || null,
          birth_date: d.birth_date || null, gender: d.gender || null,
          subject: d.subject || null, status: 'active', created_at: todayISO() });
        /* فیلدهای تکمیلی فایل مدرسه روی همان رکورد نوشته می‌شوند */
        IMP_EXTRA_FIELDS.forEach(function(k){
          if(d[k] !== undefined && d[k] !== null && d[k] !== '') rec[k] = d[k];
        });
        uid = rec.id;
        report.created++;
      }
      if(st.entity === 'students'){
        var cls = d.class_id ? byId('classes', d.class_id)
          : visibleClasses().filter(function(c){ return normHdr(c.name) === normHdr(d.new_class || ''); })[0];
        if(cls){
          db.enrollments.filter(function(e){ return e.student_id === uid; })
            .forEach(function(e){ remove('enrollments', e.id); });
          insert('enrollments', { school_id: sid, class_id: cls.id, student_id: uid });
          update('users', uid, {
            grade_level: cls.grade_level || ((typeof gradeFromName === 'function') ? gradeFromName(cls.name) : null) });
        }
        [[d.father_nid, d.father_name, 'پدر'], [d.mother_nid, null, 'مادر']].forEach(function(pair){
          var pnid = pair[0], pname = pair[1], rel = pair[2];
          if(!pnid && !pname) return;
          var parent = pnid ? db.users.filter(function(u){
            return u.national_id === pnid && ['parent','teacher','manager'].indexOf(u.role) > -1; })[0] : null;
          if(!parent){
            parent = insert('users', { school_id: sid, role: 'parent',
              full_name: pname || (rel + ' ' + d.full_name), username: freeName('pr'),
              password: '123456', national_id: pnid || null, phone: d.phone || '',
              active: 1, status: 'active', created_at: todayISO() });
            report.parents++;
          }
          if(parent && !db.parent_links.some(function(l){
              return l.parent_id === parent.id && l.student_id === uid; })){
            insert('parent_links', { parent_id: parent.id, student_id: uid, relation: rel });
          }
        });
      }
    });
  });
  return report;
}

/* ------------------------------- نما ------------------------------- */
function viewImport(){
  var st = S.imp || { step:0, entity:'students' };
  var steps = ['انتخاب فایل','نگاشت ستون‌ها','بررسی و خطاها','ثبت نهایی'];
  var barTop = steps.map(function(t, i){
    return '<div class="row" style="gap:8px;flex:1;min-width:0">'
      + '<span style="width:26px;height:26px;border-radius:50%;display:grid;place-items:center;flex:none;'
      + 'font-weight:800;font-size:12.5px;background:' + (i <= st.step ? 'var(--primary)' : 'var(--surface-2)')
      + ';color:' + (i <= st.step ? '#fff' : 'var(--muted)') + '">' + fa(i + 1) + '</span>'
      + '<b class="small" style="color:'
      + (i === st.step ? 'var(--primary)' : (i < st.step ? 'var(--text)' : 'var(--muted)'))
      + '">' + t + '</b></div>';
  }).join('');
  var body = '';

  if(st.step === 0){
    body = '<div class="card"><div class="card-head"><h3>📄 فایل اطلاعات مدرسه را انتخاب کنید</h3></div><div class="card-body">'
      + f('نوع اطلاعات', sel('imp_entity',
          [['students','دانش‌آموزان (به‌همراه اولیا و کلاس)'],['teachers','دبیران']], st.entity))
      + '<div style="margin-top:14px;border:2px dashed var(--border);border-radius:14px;padding:34px 16px;'
      + 'text-align:center;background:var(--surface-2)">'
      + '<div style="font-size:40px">📊</div><b style="display:block;margin:10px 0 4px">فایل را انتخاب کنید</b>'
      + '<div class="small muted">فرمت‌های xlsx و csv</div>'
      + '<input type="file" id="imp_file" accept=".xlsx,.csv" style="margin-top:12px" /></div>'
      + '<div class="small muted" style="margin-top:14px;line-height:2">'
      + '✅ نیازی به قالب آماده نیست؛ همان فایل موجود مدرسه با هر ترتیب ستونی قابل استفاده است.<br>'
      + '✅ ردیف‌های تیتر خودکار تشخیص داده می‌شوند و ستون‌ها هوشمند نگاشت می‌شوند.<br>'
      + '✅ تاریخ شمسی، اعداد فارسی و شماره‌های ناقص خودکار اصلاح یا گزارش می‌شوند.'
      + (canReadXlsx() ? '' : '<br><span style="color:var(--amber)">⚠️ مرورگر شما xlsx را باز نمی‌کند؛ فایل را csv ذخیره کنید.</span>')
      + '</div></div></div>';
  }

  if(st.step === 1 && st.sheet){
    var fields = IMP_FIELDS[st.entity];
    var mapped = Object.keys(st.mapping || {}).filter(function(k){ return st.mapping[k]; }).length;
    body = '<div class="card"><div class="card-head"><h3>🔗 هر ستون فایل به کدام فیلد سامانه است؟</h3>'
      + '<span class="badge b-blue">' + fa(mapped) + ' ستون نگاشت شد</span></div>'
      + '<div class="table-wrap"><table class="table map-table"><thead><tr><th>ستون فایل</th>'
      + '<th>نمونه داده</th><th>فیلد سامانه</th></tr></thead><tbody>'
      + st.sheet.headers.map(function(h, i){
          var sample = st.sheet.rows.slice(0, 2).map(function(r){ return r[i]; })
            .filter(Boolean).join(' · ') || '—';
          return '<tr' + (st.mapping[i] ? ' style="background:var(--green-soft)"' : '') + '>'
            + '<td data-l="ستون فایل"><b>' + esc(h || ('ستون ' + fa(i + 1))) + '</b></td>'
            + '<td data-l="نمونه داده" class="small muted">' + esc(sample) + '</td>'
            + '<td data-l="فیلد سامانه"><select class="select" data-f="impmap" data-i="' + i + '">'
            + '<option value="">— نادیده بگیر —</option>'
            + fields.map(function(fl){
                return '<option value="' + fl[0] + '" ' + (st.mapping[i] === fl[0] ? 'selected' : '') + '>'
                  + fl[1] + (fl[2] ? ' *' : '') + '</option>';
              }).join('')
            + '</select></td></tr>';
        }).join('')
      + '</tbody></table></div><div class="card-body"><div class="row" style="gap:8px">'
      + '<button class="btn ghost" data-act="imp-back">بازگشت</button>'
      + '<button class="btn" data-act="imp-preview">بررسی داده‌ها ←</button></div></div></div>';
  }

  if(st.step === 2 && st.preview){
    var p = st.preview;
    body = '<div class="grid g4" style="margin-bottom:14px">'
      + statCard('📋', fa(p.counts.total), 'کل ردیف‌ها', 'blue')
      + statCard('✅', fa(p.counts.ok), 'آماده ثبت', 'green')
      + statCard('⛔', fa(p.counts.failed), 'دارای خطا', 'red')
      + statCard('♻️', fa(p.counts.updates), 'به‌روزرسانی موجود', 'amber') + '</div>'
      + '<div class="card"><div class="card-head"><h3>بررسی ردیف‌به‌ردیف</h3>'
      + (p.newClasses.length ? '<span class="badge b-amber">کلاس‌های جدید: '
          + esc(p.newClasses.join('، ')) + '</span>' : '') + '</div>'
      + '<div class="table-wrap"><table class="table"><thead><tr><th>#</th><th>وضعیت</th>'
      + '<th>نام</th><th>کد ملی</th><th>پیام‌ها</th></tr></thead><tbody>'
      + p.rows.slice(0, 200).map(function(r){
          return '<tr' + (r.ok ? '' : ' style="background:var(--red-soft)"') + '>'
            + '<td>' + fa(r.row) + '</td>'
            + '<td><span class="badge ' + (r.ok ? (r.warns.length ? 'b-amber' : 'b-green') : 'b-red') + '">'
            + (r.ok ? (r.warns.length ? 'با هشدار' : 'سالم') : 'خطا') + '</span></td>'
            + '<td><b>' + esc(r.data.full_name || '—') + '</b></td>'
            + '<td class="small muted">' + esc(r.data.national_id || '—') + '</td>'
            + '<td class="small">'
            + r.errors.map(function(e){ return '<div style="color:var(--red)">⛔ ' + esc(e) + '</div>'; }).join('')
            + r.warns.map(function(x){ return '<div class="muted">⚠️ ' + esc(x) + '</div>'; }).join('')
            + '</td></tr>';
        }).join('')
      + '</tbody></table></div><div class="card-body"><div class="row" style="gap:8px">'
      + '<button class="btn ghost" data-act="imp-back">بازگشت به نگاشت</button>'
      + '<button class="btn" data-act="imp-commit">ثبت ' + fa(p.counts.ok) + ' ردیف در سامانه</button>'
      + (p.counts.failed ? '<span class="small muted">ردیف‌های خطادار رد می‌شوند.</span>' : '')
      + '</div></div></div>';
  }

  if(st.step === 3 && st.result){
    var r2 = st.result;
    body = '<div class="card"><div class="card-body" style="text-align:center;padding:30px 16px">'
      + '<div style="font-size:44px">🎉</div><h3 style="margin:10px 0 16px">ورود اطلاعات کامل شد</h3>'
      + '<div class="grid g4" style="max-width:640px;margin:0 auto">'
      + statCard('➕', fa(r2.created), 'رکورد جدید', 'green')
      + statCard('♻️', fa(r2.updated), 'به‌روزرسانی', 'blue')
      + statCard('👨‍👩‍👦', fa(r2.parents), 'حساب ولی', 'purple')
      + statCard('🏛️', fa(r2.classes), 'کلاس جدید', 'amber') + '</div>'
      + (r2.skipped ? '<div class="small muted" style="margin-top:12px">'
          + fa(r2.skipped) + ' ردیف به‌دلیل خطا رد شد.</div>' : '')
      + '<div style="margin-top:18px"><button class="btn" data-act="imp-reset">ورود فایل دیگر</button></div>'
      + '</div></div>';
  }

  return '<div class="card" style="margin-bottom:14px"><div class="card-body">'
    + '<div class="row" style="gap:6px;justify-content:space-between">' + barTop + '</div></div></div>' + body;
}
