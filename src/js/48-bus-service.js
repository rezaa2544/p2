/* ═══════════════════════════════════════════════════════════════════
   سرویس مدرسه — نسخهٔ بدون جی‌پی‌اس (مورد ۴.۵ نقشه‌راه، سبک)

   مدیر مدرسه مسیر تعریف می‌کند: نام + راننده (نقش «راننده سرویس»)
   + دانش‌آموزان مسیر (هر دانش‌آموز در یک مسیر). راننده در پنل
   «مسیر من» لیست دانش‌آموزان را می‌بیند و برای هرکدام دکمهٔ
   «سوار شد» / «پیاده شد» می‌زند. با هر کلیک:
     ۱. رویداد در جدول bus_events ثبت می‌شود (وقت دقیق + ثبت‌کننده)
     ۲. از صف پیام اولیا، پیامک به خانواده می‌رود (همان قرارداد)

   بدون جی‌پی‌اس، بدون نقشهٔ زنده — فقط این دو رویداد.
   هر دانش‌آموز در هر تاریخ در نهایت در یک مسیر سوار است؛
   «روی سرویس بودن» = آخرین رویدادش «سوار» باشد و بعدش «پیاده»
   نخورد.

   🔴 امنیت: راننده فقط مسیر خودش را می‌بیند و فقط برای مسیر خودش
   ثبت می‌کند. بررسی در busEvent() روی خودِ داده تکرار می‌شود —
   کنترل سمت کلاینت مجوزدهی نیست (30-authz).
   ═══════════════════════════════════════════════════════════════════ */

var BUS_EVENT_FA = { on:'سوار شد', off:'پیاده شد' };

/** همهٔ مسیرهای یک مدرسه */
function busRoutesOf(schoolId){
  return db.bus_routes.filter(function(r){ return r.school_id===schoolId; });
}

/** دانش‌آموزان یک مسیر (شیء کاربر) */
function busStudentsOf(routeId){
  return db.bus_students
    .filter(function(x){ return x.route_id===routeId; })
    .map(function(x){ return byId('users',x.student_id); })
    .filter(Boolean);
}

/** مسیری که یک دانش‌آموز در آن ثبت شده (حداکثر یکی) */
function busRouteOfStudent(studentId){
  var x = null;
  for(var i=0;i<db.bus_students.length;i++){
    if(db.bus_students[i].student_id===studentId){ x=db.bus_students[i]; break; }
  }
  return x ? byId('bus_routes',x.route_id) : null;
}

/** مسیری که یک راننده آن را می‌رانَد (حداکثر یکی) */
function busRouteOfDriver(driverId){
  for(var i=0;i<db.bus_routes.length;i++){
    if(db.bus_routes[i].driver_id===driverId) return db.bus_routes[i];
  }
  return null;
}

/** رویدادهای یک مسیر برای یک تاریخ، تازه‌ترین اول */
function busEventsOf(routeId, dateIso){
  var d = dateIso || todayISO();
  return db.bus_events
    .filter(function(e){ return e.route_id===routeId && (e.at||'').slice(0,10)===d; })
    .sort(function(a,b){ return (b.at||'').localeCompare(a.at||''); });
}

/** آیا دانش‌آموز همین الان روی سرویس است؟ (null = هنوز رویدادی ندارد) */
function busOnBoard(studentId){
  var evs = db.bus_events
    .filter(function(e){ return e.student_id===studentId; })
    .sort(function(a,b){ return (a.at||'').localeCompare(b.at||''); });
  if(!evs.length) return null;
  return evs[evs.length-1].type === 'on';
}

/* ─────────────── عمل اصلی ─────────────── */

/**
 * ثبت رویداد سوار/پیاده شدن + پیامک به خانواده.
 * @param {number} studentId
 * @param {'on'|'off'} type
 * @returns {{ok:boolean,msg?:string,rec?:object}}
 */
function busEvent(studentId, type, source){
  if(type!=='on' && type!=='off') return {ok:false,msg:'نوع رویداد نامعتبر است'};
  var route = busRouteOfStudent(studentId);
  if(!route) return {ok:false,msg:'این دانش‌آموز در هیچ مسیری ثبت نشده است'};
  var u = S.user;
  var role = (typeof activePersona==='function') ? activePersona() : u.role;
  /* 🔴 راننده فقط مالک مسیر است؛ مدیر/سوپرادمین به‌جای او ثبت می‌کند.
     دانش‌آموز فقط رویدادِ خودش را ثبت می‌کند (بند ۱۱ — ثبت دوسویه).
     هر نقش دیگر — حتی با شناسهٔ درست دانش‌آموز — رد می‌شود. */
  var allowed, src;
  if(role==='student'){ allowed = (u.id===studentId); src = 'student'; }
  else if(role==='driver'){ allowed = (route.driver_id===u.id); src = source||'driver'; }
  else if(role==='manager' || role==='superadmin'){ allowed = true; src = source||'manager'; }
  else allowed = false;
  if(!allowed) return {ok:false,msg:'شما اجازهٔ ثبت این رویداد را ندارید'};
  var st = byId('users',studentId);
  if(!st) return {ok:false,msg:'دانش‌آموز یافت نشد'};
  var at = new Date().toISOString();
  var rec = insert('bus_events',{
    school_id: route.school_id,
    route_id:  route.id,
    student_id: studentId,
    type:      type,
    at:        at,
    by:        u.id,
    source:    src
  });
  /* پیامک از همان صف پیام اولیا (enabled/kinds را خودِ صف کنترل می‌کند) */
  if(typeof notifyRequest==='function'){
    var kind = type==='on' ? 'bus_on' : 'bus_off';
    var what = type==='on' ? 'به سرویس مدرسه سوار شد' : 'از سرویس مدرسه پیاده شد';
    notifyRequest({
      school_id:   route.school_id,
      kind:        kind,
      student_id:  studentId,
      student_name: st.full_name,
      body: 'اولیای گرامی، ' + st.full_name + ' ' + what + ' (' +
            fa(at.slice(11,16)) + '). ' + notifySchoolName(route.school_id),
      source_ref:  'bus:' + studentId + ':' + type + ':' + at
    });
  }
  return {ok:true, rec:rec};
}

