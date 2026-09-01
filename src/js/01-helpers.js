/* ============================ helpers ============================ */
const $ = (s,r=document)=>r.querySelector(s);
const esc = s => String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fa = n => (n===null||n===undefined||n==='')?'—':Number(n).toLocaleString('fa-IR',{maximumFractionDigits:2});
const jalali = iso => { if(!iso) return '—'; try{ return new Intl.DateTimeFormat('fa-IR-u-ca-persian',{year:'numeric',month:'long',day:'numeric'}).format(new Date(iso)); }catch(e){ return iso; } };
const todayISO = ()=> new Date().toISOString().slice(0,10);
const daysAgoISO = d => { const t=new Date(); t.setDate(t.getDate()-d); return t.toISOString().slice(0,10); };
const DAYS=['شنبه','یکشنبه','دوشنبه','سه‌شنبه','چهارشنبه'];
const ROLE_FA={superadmin:'سوپر ادمین',manager:'مدیر مدرسه',teacher:'دبیر',student:'دانش‌آموز',parent:'ولی',edu_office:'اداره آموزش و پرورش'};
const ROLE_BADGE={superadmin:'b-purple',manager:'b-blue',teacher:'b-green',student:'b-amber',parent:'b-gray',edu_office:'b-purple'};
const ATT_FA={present:'حاضر',absent:'غایب',late:'تأخیر',excused:'موجه'};
const ATT_BADGE={present:'b-green',absent:'b-red',late:'b-amber',excused:'b-purple'};
const ATT_COLOR={present:'var(--green)',absent:'var(--red)',late:'var(--amber)',excused:'var(--purple)'};
const TERMS=['نوبت اول','نوبت دوم'];
const EXAM_TYPES=['کلاسی','میان‌ترم','پایان‌ترم','عملی'];
function toast(msg,type=''){const w=$('#toasts');const d=document.createElement('div');d.className='toast '+type;d.textContent=msg;w.appendChild(d);setTimeout(()=>d.remove(),3000);}
function empty(emoji,title,desc,btn){return `<div class="empty"><span class="emoji">${emoji}</span><h4>${esc(title)}</h4><div class="small">${esc(desc||'')}</div>${btn?`<div style="margin-top:14px">${btn}</div>`:''}</div>`;}
function bar(v,max,color){return `<div class="bar-track"><div class="bar-fill" style="width:${Math.min(100,(v/(max||1))*100)}%;background:${color}"></div></div>`;}
