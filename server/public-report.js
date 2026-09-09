/* ═══════════════════════════════════════════════════════════════════
   server/public-report.js — GET /api/public-report (امنیت C.3، اصلاح ۳)
   -------------------------------------------------------------------
   گزارش عمومیِ بدون ورود، دادهٔ واقعیِ سرور را از همین endpoint می‌گیرد
   (به‌جای اتکا به دادهٔ نمایشیِ دستگاه). عمداً بدون نشست است (عمومی
   بودن، ذاتِ گزارش است) پس خروجی فقط تجمیعی و از پیش تصویب‌شده است:
     - schools: فقط {id, name} مدارس فعال — برای سلکتور
     - report:  {sid, name, level, city, students, teachers, classes,
                 meetings:[{key,n,last}], goals} (برچسب نوع را کاربر می‌گذارد)
                 goals فقط وقتی متن دارد که public_goals=1 باشد
   هیچ رکورد کاربر، هیچ نام/تلفن/کدملی، هیچ شناسهٔ داخلیِ دیگری بیرون
   نمی‌آید — با ساختار، نه با امید (پدافند در عمق، هم‌ردیف bell.js).
   Runtime deps: Node stdlib only.
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
const url = require('url');

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

function createPublicReport(ctx){
  const store = ctx.store;
  const sendJson = ctx.sendJson;

  function activeSchools(){
    return (store.schools || []).filter(s => s.active === 1 || s.active === true);
  }

  async function apiPublicReport(req, res){
    const query = (url.parse(req.url, true).query) || {};
    const schools = activeSchools();
    const list = schools.map(s => ({ id: s.id, name: s.name }));
    let sid = Number(query.school_id) || null;
    if(!schools.some(s => s.id === sid)) sid = schools.length ? schools[0].id : null;
    if(sid === null) return sendJson(res, 200, { ok: true, schools: [], report: null });
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
    return sendJson(res, 200, { ok: true, schools: list, report: report });
  }

  return { apiPublicReport };
}

module.exports = { createPublicReport };