/* ─────────────── نمای مدیر: مدیریت سرویس ─────────────── */

function busRouteBlock(r){
  var studs = busStudentsOf(r.id);
  var evs = busEventsOf(r.id);
  var h = '<div class="card"><div class="card-head" style="flex-wrap:wrap;gap:8px">'
    + '<h3>🚌 '+esc(r.name)+'</h3>'
    + '<span class="muted small">راننده: <b>'+esc((byId('users',r.driver_id)||{}).full_name||'تعریف نشده')+'</b></span>'
    + '<div class="spacer"></div>'
    + '<button class="btn ghost sm" data-act="bus-students" data-id="'+r.id+'">🎒 دانش‌آموزان مسیر</button>'
    + '<button class="btn ghost sm" data-act="bus-route-del" data-id="'+r.id+'">حذف مسیر</button>'
    + '</div><div class="card-body" style="display:grid;gap:14px">';
  h += '<div><div class="small muted" style="margin-bottom:6px">'+fa(studs.length)+' دانش‌آموز در این مسیر:</div>'
    + (studs.length
        ? '<div style="display:flex;flex-wrap:wrap;gap:6px">'
          + studs.map(function(s){
              var on = busOnBoard(s.id);
              var mm = busMismatch(s.id);
              return '<span class="badge '+(mm.key==='conflict'?'b-red':on===true?'b-green':on===false?'b-gray':'b-blue')+'">'
                + esc(s.full_name)
                + (on===true?' 🚌':on===false?'':'')
                + (mm.key==='conflict'?' ⚠️':mm.key==='pending'?' ⏳':'')
                + '</span>';
            }).join('') + '</div>'
        : empty('🎒','دانش‌آموزی به مسیر اضافه نشده','دکمهٔ «دانش‌آموزان مسیر» را بزنید.'))
    + '</div>';
  h += '<div><div class="small muted" style="margin-bottom:6px">رویدادهای امروز ('+fa(evs.length)+'):</div>'
    + (evs.length
        ? '<div class="table-wrap"><table><thead><tr><th>ساعت</th><th>دانش‌آموز</th><th>رویداد</th></tr></thead><tbody>'
          + evs.map(function(e){
              return '<tr><td class="muted">'+fa(e.at.slice(11,16))+'</td>'
                + '<td>'+esc((byId('users',e.student_id)||{}).full_name||'—')+'</td>'
                + '<td><span class="badge '+(e.type==='on'?'b-green':'b-blue')+'">'
                  + (e.type==='on'?'🚌 ':'🏫 ')+BUS_EVENT_FA[e.type]+'</span></td></tr>';
            }).join('') + '</tbody></table></div>'
        : '<div class="small muted">هنوز امروز رویدادی ثبت نشده است.</div>')
    + '</div>';
  var confl = busConflictsOf(r.id);
  if(confl.length){
    h += '<div class="small" style="border:1px solid var(--red);background:rgba(225,29,72,.06);border-radius:10px;padding:10px 12px">'
      + '⚠️ <b>مغایرت سوار/پیاده امروز ('+fa(confl.length)+')</b>: '
      + confl.map(function(c){ return esc(c.student.full_name); }).join('، ')
      + ' — برای پیگیری، تب «سرویس» پروندهٔ دانش‌آموز را ببینید.</div>';
  }
  h += busSchematicHtml(r.id);
  return h + '</div></div>';
}

function viewBusService(){
  var sid = S.user.school_id;
  var routes = busRoutesOf(sid);
  var h = '<div class="page-head"><h2>🚌 سرویس مدرسه</h2>'
    + '<button class="btn" data-act="bus-route-new">➕ مسیر جدید</button></div>'
    + '<div class="small muted" style="margin-bottom:14px">'
    + 'نسخهٔ بدون جی‌پی‌اس: راننده از پنل «مسیر من» دکمهٔ سوار/پیاده می‌زند و برای خانواده پیامک می‌رود. '
    + 'راننده‌ها مثل سایر کادرها در بخش «دبیران و دانش‌آموزان» با نقش «راننده سرویس» تعریف می‌شوند.'
    + '</div>';
  if(!routes.length){
    return h + '<div class="card">'+empty('🚌','هنوز مسیری تعریف نشده',
      'مسیر جدید بسازید، راننده و دانش‌آموزان آن را مشخص کنید.')+'</div>';
  }
  routes.forEach(function(r){ h += busRouteBlock(r); });
  h += busNeedsCard(sid);
  return h;
}

