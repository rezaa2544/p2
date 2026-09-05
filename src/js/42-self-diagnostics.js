/* ═══════════════════════════════════════════════════════════════════
   دیاگ سامانه — عیب‌یاب و تعمیرکار خودکار

   مثل دستگاه دیاگ خودرو: خودش می‌گردد، عیب را پیدا می‌کند، شدتش را
   می‌گوید و هرجا امن باشد خودش تعمیر می‌کند.

   فلسفهٔ طراحی (مهم برای هر توسعه‌دهندهٔ بعدی):
   ۱. هر آزمون باید «چه چیزی خراب است» و «چطور درست می‌شود» را
      جداگانه بداند. تشخیص و درمان دو تابع جدا هستند.
   ۲. تعمیر خودکار فقط وقتی مجاز است که **بازگشت‌ناپذیر نباشد** یا
      داده‌ای از بین نبرد. حذف رکورد هرگز خودکار نیست.
   ۳. هر تعمیر پیش از اجرا پشتیبان می‌گیرد.
   ۴. عیب‌یاب هرگز نباید خودش برنامه را بشکند: همه چیز در try.
   ═══════════════════════════════════════════════════════════════════ */

/* شدت عیب */
var DIAG_SEVERITY = {
  critical: { fa: 'بحرانی', color: 'var(--red)',    icon: '🔴', rank: 3 },
  warning:  { fa: 'هشدار',  color: 'var(--amber)',  icon: '🟡', rank: 2 },
  info:     { fa: 'اطلاع',  color: 'var(--primary)',icon: '🔵', rank: 1 }
};

/* دو خانوادهٔ آزمون:
   engine = پیکربندی، زیرساخت و موتور برنامه (مشکل کد و سامانه)
   data   = کیفیت دادهٔ کاربر (مشکل محتوایی که مدرسه وارد کرده)
   تفکیک مهم است: عیب موتور یعنی برنامه ایراد دارد، عیب داده یعنی
   ورودی ایراد دارد. مسئول رفعشان هم فرق می‌کند. */
var DIAG_CATS = {
  engine: { fa:'پیکربندی و موتور برنامه', icon:'⚙️',
            desc:'سلامت زیرساخت، ایندکس، حافظه، مسیرها و دسترسی‌ها' },
  data:   { fa:'کیفیت دادهٔ کاربر', icon:'📋',
            desc:'یکپارچگی و درستی اطلاعاتی که مدارس وارد کرده‌اند' },
  infra:  { fa:'ارتباط، هاست و زیرساخت', icon:'🌐',
            desc:'شبکه، سرور، نسخه، ساعت دستگاه و کلِ حافظهٔ مرورگر' }
};

/* نسخهٔ بیلد — در حالت سرور با نسخهٔ سرور مقایسه می‌شود (آزمون api-version) */
var APP_VERSION = '2026.09.05.2';

/* تاریخچهٔ اجراها — در حافظه، برای مقایسهٔ روند */
var DIAG_HISTORY = [];
var DIAG_MAX_HISTORY = 20;

