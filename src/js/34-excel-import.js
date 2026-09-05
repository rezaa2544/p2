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
    /* پایه ممکن است ستون جدا باشد؛ با رشته ترکیب و کلاس‌بندی می‌شود */
    ['grade','پایه',0,['پایه','مقطع تحصیلی','سال تحصیلی','پایه تحصیلی']],
    ['field','رشته',0,['رشته','رشته تحصیلی','گرایش','رشته و گرایش']],
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
  ],
  /* نمرات دورهٔ گذشته: دانش‌آموز با کد ملی یا نام پیدا می‌شود؛
     درس با نام در بانک درس‌های همین مدرسه تطبیق می‌یابد. */
  grades: [
    ['full_name','نام و نام خانوادگی',0,['نام','نام دانش آموز','اسم','نام و نام خانوادگی','نام کامل']],
    ['national_id','کد ملی',0,['کد ملی','کدملی','شماره ملی','شماره‌ملی']],
    ['class_name','کلاس',0,['کلاس','نام کلاس','پایه و کلاس']],
    ['subject','درس',1,['درس','نام درس','درس تحصیلی','برگه']],
    ['term','نوبت',0,['نوبت','ترم','نوبت تحصیلی','نیم‌سال']],
    ['exam_type','نوع آزمون',0,['نوع آزمون','آزمون','نوع برگه','برگه امتحان']],
    ['score','نمره',1,['نمره','نمره درس','امتیاز','نتیجه']],
    ['date','تاریخ آزمون',0,['تاریخ آزمون','تاریخ','تاریخ ثبت']]
  ],
  /* حضور و غیاب دورهٔ گذشته: تاریخ الزامی است؛ وضعیت فارسی/انگلیسی
     هر دو خوانده می‌شود و به چهار وضعیت سامانه تقلیل می‌یابد. */
  attendance: [
    ['full_name','نام و نام خانوادگی',0,['نام','نام دانش آموز','اسم','نام و نام خانوادگی','نام کامل']],
    ['national_id','کد ملی',0,['کد ملی','کدملی','شماره ملی','شماره‌ملی']],
    ['class_name','کلاس',0,['کلاس','نام کلاس','پایه و کلاس']],
    ['date','تاریخ',1,['تاریخ','تاریخ حضور','تاریغ']],
    ['status','وضعیت',1,['وضعیت','حضور و غیاب','حالت','حضور','غیبت']],
    ['note','توضیح',0,['توضیح','یادداشت','شرح','علت']]
  ]
};

/**
 * درس را با نام در بانک درس‌های همان مدرسه پیدا کند.
 * نام تکراری بین رشته‌ها ممکن است (مثل «دین و زندگی ۱» در هر سه
 * شعبه)؛ پارامتر سوم (پایهٔ کلاس دانش‌آموز) ابهام را برطرف می‌کند.
 */
function findSubjectByName(name, sid, gradeWord){
  var subs = (typeof db !== 'undefined' && db) ? (db.subjects || []) : [];
  var want = normHdr(name);
  if(!want) return null;
  var exacts = [], part = null, gw = normHdr(gradeWord || '');
  subs.forEach(function(s){
    if(s.school_id !== sid) return;
    var sn = normHdr(s.name);
    if(!sn) return;
    if(sn === want) exacts.push(s);
    else if(!part && (sn.indexOf(want) > -1 || want.indexOf(sn) > -1)) part = s;
  });
  if(exacts.length === 1) return exacts[0];
  if(exacts.length > 1 && gw){
    var byGrade = exacts.filter(function(s){ return normHdr(s.grade || '') === gw; });
    if(byGrade.length) return byGrade[0];
  }
  return exacts[0] || part;
}

/* وضعیت‌های حضور و غیاب: هر آنچه در فایل مدرسه بیاید،
   به چهار وضعیتِ واحدِ سامانه (ATT_FA) تقلیل می‌یابد */
var ATT_IMPORT_MAP = {
  'present':'present','حاضر':'present','حضور':'present','پ':'present',
  'absent':'absent','غایب':'absent','غیبت':'absent','غ':'absent',
  'late':'late','تأخیر':'late','تاخیر':'late','دیر':'late','د':'late',
  'excused':'excused','موجه':'excused','مرخصی':'excused','م':'excused'
};