/** کارت «پاسخ اولیا» — آیا سرویس لازم است؟ (بند ۱۱) */
function busNeedsCard(sid){
  var studs = db.users.filter(function(x){
    return x.role==='student' && x.school_id===sid && (x.status||'active')==='active';
  }).sort(function(a,b){ return (a.full_name||'').localeCompare(b.full_name||'', 'fa'); });
  var needs = busNeedsOf(sid);
  var notAnswered = studs.filter(function(st){ return !busNeedOf(st.id); }).length;
  var h = '<div class="card"><div class="card-head" style="flex-wrap:wrap;gap:8px">'
    + '<h3>🙋 پاسخ اولیا — نیاز به سرویس</h3>'
    + '<span class="badge b-gray">پاسخ‌داده‌شده: ' + fa(needs.length) + '/' + fa(studs.length) + '</span>'
    + (notAnswered ? '<span class="badge b-red">بدون پاسخ: ' + fa(notAnswered) + '</span>' : '<span class="badge b-green">همه پاسخ دادند</span>')
    + '<div class="spacer"></div><span class="small muted">پاسخ «بر عهدهٔ مدرسه» = باید به مسیری افزوده شود</span>'
    + '</div><div class="card-body">';
  if(!studs.length) return h + empty('🙋','دانش‌آموزی نیست','') + '</div></div>';
  h += '<div class="table-wrap"><table><thead><tr><th>دانش‌آموز</th><th>پاسخ</th><th>وضعیت مسیر</th><th></th></tr></thead><tbody>'
    + studs.map(function(st){
        var n = busNeedOf(st.id);
        var r = busRouteOfStudent(st.id);
        var badge = n
          ? '<span class="badge ' + (n.answer==='school'?'b-blue':n.answer==='self'?'b-amber':'b-gray') + '">' + BUS_NEED_FA[n.answer] + '</span>'
          : '<span class="badge b-red">هنوز پاسخ نداد</span>';
        var stt = r ? '<span class="muted small">' + esc(r.name) + '</span>' : '<span class="muted small">—</span>';
        return '<tr><td>' + esc(st.full_name) + '</td><td>' + badge + '</td><td>' + stt + '</td>'
          + '<td class="c"><button class="btn ghost sm" data-act="bus-need-set" data-id="' + st.id + '">ثبت/ویرایش پاسخ</button></td></tr>';
      }).join('')
    + '</tbody></table></div>';
  return h + '</div></div>';
}

function busNeedModal(studentId){
  var st = byId('users', studentId);
  if(!st) return;
  var n = busNeedOf(studentId);
  openModal(modalTpl('پاسخ سرویس — ' + st.full_name,
    '<div style="display:grid;gap:6px">'
    + ['none','self','school'].map(function(k){
        return '<label class="row" style="gap:8px;cursor:pointer;padding:8px 10px;border:1px solid var(--border);border-radius:10px">'
          + '<input type="radio" name="bus_need_m" value="' + k + '"' + (n&&n.answer===k?' checked':'') + '/>'
          + '<span class="small">' + BUS_NEED_FA[k] + '</span></label>';
      }).join('')
    + '</div>'
    + f('یادداشت (اختیاری)', inp('bus_need_note', n?n.note||'':'')),
    'bus-need-save'));
  window._busNeedStudent = studentId;
}

/* ─────────────── نمای راننده: مسیر من ─────────────── */

function viewMyService(){
  var u = S.user;
  var route = busRouteOfDriver(u.id);
  if(!route){
    return '<div class="card">'+empty('🚌','مسیری به شما واگذار نشده',
      'مدرسه باید شما را رانندهٔ یک مسیر کند.')+'</div>';
  }
  var studs = busStudentsOf(route.id);
  var evs = busEventsOf(route.id);
  var h = '<div class="page-head"><h2>🚌 مسیر من — '+esc(route.name)+'</h2></div>';
  if(!studs.length){
    return h + '<div class="card">'+empty('🎒','دانش‌آموزی در مسیر شما نیست',
      'دبیر مدرسه باید دانش‌آموزان مسیر را مشخص کند.')+'</div>';
  }
  h += '<div class="card"><div class="card-head"><h3>دانش‌آموزان مسیر</h3>'
    + '<span class="badge b-blue">'+fa(studs.length)+' نفر</span></div><div class="card-body">';
  h += '<div style="display:grid;gap:8px">'
    + studs.map(function(s){
        var on = busOnBoard(s.id);
        var state = on===true
          ? '<span class="badge b-green">🚌 روی سرویس</span>'
          : on===false
            ? '<span class="badge b-gray">🏫 پیاده شده</span>'
            : '<span class="badge b-blue">هنوز رویدادی ندارد</span>';
        var mm2 = busMismatch(s.id);
        return '<div class="row" style="background:var(--surface-2);border-radius:10px;padding:10px 14px;flex-wrap:wrap;gap:8px">'
          + '<b>'+esc(s.full_name)+'</b>'
          + '<span class="muted small">'+esc((classOf(s.id)||{}).name||'')+'</span>'
          + (mm2.key==='conflict' ? '<span class="badge b-red">⚠️ مغایرت — بررسی کنید</span>' : mm2.key==='pending' ? '<span class="badge b-amber">⏳ در انتظار تأیید دانش‌آموز</span>' : '')
          + state
          + '<div class="spacer"></div>'
          + '<button class="btn sm" data-act="bus-event" data-id="'+s.id+'" data-t="on">🚌 سوار شد</button>'
          + '<button class="btn ghost sm" data-act="bus-event" data-id="'+s.id+'" data-t="off">🏫 پیاده شد</button>'
          + '</div>';
      }).join('')
    + '</div></div></div>';
  h += '<div class="card"><div class="card-head"><h3>📍 موقعیت روی مسیر</h3></div><div class="card-body">'
    + '<div class="small muted" style="margin-bottom:8px">پیشرفتِ خودرو روی مسیر را مشخص کنید و بفرستید (ولی در پروندهٔ فرزند می‌بیندش). جی‌پی‌اسِ واقعی: بعداً (قفل ۱۱.۱).</div>'
    + '<div class="row" style="gap:8px;flex-wrap:wrap;align-items:center">'
    + '<input type="range" id="bus_loc_pos" min="0" max="100" value="0" style="width:160px" oninput="busLocValUpdate(this)" />'

    + '<span id="bus_loc_val" class="badge b-gray">0٪</span>'
    + '<button class="btn sm" data-act="bus-loc-driver">📍 موقعیت را بفرست</button></div>'
    + busSchematicHtml(route.id)
    + '</div></div>';
  h += '<div class="card"><div class="card-head"><h3>رویدادهای امروز</h3>'
    + '<span class="badge b-blue">'+fa(evs.length)+'</span></div><div class="card-body">'
    + (evs.length
        ? '<div style="display:grid;gap:6px">'
          + evs.map(function(e){
              return '<div class="row" style="gap:10px"><span class="muted small" style="flex:none">'+fa(e.at.slice(11,16))+'</span>'
                + '<b>'+esc((byId('users',e.student_id)||{}).full_name||'—')+'</b>'
                + '<span class="badge '+(e.type==='on'?'b-green':'b-blue')+'">'
                + (e.type==='on'?'🚌 سوار شد':'🏫 پیاده شد')+'</span></div>';
            }).join('') + '</div>'
        : '<div class="small muted">هنوز امروز رویدادی ثبت نشده است.</div>')
    + '</div></div>';
  return h;
}

