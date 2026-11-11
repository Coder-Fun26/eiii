# صداخونه | Soundkhuneh

یک ساندبورد اجتماعی فارسی برای کشف، پخش و اشتراک افکت‌های صوتی کوتاه.

- **سایت:** https://coder-fun26.github.io/soundkhuneh/
- **مخزن:** https://github.com/Coder-Fun26/soundkhuneh
- **API:** https://soundboard-api.atbeen.workers.dev
- **فایل ویژه:** `site/assets/ei.mp3`

## امکانات
- رابط فارسی RTL، واکنش‌گرا و حالت روشن/تیره
- دکمه ویژه EI با فایل صوتی واقعی
- جست‌وجو، دسته‌بندی، مرتب‌سازی و علاقه‌مندی‌ها
- آپلود صدا با پیش‌نمایش
- کتابخانه مشترک با Cloudflare Worker و D1
- صف بررسی مدیر؛ فقط صداهای تأییدشده برای همه منتشر می‌شوند
- اعتبارسنجی نوع فایل، محدودیت ۴۵۰ کیلوبایت و سقف چهار ارسال در ساعت برای هر IP
- انتشار خودکار GitHub Pages از طریق GitHub Actions

## انتشار Pages
در مخزن به **Settings → Pages → Build and deployment → Source** برو و **GitHub Actions** را انتخاب کن. گردش‌کار موجود، پوشه `site/` را روی هر push به شاخه `main` منتشر می‌کند. پس از موفقیت workflow، سایت در نشانی بالا قرار می‌گیرد.

## زیرساخت
Worker با نام `soundboard-api` و پایگاه داده `soundboard_db` در Cloudflare ساخته شده‌اند. D1 در منطقه EU قرار دارد. چون R2 در حساب فعال نیست، این نسخه فایل‌های صوتی را به شکل BLOB در D1 نگه می‌دارد و اندازه هر فایل را به ۴۵۰ کیلوبایت محدود می‌کند.

Health check: https://soundboard-api.atbeen.workers.dev/api/health

## مدیریت محتوا
در پایین سایت روی «مدیریت محتوا» بزن و کلید مدیر را وارد کن. کلید مدیر در کد سایت یا مخزن قرار ندارد و در تنظیمات Worker نگه‌داری می‌شود. برای امنیت بهتر، مقدار `ADMIN_KEY` را در Cloudflare به Secret binding تبدیل کن و آن را در مخزن قرار نده.

## به‌روزرسانی Worker
روی سیستمی که Wrangler نصب و به حساب Cloudflare متصل است، از ریشه پروژه اجرا کن:

```bash
npx wrangler deploy
```

ساختار D1 در `worker/schema.sql` قرار دارد و تنظیمات اتصال در `wrangler.toml` است. فقط صداهایی را منتشر کن که اجازه اشتراک‌گذاری آن‌ها را داری.