/* ------------------------------------------------------------------ */
/*  فهرست آزمون‌ها                                                     */
/*  هر آزمون: { id, title, severity, check(), fix()|null, safe }       */
/*  check() → { ok:true } یا { ok:false, msg, items, count }           */
/*  safe:true یعنی تعمیر خودکار مجاز است                               */
/* ------------------------------------------------------------------ */
var DIAG_CHECKS = [

  /* ── ۱. یکپارچگی ارجاع‌ها ─────────────────────────────────────── */
  {
    id: 'orphan-enrollments', cat: 'data',
    title: 'ثبت‌نام بی‌صاحب',
    desc: 'ثبت‌نامی که دانش‌آموز یا کلاسش پاک شده است',
    severity: 'critical',
    safe: true,
    check: function(){
      var bad = db.enrollments.filter(function(e){
        return !byId('users', e.student_id) || !byId('classes', e.class_id);
      });
      return bad.length
        ? { ok:false, count:bad.length, items:bad.slice(0,20),
            msg: bad.length + ' ثبت‌نام به رکورد پاک‌شده اشاره می‌کند' }
        : { ok:true };
    },
    fix: function(res){
      var n = 0;
      batchWrites(function(){
        db.enrollments.filter(function(e){
          return !byId('users', e.student_id) || !byId('classes', e.class_id);
        }).forEach(function(e){ remove('enrollments', e.id); n++; });
      });
      return n + ' ثبت‌نام بی‌صاحب پاک شد';
    }
  },

  {
    id: 'duplicate-enrollment', cat: 'data',
    title: 'ثبت‌نام تکراری',
    desc: 'یک دانش‌آموز در چند کلاس هم‌زمان',
    severity: 'critical',
    safe: true,
    check: function(){
      var by = Object.create(null), dups = [];
      db.enrollments.forEach(function(e){
        (by[e.student_id] = by[e.student_id] || []).push(e);
      });
      Object.keys(by).forEach(function(sid){
        if(by[sid].length > 1){
          var u = byId('users', Number(sid));
          dups.push({ id:Number(sid), name: u ? u.full_name : '؟',
                      count: by[sid].length });
        }
      });
      return dups.length
        ? { ok:false, count:dups.length, items:dups.slice(0,20),
            msg: dups.length + ' دانش‌آموز در بیش از یک کلاس ثبت شده‌اند' }
        : { ok:true };
    },
    fix: function(){
      /* جدیدترین ثبت‌نام می‌ماند، بقیه حذف — چون آخرین اقدام مدیر
         احتمالاً درست‌ترین است. */
      var by = Object.create(null), n = 0;
      db.enrollments.forEach(function(e){
        (by[e.student_id] = by[e.student_id] || []).push(e);
      });
      batchWrites(function(){
        Object.keys(by).forEach(function(sid){
          var list = by[sid];
          if(list.length < 2) return;
          list.sort(function(a,b){ return (b.id||0) - (a.id||0); });
          list.slice(1).forEach(function(e){ remove('enrollments', e.id); n++; });
        });
      });
      return n + ' ثبت‌نام اضافی حذف شد (جدیدترین نگه داشته شد)';
    }
  },

  {
    id: 'orphan-parent-links', cat: 'data',
    title: 'پیوند ولی بی‌صاحب',
    desc: 'پیوندی که ولی یا دانش‌آموزش وجود ندارد',
    severity: 'warning',
    safe: true,
    check: function(){
      var bad = db.parent_links.filter(function(l){
        return !byId('users', l.parent_id) || !byId('users', l.student_id);
      });
      return bad.length
        ? { ok:false, count:bad.length, items:bad.slice(0,20),
            msg: bad.length + ' پیوند ولی به رکورد پاک‌شده اشاره می‌کند' }
        : { ok:true };
    },
    fix: function(){
      var n = 0;
      batchWrites(function(){
        db.parent_links.filter(function(l){
          return !byId('users', l.parent_id) || !byId('users', l.student_id);
        }).forEach(function(l){ remove('parent_links', l.id); n++; });
      });
      return n + ' پیوند بی‌صاحب پاک شد';
    }
  },

  {
    id: 'orphan-users-school', cat: 'data',
    title: 'کاربر بدون مدرسه',
    desc: 'کاربری که مدرسه‌اش پاک شده است',
    severity: 'critical',
    safe: false,   /* حذف کاربر خودکار نیست — داده از بین می‌رود */
    check: function(){
      var bad = db.users.filter(function(u){
        return u.role !== 'superadmin' && u.school_id && !byId('schools', u.school_id);
      });
      return bad.length
        ? { ok:false, count:bad.length,
            items: bad.slice(0,20).map(function(u){
              return { id:u.id, name:u.full_name, role:u.role }; }),
            msg: bad.length + ' کاربر به مدرسهٔ پاک‌شده وابسته‌اند' }
        : { ok:true };
    },
    fix: null,
    when: 'مدرسهٔ کاربر پاک شده ولی کاربرانش مانده‌اند',
    fixDesc: 'کاربران را به مدرسهٔ فعال منتقل کنید (فرم کاربر) یا غیرفعالشان کنید؛ اگر مدرسه اشتباهی پاک شده، از فایل پشتیبان بازیابی کنید.',
    owner: 'admin'
  },

  /* ── ۲. درستی داده ───────────────────────────────────────────── */
  {
    id: 'duplicate-nid', cat: 'data',
    title: 'کد ملی تکراری',
    desc: 'یک کد ملی برای دو نفر',
    severity: 'critical',
    safe: false,   /* نمی‌دانیم کدام درست است — تصمیم با انسان */
    check: function(){
      var by = Object.create(null), dups = [];
      db.users.forEach(function(u){
        if(!u.national_id) return;
        (by[u.national_id] = by[u.national_id] || []).push(u);
      });
      Object.keys(by).forEach(function(k){
        if(by[k].length > 1)
          dups.push({ nid:k, names: by[k].map(function(u){ return u.full_name; }).join('، '),
                      count: by[k].length });
      });
      return dups.length
        ? { ok:false, count:dups.length, items:dups.slice(0,20),
            msg: dups.length + ' کد ملی بین چند کاربر مشترک است' }
        : { ok:true };
    },
    fix: null,
    when: 'admin',
    fixDesc: 'undefined',
    owner: 'undefined'
  },

  {
    id: 'duplicate-username', cat: 'data',
    title: 'نام کاربری تکراری',
    desc: 'دو کاربر با یک نام کاربری — ورود مختل می‌شود',
    severity: 'critical',
    safe: true,
    check: function(){
      var by = Object.create(null), dups = [];
      db.users.forEach(function(u){
        if(!u.username) return;
        (by[u.username] = by[u.username] || []).push(u);
      });
      Object.keys(by).forEach(function(k){
        if(by[k].length > 1) dups.push({ username:k, count:by[k].length,
          names: by[k].map(function(u){ return u.full_name; }).join('، ') });
      });
      return dups.length
        ? { ok:false, count:dups.length, items:dups.slice(0,20),
            msg: dups.length + ' نام کاربری تکراری — این افراد نمی‌توانند وارد شوند' }
        : { ok:true };
    },
    fix: function(){
      /* نام کاربری تازه به دومی و بعدی‌ها داده می‌شود. قدیمی‌ترین
         (کوچک‌ترین شناسه) نامش را نگه می‌دارد چون احتمالاً فعال است. */
      var by = Object.create(null), n = 0;
      db.users.forEach(function(u){
        if(u.username) (by[u.username] = by[u.username] || []).push(u);
      });
      var taken = Object.create(null);
      db.users.forEach(function(u){ if(u.username) taken[u.username] = true; });
      batchWrites(function(){
        Object.keys(by).forEach(function(k){
          var list = by[k];
          if(list.length < 2) return;
          list.sort(function(a,b){ return (a.id||0) - (b.id||0); });
          list.slice(1).forEach(function(u){
            var i = 2, cand;
            do { cand = k + '_' + (i++); } while(taken[cand]);
            taken[cand] = true;
            update('users', u.id, { username: cand });
            n++;
          });
        });
      });
      return n + ' نام کاربری تکراری تغییر یافت';
    }
  },

  {
    id: 'invalid-nid', cat: 'data',
    title: 'کد ملی نامعتبر',
    desc: 'کد ملی که رقم کنترلش درست نیست',
    severity: 'warning',
    safe: false,
    check: function(){
      if(typeof validNid !== 'function') return { ok:true };
      var bad = db.users.filter(function(u){
        return u.national_id && !validNid(u.national_id);
      });
      return bad.length
        ? { ok:false, count:bad.length,
            items: bad.slice(0,20).map(function(u){
              return { id:u.id, name:u.full_name, nid:u.national_id }; }),
            msg: bad.length + ' کاربر کد ملی نامعتبر دارند' }
        : { ok:true };
    },
    fix: null,
    when: 'admin',
    fixDesc: 'undefined',
    owner: 'undefined'
  },

  {
    id: 'class-over-capacity', cat: 'data',
    title: 'کلاس پر از ظرفیت',
    desc: 'تعداد دانش‌آموز بیش از ظرفیت اعلام‌شده',
    when: 'ظرفیت در فرم کلاس اشتباه ثبت شده یا دانش‌آموز به کلاس افزوده شده و ظرفیت به‌روز نشده',
    severity: 'warning',
    safe: true,
    check: function(){
      var cnt = Object.create(null);
      db.enrollments.forEach(function(e){ cnt[e.class_id] = (cnt[e.class_id]||0) + 1; });
      var over = db.classes.filter(function(c){
        return c.capacity && (cnt[c.id]||0) > c.capacity;
      }).map(function(c){
        return { id:c.id, name:c.name, now:cnt[c.id]||0, cap:c.capacity };
      });
      return over.length
        ? { ok:false, count:over.length, items:over.slice(0,20),
            msg: over.length + ' کلاس از ظرفیتشان بیشتر دانش‌آموز دارند' }
        : { ok:true };
    },
    fix: function(){
      /* واقعیت را بپذیر: ظرفیت به تعداد واقعی دانش‌آموزان بالا می‌رود.
         اگر اضافه‌بودنِ خودِ ثبت‌نام اشتباه باشد، جابه‌جایی دانش‌آموز
         تصمیم مدیر است (از دیاگ انجام نمی‌شود). */
      var cnt = Object.create(null);
      db.enrollments.forEach(function(e){ cnt[e.class_id] = (cnt[e.class_id]||0) + 1; });
      var before = [], n = 0;
      batchWrites(function(){
        db.classes.forEach(function(c){
          if(c.capacity && (cnt[c.id]||0) > c.capacity){
            before.push({ coll:'classes', rec:Object.assign({}, c), existed:true });
            update('classes', c.id, { capacity: cnt[c.id] });
            n++;
          }
        });
      });
      return { msg: n + ' کلاس: ظرفیت به تعداد واقعی دانش‌آموزان تنظیم شد', before: before };
    },
    fixDesc:'ظرفیت به تعداد واقعی دانش‌آموزان بالا می‌رود (بازگشت‌پذیر). اگر خودِ ثبت‌نام‌ها اضافه است، چند دانش‌آموز را از صفحهٔ کلاس‌ها جابه‌جا کنید.',
    owner:'app'
  },

  {
    id: 'field-outside-branch', cat: 'data',
    title: 'رشتهٔ خارج از شاخهٔ مدرسه',
    desc: 'کلاسی با رشته‌ای که مدرسه ارائه نمی‌دهد',
    when: 'رشتهٔ کلاس هنگام ساخت انتخاب شده ولی در فهرست رشته‌های مدرسه ثبت نشده (پیکربندی ناقص مدرسه یا انتخاب اشتباه رشتهٔ کلاس)',
    severity: 'warning',
    safe: true,
    check: function(){
      if(typeof schoolFields !== 'function') return { ok:true };
      var bad = [];
      db.classes.forEach(function(c){
        if(!c.field) return;
        var s = byId('schools', c.school_id);
        /* فقط مدرسه‌ای که فهرست رشتهٔ صریح اعلام کرده «تخلف» معنا می‌دهد؛
           مدرسهٔ بدون فهرست (عادی/متوسطه اول) از پیش‌فرضِ همه‌شاخه‌ها
           استفاده می‌کند و رشتهٔ «عمومی» هم در آن معنا ندارد. */
        if(!s || !Array.isArray(s.fields) || !s.fields.length) return;
        if(s.fields.indexOf(c.field) < 0){
          bad.push({ id:c.id, name:c.name, field:c.field, school:s.name });
        }
      });
      return bad.length
        ? { ok:false, count:bad.length, items:bad.slice(0,20),
            msg: bad.length + ' کلاس رشته‌ای دارند که مدرسه اعلام نکرده است' }
        : { ok:true };
    },
    fix: function(){
      /* تعمیرِ کم‌خطر: فهرست رشته‌های مدرسه را «تکمیل» می‌کنیم، نه
         رشتهٔ کلاس را پاک — حذف داده هیچ‌وقت اولویت دیاگ نیست. اگر در
         واقع رشتهٔ کلاس اشتباه باشد، مدیر آن را از فرم کلاس عوض می‌کند. */
      if(typeof schoolFields !== 'function') return { msg:'آزمون رشته در دسترس نیست', before:[] };
      /* ۱) پیش‌بینی: کدام رشته‌ها به کدام مدرسه افزوده می‌شوند؟ */
      var plan = Object.create(null); /* schoolId -> {rec: عکس قبل, add: [fields]} */
      db.classes.forEach(function(c){
        if(!c.field) return;
        var s = byId('schools', c.school_id);
        if(!s || !Array.isArray(s.fields) || !s.fields.length) return;
        if(s.fields.indexOf(c.field) > -1) return;
        if(!plan[s.id]) plan[s.id] = { rec:Object.assign({}, s), add:[] };
        if(plan[s.id].add.indexOf(c.field) < 0) plan[s.id].add.push(c.field);
      });
      var n = 0;
      /* ۲) اعمال — با همان فهرستِ «قبل» + رشته‌های جدید (نه شیءِ زنده) */
      batchWrites(function(){
        Object.keys(plan).forEach(function(sid){
          var p = plan[sid];
          update('schools', p.rec.id, { fields: p.rec.fields.concat(p.add) });
          n++;
        });
      });
      /* ۳) عکس «قبل» از همان پیش‌بینی — برای بازگردانی */
      var before = Object.keys(plan).map(function(sid){
        return { coll:'schools', rec:plan[sid].rec, existed:true };
      });
      return { msg: n + ' مدرسه: رشتهٔ گم‌شده به فهرست رشته‌هایشان افزوده شد', before: before };
    },
    fixDesc:'رشتهٔ کلاس به فهرست رشته‌های مدرسه افزوده می‌شود (فرض: اعلام مدرسه ناقص است، نه کلاس). اگر رشتهٔ خودِ کلاس اشتباه است، آن را از فرم کلاس اصلاح کنید. بازگشت‌پذیر.',
    owner:'app'
  },

  /* ── ۳. سلامت ذخیره‌سازی ─────────────────────────────────────── */
  {
    id: 'storage-pressure', cat: 'engine',
    title: 'فشار حافظهٔ مرورگر',
    desc: 'نزدیک‌شدن دفترچهٔ عملیات به سقف ۵ مگابایت',
    severity: 'warning',
    safe: true,
    check: function(){
      var bytes = 0;
      try{ bytes = JSON.stringify(log).length; }catch(e){ return { ok:true }; }
      var mb = bytes / 1048576, pct = (mb / 5) * 100;
      if(pct < 70) return { ok:true, extra: mb.toFixed(2) + ' مگابایت (' + pct.toFixed(0) + '٪)' };
      return { ok:false, count:log.length,
        items: [{ mb: mb.toFixed(2), pct: pct.toFixed(0), ops: log.length }],
        msg: 'دفترچه ' + mb.toFixed(2) + ' مگابایت است (' + pct.toFixed(0) + '٪ سقف)' };
    },
    fix: function(){
      /* فشرده‌سازی: عملیات قدیمی که نتیجه‌شان در وضعیت فعلی هست حذف
         می‌شود. داده از بین نمی‌رود چون db زنده دست‌نخورده می‌ماند. */
      var before = log.length;
      if(typeof compactLog === 'function'){ compactLog(); }
      else {
        var keep = Math.floor(log.length * 0.4);
        log.splice(0, log.length - keep);
        if(typeof saveLog === 'function') saveLog();
      }
      return (before - log.length) + ' عملیات قدیمی فشرده شد';
    }
  },

  {
    id: 'sync-queue-stuck', cat: 'engine',
    title: 'صف همگام‌سازی گیرکرده',
    desc: 'عملیاتی که مدت‌هاست به سرور نرفته‌اند',
    severity: 'warning',
    safe: false,
    check: function(){
      if(typeof SYNC === 'undefined' || !SYNC || !Array.isArray(SYNC.queue)) return { ok:true };
      var n = SYNC.queue.length || 0;
      if(n < 50) return { ok:true, extra: n + ' عملیات در صف' };
      return { ok:false, count:n, items:[{ n:n }],
        msg: n + ' عملیات در صف همگام‌سازی مانده است' };
    },
    fix: function(){
      if(typeof SYNC === 'undefined' || !SYNC || typeof syncNow !== 'function')
        return { msg:'لایهٔ همگام‌سازی در دسترس نیست', before:[] };
      if(!SYNC.online)
        return { msg:'آنلاین نیستیم — اتصال شبکه بازگردد، صف خودکار ارسال می‌شود', before:[] };
      var n = SYNC.queue.filter(function(x){ return x.status==='pending'||x.status==='failed'; }).length;
      try{ syncNow(true); }catch(e){}
      return { msg: n + ' عملیات به‌صورت دستی به سرور فرستاده شد؛ نتیجه در چند لحظه در همین آزمون می‌آید', before:[] };
    },
    fixDesc:'صف به‌صورت دستی ارسال می‌شود. اگر همچنان ماند: اتصال به سرور (سنجش سرور) را ببینید.',
    owner:'server'
  },

  /* ── ۴. سلامت ایندکس و کارایی ────────────────────────────────── */
  {
    id: 'index-health', cat: 'engine',
    title: 'سلامت ایندکس‌ها',
    desc: 'نرخ اصابت ایندکس — پایین‌بودن یعنی کندی',
    severity: 'info',
    safe: true,
    check: function(){
      if(typeof IDX_STATS === 'undefined') return { ok:true };
      var t = IDX_STATS.hits + IDX_STATS.misses;
      if(t < 100) return { ok:true, extra: 'داده کافی نیست' };
      var rate = (IDX_STATS.hits / t) * 100;
      if(rate >= 90) return { ok:true, extra: rate.toFixed(1) + '٪ اصابت' };
      return { ok:false, count:1,
        items:[{ rate: rate.toFixed(1), builds: IDX_STATS.builds }],
        msg: 'نرخ اصابت ایندکس ' + rate.toFixed(1) + '٪ است (کمتر از ۹۰٪)' };
    },
    fix: function(){
      if(typeof idxReset === 'function') idxReset();
      return 'ایندکس‌ها بازنشانی شدند';
    }
  },

  {
    id: 'index-staleness', cat: 'engine',
    title: 'کهنگی ایندکس',
    desc: 'ناسازگاری بین ایندکس و دادهٔ واقعی',
    severity: 'critical',
    safe: true,
    check: function(){
      if(typeof idxById !== 'function') return { ok:true };
      var bad = [];
      ['users','classes','enrollments'].forEach(function(coll){
        if(!db[coll]) return;
        try{
          var m = idxById(coll);
          if(m.size !== db[coll].length)
            bad.push({ coll:coll, idx:m.size, real:db[coll].length });
        }catch(e){ bad.push({ coll:coll, err:String(e.message) }); }
      });
      return bad.length
        ? { ok:false, count:bad.length, items:bad,
            msg: bad.length + ' ایندکس با دادهٔ واقعی هم‌خوان نیست' }
        : { ok:true };
    },
    fix: function(){
      if(typeof idxReset === 'function') idxReset();
      return 'ایندکس‌ها از نو ساخته شدند';
    }
  },

  /* ── ۵. سلامت کاربران و دسترسی ───────────────────────────────── */
  {
    id: 'school-without-manager', cat: 'data',
    title: 'مدرسهٔ بدون مدیر',
    desc: 'مدرسه‌ای که هیچ مدیری ندارد',
    severity: 'warning',
    safe: false,
    check: function(){
      var has = Object.create(null);
      db.users.forEach(function(u){
        if(u.role === 'manager' && u.active) has[u.school_id] = true;
      });
      var bad = db.schools.filter(function(s){ return s.active && !has[s.id]; })
        .map(function(s){ return { id:s.id, name:s.name, code:s.code }; });
      return bad.length
        ? { ok:false, count:bad.length, items:bad.slice(0,20),
            msg: bad.length + ' مدرسهٔ فعال مدیر ندارند' }
        : { ok:true };
    },
    fix: null,
    when: 'admin',
    fixDesc: 'undefined',
    owner: 'undefined'
  },

  {
    id: 'student-without-class', cat: 'data',
    title: 'دانش‌آموز بدون کلاس',
    desc: 'دانش‌آموز فعالی که در هیچ کلاسی ثبت نشده',
    severity: 'warning',
    safe: false,
    check: function(){
      var enr = Object.create(null);
      db.enrollments.forEach(function(e){ enr[e.student_id] = true; });
      var bad = db.users.filter(function(u){
        return u.role === 'student' && u.active && !enr[u.id];
      }).map(function(u){
        var s = byId('schools', u.school_id);
        return { id:u.id, name:u.full_name, school: s ? s.name : '؟' };
      });
      return bad.length
        ? { ok:false, count:bad.length, items:bad.slice(0,20),
            msg: bad.length + ' دانش‌آموز فعال در هیچ کلاسی نیستند' }
        : { ok:true };
    },
    fix: null,
    when: 'admin',
    fixDesc: 'undefined',
    owner: 'undefined'
  },

  /* ── ۶. سلامت مالی ───────────────────────────────────────────── */
  {
    id: 'negative-amounts', cat: 'data',
    title: 'مبلغ منفی',
    desc: 'قسط یا تراکنش با مبلغ منفی',
    severity: 'critical',
    safe: false,
    check: function(){
      var bad = [];
      (db.installments||[]).forEach(function(x){
        if(Number(x.amount) < 0) bad.push({ kind:'قسط', id:x.id, amount:x.amount });
      });
      (db.transactions||[]).forEach(function(x){
        if(Number(x.amount) < 0) bad.push({ kind:'تراکنش', id:x.id, amount:x.amount });
      });
      return bad.length
        ? { ok:false, count:bad.length, items:bad.slice(0,20),
            msg: bad.length + ' رکورد مالی مبلغ منفی دارند' }
        : { ok:true };
    },
    fix: null,
    when: 'admin',
    fixDesc: 'undefined',
    owner: 'undefined'
  },

  {
    id: 'orphan-financial', cat: 'data',
    title: 'رکورد مالی بی‌صاحب',
    desc: 'قسط یا تراکنشی که دانش‌آموزش پاک شده',
    severity: 'warning',
    safe: true,
    check: function(){
      var bad = (db.installments||[]).filter(function(x){
        return x.student_id && !byId('users', x.student_id);
      });
      return bad.length
        ? { ok:false, count:bad.length, items:bad.slice(0,20),
            msg: bad.length + ' قسط به دانش‌آموز پاک‌شده وصل است' }
        : { ok:true };
    },
    fix: function(){
      var n = 0;
      batchWrites(function(){
        (db.installments||[]).filter(function(x){
          return x.student_id && !byId('users', x.student_id);
        }).forEach(function(x){ remove('installments', x.id); n++; });
      });
      return n + ' قسط بی‌صاحب پاک شد';
    }
  }
];


