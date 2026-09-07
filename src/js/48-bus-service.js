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
      + ' — پیگیریِ واقعی در بخش زیر.</div>';
  }
  h += busFollowupsHtml(r.id);
  h += busSchematicHtml(r.id);
  return h + '</div></div>';
}

function viewBusService(){
  var sid = S.user.school_id;
  var routes = busRoutesOf(sid);
  var h = '<div class="page-head"><h2>🚌 سرویس مدرسه</h2>'
    + '<button class="btn" data-act="bus-route-new">➕ مسیر جدید</button></div>'
    + '<div class="small muted" style="margin-bottom:14px">'
    + 'جی‌پی‌اسِ واقعی: راننده از پنل «مسیر من» موقعیتِ واقعیِ دستگاه را می‌فرستد (مختصات روی نقشهٔ مسیر) و سوار/پیاده را ثبت می‌کند. '
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
  h += '<div class="card"><div class="card-head"><h3>📍 موقعیتِ واقعی روی مسیر</h3></div><div class="card-body">'
    + '<div class="small muted" style="margin-bottom:8px">جی‌پی‌اسِ واقعیِ دستگاه خوانده و مختصاتِ واقعی روی نقشهٔ مسیر ثبت می‌شود '
    + '(درصدِ مسیر و «خارج از مسیر» از هندسهٔ واقعی محاسبه می‌شود). در دستگاهِ بدون GPS (مثل همین پوستهٔ دمو) دکمه به نقطهٔ بعدیِ واقعیِ مسیر پیش می‌رود. '
    + 'مرحلهٔ باقی‌مانده: جریانِ لحظه‌ای بین دستگاه‌ها + کاشیِ نقشهٔ شهری (قفل ۱۱.۱).</div>'
    + '<div class="row" style="gap:8px;flex-wrap:wrap;align-items:center">'
    + '<button class="btn sm" data-act="bus-loc-driver">📡 موقعیتِ واقعیِ من را بفرست</button></div>'
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
      username:'driver1', phone:(typeof demoPhone==='function')?demoPhone():'', national_id:(typeof nid==='function')?nid():'', active:1
    });
  }
  /* هندسهٔ واقعیِ مسیر (مختصات WGS-84 واقعی — محور شهرک غرب تا میدان ولی‌عصر، تهران) */
  var pts = [[35.7698,51.3712],[35.7661,51.3797],[35.7615,51.3891],[35.7566,51.3986],[35.7521,51.4080],[35.7489,51.4173],[35.7468,51.4266]];
  var route = add('bus_routes',{
    school_id:sc.id, name:'مسیر ۱ — شهرک غرب', driver_id:drv.id, created_at:todayISO(),
    points: pts, stops: 'شهرک غرب, بلوار دریا, تقاطع بهشتی, میدان ولی‌عصر'
  });
  var studs = db.users.filter(function(x){
    return x.role==='student' && x.school_id===sc.id && (x.status||'active')==='active';
  }).slice(0,4);
  studs.forEach(function(s){
    add('bus_students',{route_id:route.id, student_id:s.id});
  });
  if(studs.length){
    /* 🔴 رانشِ زمان (رفع‌شده در فاز ۳): ساعت‌هایِ ثابت (مثلِ 07:12Z)
       هر روز، پیش از آن ساعت، رویدادِ دمو را «در آیندهٔ» رویدادهایِ
       «الان» می‌نهادند — busOnBoard آخرین رویداد را می‌گیرد، پس حالت
       «روی سرویس» وارونه می‌شد و تستِ smoke می‌شکست. زمان‌ها اکنون
       نسبت به «الان» (چند دقیقهٔ پیش) ساخته می‌شوند و همیشه در
       گذشته‌اند؛ ترتیبِ رویدادها حفظ است. */
    var _demoAt = function(minAgo){
      var d = new Date(Date.now() - minAgo * 60000);
      var today = todayISO();
      return (d.toISOString().slice(0,10) === today) ? d.toISOString() : (today + 'T00:00:00.000Z');
    };
    var _ev0 = add('bus_events',{school_id:sc.id, route_id:route.id, student_id:studs[0].id,
      type:'on', at:_demoAt(90), by:drv.id, source:'driver'});
  }
  if(studs.length>1){
    add('bus_events',{school_id:sc.id, route_id:route.id, student_id:studs[1].id,
      type:'on', at:_demoAt(85), by:drv.id, source:'driver'});
    add('bus_events',{school_id:sc.id, route_id:route.id, student_id:studs[1].id,
      type:'off', at:_demoAt(55), by:drv.id, source:'driver'});
    /* بند ۱۱: مغایرت — دانش‌آموز می‌گوید هنوز سوار است */
    add('bus_events',{school_id:sc.id, route_id:route.id, student_id:studs[1].id,
      type:'on', at:_demoAt(50), by:studs[1].id, source:'student'});
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
  /* بند ۱۴: موقعیت‌های واقعیِ مختصاتی (روی هندسهٔ واقعیِ مسیر — ۶۰٪ طول) */
  if(!db.bus_locations.length){
    var vpt = busPointAt(pts, 0.6);
    var vpr = busProjectOnRoute(pts, vpt[0], vpt[1]);
    add('bus_locations',{route_id:route.id, student_id:0, source:'driver',
      pos: Math.round(vpr.pos*10)/10, lat:vpt[0], lng:vpt[1], acc:12, speed:0, off:0,
      recorded_at:_demoAt(80), by:drv.id});
    if(studs.length>1) add('bus_locations',{route_id:route.id, student_id:studs[1].id, source:'student',
      pos: Math.round(vpr.pos*10)/10, lat:vpt[0], lng:vpt[1], acc:15, speed:0, off:0,
      recorded_at:_demoAt(78), by:studs[1].id});
  }
  /* بند ۱۴: پیگیریِ واقعیِ مغایرتِ دمو (باز، با یادداشت) */
  if(studs.length>1 && !db.bus_followups.length){
    add('bus_followups',{school_id:sc.id, route_id:route.id, student_id:studs[1].id,
      date:todayISO(), note:'با راننده تماس گرفته شد — فردا هماهنگ می‌کنیم.',
      status:'open', created_by:0, created_at:new Date().toISOString(),
      closed_by:0, closed_at:'', close_note:''});
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
function busSchematicLegacyHtml(routeId){
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
  h += busFollowLine(sid);
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
    h += busFollowLine(sid);
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

/* ═══════════════════════════════════════════════════════════════════
   بند ۱۴ (اصلِ واقعیت) — جی‌پی‌اسِ واقعی + نقشهٔ مختصاتیِ واقعی +
   پیگیریِ واقعیِ مغایرت

   «شماتیکِ دروغین» حذف شد: مسیرها هندسهٔ واقعی دارند (points =
   مختصات [lat,lng])؛ موقعیت ثبت‌شده مختصات واقعی است (از جی‌پی‌اسِ
   دستگاه)؛ pos (درصد مسیر) و تشخیص «خارج از مسیر» از هندسهٔ واقعی
   محاسبه می‌شوند؛ نقشهٔ نمایشی یک نقشهٔ مختصاتیِ واقعیِ رسم‌شده
   با همین مختصات است (شبکهٔ عرض/طول واقعی + مقیاسِ متر واقعی).
   تنها مرحلهٔ باقی‌مانده = مرحلهٔ سرور (جریانِ لحظه‌ای بین
   دستگاه‌ها + کاشیِ نقشهٔ شهری) — قفل ۱۱.۱.

   پیگیریِ مغایرت: جدول bus_followups — کاروروزِ واقعی (نوت،
   باز/بسته، نتیجه) — قفل ۱۱.۲ پیاده شد.
   ═══════════════════════════════════════════════════════════════════ */

const BUS_EARTH_R = 6371000;
const BUS_DEG = Math.PI / 180;
const BUS_OFFROUTE_M = 250;

/** فاصلهٔ واقعی دو مختصات (متر) — haversine */
function busHaversine(a, b){
  var dLat = (b[0]-a[0]) * BUS_DEG;
  var dLng = (b[1]-a[1]) * BUS_DEG;
  var s = Math.sin(dLat/2)*Math.sin(dLat/2) +
          Math.cos(a[0]*BUS_DEG)*Math.cos(b[0]*BUS_DEG)*Math.sin(dLng/2)*Math.sin(dLng/2);
  return 2 * BUS_EARTH_R * Math.asin(Math.sqrt(s));
}
/** طول واقعی مسیر (متر) */
function busRouteLengthM(points){
  var t = 0;
  for(var i=1;i<points.length;i++) t += busHaversine(points[i-1], points[i]);
  return t;
}
/**
 * نزدیک‌ترین نقطهٔ مسیر به یک مختصاتِ واقعی:
 * @returns {pos: 0-100 (درصد طول واقعی مسیر), dist: متر تا مسیر, seg}
 */
function busProjectOnRoute(points, lat, lng){
  var total = busRouteLengthM(points);
  if(total <= 0) return {pos:0, dist:0, seg:0};
  var M_LAT = 111320; // متر در عرض
  var acc = 0;
  var best = null;
  for(var i=1;i<points.length;i++){
    var A = points[i-1], B = points[i];
    var kx = Math.cos(((A[0]+B[0])/2) * BUS_DEG) * M_LAT; // متر در طول (میانگین)
    var ax = 0, ay = 0;
    var bx = (B[1]-A[1]) * kx;
    var by = (B[0]-A[0]) * M_LAT;
    var px = (lng - A[1]) * kx;
    var py = (lat - A[0]) * M_LAT;
    var len2 = bx*bx + by*by;
    var t = len2 > 0 ? Math.max(0, Math.min(1, (px*bx + py*by) / len2)) : 0;
    var qx = ax + t*bx, qy = ay + t*by;
    var dist = Math.sqrt((px-qx)*(px-qx) + (py-qy)*(py-qy));
    var segLen = len2 > 0 ? Math.sqrt(len2) : 0;
    if(!best || dist < best.dist)
      best = {dist: dist, seg: i, pos: (acc + t*segLen) / total * 100};
    acc += segLen;
  }
  return best;
}
/** مختصاتِ واقعیِ نقطهٔ frac (0-1) از طول واقعی مسیر */
function busPointAt(points, frac){
  var total = busRouteLengthM(points);
  var acc = 0;
  var target = Math.max(0, Math.min(1, frac)) * total;
  for(var i=1;i<points.length;i++){
    var seg = busHaversine(points[i-1], points[i]);
    if(acc + seg >= target || i === points.length-1){
      var t = seg > 0 ? (target - acc) / seg : 0;
      return [
        points[i-1][0] + (points[i][0]-points[i-1][0]) * t,
        points[i-1][1] + (points[i][1]-points[i-1][1]) * t
      ];
    }
    acc += seg;
  }
  return points[points.length-1];
}

/* ─────────────── جی‌پی‌اسِ واقعی ─────────────── */

/** خواندنِ موقعیتِ واقعیِ دستگاه (promise). بدون GPS/ممنوع → {ok:false} */
function busGpsGet(){
  return new Promise(function(res){
    var nav = (typeof navigator!=='undefined') ? navigator : null;
    if(!nav || !nav.geolocation || typeof nav.geolocation.getCurrentPosition !== 'function'){
      return res({ok:false, reason:'nogs'});
    }
    var done = false;
    var to = setTimeout(function(){
      if(!done){ done=true; res({ok:false, reason:'timeout'}); }
    }, 12000);
    try{
      nav.geolocation.getCurrentPosition(function(p){
        if(done) return; done = true; clearTimeout(to);
        res({ok:true, lat:p.coords.latitude, lng:p.coords.longitude,
             acc:p.coords.accuracy||0, speed:p.coords.speed});
      }, function(e){
        if(done) return; done = true; clearTimeout(to);
        res({ok:false, reason:(e && e.code===1) ? 'denied' : 'err'});
      }, {enableHighAccuracy:true, timeout:11000, maximumAge:0});
    }catch(e){
      if(!done){ done = true; clearTimeout(to); res({ok:false, reason:'err'}); }
    }
  });
}

/** آخرین موقعیتِ واقعیِ خودرو (student_id=0 با مختصات) */
function busLatestVehicle(routeId){
  var ls = busLocationsOf(routeId).filter(function(l){ return l.student_id===0 && l.lat; });
  return ls.length ? ls[0] : null;
}

/**
 * ثبتِ یک موقعیتِ واقعی روی مسیر.
 * geo = {lat, lng, acc?, speed?, studentId?} — مختصاتِ واقعی.
 * pos و off از هندسهٔ واقعیِ مسیر محاسبه می‌شوند (مسیرِ قدیمیِ
 * بدون هندسه: pos دست‌داده می‌ماند — سازگاری).
 */
function busRecordLocation(routeId, geo, by, source){
  var r = byId('bus_routes', routeId);
  if(!r) return {ok:false, msg:'مسیر یافت نشد'};
  var hasPts = Array.isArray(r.points) && r.points.length >= 2;
  if(!hasPts && (geo.lat==null || geo.lng==null))
    return {ok:false, msg:'مسیر هندسه ندارد'};
  var rec = {
    route_id: routeId,
    student_id: geo.studentId || 0,
    source: source,
    lat: hasPts ? geo.lat : '',
    lng: hasPts ? geo.lng : '',
    acc: geo.acc || 0,
    speed: geo.speed || 0,
    pos: null, off: 0,
    recorded_at: new Date().toISOString(),
    by: by
  };
  if(hasPts){
    var pr = busProjectOnRoute(r.points, geo.lat, geo.lng);
    rec.pos = Math.round(pr.pos * 10) / 10;
    rec.off = pr.dist > BUS_OFFROUTE_M ? 1 : 0;
  } else {
    rec.pos = (geo.pos!=null) ? Math.round(Number(geo.pos)) : null;
  }
  return {ok:true, rec: insert('bus_locations', rec)};
}

/**
 * ورودِ واقعیِ UI — «موقعیت بفرست»:
 * دستگاه GPS دارد → مختصاتِ واقعیِ لحظه‌ای؛ ندارد (پوستهٔ دمو) →
 * خودرو به نقطهٔ بعدیِ واقعیِ مسیر پیش می‌رود و دانش‌آموز به
 * موقعیتِ واقعیِ خودرو (لولهٔ کاملِ واقعی، ورودیِ شبیه‌سازی‌شده).
 */
function busLocationReal(source, id){
  var u = S.user;
  var role = (typeof activePersona==='function') ? activePersona() : u.role;
  var route = null;
  if(source === 'driver'){
    if(role === 'driver') route = busRouteOfDriver(u.id);
    else if(role === 'manager' || role === 'superadmin')
      route = (id ? byId('bus_routes', Number(id)) : null) || busRouteOfDriver(u.id);
    if(route && role !== 'superadmin' && route.school_id !== u.school_id)
      return Promise.resolve({ok:false, msg:'این مسیر متعلق به مدرسهٔ شما نیست'});
    if(!route) return Promise.resolve({ok:false, msg:'مسیری برای ارسال موقعیت نیست'});
  } else {
    if(role !== 'student') return Promise.resolve({ok:false, msg:'فقط دانش‌آموز خودش می‌تواند موقعیتش را بفرستد'});
    route = busRouteOfStudent(u.id);
    if(!route) return Promise.resolve({ok:false, msg:'شما در هیچ مسیری ثبت نشده‌اید'});
  }
  var hasGps = !!(typeof navigator!=='undefined' && navigator.geolocation);
  if(!hasGps) return Promise.resolve(busSimNext(route.id, source));
  return busGpsGet().then(function(g){
    if(!g.ok) return {ok:false, msg: g.reason==='denied'
      ? 'دسترسیِ جی‌پی‌اس مجاز نیست — در تنظیماتِ مرورگر GPS را باز کنید'
      : 'جی‌پی‌اس فعلاً در دسترس نیست — دوباره تلاش کنید'};
    var r = busRecordLocation(route.id,
      {lat:g.lat, lng:g.lng, acc:g.acc, speed:g.speed,
       studentId: source==='student' ? u.id : 0},
      u.id, source==='driver' ? (role==='driver'?'driver':'manager') : 'student');
    if(!r.ok) return r;
    return {ok:true, rec:r.rec, real:true};
  });
}

/** دمو/تست: پیشبردِ خودرو به نقطهٔ بعدیِ واقعیِ مسیر (یا دانش‌آموز به خودرو) */
function busSimNext(routeId, source){
  var r = byId('bus_routes', routeId);
  if(!r || !Array.isArray(r.points) || r.points.length < 2)
    return {ok:false, msg:'مسیر هندسهٔ واقعی ندارد'};
  var u = S.user;
  var who = u ? u.id : 0;
  var veh = busLatestVehicle(routeId);
  var cur = veh ? [veh.lat, veh.lng] : [r.points[0][0], r.points[0][1]];
  if(source === 'student' && u && u.role === 'student'){
    var at = veh ? [veh.lat, veh.lng] : cur;
    return busRecordLocation(routeId, {lat:at[0], lng:at[1], studentId:u.id}, who, 'student');
  }
  var next = null, best = Infinity;
  for(var i=0;i<r.points.length;i++){
    var d = busHaversine(cur, r.points[i]);
    if(d >= 30 && d < best){ best = d; next = r.points[i]; }
  }
  if(!next) return {ok:false, msg:'به پایان مسیر رسیدید'};
  return busRecordLocation(routeId, {lat:next[0], lng:next[1], acc:0, speed:0}, who, 'driver');
}

/* ─────────────── نقشهٔ مختصاتیِ واقعی (SVG، بدون وابستگی) ─────────────── */

function busRealMapHtml(routeId){
  var r = byId('bus_routes', routeId);
  if(!r) return '';
  var pts = r.points;
  if(!Array.isArray(pts) || pts.length < 2) return busSchematicLegacyHtml(routeId);
  var W = 680, H = 235, P = 36;
  var minLat=90, maxLat=-90, minLng=180, maxLng=-180;
  pts.forEach(function(p){
    if(p[0]<minLat)minLat=p[0]; if(p[0]>maxLat)maxLat=p[0];
    if(p[1]<minLng)minLng=p[1]; if(p[1]>maxLng)maxLng=p[1];
  });
  var veh = busLatestVehicle(routeId);
  var srcFa = {driver:'راننده', student:'دانش‌آموز', manager:'مدیر'};
  /* موقعیت‌های واقعیِ تازهٔ دانش‌آموزان (جدیدترین هرکدام) */
  var studs = {};
  busLocationsOf(routeId).forEach(function(l){
    if(l.student_id && l.lat && !studs[l.student_id]) studs[l.student_id] = l;
  });
  var studsArr = Object.values(studs).slice(0,6);
  studsArr.concat(veh ? [veh] : []).forEach(function(l){
    if(l.lat<minLat)minLat=l.lat; if(l.lat>maxLat)maxLat=l.lat;
    if(l.lng<minLng)minLng=l.lng; if(l.lng>maxLng)maxLng=l.lng;
  });
  var dLat = (maxLat-minLat) || 0.0008;
  var dLng = ((maxLng-minLng)*Math.cos(((minLat+maxLat)/2)*BUS_DEG)) || 0.0008;
  minLat -= dLat*0.15; maxLat += dLat*0.15;
  minLng -= (dLng/Math.cos(((minLat+maxLat)/2)*BUS_DEG))*0.15;
  maxLng += (dLng/Math.cos(((minLat+maxLat)/2)*BUS_DEG))*0.15;
  dLat = maxLat-minLat; dLng = (maxLng-minLng)*Math.cos(((minLat+maxLat)/2)*BUS_DEG);
  function proj(p){
    var x = (p[1]-minLng)*Math.cos(((minLat+maxLat)/2)*BUS_DEG) / dLng * (W-2*P) + P;
    var y = (maxLat-p[0]) / dLat * (H-2*P) + P;
    return [Math.round(x*10)/10, Math.round(y*10)/10];
  }
  var mPerPx = dLng * 111320 / (W-2*P);
  var barM = mPerPx*120 >= 1000 ? 1000 : (mPerPx*120 >= 500 ? 500 : 200);
  var barPx = Math.round(barM / mPerPx);
  var h = '';
  if(veh){
    h += '<div class="small" style="margin-bottom:6px;display:flex;gap:8px;flex-wrap:wrap;align-items:center">'
      + '<b>📍 موقعیتِ واقعی روی مسیر</b>'
      + '<span class="muted">آخرین: ' + fa((veh.recorded_at||'').slice(11,16))
      + ' (' + (srcFa[veh.source]||'؟') + ') · ' + fa(veh.lat.toFixed(4)) + '°، ' + fa(veh.lng.toFixed(4)) + '°'
      + (veh.speed ? ' · ' + fa(Math.round(veh.speed*3.6)) + ' km/h' : '') + '</span>'
      + (veh.off ? '<span class="badge b-red">⚠️ خارج از مسیر (' + fa(Math.round(busProjectOnRoute(pts,veh.lat,veh.lng).dist)) + ' متر)</span>'
                 : '<span class="badge b-green">روی مسیر</span>')
      + (veh.pos!=null ? '<span class="badge b-gray">' + fa(veh.pos) + '٪ طول مسیر</span>' : '')
      + '</div>';
  } else {
    h += '<div class="small muted" style="margin-bottom:6px">📍 نقشهٔ مختصاتیِ واقعیِ مسیر — هنوز موقعیتی ثبت نشده است</div>';
  }
  h += '<svg viewBox="0 0 ' + W + ' ' + H + '" style="width:100%;height:auto;background:var(--surface);border:1px solid var(--border);border-radius:10px" xmlns="http://www.w3.org/2000/svg">';
  /* شبکهٔ عرض/طولِ واقعی (خطوط + برچسبِ مختصات) */
  for(var g=1; g<=3; g++){
    var gx = P + (W-2*P)*g/4;
    var glng = minLng + (maxLng-minLng)*g/4;
    h += '<line x1="'+gx+'" y1="'+(P-8)+'" x2="'+gx+'" y2="'+(H-P+8)+'" stroke="var(--border)" stroke-width="1" stroke-dasharray="3 5"/>';
    h += '<text x="'+gx+'" y="'+(H-8)+'" font-size="8" fill="var(--muted)" text-anchor="middle">' + glng.toFixed(3) + '°</text>';
  }
  for(var g2=1; g2<=2; g2++){
    var gy = P + (H-2*P)*g2/3;
    var glat = maxLat - dLat*g2/3;
    h += '<line x1="'+(P-8)+'" y1="'+gy+'" x2="'+(W-P+8)+'" y2="'+gy+'" stroke="var(--border)" stroke-width="1" stroke-dasharray="3 5"/>';
    h += '<text x="6" y="'+(gy+3)+'" font-size="8" fill="var(--muted)">' + glat.toFixed(3) + '°</text>';
  }
  /* خودِ مسیر (خطِ واقعی) */
  var path = pts.map(proj).map(function(c,i){ return (i?'L':'M') + c[0] + ' ' + c[1]; }).join(' ');
  h += '<path d="' + path + '" fill="none" stroke="var(--primary)" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" opacity="0.55"/>';
  h += '<path d="' + path + '" fill="none" stroke="var(--primary)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="1 7"/>';
  /* ایستگاه‌ها (متن‌های r.stops) — موقعیت‌های واقعیِ درشت‌شده روی مسیر */
  var stops = String(r.stops||'').split(/[,،]/).map(function(x){ return x.trim(); }).filter(Boolean);
  if(stops.length > 1){
    stops.forEach(function(st, i){
      var f = i/(stops.length-1);
      var sp = busPointAt(pts, f);
      var c = proj(sp);
      h += '<circle cx="'+c[0]+'" cy="'+c[1]+'" r="4" fill="var(--surface)" stroke="var(--primary)" stroke-width="1.5"/>';
      h += '<text x="'+c[0]+'" y="'+(c[1]-9)+'" font-size="9" fill="var(--text)" text-anchor="middle">' + esc(st) + '</text>';
    });
  } else {
    [0, 1].forEach(function(f){
      var c = proj(busPointAt(pts, f));
      h += '<circle cx="'+c[0]+'" cy="'+c[1]+'" r="4" fill="var(--primary)"/>';
    });
  }
  /* موقعیت‌های واقعیِ دانش‌آموزان */
  studsArr.forEach(function(l){
    var c = proj([l.lat, l.lng]);
    var nm = (byId('users', l.student_id)||{}).full_name || '؟';
    h += '<circle cx="'+c[0]+'" cy="'+c[1]+'" r="5" fill="var(--green)" stroke="var(--surface)" stroke-width="1.5"/>';
    h += '<text x="'+(c[0])+'" y="'+(c[1]+14)+'" font-size="8.5" fill="var(--text)" text-anchor="middle">' + esc(nm) + '</text>';
  });
  /* خودرو */
  if(veh){
    var c2 = proj([veh.lat, veh.lng]);
    h += '<circle cx="'+c2[0]+'" cy="'+c2[1]+'" r="9" fill="var(--primary)" opacity="0.25"/>';
    h += '<circle cx="'+c2[0]+'" cy="'+c2[1]+'" r="5" fill="var(--primary)" stroke="var(--surface)" stroke-width="1.5"/>';
    h += '<text x="'+c2[0]+'" y="'+(c2[1]-12)+'" font-size="11" text-anchor="middle">🚌</text>';
  }
  /* مقیاسِ واقعی (متر) + جهتِ شمال */
  h += '<line x1="'+P+'" y1="'+(H-P+16)+'" x2="'+(P+barPx)+'" y2="'+(H-P+16)+'" stroke="var(--text)" stroke-width="2"/>';
  h += '<line x1="'+P+'" y1="'+(H-P+12)+'" x2="'+P+'" y2="'+(H-P+20)+'" stroke="var(--text)" stroke-width="2"/>';
  h += '<line x1="'+(P+barPx)+'" y1="'+(H-P+12)+'" x2="'+(P+barPx)+'" y2="'+(H-P+20)+'" stroke="var(--text)" stroke-width="2"/>';
  h += '<text x="'+(P+barPx+6)+'" y="'+(H-P+19)+'" font-size="8.5" fill="var(--muted)">' + barM + ' متر</text>';
  h += '<text x="'+(W-P+2)+'" y="'+(P+6)+'" font-size="10" fill="var(--muted)" text-anchor="end">↑ شمال</text>';
  h += '<text x="'+(W-P+2)+'" y="'+(H-P+19)+'" font-size="8" fill="var(--muted)" text-anchor="end">'
     + 'طول مسیر: ' + fa(Math.round(busRouteLengthM(pts)/100)/10) + ' کیلومتر · مختصاتِ واقعی (WGS-84)</text>';
  h += '</svg>';
  return '<div style="margin-top:10px">' + h + '</div>';
}

/** دیسپچر: مسیرِ واقعیِ هندسه‌دار → نقشهٔ واقعی؛ قدیمی → شماتیکِ قدیمی */
function busSchematicHtml(routeId){
  var r = byId('bus_routes', routeId);
  if(!r) return '';
  if(Array.isArray(r.points) && r.points.length >= 2) return busRealMapHtml(routeId);
  return busSchematicLegacyHtml(routeId);
}

/* ─────────────── پیگیریِ واقعیِ مغایرت (قفل ۱۱.۲ — پیاده شد) ─────────────── */

/** آخرین پیگیریِ یک دانش‌آموز در یک روز (یا null) */
function busFollowOf(studentId, date){
  var d = date || todayISO();
  var rows = db.bus_followups.filter(function(x){ return x.student_id===studentId && x.date===d; });
  rows.sort(function(a,b){ return (b.created_at||'').localeCompare(a.created_at||''); });
  return rows[0] || null;
}
/** شروع/به‌روزرسانیِ پیگیری — فقط مدیر (scope روی داده) */
function busFollowStart(routeId, studentId, note){
  var r = byId('bus_routes', routeId);
  if(!r) return {ok:false, msg:'مسیر یافت نشد'};
  var u = S.user;
  var role = (typeof activePersona==='function') ? activePersona() : u.role;
  if(role !== 'manager' && role !== 'superadmin')
    return {ok:false, msg:'فقط مدیر می‌تواند پیگیری ثبت کند'};
  if(role !== 'superadmin' && r.school_id !== u.school_id)
    return {ok:false, msg:'این مسیر متعلق به مدرسهٔ شما نیست'};
  var st = byId('users', studentId);
  if(!st || st.role !== 'student') return {ok:false, msg:'دانش‌آموز نامعتبر است'};
  var date = todayISO();
  var now = new Date().toISOString();
  var existing = busFollowOf(studentId, date);
  if(existing){
    update('bus_followups', existing.id, {
      status:'open', note: note || existing.note,
      created_by: u.id, created_at: now, closed_by: 0, closed_at: '', close_note: ''
    });
    return {ok:true, rec: byId('bus_followups', existing.id)};
  }
  var rec = insert('bus_followups', {
    school_id: r.school_id, route_id: routeId, student_id: studentId, date: date,
    note: note || '', status: 'open', created_by: u.id, created_at: now,
    closed_by: 0, closed_at: '', close_note: ''
  });
  return {ok:true, rec: rec};
}
/** بستنِ پیگیری — فقط مدیر (scope روی داده) */
function busFollowClose(followId, closeNote){
  var f = byId('bus_followups', followId);
  if(!f) return {ok:false, msg:'پیگیری یافت نشد'};
  var u = S.user;
  var role = (typeof activePersona==='function') ? activePersona() : u.role;
  if(role !== 'manager' && role !== 'superadmin')
    return {ok:false, msg:'فقط مدیر می‌تواند پیگیری ببندد'};
  var r = byId('bus_routes', f.route_id);
  if(role !== 'superadmin' && r && r.school_id !== u.school_id)
    return {ok:false, msg:'این مسیر متعلق به مدرسهٔ شما نیست'};
  update('bus_followups', f.id, {
    status:'closed', closed_by: u.id, closed_at: new Date().toISOString(),
    close_note: closeNote || ''
  });
  return {ok:true, rec: byId('bus_followups', f.id)};
}
/** بخشِ پیگیری در کارتِ مسیر (مدیر) */
function busFollowupsHtml(routeId){
  var r = byId('bus_routes', routeId);
  if(!r) return '';
  var today = todayISO();
  var studs = db.bus_students.filter(function(x){ return x.route_id===routeId; });
  var items = [];
  var seen = {};
  studs.forEach(function(bs){
    var s = byId('users', bs.student_id);
    if(!s) return;
    var m = busMismatch(s.id);
    if(m.key!=='conflict' && m.key!=='pending') return;
    var f = busFollowOf(s.id, today);
    if(!seen[s.id]){ seen[s.id]=1; items.push({s:s, m:m, f:f}); }
  });
  db.bus_followups.filter(function(f){
    return f.route_id===routeId && f.date===today && !seen[f.student_id];
  }).forEach(function(f){
    var s = byId('users', f.student_id);
    if(!s) return;
    seen[s.id]=1; items.push({s:s, m:{key:'none'}, f:f});
  });
  if(!items.length) return '';
  var h = '<div class="card" style="margin-top:12px"><div class="card-head"><h3>🔎 پیگیری مغایرت سوار/پیاده</h3>'
    + '<span class="badge b-blue">' + fa(items.length) + '</span></div><div class="card-body" style="display:grid;gap:8px">';
  items.forEach(function(it){
    var f = it.f;
    var badge = f
      ? (f.status==='open'
          ? '<span class="badge b-amber">🔎 در حال پیگیری</span>'
          : '<span class="badge b-green">✅ پیگیری بسته شد</span>')
      : (it.m.key==='conflict'
          ? '<span class="badge b-red">⚠️ مغایرت — پیگیری نشده</span>'
          : '<span class="badge b-blue">در انتظار — پیگیری نشده</span>');
    h += '<div class="row" style="gap:8px;flex-wrap:wrap;align-items:center;background:var(--surface-2);border-radius:10px;padding:8px 12px">'
      + '<b>' + esc(it.s.full_name) + '</b>' + badge
      + (f && f.note ? '<span class="small muted">«' + esc(f.note) + '»</span>' : '')
      + (f && f.status==='closed' && f.close_note ? '<span class="small muted">→ «' + esc(f.close_note) + '»</span>' : '')
      + '<div class="spacer"></div>'
      + (f && f.status==='open'
          ? '<button class="btn ghost sm" data-act="bus-follow-close" data-id="' + f.id + '">✅ بستن پیگیری</button>'
          : '<button class="btn sm" data-act="bus-follow-open" data-id="' + it.s.id + '" data-r="' + routeId + '">🔎 شروع پیگیری</button>')
      + '</div>';
  });
  return h + '</div></div>';
}
/** وضعیتِ پیگیری برای تب پرونده (دانش‌آموز/ولی) — فقط‌خوان */
function busFollowLine(sid){
  var f = busFollowOf(sid);
  if(!f) return '';
  return '<div class="small" style="margin-top:8px;padding:8px 10px;border:1px dashed var(--border);border-radius:10px">'
    + (f.status==='open'
        ? '🔎 مغایرت در حال <b>پیگیری</b> توسط مدرسه است' + (f.note ? ' — ' + esc(f.note) : '')
        : '✅ پیگیری بسته شد: «' + esc(f.close_note || 'بدون یادداشت') + '»')
    + '</div>';
}
