# ارسال به گیت‌هاب

مخزن مقصد: `https://github.com/rezaa2544/p2.git`

همهٔ تغییرات **کامیت شده و آمادهٔ ارسال** است. من نمی‌توانم مستقیم
بفرستم چون کلید دسترسی گیت‌هاب در محیط من نیست.

---

## راه یکم: با توکن (ساده‌ترین)

یک توکن از گیت‌هاب بگیرید:
`Settings → Developer settings → Personal access tokens → Tokens (classic)`
با دسترسی `repo`.

سپس در پوشهٔ `payesh` این را اجرا کنید و به‌جای `TOKEN` توکن خود را بگذارید:

```bash
git push https://TOKEN@github.com/rezaa2544/p2.git HEAD:main
```

## راه دوم: اگر روی رایانهٔ خودتان گیت تنظیم است

```bash
git push -u origin HEAD:main
```

## اگر مخزن از قبل محتوا دارد و تعارض داد

مخزن `p2` پیش‌تر فایل `New folder.rar` داشت. اگر تعارض گرفتید:

```bash
git pull --rebase origin main    # ادغام با تاریخچهٔ موجود
git push origin HEAD:main
```

یا اگر می‌خواهید محتوای تازه جایگزین همه شود:

```bash
git push --force origin HEAD:main
```

> ⚠️ گزینهٔ `--force` تاریخچهٔ قبلی مخزن را پاک می‌کند.
> اگر آن فایل rar را لازم دارید، نخست از آن نسخهٔ پشتیبان بگیرید.

---

## آنچه فرستاده می‌شود

| بخش | محتوا |
|---|---|
| `index.html` | خروجی تک‌فایلی آمادهٔ اجرا |
| `src/` | ۴۰ ماژول جاوااسکریپت + ۳ شیوه‌نامه |
| `tests/` | ۳۱ آزمون ایستا + ۲۱۸ آزمون رفتاری |
| `docs/AI_PROMPT.md` | سند مرجع کامل پروژه |
| `CONTRIBUTING.md` | راهنمای برنامه‌نویس |
| `PROJECT_NOTES.md` | تاریخچهٔ کار |
| `build.js` | سازندهٔ خروجی |

پوشهٔ `reference/` و `node_modules/` فرستاده نمی‌شوند (در `.gitignore`).