/* نوبت: هر شکلی که بیاید به دو نوبتِ واحد تقلیل می‌یابد */
var TERM_IMPORT_MAP = function(x){
  var t = normHdr(toLatinDigits(x));
  if(!t) return null;
  if(/اول|یکم|1$/.test(t)) return 'نوبت اول';
  if(/دوم|دویم|2$/.test(t)) return 'نوبت دوم';
  return null;
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
  /* نقشهٔ کلاس‌بندی یک بار پیش از حلقه؛ درون حلقه ساختنش
     رفتار درجه‌دوم روی محور تعداد کلاس می‌دهد */
  var placeIdx = (typeof buildClassIndex === 'function')
    ? buildClassIndex(sid) : null;
  /* ── توزیع خودکار ──────────────────────────────────────────
     تنظیمات و اشغال یک بار خوانده می‌شوند. شمارندهٔ اشغال با هر
     تخصیص در همین حلقه به‌روز می‌شود؛ اگر از db خوانده شود همهٔ
     ردیف‌ها به یک کلاس می‌روند چون هیچ‌کدام هنوز ثبت نشده‌اند. */
  var pcfg = (typeof placeSettings === 'function') ? placeSettings(sid) : null;
  var pocc = (pcfg && pcfg.autoDistribute && typeof buildOccupancy === 'function')
    ? buildOccupancy(sid) : null;
  var famCls = (pcfg && pcfg.keepSiblings) ? Object.create(null) : null;
  /* نمرات و حضور: دانش‌آموز از پیش در سامانه هست — فقط باید پیدا
     شود، نه ساخته. دو نقشهٔ درهم‌سازی یک بار پیش از حلقه. */
  var stuByNid = Object.create(null), stuByName = Object.create(null), stuCls = Object.create(null);
  if(entity === 'grades' || entity === 'attendance'){
    db.users.forEach(function(u){
      if(u.school_id !== sid || u.role !== 'student' || u.active === 0) return;
      if(u.national_id) stuByNid[u.national_id] = u;
      var nm = normHdr(u.full_name);
      if(nm)(stuByName[nm] = stuByName[nm] || []).push(u);
    });
    db.enrollments.forEach(function(e){
      if(!stuCls[e.student_id]) stuCls[e.student_id] = e.class_id;
    });
  }
  var manualRows = [];   /* ردیف‌هایی که هیچ شعبه‌ای جا نداشت */
  var addCount = Object.create(null);   /* شناسهٔ کلاس ⇐ شمار افزوده */

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
    if((entity === 'students' || entity === 'teachers') && data.full_name.length < 3) errors.push('نام و نام خانوادگی الزامی است');

    var nid = toLatinDigits(o.national_id).replace(/\D/g, '');
    if(nid){
      if(!validNid(nid)) errors.push('کد ملی «' + nid + '» معتبر نیست');
      else if(seen[nid] && entity !== 'grades' && entity !== 'attendance') errors.push('کد ملی در همین فایل تکراری است');
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
      /* متن کلاس‌بندی: ستون کلاس، و اگر نبود ترکیب پایه و رشته.
         فایل‌های واقعی گاهی «کلاس» ندارند ولی «پایه» و «رشته» دارند. */
      var cname = (o.class_name || '').trim();
      var gradeTxt = (o.grade || '').trim();
      var fieldTxt = (o.field || '').trim();
      var placeTxt = cname || ((gradeTxt + ' ' + fieldTxt).trim());

      if(placeTxt){
        /* موتور تشخیص: پایه و رشته را از متن آزاد بیرون می‌کشد و با
           شاخه‌های اعلام‌شدهٔ مدرسه می‌سنجد. */
        var pl = (typeof parsePlacement === 'function') ? parsePlacement(placeTxt, sid) : null;
        /* رشته اگر ستون جدا داشت و در متن کلاس نبود، از آنجا گرفته شود */
        if(pl && !pl.field && fieldTxt && typeof detectField === 'function'){
          var fd2 = detectField(fieldTxt, sid);
          if(fd2 && pl.grade && pl.grade >= 10){
            pl.field = fd2.field; pl.branch = fd2.branch; pl.offered = fd2.offered;
            pl.mode = 'field';
            pl.name = (typeof gradeWordOf === 'function' ? gradeWordOf(pl.grade) : '') + ' ' + fd2.field;
            pl.name = pl.name.trim();
          }
        }
        /* چند شعبهٔ هم‌پایه هست و فایل شعبه را مشخص نکرده؟
           آنجا انتخاب کار توزیع است نه تطبیق. */
        var pcands = (pl && pocc && typeof branchCandidates === 'function')
          ? branchCandidates(pl, placeIdx) : [];
        var pAmbig = !!(pocc && pcands.length > 1
          && typeof hasExplicitSection === 'function'
          && !hasExplicitSection(pl, placeIdx));

        var ex = (!pAmbig && pl && typeof findClassFor === 'function')
               ? findClassFor(pl, sid, placeIdx)
               : (pl ? null : clsByName[normHdr(placeTxt)]);
        if(!ex && !pl) ex = clsByName[normHdr(placeTxt)];

        /* ── توزیع خودکار میان شعبه‌های هم‌پایه ── */
        if(!ex && pAmbig){
          var fkey = (typeof familyKey === 'function') ? familyKey(data) : null;
          var picked = pickBranch(pcands, pocc, {
            gender: data.gender || null,
            separateGender: pcfg.separateGender,
            prefer: (famCls && fkey && famCls[fkey] !== undefined
                     && famCls[fkey].grade === pl.grade) ? famCls[fkey].id : null
          });
          if(picked && picked.cls){
            ex = picked.cls;
            data.auto_placed = true;
          } else if(picked && picked.full){
            /* ⚠️ نه ساخت خودکار کلاس، نه نادیده گرفتن ظرفیت */
            manualRows.push({ row: i + 1, name: data.full_name,
              text: placeTxt, wanted: pl.name,
              candidates: pcands.map(function(c){
                var o = pocc[c.id] || {};
                return { id: c.id, name: c.name, n: o.n || 0, cap: o.cap || 0 };
              }) });
            data.needs_manual = true;
            warns.push('همهٔ شعبه‌های «' + pl.name + '» پر است — نیازمند بررسی دستی');
          }
        }

        if(ex && data.needs_manual) ex = null;
        if(ex){
          data.class_id = ex.id;
          /* شمارندهٔ درون‌حافظه‌ای، نه از db */
          if(pocc && pocc[ex.id] && typeof bumpOcc === 'function')
            bumpOcc(pocc[ex.id], data.gender);
          addCount[ex.id] = (addCount[ex.id] || 0) + 1;
          if(famCls && typeof rememberFamily === 'function')
            rememberFamily(famCls, data, ex.id, pl ? pl.grade : null);
          if(pl && pl.field && !pl.offered)
            warns.push('رشتهٔ «' + pl.field + '» جزو شاخه‌های این مدرسه نیست');
        } else if(!data.needs_manual){
          var nm = pl ? pl.name : placeTxt;
          data.new_class = nm;
          data.place = pl || null;
          if(newClasses.indexOf(nm) < 0) newClasses.push(nm);
          if(pl && pl.field && !pl.offered)
            warns.push('رشتهٔ «' + pl.field + '» جزو شاخه‌های این مدرسه نیست — کلاس ساخته می‌شود');
          else if(pl && pl.field)
            warns.push('کلاس «' + nm + '» ساخته می‌شود (پایهٔ ' + pl.grade + '، رشتهٔ ' + pl.field + ')');
          else
            warns.push('کلاس «' + nm + '» ساخته می‌شود');
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
    } else if(entity === 'teachers'){
      data.subject = (o.subject || '').trim() || null;
      ['degree','address'].forEach(function(k){
        var v = (o[k] || '').trim();
        if(v) data[k] = v;
      });
    } else {
      /* نمرات و حضور و غیاب: دانش‌آموز از پیش هست — فقط پیدا می‌شود.
         کد ملی اولویت دارد؛ وگرنه نام (با کلاس برای رفع ابهام). */
      var stu = data.national_id ? stuByNid[data.national_id] : null;
      if(!stu && data.full_name){
        var nm = normHdr(data.full_name);
        var cands = stuByName[nm] || [];
        if(o.class_name){
          var cn2 = normHdr(o.class_name);
          var inCls = cands.filter(function(u2){
            var c2 = byId('classes', stuCls[u2.id]);
            return c2 && normHdr(c2.name) === cn2;
          });
          if(inCls.length) cands = inCls;
        }
        if(cands.length === 1) stu = cands[0];
        else if(cands.length > 1)
          errors.push('چند دانش‌آموز «' + esc(data.full_name) + '» هستن — کد ملی بنویسید');
      }
      if(!stu) errors.push(data.national_id
        ? 'دانش‌آموز با کد ملی «' + data.national_id + '» در این مدرسه نیست'
        : 'دانش‌آموز «' + esc(data.full_name || '؟') + '» در این مدرسه پیدا نشد');
      if(stu){
        data.student_id = stu.id;
        data.class_id = stuCls[stu.id]
          || (clsByName[normHdr(o.class_name || '')] || {}).id || null;
      }
      if(entity === 'grades'){
        var subjTxt = (o.subject || '').trim();
        if(!subjTxt) errors.push('نام درس الزامی است');
        else{
          /* پایهٔ کلاسِ دانش‌آموز برای رفع ابهامِ درس‌های هم‌نام */
          var stuClsObj = byId('classes', stu ? stuCls[stu.id] : null);
          var gword = (stuClsObj && typeof gradeWordOf === 'function' && stuClsObj.grade_level)
            ? gradeWordOf(stuClsObj.grade_level) : null;
          var su = findSubjectByName(subjTxt, sid, gword);
          if(su) data.subject_id = su.id;
          else errors.push('درس «' + esc(subjTxt) + '» در بانک درس‌های این مدرسه نیست');
        }
        var sc2 = toNumFa(o.score);
        if(sc2 === null || isNaN(sc2)) errors.push('نمره خوانده نشد');
        else if(sc2 < 0 || sc2 > 20) errors.push('نمره «' + esc(String(o.score)) + '» خارج از بازهٔ ۰ تا ۲۰ است');
        else data.score = sc2;
        if(o.term){
          data.term = TERM_IMPORT_MAP(o.term) || null;
          if(!data.term) warns.push('نوبت «' + esc(String(o.term)) + '» خوانده نشد — «نوبت اول» می‌شود');
        }
        data.exam_type = (o.exam_type || '').trim() || 'کلاسی';
        if(o.date){
          var iso2 = '';
          try{ iso2 = jalaliToIso(o.date) || ''; }catch(e2){ iso2 = ''; }
          if(!iso2 && /^\d{4}-\d{2}-\d{2}$/.test(o.date)) iso2 = o.date;
          if(iso2) data.date = iso2; else warns.push('تاریخ آزمون خوانده نشد');
        }
      } else {
        if(!o.date) errors.push('تاریخ الزامی است');
        else{
          var iso3 = '';
          try{ iso3 = jalaliToIso(o.date) || ''; }catch(e3){ iso3 = ''; }
          if(!iso3 && /^\d{4}-\d{2}-\d{2}$/.test(o.date)) iso3 = o.date;
          if(iso3) data.date = iso3;
          else errors.push('تاریخ «' + esc(String(o.date)) + '» خوانده نشد');
        }
        var stRaw = String(o.status == null ? '' : o.status);
        var stKey = ATT_IMPORT_MAP[normHdr(stRaw)] || ATT_IMPORT_MAP[stRaw.trim()];
        if(!stKey) errors.push('وضعیت «' + esc(stRaw) + '» شناخته نمی‌شود (حاضر/غایب/تأخیر/موجه)');
        else data.status = stKey;
        data.note = (o.note || '').trim() || null;
      }
    }
    out.push({ row: i + 1, data: data, errors: errors, warns: warns, ok: errors.length === 0 });
  });

  /* جدول پیش‌نمایش ظرفیت: کلاس / اکنون / افزوده / مجموع / ظرفیت */
  var capRows = Object.keys(addCount).map(function(cid){
    var c = byId('classes', Number(cid)) || {};
    var o = (pocc && pocc[cid]) ? pocc[cid] : null;
    var added = addCount[cid];
    var cap = o ? o.cap : (Number(c.capacity) || 30);
    var after = o ? o.n : added;          /* اشغال پس از افزودن */
    return { id: Number(cid), name: c.name || '—',
             before: after - added, added: added, after: after, cap: cap,
             over: after > cap };
  }).sort(function(a, b){ return a.name < b.name ? -1 : (a.name > b.name ? 1 : 0); });

  return { rows: out, newClasses: newClasses,
    capRows: capRows, manualRows: manualRows,
    settings: pcfg || {},
    counts: {
      total: out.length,
      ok: out.filter(function(r){ return r.ok; }).length,
      failed: out.filter(function(r){ return !r.ok; }).length,
      manual: manualRows.length,
      auto: out.filter(function(r){ return r.ok && r.data.auto_placed; }).length,
      updates: out.filter(function(r){ return r.ok && r.data.existing_id; }).length } };
}

