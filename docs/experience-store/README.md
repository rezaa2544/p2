# Payesh Engineering Experience Store (PEES)

**وضعیت:** فعال | **نسخه:** ۱.۰.۰ | **مالک:** Hermes (verifier) / ChatGPT Control Plane (promotion authority)
**مسیر فیزیکی:** `docs/experience-store/` + `tools/experience-store.js` + `tools/experience-benchmark.js`
**تست رگرسیون:** `node tests/experience-store.test.js` (۱۵ چک)

---

## ۱. هدف

تبدیل تجربهٔ واقعی Hermes در Payesh به دانش **قابل بازیابی، leakage-controlled، و cross-session**،
به‌گونه‌ای که:

- بین sessionها باقی بماند (فایل روی دیسک، خارج از runtime هر session)
- هرگز بر Current Repository Truth غلبه نکند
- مجرای مسموم‌سازی نداشته باشد (RAW هرگز canonical نمی‌شود)
- solution بِنچمارک را لو ندهد

## ۲. معماری

```
MISSION
   ↓
CURRENT REPO TRUTH (git rev-parse HEAD + source)     ← برندهٔ قطعی
   ↓
EXPERIENCE RETRIEVAL  (node tools/experience-store.js get)
   ↓
HERMES INDEPENDENT ANALYSIS
   ↓
SOURCE / TEST / RUNTIME EVIDENCE
   ↓
VERIFICATION → VERDICT
   ↓
POST-MISSION LEARNING  (add → validate → promote)
   ↓
EXPERIENCE STORE (docs/experience-store/experiences.jsonl)
```

**ممنوع:** `Experience → Verdict`. تجربه فقط context است.

## ۳. ذخیره‌ساز

| فایل | محتوا |
|---|---|
| `docs/experience-store/experiences.jsonl` | تجربه‌های VALIDATED/VERIFIED (قابل بازیابی) |
| `docs/experience-store/quarantine.jsonl` | تجربه‌های REJECTED (رج شده، audit trail حفظ شده) |
| `docs/experience-store/index.json` | ایندکس کلاس/شدت |

## ۴. چرخهٔ حیات یک تجربه

```
RAW → VALIDATED → VERIFIED → CANONICAL
                                  ↓
                        SUPERSEDED / RETIRED
```

- **CREATE:** هر agent (Atria candidate producer)
- **VALIDATE / VERIFY:** Hermes — نیازمند evidence خارجی (`git` / `test` / `tool-output`)؛
  ادعای خود agent به‌تنهایی evidence نیست.
- **PROMOTE:** ChatGPT Control Plane
- **SUPERSEDE:** Hermes + Control Plane
- **RETIRE:** Control Plane

تجربهٔ RAW هرگز در retrieval برنمی‌گردد.

## ۵. Leakage Protection (مطلق)

هر تجربه پیش از ورود به store اسکن می‌شود. سه سطح: `SAFE` / `QUARANTINED` / `REJECTED`.

**درهای ورودی به retrieval فقط `SAFE` است.** فقط رد کردن `REJECTED` کافی نیست:
یک تجربهٔ `QUARANTINED` (مثلاً sha_bound روی HEADی که عبور کرده)
با وجودِ وضعیتِ چرخهٔ حیاتِ VERIFIED باز هم نباید واردِ prompt شود.
فیلترِ `cmdGet` این ممنوعیت را اعمال می‌کند و یک regression-test آن را نگه
می‌دارد.

رد می‌شود اگر شامل باشد:
- SHAی fix بِنچمارک (۸ مورد PEB)
- فایل solution بِنچمارک
- بازتولید متنverbatim راه‌حل

اسرار (توکن گیت‌هاب، JWT، AWS، Slack، sk-*) به‌طور کامل ریجکت می‌شوند.

## ۶. قانون Current-HEAD Boundary

تجربهٔ `sha_bound` در retrieval برچسب می‌خورد:
- `CURRENT` — HEAD فعلی همان SHA است
- `STALE` — HEAD جابه‌جا شده → **REVALIDATION_REQUIRED**
- `HEAD_INDEPENDENT` — به SHA وابسته نیست

`STALE` در امتیاز retrieval کسر می‌شود و هرگز به‌عنوان حقیقت جاری نقل نمی‌شود.

## ۷. دستورها

```bash
node tools/experience-store.js add    <file.json>      # validate + ذخیره
node tools/experience-store.js get    "<query>" [N]    # بازیابی (پیش‌فرض ۱۲)
node tools/experience-store.js list   [--class X]
node tools/experience-store.js verify <id>             # ارتقا به VERIFIED
node tools/experience-store.js supersede <id> <newId>
node tools/experience-store.js audit                   # گزارش leakage/secret
node tools/experience-store.js stats                   # اندازه و رشد
node tools/experience-store.js boundary [sha]          # بررسی HEAD boundary
node tools/experience-benchmark.js baseline|plus-retrieval|plus-retrieval-skills
node tests/experience-store.test.js                    # ۱۵ چک رگرسیون
```

## ۸. Skill

`.agent/skills/payesh-engineering-experience/SKILL.md` — رویهٔ بازیابی + ۹ قانون سخت
(each evidence-backed). این skill در کنار ۷ skill رسمی موجود کار می‌کند و
`node tools/verify-agent-skills.js` همچنان ۷/۷ می‌ماند.

## ۹. غیرفعال‌سازی (rollback)

کاملاً قابل rollback:
```bash
rm -rf docs/experience-store tools/experience-store.js tools/experience-benchmark.js \
       tests/experience-store.test.js \
       .agent/skills/payesh-engineering-experience
```
هیچ فایل production، هیچ test موجود، و هیچ verifier تغییری نمی‌خورد.

## ۱۰. Evidence

| ادعا | دستور | نتیجه |
|---|---|---|
| Cross-session persistence | process B → `get` | تجربه توسط process مستقل بازیابی شد |
| Leakage defense | `add` با SHAی بِنچمارک | REJECTED، وارد store اصلی نشد |
| Secret defense | `add` با ghp_ token | exit 3، ذخیره نشد |
| HEAD boundary | `boundary <alien-sha>` | SHA-bound → STALE |
| Regression suite | `node tests/experience-store.test.js` | ۱۵ pass / ۰ fail |
| No repo regression | `npm test` | EXIT 0 — 547/547 |
| Skill framework intact | `node tools/verify-agent-skills.js` | ۷/۷ |