/* ══════════════════════════════════════════════════════════════════
   آزمون‌های پیکربندی، زیرساخت و موتور برنامه

   این‌ها به دادهٔ مدرسه کاری ندارند؛ سلامت خودِ برنامه را می‌سنجند.
   اگر یکی از این‌ها بشکند یعنی کد یا پیکربندی ایراد دارد، نه ورودی.
   ══════════════════════════════════════════════════════════════════ */
DIAG_CHECKS = DIAG_CHECKS.concat([

  {
    id: 'route-coverage', cat: 'engine',
    title: 'مسیرهای بدون نما',
    desc: 'گزینه‌ای در منو که صفحه‌اش تعریف نشده — کلیک روی آن صفحهٔ خالی می‌دهد',
    when: 'بیلد ناقص یا خراب است، یا ماژول یک نما حذف/تغییر کرده ولی منو به‌روز نشده — یعنی مشکل از کد است، نه داده',
    severity: 'critical',
    safe: true,
    check: function(){
      var r = diagProbeRoutes();
      return r.length
        ? { ok:false, count:r.length, items:r.slice(0,20),
            msg: r.length + ' مسیر منو نمای سالم ندارند' }
        : { ok:true, extra: diagProbeRoutesSeen + ' مسیر بررسی شد' };
    },
    fix: function(){
      /* مشکل از کد است و دیاگ نمی‌تواند کد بنویسد؛ ولی می‌تواند
         «بخش شکسته» را از چرخه خارج کند: گزینه‌های معیوب تا زمان
         تعمیر پنهان می‌شوند تا بقیهٔ سامانه کار کند. */
      var bad = diagProbeRoutes().map(function(x){ return x.route; });
      var cur = navDisabledRoutes();
      var before = [{ coll:'__nav', rec:cur.slice(), existed:true }];
      var added = 0;
      bad.forEach(function(r){
        if(cur.indexOf(r) < 0){ cur.push(r); added++; }
      });
      try{ Store.setJSON('nav_disabled_v1', cur); }catch(e){}
      if(!added) return { msg:'گزینه‌های معیوب قبلاً پنهان بودند', before:[] };
      return { msg: added + ' گزینهٔ معیوب تا زمان تعمیر از منو پنهان شد'
                  + ' (دکمهٔ «بازگردانی گزینه‌های پنهان» در بالای صفحه)',
               before: before };
    },
    fixDesc:'گزینه‌های شکسته از منو پنهان می‌شوند (برنامه ادامه می‌دهد) و عیب در دیاگ معلوم می‌ماند. توسعه‌دهنده کد را می‌سازد؛ سپس «بازگردانی گزینه‌های پنهان» بزنید.',
    owner:'dev'
  },

  {
    id: 'title-coverage', cat: 'engine',
    title: 'مسیر بدون عنوان',
    desc: 'صفحه‌ای که در جدول عنوان‌ها ثبت نشده و سرصفحه‌اش خالی می‌ماند',
    severity: 'warning',
    safe: false,
    check: function(){
      if(typeof NAV !== 'object' || typeof TITLES !== 'object') return { ok:true };
      var bad = [], seen = Object.create(null);
      Object.keys(NAV).forEach(function(role){
        (NAV[role] || []).forEach(function(grp){
          (grp[1] || []).forEach(function(it){
            if(seen[it[0]]) return;
            seen[it[0]] = true;
            if(!TITLES[it[0]]) bad.push({ route: it[0], منو: it[2] || '' });
          });
        });
      });
      return bad.length
        ? { ok:false, count:bad.length, items:bad.slice(0,20),
            msg: bad.length + ' مسیر در جدول عنوان‌ها نیستند' }
        : { ok:true };
    },
    fix: function(){
      if(typeof NAV !== 'object' || typeof TITLES !== 'object')
        return { msg:'آزمون عنوان در دسترس نیست', before:[] };
      var bad = [], seen = Object.create(null);
      Object.keys(NAV).forEach(function(role){
        (NAV[role] || []).forEach(function(grp){
          (grp[1] || []).forEach(function(it){
            if(seen[it[0]]) return;
            seen[it[0]] = true;
            if(!TITLES[it[0]]) bad.push(it[0]);
          });
        });
      });
      var cur = navDisabledRoutes();
      var before = [{ coll:'__nav', rec:cur.slice(), existed:true }];
      var added = 0;
      bad.forEach(function(r){ if(cur.indexOf(r) < 0){ cur.push(r); added++; } });
      try{ Store.setJSON('nav_disabled_v1', cur); }catch(e){}
      if(!added) return { msg:'گزینه‌ها قبلاً پنهان بودند', before:[] };
      return { msg: added + ' مسیرِ بی‌عنوان تا زمان تعمیر از منو پنهان شد', before: before };
    },
    fixDesc:'گزینه از منو پنهان می‌شود تا توسعه‌دهنده عنوانش را در جدول TITLES ثبت کند.',
    owner:'dev'
  },

  {
    id: 'authz-coverage', cat: 'engine',
    title: 'ناهماهنگی منو و مجوز',
    desc: 'گزینه‌ای که در منوی نقشی هست ولی گارد دسترسی اجازه‌اش نمی‌دهد',
    severity: 'critical',
    safe: false,
    check: function(){
      if(typeof NAV !== 'object' || typeof canRoute !== 'function') return { ok:true };
      var bad = [];
      Object.keys(NAV).forEach(function(role){
        (NAV[role] || []).forEach(function(grp){
          (grp[1] || []).forEach(function(it){
            var ok = false;
            try{ ok = canRoute(it[0], role); }catch(e){ ok = false; }
            if(!ok) bad.push({ نقش:role, route: it[0], منو: it[2] || '' });
          });
        });
      });
      return bad.length
        ? { ok:false, count:bad.length, items:bad.slice(0,20),
            msg: bad.length + ' گزینهٔ منو با گارد دسترسی نمی‌خواند' }
        : { ok:true };
    },
    fix: function(){
      /* گارد دسترسی (canRoute) مرجع است؛ منو اشتباه است. گزینه‌های
         مجوز‌دار-نه را پنهان می‌کنیم تا مسیرِ دور زدن بسته شود. */
      if(typeof NAV !== 'object' || typeof canRoute !== 'function')
        return { msg:'آزمون مجوز در دسترس نیست', before:[] };
      var bad = [], seen = Object.create(null);
      Object.keys(NAV).forEach(function(role){
        (NAV[role] || []).forEach(function(grp){
          (grp[1] || []).forEach(function(it){
            if(seen[it[0]]) return;
            seen[it[0]] = true;
            var ok = false;
            try{ ok = canRoute(it[0], role); }catch(e){ ok = false; }
            if(!ok) bad.push(it[0]);
          });
        });
      });
      var cur = navDisabledRoutes();
      var before = [{ coll:'__nav', rec:cur.slice(), existed:true }];
      var added = 0;
      bad.forEach(function(r){ if(cur.indexOf(r) < 0){ cur.push(r); added++; } });
      try{ Store.setJSON('nav_disabled_v1', cur); }catch(e){}
      if(!added) return { msg:'گزینه‌ها قبلاً پنهان بودند', before:[] };
      return { msg: added + ' گزینهٔ بی‌مجوز تا زمان هماهنگ‌سازی منو پنهان شد', before: before };
    },
    fixDesc:'گزینه‌ای که گارد دسترسی اجازه نمی‌دهد، از منو پنهان می‌شود (سوراخ امنیتیِ بالقوه می‌بندد). هماهنگ‌سازی منو و مجوز با توسعه‌دهنده.',
    owner:'dev'
  },

  {
    id: 'collection-registry', cat: 'engine',
    title: 'مجموعهٔ ثبت‌نشده',
    desc: 'مجموعه‌ای که کد در آن می‌نویسد ولی در تعریف پایگاه داده نیست',
    severity: 'critical',
    safe: false,
    check: function(){
      var bad = [];
      /* ids کلید هر مجموعه‌ای را دارد که در آن درج شده است */
      Object.keys(ids || {}).forEach(function(c){
        if(!Array.isArray(db[c]))
          bad.push({ مجموعه:c, وضعیت:'در db تعریف نشده ولی در آن درج شده' });
      });
      return bad.length
        ? { ok:false, count:bad.length, items:bad,
            msg: bad.length + ' مجموعه در تعریف پایگاه داده نیست' }
        : { ok:true, extra: Object.keys(db || {}).length + ' مجموعه سالم' };
    },
    fix: null,
    when: 'dev',
    fixDesc: 'undefined',
    owner: 'undefined'
  },

  {
    id: 'id-sequence', cat: 'engine',
    title: 'شمارندهٔ شناسه عقب‌مانده',
    desc: 'شمارنده از بزرگ‌ترین شناسهٔ موجود کوچک‌تر است — رکورد بعدی شناسهٔ تکراری می‌گیرد',
    severity: 'critical',
    safe: true,
    check: function(){
      var bad = [];
      Object.keys(db || {}).forEach(function(c){
        if(!Array.isArray(db[c]) || !db[c].length) return;
        var max = 0;
        db[c].forEach(function(r){ if(Number(r.id) > max) max = Number(r.id); });
        var cur = Number((ids || {})[c] || 0);
        if(cur < max) bad.push({ مجموعه:c, شمارنده:cur, بیشینه:max });
      });
      return bad.length
        ? { ok:false, count:bad.length, items:bad,
            msg: bad.length + ' شمارنده عقب افتاده — خطر شناسهٔ تکراری' }
        : { ok:true };
    },
    fix: function(){
      var n = 0;
      Object.keys(db || {}).forEach(function(c){
        if(!Array.isArray(db[c]) || !db[c].length) return;
        var max = 0;
        db[c].forEach(function(r){ if(Number(r.id) > max) max = Number(r.id); });
        if(Number((ids || {})[c] || 0) < max){ ids[c] = max; n++; }
      });
      return n + ' شمارنده هم‌تراز شد';
    }
  },

  {
    id: 'duplicate-ids', cat: 'engine',
    title: 'شناسهٔ تکراری در یک مجموعه',
    desc: 'دو رکورد با یک شناسه — byId یکی را برای همیشه پنهان می‌کند',
    severity: 'critical',
    safe: false,
    check: function(){
      var bad = [];
      Object.keys(db || {}).forEach(function(c){
        if(!Array.isArray(db[c])) return;
        var seen = Object.create(null), dup = 0;
        db[c].forEach(function(r){
          if(r.id == null) return;
          if(seen[r.id]) dup++; else seen[r.id] = true;
        });
        if(dup) bad.push({ مجموعه:c, تکراری:dup });
      });
      return bad.length
        ? { ok:false, count:bad.length, items:bad,
            msg: bad.length + ' مجموعه شناسهٔ تکراری دارند' }
        : { ok:true };
    },
    fix: null,
    when: 'dev',
    fixDesc: 'undefined',
    owner: 'undefined'
  },

  {
    id: 'localstorage-health', cat: 'engine',
    title: 'دسترسی به حافظهٔ مرورگر',
    desc: 'اگر نوشتن در حافظه کار نکند، داده پس از بستن مرورگر از بین می‌رود',
    severity: 'critical',
    safe: false,
    check: function(){
      /* از راه لایهٔ داده می‌سنجیم، نه مستقیم — همان مسیری که
         خود برنامه استفاده می‌کند، وگرنه آزمون واقعیت را نمی‌گوید */
      if(!Store.available())
        return { ok:false, count:1, items:[{ خطا:'نوشتن یا خواندن ناموفق بود' }],
          msg:'حافظهٔ مرورگر در دسترس نیست — داده ماندگار نمی‌شود' };
      return { ok:true };
    },
    fix: null,
    when: 'user',
    fixDesc: 'undefined',
    owner: 'undefined'
  },

  {
    id: 'oplog-integrity', cat: 'engine',
    title: 'سلامت دفترچهٔ عملیات',
    desc: 'عملیات ناقص یا خراب در دفترچه — بازپخش داده را خراب می‌کند',
    severity: 'critical',
    safe: true,
    check: function(){
      if(typeof log === 'undefined' || !Array.isArray(log)) return { ok:true };
      var bad = [];
      log.forEach(function(op, i){
        if(!op || typeof op !== 'object'){ bad.push({ ردیف:i, خطا:'عملیات خالی' }); return; }
        if(['ins','upd','del'].indexOf(op.t) < 0)
          bad.push({ ردیف:i, خطا:'نوع ناشناخته: ' + String(op.t) });
        else if(!op.c || !Array.isArray(db[op.c]))
          bad.push({ ردیف:i, خطا:'مجموعهٔ نامعتبر: ' + String(op.c) });
        else if(op.t === 'ins' && (!op.data || op.data.id == null))
          bad.push({ ردیف:i, خطا:'درج بدون شناسه' });
      });
      return bad.length
        ? { ok:false, count:bad.length, items:bad.slice(0,20),
            msg: bad.length + ' عملیات خراب در دفترچه' }
        : { ok:true, extra: log.length + ' عملیات سالم' };
    },
    fix: function(){
      var before = log.length;
      var clean = log.filter(function(op){
        if(!op || typeof op !== 'object') return false;
        if(['ins','upd','del'].indexOf(op.t) < 0) return false;
        if(!op.c || !Array.isArray(db[op.c])) return false;
        if(op.t === 'ins' && (!op.data || op.data.id == null)) return false;
        return true;
      });
      log.length = 0;
      clean.forEach(function(op){ log.push(op); });
      if(typeof saveLog === 'function') saveLog();
      return (before - log.length) + ' عملیات خراب از دفترچه پاک شد';
    }
  },

  {
    id: 'sync-backlog', cat: 'engine',
    title: 'انباشت صف همگام‌سازی',
    desc: 'عملیات ناموفق یا متعارض که به سرور نرسیده‌اند',
    severity: 'warning',
    safe: false,
    check: function(){
      if(typeof SYNC === 'undefined' || !SYNC || !Array.isArray(SYNC.queue))
        return { ok:true, extra:'لایهٔ همگام‌سازی فعال نیست' };
      var failed = SYNC.queue.filter(function(x){ return x.status === 'failed'; }).length;
      var conf   = SYNC.queue.filter(function(x){ return x.status === 'conflict'; }).length;
      var pend   = SYNC.queue.filter(function(x){ return x.status === 'pending'; }).length;
      if(conf > 0 || failed > 20 || pend > 500){
        return { ok:false, count: conf + failed,
          items:[{ متعارض:conf, ناموفق:failed, 'در انتظار':pend }],
          msg: (conf ? conf + ' عملیات متعارض · ' : '') + failed + ' ناموفق · ' + pend + ' در انتظار' };
      }
      return { ok:true, extra: pend + ' در انتظار ارسال' };
    },
    fix: function(){
      if(typeof SYNC === 'undefined' || !SYNC || typeof syncNow !== 'function')
        return { msg:'لایهٔ همگام‌سازی در دسترس نیست', before:[] };
      if(!SYNC.online)
        return { msg:'آنلاین نیستیم — اتصال شبکه بازگردد، صف خودکار ارسال می‌شود', before:[] };
      try{ syncNow(true); }catch(e){}
      return { msg:'صف به‌صورت دستی ارسال شد؛ عملیات ناموفق دوباره امتحان می‌شوند. عملیات «متعارض» نیاز به تصمیم مدیر دارد (دو نسخه از یک رکورد).', before:[] };
    },
    fixDesc:'عملیات ناموفق دوباره ارسال می‌شوند. عملیات متعارض (دو نسخه از یک رکورد) دستی از صفحهٔ مالی/کاربرانه حل می‌شود.',
    owner:'server'
  },

  {
    id: 'render-performance', cat: 'engine',
    title: 'کندی رندر صفحات',
    desc: 'صفحه‌ای که بیش از ۲۵۰ میلی‌ثانیه طول می‌کشد — کاربر کندی حس می‌کند',
    severity: 'warning',
    safe: false,
    check: function(){
      if(typeof renderRoute !== 'function' || typeof NAV !== 'object') return { ok:true };
      var role = (S.user && S.user.role) || 'superadmin';
      var slow = [], worst = 0, prev = S.route;
      ((NAV[role] || [])).forEach(function(grp){
        (grp[1] || []).forEach(function(it){
          var t = Date.now();
          try{ S.route = it[0]; renderRoute(); }catch(e){}
          var ms = Date.now() - t;
          if(ms > worst) worst = ms;
          if(ms > 250) slow.push({ صفحه: it[2] || it[0], 'میلی‌ثانیه': ms });
        });
      });
      S.route = prev;
      return slow.length
        ? { ok:false, count:slow.length, items:slow.slice(0,20),
            msg: slow.length + ' صفحه کندتر از ۲۵۰ میلی‌ثانیه‌اند' }
        : { ok:true, extra: 'کندترین صفحه ' + worst + ' میلی‌ثانیه' };
    },
    fix: null,
    when: 'dev',
    fixDesc: 'undefined',
    owner: 'undefined'
  },

  {
    id: 'missing-functions', cat: 'engine',
    title: 'توابع حیاتی گمشده',
    desc: 'تابعی که سایر بخش‌ها به آن تکیه دارند بارگذاری نشده',
    severity: 'critical',
    safe: false,
    check: function(){
      var need = ['render','renderRoute','insert','update','remove','byId',
                  'batchWrites','saveLog','applyOp','canRoute','canAction',
                  'idxById','idxReset','esc','fa','toast','openModal','closeModal'];
      var miss = need.filter(function(n){
        try{ return typeof eval(n) !== 'function'; }catch(e){ return true; }
      }).map(function(n){ return { تابع:n }; });
      return miss.length
        ? { ok:false, count:miss.length, items:miss,
            msg: miss.length + ' تابع حیاتی در دسترس نیست' }
        : { ok:true, extra: need.length + ' تابع پایه سالم' };
    },
    fix: function(){
      /* بارگذاری ناقص معمولاً با تازه‌بارگیری حل می‌شود؛ اگر باقی
         ماند، فایل قدیمی یا خراب است. */
      try{ window.location.reload(); }catch(e){}
      return { msg:'صفحه تازه‌بارگیری شد تا همهٔ ماژول‌ها دوباره بیایند', before:[] };
    },
    fixDesc:'صفحه تازه‌بارگیری می‌شود. اگر خطا باقی ماند، فایلِ باز‌شده قدیمی یا ناقص است — آخرین بیلد را باز کنید.',
    owner:'dev'
  },

  {
    id: 'module-order', cat: 'engine',
    title: 'ترتیب بارگذاری ماژول‌ها',
    desc: 'ثابت یا جدولی که ماژول دیگری پیش از تعریفش استفاده می‌کند',
    severity: 'warning',
    safe: false,
    check: function(){
      var need = ['BRANCHES','GRADES_OF_LEVEL','LEVELS','NAV','TITLES',
                  'ROLE_FA','DIAG_CHECKS','BELL_PRESETS','FIELD_ALIASES'];
      var miss = need.filter(function(n){
        try{ return typeof eval(n) === 'undefined'; }catch(e){ return true; }
      }).map(function(n){ return { جدول:n }; });
      return miss.length
        ? { ok:false, count:miss.length, items:miss,
            msg: miss.length + ' جدول پایه بارگذاری نشده' }
        : { ok:true, extra: need.length + ' جدول پایه سالم' };
    },
    fix: function(){
      try{ window.location.reload(); }catch(e){}
      return { msg:'صفحه تازه‌بارگیری شد تا ترتیب ماژول‌ها دوباره اجرا شود', before:[] };
    },
    fixDesc:'صفحه تازه‌بارگیری می‌شود. اگر تکرار شد، ترتیب بارگذاری در بیلد خراب است — بیلد دوباره ساخته شود.',
    owner:'dev'
  },

  {
    id: 'bell-config', cat: 'engine',
    title: 'پیکربندی زنگ‌ها',
    desc: 'زمان‌بندی زنگ که بازه‌هایش نامعتبر یا متناقض است',
    severity: 'warning',
    safe: false,
    check: function(){
      if(typeof bellTimeline !== 'function') return { ok:true };
      var bad = [];
      var days = (typeof DAYS !== 'undefined') ? DAYS : ['شنبه','یکشنبه','دوشنبه','سه‌شنبه','چهارشنبه'];
      (db.schools || []).forEach(function(sc){
        for(var d = 0; d < days.length; d++){
          var tl;
          try{ tl = bellTimeline(sc.id, d); }
          catch(e){ bad.push({ مدرسه:sc.name, روز:days[d], خطا:String(e && e.message) }); return; }
          if(!tl.length){ bad.push({ مدرسه:sc.name, روز:days[d], خطا:'بدون زنگ' }); continue; }
          for(var i = 1; i < tl.length; i++){
            if(tl[i].from !== tl[i-1].to){
              bad.push({ مدرسه:sc.name, روز:days[d], خطا:'گسست در ' + tl[i].from }); break;
            }
          }
        }
      });
      return bad.length
        ? { ok:false, count:bad.length, items:bad.slice(0,20),
            msg: bad.length + ' روز زمان‌بندی زنگ معیوب دارند' }
        : { ok:true };
    },
    fix: null,
    when: 'admin',
    fixDesc: 'undefined',
    owner: 'undefined'
  },

  {
    id: 'school-config', cat: 'engine',
    title: 'پیکربندی ناقص مدرسه',
    desc: 'مدرسهٔ متوسطه دوم بدون شاخه، یا مدرسهٔ بدون مقطع',
    severity: 'warning',
    safe: false,
    check: function(){
      var bad = [];
      (db.schools || []).forEach(function(s){
        if(!s.active) return;
        if(!s.level) bad.push({ مدرسه:s.name, ایراد:'مقطع تعریف نشده' });
        else if(s.level === 'متوسطه دوم' && !(s.branches || []).length)
          bad.push({ مدرسه:s.name, ایراد:'متوسطه دوم بدون شاخه' });
      });
      return bad.length
        ? { ok:false, count:bad.length, items:bad.slice(0,20),
            msg: bad.length + ' مدرسه پیکربندی ناقص دارند' }
        : { ok:true };
    },
    fix: null,
    when: 'admin',
    fixDesc: 'undefined',
    owner: 'undefined'
  }
]);