/** ثبت نهایی — همهٔ نوشتن‌ها در یک دسته تا رابط قفل نشود */
function commitImport(st){
  var sid = S.user.school_id, p = st.preview;
  var report = { created:0, updated:0, parents:0, classes:0, skipped:p.counts.failed };
  batchWrites(function(){

    /* نمرات و حضور: دانش‌آموز از پیش هست — فقط رکورد اضافه می‌شود.
       field source:'import' یعنی این رکورد از فایل مدرسه آمده است. */
    if(st.entity === 'grades' || st.entity === 'attendance'){
      p.rows.forEach(function(r){
        if(!r.ok || !r.data || !r.data.student_id) return;
        var d = r.data;
        if(st.entity === 'grades'){
          insert('grades', { school_id: sid, student_id: d.student_id,
            class_id: d.class_id || null, subject_id: d.subject_id,
            teacher_id: null, term: d.term || 'نوبت اول',
            exam_type: d.exam_type || 'کلاسی', score: d.score,
            max_score: 20, date: d.date || null,
            source: 'import', created_at: todayISO() });
        } else {
          insert('attendance', { school_id: sid,
            class_id: d.class_id || null, student_id: d.student_id,
            date: d.date, status: d.status, note: d.note || null,
            source: 'import' });
        }
        report.created++;
      });
      return;
    }

    /* ── نقشه‌های درهم‌سازی ──────────────────────────────────────
       پیش‌تر هر ردیف کل جدول کاربران را می‌پیمود تا ولی را پیدا کند.
       با ۱۲٬۰۰۰ کاربر و ۲٬۰۰۰ ردیف یعنی ۲۴ میلیون مقایسه ⇒ رفتار
       درجه‌دوم. سنجش: ۲۰۰۰ ردیف ۱۴٬۸۴۶ms طول می‌کشید.
       ⚠️ باید پیش از حلقهٔ ساخت کلاس تعریف شوند؛ var بالابری می‌شود
       ولی مقداردهی نه، و نقشه undefined می‌ماند. */
    var parentByNid = Object.create(null);
    db.users.forEach(function(u){
      if(u.national_id && ['parent','teacher','manager'].indexOf(u.role) > -1)
        parentByNid[u.national_id] = u;
    });
    var clsByNorm = Object.create(null);
    visibleClasses().forEach(function(c){ clsByNorm[normHdr(c.name)] = c; });
    var enrByStudent = Object.create(null);
    db.enrollments.forEach(function(e){
      (enrByStudent[e.student_id] = enrByStudent[e.student_id] || []).push(e);
    });
    var linkSet = Object.create(null);
    db.parent_links.forEach(function(l){ linkSet[l.parent_id + '|' + l.student_id] = true; });

    /* مشخصات تشخیص‌داده‌شدهٔ هر کلاس نو، از روی ردیف‌ها */
    var placeOf = Object.create(null);
    p.rows.forEach(function(r){
      if(r.ok && r.data && r.data.new_class && r.data.place)
        placeOf[r.data.new_class] = r.data.place;
    });
    p.newClasses.forEach(function(cn){
      if(clsByNorm[normHdr(cn)]) return;
      var pl = placeOf[cn];
      /* پایه و رشته از موتور تشخیص می‌آید، نه از بریدن نام با فاصله.
         بریدن نام روی «دهم ادبیات و علوم انسانی» رشته را خراب می‌کرد.
         ⚠️ خروجی insert در نقشه ثبت می‌شود، وگرنه ردیف‌های بعدی همین
         کلاس را پیدا نمی‌کنند و ثبت‌نامشان از دست می‌رود. */
      var newCls = insert('classes', { school_id: sid, name: cn,
        grade: pl ? (typeof gradeWordOf === 'function' ? gradeWordOf(pl.grade) : null)
                  : (cn.split(' ')[0] || null),
        field: pl ? (pl.field || null) : (cn.split(' ').slice(1).join(' ') || null),
        class_mode: pl ? pl.mode : null,
        capacity: 40,
        grade_level: pl ? pl.grade
                        : ((typeof gradeFromName === 'function') ? gradeFromName(cn) : null) });
      clsByNorm[normHdr(cn)] = newCls;
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
          : clsByNorm[normHdr(d.new_class || '')];
        if(cls){
          (enrByStudent[uid] || []).forEach(function(e){ remove('enrollments', e.id); });
          var newEnr = insert('enrollments', { school_id: sid, class_id: cls.id, student_id: uid });
          enrByStudent[uid] = [newEnr];
          update('users', uid, {
            grade_level: cls.grade_level || ((typeof gradeFromName === 'function') ? gradeFromName(cls.name) : null) });
        }
        /* نام مادر هم مثل پدر از فایل خوانده می‌شود؛ پیش‌تر null بود و
           همیشه «مادر فلانی» ساخته می‌شد حتی وقتی نامش در فایل بود. */
        [[d.father_nid, d.father_name, 'پدر', d.father_phone],
         [d.mother_nid, d.mother_name, 'مادر', d.mother_phone]].forEach(function(pair){
          var pnid = pair[0], pname = pair[1], rel = pair[2], pphone = pair[3];
          if(!pnid && !pname) return;
          var parent = pnid ? parentByNid[pnid] : null;
          if(!parent){
            parent = insert('users', { school_id: sid, role: 'parent',
              full_name: pname || (rel + ' ' + d.full_name), username: freeName('pr'),
              password: '123456', national_id: pnid || null,
              phone: pphone || d.phone || '',
              active: 1, status: 'active', created_at: todayISO() });
            if(pnid) parentByNid[pnid] = parent;
            report.parents++;
          } else if(pname && !parent.full_name){
            update('users', parent.id, { full_name: pname });
          }
          if(parent && !linkSet[parent.id + '|' + uid]){
            insert('parent_links', { parent_id: parent.id, student_id: uid, relation: rel });
            linkSet[parent.id + '|' + uid] = true;
          }
        });
      }
    });
  });
  return report;
}

