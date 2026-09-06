/* ============================ لایه همگام‌سازی آفلاین ============================ */
/*
  هدف: دبیر بدون اینترنت هم بتواند کار کند (حضور و غیاب، نمره، انضباط…).
  تغییرات محلی در «صف ارسال» می‌مانند و به‌محض وصل شدن اینترنت خودکار به سرور می‌روند.

  وضعیت هر عملیات:
    pending  → در صف، هنوز ارسال نشده
    sending  → در حال ارسال
    synced   → سرور تأیید کرده (از صف حذف می‌شود)
    failed   → خطا؛ با backoff دوباره تلاش می‌شود
    conflict → سرور نسخه‌ی جدیدتری دارد؛ نیاز به تصمیم کاربر

  در حالت دمو (بدون سرور) شبیه‌ساز داخلی نقش سرور را بازی می‌کند تا
  رفتار واقعی قابل مشاهده و تست باشد.
*/

const SYNC_QUEUE_KEY = 'sms_syncq_v1';
const SYNC_META_KEY  = 'sms_syncmeta_v1';

/* کدهایِ ردِّ پایدارِ سرور — عملیاتِ «مسموم»: دوباره‌ارسال بی‌فایده است.
   (دور ۸۵, P0-2) op به وضعیت rejected می‌رود و از چرخهٔ ارسال خارج
   می‌شود تا صف سالم‌ها را نگیرد؛ کاربر در پنلِ همگام‌سازی می‌بیند
   و می‌تواند حذفش کند. ردِ گذرا (مثل virtual_day یا 401 نشست) این‌جا
   نیست — همان «failed» با backoff می‌ماند. */
const SYNC_DEAD_CODES = {
  field_denied: 1, malformed_op: 1, role_denied: 1, out_of_scope: 1,
  forged_by: 1, user_mismatch: 1, school_mismatch: 1
};

const SYNC = {
  queue      : [],          /* عملیات منتظر ارسال */
  online     : (typeof navigator !== 'undefined') ? navigator.onLine !== false : true,
  syncing    : false,
  lastSync   : null,        /* آخرین همگام‌سازی موفق (ISO) */
  lastError  : null,
  attempts   : 0,
  demoMode   : true,        /* تا وقتی سرور واقعی وصل نشده */
  serverUrl  : '',          /* مثلاً '/api/sync' */
  autoTimer  : null,
  conflicts  : [],
};

/* ---------- ذخیره‌سازی صف ---------- */
function loadQueue(){
  try{ SYNC.queue = Store.getJSON(SYNC_QUEUE_KEY, []) || []; }
  catch(e){ SYNC.queue = []; }
  try{
    const m = Store.getJSON(SYNC_META_KEY, {}) || {};
    SYNC.lastSync = m.lastSync || null;
  }catch(e){}
}
function saveQueue(){
  /* در عملیات انبوه (batchWrites) ذخیره‌سازی به پایان دسته موکول می‌شود؛
     وگرنه هر عملیات کل صف را دوباره JSON.stringify می‌کند و هزینه
     درجه‌دوم می‌شود. پرچم در 03-persistence.js مدیریت می‌شود. */
  if(typeof _BATCH_DEPTH !== 'undefined' && _BATCH_DEPTH > 0){ _BATCH_QUEUE_DIRTY = true; return; }
  Store.setJSON(SYNC_QUEUE_KEY, SYNC.queue);
}
function saveSyncMeta(){
  Store.setJSON(SYNC_META_KEY, { lastSync: SYNC.lastSync });
}

/* ---------- افزودن عملیات به صف ---------- */
/* هر تغییر داده‌ای که باید به سرور برود از اینجا رد می‌شود */
function enqueueOp(op){
  const item = {
    uid       : 'op_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8),
    op        : op,
    status    : 'pending',
    tries     : 0,
    error     : null,
    created_at: new Date().toISOString(),
    user_id   : (S.user && S.user.id) || null,
    school_id : (S.user && S.user.school_id) || null,
  };
  SYNC.queue.push(item);
  saveQueue();
  refreshSyncBadge();         /* نشانگر بدون رندر کامل به‌روز شود */
  scheduleSync(400);          /* اگر آنلاین بود، خیلی زود ارسال شود */
  return item;
}

