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
            desc:'یکپارچگی و درستی اطلاعاتی که مدارس وارد کرده‌اند' }
};

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
    fix: null
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
    fix: null
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
    fix: null
  },

  {
    id: 'class-over-capacity', cat: 'data',
    title: 'کلاس پر از ظرفیت',
    desc: 'تعداد دانش‌آموز بیش از ظرفیت اعلام‌شده',
    severity: 'warning',
    safe: false,
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
    fix: null
  },

  {
    id: 'field-outside-branch', cat: 'data',
    title: 'رشتهٔ خارج از شاخهٔ مدرسه',
    desc: 'کلاسی با رشته‌ای که مدرسه ارائه نمی‌دهد',
    severity: 'warning',
    safe: false,
    check: function(){
      if(typeof schoolFields !== 'function') return { ok:true };
      var bad = [];
      db.classes.forEach(function(c){
        if(!c.field) return;
        var mine = schoolFields(c.school_id) || [];
        if(mine.length && mine.indexOf(c.field) < 0){
          var s = byId('schools', c.school_id);
          bad.push({ id:c.id, name:c.name, field:c.field,
                     school: s ? s.name : '؟' });
        }
      });
      return bad.length
        ? { ok:false, count:bad.length, items:bad.slice(0,20),
            msg: bad.length + ' کلاس رشته‌ای دارند که مدرسه اعلام نکرده است' }
        : { ok:true };
    },
    fix: null
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
      if(typeof syncQueue === 'undefined' || !syncQueue) return { ok:true };
      var n = syncQueue.length || 0;
      if(n < 50) return { ok:true, extra: n + ' عملیات در صف' };
      return { ok:false, count:n, items:[{ n:n }],
        msg: n + ' عملیات در صف همگام‌سازی مانده است' };
    },
    fix: null
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
    fix: null
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
    fix: null
  },

  {
    id: 'weak-password', cat: 'data',
    title: 'رمز پیش‌فرض تغییرنیافته',
    desc: 'کاربرانی که هنوز رمز ۱۲۳۴۵۶ دارند',
    severity: 'warning',
    safe: false,
    check: function(){
      var bad = db.users.filter(function(u){
        return u.active && u.password === '123456' &&
               ['superadmin','manager','edu_office'].indexOf(u.role) > -1;
      }).map(function(u){ return { id:u.id, name:u.full_name, role:u.role }; });
      return bad.length
        ? { ok:false, count:bad.length, items:bad.slice(0,20),
            msg: bad.length + ' کاربر مدیریتی رمز پیش‌فرض دارند' }
        : { ok:true };
    },
    fix: null
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
    fix: null
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
    severity: 'critical',
    safe: false,
    check: function(){
      if(typeof NAV !== 'object' || typeof renderRoute !== 'function') return { ok:true };
      var bad = [], seen = Object.create(null);
      Object.keys(NAV).forEach(function(role){
        (NAV[role] || []).forEach(function(grp){
          (grp[1] || []).forEach(function(it){
            var r = it[0];
            if(seen[r]) return;
            seen[r] = true;
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
      return bad.length
        ? { ok:false, count:bad.length, items:bad.slice(0,20),
            msg: bad.length + ' مسیر منو نمای سالم ندارند' }
        : { ok:true, extra: Object.keys(seen).length + ' مسیر بررسی شد' };
    },
    fix: null
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
    fix: null
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
    fix: null
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
    fix: null
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
    fix: null
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
    fix: null
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
    fix: null
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
    fix: null
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
    fix: null
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
    fix: null
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
      (db.schools || []).forEach(function(sc){
        var tl;
        try{ tl = bellTimeline(sc.id); }
        catch(e){ bad.push({ مدرسه:sc.name, خطا:String(e && e.message) }); return; }
        if(!tl.length){ bad.push({ مدرسه:sc.name, خطا:'بدون زنگ' }); return; }
        for(var i = 1; i < tl.length; i++){
          if(tl[i].from !== tl[i-1].to){
            bad.push({ مدرسه:sc.name, خطا:'گسست در ' + tl[i].from }); break;
          }
        }
      });
      return bad.length
        ? { ok:false, count:bad.length, items:bad.slice(0,20),
            msg: bad.length + ' مدرسه زمان‌بندی زنگ معیوب دارند' }
        : { ok:true };
    },
    fix: null
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
    fix: null
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
  if(!chk) return { ok:false, msg:'آزمون یافت نشد' };
  if(!chk.fix) return { ok:false, msg:'این عیب تعمیر خودکار ندارد' };

  /* پشتیبان پیش از تعمیر */
  var snap = null;
  try{ snap = diagSnapshot(); }catch(e){}

  var before, after, msg;
  try{
    before = chk.check();
    msg = chk.fix(before);
    after = chk.check();
  }catch(e){
    /* تعمیر شکست خورد ⇒ بازگردانی */
    if(snap) try{ diagRestore(snap); }catch(e2){}
    return { ok:false, msg:'تعمیر ناموفق بود و تغییرات برگشت داده شد: '
                            + String(e && e.message) };
  }

  if(typeof recordAudit === 'function'){
    try{ recordAudit('diag-fix', chk.title + ' — ' + msg); }catch(e){}
  }
  return { ok: !!after.ok, msg: msg,
           before: before.count || 0, after: after.count || 0 };
}

/** تعمیر همهٔ عیب‌های امن، یکجا */
function diagFixAll(){
  var done = [], failed = [];
  DIAG_CHECKS.forEach(function(chk){
    if(!chk.fix || !chk.safe) return;
    var r;
    try{ r = chk.check(); }catch(e){ return; }
    if(r.ok) return;
    var f = diagFix(chk.id);
    if(f.ok) done.push(chk.title + ': ' + f.msg);
    else failed.push(chk.title + ': ' + f.msg);
  });
  return { done: done, failed: failed };
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
    DIAG_AUTO.fixes += f.done.length;
    if(f.done.length && typeof insert === 'function'){
      try{
        db.notifications && insert('notifications', {
          user_id: (db.users.filter(function(u){ return u.role==='superadmin'; })[0]||{}).id,
          title: 'تعمیر خودکار سامانه',
          body: f.done.length + ' عیب خودکار برطرف شد: ' + f.done.join(' · '),
          date: todayISO(), read: 0
        });
      }catch(e){}
    }
  }
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

  var head = '<div class="card"><div class="card-head">'
    + '<h3>🔧 دیاگ سامانه</h3>'
    + '<div class="row">'
    +   '<button class="btn" data-act="diag-run">🔍 بررسی کامل</button>'
    +   '<button class="btn ghost" data-act="diag-run" data-cat="engine">⚙️ فقط موتور</button>'
    +   '<button class="btn ghost" data-act="diag-run" data-cat="data">📋 فقط داده</button>'
    +   (sum && sum.autoFixable
        ? '<button class="btn" style="background:var(--green)" data-act="diag-fixall">🛠️ تعمیر خودکار ('
          + fa(sum.autoFixable) + ')</button>' : '')
    +   '<button class="btn ghost" data-act="diag-auto">'
    +     (DIAG_AUTO.on ? '⏸️ توقف پایش خودکار' : '▶️ پایش خودکار') + '</button>'
    + '</div></div>';

  if(!out){
    head += '<div class="card-body">'
      + empty('🩺','هنوز بررسی نشده',
          'دکمهٔ «بررسی کامل» را بزنید تا سامانه خودش را وارسی کند. '
          + fa(DIAG_CHECKS.length) + ' آزمون در دو خانواده اجرا می‌شود: '
          + '⚙️ پیکربندی و موتور برنامه (' 
          + fa(DIAG_CHECKS.filter(function(c){return c.cat==="engine";}).length) + ' آزمون) '
          + 'و 📋 کیفیت دادهٔ کاربر ('
          + fa(DIAG_CHECKS.filter(function(c){return c.cat!=="engine";}).length) + ' آزمون).')
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
  return head + body;
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
  } else if(r.fixable){
    h += '<div class="small muted" style="margin-top:8px">'
      + '⚠️ تعمیر خودکار ندارد چون نیاز به تصمیم شماست.</div>';
  } else {
    h += '<div class="small muted" style="margin-top:8px">'
      + 'ℹ️ این مورد باید دستی بررسی شود.</div>';
  }
  return h + '</div>';
}