DIAG_CHECKS = DIAG_CHECKS.concat([

  /* ── خانوادهٔ سوم: ارتباط، هاست و زیرساخت ─────────────────── */
  {
    id: 'runtime-errors', cat: 'engine',
    title: 'خطاهای زمان‌اجرا (برنامه)',
    desc: 'خطایی که در کد برنامه از لحظهٔ باز شدن صفحه تاکنون پنهان افتاده',
    when: 'هر throw بدون try، Promise شکسته، یا دسترسی به شیءِ موجودنیست — حتی اگر صفحه «نORMAL» به نظر برسد',
    severity: 'critical',
    safe: true,
    check: function(){
      diagSyslogLoad();
      if(!DIAG_SYSLOG.length) return { ok:true, extra:'از باز شدن صفحه، خطایی ثبت نشده' };
      return { ok:false, count:DIAG_SYSLOG.length,
        items: DIAG_SYSLOG.slice(-10).reverse().map(function(x){
          return { خطا:x.msg, خط:(x.line!=null?x.line:'-'), منبع:(x.src||'-'), زمان:x.t.slice(11,16), کاربر:x.user };
        }),
        msg: DIAG_SYSLOG.length + ' خطای برنامه در لاگ زمان‌اجرا — برنامه ممکن است ناقص کار کند' };
    },
    fix: function(){
      var n = DIAG_SYSLOG.length;
      DIAG_SYSLOG.length = 0;
      try{ Store.setJSON(DIAG_SYSLOG_KEY, []); }catch(e){}
      return { msg: n + ' خطای قدیمی از لاگ پاک شد (خطاهای تازه دوباره ثبت می‌شوند)', before:[] };
    },
    fixDesc:'لاگ موقت پاک می‌شود تا بررسی بعدی تازه باشد. اگر خطا مکرر است، متن و شمارهٔ خط را برای توسعه‌دهنده بفرستید — این آزمون «مشکل کدنویسی» را از دایرهٔ بی‌خبری بیرون می‌آورد.',
    owner:'dev'
  },

  {
    id: 'server-mode', cat: 'infra',
    title: 'حالت اجرا (تک‌فایل یا سرور)',
    desc: 'آیا این بیلد به سرور وصل است یا نسخهٔ محلیِ تک‌فایل است',
    when: 'همیشه — نقطهٔ شروع آزمون‌های ارتباطی',
    severity: 'info',
    safe: false,
    check: function(){
      if(diagServerOn()) return { ok:true, extra:'حالت سرور — ارتباط از طریق API' };
      return { ok:true, extra:'نسخهٔ تک‌فایل — آزمون‌های ارتباطی در حالت سرور اجرا می‌شوند' };
    },
    fixDesc:'این یک گزارش حالت است، نه عیب.',
    owner:'server'
  },

  {
    id: 'api-health', cat: 'infra',
    title: 'صلابت سرور (نقطهٔ سلامت)',
    desc: 'سرور جواب می‌دهد؟ چند میلی‌ثانیه طول می‌کشد؟',
    when: 'هاست قطع است، پورت درست نیست، HTTPS خراب است، یا سرور بار زیاد دارد',
    severity: 'critical',
    safe: true,
    check: function(){
      if(!diagServerOn()) return { ok:true, extra:'در حالت تک‌فایل اجرا نمی‌شود' };
      var p = DIAG_PROBES.health;
      if(!p) return { ok:true, extra:'هنوز سنجش نشده — دکمهٔ «سنجش سرور»' };
      if(p.err) return { ok:false, count:1, items:[{ خطا:p.err }],
        msg:'وصل به سرور نمی‌شود: ' + p.err };
      if(!p.ok) return { ok:false, count:1, items:[{ code:p.code }],
        msg:'سرور کد ' + p.code + ' برمی‌گرداند — بیلد یا پیکربندی سرور را بررسی کنید' };
      return { ok:true, extra:'سالم — پاسخ در ' + p.ms + ' میلی‌ثانیه' };
    },
    fix: function(){
      return diagProbeHealth().then(function(r){ return r.msg; });
    },
    fixDesc:'نقطهٔ سلامت (/api/health) دوباره سنجیده می‌شود. اگر وصل نمی‌شود: دامنه، پورت، HTTPS و اجرای فرایند سرور را بررسی کنید.',
    owner:'server'
  },

  {
    id: 'api-version', cat: 'infra',
    title: 'هم‌نسخه‌بودن برنامه و سرور',
    desc: 'نسخهٔ بیلدِ باز با نسخهٔ اجراشده روی سرور یکی باشد',
    when: 'سرور به‌روز شده ولی کاربر هنوز بیلد قدیمی در مرورگرش دارد (کش) — رفتارهای عجیب و شکست‌های مبهم',
    severity: 'warning',
    safe: true,
    check: function(){
      if(!diagServerOn()) return { ok:true, extra:'در حالت تک‌فایل اجرا نمی‌شود' };
      var p = DIAG_PROBES.health;
      if(!p || !p.version) return { ok:true, extra:'نسخهٔ سرور ثبت نشده — اول «سنجش سرور»' };
      if(p.version !== APP_VERSION)
        return { ok:false, count:1,
          items:[{ کلاینت:APP_VERSION, سرور:p.version }],
          msg:'نسخهٔ برنامه (' + APP_VERSION + ') با سرور (' + p.version + ') نمی‌خواند — صفحه را تازه‌بارگیری کنید' };
      return { ok:true, extra:'نسخهٔ مشترک: ' + p.version };
    },
    fix: function(){
      try{ window.location.reload(); }catch(e){}
      return { msg:'صفحه تازه‌بارگیری شد تا بیلدِ هم‌نسخه بیاید', before:[] };
    },
    fixDesc:'صفحه تازه‌بارگیری می‌شود (کش را عبور می‌کند). اگر همچنان نمی‌خواند، بیلدِ سمت سرور به‌روز نشده است.',
    owner:'server'
  },

  {
    id: 'time-drift', cat: 'infra',
    title: 'اختلاف ساعت دستگاه با سرور',
    desc: 'ساعت محلی که مهلت‌ها، زنگ‌ها و مهلت ثبت را می‌شکند',
    when: 'ساعت سیستم‌عامل دستی و غلط تنظیم است — زنگ‌ها زود/دیر می‌زنند و مهلت‌ها خطا می‌کنند',
    severity: 'warning',
    safe: false,
    check: function(){
      if(!diagServerOn()) return { ok:true, extra:'در حالت تک‌فایل اجرا نمی‌شود' };
      var d = DIAG_PROBES.driftMs;
      if(d == null) return { ok:true, extra:'سنجش نشده — اول «سنجش سرور»' };
      if(d > 5 * 60000)
        return { ok:false, count:1, items:[{ دقیقه:Math.round(d / 60000) }],
          msg:'ساعت دستگاه با سرور ' + Math.round(d / 60000) + ' دقیقه اختلاف دارد — زنگ و مهلت‌ها خطا می‌کنند' };
      return { ok:true, extra:'اختلاف ' + Math.round(d / 1000) + ' ثانیه (جایز)' };
    },
    fixDesc:'برنامه نمی‌تواند ساعت دستگاه را عوض کند: تنظیمات ویرایش سیستم‌عامل ← زمان و تاریخ ← «تنظیم خودکار ساعت» را روشن کنید.',
    owner:'user'
  },

  {
    id: 'offline-status', cat: 'infra',
    title: 'اتصال شبکه',
    desc: 'مرورگر الان آنلاین است یا آفلاین',
    when: 'مودم قطع، سیم‌کارت/وای‌فای رفته — در حالت سرور، داده محلی می‌ماند و بعداً می‌رود',
    severity: 'warning',
    safe: false,
    check: function(){
      var on = (typeof navigator === 'undefined') ? true : navigator.onLine !== false;
      if(on) return { ok:true, extra:'آنلاین' };
      return { ok:false, count:1, items:[],
        msg:'شبکه قطع است — تغییرات در حافظهٔ محلی ذخیره می‌شوند و بعد از اتصال ارسال می‌شوند' };
    },
    fixDesc:'اتصال را بازگردانید؛ صف همگام‌سازی خودکار ارسال می‌شود (آزمون صف همگام‌سازی نتیجه را نشان می‌دهد).',
    owner:'user'
  },

  {
    id: 'storage-quota', cat: 'infra',
    title: 'حجم کلِ حافظهٔ مرورگر',
    desc: 'جمع حجم کلیدهای حافظهٔ مرورگر — پرشدن آن نوشتن‌ها را خاموش می‌کند',
    when: 'داده‌های انباشته یا لاگ‌های بزرگ — از اینجا اولین علائم «داده ذخیره نمی‌شود» می‌آید',
    severity: 'warning',
    safe: true,
    check: function(){
      var used = 0, keyList = Store.keys(), keys = keyList.length;
      keyList.forEach(function(k){
        var v = Store.get(k) || '';
        used += k.length + v.length;
      });
      var mb = used / 1048576;
      if(mb < 3) return { ok:true, extra: mb.toFixed(2) + ' مگابایت از ' + keys + ' کلید' };
      return { ok:false, count:1, items:[{ mb:mb.toFixed(2) }],
        msg:'حافظهٔ مرورگر ' + mb.toFixed(2) + ' مگابایت پر است — فشرده‌سازی و پاک‌سازی بزنید' };
    },
    fix: function(){
      var n = 0;
      if(typeof compactLog === 'function'){ try{ compactLog(); n++; }catch(e){} }
      DIAG_SYSLOG.length = 0;
      try{ Store.setJSON(DIAG_SYSLOG_KEY, []); }catch(e){}
      DIAG_PROBES = {};
      try{ Store.setJSON('sms_diag_probes_v1', {}); }catch(e){}
      return { msg: (n ? 'دفترچهٔ عملیات فشرده و ' : '') + 'لاگ‌های دیاگ پاک شد', before:[] };
    },
    fixDesc:'دفترچهٔ عملیات فشرده و لاگ‌های دیاگ پاک می‌شود. اگر باز هم پر بود: پشتیبان کامل بگیرید، سپس داده‌های سال‌های قدیمی را از طریق توسعه‌دهنده بایگانی کنید.',
    owner:'app'
  }
]);

