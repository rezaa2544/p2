/* ═══════════════════════════════════════════════════════════════════
   75-staff-gap.js — بند د.۴: کمبود نیروی انسانی (نیازسنجی دبیر)
   ───────────────────────────────────────────────────────────────────
   هنجار: `staff_posts` = { school_id, subject_id, required } — فقط
   سوپرادمین و کارشناس اداره تعیین می‌کنند (دروازهٔ سمت سرور هم دارد).

   موجود: برای هر مدرسه+درس، شمارِ معلمانِ متمایزی که در اسلات‌های
   برنامهٔ هفتگی آن درس تدریس می‌کنند.

   شکاف = موردنیاز − موجود (کمتر از صفر نمایش داده نمی‌شود؛ مازاد جدا).
   هنجارِ تعریف‌نشده ⇒ «تعریف نشده» — هرگز صفرِ ساختگی نمایش نمی‌دهیم.

   دامنه: فقط مدارسِ محدودهٔ کارشناس (officeScopeSchools)؛ سوپرادمین همه.
   تجمیع شهرستان/استان در بالای نما؛ مدرسه‌ها در ادامه با جدولِ تفکیکِ درس.
   ═══════════════════════════════════════════════════════════════════ */

const SGAP_RED = 2;   /* شکاف ۲+ = قرمز */

function staffGapIndex(){
  const have = {};  /* have[schoolId][subjectId] = Set(teacher_id) */
  for (const sl of db.schedule || []){
    if (sl.school_id == null || sl.subject_id == null || sl.teacher_id == null) continue;
    if (!have[sl.school_id]) have[sl.school_id] = {};
    if (!have[sl.school_id][sl.subject_id]) have[sl.school_id][sl.subject_id] = new Set();
    have[sl.school_id][sl.subject_id].add(sl.teacher_id);
  }
  const norm = {};  /* norm[schoolId][subjectId] = required */
  const postId = {}; /* postId[schoolId:subjectId] = رکورد هنجار */
  for (const p of db.staff_posts || []){
    if (p.school_id == null || p.subject_id == null) continue;
    if (!norm[p.school_id]) norm[p.school_id] = {};
    norm[p.school_id][p.subject_id] = Math.max(0, Number(p.required) || 0);
    postId[p.school_id + ':' + p.subject_id] = p.id;
  }
  return { have: have, norm: norm, postId: postId };
}

function staffGapRows(school, idx){
  const hv = idx.have[school.id] || {}, nm = idx.norm[school.id] || {};
  const subs = new Set();
  Object.keys(hv).forEach(k => subs.add(Number(k)));
  Object.keys(nm).forEach(k => subs.add(Number(k)));
  const out = [];
  subs.forEach(sid => {
    const subj = byId('subjects', sid);
    const haveC = hv[sid] ? hv[sid].size : 0;
    const req = (nm[sid] != null) ? nm[sid] : null;
    const gap = req == null ? null : Math.max(0, req - haveC);
    out.push({ sid: sid, subj: subj, have: haveC, req: req, gap: gap, surplus: req != null && haveC > req });
  });
  out.sort((a, b) => {
    const ra = a.gap == null ? -1 : a.gap, rb = b.gap == null ? -1 : b.gap;
    return rb - ra || String((a.subj || {}).name || a.sid).localeCompare(String((b.subj || {}).name || b.sid), 'fa');
  });
  return out;
}

function sgapStatus(row){
  if (row.req == null) return ['تعریف نشده', 'b-gray'];
  if (row.gap >= SGAP_RED) return ['کمبود شدید', 'b-red'];
  if (row.gap === 1) return ['کمبود', 'b-amber'];
  if (row.surplus) return ['مازاد', 'b-purple'];
  return ['کامل', 'b-green'];
}

function regionStaffGapRows(schools, idx){
  /* تجمیع شهرستان/استان — در بالای نما */
  const agg = {};
  schools.forEach(s => {
    const o = officeForSchool ? officeForSchool(s) : null;
    const key = o ? (o.county_id ? 'شهرستان ' + (((db.counties || []).find(c => c.id === o.county_id) || {}).name || fa(o.county_id))
                                 : 'استان ' + (((db.provinces || []).find(p => p.id === o.province_id) || {}).name || fa(o.province_id)))
                  : 'سایر';
    const a = agg[key] || (agg[key] = { schools: 0, have: 0, need: 0, gap: 0, undefined: 0 });
    const rows = staffGapRows(s, idx);
    a.schools++;
    rows.forEach(r => {
      a.have += r.have;
      if (r.req != null) a.need += r.req;
      if (r.gap != null) a.gap += r.gap; else a.undefined++;
    });
  });
  return Object.keys(agg).map(k => Object.assign({ name: k }, agg[k]))
    .sort((a, b) => b.gap - a.gap || b.schools - a.schools);
}