/* ─────────────── مودال‌ها ─────────────── */

function busRouteModal(r){
  r = r || {name:'', driver_id:'', school_id:S.user.school_id};
  var drivers = db.users.filter(function(x){
    return x.role==='driver' && x.school_id===S.user.school_id && x.active;
  });
  openModal(modalTpl(r.id?'ویرایش مسیر':'مسیر جدید',
    f('نام مسیر *', inp('br_name', r.name))
    + f('راننده', sel('br_driver',
        [['','— بدون راننده —']].concat(drivers.map(function(d){ return [d.id,d.full_name]; })),
        r.driver_id)),
    'bus-route-save'));
  window._busRoute = r;
}

function busStudentsModal(routeId){
  var route = byId('bus_routes',routeId);
  if(!route) return;
  var sid = route.school_id;
  var inRoute = {};
  db.bus_students.forEach(function(b){ if(b.route_id===routeId) inRoute[b.student_id]=true; });
  var studs = db.users.filter(function(x){
    return x.role==='student' && x.school_id===sid && (x.status||'active')==='active';
  });
  openModal(modalTpl('دانش‌آموزان مسیر — '+route.name,
    '<div class="small muted" style="margin-bottom:10px">دانش‌آموزانی که به این مسیر سوار می‌شوند. هر دانش‌آموز فقط در یک مسیر می‌تواند باشد؛ اگر در مسیر دیگری باشد، غیرفعال می‌ماند.</div>'
    + '<div class="vscroll" style="max-height:280px;overflow:auto;display:grid;gap:4px;padding-inline-end:4px">'
    + studs.map(function(s){
        var checked = !!inRoute[s.id];
        var other = !checked && busRouteOfStudent(s.id);
        return '<label class="row" style="gap:8px;padding:5px 8px;border-radius:8px;'
          + (other?'opacity:.45;pointer-events:none':'cursor:pointer') + '">'
          + '<input type="checkbox" class="bs-chk" value="'+s.id+'"'+(checked?' checked':'')+'/>'
          + '<span>'+esc(s.full_name)
          + ' <span class="muted small">('+esc((classOf(s.id)||{}).name||'—')+')'
          + (other?' — در مسیر دیگر':'')+'</span></label>';
      }).join('')
    + '</div>',
    'bus-students-save'));
  window._busRouteId = routeId;
}

/* ─────────────── دادهٔ نمونه (قطعی، فقط دمو) ─────────────── */

/**
 * یک راننده + یک مسیر + چهار دانش‌آموز + دو رویداد امروز برای مدرسهٔ اول.
 * با add() نوشته می‌شود تا دفترچهٔ عملیات پر نشود (الگوی generateP12).
 */