/* ------------------------------- نما ------------------------------- */
/**
 * جدول پیش‌نمایش ظرفیت کلاس‌ها.
 *
 * ⚠️ مجموعی که از ظرفیت رد شود باید قرمز باشد. عدد خاکستری در
 * جدول هشدار واقعی نیست و مدیر ماه‌ها بعد کلاس ۵۵ نفره کشف
 * می‌کند.
 */
/**
 * کارت قواعد کلاس‌بندی خودکار.
 *
 * ⚠️ هر دو قانون اختیاری پیش‌فرض خاموش‌اند:
 * تفکیک جنسیتی چون مدارس کوچک و روستایی مختلط‌اند، و
 * هم‌کلاسی خواهر و برادر چون بعضی مدارس عمداً جدا می‌کنند.
 */
function impRulesCard(){
  if(typeof placeSettings !== 'function') return '';
  var sid = S.user.school_id;
  var cfg = placeSettings(sid);
  var mixed = (typeof isMixedSchool === 'function') ? isMixedSchool(sid) : true;
  var sc = byId('schools', sid) || {};

  var chk = function(id, on, label, hint, disabled){
    return '<label class="row" style="gap:10px;align-items:flex-start;padding:10px 0;'
      + 'border-bottom:1px solid var(--border)' + (disabled ? ';opacity:.55' : '') + '">'
      + '<input type="checkbox" id="' + id + '"' + (on ? ' checked' : '')
      + (disabled ? ' disabled' : '') + ' style="margin-top:3px;flex:none" />'
      + '<span style="min-width:0"><b class="small">' + label + '</b>'
      + '<div class="small muted" style="margin-top:2px;line-height:1.9">' + hint + '</div>'
      + '</span></label>';
  };

  return '<div class="card" style="margin-top:14px">'
    + '<div class="card-head"><h3>⚙️ قواعد کلاس‌بندی خودکار</h3></div>'
    + '<div class="card-body">'
    + chk('pr_auto', cfg.autoDistribute !== false, 'توزیع خودکار میان شعبه‌ها',
        'اگر فایل فقط «دهم تجربی» بنویسد و مدرسه چند شعبه داشته باشد، '
        + 'دانش‌آموز به کم‌جمعیت‌ترین شعبهٔ دارای جا می‌رود. '
        + 'شعبه‌ای که در فایل صریح آمده همیشه محترم است.')
    + chk('pr_gender', cfg.separateGender === true, 'تفکیک جنسیتی شعبه‌ها',
        mixed
          ? 'دانش‌آموز به شعبه‌ای با جنسیت غالب مخالف فرستاده نمی‌شود. '
            + 'کلاس خالی جنسیت ندارد و همه‌کس می‌تواند برود.'
          : 'این مدرسه ' + esc(sc.gender || 'تک‌جنسیتی') + ' است و همهٔ '
            + 'دانش‌آموزانش یک جنسیت دارند؛ این قاعده اینجا بی‌اثر است.',
        !mixed)
    + chk('pr_sib', cfg.keepSiblings === true, 'خواهر و برادر هم‌کلاس شوند',
        'تشخیص فقط از روی کد ملی پدر یا مادر است، نه نام خانوادگی. '
        + 'تنها در همان پایه اعمال می‌شود و اگر شعبه پر باشد، ظرفیت مقدم است.')
    + '<div class="row" style="gap:8px;margin-top:12px">'
    + '<button class="btn" data-act="place-rules-save">ذخیرهٔ قواعد</button>'
    + '</div></div></div>';
}

