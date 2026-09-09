/* ═══════════════════════════════════════════════════════════════════
   پیامِ «فوری / بحرانی» (بند D.3 از دستورِ جامعِ فرناز)
   ───────────────────────────────────────────────────────────────────
   یک نوعِ تازه روی همان مسیرهایِ موجود (نه مسیرِ تازه):

     • اطلاعیه/بخشنامه:  announcements.urgent = ۱  (فیلدِ تازه در مدل)
     • ابلاغِ گروهیِ اداره: notifications.type = 'urgent'  (بدون فیلدِ تازه)
     • صفِ پیامکِ اولیا:   notify_queue.kind  = 'urgent'   (بدون فیلدِ تازه)

   🔴 سه قاعدهٔ ثابتِ این ماژول:
     ۱. **فوری یعنی جلوِ صف، نه دور زدنِ اختیارِ مدیرِ مدرسه به‌طورِ
        پنهان:** ارسالِ بی‌درنگ فقط وقتی است که خودِ مدرسه پیامک را
        روشن کرده باشد (`enabled`) و تنظیمِ `urgentAutoSend` را نبسته
        باشد (پیش‌فرض: روشن). در غیر این صورت فوری فقط «جلوِ صف و
        قرمز» است و همان تأییدِ همیشگی را می‌خواهد.
     ۲. **سقفِ روزانه همچنان دیوار است:** فوری هم نمی‌تواند از سقف رد
        شود — در `notifyAutoFlush` سنجیده می‌شود.
     ۳. **پنجرهٔ اصلاح فقط وقتی کوتاه می‌شود که پیام واقعاً خودکار
        برود:** اگر قرار است دستی تأیید شود، همان مهلتِ همیشگی برای
        اصلاحِ اشتباهِ دبیر باقی می‌ماند.
   ═══════════════════════════════════════════════════════════════════ */

/** بیشینهٔ مهلتِ اصلاح برای پیامِ فوری وقتی خودکار می‌رود (دقیقه) */
var URGENT_GRACE_MIN = 2;
/** نامِ نوع در صفِ پیامک و در اعلانِ درون‌سامانه‌ای */
var URGENT_KIND = 'urgent';
/** برچسب و رنگِ یکسان در همه‌جا (اطلاعیه، اعلان، صف) */
var URGENT_BADGE = ['فوری / بحرانی', 'b-red'];

/** آیا این رکورد فوری است؟ (اطلاعیه یا اعلان یا صف) */
function isUrgent(x){ return !!(x && (x.urgent === 1 || x.urgent === true || x.type === URGENT_KIND || x.kind === URGENT_KIND)); }

/** نشانِ htmlِ فوری — یک شکل در همهٔ صفحه‌ها */
function urgentBadge(extra){
  return '<span class="badge ' + URGENT_BADGE[1] + '"' + (extra ? ' ' + extra : '')
    + '>🚨 ' + URGENT_BADGE[0] + '</span>';
}

/* ─────────────── اولویت در صف (۰ = فوری، ۱ = اصلاحیه، ۲ = بقیه) ─────────────── */
function notifyPriority(q){
  if(!q) return 2;
  if(q.kind === URGENT_KIND && !q.correction_of) return 0;
  if(q.correction_of) return 1;
  return 2;
}
/** مقایسه‌کنندهٔ صف: فوری ← اصلاحیه ← بقیه (درون هر دسته: قدیمی‌تر اول) */
function notifyQueueCmp(a, b){
  var pa = notifyPriority(a), pb = notifyPriority(b);
  if(pa !== pb) return pa - pb;
  return String(a.created_at || '').localeCompare(String(b.created_at || ''));
}

/* ─────────────── تنظیم: ارسالِ بی‌درنگِ فوری‌ها ─────────────── */
/**
 * آیا پیام‌هایِ فوریِ این مدرسه بدون تأییدِ دستی می‌روند؟
 * پیش‌نیاز: خودِ پیامک روشن باشد (`enabled`) — وگرنه هیچ پیامی ساخته
 * نمی‌شود و این تنظیم بی‌اثر است.
 */
function notifyUrgentAutoOn(cfg){
  cfg = cfg || {};
  return !!cfg.enabled && cfg.urgentAutoSend !== false;
}
/** مهلتِ مؤثرِ اصلاح برای یک رکوردِ صف */
function notifyUrgentWindow(cfg, q){
  var grace = Number(cfg && cfg.graceMinutes);
  if(isNaN(grace)) grace = 20;
  if(q && q.kind === URGENT_KIND && notifyUrgentAutoOn(cfg)) return Math.min(grace, URGENT_GRACE_MIN);
  return grace;
}

/* ─────────────── تولید: ابلاغِ فوری به اولیای یک مدرسه ─────────────── */
/**
 * یک رکوردِ «فوری» در صفِ پیامک برای همهٔ اولیایِ مدرسه می‌سازد.
 * برمی‌گرداند: {created, parents, reason}
 *   reason: 'disabled' | 'kind-off' | 'duplicate' | 'no-parent' | …
 * ⚠️ این تابع پیام نمی‌فرستد — فقط در صف می‌گذارد (هم‌قراردادِ بقیه).
 */
function notifyUrgentToSchool(schoolId, body, opts){
  opts = opts || {};
  var cfg = notifySettings(schoolId);
  if(!cfg.enabled) return { created: 0, parents: 0, reason: 'disabled' };
  if(cfg.kinds[URGENT_KIND] === false) return { created: 0, parents: 0, reason: 'kind-off' };
  if(!body || String(body).length < 5) return { created: 0, parents: 0, reason: 'short-body' };

  var ref = 'urgent:' + schoolId + ':' + String(opts.source_ref || (todayISO() + ':' + Date.now()));
  var dup = (db.notify_queue || []).some(function(q){
    return q.kind === URGENT_KIND && q.source_ref === ref &&
           q.status !== 'rejected' && q.status !== 'cancelled';
  });
  if(dup) return { created: 0, parents: 0, reason: 'duplicate' };

  var ids = [];
  db.users.filter(function(u){
    return u.role === 'student' && u.school_id === schoolId && (u.status || 'active') === 'active';
  }).forEach(function(s){
    notifyParentsOf(s.id).forEach(function(pid){ if(ids.indexOf(pid) < 0) ids.push(pid); });
  });
  if(!ids.length) return { created: 0, parents: 0, reason: 'no-parent' };

  var rec = notifyRequest({
    school_id: schoolId,
    kind: URGENT_KIND,
    parent_ids: ids,
    body: String(body).slice(0, 300),
    source_ref: ref
  });
  if(!rec) return { created: 0, parents: 0, reason: (notifyRequest && notifyRequest.lastSkip) || 'rejected' };
  /* فوری مجوزِ ارسالِ خودکار می‌گیرد — حتی اگر autoSend خاموش باشد.
     بشرطِ همان تنظیمی که مدیر می‌تواند ببندد. */
  if(notifyUrgentAutoOn(cfg) && !rec.auto) update('notify_queue', rec.id, { auto: 1 });
  return { created: 1, parents: ids.length, reason: null, id: rec.id };
}

/** متنِ پیامکِ فوری با نشانِ «فوری» در ابتدا (زیر ۷۰ نویسه می‌ماند) */
function urgentSmsBody(text){
  var t = String(text || '').trim();
  return ('🚨 ' + t).slice(0, 300);
}