/* ---------- شمارنده‌ها ---------- */
const pendingCount  = () => SYNC.queue.filter(x => x.status === 'pending' || x.status === 'failed').length;
const conflictCount = () => SYNC.queue.filter(x => x.status === 'conflict').length;
const rejectedCount = () => SYNC.queue.filter(x => x.status === 'rejected').length;

/* ---------- تشخیص آنلاین/آفلاین ---------- */
function setOnline(v){
  const was = SYNC.online;
  SYNC.online = !!v;
  if(!was && SYNC.online){
    toast('اینترنت وصل شد — در حال ارسال تغییرات…', 'ok');
    SYNC.attempts = 0;
    scheduleSync(300);
  }else if(was && !SYNC.online){
    const n = pendingCount();
    toast(n ? `آفلاین شدید — ${fa(n)} تغییر ذخیره شد و بعداً ارسال می‌شود` : 'آفلاین شدید — تغییرات محلی ذخیره می‌شوند', 'warn');
  }
  refreshSyncBadge();
}

/* ---------- زمان‌بندی و backoff ---------- */
function scheduleSync(delay){
  clearTimeout(SYNC.autoTimer);
  SYNC.autoTimer = setTimeout(syncNow, delay || 1000);
}
function backoffDelay(){
  /* ۲ثانیه، ۴، ۸، ۱۶… تا سقف ۵ دقیقه */
  return Math.min(2000 * Math.pow(2, Math.min(SYNC.attempts, 8)), 300000);
}

/* ---------- ارسال به سرور ---------- */
async function syncNow(manual){
  if(SYNC.syncing) return;
  const batch = SYNC.queue.filter(x => x.status === 'pending' || x.status === 'failed');
  if(!batch.length){
    if(manual) toast('همه‌چیز همگام است ✓', 'ok');
    return;
  }
  if(!SYNC.online){
    if(manual) toast('اینترنت در دسترس نیست — تغییرات در صف می‌مانند', 'warn');
    return;
  }

  SYNC.syncing = true;
  SYNC.lastError = null;
  batch.forEach(x => { x.status = 'sending'; });
  saveQueue();
  refreshSyncBadge();

  try{
    const res = await sendBatch(batch);

    res.forEach(r => {
      const item = SYNC.queue.find(x => x.uid === r.uid);
      if(!item) return;
      if(r.ok){
        item.status = 'synced';
      }else if(r.conflict){
        item.status = 'conflict';
        item.error  = r.message || 'تعارض با نسخه سرور';
        item.server = r.server;
      }else if(r.code === 'duplicate_ignored'){
        /* uid قبلاً اعمال شده (ارسال دوباره پس از قطعی) — روی سرور
           همان تغییری هست که ما می‌خواستیم؛ صف را نگیراند. */
        item.status = 'synced';
      }else if(SYNC_DEAD_CODES[r.code]){
        /* ردِّ پایدار — دوباره‌ارسال بی‌فایده است (P0-2) */
        item.status = 'rejected';
        item.error  = r.message || 'رد سرور';
      }else{
        item.status = 'failed';
        item.tries += 1;
        item.error  = r.message || 'خطای نامشخص';
      }
    });

    /* موارد موفق (و duplicates) از صف حذف می‌شوند */
    SYNC.queue = SYNC.queue.filter(x => x.status !== 'synced');
    SYNC.lastSync = new Date().toISOString();
    saveSyncMeta();
    saveQueue();

    const okCount   = res.filter(r => r.ok).length;
    const deadCount = res.filter(r => !r.ok && (r.code === 'duplicate_ignored' || SYNC_DEAD_CODES[r.code])).length;
    const bad       = res.length - okCount - deadCount; /* فقط خطاهایِ قابلِ تلاشِ دوباره */
    if(okCount){
      const extra = (deadCount ? ` — ${fa(deadCount)} رد شد` : '') + (bad ? ` — ${fa(bad)} ناموفق` : '');
      if(manual || bad || deadCount) toast(`${fa(okCount)} تغییر ارسال شد${extra}`, (bad || deadCount) ? 'warn' : 'ok');
      else toast(`${fa(okCount)} تغییر همگام شد ✓`, 'ok');
    }

    SYNC.attempts = bad ? SYNC.attempts + 1 : 0;
    if(bad) scheduleSync(backoffDelay());

  }catch(err){
    /* شکست کل دسته — همه به pending برمی‌گردند تا دوباره تلاش شود */
    batch.forEach(x => { if(x.status === 'sending'){ x.status = 'failed'; x.tries += 1; x.error = err.message; } });
    SYNC.lastError = err.message;
    SYNC.attempts += 1;
    saveQueue();
    if(manual) toast('ارسال ناموفق — دوباره تلاش می‌شود', 'err');
    scheduleSync(backoffDelay());
  }finally{
    SYNC.syncing = false;
    refreshSyncBadge();
  }
}

