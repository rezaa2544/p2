/* ═══════════════════════════════════════════════════════════════════
   ماندگاری — دفترچهٔ تغییرات و هماهنگی با IndexedDB (فاز ۴)
   ═══════════════════════════════════════════════════════════════════
   داده به‌صورت «دفترچهٔ عملیات» نگه داشته می‌شود نه عکس لحظه‌ای:
   هر درج/ویرایش/حذف یک سطر است و وضعیت فعلی از بازپخش آن‌ها می‌آید.
   همین ساختار است که همگام‌سازی با سرور را ممکن می‌کند — همان سطرها
   به صف 27-sync.js می‌روند.

   معماری هیبریدی (فاز ۴ بند ۱۶ تا ۲۰):
   ۱. لایهٔ اصلی و بلندمدت: IndexedDB (ماژول 03-idb-persistence.js)
   ۲. لایهٔ پایداری فوری و همگام: RAM db + پایداری با Store
   ═══════════════════════════════════════════════════════════════════ */
const LOG_KEY='sms_log_v1', SESSION_KEY='sms_session_v1', BOSS_KEY='sms_boss_v1', PERSONA_KEY='sms_persona_v1';
/* R95 (بند ۲.۵): مجموعه‌هایِ دارایِ نسخه — باید با VERSION_TRACKED سرور
   (server/sync.js) یکی باشد؛ server-authority و LWW این‌جا نیستند. */
const _VERSIONED_C = { grades:1, attendance:1, discipline:1 };
let log=[];
/* هنگام بازپخش لاگ یا تولید داده نمونه، صف همگام‌سازی نباید پر شود */
let SYNC_MUTED=false;
function loadLog(){ log = Store.getJSON(LOG_KEY, []) || []; if(!Array.isArray(log)) log = []; }
var STORAGE_WARNED=false, STORAGE_FULL=false;
/* ---- دسته‌ای کردن ذخیره‌سازی ----
   هر بار saveLog کل لاگ را JSON.stringify می‌کند. در عملیات انبوه
   (مثلاً فارغ‌التحصیل کردن ۵۰۰ دانش‌آموز = ~۱۵۰۰ نوشتن) این رفتار
   درجه‌دوم می‌شود و رابط کاربری چند ثانیه قفل می‌ماند.
   batchWrites(fn) همهٔ نوشتن‌های داخل fn را جمع می‌کند و یک بار ذخیره می‌کند. */
var _BATCH_DEPTH = 0, _BATCH_DIRTY = false, _BATCH_QUEUE_DIRTY = false;

/** اجرای یک عملیات انبوه با تنها یک بار ذخیره‌سازی در پایان */
function batchWrites(fn){
  _BATCH_DEPTH++;
  try{ return fn(); }
  finally{
    _BATCH_DEPTH--;
    if(_BATCH_DEPTH === 0){
      if(_BATCH_DIRTY){ _BATCH_DIRTY = false; saveLog(); }
      /* صف همگام‌سازی هم یک بار در پایان ذخیره و رابطش تازه می‌شود */
      if(_BATCH_QUEUE_DIRTY){
        _BATCH_QUEUE_DIRTY = false;
        if(typeof saveQueue === 'function') saveQueue();
        if(typeof refreshSyncUI === 'function'){ try{ refreshSyncUI(); }catch(e){} }
      }
    }
  }
}