function generateBusDemo(){
  if(db.bus_routes.length) return;
  var sc = db.schools.filter(function(s){ return s.active; })[0];
  if(!sc) return;
  var drv = db.users.filter(function(x){
    return x.role==='driver' && x.school_id===sc.id;
  })[0];
  if(!drv){
    drv = add('users',{
      school_id:sc.id, role:'driver',
      full_name:(typeof pick==='function')?pick(MALE)+' '+pick(LAST):'علی رضایی',
      username:'driver1', phone:'', active:1
    });
  }
  var route = add('bus_routes',{
    school_id:sc.id, name:'مسیر ۱ — شهرک غرب', driver_id:drv.id, created_at:todayISO()
  });
  var studs = db.users.filter(function(x){
    return x.role==='student' && x.school_id===sc.id && (x.status||'active')==='active';
  }).slice(0,4);
  studs.forEach(function(s){
    add('bus_students',{route_id:route.id, student_id:s.id});
  });
  if(studs.length){
    var _ev0 = add('bus_events',{school_id:sc.id, route_id:route.id, student_id:studs[0].id,
      type:'on', at:todayISO()+'T07:12:00.000Z', by:drv.id, source:'driver'});
  }
  if(studs.length>1){
    add('bus_events',{school_id:sc.id, route_id:route.id, student_id:studs[1].id,
      type:'on', at:todayISO()+'T07:15:00.000Z', by:drv.id, source:'driver'});
    add('bus_events',{school_id:sc.id, route_id:route.id, student_id:studs[1].id,
      type:'off', at:todayISO()+'T08:05:00.000Z', by:drv.id, source:'driver'});
    /* بند ۱۱: مغایرت — دانش‌آموز می‌گوید هنوز سوار است */
    add('bus_events',{school_id:sc.id, route_id:route.id, student_id:studs[1].id,
      type:'on', at:todayISO()+'T08:10:00.000Z', by:studs[1].id, source:'student'});
  }
  /* بند ۱۱: پاسخ اولیا */
  if(!db.bus_needs.length){
    var moreStuds = db.users.filter(function(x){
      return x.role==='student' && x.school_id===sc.id && (x.status||'active')==='active' && studs.indexOf(x)<0;
    });
    if(studs.length>=2){
      add('bus_needs',{school_id:sc.id, student_id:studs[0].id, answer:'school', set_by:0, set_at:new Date().toISOString(), note:''});
      add('bus_needs',{school_id:sc.id, student_id:studs[1].id, answer:'school', set_by:0, set_at:new Date().toISOString(), note:''});
    }
    if(moreStuds.length){
      add('bus_needs',{school_id:sc.id, student_id:moreStuds[0].id, answer:'self', set_by:0, set_at:new Date().toISOString(), note:'خودمان آژیره داریم'});
      if(moreStuds.length>1) add('bus_needs',{school_id:sc.id, student_id:moreStuds[1].id, answer:'none', set_by:0, set_at:new Date().toISOString(), note:''});
    }
  }
  /* بند ۱۱: موقعیت روی مسیر */
  if(!db.bus_locations.length){
    add('bus_locations',{route_id:route.id, student_id:0, source:'driver', pos:60, lat:'', lng:'',
      recorded_at:todayISO()+'T07:40:00.000Z', by:drv.id});
    if(studs.length>1) add('bus_locations',{route_id:route.id, student_id:studs[1].id, source:'student', pos:60, lat:'', lng:'',
      recorded_at:todayISO()+'T07:42:00.000Z', by:studs[1].id});
  }
}

/* ═══════════════════════════════════════════════════════════════════
   افزودۀ بند ۱۱ — امنیت سرویس (درخواست اولیا)

   ۱. نیاز سرویس از دید ولی (سه حالت، حتماً باید پرسیده شود):
        none   = لازم ندارد
        self   = لازم دارد، ولی خودم تهیه می‌کنم
        school = لازم دارد و بر عهدهٔ مدرسه است
     ولی از تب «سرویس» پروندهٔ فرزند خودش می‌تواند پاسخ بدهد؛
     مدیر هم (مثلاً پس از تماس تلفنی) می‌تواند ثبت/به‌روزرسانی کند.
     جدول: bus_needs{school_id, student_id, answer, set_by, set_at, note}
     (یک ردیف برای هر دانش‌آموز — upsert)

   ۲. ثبتِ دوسویهٔ سوار/پیاده: راننده از «مسیر من» و دانش‌آموز از
     تب «سرویس» پروندهٔ خودش دکمه می‌زند (source: 'driver'/'student'/'manager').
     مغایرت = آخرین رویدادِ سمت راننده و سمت دانش‌آموزِ همان روز
     نوعِ متفاوت دارد (یکی بگوید سوار و دیگری پیاده) → busMismatch
     با کلید 'conflict' برمی‌گردد و در پنل‌ها با ⚠️ نشان می‌خورد.
     «پیگیری» کاملِ مغایرت (نوت/بستن) قفل ۱۱.۲ است.

   ۳. موقعیت روی مسیر (شماتیک — بدون جی‌پی‌اسِ واقعی):
     جدول bus_locations{route_id, student_id (0=خودرو), source,
     pos (0-100 روی مسیر), lat, lng, recorded_at, by}
     راننده از پنلِ خودش و دانش‌آموز از تبِ سرویس «موقعیت بفرست»
     می‌زند؛ ولی در تبِ سرویس فرزندش شماتیکِ مسیر + آخرین نقطه را
     می‌بیند. ستون‌های lat/lng برای جی‌پی‌اسِ واقعی رزرو شده‌اند
     (قفل ۱۱.۱) — نسخهٔ کنونی فقط pos شماتیک می‌فرستد.
   ═══════════════════════════════════════════════════════════════════ */

var BUS_NEED_FA = {
  none: 'سرویس لازم ندارد',
  self: 'لازم دارد — خود خانواده تهیه می‌کند',
  school: 'لازم دارد — بر عهدهٔ مدرسه'
};

function busNeedOf(studentId){
  for(var i=0;i<db.bus_needs.length;i++)
    if(db.bus_needs[i].student_id===studentId) return db.bus_needs[i];
  return null;
}
function busNeedsOf(schoolId){
  return db.bus_needs.filter(function(n){ return n.school_id===schoolId; });
}

/**
 * ثبت/به‌روزرسانی پاسخ «آیا سرویس لازم است؟»
 * مجاز: مدیر/سوپرادمین (مدرسهٔ خودش) یا ولی (فقط فرزند خودش).
 * @param {number} studentId
 * @param {'none'|'self'|'school'} answer
 * @param {string} [note]
 */