function viewStaffGap(){
  const u = S.user;
  if (u.role !== 'superadmin' && u.role !== 'edu_office') return viewForbidden();
  const o = officeOf(u);
  const schools = officeScopeSchools(o, S.filters);
  const idx = staffGapIndex();
  const canEdit = u.role === 'superadmin' || u.role === 'edu_office';

  let totGap = 0, totUndefined = 0, schoolsWithGap = 0, complete = 0;
  schools.forEach(s => {
    const rows = staffGapRows(s, idx);
    let g = 0, ucount = 0;
    rows.forEach(r => { if (r.gap != null) g += r.gap; else ucount++; });
    totGap += g; totUndefined += ucount;
    if (g > 0) schoolsWithGap++; else if (rows.length && !ucount) complete++;
  });

  const agg = regionStaffGapRows(schools, idx);

  return `<div class="card" style="margin-bottom:14px;background:linear-gradient(120deg,var(--primary-soft),#fff)">
    <div class="card-body"><div class="row">
      <div><b style="font-size:15px">🧩 کمبود نیروی انسانی ${o ? esc(o.name) : 'کل کشور'}</b>
        <div class="small muted">موجود از برنامهٔ هفتگی (معلمانِ متمایز هر درس) · «تعریف نشده» یعنی هنجار ندارد، نه صفر</div></div>
      <div class="spacer"></div></div>
      ${filterPanel('staffgap', '')}
    </div></div>
  <div class="grid g4" style="margin-bottom:14px">
    ${statCard('🧩', fa(totGap), 'جمع شکاف', 'red')}
    ${statCard('🏫', fa(schoolsWithGap), 'مدرسه دارای کمبود', 'amber')}
    ${statCard('✅', fa(complete), 'مدرسه کامل', 'green')}
    ${statCard('❔', fa(totUndefined), 'درس بدون هنجار', 'blue')}
  </div>
  ${agg.length ? `<div class="card"><div class="card-head"><h3>تجمیع شهرستان / استان</h3></div><div class="card-body">
    <table class="table"><thead><tr><th>منطقه</th><th>مدارس</th><th>موجود</th><th>موردنیاز</th><th>شکاف</th><th>بدون هنجار</th></tr></thead><tbody>
    ${agg.map(a => `<tr><td>${esc(a.name)}</td><td>${fa(a.schools)}</td><td>${fa(a.have)}</td><td>${fa(a.need)}</td>
      <td>${a.gap ? `<span class="badge ${a.gap >= SGAP_RED ? 'b-red' : 'b-amber'}">${fa(a.gap)}</span>` : '<span class="badge b-green">۰</span>'}</td>
      <td>${a.undefined ? `<span class="badge b-gray">${fa(a.undefined)}</span>` : '—'}</td></tr>`).join('')}
    </tbody></table></div></div>` : ''}
  ${schools.length ? `<div class="card"><div class="card-head"><h3>وضعیت به تفکیک مدرسه و درس</h3>${canEdit ? '<span class="small muted">برای تعیین نیاز روی ✏️ بزنید</span>' : ''}</div><div class="card-body" style="display:grid;gap:14px">
    ${schools.map(s => {
      const rows = staffGapRows(s, idx);
      if (!rows.length) return `<div class="card" style="padding:14px;box-shadow:none"><b>${esc(s.name)}</b> <span class="badge b-gray">بدون دادهٔ تدریس و هنجار</span></div>`;
      const g = rows.reduce((t, r) => t + (r.gap || 0), 0);
      return `<div class="card" style="padding:14px;box-shadow:none">
        <div class="row"><b>${esc(s.name)}</b>${g ? `<span class="badge ${g >= SGAP_RED ? 'b-red' : 'b-amber'}">شکاف ${fa(g)}</span>` : '<span class="badge b-green">بدون شکاف</span>'}<div class="spacer"></div><span class="small muted">${fa(rows.length)} درس فعال/هنجارد</span></div>
        <table class="table" style="margin-top:8px"><thead><tr><th>درس</th><th>موجود</th><th>موردنیاز</th><th>شکاف</th><th>وضعیت</th>${canEdit ? '<th></th>' : ''}</tr></thead><tbody>
        ${rows.map(r => { const st = sgapStatus(r);
          return `<tr><td>${r.subj ? esc(r.subj.name) : fa(r.sid)}</td><td>${fa(r.have)}</td>
            <td>${r.req == null ? '<span class="small muted">تعریف نشده</span>' : fa(r.req)}</td>
            <td>${r.gap == null ? '—' : r.gap ? `<b style="color:var(--red)">${fa(r.gap)}</b>` : fa(0)}</td>
            <td><span class="badge ${st[1]}">${st[0]}</span>${r.surplus ? ' <span class="small muted">(' + fa(r.have - r.req) + '+)</span>' : ''}</td>
            ${canEdit ? `<td><button class="icon-btn" title="تعیین نیاز" data-act="staffgap-norm" data-id="${s.id}:${r.sid}">✏️</button>${idx.postId[s.id + ':' + r.sid] ? ` <button class="icon-btn danger" title="حذف هنجار" data-act="staffpost-del" data-id="${escAttr(idx.postId[s.id + ':' + r.sid])}">🗑️</button>` : ''}</td>` : ''}</tr>`; }).join('')}
        </tbody></table></div>`; }).join('')}
  </div></div>` : empty('🏫', 'مدرسه‌ای در این محدوده نیست', 'فیلترها را تغییر دهید.')}`;
}