function saveLog(){
  if(_BATCH_DEPTH > 0){ _BATCH_DIRTY = true; return; }
  var payload = JSON.stringify(log);
  
  // همگام‌سازی ناهمگام با IndexedDB در پس‌زمینه (در صورت پشتیبانی مرورگر)
  if(typeof offlineStorage !== 'undefined' && offlineStorage.isSupported()){
    try{
      offlineStorage.setMetadata(LOG_KEY, log).catch(function(){});
    }catch(e){}
  }

  /* Store.set خودش استثنا را می‌گیرد و false برمی‌گرداند (Fallback امن) */
  if(Store.set(LOG_KEY, payload)){
    STORAGE_FULL=false;
    /* هشدار پیش از پرشدن: در ۸۰٪ سقف تقریبی ۵ مگابایت */
    var used = payload.length + Store.bytes(SYNC_QUEUE_KEY);
    if(!STORAGE_WARNED && used > 0.8*5*1048576){
      STORAGE_WARNED=true;
      if(typeof toast==='function')
        toast('حافظهٔ دستگاه رو به پر شدن است. لطفاً به اینترنت وصل شوید تا داده‌ها ارسال شود.','err');
    }
  }else{
    /* W7-4 (موج ۷): شکستِ Store همیشه بلند است. پیش‌تر اگر IDB در دسترس بود
       هشدار سرکوب می‌شد — با این فرض که آینهٔ IDB تورِ نجات است؛ اما آن آینه
       فقط-نوشتنی است (هیچ مسیرِ بازگشتی در بوت ندارد) و موفقیتش هم بررسی
       نمی‌شود. پس پرشدنِ Store یعنی از دست رفتنِ ماندگاری، با یا بیِ IDB:
       کاربر باید بداند، وگرنه بی‌صدا داده از دست می‌رود. */
    STORAGE_FULL=true;
    if(typeof toast==='function')
      toast('⚠️ حافظهٔ دستگاه پر است! تغییرات جدید ذخیره نشد. برای جلوگیری از از دست رفتن داده، به اینترنت وصل شوید.','err');
  }
}
/** آیا ذخیره‌سازی محلی دچار مشکل است؟ (برای نشانگر وضعیت) */
function storageFull(){ return STORAGE_FULL; }
function applyLog(){
  SYNC_MUTED=true;
  for(var i=0;i<log.length;i++){
    var e=log[i];
    if(!e) continue;
    if(e.t==='snap'){ applySnapshot(e); continue; }
    if(e.__a) continue; /* فقط‌سابقه — وضعیتِ اسنپ‌شات آن را دارد */
    applyOp(e,false);
  }
  SYNC_MUTED=false;
  /* شمارنده‌های فشردن را با وضعیتِ واقعیِ پایانِ بازپخش پر می‌کنیم */
  _LOG_BYTES = JSON.stringify(log).length;
  _DB_BYTES = JSON.stringify(db).length;
}
/* اسنپ‌شات = وضعیتِ کامل در لحظهٔ فشردن (AD ۸۵.۱). ارجاعاتِ آرایه‌ها
   حفظ می‌شوند (ماژول‌های دیگر نگه‌دارند) و ids از نو محاسبه می‌شود. */
function applySnapshot(e){
  var s = e.db || {};
  for(var c in s){
    if(!Object.prototype.hasOwnProperty.call(s,c)) continue;
    if(!Object.prototype.hasOwnProperty.call(db,c)) db[c] = [];
    var rows = JSON.parse(JSON.stringify(s[c]||[]));
    db[c].length = 0;
    for(var i=0;i<rows.length;i++){
      db[c].push(rows[i]);
      var id=Number(rows[i].id);
      if(id>(ids[c]||0)) ids[c]=id;
    }
    if(typeof idxInvalidate==='function') idxInvalidate(c);
  }
  /* حالتِ nextId: idهایِ ردیف‌هایِ بعداًِ حذف‌شده هم مصرف شده‌اند —
     باید همان خطِ دستگاهِ اصلی ادامه یابد، وگرنه idها دوباره استفاده
     می‌شوند (با سرور/آدیتِ قدیمی می‌درگند). */
  if(e.ids && typeof e.ids==='object'){
    for(var c2 in e.ids){
      if(!Object.prototype.hasOwnProperty.call(e.ids,c2)) continue;
      if(e.ids[c2]>(ids[c2]||0)) ids[c2]=e.ids[c2];
    }
  }
}
/* ---- فشردنِ دفترچه (AD ۸۵.۱ — P0-3 دور ۸۵) ----
   دستگاهِ طولانی‌کار دفترچه را بی‌پایان بزرگ می‌کند؛ هر saveLog کلِ
   آن را stringify می‌کند و هر بوت کلِ آن را بازپخش می‌کند.
   روی آستانه (۳۰۰۰۰ op یا ۳MB) دفترچه «اسنپ‌شات + ۵۰۰ op آخر» می‌شود.
   opهایِ ماندگار `__a` می‌گیرند: فقط‌سابقه — بازپخش نمی‌شوند (اسنپ‌شات
   پس از آن‌ها گرفته شده است؛ بازپخشِ مجدد فقط هزینهٔ بی‌مورد است).
   آدیت (36) فقط c/t/by/at/id می‌خواند و ردیفِ اسنپ‌شات (بدون c) را
   خودش رد می‌کند — شکلِ سابقهٔ تغییرات عوض نمی‌شود.
   گارد: فقط وقتی فشردن واقعاً کوچک می‌کند (cand < 90٪ قدیمی).
   برآورد O(1) با شمارنده است تا خودِ بررسی درجه‌دوم نشود؛ stringify
   واقعی فقط هنگام فشردنِ واقعی (هر ~۵۰۰ op یک بار) انجام می‌شود. */