function busNeedSet(studentId, answer, note){
  var u = S.user;
  var role = (typeof activePersona==='function') ? activePersona() : u.role;
  if(answer!=='none' && answer!=='self' && answer!=='school')
    return {ok:false, msg:'پاسخ معتبر نیست'};
  var st = byId('users', studentId);
  if(!st || st.role!=='student') return {ok:false, msg:'دانش‌آموز یافت نشد'};
  var allowed = false;
  if(role==='manager' || role==='superadmin') allowed = st.school_id===u.school_id;
  else if(role==='parent'){
    /* ولی فقط برای فرزندِ خودش (از parent_links، روی داده) */
    var childId = (S.child && Number(S.child)) || 0;
    allowed = childId===st.id &&
      db.parent_links.some(function(p){ return p.parent_id===u.id && p.student_id===st.id; });
  }
  if(!allowed) return {ok:false, msg:'شما اجازهٔ ثبت این پاسخ را ندارید'};
  var now = new Date().toISOString();
  var existing = busNeedOf(studentId);
  if(existing){
    update('bus_needs', existing.id, {answer:answer, set_by:u.id, set_at:now, note:String(note||'').trim()});
    return {ok:true, rec:byId('bus_needs', existing.id), updated:true};
  }
  var rec = {school_id:st.school_id, student_id:studentId, answer:answer,
             set_by:u.id, set_at:now, note:String(note||'').trim()};
  return {ok:true, rec:insert('bus_needs', rec), updated:false};
}

/* ─────────────── مغایرت سوار/پیاده ─────────────── */

/**
 * وضعیتِ مغایرت یک دانش‌آموز برای یک روز (محاسبه‌شده، ذخیره نمی‌شود):
 *   none     = هنوز هیچ‌کس رویدادی ثبت نکرده
 *   pending  = فقط یک طرف ثبت کرده (در انتظار طرف دیگر)
 *   ok       = هر دو ثبت کرده‌اند و نوعِ آخرین رویدادشان یکی است
 *   conflict = مغایرت! (مثلاً راننده «سوار» و دانش‌آموز «پیاده»)
 */
function busMismatch(studentId, dateIso){
  var d = dateIso || todayISO();
  var evs = db.bus_events
    .filter(function(e){ return e.student_id===studentId && (e.at||'').slice(0,10)===d; })
    .sort(function(a,b){ return (a.at||'').localeCompare(b.at||''); });
  if(!evs.length) return {key:'none'};
  var lastD=null, lastS=null;
  evs.forEach(function(e){
    if(e.source==='student') lastS = e;
    else lastD = e; /* 'driver' و 'manager' هر دو سمتِ رسمیِ مسیرند */
  });
  if(lastD && !lastS) return {key:'pending', lastD:lastD, lastS:null};
  if(lastS && !lastD) return {key:'pending', lastD:null, lastS:lastS};
  if(lastD.type===lastS.type) return {key:'ok', lastD:lastD, lastS:lastS};
  return {key:'conflict', lastD:lastD, lastS:lastS};
}
/** شمارشِ مغایرت‌های یک مسیر برای یک روز (برای پنل مدیر) */
function busConflictsOf(routeId, dateIso){
  var studs = busStudentsOf(routeId);
  var out = [];
  studs.forEach(function(s){
    var m = busMismatch(s.id, dateIso);
    if(m.key==='conflict') out.push({student:s, m:m});
  });
  return out;
}

/* ─────────────── موقعیت روی مسیر (شماتیک) ─────────────── */

function busLocationsOf(routeId){
  return db.bus_locations
    .filter(function(l){ return l.route_id===routeId; })
    .sort(function(a,b){ return (b.recorded_at||'').localeCompare(a.recorded_at||''); });
}
function busLatestLocation(routeId){
  var l = busLocationsOf(routeId);
  return l.length ? l[0] : null;
}

/**
 * ثبت موقعیت روی مسیر (pos: ۰ تا ۱۰۰ = درصدهای مسیر).
 * مجاز: راننده (فقط مسیر خودش، student_id=0)، مدیر (مسیرِ مدرسهٔ
 * خودش)، دانش‌آموز (فقط خودش، اگر در مسیری ثبت باشد).
 */