/* ── تعیین هنجار (فقط سوپرادمین و کارشناس اداره) ── */
function staffGapNormModal(schoolId, subjectId){
  const idx = staffGapIndex();
  const subj = byId('subjects', subjectId);
  const school = byId('schools', schoolId);
  const cur = (idx.norm[schoolId] || {})[subjectId];
  openModal(modalTpl('تعیین نیروی موردنیاز',
    `${f('مدرسه', `<div class="input" style="background:var(--surface-2)">${esc(school ? school.name : fa(schoolId))}</div>`)}
     ${f('درس', `<div class="input" style="background:var(--surface-2)">${subj ? esc(subj.name) : fa(subjectId)}</div>`)}
     ${f('تعداد دبیر موردنیاز *', inp('sg_req', cur == null ? '' : String(cur), 'number'))}
     <div class="small muted">موجود از برنامهٔ هفتگی (معلمانِ متمایزِ این درس) محاسبه می‌شود. عدد ۰ = حذف نیاز نیست؛ برای حذف از 🗑️ استفاده کنید.</div>
     <input type="hidden" id="sg_key" value="${schoolId}:${subjectId}">`, 'staffpost-save'));
}

const STAFFGAP_ACTIONS = {
  'staffgap-norm'(el, id){
    const parts = String(id).split(':');
    staffGapNormModal(Number(parts[0]), Number(parts[1]));
  },
  'staffpost-save'(){
    const key = V('sg_key');
    const parts = String(key).split(':');
    const schoolId = Number(parts[0]), subjectId = Number(parts[1]);
    if (!schoolId || !subjectId) { toast('درس نامعتبر است', 'err'); return; }
    const raw = V('sg_req');
    const required = Number(raw);
    if (raw === '' || !Number.isFinite(required) || required < 0 || required !== Math.floor(required) || required > 500) {
      toast('تعداد موردنیاز باید عدد صحیح بین ۰ تا ۵۰۰ باشد', 'err'); return;
    }
    const existing = (db.staff_posts || []).find(p => p.school_id === schoolId && p.subject_id === subjectId);
    if (existing) update('staff_posts', existing.id, { required: required });
    else insert('staff_posts', { school_id: schoolId, subject_id: subjectId, required: required, created_at: todayISO() });
    closeModal(); toast('هنجار ذخیره شد', 'ok'); render();
  },
  'staffpost-del'(el, id){
    askDelete('هنجار نیروی این درس حذف شود؟ (مدرسه «تعریف نشده» می‌شود)', () => {
      remove('staff_posts', Number(id)); toast('هنجار حذف شد', 'ok'); render();
    });
  }
};

/* ── دادهٔ نمونه: چند هنجار با شکاف عمدی ── */
function generateStaffPostDemo(){
  if (!db.schools || !db.schools.length) return;
  if (!db.staff_posts) db.staff_posts = [];
  if (db.staff_posts.length) return;
  let added = 0;
  for (const s of db.schools.slice(0, 6)){
    const taught = {};
    (db.schedule || []).forEach(sl => { if (sl.school_id === s.id && sl.subject_id != null) taught[sl.subject_id] = (taught[sl.subject_id] || new Set()); if (sl.school_id === s.id && sl.teacher_id != null && taught[sl.subject_id]) taught[sl.subject_id].add(sl.teacher_id); });
    const subs = Object.keys(taught).map(Number);
    subs.slice(0, 4).forEach((sid, i) => {
      const have = taught[sid].size;
      const required = (i % 2 === 0) ? have + 1 : have;   /* یک در میان: کمبود/کامل */
      add('staff_posts', { school_id: s.id, subject_id: sid, required: required, created_at: todayISO() });
      added++;
    });
  }
  if (added) console.log('[demo] staff_posts: ' + fa(added) + ' هنجار نمونه ساخته شد');
}
