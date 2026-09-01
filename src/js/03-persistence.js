/* ============================ persistence (mutation log) ============================ */
const LOG_KEY='sms_log_v1', SESSION_KEY='sms_session_v1', BOSS_KEY='sms_boss_v1', PERSONA_KEY='sms_persona_v1';
let log=[];
/* هنگام بازپخش لاگ یا تولید داده نمونه، صف همگام‌سازی نباید پر شود */
let SYNC_MUTED=false;
function loadLog(){try{log=JSON.parse(localStorage.getItem(LOG_KEY)||'[]');}catch(e){log=[];}}
var STORAGE_WARNED=false, STORAGE_FULL=false;
function saveLog(){
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
  /* ایندکس‌های این مجموعه پیش از تغییر باطل می‌شوند تا هرگز دادهٔ کهنه برنگردد */
  if(typeof idxInvalidate==='function') idxInvalidate(op.c);
  if(op.t==='ins'){
    const im=(typeof idxById==='function')?idxById(op.c):null;
    const dup = im? im.has(Number(op.data.id)) : arr.some(x=>x.id===op.data.id);
    if(!dup) arr.push(op.data);
    ids[op.c]=Math.max(ids[op.c]||0,op.data.id);
    if(typeof idxInvalidate==='function') idxInvalidate(op.c);
  }
  else if(op.t==='upd'){ const it=arr.find(x=>x.id===op.id); if(it)Object.assign(it,op.data); }
  else if(op.t==='del'){ const i=arr.findIndex(x=>x.id===op.id); if(i>-1)arr.splice(i,1); }
  if(record){
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
