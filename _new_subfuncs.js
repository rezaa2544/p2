/**
 * اشتراکِ فعالِ یک دانش‌آموز — از میان همهٔ سطرهای مربوط به او.
 * سطرهای قدیمی (بدون student_id) «هر فرزندِ آن ولی» را می‌بازند؛
 * سطرهای جدید فقط همان دانش‌آموزِ مشخص را.
 * @param {number} studentId شناسهٔ دانش‌آموز
 * @param {number|null} asParent شناسهٔ ولیِ در حال عمل (برای ساختِ تست)
 * @param {boolean} createTrial اگر فعال باشد و سطر نباشد، دورهٔ تست بسازد
 */
function studentSubOf(studentId, asParent, createTrial){
  studentId = Number(studentId);
  const sidParents = new Set(db.parent_links.filter(l=>l.student_id===studentId).map(l=>l.parent_id));
  let best = null;
  db.parent_subscriptions.forEach(function(row){
    if(row.status === 'none') return;
    const isLegacy = !row.student_id;
    const owned = (asParent && row.user_id===asParent) || sidParents.has(row.user_id);
    if(!owned) return;
    if(!isLegacy && Number(row.student_id)!==studentId) return;
    if(!best || new Date(row.end_date||'0000') > new Date(best.end_date||'0000')) best = row;
  });
  if(!best && createTrial && asParent){
    const st = subSettings();
    if(st.trial_enabled && st.trial_days>0)
      best = insert('parent_subscriptions',{user_id:asParent,student_id:studentId,plan:'trial',amount:0,status:'trial',
        start_date:todayISO(),end_date:addDaysISO(todayISO(),st.trial_days)});
  }
  if(!best) return {status:'none',active:false,daysLeft:0,plan:null,end_date:null};
  const expired = best.end_date && best.end_date < todayISO();
  if(expired && best.status!=='expired'){update('parent_subscriptions',best.id,{status:'expired'});best=byId('parent_subscriptions',best.id);}
  const active = ['active','trial'].includes(best.status) && (!best.end_date || best.end_date>=todayISO());
  const daysLeft = best.end_date ? Math.max(0,Math.round((new Date(best.end_date)-new Date(todayISO()))/864e5)) : 0;
  return Object.assign({},best,{active:active,daysLeft:daysLeft,trial:best.status==='trial'});
}

/**
 * اشتراک فعالِ یک دانش‌آموز — از میان همهٔ اولیای او.
 * خروجی: {sub, payerId, payer, relation} یا null.
 * بررسی وضعیت عوارض جانبی ندارد (createTrial=false).
 */
function studentSubscription(studentId){
  var sub = studentSubOf(studentId, null, false);
  if(sub && sub.active){
    var link = db.parent_links.find(function(l){ return l.student_id===Number(studentId) && l.parent_id===sub.user_id; });
    return { sub:sub, payerId:sub.user_id,
             payer:byId('users',sub.user_id)||null,
             relation:(link && link.relation) || null };
  }
  return null;
}

/**
 * دسترسی مؤثر یک ولی: اگر برای دست‌کم یکی از فرزندانش اشتراک فعال
 * باشد (خودش یا هم‌ولیِ دیگر)، پنلش باز است.
 */
function effectiveParentAccess(parentId){
  parentId = parentId || (S.user && S.user.id);
  if(!parentId) return { active:false, own:false, via:null, sub:null };

  var kids = db.parent_links.filter(function(l){ return l.parent_id===parentId; });

  /* ۱. از راه هم‌ولی (برای یکی از فرزندان، دیگری پرداخت کرده) */
  for(var i=0;i<kids.length;i++){
    var found = studentSubscription(kids[i].student_id);
    if(found && found.payerId!==parentId)
      return { active:true, own:false, via:found, sub:found.sub,
               student:byId('users',kids[i].student_id) };
  }

  /* ۲. اشتراک خودش برای هر یک از فرزندان — اینجا تستِ هر فرزند ساخته می‌شود */
  for(var j=0;j<kids.length;j++){
    var own = studentSubOf(kids[j].student_id, parentId, true);
    if(own && own.active)
      return { active:true, own:true, via:null, sub:own,
               student:byId('users',kids[j].student_id) };
  }
  return { active:false, own:false, via:null, sub:null };
}