/* ---------- ارسال واقعی یا شبیه‌سازی ----------
   🔴 TODO پیش از اتصال به سرور — احراز هویت و دادهٔ حساس
   محموله شامل کد ملی و تلفن است. پیش از فعال شدن این مسیر:
   ۱. فقط روی HTTPS با گواهی معتبر (TLS 1.2 به بالا)
   ۲. ژتون نشست در کوکی HttpOnly + Secure + SameSite=Lax
      — نه در سرآیند و نه در حافظهٔ مرورگر، تا XSS نتواند بدزددش
   ۳. سرور باید op.by را با کاربر احراز هویت‌شدهٔ ژتون بسنجد و اگر
      نخواند کل دسته را رد کند — فیلد by از مرورگر می‌آید و ادعاست
   ۴. uid تکراری دوباره اعمال نشود (ارسال دوباره پس از قطعی)
   ⚠️ کد ملی هرگز در نشانی درخواست نیاید، فقط در بدنهٔ POST — نشانی
   در گزارش سرور و حافظهٔ نهان میانی می‌ماند.
   📄 docs/SERVER_SECURITY_CONTRACT.md بندهای ۲ تا ۴ */
async function sendBatch(batch){
  if(!SYNC.demoMode && SYNC.serverUrl){
    /* ارسال از راه لایهٔ داده انجام می‌شود، نه fetch مستقیم — تا روز
       اتصال به سرور واقعی، سرآیند احراز هویت و مدیریت خطا یک‌جا در
       Api.request تعریف شود و اینجا دست نخورد.
       raw:true (P0-2): ردِ کل دسته (400/403) بدنهٔ معناداری دارد؛
       بدون raw، Api.request می‌انداخت و کل دسته برای همیشه در چرخهٔ
       «failed → retry» می‌ماند. */
    const raw = await Api.request(SYNC.serverUrl, {
      method: 'POST',
      body  : { ops: batch.map(x => ({ uid: x.uid, ...x.op })) },
      raw   : true
    });
    if(raw.status < 300){
      return (raw.body && raw.body.results) || [];
    }
    if(raw.status >= 500) throw new Error('خطای سرور ' + raw.status + ' در ' + SYNC.serverUrl);
    const code = (raw.body && raw.body.code) || 'http_' + raw.status;
    /* 401 = نشستِ ناکام — گذرا؛ بعد از ورودِ دوباره دوباره تلاش می‌شود */
    if(raw.status === 401 || code === 'no_session') throw new Error('نشست سرور معتبر نیست (401)');
    /* 400/403 = ردِّ پایدارِ کل دسته → هر op به‌صورتِ ردِ پایدار
       برمی‌گردد تا dead-letter آن را از صفِ ارسال جدا کند */
    return batch.map(x => ({ uid: x.uid, ok: false, code: code, message: (raw.body && raw.body.message) || 'رد سرور' }));
  }

  /* حالت دمو: تأخیر شبکه را شبیه‌سازی می‌کند */
  await new Promise(r => setTimeout(r, 500 + Math.random() * 700));
  if(!SYNC.online) throw new Error('اتصال قطع شد');
  return batch.map(x => ({ uid: x.uid, ok: true }));
}

