/* ═══════════════════════════════════════════════════════════════════
   تولید خودکار برنامهٔ هفتگی (E.6)
   - schedGenerate(plan): هستهٔ خالص و قطعی (بدون db) — ورودی/خروجیِ دادهٔ ساده
   - ترتیب: تخصص‌دارها اول، بعد حریصانه با پراکندگیِ روزانه + پس‌گردِ تک‌سطحی
   - تداخلِ دبیر سراسری است (existing همهٔ رکوردهای schedule)؛ تداخلِ کلاس درونی
   - درسِ بدونِ متخصص: teacher_id=null («بدون دبیر») + گزارش — نه دبیرِ تصادفی
   - ثبت فقط در خانه‌های خالی است (رونویسی نمی‌کند) و با پیش‌نمایش + تأییدِ مدیر
   ═══════════════════════════════════════════════════════════════════ */

/**
 * plan = {
 *   classes:  [{id, grade, field}],
 *   subjects: [{id, grade, field, weekly_hours}],
 *   teachers: [{id, subject_id}],
 *   existing: [{class_id, teacher_id, day, period}],  // همهٔ رکوردها (تداخلِ دبیر سراسری)
 *   days: [0..5], periodsPerDay: 6
 * }
 * خروجی: { placements: [{class_id, subject_id, teacher_id, day, period}],
 *           unplaced:   [{class_id, subject_id, teacher_id, reason}],
 *           stats: {demands, placed, unplaced, noSpecialist} }
 */
