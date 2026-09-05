# -*- coding: utf-8 -*-
# دوزِ ۲۳-subscription.js: اشتراکِ فرزندبه‌فرزند
import io
lines=open('src/js/23-subscription.js',encoding='utf8').read().split('\n')

def find_line(pred, start=0, end=None):
    end=len(lines) if end is None else end
    for i in range(start,end):
        if pred(lines[i]): return i
    raise AssertionError('line not found')

newfuncs=open('_new_subfuncs.js',encoding='utf8').read().rstrip('\n').split('\n')
newviews=open('_new_viewsub.js',encoding='utf8').read().rstrip('\n').split('\n')

# ── A: studentSubscription + effectiveParentAccess
sa=find_line(lambda l: 'اشتراک فعال' in l and 'پیدا می‌کند' in l) - 1   # خط /**
assert lines[sa].strip()=='/**', repr(lines[sa])
ea=find_line(lambda l: 'آیا پنل اولیای کاربر جاری قفل است' in l)       # کامنت parentLocked
assert ea>sa
lines[sa:ea]=newfuncs

# ── B: viewSubscription + viewLocked (شمارشِ آکولاد)
def func_end(start):
    bal=0; opened=False
    for i in range(start,len(lines)):
        for ch in lines[i]:
            if ch=='{': bal+=1; opened=True
            elif ch=='}': bal-=1
        if opened and bal==0: return i
    raise AssertionError('func end not found')
sa=find_line(lambda l: l.startswith('function viewSubscription()'))
ea1=func_end(sa)
sl=find_line(lambda l: l.startswith('function viewLocked('), ea1)
ea2=func_end(sl)
nxt=lines[ea2+1] or lines[ea2+2]
assert 'سوپر ادمین' in nxt or 'صفحه سوپر' in nxt, repr(nxt)
lines[sa:ea2+1]=newviews

# ── C: بجِ انتخاب‌گر پنل (per-child summary)
sa=find_line(lambda l: l.strip()=='const s=subOf(S.user.id);')
ea=find_line(lambda l: 'نیازمند پرداخت اشتراک</span>' in l, sa)
newbadge=[
"      const kact=p.children.filter(k=>studentSubOf(k.id,S.user.id,false).active).length;",
"      const kidNames=p.children.map(function(k){return esc(k.full_name);}).join('، ');",
"      const badge=p.children.length",
"        ?(kact===p.children.length?'<span class=\"badge b-green\">اشتراک فعال — همهٔ فرزندان</span>'",
"          :(kact>0?'<span class=\"badge b-amber\">'+fa(kact)+' از '+fa(p.children.length)+' فرزند فعال</span>'",
"            :'<span class=\"badge b-amber\">نیازمند پرداخت اشتراک</span>'))",
"        :'<span class=\"badge b-gray\">بدون فرزند</span>';",
]
lines[sa:ea+1]=newbadge

# ── D: generateP10 per-child
sa=find_line(lambda l: 'همه اولیای نمونه اشتراک فعال دارند' in l)
ea=sa+1
while lines[ea].strip()!='});': ea+=1
newp10=[
"  // همه اولیای نمونه برای هر فرزندشان اشتراک فعال دارند (مدل فرزندبه‌فرزند)",
"  db.users.filter(u=>u.role==='parent').forEach(p=>{",
"    const kids=db.parent_links.filter(l=>l.parent_id===p.id).map(l=>byId('users',l.student_id)).filter(Boolean);",
"    kids.forEach(k=>{",
"      if(db.parent_subscriptions.some(s=>s.user_id===p.id&&(!s.student_id||Number(s.student_id)===k.id)))return;",
"      add('parent_subscriptions',{user_id:p.id,student_id:k.id,plan:'yearly',amount:2200000,status:'active',",
"        start_date:daysAgoISO(30),end_date:addDaysISO(todayISO(),300),paid_at:daysAgoISO(30),ref_id:'SUB-S'+p.id+'-'+k.id});",
"    });",
"  });",
"  // خانوادهٔ چندفرزندِ نمونه: اشتراکِ فرزندِ دوم منقضی است (نمایشِ وضعیتِ فرزندبه‌فرزند)",
"  {",
"    const multi=db.users.find(u=>u.username==='parent_multi');",
"    if(multi){",
"      const mk=db.parent_links.filter(l=>l.parent_id===multi.id).map(l=>byId('users',l.student_id)).filter(Boolean);",
"      if(mk.length>=2){",
"        const row=db.parent_subscriptions.find(s=>s.user_id===multi.id&&Number(s.student_id)===mk[1].id);",
"        if(row)update('parent_subscriptions',row.id,{status:'expired',end_date:daysAgoISO(3)});",
"      }",
"    }",
"  }",
]
lines[sa:ea+1]=newp10

