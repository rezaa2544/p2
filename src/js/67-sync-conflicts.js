/* ═══════════════════════════════════════════════════════════════════
   R95 (بند ۲.۵) — تعارض‌هایِ همگام‌سازی (حالت سروری)
   ═══════════════════════════════════════════════════════════════════
   وقتی دو کاربر هم‌زمان یک رکوردِ نسخه‌دار (نمره/حضور/انضباط) را
   عوض کنند، سرور تغییرِ دیرهنگام را اعمال نمی‌کند و در sync_conflicts
   «حفظ» می‌کند (server/sync.js). این ماژول فهرستِ تعارض‌ها را از
   /api/sync/conflicts می‌گیرد و مدیر/سوپرادمین هر دو نسخه (سرور در
   برابرِ کلاینت) را روبه‌رو می‌بیند و داوری می‌کند:
     «پذیرشِ تغییرِ کلاینت»  → incoming روی سرور اعمال + نسخه +۱
     «نگه‌داشتنِ وضعیتِ سرور» → رکورد دست‌نخورده می‌ماند
   داوری POST /api/sync/resolve-conflict است (نه عملیاتِ همگام‌سازی)؛
   سرور دوباره مجوز و دامنهٔ مدرسه را می‌سنجد.
   ═══════════════════════════════════════════════════════════════════ */

var SC_REFRESH_MS = 30000;      /* پُلِ دوره‌ای — مثلِ بِل، فقط وقتی کارت هست */
var _scTimer = null;
var _scInFlight = false;

function syncConflictsEligible(){
  return (typeof DATA_MODE !== 'undefined' && DATA_MODE === 'server')
    && (typeof S !== 'undefined' && S.user)
    && (S.user.role === 'manager' || S.user.role === 'superadmin');
}

/* برچسب‌هایِ فارسیِ فیلدها برایِ نمایشِ روبه‌رویِ هم (سایر فیلدها به انگلیسی) */
function _scLabel(k){
  const m = {
    student_id:'دانش‌آموز', subject_id:'درس', score:'نمره', status:'وضعیت',
    kind:'نوع', points:'امتیاز', reason:'توضیح', day:'روز', date:'تاریخ',
    school_id:'مدرسه', class_id:'کلاس', period:'زنگ'
  };
  return m[k] || k;
}
function _scCell(v){
  if(v == null || v === '') return '—';
  if(typeof v === 'number') return fa(v);
  return esc(String(v));
}
function _scRows(d){
  const skip = new Set(['id','version','base_version','created_at','updated_at','by','at','school_id']);
  const keys = Object.keys(d || {}).filter(k => !skip.has(k));
  if(!keys.length) return '<div class="muted small">—</div>';
  return keys.map(k =>
    `<div class="row" style="padding:3px 0;align-items:center"><span class="muted small">${esc(_scLabel(k))}</span><div class="spacer"></div><b>${_scCell(d[k])}</b></div>`
  ).join('');
}
function _scStudentName(d){
  const sid = d && d.student_id;
  if(sid == null || typeof byId !== 'function') return null;
  const u = byId('users', Number(sid));
  return (u && u.full_name) ? u.full_name : null;
}

