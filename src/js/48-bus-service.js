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
function busEvent(studentId, type){
  if(type!=='on' && type!=='off') return {ok:false,msg:'نوع رویداد نامعتبر است'};
  var route = busRouteOfStudent(studentId);
  if(!route) return {ok:false,msg:'این دانش‌آموز در هیچ مسیری ثبت نشده است'};
  var u = S.user;
  var role = (typeof activePersona==='function') ? activePersona() : u.role;
  /* 🔴 راننده فقط مالک مسیر است؛ مدیر/سوپرادمین به‌جای او ثبت می‌کند.
     هر نقش دیگر — حتی با شناسهٔ درست دانش‌آموز — رد می‌شود. */
  var allowed = role==='manager' || role==='superadmin' ||
                (role==='driver' && route.driver_id===u.id);
  if(!allowed) return {ok:false,msg:'شما اجازهٔ ثبت رویداد برای این مسیر را ندارید'};
  var st = byId('users',studentId);
  if(!st) return {ok:false,msg:'دانش‌آموز یافت نشد'};
  var at = new Date().toISOString();
  var rec = insert('bus_events',{
    school_id: route.school_id,
    route_id:  route.id,
    student_id: studentId,
    type:      type,
    at:        at,
    by:        u.id
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
              return '<span class="badge '+(on===true?'b-green':on===false?'b-gray':'b-blue')+'">'
                + esc(s.full_name)
                + (on===true?' 🚌':on===false?'':'')
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
  return h;
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
        return '<div class="row" style="background:var(--surface-2);border-radius:10px;padding:10px 14px;flex-wrap:wrap;gap:8px">'
          + '<b>'+esc(s.full_name)+'</b>'
          + '<span class="muted small">'+esc((classOf(s.id)||{}).name||'')+'</span>'
          + state
          + '<div class="spacer"></div>'
          + '<button class="btn sm" data-act="bus-event" data-id="'+s.id+'" data-t="on">🚌 سوار شد</button>'
          + '<button class="btn ghost sm" data-act="bus-event" data-id="'+s.id+'" data-t="off">🏫 پیاده شد</button>'
          + '</div>';
      }).join('')
    + '</div></div></div>';
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
    add('bus_events',{school_id:sc.id, route_id:route.id, student_id:studs[0].id,
      type:'on', at:todayISO()+'T07:12:00.000Z', by:drv.id});
  }
  if(studs.length>1){
    add('bus_events',{school_id:sc.id, route_id:route.id, student_id:studs[1].id,
      type:'on', at:todayISO()+'T07:15:00.000Z', by:drv.id});
    add('bus_events',{school_id:sc.id, route_id:route.id, student_id:studs[1].id,
      type:'off', at:todayISO()+'T08:05:00.000Z', by:drv.id});
  }
}