s='\n'.join(lines)

# ── E: جدولِ مدیریت (ستونِ فرزند + بازنشانی به‌ازای سطر)
a1="""  const subs=db.parent_subscriptions.map(function(x){
    const u=byId('users',x.user_id)||{};
    return Object.assign({},x,{full_name:u.full_name||'—',username:u.username||'',role:u.role||''});
  });
  const q=(S.filters.subq||'').trim();
  const rows=subs.filter(function(r){return !q||(r.full_name+r.username).includes(q);});"""
b1="""  const subs=db.parent_subscriptions.map(function(x){
    const u=byId('users',x.user_id)||{};
    const k=x.student_id?(byId('users',x.student_id)||{}):null;
    return Object.assign({},x,{full_name:u.full_name||'—',username:u.username||'',role:u.role||'',
      kid_name:(k&&k.full_name)?k.full_name:'همهٔ فرزندان'});
  });
  const q=(S.filters.subq||'').trim();
  const rows=subs.filter(function(r){return !q||(r.full_name+r.username+r.kid_name).includes(q);});"""
assert s.count(a1)==1,'E1'
s=s.replace(a1,b1)

a2="<thead><tr><th>کاربر</th><th>نقش</th><th>طرح</th><th>وضعیت</th><th>پایان</th><th>مبلغ</th><th></th></tr></thead>"
b2="<thead><tr><th>کاربر</th><th>نقش</th><th>فرزند</th><th>طرح</th><th>وضعیت</th><th>پایان</th><th>مبلغ</th><th></th></tr></thead>"
assert s.count(a2)==1,'E2'
s=s.replace(a2,b2)

a3="'<td class=\"small\">'+esc(roleFa(r.role))+'</td>'"
b3="'<td class=\"small\">'+esc(roleFa(r.role))+'</td>'\n          +'<td class=\"small\">'+esc(r.kid_name)+'</td>'"
assert s.count(a3)==1,'E3'
s=s.replace(a3,b3)

a4="data-act=\"sub-reset\" data-id=\"'+r.user_id+'\""
b4="data-act=\"sub-reset\" data-id=\"'+r.id+'\""
assert s.count(a4)==1,'E4'
s=s.replace(a4,b4)

open('src/js/23-subscription.js','w',encoding='utf8').write(s)
print('splice 23 OK')

# ── F: گاردِ فرزندبه‌فرزند در 07-shell.js
s=open('src/js/07-shell.js',encoding='utf8').read()
a5="""  if(parentLocked()&&free.indexOf(S.route)<0)
    return viewLocked();"""
b5="""  if(parentLocked()&&free.indexOf(S.route)<0)
    return viewLocked();
  /* قفلِ فرزندبه‌فرزند: اگر فرزندِ انتخاب‌شده اشتراکِ فعال نداشته باشد،
     فقط بخش‌های اشتراکیِ همان فرزند قفل می‌شوند (دادهٔ پایه رایگان است) */
  if(activePersona()==='parent'&&free.indexOf(S.route)<0&&S.child
     &&!studentSubOf(S.child,S.user.id,false).active)
    return viewLocked((byId('users',S.child)||{}).full_name);"""
assert s.count(a5)==1,'F1'
s=s.replace(a5,b5)
open('src/js/07-shell.js','w',encoding='utf8').write(s)
print('shell guard OK')

# ── G: P10_ACTIONS را با نسخهٔ تازه جایگزین (تا آخرِ فایل)
s=open('src/js/23-subscription.js',encoding='utf8').read()
i=s.find('/* ---------------- عملیات ---------------- */')
assert i>-1,'G1'
newacts=open('_new_actions.js',encoding='utf8').read().rstrip('\n')
s=s[:i]+newacts+'\n'
open('src/js/23-subscription.js','w',encoding='utf8').write(s)
print('actions OK')
