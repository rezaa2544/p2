/* ═══════════════════════════════════════════════════════════════════
   تقویم شمسی
   تبدیل میلادی و شمسی، انتخابگر تاریخ و قالب‌بندی فارسی.
   ═══════════════════════════════════════════════════════════════════ */
const J_MONTHS=['فروردین','اردیبهشت','خرداد','تیر','مرداد','شهریور','مهر','آبان','آذر','دی','بهمن','اسفند'];
const J_DAYS_SHORT=['ش','ی','د','س','چ','پ','ج'];
const _div=(a,b)=>Math.floor(a/b);
function toJalali(gy,gm,gd){
  const g=[0,31,59,90,120,151,181,212,243,273,304,334];
  let jy=gy<=1600?0:979; gy-=gy<=1600?621:1600;
  const gy2=gm>2?gy+1:gy;
  let days=365*gy+_div(gy2+3,4)-_div(gy2+99,100)+_div(gy2+399,400)-80+gd+g[gm-1];
  jy+=33*_div(days,12053); days%=12053;
  jy+=4*_div(days,1461); days%=1461;
  if(days>365){jy+=_div(days-1,365);days=(days-1)%365;}
  const jm=days<186?1+_div(days,31):7+_div(days-186,30);
  const jd=1+(days<186?days%31:(days-186)%30);
  return [jy,jm,jd];
}
function toGregorian(jy,jm,jd){
  let gy=jy<=979?621:1600; jy-=jy<=979?0:979;
  let days=365*jy+_div(jy,33)*8+_div((jy%33)+3,4)+78+jd+(jm<7?(jm-1)*31:(jm-7)*30+186);
  gy+=400*_div(days,146097); days%=146097;
  if(days>36524){gy+=100*_div(--days,36524);days%=36524;if(days>=365)days++;}
  gy+=4*_div(days,1461); days%=1461;
  if(days>365){gy+=_div(days-1,365);days=(days-1)%365;}
  let gd=days+1;
  const sal=[0,31,((gy%4===0&&gy%100!==0)||gy%400===0)?29:28,31,30,31,30,31,31,30,31,30,31];
  let gm=0; for(gm=1;gm<=12&&gd>sal[gm];gm++)gd-=sal[gm];
  return [gy,gm,gd];
}
const _p2=n=>String(n).padStart(2,'0');
const faD=v=>String(v).replace(/[0-9]/g,d=>'۰۱۲۳۴۵۶۷۸۹'[d]);
function isLeapJ(jy){const g=toGregorian(jy,12,30);const b=toJalali(g[0],g[1],g[2]);return b[0]===jy&&b[1]===12&&b[2]===30;}
const jMonthDays=(jy,jm)=>jm<=6?31:(jm<=11?30:(isLeapJ(jy)?30:29));
function isoToJalali(iso){ if(!iso)return '—'; const [y,m,d]=String(iso).slice(0,10).split('-').map(Number);
  if(!y||!m||!d)return '—'; const j=toJalali(y,m,d); return faD(j[0])+'/'+faD(_p2(j[1]))+'/'+faD(_p2(j[2])); }
function jalaliToIso(v){ if(!v)return ''; const s=String(v).replace(/[۰-۹]/g,d=>'۰۱۲۳۴۵۶۷۸۹'.indexOf(d));
  const m=s.match(/(\d{4})\D(\d{1,2})\D(\d{1,2})/); if(!m)return '';
  const g=toGregorian(Number(m[1]),Number(m[2]),Number(m[3])); return g[0]+'-'+_p2(g[1])+'-'+_p2(g[2]); }
function jalaliLongFa(iso){ if(!iso)return '—'; const d=new Date(String(iso).slice(0,10)+'T00:00:00');
  const j=toJalali(d.getFullYear(),d.getMonth()+1,d.getDate());
  const wd=['شنبه','یک‌شنبه','دوشنبه','سه‌شنبه','چهارشنبه','پنج‌شنبه','جمعه'][(d.getDay()+1)%7];
  return wd+' '+faD(j[2])+' '+J_MONTHS[j[1]-1]+' '+faD(j[0]); }