function busLocationSend(source, pos, studentId){
  var u = S.user;
  var role = (typeof activePersona==='function') ? activePersona() : u.role;
  var p = Math.round(Number(pos));
  if(isNaN(p) || p<0 || p>100) return {ok:false, msg:'موقعیت باید بین ۰ و ۱۰۰ باشد'};
  var route=null;
  if(source==='driver'){
    if(role!=='driver' && role!=='manager' && role!=='superadmin')
      return {ok:false, msg:'فقط راننده می‌تواند موقعیت بفرستد'};
    route = role==='driver' ? busRouteOfDriver(u.id) : null;
    if(!route && (role==='manager'||role==='superadmin') && studentId)
      /* مدیر برای یک مسیرِ مشخص (از پنلِ خودش) */
      route = db.bus_routes.filter(function(r){ return r.id===Number(studentId); })[0] || null;
    if(!route) return {ok:false, msg:'مسیری برای ارسال موقعیت نیست'};
    if(role!=='driver' && route.school_id!==u.school_id)
      return {ok:false, msg:'این مسیر متعلق به مدرسهٔ شما نیست'};
    var rec = {route_id:route.id, student_id:0, source:role==='driver'?'driver':'manager',
               pos:p, lat:'', lng:'', recorded_at:new Date().toISOString(), by:u.id};
    return {ok:true, rec:insert('bus_locations', rec)};
  }
  if(source==='student'){
    if(role!=='student') return {ok:false, msg:'فقط دانش‌آموز خودش می‌تواند موقعیتش را بفرستد'};
    route = busRouteOfStudent(u.id);
    if(!route) return {ok:false, msg:'شما در هیچ مسیری ثبت نشده‌اید'};
    /* موقعیتِ دانش‌آموز = همان جایی که خودروست (اگر راننده فرستاده باشد) */
    var veh = busLatestLocation(route.id);
    var vp = veh && veh.student_id===0 ? veh.pos : p;
    var rec2 = {route_id:route.id, student_id:u.id, source:'student',
                pos:vp, lat:'', lng:'', recorded_at:new Date().toISOString(), by:u.id};
    return {ok:true, rec:insert('bus_locations', rec2)};
  }
  return {ok:false, msg:'منبع نامعتبر است'};
}

/** شماتیکِ مسیر: نوار + ایستگاه‌ها (متنِ آزاد) + نقطهٔ آخرین موقعیت */
function busLocValUpdate(el){ var t=document.getElementById("bus_loc_val"); if(t) t.textContent=String(el.value)+"٪"; }

function busSchematicHtml(routeId){
  var r = byId('bus_routes', routeId);
  if(!r) return '';
  var loc = busLatestLocation(routeId);
  var pos = loc ? loc.pos : null;
  var srcFa = {driver:'راننده', student:'دانش‌آموز', manager:'مدیر'};
  var h = '<div style="margin-top:10px;padding:10px 12px;background:var(--surface-2);border-radius:10px">'
    + '<div class="small muted" style="margin-bottom:6px">📍 موقعیت روی مسیر'
    + (loc ? ' — آخرین: <b>' + fa((loc.recorded_at||'').slice(11,16)) + '</b> (ثبت‌کننده: ' + (srcFa[loc.source]||'؟') + ')' : '')
    + '</div>';
  /* نوار مسیر */
  h += '<div style="position:relative;height:26px">';
  h += '<div style="position:absolute;top:11px;right:0;left:0;height:4px;background:var(--border);border-radius:2px"></div>';
  if(r.stops){
    var stops = String(r.stops).split(/[,،]/).map(function(x){ return x.trim(); }).filter(Boolean);
    if(stops.length>1){
      h += '<div style="position:absolute;top:0;right:0;left:0;display:flex;justify-content:space-between">'
        + stops.map(function(st,i){
            return '<span class="small muted" style="transform:translateY(-2px)">' + esc(st) + '</span>';
          }).join('') + '</div>';
    }
  }
  if(pos!=null){
    h += '<div style="position:absolute;top:5px;right:calc(' + pos + '% - 9px);font-size:18px" title="موقعیت: ' + fa(pos) + '٪ مسیر">🚌</div>';
  }
  h += '</div>';
  return h + '</div>';
}

/* ─────────────── تب «سرویس» در پرونده (دانش‌آموز/ولی) ─────────────── */

function busStudentTab(sid){
  var st = byId('users', sid) || {};
  var route = busRouteOfStudent(sid);
  var m = busMismatch(sid);
  var h = '<div class="card-body" style="display:grid;gap:12px">';
  if(!route){
    h += empty('🚌','در هیچ مسیری ثبت نشده‌اید','اگر به سرویس نیاز دارید، با مدرسه یا از طریق والدین هماهنگ کنید.');
    return h + '</div>';
  }
  h += '<div style="border:1px solid var(--border);border-radius:12px;padding:14px">'
    + '<div class="row" style="flex-wrap:wrap;gap:8px"><b>' + esc(route.name) + '</b>'
    + '<span class="muted small">راننده: ' + esc((byId('users',route.driver_id)||{}).full_name||'تعریف نشده') + '</span>'
    + (busOnBoard(sid)===true ? '<span class="badge b-green">🚌 الان روی سرویس</span>'
      : busOnBoard(sid)===false ? '<span class="badge b-gray">🏫 پیاده شده</span>'
      : '<span class="badge b-blue">هنوز رویدادی ندارد</span>') + '</div>'
    + '<div class="row" style="margin-top:12px;gap:8px;flex-wrap:wrap">'
    + '<button class="btn sm" data-act="bus-event-student" data-id="' + sid + '" data-t="on">🚌 من سوار شدم</button>'
    + '<button class="btn ghost sm" data-act="bus-event-student" data-id="' + sid + '" data-t="off">🏫 من پیاده شدم</button>'
    + '<button class="btn ghost sm" data-act="bus-loc-student" data-id="' + sid + '">📍 موقعیت بفرست</button>'
    + '</div></div>';
  if(m.key==='conflict'){
    h += '<div style="border:1px solid var(--red);background:rgba(225,29,72,.06);border-radius:12px;padding:12px 14px" class="small">'
      + '⚠️ <b>مغایرت ثبت شد:</b> '
      + (m.lastD ? 'سمت راننده: ' + (m.lastD.type==='on'?'سوار شد':'پیاده شد') + ' (' + fa((m.lastD.at||'').slice(11,16)) + ') — ' : '')
      + (m.lastS ? 'شما: ' + (m.lastS.type==='on'?'سوار شدم':'پیاده شدم') + ' (' + fa((m.lastS.at||'').slice(11,16)) + ')' : '')
      + '. این موضوع برای بررسی به مدرسه ارسال شده است.</div>';
  } else if(m.key==='pending'){
    h += '<div class="small muted" style="padding:0 2px">⏳ در انتظار تأیید طرف دیگر (راننده/شما).</div>';
  }
  h += busSchematicHtml(route.id);
  /* رویدادهای امروز (هر دو طرف) */
  var evs = db.bus_events
    .filter(function(e){ return e.student_id===sid && (e.at||'').slice(0,10)===todayISO(); })
    .sort(function(a,b){ return (b.at||'').localeCompare(a.at||''); });
  if(evs.length){
    h += '<div class="small muted">رویدادهای امروز:</div><div style="display:grid;gap:6px">'
      + evs.map(function(e){
          var mine = e.source==='student';
          return '<div class="row" style="gap:8px"><span class="muted small" style="flex:none">' + fa((e.at||'').slice(11,16)) + '</span>'
            + '<span class="badge ' + (e.type==='on'?'b-green':'b-blue') + '">' + (e.type==='on'?'🚌 سوار':'🏫 پیاده') + '</span>'
            + '<span class="badge b-gray">' + (mine?'ثبت شما':(e.source==='driver'?'راننده':'مدیر')) + '</span></div>';
        }).join('') + '</div>';
  }
  return h + '</div>';
}