/* ---------- نشانگر وضعیت در نوار بالا ---------- */
function syncBadge(){
  const n  = pendingCount();
  const cf = conflictCount();
  const rd = rejectedCount();

  if(!SYNC.online){
    return `<button class="sync-chip off" data-act="sync-panel" title="آفلاین — تغییرات ذخیره می‌شوند">
      <span class="dot"></span><span>آفلاین</span>${n ? `<span class="badge b-amber sm">${fa(n)}</span>` : ''}</button>`;
  }
  if(SYNC.syncing){
    return `<button class="sync-chip busy" data-act="sync-panel" title="در حال همگام‌سازی">
      <span class="spin"></span><span>همگام‌سازی…</span></button>`;
  }
  if(cf || rd){
    const lab = (cf && rd) ? 'تعارض و رد' : (cf ? 'تعارض' : 'رد شده');
    return `<button class="sync-chip warn" data-act="sync-panel" title="نیاز به بررسی">
      <span class="dot"></span><span>${lab}</span>${cf ? `<span class="badge b-red sm">${fa(cf)}</span>` : ''}${rd ? `<span class="badge b-red sm">${fa(rd)}</span>` : ''}</button>`;
  }
  if(n){
    return `<button class="sync-chip pend" data-act="sync-panel" title="${escAttr(fa(n))} تغییر در صف ارسال">
      <span class="dot"></span><span>در صف</span><span class="badge b-amber sm">${fa(n)}</span></button>`;
  }
  return `<button class="sync-chip ok" data-act="sync-panel" title="همه‌چیز همگام است">
    <span class="dot"></span><span>همگام</span></button>`;
}

/* فقط نشانگر را به‌روز می‌کند — بدون رندر مجدد کل صفحه */
function refreshSyncBadge(){
  const el = document.querySelector('.sync-chip');
  if(!el) return;
  const tmp = document.createElement('div');
  tmp.innerHTML = syncBadge();
  const fresh = tmp.firstElementChild;
  if(fresh) el.replaceWith(fresh);
}

