/* ═══════════════════════════════════════════════════════════════════
   صفحهٔ ورود — بدونِ رمز (اصل: در محصول هیچ رمز کاربری نیست)
   جریان: شماره → کد (پنلِ پیامکی) → کد ملی (سامانهٔ تطبیقِ کد ملی)
   → «استعلام و ورود». 📄 docs/PLAN_PHONE_AUTH.md
   در نسخهٔ دمو کد روی همین صفحه نمایش داده می‌شود (پیامکِ واقعی
   ارسال نمی‌شود) — شبیه‌سازیِ صادقانهٔ درگاه.
   ═══════════════════════════════════════════════════════════════════ */

/* ── پنلِ پیامکی (درگاهِ شاهکار) — در دمو شبیه‌سازی ──────────────
   این سامانه **فقط کانالِ ارسالِ پیامک** است. در نسخهٔ واقعی: درگاهِ
   واقعی. عمداً جدا از سامانهٔ تطبیقِ کد ملی تعریف شده است (تصمیمِ
   کاربر ۲۰۲۶-۰۹-۰۵: «سامانهٔ تطبیقِ کد ملی با پنلِ پیامکی فرق دارد و
   جدا از هم تعریف می‌شوند»). */
const SmsPanel={
  log:[],
  _sent:null,
  sendCode(phone){
    const code=String(1000+Math.floor(Math.random()*9000));
    this._sent={phone:String(phone),code:code,at:Date.now()};
    this.log.push(this._sent);
    return code;
  },
  checkCode(phone,code){
    return !!(this._sent && this._sent.phone===String(phone)
              && this._sent.code===String(code||'').trim());
  },
  /* APIِ روخوانِ دمو (درگاهِ واقعی کد را هرگز نشان نمی‌دهد) */
  demoCode(){ return this._sent ? this._sent.code : ''; }
};

/* ── سامانهٔ تطبیقِ کد ملی (استعلامِ هویت) — جدا از پنلِ پیامکی ──
   در نسخهٔ واقعی: سرویسِ استعلامِ هویتِ مستقل؛ بانکِ هویت = دادهٔ
   پایهٔ مدرسه (همان اکسلِ ورود اطلاعات). پوستهٔ دمو پاسخش را شبیه
   می‌کند و **لاگِ استعلامِ خودش** را دارد. */
const IdmSystem={
  log:[],
  match(nid){
    const n=String(nid||'').trim();
    const ok=n.length>0 && db.users.some(function(u){return String(u.national_id)===n;});
    this.log.push({nid:n,ok:ok,at:Date.now()});
    return ok;
  }
};

/* تطبیقِ شمارهٔ همراه (فاصله/خط تیره بی‌اهمیت؛ ۱۰ رقمِ آخر هم کافی است) */
function normPhone(s){ return String(s||'').replace(/[\s\-()]/g,''); }
function phoneMatches(a,b){
  a=normPhone(a); b=normPhone(b);
  if(!a||!b) return false;
  if(a===b) return true;
  return a.length>=10 && b.length>=10 && a.slice(-10)===b.slice(-10);
}

function loginDemoHint(code){
  const d=document.getElementById('ldemo');
  if(d){ d.textContent='حالتِ دمو: پیامکِ واقعی ارسال نمی‌شود — کدِ این شماره '+code+' است'; d.style.display='block'; }
}
function loginErr(msg){
  /* S-73-C1: build the node — never innerHTML a server-originated string
     (defense in depth: a future caller must not be able to inject markup). */
  const box=document.getElementById('lerr');
  if(!box) return;
  box.textContent='';
  const d=document.createElement('div');
  d.className='badge b-red';
  d.style.padding='9px 12px';
  d.style.marginBottom='8px';
  d.textContent='⚠️ '+msg;
  box.appendChild(d);
}

function demoAccounts(){
  const s=db.users.find(u=>u.role==='student'), p=db.users.find(u=>u.role==='parent');
  return [db.users.find(u=>u.role==='superadmin'),db.users.find(u=>u.username==='edu_kurdistan'),db.users.find(u=>u.username==='manager1'),db.users.find(u=>u.username==='teacher1_1'),s,db.users.find(u=>u.username==='parent_multi')||p,db.users.find(u=>u.username==='counselor1')].filter(Boolean);
}
function renderLogin(){
  const accs=demoAccounts();
  return `<div class="login-wrap">
   <div class="login-art">
     <img class="login-logo" src="data:image/webp;base64,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" alt="پایش — سامانه هوشمند مدیریت مدرسه" />
   </div>
   <div class="login-panel"><div class="login-card">
     <h2>ورود به سامانه</h2>
     /* ⚠️ امنیت (پنتست ۲۰۲۶-۰۹-۰۵): پیش‌فرضِ حساب مدیریتی در فرم ورود
        ممنوع است — هر بازدیدکننده با یک کلیک وارد پرریسک‌ترین حساب می‌شد.
        حساب‌های نمونهٔ پایین همین کار را با یک کلیکِ آگاهانه انجام می‌دهند. */
     <div class="small muted" style="line-height:1.9;margin-bottom:10px">ورود با <b>شماره + کد + کد ملی</b> است — بدونِ رمز عبور.</div>
     <div class="field"><label>شمارهٔ همراه</label><input class="input" id="lpn" inputmode="tel" placeholder="09xxxxxxxxx" style="direction:ltr;text-align:left" /></div>
     <button class="btn" style="width:100%;justify-content:center;margin-bottom:8px;padding:9px" data-act="login-code">ارسالِ کد</button>
     <div class="field"><label>کد</label><input class="input" id="lcode" inputmode="numeric" placeholder="کد ۶ رقمی" style="direction:ltr;text-align:left" /></div>
     <div class="field"><label>کد ملی</label><input class="input" id="lnid" inputmode="numeric" placeholder="کد ملی ۱۰ رقمی" style="direction:ltr;text-align:left" /></div>
     <div id="ldemo" class="small" style="display:none;background:var(--soft,#eef2f7);border:1px dashed var(--border,#c9d4e0);border-radius:8px;padding:8px 10px;margin-bottom:8px;line-height:1.8"></div>
     <div id="lerr"></div>
     <button class="btn" style="width:100%;justify-content:center;padding:12px;font-size:15px" data-act="login">استعلام و ورود</button>
     <div class="login-sep">حساب‌های نمونه</div>
     ${accs.map(a=>`<div class="demo-item" data-act="pick" data-u="${escAttr(a.username)}">
        <span class="badge ${ROLE_BADGE[a.role]}">${ROLE_FA[a.role]}</span>
        <b>${esc(a.full_name)}</b>
        <span class="small muted" style="direction:ltr;margin-inline-start:auto">${esc(a.phone||'—')}</span></div>`).join('')}
     <div class="small muted" style="margin-top:16px;text-align:center"><span data-act="privacy-open" style="text-decoration:underline;cursor:pointer">سیاست حریم خصوصی و امنیت داده</span></div>
   </div></div></div>`;
}
