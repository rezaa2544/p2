/* ═══════════════════════════════════════════════════════════════════
   server/tenancy.js — مدلِ رسمیِ مالکیتِ چندسطحی (P0-07 ؛ تک‌منبع)
   -------------------------------------------------------------------
   سلسله‌مراتبِ رسمی:
     national (superadmin)
       └── province  (اداره کل استان)
            └── county    (اداره شهرستان)
                 └── district   (اداره منطقه)
                      └── school     (مدرسه)

   این ماژول LEAF است (بدونِ require) تا هم policy.js و هم sync.js و هم
   middleware/scope.js بدونِ چرخه از آن استفاده کنند. آینهٔ سمتِ سرورِ
   officeOf/officeScopeSchools در src/js/24-edu-office.js است.

   fail-closed: ادارهٔ بدونِ office معتبر/فعال ⇒ قلمروِ خالی (دسترسیِ صفر).
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

const LEVELS = ['national', 'province', 'county', 'district', 'school'];

function officeOf(store, user){
  if(!store || !user || user.office_id == null) return null;
  const o = (store.offices || []).find(x => x.id === Number(user.office_id));
  if(!o || !o.active) return null;
  return o;
}

/* سطحِ قلمروِ کاربر: national برایِ superadmin، سطحِ اداره برایِ
   edu_office، و school برایِ نقش‌هایِ مدرسه‌ای. */
function tenancyLevel(store, user){
  if(!user) return null;
  if(user.role === 'superadmin') return 'national';
  if(user.role === 'edu_office'){
    const o = officeOf(store, user);
    if(!o) return null;
    if(o.level === 'province' || o.level === 'county' || o.level === 'district') return o.level;
    return null;
  }
  return 'school';
}

/* شناسهٔ مدارسِ داخلِ قلمروِ اداره (province/county/district).
   خروجیِ [] یعنی «هیچ مدرسه‌ای» — نه «همه». */
function officeSchoolIds(store, user){
  const o = officeOf(store, user);
  if(!o || !store) return [];
  const schools = store.schools || [];
  if(o.level === 'province' && o.province_id != null)
    return schools.filter(s => Number(s.province_id) === Number(o.province_id)).map(s => s.id);
  if(o.level === 'county' && o.county_id != null)
    return schools.filter(s => Number(s.county_id) === Number(o.county_id)).map(s => s.id);
  if(o.level === 'district' && o.district_id != null)
    return schools.filter(s => Number(s.district_id) === Number(o.district_id)).map(s => s.id);
  return [];
}

function inOfficeScope(store, user, schoolId){
  if(schoolId == null) return false;
  const ids = officeSchoolIds(store, user);
  return ids.indexOf(Number(schoolId)) > -1;
}

/* استخراجِ school_id از رویِ رکورد/داده (برایِ نقش‌هایی که school_idِ
   نشست ندارند، مثلِ edu_office): رکورد، بعد data، بعد زنجیرهٔ
   student → enrollment → class → school. null = نامشخص = رد. */
function resolveSchoolId(store, coll, recId, data){
  if(!store || !coll) return null;
  const col = store[coll] || [];
  const rec = recId != null ? col.find(x => x.id === Number(recId)) : null;
  if(rec && rec.school_id != null) return Number(rec.school_id);
  if(data && data.school_id != null) return Number(data.school_id);
  const sid = rec && rec.student_id != null ? rec.student_id
    : (data && data.student_id != null ? data.student_id : null);
  if(sid != null){
    const enr = (store.enrollments || []).find(e => e.student_id === Number(sid));
    const cls = enr && (store.classes || []).find(c => c.id === enr.class_id);
    if(cls && cls.school_id != null) return Number(cls.school_id);
    const stu = (store.users || []).find(u => u.id === Number(sid));
    if(stu && stu.school_id != null) return Number(stu.school_id);
  }
  if(coll === 'users' && recId != null){
    const u = (store.users || []).find(x => x.id === Number(recId));
    if(u && u.school_id != null) return Number(u.school_id);
  }
  return null;
}

module.exports = {
  LEVELS,
  officeOf,
  tenancyLevel,
  officeSchoolIds,
  inOfficeScope,
  resolveSchoolId,
};