/* ------------------------------------------------------------------ */
/*  موتور اجرا                                                         */
/* ------------------------------------------------------------------ */

/**
 * اجرای همهٔ آزمون‌ها.
 * ⚠️ هر آزمون در try است تا یک آزمون معیوب کل دیاگ را نخواباند —
 * دستگاه دیاگ نباید خودش خراب شود.
 */
function runDiagnostics(onlyCat){
  var t0 = Date.now();
  var results = [];
  DIAG_CHECKS.filter(function(c){
    return !onlyCat || (c.cat || 'data') === onlyCat;
  }).forEach(function(chk){
    var r;
    try{
      r = chk.check();
    }catch(e){
      r = { ok:false, count:1, items:[{ err:String(e && e.message) }],
            msg: 'خودِ این آزمون خطا داد: ' + String(e && e.message),
            selfError:true };
    }
    results.push({
      id: chk.id, cat: chk.cat || 'data', title: chk.title, desc: chk.desc,
      when: chk.when || '', fixDesc: chk.fixDesc || '', owner: chk.owner || 'admin',
      severity: chk.severity, safe: chk.safe && !!chk.fix,
      fixable: !!chk.fix,
      ok: !!r.ok, msg: r.msg || '', count: r.count || 0,
      items: r.items || [], extra: r.extra || '',
      selfError: !!r.selfError
    });
  });

  var summary = {
    at: new Date().toISOString(),
    ms: Date.now() - t0,
    total: results.length,
    passed: results.filter(function(r){ return r.ok; }).length,
    critical: results.filter(function(r){ return !r.ok && r.severity === 'critical'; }).length,
    warning: results.filter(function(r){ return !r.ok && r.severity === 'warning'; }).length,
    info: results.filter(function(r){ return !r.ok && r.severity === 'info'; }).length,
    autoFixable: results.filter(function(r){ return !r.ok && r.safe; }).length,
    /* تفکیک دو خانواده: عیب موتور یعنی برنامه ایراد دارد،
       عیب داده یعنی ورودی مدرسه ایراد دارد. */
    byCat: {}
  };
  Object.keys(DIAG_CATS).forEach(function(c){
    var list = results.filter(function(r){ return (r.cat || 'data') === c; });
    summary.byCat[c] = {
      total: list.length,
      passed: list.filter(function(r){ return r.ok; }).length,
      critical: list.filter(function(r){ return !r.ok && r.severity === 'critical'; }).length,
      warning: list.filter(function(r){ return !r.ok && r.severity === 'warning'; }).length,
      failed: list.filter(function(r){ return !r.ok; }).length
    };
  });
  summary.health = diagHealthScore(summary, results);

  DIAG_HISTORY.push({ at: summary.at, health: summary.health,
                      critical: summary.critical, warning: summary.warning });
  if(DIAG_HISTORY.length > DIAG_MAX_HISTORY) DIAG_HISTORY.shift();

  return { summary: summary, results: results };
}