function syncConflictsInner(conflicts){
  if(!conflicts.length)
    return '<div class="card-body" style="padding-top:12px"><div class="muted small" style="padding:6px 0">تعارضی نیست — همهٔ تغییرات بی‌دردسر همگام شده‌اند.</div></div>';
  const open = conflicts.filter(c => c.status === 'open');
  const done = conflicts.filter(c => c.status !== 'open').slice(-5).reverse();
  const cards = open.map(c => {
    const inc = c.incoming || {};
    const name = _scStudentName(inc.data);
    return `<div style="background:var(--surface-2);border-radius:12px;padding:12px;margin-top:10px">
      <div class="row" style="align-items:center">
        <span class="badge b-red">در انتظار داوری</span>
        <b>${esc(c.collection || 'رکورد')} · ${fa(c.record_id)}</b>
        <span class="muted small">${name ? 'دانش‌آموز: ' + esc(name) : ''}</span>
        <div class="spacer"></div>
        <span class="muted small">${c.created_at ? jalali(c.created_at) : ''}</span>
      </div>
      <div class="grid g2" style="margin-top:10px;align-items:start">
        <div style="background:var(--surface);border-radius:10px;padding:10px">
          <div class="muted small" style="margin-bottom:4px">🖥️ وضعیتِ فعلیِ سرور${c.server_state ? ' (نسخهٔ ' + fa(c.server_version) + ')' : ''}</div>
          ${c.server_state ? _scRows(c.server_state) : '<div class="muted small">رکورد روی سرور وجود ندارد (حذف شده)</div>'}
        </div>
        <div style="background:var(--surface);border-radius:10px;padding:10px">
          <div class="muted small" style="margin-bottom:4px">📱 تغییری که همگام نشد</div>
          ${inc.data ? _scRows(inc.data) : '<div class="muted small">—</div>'}
        </div>
      </div>
      <div class="row" style="margin-top:10px;align-items:center">
        <span class="muted small">داوری:</span>
        <button class="btn sm" data-act="conflict-resolve" data-cid="${c.id}" data-winner="incoming">پذیرشِ تغییرِ کلاینت</button>
        <button class="btn ghost sm" data-act="conflict-resolve" data-cid="${c.id}" data-winner="server">نگه‌داشتنِ وضعیتِ سرور</button>
      </div>
    </div>`;
  }).join('');
  const doneHtml = done.length
    ? `<details style="margin-top:12px"><summary class="muted small">داوری‌های اخیر (${fa(done.length)})</summary>
        ${done.map(c => `<div class="row" style="padding:4px 0;align-items:center"><span class="muted small">${esc(c.collection || '')} · ${fa(c.record_id)}</span><div class="spacer"></div>
          <span class="badge ${c.winner === 'incoming' ? 'b-green' : 'b-blue'}">${c.winner === 'incoming' ? 'تغییرِ کلاینت اعمال شد' : 'وضعیتِ سرور نگه داشته شد'}</span>
          ${c.resolved_at ? '<span class="muted small">' + jalali(c.resolved_at) + '</span>' : ''}</div>`).join('')}
      </details>`
    : '';
  return `<div class="card-body" style="padding-top:4px">${cards}${doneHtml}</div>`;
}

async function syncConflictsFetch(){
  const j = await Api.get('/api/sync/conflicts');
  if(!j || j.ok !== true || !Array.isArray(j.conflicts)) throw new Error('invalid_response');
  return j.conflicts;
}

function syncConflictsRender(conflicts){
  const root = document.getElementById('sync-conflicts-root');
  if(root) root.innerHTML = syncConflictsInner(conflicts);
}

async function syncConflictsTick(){
  if(!syncConflictsEligible()) return;
  if(!document.getElementById('sync-conflicts-root')) return;
  if(_scInFlight) return;
  _scInFlight = true;
  try{
    syncConflictsRender(await syncConflictsFetch());
  }catch(err){
    const root = document.getElementById('sync-conflicts-root');
    if(root) root.innerHTML = '<div class="card-body" style="padding-top:12px"><div class="muted small">خواندنِ تعارض‌ها ممکن نشد — با وصلِ سرور دوباره تلاش می‌شود.</div></div>';
  }finally{
    _scInFlight = false;
  }
}

/** پُلِ دوره‌ای — آیدمپتان؛ از hookِ پس‌رندر (24-edu-office.js) صدا زده می‌شود */
function syncConflictsEnsure(){
  if(!syncConflictsEligible()){
    if(_scTimer){ clearInterval(_scTimer); _scTimer = null; }
    return;
  }
  syncConflictsTick();
  if(!_scTimer) _scTimer = setInterval(syncConflictsTick, SC_REFRESH_MS);
}

/** داوری — POST /api/sync/resolve-conflict (مجوز و دامنه را سرور می‌سنجد) */
async function syncConflictsResolve(cid, winner){
  try{
    const j = await Api.post('/api/sync/resolve-conflict', { conflict_id: Number(cid), winner });
    if(!j || j.ok !== true) throw new Error((j && j.msg) || 'resolve_failed');
    toast(winner === 'incoming' ? 'تغییرِ کلاینت روی سرور اعمال شد' : 'وضعیتِ سرور نگه داشته شد', 'ok');
    syncConflictsTick();
  }catch(err){
    toast('داوریِ تعارض انجام نشد: ' + (err && err.message || err), 'err', { icon:'warn', sticky:true });
  }
}
