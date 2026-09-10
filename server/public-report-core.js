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
  for(const m of mins){
    const k = m.meeting_type || 'assoc';
    if(keys.indexOf(k) === -1) keys.push(k);
  }
  if(keys.indexOf('assoc') === -1) keys.unshift('assoc');
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
  const report = {
    sid: sid,
    name: sc.name || '',
    level: sc.level || '',
    city: ((store.counties || []).find(c => c.id === sc.county_id) || {}).name || sc.city || '',
    students: us.filter(u => u.role === 'student').length,
    teachers: us.filter(u => u.role === 'teacher').length,
    classes: (store.classes || []).filter(c => c.school_id === sid).length,
    meetings: meetingKeys(mins).map(k => {
      const ms = mins.filter(m => (m.meeting_type || 'assoc') === k);
      const last = ms.map(m => m.meeting_date).filter(Boolean).sort().slice(-1)[0] || '';
      return { key: k, n: ms.length, last: last };
    }),
    goals: (Number(sc.public_goals) === 1 || sc.public_goals === true) ? String(sc.boom_goals || '').trim() : ''
  };
  return { ok: true, schools: list, report: report };
}

module.exports = { computePublicReport, meetingKeys };