function monthMatrix(jy,jm){
  const days=jMonthDays(jy,jm); const g=toGregorian(jy,jm,1);
  const first=(new Date(g[0],g[1]-1,g[2]).getDay()+1)%7;
  const cells=[]; for(let i=0;i<first;i++)cells.push(null);
  for(let d=1;d<=days;d++){const gg=toGregorian(jy,jm,d);cells.push({jd:d,iso:gg[0]+'-'+_p2(gg[1])+'-'+_p2(gg[2])});}
  while(cells.length%7)cells.push(null);
  return cells;
}
/** ورودی تاریخ شمسی: به‌جای input[type=date] — مقدار پنهان همیشه میلادی است */
function jdate(id,val,opts){
  opts=opts||{};
  const v=val?String(val).slice(0,10):'';
  return '<div class="jdate" data-jd="'+id+'">'
    +'<input type="hidden" id="'+id+'" value="'+esc(v)+'" />'
    +'<button type="button" class="input jdate-btn" data-act="jd-open" data-r="'+id+'" aria-labelledby="jdate-label-'+escAttr(id)+'" aria-label="انتخاب تاریخ">'
    +'<span>📅</span><span class="jdate-val">'+(v?isoToJalali(v):'انتخاب تاریخ')+'</span></button>'
    +'<div class="jdate-pop" id="pop_'+id+'" hidden></div></div>';
}
function jdRender(id){
  const inp=$('#'+id), pop=$('#pop_'+id); if(!inp||!pop)return;
  const cur=inp.value||todayISO();
  const st=pop.dataset.view?pop.dataset.view.split('-').map(Number):toJalali(...cur.slice(0,10).split('-').map(Number)).slice(0,2);
  const jy=st[0], jm=st[1];
  const cells=monthMatrix(jy,jm);
  let html='<div class="jdate-head">'
    +'<button type="button" class="icon-btn" data-act="jd-prev" data-r="'+id+'">‹</button>'
    +'<b>'+J_MONTHS[jm-1]+' '+faD(jy)+'</b>'
    +'<button type="button" class="icon-btn" data-act="jd-next" data-r="'+id+'">›</button></div>'
    +'<div class="jdate-grid jdate-wd">'+J_DAYS_SHORT.map((d,i)=>'<span class="'+(i===6?'fri':'')+'">'+d+'</span>').join('')+'</div>'
    +'<div class="jdate-grid">';
  cells.forEach(function(c){
    if(!c){html+='<span></span>';return;}
    const sel=inp.value&&c.iso===inp.value.slice(0,10);
    const today=c.iso===todayISO();
    const fri=(new Date(c.iso+'T00:00:00').getDay()+1)%7===6;
    html+='<button type="button" class="jd'+(sel?' sel':'')+(today?' today':'')+(fri?' fri':'')+'" data-act="jd-pick" data-r="'+id+'" data-v="'+c.iso+'">'+faD(c.jd)+'</button>';
  });
  html+='</div><div class="jdate-foot"><button type="button" class="btn ghost sm" data-act="jd-pick" data-r="'+id+'" data-v="'+todayISO()+'">امروز</button>'
    +'<span class="small muted">'+(inp.value?jalaliLongFa(inp.value):'')+'</span></div>';
  pop.innerHTML=html; pop.dataset.view=jy+'-'+jm;
}
const JD_ACTIONS={
  'jd-open'(el){ const id=el.dataset.r, pop=$('#pop_'+id);
    document.querySelectorAll('.jdate-pop').forEach(p=>{if(p!==pop)p.hidden=true;});
    pop.hidden=!pop.hidden; if(!pop.hidden)jdRender(id); },
  'jd-prev'(el){ const id=el.dataset.r, pop=$('#pop_'+id); const v=pop.dataset.view.split('-').map(Number);
    let m=v[1]-1,y=v[0]; if(m<1){m=12;y--;} pop.dataset.view=y+'-'+m; jdRender(id); },
  'jd-next'(el){ const id=el.dataset.r, pop=$('#pop_'+id); const v=pop.dataset.view.split('-').map(Number);
    let m=v[1]+1,y=v[0]; if(m>12){m=1;y++;} pop.dataset.view=y+'-'+m; jdRender(id); },
  'jd-pick'(el){ const id=el.dataset.r, iso=el.dataset.v;
    $('#'+id).value=iso;
    const wrap=document.querySelector('[data-jd="'+id+'"]');
    if(wrap)wrap.querySelector('.jdate-val').textContent=isoToJalali(iso);
    $('#pop_'+id).hidden=true; },
};
document.addEventListener('click',function(e){
  if(!e.target.closest('.jdate'))document.querySelectorAll('.jdate-pop').forEach(p=>p.hidden=true);
},true);
