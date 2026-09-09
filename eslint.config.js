/* ═══════════════════════════════════════════════════════════════════
   پایش — پیکربندیِ تحلیلِ ایستا (ESLint 10، فرمتِ flat)

   چرا flat؟ در ESLint 10 فرمتِ قدیمیِ .eslintrc حذف شده و تنها فرمتِ
   معتبر همین eslint.config.js است. (جزئیات تصمیم‌ها:
   docs/STATIC_ANALYSIS_SETUP.md §0)

   قراردادِ سطوح:
     error → سدِ CI؛ هر خطا بیلد را قرمز می‌کند (امروز: صفر خطا)
     warn  → صفِ بازبینیِ خوانا (~۶۰ هشدارِ مستند؛ غیرمسدودکننده)
     off   → نویزِ اثبات‌شده با دلیلِ مکتوب (پوششِ رفتاری با smoke/authz)

   اجرا:
     npm run lint            → بررسیِ کامل (exit 0 یعنی سبز)
     npm run lint -- --fix   → رفعِ خودکارِ خطاهایِ قابل‌رفع
   ═══════════════════════════════════════════════════════════════════ */
const js = require('@eslint/js');
const globals = require('globals');
const security = require('eslint-plugin-security');
const n = require('eslint-plugin-n');

module.exports = [
  /* ── چشم‌پوشی‌ها (آینهٔ .gitignore؛ در فرمت flat داخلِ همین فایل) ── */
  {
    ignores: [
      'node_modules/**',
      'dist/**',          // خروجیِ build (gitignore)
      'coverage/**',      // گزارشِ پوشش (gitignore)
      'server/data/**',   // دادهٔ زمان‌اجرا (gitignore، هرگز کامیت نمی‌شود)
      '_guide_shots/**',  // عکس‌هایِ بازتولیدشدنیِ راهنما (gitignore)
    ],
  },

  /* ── مجموعهٔ پیشنهادیِ ESLint (ده‌ها قانونِ error، بدونِ استثنا) ── */
  js.configs.recommended,

  /* ── فرانت‌اندِ تک‌فایلی: ماژول‌ها با build.js به‌هم چسبیده‌اند، پس
     ارجاعِ بینِ‌فایلی («تعریف‌نشده») و متغیرِ به‌ظاهر بلااستفاده، نویزِ
     ساختاری است نه عیب. پوششِ واقعی: smoke (۵۴۷ تست روی باندلِ نهایی). ── */
  {
    files: ['src/js/**/*.js'],
    languageOptions: { globals: { ...globals.browser } },
    rules: {
      'no-undef': 'off',              // ارجاعِ بینِ‌ماژولی (۸۶۳۶ نویز در پیمایش)
      'no-unused-vars': 'off',        // تابعِ استفاده‌شده در فایلِ دیگر
      'no-redeclare': 'off',          // ۳ موردِ تاریخی (۳۴/۳۹) — رفتار پایدار
      'no-useless-assignment': 'off', // نیازمند قضاوتِ تک‌تک؛ بازبینیِ دستی
      'no-empty': 'off',              // بلاکِ خالیِ عمدی (catch/حلقه)
    },
  },

  /* ── سرویس‌ورکرِ ریشه ── */
  {
    files: ['sw.js'],
    languageOptions: { globals: { ...globals.browser, ...globals.serviceworker } },
  },

  /* ── ابزارِ دستیِ اسکرین‌شات: کانتکستِ ترکیبیِ node + مرورگر
     (page.evaluate)؛ undef در آن معنا ندارد. نیازمند puppeteer
     (اختیاری، نصب‌نشده) — رجوع به n/no-missing-require. ── */
  {
    files: ['_shots.js'],
    languageOptions: { sourceType: 'commonjs', globals: { ...globals.node } },
    rules: { 'no-undef': 'off' },
  },

  /* ── کدِ node (سرور، ابزارها، اسکریپت‌ها، بیلد، همین کانفیگ).
     sourceType: commonjs چون return سطح‌بالا در CJS معتبر است. ── */
  {
    files: ['server/**/*.js', 'tools/**/*.js', 'scripts/**/*.js', 'build.js', 'eslint.config.js'],
    languageOptions: { sourceType: 'commonjs', globals: { ...globals.node } },
  },

  /* ── تست‌ها: مثلِ node + تابعِ gc (اجرای smoke با --expose-gc).
     tests/performance مجزاست (k6 با ESM). ── */
  {
    files: ['tests/**/*.js'],
    ignores: ['tests/performance/**'],
    languageOptions: { sourceType: 'commonjs', globals: { ...globals.node, gc: 'readonly' } },
  },

  /* ── ورکرِ Cloudflare + سناریوهای k6: ماژولِ ES + گلوبال‌های k6 ── */
  {
    files: ['cloudflare/worker.js', 'tests/performance/**/*.js'],
    languageOptions: {
      sourceType: 'module',
      globals: {
        ...globals.node,
        __VU: 'readonly', __ITER: 'readonly', __ENV: 'readonly', open: 'readonly',
      },
    },
  },

  /* ── قوانینِ امنیتی و node ── */
  {
    plugins: { security, n },
    rules: {
      /* === سدِ CI (error): صفر برخوردِ امروز، نگهبانِ آینده === */

      // eval با عبارت: تنها ۲ برخوردِ واقعی (۴۲-self-diagnostics، با مجوزِ
      // X2a و کامنتِ disable موضعی) — هر eval تازه بیلد را قرمز می‌کند.
      'security/detect-eval-with-expression': 'error',

      // child_process.exec با آرگومانِ غیرلیترال: صفر برخورد (ریپو فقط از
      // execFileSync/spawnSync با argv ثابت استفاده می‌کند). توجه: این قانون
      // الگویِ *Sync را نمی‌بیند (محدودیتِ اثبات‌شده) — پوشش با بازبینی.
      'security/detect-child-process': 'error',

      // ممنوعیتِ require کردنِ ماژول‌هایِ سراسریِ node (صفر برخورد).
      'n/prefer-global/buffer': 'error',
      'n/prefer-global/process': 'error',

      /* === صفِ بازبینی (warn): کم‌تعداد، خوانا، غیرمسدودکننده === */

      // require داینامیک (۲): هارنسِ تست + ابزارِ چک — عمدی.
      'security/detect-non-literal-require': 'warn',
      // ساختِ RegExp از رشته (۸): الگوهایِ تست — عمدی.
      'security/detect-non-literal-regexp': 'warn',
      // regex پرهزینه (۲): client-features و check-authz — نیازمند بازبینی.
      'security/detect-unsafe-regex': 'warn',
      // مقایسهٔ مستقیمِ راز (۲): مُهرِ محلیِ build.js (سرور timing-safe
      // است؛ این دو مقایسه فاقدِ مهاجمِ راه‌دورند).
      'security/detect-possible-timing-attacks': 'warn',
      // کاراکترِ دوزبانه (۴۲): ‎LRM تایپوگرافی در کامنت‌های فارسی — بی‌ضرر.
      'security/detect-bidi-characters': 'warn',
      // صفر برخورد؛ نگهبانِ آینده (الگویِ ناامنِ شناخته‌شده).
      'security/detect-pseudoRandomBytes': 'warn',
      'security/detect-buffer-noassert': 'warn',
      'security/detect-new-buffer': 'warn',
      'security/detect-disable-mustache-escape': 'warn',
      'security/detect-no-csrf-before-method-override': 'warn',
      // url.parse منسوخ (۱): pull.js — یادآوریِ مدرن‌سازی.
      'n/no-deprecated-api': 'warn',
      // وابستگیِ حل‌نشده (۱): puppeteer در _shots.js (ابزارِ دستی؛ نصب با
      // npm i -D puppeteer هنگامِ نیاز به اسکرین‌شات).
      'n/no-missing-require': 'warn',

      /* === نویزِ اثبات‌شده (off) با دلیل === */

      // ایندکس‌گذاریِ obj[key]: ۹۹۹ برخورد در سبکِ رایجِ ریپو (db[coll]).
      'security/detect-object-injection': 'off',
      // مسیرِ فایلِ داینامیک: ۴۳۲ برخورد (path.join در همه‌جا).
      'security/detect-non-literal-fs-filename': 'off',
      // گریزِ «\/» قراردادِ امنیتِ HTML درون‌خطی است (ضدِ </script>).
      'no-useless-escape': 'off',
      // فاصله‌هایِ چندتاییِ regex در فایل‌هایِ mutation عمدی‌اند.
      'no-regex-spaces': 'off',
      // عبارتِ باینریِ ثابت در تست (۱) — منطقِ تست، نه کدِ محصول.
      'no-constant-binary-expression': 'off',
      // متغیرِ «بلااستفاده»: ۵۰۰+ نویزِ بینِ‌فایلی/تستی.
      'no-unused-vars': 'off',
      'no-useless-assignment': 'off',
      'no-empty': 'off',
      // سبکِ تاریخیِ ریپو (var/نقل‌قول/==/const/نقطه‌ویرگول): هزاران برخوردِ
      // پیشینی؛ یکدست‌سازی نیازمندِ codemodِ جداگانه است، نه سدِ CI.
      'no-var': 'off',
      quotes: 'off',
      eqeqeq: 'off',
      'prefer-const': 'off',
      semi: 'off',
      'no-trailing-spaces': 'off',
      'eol-last': 'off',
      'comma-dangle': 'off',
      'object-curly-spacing': 'off',
      'array-bracket-spacing': 'off',
      'arrow-parens': 'off',
      'keyword-spacing': 'off',
      'space-before-blocks': 'off',
      // قراردادِ ریپو: اجرا با «node file.js» — shebang لازم نیست (۲۰۲).
      'n/hashbang': 'off',
      // مدرن‌سازیِ تدریجیِ APIهایِ node (۵۰) — نه سد.
      'n/no-unsupported-features/node-builtins': 'off',
    },
  },
];