function impCapTable(p){
  var rows = p.capRows || [];
  if(!rows.length) return '';
  var over = rows.filter(function(r){ return r.over; }).length;
  var auto = p.counts && p.counts.auto;

  return '<div class="card" style="margin-bottom:14px">'
    + '<div class="card-head"><h3>📊 نتیجهٔ کلاس‌بندی پیش از ثبت</h3>'
    + (auto ? '<span class="badge b-blue">' + fa(auto) + ' نفر خودکار</span>' : '')
    + (over ? '<span class="badge b-red">' + fa(over) + ' کلاس فراتر از ظرفیت</span>' : '')
    + '</div>'
    + '<div class="table-wrap"><table class="table"><thead><tr>'
    + '<th>کلاس</th><th>اکنون</th><th>افزوده</th><th>مجموع</th>'
    + '<th>ظرفیت</th><th>وضعیت</th></tr></thead><tbody>'
    + rows.map(function(r){
        var pct = r.cap ? Math.round(r.after / r.cap * 100) : 0;
        var col = r.over ? 'var(--red)' : (pct > 90 ? 'var(--amber)' : 'var(--primary)');
        return '<tr' + (r.over ? ' style="background:var(--red-soft)"' : '') + '>'
          + '<td data-l="کلاس"><b>' + esc(r.name) + '</b></td>'
          + '<td data-l="اکنون" class="muted">' + fa(r.before) + '</td>'
          + '<td data-l="افزوده"><b style="color:var(--primary)">+' + fa(r.added) + '</b></td>'
          + '<td data-l="مجموع"><b style="color:' + col + '">' + fa(r.after) + '</b></td>'
          + '<td data-l="ظرفیت" class="muted">' + fa(r.cap) + '</td>'
          + '<td data-l="وضعیت" style="min-width:120px">'
          + (r.over
              ? '<span class="badge b-red">فراتر از ظرفیت</span>'
              : bar(Math.min(100, pct), 100, col))
          + '</td></tr>';
      }).join('')
    + '</tbody></table></div>'
    + (over ? '<div class="card-body"><div class="small" style="color:var(--red)">'
        + '⛔ مجموع این کلاس‌ها از ظرفیت رد شده است. پیش از ثبت، ظرفیت را '
        + 'اصلاح کنید یا ردیف‌ها را جابه‌جا کنید.</div></div>' : '')
    + '</div>';
}

