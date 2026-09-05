/* ═══════════════════════════════════════════════════════════════════
   توابع کمکی پایه
   همهٔ ابزارهای عمومی اینجاست: esc, fa, faD, rial, toast, $ و…
   ═══════════════════════════════════════════════════════════════════ */
const $ = (s,r=document)=>r.querySelector(s);
/* گزینش چندتایی: همیشه آرایهٔ واقعی برمی‌گرداند تا map/filter کار کند */
const $$ = (s,r=document)=>Array.prototype.slice.call(r.querySelectorAll(s));
const esc = s => String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
/* ---- امن‌سازی خروجی در برابر XSS ----
   دو تابع داریم چون دو جای متفاوت دو خطر متفاوت دارند:

   esc()     برای متنِ داخل تگ:  <b>${esc(u.full_name)}</b>
   escAttr() برای مقدار صفت:     <div data-x="${escAttr(v)}">

   تفاوت مهم: در صفت، حتی بدون کاراکتر کوچک‌تر می‌شود از کوتیشن فرار
   کرد و صفت تازه چسباند. پس هر مقدار پویا داخل صفت باید از escAttr
   رد شود، حتی اگر «فقط یک عدد» به نظر برسد؛ آن عدد فردا می‌تواند
   رشتهٔ واردکردهٔ کاربر شود.

   قاعده: هیچ مقدار پویایی بدون esc یا escAttr وارد innerHTML نشود. */
const escAttr = v => String(v??'').replace(/[&<>"'`=]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;','`':'&#96;','=':'&#61;'}[c]));
const fa = n => (n===null||n===undefined||n==='')?'—':Number(n).toLocaleString('fa-IR',{maximumFractionDigits:2});
const jalali = iso => { if(!iso) return '—'; try{ return new Intl.DateTimeFormat('fa-IR-u-ca-persian',{year:'numeric',month:'long',day:'numeric'}).format(new Date(iso)); }catch(e){ return iso; } };
const todayISO = ()=> new Date().toISOString().slice(0,10);
const daysAgoISO = d => { const t=new Date(); t.setDate(t.getDate()-d); return t.toISOString().slice(0,10); };
const DAYS=['شنبه','یکشنبه','دوشنبه','سه‌شنبه','چهارشنبه'];
const DAYS_FULL=['شنبه','یکشنبه','دوشنبه','سه‌شنبه','چهارشنبه','پنجشنبه','جمعه'];
const DEFAULT_WORK_DAYS=[0,1,2,3,4]; /* شنبه تا چهارشنبه — پنجشنبه اختیاری و پیش‌فرض خاموش (تصمیم کاربر) */
const ROLE_FA={superadmin:'سوپر ادمین',manager:'مدیر مدرسه',teacher:'دبیر',student:'دانش‌آموز',parent:'ولی',edu_office:'اداره آموزش و پرورش',counselor:'مشاور',driver:'راننده سرویس'};
const ROLE_BADGE={superadmin:'b-purple',manager:'b-blue',teacher:'b-green',student:'b-amber',parent:'b-gray',edu_office:'b-purple',counselor:'b-cyan'};
const ATT_FA={present:'حاضر',absent:'غایب',late:'تأخیر',excused:'موجه'};
const ATT_BADGE={present:'b-green',absent:'b-red',late:'b-amber',excused:'b-purple'};
const ATT_COLOR={present:'var(--green)',absent:'var(--red)',late:'var(--amber)',excused:'var(--purple)'};
const TERMS=['نوبت اول','نوبت دوم'];
/* امتحان نهایی (دور ۶۳، بند ۵): آزمون پایانیِ پایه‌های پایانی
   (نهم و دوازدهم). قاعدهٔ پایه در finalGradeOk (26-curriculum)
   اعمال می‌شود — خودِ فهرست قاعده ندارد تا گزینه برای همه
   در دسترس باشد و اعتبارسنجی در محل ثبت باشد. */
const EXAM_TYPES=['کلاسی','میان‌ترم','پایان‌ترم','عملی','امتحان نهایی'];
function toast(msg,type=''){const w=$('#toasts');const d=document.createElement('div');d.className='toast '+type;d.textContent=msg;w.appendChild(d);setTimeout(()=>d.remove(),3000);}
function empty(emoji,title,desc,btn){return `<div class="empty"><span class="emoji">${emoji}</span><h4>${esc(title)}</h4><div class="small">${esc(desc||'')}</div>${btn?`<div style="margin-top:14px">${btn}</div>`:''}</div>`;}
function bar(v,max,color){return `<div class="bar-track"><div class="bar-fill" style="width:${Math.min(100,(v/(max||1))*100)}%;background:${color}"></div></div>`;}