function schedGenerate(plan){
  plan = plan || {};
  var classes = plan.classes || [];
  var subjects = plan.subjects || [];
  var teachers = plan.teachers || [];
  var existing = plan.existing || [];
  var days = (plan.days && plan.days.length) ? plan.days.slice() : [0, 1, 2, 3, 4, 5];
  var PPD = plan.periodsPerDay || 6;

  function subjMatch(sub, cls){
    if(sub.grade && cls.grade && sub.grade !== cls.grade) return false;
    if(sub.field && cls.field && sub.field !== cls.field) return false;
    return true;
  }
  var specOf = {}; /* subject_id -> [teacher_id...] */
  subjects.forEach(function(s){
    specOf[s.id] = teachers
      .filter(function(t){ return t.subject_id === s.id; })
      .map(function(t){ return t.id; })
      .sort(function(a, b){ return a - b; });
  });
  var load = {}; /* teacher_id -> شمارِ تخصیص */
  teachers.forEach(function(t){ load[t.id] = 0; });
  existing.forEach(function(r){
    if(r.teacher_id != null) load[r.teacher_id] = (load[r.teacher_id] || 0) + 1;
  });

  /* اشغال‌ها */
  var classBusy = {};   /* class_id|day|period */
  var teacherBusy = {}; /* teacher_id|day|period */
  existing.forEach(function(r){
    classBusy[r.class_id + '|' + r.day + '|' + r.period] = 1;
    if(r.teacher_id != null) teacherBusy[r.teacher_id + '|' + r.day + '|' + r.period] = 1;
  });

  /* پوششِ فعلی: هر کلاس × درس چند زنگ دارد؟ (اجرایِ دوباره نباید دوبرابر کند) */
  var covered = {}; /* class_id|subject_id -> n */
  existing.forEach(function(r){
    if(r.subject_id == null) return;
    var k = r.class_id + '|' + r.subject_id;
    covered[k] = (covered[k] || 0) + 1;
  });
  /* تقاضاها: هر کلاس × درس‌های هم‌خوان × (weekly_hours − پوششِ فعلی) */
  var demands = [];
  classes.forEach(function(cls){
    subjects.forEach(function(sub){
      if(!subjMatch(sub, cls)) return;
      var h = Math.max(0, Math.floor(Number(sub.weekly_hours) || 0));
      h = Math.max(0, h - (covered[cls.id + '|' + sub.id] || 0));
      for(var i = 0; i < h; i++) demands.push({ class_id: cls.id, subject_id: sub.id });
    });
  });
  /* تخصص‌دارها اول؛ بعد ساعتِ بیشتر؛ بعد id (قطعی) */
  demands.sort(function(a, b){
    var sa = (specOf[a.subject_id] || []).length ? 0 : 1;
    var sb = (specOf[b.subject_id] || []).length ? 0 : 1;
    if(sa !== sb) return sa - sb;
    var ha = 0, hb = 0;
    for(var i = 0; i < subjects.length; i++){
      if(subjects[i].id === a.subject_id) ha = subjects[i].weekly_hours || 0;
      if(subjects[i].id === b.subject_id) hb = subjects[i].weekly_hours || 0;
    }
    if(ha !== hb) return hb - ha;
    if(a.class_id !== b.class_id) return a.class_id - b.class_id;
    return a.subject_id - b.subject_id;
  });

  function pickTeacher(subId){
    var cands = (specOf[subId] || []).slice().sort(function(a, b){
      return ((load[a] || 0) - (load[b] || 0)) || (a - b);
    });
    return cands.length ? cands[0] : null;
  }
  /* روزهایِ دارایِ این درس برای این کلاس (پراکندگی) */
  var classSubjDays = {}; /* class_id|subject_id -> {day:1} */
  existing.forEach(function(r){
    if(r.subject_id == null) return;
    var k = r.class_id + '|' + r.subject_id;
    (classSubjDays[k] = classSubjDays[k] || {})[r.day] = 1;
  });
  function slotFree(classId, teacherId, d, p){
    if(classBusy[classId + '|' + d + '|' + p]) return false;
    if(teacherId != null && teacherBusy[teacherId + '|' + d + '|' + p]) return false;
    return true;
  }
  function findSlot(classId, teacherId, subId){
    var k = classId + '|' + subId;
    var used = classSubjDays[k] || {};
    var pass, d, p;
    for(pass = 0; pass < 2; pass++){
      for(var di = 0; di < days.length; di++){
        d = days[di];
        if(pass === 0 && used[d]) continue; /* گذرِ اول: روزی که این درس را ندارد */
        for(p = 1; p <= PPD; p++){
          if(slotFree(classId, teacherId, d, p)) return { day: d, period: p };
        }
      }
    }
    return null;
  }

  var placements = [];
  var unplaced = [];
  var noSpecialist = 0;

  function commit(pl){
    placements.push(pl);
    classBusy[pl.class_id + '|' + pl.day + '|' + pl.period] = 1;
    if(pl.teacher_id != null){
      teacherBusy[pl.teacher_id + '|' + pl.day + '|' + pl.period] = 1;
      load[pl.teacher_id] = (load[pl.teacher_id] || 0) + 1;
    }
    var k = pl.class_id + '|' + pl.subject_id;
    (classSubjDays[k] = classSubjDays[k] || {})[pl.day] = 1;
  }
  function uncommit(pl){
    var i = placements.indexOf(pl);
    if(i >= 0) placements.splice(i, 1);
    delete classBusy[pl.class_id + '|' + pl.day + '|' + pl.period];
    if(pl.teacher_id != null){
      delete teacherBusy[pl.teacher_id + '|' + pl.day + '|' + pl.period];
      load[pl.teacher_id] = Math.max(0, (load[pl.teacher_id] || 1) - 1);
    }
    /* classSubjDays را نگه می‌داریم (محافظه‌کارانه — فقط پراکندگی است) */
  }
  /* پس‌گردِ تک‌سطحی: جابه‌جاییِ یکی از زنگ‌هایِ همین کلاس برای بازکردنِ جا */
  function displace(classId, teacherId, subId){
    for(var i = 0; i < placements.length; i++){
      var victim = placements[i];
      if(victim.class_id !== classId) continue;
      uncommit(victim);
      var alt = findSlot(victim.class_id, victim.teacher_id, victim.subject_id);
      if(alt && (alt.day !== victim.day || alt.period !== victim.period)){
        var mine = findSlot(classId, teacherId, subId);
        if(mine){
          victim.day = alt.day; victim.period = alt.period;
          commit(victim);
          return mine;
        }
      }
      commit(victim); /* برگردان — قربانیِ بعدی */
    }
    return null;
  }

  demands.forEach(function(dm){
    var tid = pickTeacher(dm.subject_id);
    if(tid == null) noSpecialist++;
    var slot = findSlot(dm.class_id, tid, dm.subject_id);
    if(!slot) slot = displace(dm.class_id, tid, dm.subject_id);
    if(slot){
      commit({ class_id: dm.class_id, subject_id: dm.subject_id, teacher_id: tid, day: slot.day, period: slot.period });
    }else{
      unplaced.push({
        class_id: dm.class_id, subject_id: dm.subject_id, teacher_id: tid,
        reason: tid == null ? 'جایِ خالی برای کلاس نیست' : 'جایِ خالیِ مشترک برای کلاس و دبیر نیست'
      });
    }
  });

  return {
    placements: placements, unplaced: unplaced,
    stats: { demands: demands.length, placed: placements.length, unplaced: unplaced.length, noSpecialist: noSpecialist }
  };
}

/* ── پوششِ db + پیش‌نمایش + ثبت ─────────────────────────────────── */

