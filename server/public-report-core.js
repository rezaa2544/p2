/* ═══════════════════════════════════════════════════════════════════
   server/public-report-core.js — هستهٔ محاسباتیِ گزارشِ عمومی (Wave 9)
   -------------------------------------------------------------------
   تابعِ خالص (store, sid) → پاسخِ تجمیعی — هم endpointِ اصلی و هم
   رشتهٔ کارِ پس‌زمینه (server/workers/heavy.js) از همین یک منبع
   استفاده می‌کنند تا نسخهٔ دومِ منطق تولید نشود. بدونِ I/O، بدونِ
   وابستگی — فقط دادهٔ JSON خالص.
   ساختارِ خروجی و رفتارِ sid نامعتبر عیناً قراردادِ C.3-security است:
   مدارسِ فعال فقط {id,name}؛ گزارش فقط شمارش/جلسات/اهداف؛ بدونِ PII.
   Runtime deps: Node stdlib only.
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

/* کلیدهای نوع جلسه از دل داده (label را کاربر از MIN_TYPES می‌گذارد —
   قانون glyph-safety: رشتهٔ فارسی در سرور نیست، هم‌ردیف bell.js) */
function meetingKeys(mins){
  const keys = [];
  const seen = new Set();
  for(const m of mins){
    const k = m.meeting_type || 'assoc';
    if(!seen.has(k)){ seen.add(k); keys.push(k); }
  }
  if(!seen.has('assoc')) keys.unshift('assoc');
  return keys;
}

/**
 * @param {object} store  اسنپ‌شات یا خودِ store (فقط دادهٔ JSON خالص)
 * @param {number|string|null} sidWanted  school_id درخواستی (نامعتبر → اولین مدرسهٔ فعال)
 * @returns {{ok:boolean, schools:Array, report:?object}}
 */
function computePublicReport(store, sidWanted){
  const schools = (store.schools || []).filter(s => s.active === 1 || s.active === true);
  const list = schools.map(s => ({ id: s.id, name: s.name }));
  let sid = Number(sidWanted) || null;
  if(!schools.some(s => s.id === sid)) sid = schools.length ? schools[0].id : null;
  if(sid === null) return { ok: true, schools: [], report: null };
  const sc = schools.find(s => s.id === sid) || {};
  const us = (store.users || []).filter(u => u.school_id === sid);
  const mins = (store.assoc_minutes || []).filter(m => m.school_id === sid && !m.archived);
  let studentCount = 0;
  let teacherCount = 0;
  for(const u of us){
    if(u.role === 'student') studentCount++;
    else if(u.role === 'teacher') teacherCount++;
  }
  /* Aggregate meeting counts and latest dates in one pass. The previous
     implementation filtered the entire meeting collection once per type and
     then sorted every type again, turning a large report into O(n²) work. */
  const meetingStats = new Map();
  for(const m of mins){
    const k = m.meeting_type || 'assoc';
    let stat = meetingStats.get(k);
    if(!stat){ stat = { n: 0, last: '' }; meetingStats.set(k, stat); }
    stat.n++;
    if(m.meeting_date && (!stat.last || String(m.meeting_date) > String(stat.last))) stat.last = m.meeting_date;
  }
  const report = {
    sid: sid,
    name: sc.name || '',
    level: sc.level || '',
    city: ((store.counties || []).find(c => c.id === sc.county_id) || {}).name || sc.city || '',
    students: studentCount,
    teachers: teacherCount,
    classes: (store.classes || []).filter(c => c.school_id === sid).length,
    meetings: meetingKeys(mins).map(k => {
      const stat = meetingStats.get(k);
      return { key: k, n: stat ? stat.n : 0, last: stat ? stat.last : '' };
    }),
    goals: (Number(sc.public_goals) === 1 || sc.public_goals === true) ? String(sc.boom_goals || '').trim() : ''
  };
  return { ok: true, schools: list, report: report };
}

module.exports = { computePublicReport, meetingKeys };
