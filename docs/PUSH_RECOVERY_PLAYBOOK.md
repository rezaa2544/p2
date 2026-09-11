# 📋 Push Recovery Playbook

**نسخه:** 1.0.0 · **تاریخ:** 2026-09-11 · **اپراتور:** چت ۱–۷
**مشکل:** حداقل ۷ sandbox در Arena هر کدام بین ۵ تا ۲۷ کامیت push‌نشده دارند. مجموع حدود ۱۰۰ کامیت. اگر sandbox ریست شود، همه از بین می‌روند.

---

## بخش ۱: چرا push نمی‌شود؟

مشکل ریشه‌ای در معماری Arena است:

1. **Session پس از مرج PR بسته می‌شود** — پس از اینکه یک sandbox در Arena کار خود را تمام می‌کند و PR مرج می‌شود، session آن قطع می‌شود.
2. **دسترسی GitHub قطع می‌شود** — Arena از توکن جلسه‌ای برای دسترسی به GitHub استفاده می‌کند که پس از بسته شدن session معتبر نیست.
3. **bundle تنها راه انتقال است** — تنها مکانیزم بقای کامیت‌ها، خروجی bundle از session قبلی است.
4. **بسته‌بندی مجازی** — هر sandbox در Arena یک bundle تولید می‌کند که تمام کامیت‌ها و تغییرات آن را در بر می‌گیرد.

> **اصل:** هرگز به sandbox متکی نباشید. همیشه bundle را محلی ذخیره کنید.

---

## بخش ۲: فهرست bundleهای موجود

| # | Sandbox | Bundle path | Branch | Commits | Base |
|---|---------|-------------|--------|---------|------|
| ۱ | چت ۱ (arena/01a08543-p2) | `p0-2-close-v3.bundle` | `arena/01a08543-p2` | ۱۱ | `origin/main` |
| ۲ | چت ۲ | `delta-scope-final.bundle` | `arena/01a08256-p2` | — | `origin/main` |
| ۳ | چت ۳ (feedback-widget) | `feedback-widget.bundle` | `arena/01a0843f-p2` | ۶ | `origin/main` |
| ۴ | چت ۴ (wave19-chaos) | `wave19-chaos-live.bundle` | `arena/01a08a4e-p2` | ۱۳ | `origin/main` |
| ۵ | چت ۵ (در جریان) | — | `arena/01a08c7a-p2` | ۲۷ | `origin/main` |
| ۶ | چت ۶ | `master-onboarding.bundle` + `vendor-playbook.bundle` | `arena/01a08c7a-p2` | — | `origin/main` |
| ۷ | چت ۷ (chat7-session6) | `chat7-session6.bundle` | `arena/01a08c7a-p2` | ۲۷ | `origin/main` |

> **توجه:** چت ۵ و چت ۶ و چت ۷ همگی بر روی شاخه `arena/01a08c7a-p2` ساخته شده‌اند. bundleهای چت ۶ ممکن است ترکیبی از تغییرات مستقل باشند.

### مکان ذخیره‌سازی bundleها

bundleها باید در مسیر محلی ذخیره شوند:
- `C:\Users\R.M\Documents\Default Project\bundles\` — برای bundleهای تولیدشده
- `C:\Users\R.M\Documents\Default Project\.swarm\` — برای فایل‌های حافظه Ruflo

---

## بخش ۳: دستور Push هر bundle در session جدید

### پیش‌نیازها

```bash
# ۱. نسخه‌های ابزارها را بررسی کنید
node --version          # باید ≥ 18 باشد
node tests/smoke.js     # باید ۵۴۷/۵۴۷ سبز باشد
node tools/check-authz.js  # باید ۰ بدهد
node tests/secret-scan.js  # باید ۱۱/۱۱ سبز باشد
node build.js --check   # باید exit 0 بدهد
```

### رویه Push (هر bundle)

```bash
# ۱. به main جدید برگردید
git checkout main
git pull origin main

# ۲. شاخه جدید push بسازید
git checkout -b push-<sandbox-name> main

# ۳. bundle را بررسی کنید
git bundle verify <bundle-file>

# ۴. از bundle فETCH کنید
git fetch <bundle-file> <ref>:<temp-branch>

# ۵. ادغام کنید (no-ff برای حفظ تاریخچه)
git merge <temp-branch> --no-ff

# ۶. تست‌های اجباری
node tests/smoke.js          # ۵۴۷/۵۴۷
node tools/check-authz.js     # ۰
node tests/secret-scan.js     # ۱۱/۱۱
node build.js --check         # exit 0

# ۷. push به گیت‌هاب (با توکن)
git push https://TOKEN@github.com/rezaa2544/p2.git HEAD:refs/heads/push-<sandbox-name>

