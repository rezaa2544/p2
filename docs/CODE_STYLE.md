# قرارداد سبک کدنویسی

این پروژه عمدتاً JavaScript/Node.js و SQL است و در client از Vanilla JS استفاده می‌کند.

## اصول

- نام‌گذاری بر اساس مسئولیت واقعی ماژول.
- توابع کوچک با ورودی/خروجی روشن.
- side effectها در boundaryهای مشخص نگه داشته شوند.
- validation و authorization در مرزهای مناسب انجام شوند؛ به UI اعتماد امنیتی نکنید.
- خطاها swallow نشوند؛ failure mode باید قابل مشاهده و قابل تست باشد.
- queryهای database پارامتری و قابل ردیابی باشند.
- dependency خارجی را بدون نیاز معماری اضافه نکنید.
- قراردادهای API و schema را با کد همگام نگه دارید.
- تغییرات unrelated cleanup را از feature/bugfix جدا کنید.

## Client

Client به‌صورت ماژولار در `src/js` نگهداری می‌شود ولی build آن را به artifact تک‌فایلی تبدیل می‌کند. `src/js/_order.json` ترتیب اجراست و تغییر آن باید با تست build/regression همراه باشد.

State مرکزی و rendering موجود پروژه باید با الگوهای فعلی سازگار بماند؛ refactor به framework یا state manager جدید بدون تصمیم معماری مجاز نیست.

## Server

Backend به ماژول‌های domain، data access، route، worker و infrastructure تفکیک شده است. قبل از ساخت فایل جدید بررسی کنید مسئولیت آن در ماژول موجود قابل قرارگیری هست یا نه.

`server/index.js` entrypoint بزرگ است؛ تغییرات جدید را تا حد امکان در module مناسب قرار دهید و فقط wiring را در entrypoint نگه دارید.

## SQL / migrations

- migrationها شماره‌دار و برگشت‌پذیر تا حد امکان.
- نام migration باید هدف را توضیح دهد.
- schema change باید با queryها و testهای مصرف‌کننده بررسی شود.
- migration ledger و runtime state باید در evidence لحاظ شوند.

## Documentation

- عنوان روشن و مشخص.
- اول یک خلاصهٔ کوتاه از purpose.
- سپس scope، usage، constraints و references.
- ادعاهای runtime با evidence و SHA پشتیبانی شوند.
- historical report از current guide جدا باشد.