/* ---------- پنجره جزئیات همگام‌سازی ---------- */
function syncPanelModal(){
  const q  = SYNC.queue;
  const n  = pendingCount();
  const cf = conflictCount();
  const rd = rejectedCount();

  const label = {
    ins: 'ثبت جدید', upd: 'ویرایش', del: 'حذف',
  };
  const collFa = {
    attendance:'حضور و غیاب', grades:'نمرات', discipline:'انضباط', users:'کاربران',
    schools:'مدارس', classes:'کلاس‌ها', subjects:'دروس', leaves:'مرخصی',
    announcements:'اطلاعیه‌ها', messages:'پیام‌ها', installments:'اقساط',
    transactions:'تراکنش‌ها', exams:'امتحانات', schedule:'برنامه هفتگی',
  };

  const statusFa = {
    pending :['در صف','b-amber'], sending:['در حال ارسال','b-blue'],
    failed  :['ناموفق','b-red'],  conflict:['تعارض','b-red'],
    rejected:['رد شده','b-red'],
  };

  const body = `
    <div class="row" style="gap:10px;margin-bottom:12px;flex-wrap:wrap">
      <span class="badge ${SYNC.online?'b-green':'b-gray'}">${SYNC.online?'🌐 آنلاین':'📴 آفلاین'}</span>
      ${n ?`<span class="badge b-amber">${fa(n)} تغییر در صف</span>`:'<span class="badge b-green">همه‌چیز همگام است</span>'}
      ${cf?`<span class="badge b-red">${fa(cf)} تعارض</span>`:''}
      ${rd?`<span class="badge b-red" title="عملیات‌هایی که سرور آن‌ها را به‌صورتِ پایدار رد کرده است — دوباره ارسال نمی‌شوند">${fa(rd)} رد شده</span>`:''}
      <div class="spacer"></div>
      <span class="small muted">آخرین همگام‌سازی: ${SYNC.lastSync?jalaliDateTime(SYNC.lastSync):'—'}</span>
    </div>

    ${!SYNC.online?`<div class="sync-note" style="margin-bottom:10px">
      بدون اینترنت هم می‌توانید کار کنید. همه‌ی تغییرات روی همین دستگاه ذخیره می‌شوند و
      به‌محض وصل شدن اینترنت، خودکار به سرور ارسال می‌گردند.</div>`:''}

    ${q.length?`<div class="table-wrap vscroll" style="max-height:320px;overflow:auto"><table>
      <thead><tr><th>عملیات</th><th>بخش</th><th>زمان</th><th>وضعیت</th></tr></thead><tbody>
      ${q.slice().reverse().map(x=>{
        const st=statusFa[x.status]||['—','b-gray'];
        return `<tr>
          <td><b>${label[x.op.t]||x.op.t}</b></td>
          <td>${esc(collFa[x.op.c]||x.op.c)}</td>
          <td class="small muted">${jalaliDateTime(x.created_at)}</td>
          <td><span class="badge ${st[1]}">${st[0]}</span>
            ${x.error?`<div class="small muted">${esc(x.error)}</div>`:''}
            ${x.tries>1?`<div class="small muted">${fa(x.tries)} تلاش</div>`:''}
            ${x.status==='rejected'?`<div style="margin-top:6px"><button class="btn ghost sm" data-act="sync-del" data-uid="${escAttr(x.uid)}" title="این عملیات دوباره ارسال نمی‌شود؛ اگر مطمئنید لازم نیست، حذفش کنید">حذف از صف</button></div>`:''}
          </td>
        </tr>`;}).join('')}
      </tbody></table></div>`
    :`<div class="empty" style="padding:24px"><span class="emoji">✅</span>
       <h4>صف ارسال خالی است</h4><div class="small">همه‌ی تغییرات با سرور همگام شده‌اند.</div></div>`}

    <div class="small muted" style="margin-top:12px">
      ${SYNC.demoMode?'⚙️ حالت دمو: سرور واقعی متصل نیست و ارسال شبیه‌سازی می‌شود.':''}
    </div>`;

  openModal(`<div class="card-head"><h3>وضعیت همگام‌سازی</h3>
      <button class="icon-btn" data-act="modal-close">✕</button></div>
    <div class="card-body">${body}</div>
    <div class="card-head" style="border-bottom:none;border-top:1px solid var(--border)">
      ${SYNC.demoMode?`<button class="btn ghost sm" data-act="sync-toggle-net">${SYNC.online?'📴 شبیه‌سازی قطع اینترنت':'🌐 شبیه‌سازی وصل شدن'}</button>`:''}
      <div class="spacer"></div>
      ${n?`<button class="btn" data-act="sync-run">🔄 ارسال همه</button>`:''}
      <button class="btn ghost" data-act="modal-close">بستن</button>
    </div>`);
}

/* تاریخ و ساعت شمسی خوانا — توجه: fa() فقط برای عدد است، نه رشته */
function jalaliDateTime(iso){
  if(!iso) return '—';
  const d = new Date(iso);
  if(isNaN(d.getTime())) return '—';
  const time = faD(String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0'));
  return isoToJalali(d.toISOString()) + ' — ' + time;
}

/* ---------- اکشن‌ها ---------- */
const SYNC_ACTIONS = {
  'sync-panel'(){ syncPanelModal(); },
  'sync-run'(){ closeModal(); syncNow(true); },
  'sync-toggle-net'(){ closeModal(); setOnline(!SYNC.online); },
  /* حذفِ دستیِ عملیاتِ «رد شده» (dead-letter) از صف.
     (SYNC_ACTIONS برخلافِ A با (el, id) فراخوانی می‌شود.) */
  'sync-del'(el){
    const uid = (el && el.dataset) ? el.dataset.uid : null;
    if(!uid) return;
    const before = SYNC.queue.length;
    SYNC.queue = SYNC.queue.filter(x => x.uid !== uid);
    if(SYNC.queue.length === before) return;
    saveQueue();
    refreshSyncBadge();
    toast('عملیاتِ ردشده از صف حذف شد', 'ok');
    syncPanelModal();
  },
};

/* ---------- راه‌اندازی ---------- */
function initSync(){
  loadQueue();
  if(typeof window !== 'undefined'){
    window.addEventListener('online',  () => setOnline(true));
    window.addEventListener('offline', () => setOnline(false));
  }
  /* اگر چیزی از جلسه‌ی قبل در صف مانده، تلاش کن بفرستی */
  if(pendingCount() && SYNC.online) scheduleSync(1500);
}