# ۸. ساخت PR
gh pr create --title "push-recovery: <sandbox-name>" --base main --head push-<sandbox-name>
```

### توکن گیت‌هاب

توکن‌ها باید از کاربر دریافت شوند. از فایل `.git/config` ذخیره نکنید:

```bash
# استفاده از توکن (هر بار وارد کنید):
git push https://ghp_XXXX@github.com/rezaa2544/p2.git HEAD:refs/heads/push-<name>
```

> **اصل امنیتی:** توکن هرگز در کد، commit، یا فایل پروژه ذخیره نشود. پس از استفاده، از `.git/config` پاک شود.

---

## بخش ۴: بررسی و تأیید bundle

قبل از هر push، bundle باید بررسی شود:

```bash
# ساختار bundle را بررسی کنید
git bundle verify <bundle-file>

# خروجی مورد انتظار:
# - "Repository sanity checks passed"
# - "The bundle contains N refs"
# - "The bundle requires these privileges: ..."

# فهرست refs موجود در bundle:
git bundle list-refs <bundle-file>

# مقایسه شاخه‌های bundle با main فعلی:
git fetch <bundle-file> +refs/heads/*:refs/remotes/bundle/*
git log main..bundle/main --oneline  # تغییرات اضافه
```

### معیارهای قبول bundle

| معیار | مقدار مورد انتظار |
|-------|-------------------|
| smoke.js | ۵۴۷/۵۴۷ ✅ |
| check-authz.js | ۰ ✅ |
| secret-scan.js | ۱۱/۱۱ ✅ |
| build.js --check | exit 0 ✅ |
| تعداد کامیت در bundle | ۵–۲۷ (طبق هر sandbox) |
| بررسی مرج | بدون تداخل با main |

---

## بخش ۵: ترتیب اولویت‌بندی push

### اولویت ۱ (فوری): چت ۷ — chat7-session6.bundle
- **۲۷ کامیت** — بیشترین تعداد
- شاخه `arena/01a08c7a-p2`
- حاوی Wave 5 analysis, BUG fixes, و chat 7 merge queue
- **ریسک بالا:** بیشترین تغییر → بیشترین احتمال تداخل

### اولویت ۲: چت ۴ — wave19-chaos-live.bundle
- **۱۳ کامیت** — شاخه `arena/01a08a4e-p2`
- حاوی chaos testing infrastructure, wave19 chaos plan
- **ریسک متوسط:** تغییرات observability و testing

### اولویت ۳: چت ۱ — p0-2-close-v3.bundle
- **۱۱ کامیت** — شاخه `arena/01a08543-p2`
- حاوی academic years, phase 0.1/0.2
- **ریسک پایین:** فقط docs و feature additions

### اولویت ۴: چت ۳ — feedback-widget.bundle
- **۶ کامیت** — شاخه `arena/01a0843f-p2`
- حاوی feedback widget features
- **ریسک پایین**

### اولویت ۵: چت ۲ — delta-scope-final.bundle
- **دقت نامشخص** — بررسی تعداد کامیت‌ها لازم است

### اولویت ۶: چت ۶ — master-onboarding + vendor-playbook
- **دقت نامشخص** — bundleهای جداگانه

---

## بخش ۶: مدیریت تداخل و رفع عیب

### سناریوهای تداخل رایج

| سناریو | علت | رفع |
|--------|------|-----|
| تداخل در `USER_GUIDE.html` / `index.html` | Build stamp متفاوت | `node build.js` + `node tools/generate-write-perms.js` بازتولید |
| تداخل در `tests/smoke.js` | نسخه main superset است | از نسخه main استفاده کنید |
| تداخل در `HANDOFF.md` | ورودی‌های متعدد | keep-both (ورودی جدید بالا، قدیمی پایین) |
| تداخل در `server/policy.js` | قوانین مختلف PR | قوانین هر sandbox را به policy.js منتقل کنید |
| تداخل در `schema.sql` | تغییرات متعدد DDL | `node tools/migrate-to-pg.js` بازتولید |

### اصل اساسی

> **هرگز تغییر را دستی مرج نکنید.** همیشه ابزارهای پروژه (`node build.js`, `node tools/migrate-to-pg.js`, `node tools/generate-write-perms.js`) را اجرا کنید.

### رویه رفع تداخل

```bash
# ۱. شاخه push را از main جدید بسازید
git checkout -b push-<sandbox> main

# ۲. bundle را fetch و merge کنید
git fetch <bundle> <ref>:<temp-branch>
git merge <temp-branch> --no-ff

# ۳. اگر تداخل وجود داشت:
#    - فایل‌های build-generated را بازتولید کنید
#    - سایر تداخل‌ها را دستی رفع کنید
#    - تست‌ها را اجرا کنید

# ۴. تست نهایی
node tests/smoke.js
node tools/check-authz.js
node tests/secret-scan.js
node build.js --check
```

---

## بخش ۷: چک‌لیست اجباری قبل از هر push

### قبل از هر merge bundle:

- [ ] `git fetch origin main` — آخرین تغییرات main
- [ ] `git checkout -b push-<name> main` — شاخه تمیز از main
- [ ] `git bundle verify <bundle>` — bundle سالم است
- [ ] `git merge <temp-branch> --no-ff` — بدون fast-forward
- [ ] `node tests/smoke.js` — **۵۴۷/۵۴۷** ✅
- [ ] `node tools/check-authz.js` — **۰** ✅
- [ ] `node tests/secret-scan.js` — **۱۱/۱۱** ✅
- [ ] `node build.js --check` — **exit 0** ✅
- [ ] `git status` — تمیز (بدون فایل‌های بدون مرج)
- [ ] `git ls-remote origin push-<name>` — تأیید push روی ریموت

### قبل از push نهایی:

- [ ] توکن از کاربر دریافت شده
- [ ] فرمت push درست است: `git push https://TOKEN@github.com/rezaa2544/p2.git HEAD:refs/heads/push-<name>`
- [ ] PR ساخته شده با عنوان مناسب
- [ ] هر ۷ شاخه sandbox پشت سر هم push شده‌اند
- [ ] `git push origin main` — آخرین مرج به main

---

## بخش ۸: استراتژی پس از push — حفظ و بکاپ

### بعد از push هر bundle

```bash
# ۱. تأیید push روی ریموت
git ls-remote origin push-<sandbox-name>

# ۲. PR بسازید
gh pr create --title "push-recovery: <sandbox-name>" --base main

# ۳. شاخه را کپی کنید (بکاپ محلی)
git branch push-<sandbox-name>-backup push-<sandbox-name>

# ۴. bundle را به .swarm منتقل کنید
cp <bundle-file> .swarm/bundles/<bundle-file>
```

### بعد از مرج نهایی به main

```bash
# ۱. مرج آخرین PR به main
git checkout main
git pull origin main
git merge push-<last-sandbox> --no-ff

# ۲. push main
git push origin main

# ۳. شاخه‌های feature حذف شوند (طبق SKILLS §۶)
git push origin --delete push-<sandbox-name>

# ۴. تأیید نهایی
git log origin/main --oneline -10
git ls-remote origin main
```

### بکاپ و بازیابی

| مورد | روش |
|------|------|
| بکاپ bundleها | `.swarm/bundles/` |
| بکاپ شاخه‌ها | `git branch push-<name>-backup` |
| بکاپ memory Ruflo | `.swarm/memory.db` |
| بازیابی از bundle | `git bundle verify` + `git fetch` |
| بازیابی از شاخه | `git checkout push-<name>-backup` |

---

## پیوست: اطلاعات فنی

### خروجی مورد انتظار تست‌ها

```
# smoke.js
✅ 547/547 tests passed

# check-authz.js
✅ 0 authorization issues found

# secret-scan.js
✅ 11/11 secrets detected and handled

# build.js --check
✅ exit 0 — all permissions match
```

### مرج‌های شناخته‌شده از پیشینه

| مرج | شاخه محلی | ریموت | کامیت |
|-----|-----------|-------|--------|
| `ac70c4c` | `main` | `origin/main` | آخرین مرج |
| `ae2fe2b` | `feat/wave19-residuals` | PR #54 | Merge arena/01a08c7a-p2 |
| `dc5d60b` | — | `origin/main` (قبلی) | PR #6 merge |
| `17f31ac` | — | `origin/main` (قبلی) | PR #5 merge |

### مسیرهای کلیدی فایل‌ها

```
C:\Users\R.M\Documents\Default Project\
├── .swarm\                    # Ruflo memory + bundles
├── docs\                      # این سند و سایر مستندات
├── tests\
│   ├── smoke.js              # 547/547
│   ├── secret-scan.js        # 11/11
│   └── ...
├── tools\
│   ├── check-authz.js        # 0
│   ├── generate-write-perms.js
│   └── migrate-to-pg.js
├── build.js                  # --check mode
└── index.html                # Single-file distribution
```

### ارجاعات

- `SKILLS_MASTER.md` — اصول مهندسی ارشد
- `PUSH.md` — دستورالعمل‌های push به گیت‌هاب
- `PUSH_COMPLETION_REPORT.md` — گزارش push‌های قبلی
- `CHAT7_MERGE_QUEUE_FINAL_REPORT.md` — گزارش merge queue چت ۷
- `REMAINING_WORK_SUMMARY.md` — کارهای باقی‌مانده

---

**پایان سند.** 🚀