/**
 * نمرهٔ سلامت ۰ تا ۱۰۰.
 * بحرانی وزن ۱۵، هشدار ۵، اطلاع ۱ — چون یک عیب بحرانی به‌مراتب
 * مهم‌تر از چند هشدار است.
 */
function diagHealthScore(sum){
  var penalty = sum.critical * 15 + sum.warning * 5 + sum.info * 1;
  return Math.max(0, Math.min(100, 100 - penalty));
}

/**
 * تعمیر یک عیب مشخص.
 * پیش از هر تعمیر پشتیبان گرفته می‌شود تا برگشت‌پذیر باشد.
 */
function diagFix(id){
  var chk = DIAG_CHECKS.filter(function(c){ return c.id === id; })[0];
  if(!chk) return Promise.resolve({ ok:false, msg:'آزمون یافت نشد', short:'آزمون یافت نشد' });
  if(!chk.fix) return Promise.resolve({ ok:false, msg:'این عیب تعمیر خودکار ندارد',
                                         short:'تعمیر خودکار ندارد' });

  /* پشتیبان پیش از تعمیر */
  var snap = null;
  try{ snap = diagSnapshot(); }catch(e){}

  var before;
  try{ before = chk.check(); }catch(e){ before = { ok:false, count:0 }; }

  var finish = function(msg){
    var after;
    try{ after = chk.check(); }catch(e){ after = { ok:false, count:0 }; }
    var text  = (msg && typeof msg === 'object') ? msg.msg : String(msg);
    var beforeRec = (msg && typeof msg === 'object') ? msg.before : null;
    if(!after.ok){
      if(snap){ try{ diagRestore(snap); }catch(e2){} }
      return { ok:false, msg:'تعمیر کامل نشد و تغییرات برگشت داده شد: ' + text,
               short:'تعمیر ناموفق — تغییرات برگشت داده شد' };
    }
    if(beforeRec && beforeRec.length) diagRecordRepair(chk, beforeRec, text);
    if(typeof recordAudit === 'function'){
      try{ recordAudit('diag-fix', chk.title + ' — ' + text); }catch(e){}
    }
    var short = text.length > 60 ? text.slice(0, 60) + '…' : text;
    return { ok: !!after.ok, msg:text, short:short,
             before: before.count || 0, after: after.count || 0 };
  };

  var r;
  try{ r = chk.fix(before); }
  catch(e){
    if(snap){ try{ diagRestore(snap); }catch(e2){} }
    return Promise.resolve({ ok:false,
      msg:'تعمیر خطا داد و تغییرات برگشت داده شد: ' + String(e && e.message),
      short:'تعمیر خطا داد' });
  }
  if(r && typeof r.then === 'function'){
    return r.then(
      function(msg){ return finish(msg); },
      function(err){
        if(snap){ try{ diagRestore(snap); }catch(e2){} }
        return { ok:false, msg:'تعمیر ناموفق بود: ' + String(err && (err.message || err)),
                 short:'تعمیر ناموفق' };
      }
    );
  }
  return Promise.resolve(finish(r));
}

/** تعمیر همهٔ عیب‌های امن، یکجا (Promise — بعضی تعمیرات ناهمگام‌اند) */
function diagFixAll(){
  var done = [], failed = [], jobs = [];
  DIAG_CHECKS.forEach(function(chk){
    if(!chk.fix || !chk.safe) return;
    var r;
    try{ r = chk.check(); }catch(e){ return; }
    if(r.ok) return;
    jobs.push(Promise.resolve(diagFix(chk.id)).then(function(f){
      (f.ok ? done : failed).push(chk.title + ': ' + (f.short || f.msg));
    }));
  });
  return Promise.all(jobs).then(function(){ return { done: done, failed: failed }; });
}


/** عکس فوری از مجموعه‌های حساس، برای بازگردانی پس از تعمیر ناموفق */
function diagSnapshot(){
  var keys = ['users','classes','enrollments','parent_links','installments','transactions'];
  var snap = {};
  keys.forEach(function(k){
    if(db[k]) snap[k] = db[k].map(function(r){ return Object.assign({}, r); });
  });
  return snap;
}

function diagRestore(snap){
  Object.keys(snap).forEach(function(k){
    db[k] = snap[k];
  });
  if(typeof idxReset === 'function') idxReset();
}

/**
 * پایش خودکار پس‌زمینه.
 * هر بازه یک‌بار آزمون‌ها را می‌دواند و اگر عیب بحرانیِ قابل تعمیر
 * دید، خودش درستش می‌کند و به سوپرادمین اطلاع می‌دهد.
 *
 * ⚠️ عمداً فقط عیب‌های «امن» خودکار تعمیر می‌شوند. چیزی که نیاز به
 * قضاوت انسانی دارد (مثل کد ملی تکراری) فقط گزارش می‌شود.
 */
var DIAG_AUTO = { on:false, timer:null, interval: 5*60*1000, lastRun:null, fixes:0 };

function diagAutoStart(intervalMs){
  if(DIAG_AUTO.timer) clearInterval(DIAG_AUTO.timer);
  if(intervalMs) DIAG_AUTO.interval = intervalMs;
  DIAG_AUTO.on = true;
  DIAG_AUTO.timer = setInterval(diagAutoTick, DIAG_AUTO.interval);
  Store.set('sms_diag_auto_v1', '1');
  return true;
}

function diagAutoStop(){
  if(DIAG_AUTO.timer) clearInterval(DIAG_AUTO.timer);
  DIAG_AUTO.timer = null;
  DIAG_AUTO.on = false;
  Store.remove('sms_diag_auto_v1');
  return true;
}

function diagAutoTick(){
  var out;
  try{ out = runDiagnostics(); }catch(e){ return; }
  DIAG_AUTO.lastRun = out.summary;
  if(out.summary.autoFixable > 0){
    var f = diagFixAll();
    if(f && f.then){
      f.then(function(res){
        DIAG_AUTO.fixes += res.done.length;
        if(res.done.length && typeof insert === 'function'){
          try{
            var admin = db.users.filter(function(u){ return u.role==='superadmin'; })[0];
            if(db.notifications && admin) insert('notifications', {
              user_id: admin.id,
              title: 'تعمیر خودکار سامانه',
              body: res.done.length + ' عیب خودکار برطرف شد: ' + res.done.join(' · '),
              date: todayISO(), read: 0
            });
          }catch(e){}
        }
      });
    }
  }
}

/* بارگذاری وضعیت پایدار در لحظهٔ ساخت صفحه — فقط یک‌بار */
try{
  diagSyslogLoad();
  diagRepairsLoad();
}catch(e){}

/* ------------------------------------------------------------------ */
/*  لاگ خطای زمان‌اجرا (syslog) — دام‌گیر «مشکلات کدنویسی»               */
/*                                                                     */
/*  هر خطای واقعی برنامه (throw نشده در try، Promise شکسته) اینجا ثبت   */
/*  می‌شود تا در صفحهٔ دیاگ دیده شود. دستگاه دیاگ باید خطای کد را         */
/*  «ببیند» حتی وقتی هیچ صفحه‌ای از آن خبر ندارد.                        */
/* ------------------------------------------------------------------ */
var DIAG_SYSLOG = [];
var DIAG_SYSLOG_KEY = 'sms_diag_syslog_v1';
var DIAG_SYSLOG_MAX = 100;

function diagSyslogLoad(){
  if(DIAG_SYSLOG.length) return;
  try{
    var s = Store.getJSON(DIAG_SYSLOG_KEY, null);
    if(Array.isArray(s)) DIAG_SYSLOG = s.slice(-DIAG_SYSLOG_MAX);
  }catch(e){}
}

