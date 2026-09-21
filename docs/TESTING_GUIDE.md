# راهنمای تست و Verification

## سطوح

- **Unit/Static:** منطق محدود و deterministic.
- **Integrated Runtime (E3):** سرویس واقعی/DB/Redis در محیط کنترل‌شده.
- **Production-Equivalent (E4):** topology چندنودی واقعی + failure injection؛ در نبود آن E4 NOT VERIFIED است.

## پنج Pass اجباری

هر task معنادار باید پنج verification مستقل داشته باشد:

1. Functional / Happy Path
2. Boundary / Edge
3. Negative / Failure Injection
4. Concurrency / Replay / Resilience
5. Independent Regression / Environment Re-run

پنج بار اجرای یک command، پنج pass محسوب نمی‌شود.

## Evidence

هر نتیجه باید قابل ردیابی باشد:

- SHA
- environment
- exact command/test
- expected
- actual
- run count
- artifact/log در صورت نیاز

## Regression

هر defect اصلاح‌شده باید regression test مناسب داشته باشد. اگر failure جدیدی پیدا شد، چرخهٔ reproduce → diagnose → fix → test دوباره آغاز می‌شود.

## Failure domains

در تغییرات مرتبط، این موارد را بررسی کنید:

- malformed/empty/truncated input
- duplicate/replay/out-of-order
- concurrency/race
- timeout/retry/network degradation
- process crash/restart
- PG/Redis outage
- stale state
- migration/rollback
- observability and false-green paths

## Gate language

`VERIFIED` فقط با evidence روی Current HEAD مجاز است. `PARTIAL`، `NOT VERIFIED`، `BLOCKED` و `EXTERNAL BLOCKER` باید صریح و همراه با next action ثبت شوند.