var COMPACT_OPS=30000, COMPACT_BYTES=3*1048576, COMPACT_KEEP=500;
var _LOG_BYTES=0, _DB_BYTES=0, _COMPACT_REJECT_BYTES=0;
function compactLogIfNeeded(){
  if(log.length<=COMPACT_OPS && _LOG_BYTES<=COMPACT_BYTES) return false;
  if(_LOG_BYTES <= _COMPACT_REJECT_BYTES*1.1) return false; /* بعد از رد، با رشدِ ۱۰٪ دوباره */
  var avg = _LOG_BYTES/Math.max(1,log.length);
  var est = _DB_BYTES + COMPACT_KEEP*avg;
  if(est >= _LOG_BYTES*0.9){ _COMPACT_REJECT_BYTES=_LOG_BYTES; return false; }
  var tail = log.slice(-COMPACT_KEEP);
  for(var i=0;i<tail.length;i++) if(tail[i]) tail[i].__a = 1;
  /* رونوشتِ عمیق: اسنپ‌شات وضعیتِ «یخ‌زده» است — ارجاعِ زندهٔ db
     باعث می‌شد opهایِ بعدی اسنپ‌شات را هم بازنویسی کنند. */
  var snapDb = JSON.parse(JSON.stringify(db));
  var snapIds = JSON.parse(JSON.stringify(ids));
  log = [{ t:'snap', at:new Date().toISOString(), db:snapDb, ids:snapIds }].concat(tail);
  _LOG_BYTES = JSON.stringify(log).length;
  _DB_BYTES = JSON.stringify(snapDb).length;
  _COMPACT_REJECT_BYTES = 0;
  return true;
}
/* نسخهٔ داده (فاز ۲ بند ۲): با هر عملیاتِ ثبت‌شده زیاد می‌شود تا کش‌های
   هر-رندر (مثلِ classScoreContext) کهنه‌شدن را بفهمند. */
var _GRADE_CACHE_VERSION=0;