/**
 * بخش «نیازمند بررسی دستی» — وقتی همهٔ شعبه‌ها پر باشند.
 *
 * ⚠️ نه کلاس خودکار ساخته می‌شود، نه ظرفیت نادیده گرفته می‌شود.
 * ⚠️ این ردیف‌ها مانع ثبت بقیه نیستند.
 */
function impManualBlock(p){
  var rows = p.manualRows || [];
  if(!rows.length) return '';

  /* کلاس‌های نامزد یکتا، برای دکمهٔ افزایش ظرفیت */
  var seenC = Object.create(null), cls = [];
  rows.forEach(function(r){
    (r.candidates || []).forEach(function(c){
      if(!seenC[c.id]){ seenC[c.id] = true; cls.push(c); }
    });
  });

  return '<div class="card" style="margin-bottom:14px;border:1px solid var(--red)">'
    + '<div class="card-head"><h3>🖐️ نیازمند بررسی دستی</h3>'
    + '<span class="badge b-red">' + fa(rows.length) + ' ردیف</span></div>'
    + '<div class="card-body"><div class="small muted" style="line-height:2">'
    + 'همهٔ شعبه‌های این پایه پر هستند. سامانه عمداً نه کلاس تازه ساخته و '
    + 'نه ظرفیت را نادیده گرفته است.<br>'
    + '✅ بقیهٔ ردیف‌ها بدون مشکل ثبت می‌شوند؛ این‌ها کنار گذاشته می‌شوند.'
    + '</div></div>'
    + '<div class="table-wrap"><table class="table"><thead><tr>'
    + '<th>#</th><th>نام</th><th>کلاس درخواستی</th><th>وضعیت شعبه‌ها</th>'
    + '</tr></thead><tbody>'
    + rows.slice(0, 100).map(function(r){
        return '<tr><td data-l="#">' + fa(r.row) + '</td>'
          + '<td data-l="نام"><b>' + esc(r.name || '—') + '</b></td>'
          + '<td data-l="کلاس درخواستی">' + esc(r.wanted || r.text || '—') + '</td>'
          + '<td data-l="وضعیت شعبه‌ها" class="small muted">'
          + (r.candidates || []).map(function(c){
              return esc(c.name) + ' ' + fa(c.n) + '/' + fa(c.cap);
            }).join(' · ')
          + '</td></tr>';
      }).join('')
    + '</tbody></table></div>'
    + '<div class="card-body"><b class="small">افزایش ظرفیت کلاس</b>'
    + '<div class="small muted" style="margin:6px 0 10px">'
    + 'ظرفیت تازه را صریح وارد کنید؛ سامانه خودش آن را بالا نمی‌برد.</div>'
    + '<div class="row" style="gap:8px;flex-wrap:wrap">'
    + cls.map(function(c){
        return '<div class="row" style="gap:6px;align-items:center;'
          + 'border:1px solid var(--border);border-radius:10px;padding:6px 10px">'
          + '<b class="small">' + esc(c.name) + '</b>'
          + '<span class="small muted">' + fa(c.n) + '/' + fa(c.cap) + '</span>'
          + '<input class="input" id="impcap_' + c.id + '" type="number" '
          + 'value="' + escAttr(String(c.cap)) + '" style="width:78px" />'
          + '<button class="btn sm" data-act="imp-raise-cap" data-id="'
          + escAttr(String(c.id)) + '">ثبت</button></div>';
      }).join('')
    + '</div></div></div>';
}

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
          [['students','دانش‌آموزان (به‌همراه اولیا و کلاس)'],
           ['teachers','دبیران'],
           ['grades','نمرات دورهٔ گذشته'],
           ['attendance','حضور و غیاب دورهٔ گذشته']], st.entity))
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
      + '</div></div></div>'
      + (st.entity === 'students' ? impRulesCard() : '');
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
      + ((p.counts.auto || p.counts.manual)
          ? '<div class="grid g2" style="margin-bottom:14px">'
            + statCard('🎯', fa(p.counts.auto || 0), 'کلاس‌بندی خودکار', 'blue')
            + statCard('🖐️', fa(p.counts.manual || 0), 'نیازمند بررسی دستی',
                       (p.counts.manual ? 'red' : 'green')) + '</div>'
          : '')
      + impCapTable(p)
      + impManualBlock(p)
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
      + statCard('➕', fa(r2.created),
          st.entity === 'grades' ? 'نمره ثبت‌شده'
          : st.entity === 'attendance' ? 'حضور ثبت‌شده' : 'رکورد جدید', 'green')
      + (st.entity === 'grades' || st.entity === 'attendance'
          ? statCard('⏭️', fa(r2.skipped || 0), 'ردیف ردشده', 'blue')
          : statCard('♻️', fa(r2.updated), 'به‌روزرسانی', 'blue'))
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