function busParentTab(sid){
  var st = byId('users', sid) || {};
  var need = busNeedOf(sid);
  var route = busRouteOfStudent(sid);
  var m = busMismatch(sid);
  var h = '<div class="card-body" style="display:grid;gap:12px">';
  h += '<div style="border:1px solid var(--border);border-radius:12px;padding:14px">'
    + '<div class="row" style="gap:8px;align-items:center"><b>نیاز به سرویس مدرسه</b>'
    + (need ? '<span class="badge ' + (need.answer==='school'?'b-blue':need.answer==='self'?'b-amber':'b-gray') + '">'
        + BUS_NEED_FA[need.answer] + '</span>' : '<span class="badge b-red">هنوز پاسخ داده نشده</span>') + '</div>'
    + '<div class="small muted" style="margin:8px 0">برای فرزندتان یکی را انتخاب کنید:</div>'
    + '<div style="display:grid;gap:6px" id="bus_need_opts">'
    + ['none','self','school'].map(function(k){
        return '<label class="row" style="gap:8px;cursor:pointer;padding:6px 10px;border:1px solid var(--border);border-radius:10px">'
          + '<input type="radio" name="bus_need" value="' + k + '"' + (need&&need.answer===k?' checked':'') + '/>'
          + '<span class="small">' + BUS_NEED_FA[k] + '</span></label>';
      }).join('') + '</div>'
    + '<div class="row" style="margin-top:10px;gap:8px">'
    + '<button class="btn sm" data-act="bus-need-parent-save" data-id="' + sid + '">💾 ثبت پاسخ</button>'
    + (need ? '<span class="small muted">آخرین ثبت: ' + jalaliDateTime(need.set_at) + '</span>' : '')
    + '</div></div>';
  if(route){
    h += '<div style="border:1px solid var(--border);border-radius:12px;padding:14px">'
      + '<div class="row" style="flex-wrap:wrap;gap:8px"><b>🚌 ' + esc(route.name) + '</b>'
      + '<span class="muted small">راننده: ' + esc((byId('users',route.driver_id)||{}).full_name||'تعریف نشده') + '</span>'
      + (busOnBoard(sid)===true ? '<span class="badge b-green">الان روی سرویس</span>'
        : busOnBoard(sid)===false ? '<span class="badge b-gray">پیاده شده</span>' : '') + '</div>';
    if(m.key==='conflict'){
      h += '<div class="small" style="margin-top:10px;padding:10px 12px;border:1px solid var(--red);background:rgba(225,29,72,.06);border-radius:10px">'
        + '⚠️ <b>مغایرت در ثبت سوار/پیاده</b> — رویداد راننده و فرزندتان یکی نیست. موضوع برای بررسی به مدرسه ارجاع شده است.</div>';
    }
    h += busSchematicHtml(route.id);
    var evs = db.bus_events
      .filter(function(e){ return e.student_id===sid && (e.at||'').slice(0,10)===todayISO(); })
      .sort(function(a,b){ return (b.at||'').localeCompare(a.at||''); });
    if(evs.length){
      h += '<div class="small muted" style="margin-top:10px">رویدادهای امروز:</div><div style="display:grid;gap:6px;margin-top:6px">'
        + evs.map(function(e){
            return '<div class="row" style="gap:8px"><span class="muted small" style="flex:none">' + fa((e.at||'').slice(11,16)) + '</span>'
              + '<span class="badge ' + (e.type==='on'?'b-green':'b-blue') + '">' + (e.type==='on'?'🚌 سوار':'🏫 پیاده') + '</span>'
              + '<span class="badge b-gray">' + (e.source==='student'?'ثبت دانش‌آموز':(e.source==='driver'?'راننده':'مدیر')) + '</span></div>';
          }).join('') + '</div>';
    }
    h += '</div>';
  } else if(need && need.answer==='school'){
    h += '<div class="small muted" style="padding:2px">پاسخ «بر عهدهٔ مدرسه» است ولی هنوز به مسیری افزوده نشده — با مدرسه هماهنگ کنید.</div>';
  }
  return h + '</div>';
}