function schedgenPlanForSchool(schoolId){
  var days = (typeof workDaysOf === 'function' ? workDaysOf(schoolId) : [0, 1, 2, 3, 4, 5])
    .filter(function(d){ return (typeof isSchoolDay === 'function' ? isSchoolDay(d) : (d >= 0 && d <= 4)); });
  if(!days.length) days = [0, 1, 2, 3, 4];
  return {
    classes: db.classes.filter(function(c){ return c.school_id === schoolId; })
      .map(function(c){ return { id: c.id, grade: c.grade, field: c.field }; }),
    subjects: (db.subjects || []).filter(function(s){ return s.school_id === schoolId; })
      .map(function(s){ return { id: s.id, grade: s.grade, field: s.field, weekly_hours: s.weekly_hours }; }),
    teachers: db.users.filter(function(u){ return u.role === 'teacher' && u.school_id === schoolId && (u.active == null || u.active === 1); })
      .map(function(t){ return { id: t.id, subject_id: t.subject_id }; }),
    existing: (db.schedule || []).map(function(r){
      return { class_id: r.class_id, teacher_id: r.teacher_id, subject_id: r.subject_id, day: r.day, period: r.period };
    }),
    days: days, periodsPerDay: 6
  };
}

function schedgenPreviewModal(schoolId){
  var plan = schedgenPlanForSchool(schoolId);
  var res = schedGenerate(plan);
  window._schedgen = { school_id: schoolId, res: res };
  var byClass = {};
  res.placements.forEach(function(p){
    (byClass[p.class_id] = byClass[p.class_id] || { n: 0, un: [] }).n++;
  });
  res.unplaced.forEach(function(p){
    var b = (byClass[p.class_id] = byClass[p.class_id] || { n: 0, un: [] });
    b.un.push(p);
  });
  var clsIds = Object.keys(byClass).map(Number).sort(function(a, b){ return a - b; });
  var body = '<div class="small muted" style="margin-bottom:10px">'
    + 'تقاضا: ' + fa(res.stats.demands) + ' زنگ · قابلِ ثبت: ' + fa(res.stats.placed)
    + ' · تعیین‌نشده: ' + fa(res.stats.unplaced)
    + (res.stats.noSpecialist ? ' · بدونِ دبیرِ متخصص: ' + fa(res.stats.noSpecialist) + ' (با «بدون دبیر» ثبت می‌شود)' : '')
    + '<br>ثبت فقط در خانه‌های خالی انجام می‌شود؛ برنامهٔ فعلی دست‌نخورده می‌ماند.</div>'
    + (clsIds.length ? '<div style="display:grid;gap:8px;max-height:50vh;overflow:auto">' + clsIds.map(function(cid){
        var b = byClass[cid];
        var c = byId('classes', cid) || {};
        return '<div style="border:1px solid var(--border);border-radius:8px;padding:8px 10px">'
          + '<div class="row" style="gap:8px"><b>' + esc(c.name || ('کلاس ' + cid)) + '</b>'
          + '<span class="badge b-green">' + fa(b.n) + ' زنگ</span>'
          + (b.un.length ? '<span class="badge b-red">' + fa(b.un.length) + ' تعیین‌نشده</span>' : '') + '</div>'
          + (b.un.length ? '<div class="small" style="margin-top:6px;line-height:2">' + b.un.map(function(u){
              var s = byId('subjects', u.subject_id) || {};
              return '<div>⚠️ ' + esc(s.name || ('درس ' + u.subject_id)) + ' — ' + esc(u.reason) + '</div>';
            }).join('') + '</div>' : '')
          + '</div>';
      }).join('') + '</div>' : '<div class="small muted">تقاضایی نیست (درسِ هم‌خوانی با کلاس‌ها پیدا نشد).</div>');
  openModal(modalTpl('⚙️ پیش‌نمایشِ تولید خودکار — ' + esc((byId('schools', schoolId) || {}).name || ''), body, 'schedgen-apply'));
}

/** ثبتِ پیش‌نمایش: فقط خانه‌هایِ هنوز-خالی + دبیرِ هنوز-آزاد */
function schedgenApply(){
  var g = window._schedgen;
  if(!g || !g.res) return { ok: false, msg: 'پیش‌نمایشی نیست' };
  var u = S.user;
  var role = (typeof activePersona === 'function') ? activePersona() : u.role;
  if(role !== 'manager' && role !== 'superadmin') return { ok: false, msg: 'فقط مدیر می‌تواند ثبت کند' };
  var n = 0, skip = 0;
  g.res.placements.forEach(function(p){
    if(db.schedule.some(function(x){ return x.class_id === p.class_id && x.day === p.day && x.period === p.period; })){ skip++; return; }
    if(p.teacher_id != null && (typeof teacherBusyAt === 'function') && teacherBusyAt(p.teacher_id, p.day, p.period, 0)){ skip++; return; }
    insert('schedule', {
      school_id: g.school_id, class_id: p.class_id, subject_id: p.subject_id,
      teacher_id: p.teacher_id, day: p.day, period: p.period
    });
    n++;
  });
  window._schedgen = null;
  var msg = fa(n) + ' زنگ ثبت شد' + (skip ? ' (' + fa(skip) + ' پرشده بود و رد شد)' : '')
    + (g.res.unplaced.length ? '؛ ' + fa(g.res.unplaced.length) + ' زنگ تعیین‌نشده ماند' : '');
  return { ok: true, msg: msg };
}
