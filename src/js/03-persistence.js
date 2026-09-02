/* ============================ persistence (mutation log) ============================ */
const LOG_KEY='sms_log_v1', SESSION_KEY='sms_session_v1', BOSS_KEY='sms_boss_v1', PERSONA_KEY='sms_persona_v1';
let log=[];
/* هنگام بازپخش لاگ یا تولید داده نمونه، صف همگام‌سازی نباید پر شود */
let SYNC_MUTED=false;
function loadLog(){try{log=JSON.parse(localStorage.getItem(LOG_KEY)||'[]');}catch(e){log=[];}}
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
  try{
    var payload=JSON.stringify(log);
    localStorage.setItem(LOG_KEY,payload);
    STORAGE_FULL=false;
    /* هشدار پیش از پرشدن: در ۸۰٪ سقف تقریبی ۵ مگابایت */
    var used=payload.length+(function(){try{return (localStorage.getItem(SYNC_QUEUE_KEY)||'').length;}catch(e){return 0;}})();
    if(!STORAGE_WARNED && used > 0.8*5*1048576){
      STORAGE_WARNED=true;
      if(typeof toast==='function')
        toast('حافظهٔ دستگاه رو به پر شدن است. لطفاً به اینترنت وصل شوید تا داده‌ها ارسال شود.','err');
    }
  }catch(e){
    /* حافظه پر شد — کاربر باید بداند، وگرنه بی‌صدا داده از دست می‌رود */
    STORAGE_FULL=true;
    if(typeof toast==='function')
      toast('⚠️ حافظهٔ دستگاه پر است! تغییرات جدید ذخیره نشد. برای جلوگیری از از دست رفتن داده، به اینترنت وصل شوید.','err');
    if(typeof console!=='undefined'&&console.error) console.error('saveLog failed:',e);
  }
}
/** آیا ذخیره‌سازی محلی دچار مشکل است؟ (برای نشانگر وضعیت) */
function storageFull(){ return STORAGE_FULL; }
function applyLog(){SYNC_MUTED=true;log.forEach(e=>applyOp(e,false));SYNC_MUTED=false;}
function applyOp(op,record=true){
  const arr=db[op.c];
  if(op.t==='ins'){
    /* ⚠️ ترتیب مهم است: ابتدا با ایندکسِ هنوز معتبر تکراری‌بودن را بررسی کن،
       سپس یک بار باطل کن. اگر اول باطل کنیم، idxById دوباره کل مجموعه را
       می‌سازد و هر insert از درجهٔ n می‌شود (در عملیات انبوه: درجه دوم). */
    const im=(typeof idxById==='function')?idxById(op.c):null;
    const dup = im? im.has(Number(op.data.id)) : arr.some(x=>x.id===op.data.id);
    if(typeof idxInvalidate==='function') idxInvalidate(op.c);
    if(!dup) arr.push(op.data);
    ids[op.c]=Math.max(ids[op.c]||0,op.data.id);
  }
  else if(op.t==='upd'){
    /* جستجوی رکورد از ایندکس id پیش از باطل‌سازی */
    const im=(typeof idxById==='function')?idxById(op.c):null;
    const it = im? im.get(Number(op.id)) : arr.find(x=>x.id===op.id);
    if(typeof idxInvalidate==='function') idxInvalidate(op.c);
    if(it)Object.assign(it,op.data);
  }
  else if(op.t==='del'){
    if(typeof idxInvalidate==='function') idxInvalidate(op.c);
    const i=arr.findIndex(x=>x.id===op.id); if(i>-1)arr.splice(i,1);
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
    log.push(op);saveLog();
    /* هر تغییر واقعی کاربر وارد صف همگام‌سازی با سرور می‌شود */
    if(typeof enqueueOp==='function' && !SYNC_MUTED) enqueueOp(op);
  }
}
const insert=(c,o)=>{o.id=nextId(c);applyOp({t:'ins',c,data:o});return o;};
const update=(c,id,patch)=>applyOp({t:'upd',c,id,data:patch});
const remove=(c,id)=>applyOp({t:'del',c,id});
function resetAll(){
  localStorage.removeItem(LOG_KEY);
  localStorage.removeItem(SYNC_QUEUE_KEY);
  localStorage.removeItem(SYNC_META_KEY);
  location.reload();
}