function diagLogError(rec){
  rec = rec || {};
  DIAG_SYSLOG.push({
    t: new Date().toISOString(),
    msg: String(rec.message || (rec.reason && rec.reason.message) || rec.reason || 'خطای نامشخص'),
    src: String(rec.filename || ''),
    line: (rec.lineno != null) ? rec.lineno : null,
    user: (typeof S !== 'undefined' && S.user) ? S.user.role : 'guest'
  });
  if(DIAG_SYSLOG.length > DIAG_SYSLOG_MAX) DIAG_SYSLOG = DIAG_SYSLOG.slice(-DIAG_SYSLOG_MAX);
  try{ Store.setJSON(DIAG_SYSLOG_KEY, DIAG_SYSLOG); }catch(e){}
}

(function diagWireErrors(){
  try{
    window.addEventListener('error', function(ev){
      diagLogError({ message: ev && ev.message, filename: ev && ev.filename,
                     lineno: ev && ev.lineno });
    });
    window.addEventListener('unhandledrejection', function(ev){
      var r = ev && ev.reason;
      diagLogError({ message: (r && r.message) ? r.message : String(r), reason: r });
    });
  }catch(e){}
})();

/* ------------------------------------------------------------------ */
/*  تاریخچهٔ تعمیرات — پایدار، قابل بازگردانی                           */
/*                                                                     */
/*  هر تعمیر خودکار، «حالت قبل» رکوردهای تحت تأثیر را همین‌جا نگه         */
/*  می‌دارد تا با یک کلیک به حالت قبل برگردد. این چیزی است که تعمیرات     */
/*  «تغییردهنده» (مثل عوض‌کردن رمز یا افزودن رشته به مدرسه) را امن می‌کند:  */
/*  داده از بین نمی‌رود، فقط جابه‌جا می‌شود.                              */
/* ------------------------------------------------------------------ */
var DIAG_REPAIRS = [];
var DIAG_REPAIRS_KEY = 'sms_diag_repairs_v1';
var DIAG_REPAIRS_MAX = 50;

function diagRepairsLoad(){
  if(DIAG_REPAIRS.length) return;
  try{
    var s = Store.getJSON(DIAG_REPAIRS_KEY, null);
    if(Array.isArray(s)) DIAG_REPAIRS = s.slice(0, DIAG_REPAIRS_MAX);
  }catch(e){}
}

/** ثبت یک تعمیر همراه با حالتِ قبلِ رکوردها */
function diagRecordRepair(chk, beforeList, msg){
  DIAG_REPAIRS.unshift({
    at: new Date().toISOString(),
    id: chk.id, title: chk.title, msg: String(msg || ''),
    before: beforeList || []
  });
  if(DIAG_REPAIRS.length > DIAG_REPAIRS_MAX) DIAG_REPAIRS.length = DIAG_REPAIRS_MAX;
  try{ Store.setJSON(DIAG_REPAIRS_KEY, DIAG_REPAIRS); }catch(e){}
}

/** بازگردانی یک تعمیر به حالت قبل */
function diagRollback(i){
  var rec = DIAG_REPAIRS[i];
  if(!rec) return { ok:false, msg:'ردیف تعمیر یافت نشد' };
  var n = 0, err = null;
  try{
    batchWrites(function(){
      (rec.before || []).forEach(function(b){
        if(b.coll === '__nav'){
          try{ Store.setJSON('nav_disabled_v1', b.rec || []); }catch(e){}
          n++; return;
        }
        if(b.coll === '__ids'){
          try{ ids[b.rec.c] = b.rec.from; }catch(e){}
          n++; return;
        }
        if(b.existed && b.rec){
          var cur = byId(b.coll, b.rec.id);
          if(cur){ update(b.coll, b.rec.id, b.rec); }
          else{ applyOp({ t:'ins', c:b.coll, data:Object.assign({}, b.rec) }); }
        }else if(!b.existed && b.rec && b.rec.id != null){
          if(byId(b.coll, b.rec.id)) remove(b.coll, b.rec.id);
        }
        n++;
      });
    });
    if(typeof idxReset === 'function') idxReset();
  }catch(e){ err = String(e && e.message); }
  if(!err){
    try{ DIAG_REPAIRS.splice(i, 1); Store.setJSON(DIAG_REPAIRS_KEY, DIAG_REPAIRS); }catch(e){}
  }
  return err
    ? { ok:false, msg:'بازگردانی خطا داد: ' + err }
    : { ok:true, msg: fa(n) + ' رکورد به حالت قبل از تعمیر برگشت' };
}

/* ------------------------------------------------------------------ */
/*  سنجش ارتباط با سرور — فقط در حالت سرور معنا دارد                      */
/*  در بیلد تک‌فایل، آزمون‌های این بخش صادقانه «اجرا نمی‌شود» گزارش       */
/*  می‌کنند و خودِ پروب‌ها آمادهٔ اولین لحظهٔ اتصال به سرور است.            */
/* ------------------------------------------------------------------ */
var DIAG_PROBES = Store.getJSON('sms_diag_probes_v1', {}) || {};

/** آیا بیلد در حالت سرور اجرا می‌شود؟ */
function diagServerOn(){
  try{
    return !!(window.__PAYESH_SERVER__ || Store.get('payesh_server_url_v1'));
  }catch(e){ return false; }
}
/** آدرس پایهٔ سرور (در حالت هم‌میزان، خالی = هم‌خود) */
function diagServerUrl(){
  try{ return Store.get('payesh_server_url_v1') || ''; }catch(e){ return ''; }
}

/** GET با JSON و مهلت زمانی — از لایهٔ داده، چون لمسِ شبکه فقط آنجا مجاز است */
function diagFetchJson(url, timeoutMs){
  if(typeof httpGetJson !== 'function')
    return Promise.reject(new Error('لایهٔ شبکه در دسترس نیست'));
  return httpGetJson(url, timeoutMs);
}

/** پروب نقطهٔ سلامت سرور (/api/health) — نتیجه را می‌سنجد و نگه می‌دارد */
function diagProbeHealth(){
  if(!diagServerOn()){
    return Promise.resolve({ ok:false, probed:false,
      msg:'این بیلد تک‌فایل است — آدرس سرور تعریف نشده؛ آزمون‌های ارتباطی در حالت سرور اجرا می‌شوند' });
  }
  var t0 = Date.now();
  return diagFetchJson(diagServerUrl() + '/api/health', 6000).then(function(r){
    var ms = Date.now() - t0;
    var rec = { at:new Date().toISOString(), ok:r.ok, code:r.code, ms:ms,
                version:(r.data && r.data.version) || null, serverTime:r.serverTime };
    DIAG_PROBES.health = rec;
    if(rec.serverTime){
      var drift = Math.abs(Date.parse(rec.serverTime) - Date.now());
      if(drift < 86400000) DIAG_PROBES.driftMs = drift; /* ساعت سرور عجیب نبود */
    }
    try{ Store.setJSON('sms_diag_probes_v1', DIAG_PROBES); }catch(e){}
    var msg = r.ok
      ? 'سرور پاسخ داد (' + ms + ' میلی‌ثانیه)'
        + (rec.version ? ' · نسخهٔ سرور: ' + rec.version : '')
      : 'سرور با کد ' + r.code + ' پاسخ داد';
    return { ok:r.ok, probed:true, msg:msg };
  }, function(err){
    var rec = { at:new Date().toISOString(), ok:false,
                err:String((err && err.message) || err), ms:Date.now() - t0 };
    DIAG_PROBES.health = rec;
    try{ Store.setJSON('sms_diag_probes_v1', DIAG_PROBES); }catch(e){}
    return { ok:false, probed:true,
      msg:'وصل به سرور نشد: ' + String((err && err.message) || err)
         + ' — دامنه، پورت، HTTPS و اجرای سرور را بررسی کنید' };
  });
}

/* ------------------------------------------------------------------ */
/*  پنهان‌سازی خودکار گزینه‌های شکستهٔ منو                               */
/*                                                                     */
/*  وقتی آزمون route-coverage ببیند گزینه‌ای از منو صفحهٔ خالی یا خطا     */
/*  می‌دهد (یعنی مشکل از کد است)، آن گزینه را تا زمان تعمیر پنهان می‌کند —  */
/*  بقیهٔ سامانه بی‌صدا کار می‌کند و عیب در دیاگ معلوم می‌ماند.              */
/* ------------------------------------------------------------------ */
function navDisabledRoutes(){
  try{
    var a = Store.getJSON('nav_disabled_v1', null);
    return Array.isArray(a) ? a : [];
  }catch(e){ return []; }
}
function navDisableAdd(route){
  var cur = navDisabledRoutes();
  if(cur.indexOf(route) < 0) cur.push(route);
  try{ Store.setJSON('nav_disabled_v1', cur); }catch(e){}
  return cur;
}
function navRestoreAll(){
  try{ Store.remove('nav_disabled_v1'); }catch(e){}
}

/** اسکن همهٔ مسیرهای منو؛ خروجی: فهرست مسیرهای معیوب + شمارندهٔ دیده‌شده‌ها */
var diagProbeRoutesSeen = 0;
function diagProbeRoutes(){
  var bad = [], seen = Object.create(null);
  diagProbeRoutesSeen = 0;
  if(typeof NAV !== 'object' || typeof renderRoute !== 'function') return bad;
  Object.keys(NAV).forEach(function(role){
    (NAV[role] || []).forEach(function(grp){
      (grp[1] || []).forEach(function(it){
        var r = it[0];
        if(seen[r]) return;
        seen[r] = true;
        diagProbeRoutesSeen++;
        var prev = S.route, out = null, err = null;
        try{ S.route = r; out = renderRoute(); }
        catch(e){ err = String(e && e.message); }
        finally{ S.route = prev; }
        if(err) bad.push({ route:r, نقش:role, خطا:err });
        else if(!out || String(out).trim() === '')
          bad.push({ route:r, نقش:role, خطا:'خروجی خالی' });
      });
    });
  });
  return bad;
}


/* ------------------------------------------------------------------ */
/*  نما — صفحهٔ دیاگ                                                   */
/* ------------------------------------------------------------------ */

/** رنگ نمرهٔ سلامت */
function diagScoreColor(n){
  return n >= 90 ? 'var(--green)' : n >= 70 ? 'var(--amber)' : 'var(--red)';
}

