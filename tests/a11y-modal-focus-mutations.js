#!/usr/bin/env node
/**
 * a11y-modal-focus-mutations.js — جهش‌های رفعِ S9-4 (زنجیرهٔ فوکوسِ مودال)
 * ══════════════════════════════════════════════════════════════
 * هر جهش باید tests/a11y-modal-focus.js را سرخ کند (کشتنِ جهش)، وگرنه
 * تست ضعیف است. سه جهش:
 *   AM1 حذفِ گاردِ «بازنویسی‌نکردنِ بازکننده در مودالِ تودرتو» ⇒ AF2
 *   AM2 حذفِ fallbackِ .main در closeModal ⇒ AF6
 *   AM3 خنثی‌کردنِ جداکردنِ trap در closeModal ⇒ AF8
 *   AM4 حذفِ گاردِ «مودالِ بسته» ⇒ AF7 (closeModal نباید فوکوس بدزدد)
 *   AM5 حذفِ ثبتِ trap (چرخشِ Tab از کار بیفتد) ⇒ AF4/AF5/AF8
 * اجرا: node tests/a11y-modal-focus-mutations.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');
/* BH-mut فاز ۲ (الگوی امن p06/p11): جهش در کپیِ جدا؛ سورس اصلی و
   index.html هرگز بازنویسی نمی‌شوند — بازگردانیِ دستی و rebuildِ
   پایانی حذف شدند. */
const { session } = require('./helpers/mutant-kit');
const kit = session('amf-mut-');
kit.remapBuildOutputs(); /* index.html/USER_GUIDE.html/.build-cache.* → سایه */

const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;

function chk(c, m) { if (c) { pass++; console.log('  ✅ ' + m); } else { fail++; console.log('  ❌ ' + m); } }

let lastFile = null;
function mutate(file, from, to, killRe, tag) {
  const f = path.join(ROOT, file);
  if (lastFile && lastFile !== f) kit.clear(lastFile); /* فقط جهشِ جاری فعال */
  lastFile = f;
  const orig = fs.readFileSync(f, 'utf8');
  const bad = orig.replace(from, to);
  if (bad === orig) { chk(false, tag + ': جهش اعمال نشد (نماد پیدا نشد — لنگر را به‌روز کن)'); return; }
  kit.mutant(f, bad); /* کپی جدا؛ سورس اصلی دست‌نخورده */
  {
    execFileSync('node', ['build.js'], { cwd: ROOT, stdio: 'ignore', env: kit.env() });
    const r = spawnSync('node', [path.join(ROOT, 'tests', 'a11y-modal-focus.js')], { cwd: ROOT, encoding: 'utf8', env: kit.env() });
    const killed = r.status !== 0 && killRe.test(r.stdout || '');
    if (!killed && !/a11y-modal-focus: /.test(r.stdout || '')) {
      chk(false, tag + ' — خطای محیطی: چکِ موردِ انتظار هرگز چاپ نشد');
      return;
    }
    chk(killed, tag);
  }
}

console.log('\n▸ جهش‌های زنجیرهٔ فوکوسِ مودال (S9-4)');

/* AM1: بازکننده در مودالِ تودرتو بازنویسی شود (رفتارِ پیش از رفع) */
mutate('src/js/18-modals.js',
  "  if(!(host&&host.innerHTML.trim())){\n    _modalOpener=(document.activeElement&&document.activeElement!==document.body)?document.activeElement:null;\n  }",
  "  _modalOpener=(document.activeElement&&document.activeElement!==document.body)?document.activeElement:null; /* AM1 */",
  /❌ AF2/, 'AM1 حذفِ گاردِ بازکنندهٔ زنجیره‌ای ⇒ AF2 کشته شد');

/* AM2: fallbackِ .main حذف شود */
mutate('src/js/18-modals.js',
  "  const m=document.querySelector('.main');\n  if(m){\n    if(!m.hasAttribute('tabindex'))m.setAttribute('tabindex','-1');\n    try{m.focus();}catch(e){}\n  }",
  "  /* AM2: fallback حذف شد */",
  /❌ AF6/, 'AM2 حذفِ fallbackِ محتوای اصلی ⇒ AF6 کشته شد');

/* AM3: جداکردنِ trap در closeModal خنثی شود (نشتیِ شنونده) */
mutate('src/js/18-modals.js',
  "  if(el){el.removeEventListener('keydown',_modalTrap);el.innerHTML='';}",
  "  if(el){el.innerHTML='';} /* AM3 */",
  /❌ AF8/, 'AM3 خنثی‌کردنِ جداکردنِ trap ⇒ AF8 کشته شد');

/* AM4: شرطِ «مودالی باز نبود» حذف شود (closeModal بی‌قید فوکوس را بدزدد) */
mutate('src/js/18-modals.js',
  "  if(!wasOpen){_modalOpener=null;return;}",
  "  /* AM4: گاردِ مودالِ بسته حذف شد */",
  /❌ AF7/, 'AM4 حذفِ گاردِ مودالِ بسته ⇒ AF7 کشته شد');

/* AM5: اصلاً trap به #modal بسته نشود (کلِ چرخشِ Tab از کار بیفتد).
   یادداشتِ جهش: «حذفِ removeِ پیش از add» جهشِ *معادل* است — DOM ثبتِ یکسانِ
   (نوع، callback، capture) را ادغام می‌کند، پس رفتارِ مشاهده‌پذیری ندارد و
   عمداً در این هارنس نیست؛ خطِ مربوطه هم از کد برداشته شد. */
mutate('src/js/18-modals.js',
  "  $('#modal').addEventListener('keydown',_modalTrap);\n}\nfunction closeModal(){",
  "  /* AM5: trap بسته نشد */\n}\nfunction closeModal(){",
  /❌ AF4|❌ AF5|❌ AF8/, 'AM5 بی‌trap‌شدنِ مودال ⇒ چرخشِ Tab کشته شد');

console.log('\n────────────────────────────────────────────');
console.log(`جهش‌های فوکوسِ مودال: ${pass}/${pass + fail}` + (fail ? ' — ❌' : ' — همه کشته شدند ✅'));
console.log('────────────────────────────────────────────');
process.exit(fail ? 1 : 0);