function applyOp(op,record=true){
  const arr=db[op.c];
  if(op.t==='ins'){
    /* ⚠️ ترتیب مهم است: ابتدا با ایندکسِ هنوز معتبر تکراری‌بودن را بررسی کن،
       سپس یک بار باطل کن. اگر اول باطل کنیم، idxById دوباره کل مجموعه را
       می‌سازد و هر insert از درجهٔ n می‌شود (در عملیات انبوه: درجه دوم). */
    const im=(typeof idxById==='function')?idxById(op.c):null;
    const dup = im? im.has(Number(op.data.id)) : arr.some(x=>x.id===op.data.id);
    if(!dup){
      if(_VERSIONED_C[op.c] && op.data.version == null) op.data.version = 1; /* R95 */
      arr.push(op.data);
      /* درج افزایشی به‌جای باطل‌سازی: ایندکس‌های ساخته‌شده زنده
         می‌مانند و درج بعدی مجبور به بازسازی کل مجموعه نیست.
         سنجش: ورود ۲۰۰۰ ردیف اکسل از ۱۴٬۲۵۷ms به حدود ۱٬۰۰۰ms. */
      if(typeof idxAppend==='function') idxAppend(op.c, op.data);
      else if(typeof idxInvalidate==='function') idxInvalidate(op.c);
    } else if(typeof idxInvalidate==='function') idxInvalidate(op.c);
    ids[op.c]=Math.max(ids[op.c]||0,op.data.id);
  }
  else if(op.t==='upd'){
    /* جستجوی رکورد از ایندکس id پیش از باطل‌سازی */
    const im=(typeof idxById==='function')?idxById(op.c):null;
    const it = im? im.get(Number(op.id)) : arr.find(x=>x.id===op.id);
    if(typeof idxInvalidate==='function') idxInvalidate(op.c);
    if(it){
      /* R95 (بند ۲.۵): پیش از اعمال، نسخهٔ پایه را ثبت کن و نسخهٔ محلی
         را بچرخان؛ سرور `base_version` را با نسخهٔ خود می‌سنجد و در
         مجموعه‌هایِ نسخه‌دار، تعارض را «حفظ» می‌کند (sync_conflicts). */
      if(_VERSIONED_C[op.c]){
        op.base_version = it.version || 1;
        it.version = (it.version || 1) + 1;
      }
      Object.assign(it,op.data);
    }
  }
  else if(op.t==='del'){
    if(typeof idxInvalidate==='function') idxInvalidate(op.c);
    const i=arr.findIndex(x=>x.id===op.id);
    /* اندازهٔ ردیفِ حذف‌شده — برای اصلاحِ شمارندهٔ حجمِ وضعیت (_DB_BYTES) */
    var _delBytes = (i>-1) ? JSON.stringify(arr[i]).length + 2 : 0;
    if(i>-1)arr.splice(i,1);
  }
  else if(typeof idxInvalidate==='function') idxInvalidate(op.c);
  if(record){
    /* رد پای کاربر و زمان — برای سابقهٔ تغییرات (36-audit-activity.js).
       فقط شناسه و مُهر زمان ذخیره می‌شود، نه کل رکورد کاربر، چون
       دفترچه در حافظهٔ مرورگر می‌ماند و هر بایت در مقیاس ملی ضرب می‌شود. */
    if(typeof S!=='undefined' && S.user && op.by===undefined){
      op.by = S.user.id;
      op.at = new Date().toISOString();
    }
    /* 🔴 دام کشف‌شده در دور ۴۲: در عملیات درج، `op.data` همان شیءِ
       زندهٔ رکورد است. هر `update` بعدی روی همان شیء می‌نویسد و
       گذشتهٔ دفترچه را بازنویسی می‌کند ⇒ سابقهٔ تغییرات دروغ
       می‌گفت («ثبت present» در حالی که absent ثبت شده بود).
       یک رونوشت سطحی می‌گیریم؛ هزینه‌اش ناچیز است و فقط هنگام
       ثبت در دفترچه رخ می‌دهد، نه در مسیر خواندن. */
    if(op.t==='ins' && op.data) op = Object.assign({}, op, { data: Object.assign({}, op.data) });
    log.push(op);
    _LOG_BYTES += JSON.stringify(op).length + 1;
    if(op.t==='ins' && op.data) _DB_BYTES += JSON.stringify(op.data).length + 2;
    else if(op.t==='upd' && op.data) _DB_BYTES += JSON.stringify(op.data).length;
    else if(op.t==='del') _DB_BYTES = Math.max(0, _DB_BYTES - _delBytes);
    compactLogIfNeeded(); /* اگر فشرد، saveLog همان شکلِ تازه را می‌نویسد */
    saveLog();
    _GRADE_CACHE_VERSION++;

    // همگام‌سازی مستقیم موجودیت در IndexedDB
    if(typeof offlineStorage !== 'undefined' && offlineStorage.isSupported()){
      try{
        if(op.t==='ins' || op.t==='upd'){
          if(op.data && op.data.id != null){
            offlineStorage.putEntity(op.c, op.data).catch(function(){});
          }
        }else if(op.t==='del'){
          if(op.id != null){
            offlineStorage.removeEntity(op.c, op.id).catch(function(){});
          }
        }
      }catch(e){}
    }

    /* هر تغییر واقعی کاربر وارد صف همگام‌سازی با سرور می‌شود */
    /* در حالت سروری، عملیاتی که کاربرِ احراز‌شده ندارد (مثل تولیدِ
       دنیای دمو پیش از ورود) وارد صفِ ارسال نمی‌شود: سرور نمی‌تواند آن
       را با توکن بسنجد (by باید کاربرِ توکن باشد) و دنیای دمو خودِ
       seedِ سرور است. در حالت محلی رفتار عوض نمی‌شود. */
    var _svrNoUser = (typeof DATA_MODE!=='undefined' && DATA_MODE==='server' && !(typeof S!=='undefined' && S.user));
    if(typeof enqueueOp==='function' && !SYNC_MUTED && !_svrNoUser) enqueueOp(op);
  }
}
const insert=(c,o)=>{o.id=nextId(c);applyOp({t:'ins',c,data:o});return o;};
const update=(c,id,patch)=>applyOp({t:'upd',c,id,data:patch});
const remove=(c,id)=>applyOp({t:'del',c,id});
function resetAll(){
  Store.remove(LOG_KEY);
  Store.remove(SYNC_QUEUE_KEY);
  Store.remove(SYNC_META_KEY);
  if(typeof offlineStorage !== 'undefined' && offlineStorage.isSupported()){
    try{ offlineStorage.clearAll(); }catch(e){}
  }
  location.reload();
}