function viewDiagnostics(){
  if(S.user.role !== 'superadmin')
    return empty('🔒','دسترسی ندارید','این بخش ویژهٔ سوپرادمین است.');

  var out = S.diag || null;
  var sum = out ? out.summary : null;

  var hidden = navDisabledRoutes();
  var head = '<div class="card"><div class="card-head">'
    + '<h3>🔧 دیاگ سامانه</h3>'
    + '<div class="row">'
    +   '<button class="btn" data-act="diag-run">🔍 بررسی کامل</button>'
    +   '<button class="btn ghost" data-act="diag-run" data-cat="engine">⚙️ فقط موتور</button>'
    +   '<button class="btn ghost" data-act="diag-run" data-cat="data">📋 فقط داده</button>'
    +   '<button class="btn ghost" data-act="diag-run" data-cat="infra">🌐 فقط ارتباط/زیرساخت</button>'
    +   (diagServerOn() ? '<button class="btn ghost" data-act="diag-probe">📡 سنجش سرور</button>' : '')
    +   (hidden.length
        ? '<button class="btn ghost" style="color:var(--amber)" data-act="diag-nav-restore">↩️ بازگردانی گزینه‌های پنهان (' + fa(hidden.length) + ')</button>' : '')
    +   (sum && sum.autoFixable
        ? '<button class="btn" style="background:var(--green)" data-act="diag-fixall">🛠️ تعمیر خودکار ('
          + fa(sum.autoFixable) + ')</button>' : '')
    +   '<button class="btn ghost" data-act="diag-auto">'
    +     (DIAG_AUTO.on ? '⏸️ توقف پایش خودکار' : '▶️ پایش خودکار') + '</button>'
    + '</div></div>';
  if(hidden.length){
    head += '<div class="card-body" style="border-bottom:1px solid var(--border)">'
      + '<div class="small" style="color:var(--amber)">🚫 ' + fa(hidden.length)
      + ' گزینهٔ منو به‌دلیل عیبِ کدنویسی تا زمان تعمیر پنهان است: '
      + hidden.map(function(r){ return esc(r); }).join('، ')
      + ' — بعد از تعمیر بیلد، دکمهٔ «بازگردانی گزینه‌های پنهان» را بزنید.</div></div>';
  }

  if(!out){
    var nEng = DIAG_CHECKS.filter(function(c){return c.cat==="engine";}).length;
    var nInf = DIAG_CHECKS.filter(function(c){return c.cat==="infra";}).length;
    var nDat = DIAG_CHECKS.length - nEng - nInf;
    head += '<div class="card-body">'
      + empty('🩺','هنوز بررسی نشده',
          'دکمهٔ «بررسی کامل» را بزنید تا سامانه خودش را وارسی کند. '
          + fa(DIAG_CHECKS.length) + ' آزمون در سه خانواده اجرا می‌شود: '
          + '⚙️ پیکربندی و موتور برنامه (' + fa(nEng) + ' آزمون)، '
          + '📋 کیفیت دادهٔ کاربر (' + fa(nDat) + ' آزمون) و '
          + '🌐 ارتباط، هاست و زیرساخت (' + fa(nInf) + ' آزمون).')
      + '</div></div>';
    return head;
  }

  /* گیج سلامت */
  var col = diagScoreColor(sum.health);
  head += '<div class="card-body">'
    + '<div class="diag-gauge">'
    +   '<div class="diag-score" style="color:' + col + '">'
    +     '<b>' + fa(sum.health) + '</b><span>از ۱۰۰</span></div>'
    +   '<div class="diag-bars">'
    +     diagBar('موفق', sum.passed, sum.total, 'var(--green)')
    +     diagBar('بحرانی', sum.critical, sum.total, 'var(--red)')
    +     diagBar('هشدار', sum.warning, sum.total, 'var(--amber)')
    +     diagBar('اطلاع', sum.info, sum.total, 'var(--primary)')
    +   '</div>'
    + '</div>'
    + '<div class="diag-cats">'
    +   Object.keys(DIAG_CATS).map(function(c){
          var k = sum.byCat && sum.byCat[c];
          if(!k || !k.total) return '';
          var bad = k.failed, col = k.critical ? 'var(--red)'
                    : bad ? 'var(--amber)' : 'var(--green)';
          return '<div class="diag-cat" style="border-color:' + col + '">'
            + '<div class="diag-cat-h"><span>' + DIAG_CATS[c].icon + '</span>'
            + '<b>' + DIAG_CATS[c].fa + '</b></div>'
            + '<div class="small muted">' + esc(DIAG_CATS[c].desc) + '</div>'
            + '<div class="diag-cat-n" style="color:' + col + '">'
            +   fa(k.passed) + ' از ' + fa(k.total) + ' سالم'
            +   (bad ? ' · ' + fa(bad) + ' عیب' : ' ✅')
            + '</div></div>';
        }).join('')
    + '</div>'
    + '<div class="small muted" style="margin-top:10px">'
    +   'زمان بررسی: ' + fa(sum.ms) + ' میلی‌ثانیه · '
    +   fa(sum.total) + ' آزمون · '
    +   (DIAG_AUTO.on ? 'پایش خودکار <b style="color:var(--green)">روشن</b>'
                      : 'پایش خودکار خاموش')
    +   (DIAG_AUTO.fixes ? ' · ' + fa(DIAG_AUTO.fixes) + ' تعمیر خودکار تاکنون' : '')
    + '</div></div></div>';

  /* فهرست نتایج: عیب‌ها اول، به ترتیب شدت */
  var bad = out.results.filter(function(r){ return !r.ok; })
    .sort(function(a,b){
      return DIAG_SEVERITY[b.severity].rank - DIAG_SEVERITY[a.severity].rank; });
  var good = out.results.filter(function(r){ return r.ok; });

  var body = '';
  /* عیب‌ها به تفکیک خانواده نمایش داده می‌شوند تا سوپرادمین بداند
     مشکل از برنامه است یا از دادهٔ واردشده. */
  Object.keys(DIAG_CATS).forEach(function(c){
    var list = bad.filter(function(r){ return (r.cat || 'data') === c; });
    if(!list.length) return;
    body += '<div class="card" style="margin-top:14px"><div class="card-head">'
      + '<h3>' + DIAG_CATS[c].icon + ' عیب در ' + DIAG_CATS[c].fa
      + ' <span class="badge b-red">' + fa(list.length) + '</span></h3></div>'
      + '<div class="card-body">' + list.map(diagCard).join('') + '</div></div>';
  });
  if(good.length){
    body += '<div class="card" style="margin-top:14px"><div class="card-head">'
      + '<h3>آزمون‌های سالم <span class="badge b-green">' + fa(good.length) + '</span></h3></div>'
      + '<div class="card-body"><div class="diag-ok-grid">'
      + good.map(function(r){
          return '<div class="diag-ok">' + (DIAG_CATS[r.cat] || DIAG_CATS.data).icon
            + ' <b>' + esc(r.title) + '</b>'
            + (r.extra ? '<span class="small muted"> — ' + esc(r.extra) + '</span>' : '')
            + '</div>'; }).join('')
      + '</div></div></div>';
  }

  /* تاریخچهٔ تعمیرات + کتابچهٔ عملیات — دانشِ «چطور رفع می‌شود» */
  body += viewDiagRepairs();
  body += viewDiagPlaybook();

  return head + body;
}

var DIAG_OWNER_FA = { app:'خودکار (برنامه)', admin:'مدیر سامانه',
                      server:'سرور/زیرساخت', dev:'توسعه‌دهنده', user:'کاربر دستگاه' };

/** تاریخچهٔ تعمیرات خودکار با دکمهٔ بازگردانی */
function viewDiagRepairs(){
  if(!DIAG_REPAIRS.length) return '';
  return '<div class="card" style="margin-top:14px"><div class="card-head">'
    + '<h3>📜 تاریخچه تعمیرات خودکار <span class="badge b-blue">' + fa(DIAG_REPAIRS.length) + '</span></h3>'
    + '<div class="row"><button class="btn ghost sm" data-act="diag-clear-repairs">پاک‌کردن تاریخچه</button></div></div>'
    + '<div class="card-body"><div class="diag-items">'
    + DIAG_REPAIRS.slice(0, 10).map(function(r, i){
        return '<div class="diag-item"><div class="diag-item-head">'
          + '<span class="diag-ico">🛠️</span>'
          + '<div style="flex:1;min-width:0"><b>' + esc(r.title) + '</b>'
          + '<div class="small muted">' + esc(r.at) + ' · ' + esc(r.msg) + '</div></div>'
          + '<button class="btn ghost sm" data-act="diag-rollback" data-i="' + i
          + '" title="به حالت قبل از این تعمیر برگردد">↩️ بازگردانی</button>'
          + '</div></div>';
      }).join('')
    + '</div></div></div>';
}

/** کتابچهٔ عملیات — همهٔ سناریوهای مشکل، نحوهٔ تشخیص و رفع، و مسئول */
function viewDiagPlaybook(){
  var rows = DIAG_CHECKS.map(function(c){
    return {
      title: c.title,
      cat: (DIAG_CATS[c.cat || 'data'] || DIAG_CATS.data).fa,
      when: c.when || c.desc || '',
      auto: c.fix ? (c.safe ? 'بله' : 'با تأیید') : 'خیر',
      fix: c.fixDesc || 'بررسی دستی و رفع از فرم مربوطه',
      owner: DIAG_OWNER_FA[c.owner || 'admin']
    };
  });
  return '<div class="card" style="margin-top:14px"><details class="diag-details">'
    + '<summary>📕 کتابچهٔ عملیات — ' + fa(rows.length)
    + ' سناریوی مشکل: چه‌وقتی رخ می‌دهد، چطور تشخیص داده و چطور رفع می‌شود</summary>'
    + '<div class="table-wrap" style="margin-top:10px"><table><thead><tr>'
    + '<th>سناریوی مشکل</th><th>خانواده</th><th>وقتی رخ می‌دهد</th>'
    + '<th>رفع خودکار</th><th>نحوهٔ رفع</th><th>مسئول</th>'
    + '</tr></thead><tbody>'
    + rows.map(function(r){
        return '<tr><td><b>' + esc(r.title) + '</b></td><td>' + esc(r.cat) + '</td>'
          + '<td>' + esc(r.when) + '</td><td>' + esc(r.auto) + '</td>'
          + '<td>' + esc(r.fix) + '</td><td>' + esc(r.owner) + '</td></tr>';
      }).join('')
    + '</tbody></table></div></details></div>';
}

function diagBar(label, n, total, color){
  var pct = total ? (n / total) * 100 : 0;
  return '<div class="diag-bar-row">'
    + '<span class="diag-bar-lbl">' + label + '</span>'
    + '<div class="bar-track"><div class="bar-fill" style="width:' + pct + '%;background:' + color + '"></div></div>'
    + '<b class="diag-bar-n">' + fa(n) + '</b></div>';
}

function diagCard(r){
  var sv = DIAG_SEVERITY[r.severity];
  var h = '<div class="diag-item" style="border-inline-start-color:' + sv.color + '">'
    + '<div class="diag-item-head">'
    +   '<span class="diag-ico">' + sv.icon + '</span>'
    +   '<div style="flex:1;min-width:0">'
    +     '<b>' + esc(r.title) + '</b>'
    +     '<div class="small muted">' + esc(r.desc) + '</div>'
    +   '</div>'
    +   '<span class="badge" style="background:' + sv.color + '22;color:' + sv.color
    +     ';border-color:' + sv.color + '">' + sv.fa + '</span>'
    + '</div>'
    + '<div class="diag-msg">' + esc(r.msg) + '</div>';

  if(r.items && r.items.length){
    h += '<details class="diag-details"><summary>نمایش نمونه‌ها ('
      + fa(Math.min(r.items.length, 20)) + ' از ' + fa(r.count) + ')</summary>'
      + '<div class="diag-items">'
      + r.items.map(function(it){
          return '<div class="diag-row">'
            + Object.keys(it).map(function(k){
                return '<span><i>' + esc(k) + ':</i> ' + esc(String(it[k])) + '</span>'; }).join('')
            + '</div>'; }).join('')
      + '</div></details>';
  }

  if(r.safe){
    h += '<div style="margin-top:10px"><button class="btn sm" style="background:var(--green)" '
      + 'data-act="diag-fix" data-id="' + esc(r.id) + '">🛠️ تعمیر خودکار</button>'
      + '<span class="small muted" style="margin-inline-start:8px">'
      + 'برگشت‌پذیر است؛ پیش از تعمیر پشتیبان گرفته می‌شود.</span></div>';
    if(r.fixDesc)
      h += '<div class="small muted" style="margin-top:6px">📖 ' + esc(r.fixDesc) + '</div>';
  } else {
    h += '<div class="small muted" style="margin-top:8px">'
      + 'ℹ️ ' + esc(r.fixDesc || 'این مورد باید دستی بررسی شود.') + '</div>';
    if(r.owner && r.owner !== 'app')
      h += '<div class="small muted">مسئول رفع: ' + esc(DIAG_OWNER_FA[r.owner] || 'مدیر سامانه') + '</div>';
  }
  return h + '</div>';
}
