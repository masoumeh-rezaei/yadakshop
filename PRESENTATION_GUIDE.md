# راهنمای ارائه پروژه سامانه مدیریت ارسال

## معرفی کوتاه پروژه

این پروژه یک سامانه ردیابی پیک است که سه بخش مستقل دارد:

1. **اپ پیک (`delivery-app`)**: ورود پیک، دریافت مجوز GPS و ارسال موقعیت در پس‌زمینه.
2. **بک‌اند (`delivery-backend`)**: احراز هویت، مدیریت کاربران، ذخیره موقعیت‌ها و انتشار لحظه‌ای آن‌ها.
3. **پنل مدیریت (`delivery-panel`)**: نمایش پیک‌ها روی نقشه، مشاهده وضعیت آنلاین و مدیریت کاربران.

## جریان اصلی سیستم

این سناریو را در ارائه قدم‌به‌قدم توضیح بده:

1. پیک با شماره موبایل و رمز عبور وارد اپ می‌شود.
2. سرور اطلاعات را بررسی و یک JWT صادر می‌کند.
3. اپ بعد از دریافت مجوزهای لازم، موقعیت را در پس‌زمینه دریافت می‌کند.
4. هر موقعیت با درخواست `POST /api/locations` به سرور می‌رسد.
5. بک‌اند ابتدا رکورد را در MySQL ذخیره می‌کند.
6. سپس همان موقعیت با رویداد `location:update` در Socket.IO برای مدیران ارسال می‌شود.
7. پنل بدون refresh، marker همان پیک را روی نقشه جابه‌جا می‌کند.
8. هر ۳۰ ثانیه نیز پنل با REST همگام می‌شود تا قطعی موقت WebSocket مشکلی ایجاد نکند.

## فایل‌های مهم بک‌اند

- `delivery-backend/src/server.ts`: ساخت HTTP server، راه‌اندازی Socket.IO و گوش‌دادن روی پورت.
- `delivery-backend/src/app.ts`: تنظیم Express، CORS، JSON parser، routeها و مدیریت خطا.
- `delivery-backend/src/config/env.ts`: خواندن و اعتبارسنجی متغیرهای محیطی.
- `delivery-backend/src/config/database.ts`: pool اتصال MySQL.
- `delivery-backend/src/middleware/auth.ts`: اعتبارسنجی JWT، بررسی فعال‌بودن کاربر و کنترل نقش.
- `delivery-backend/src/routes/auth.routes.ts`: ورود و دریافت اطلاعات کاربر جاری.
- `delivery-backend/src/routes/users.routes.ts`: ایجاد، فهرست و فعال/غیرفعال‌کردن کاربران توسط مدیر.
- `delivery-backend/src/routes/locations.routes.ts`: ثبت موقعیت پیک و دریافت آخرین موقعیت یا تاریخچه.
- `delivery-backend/src/realtime.ts`: احراز هویت Socket.IO و انتشار موقعیت برای مدیران.
- `delivery-backend/src/scripts/create-admin.ts`: ساخت یا به‌روزرسانی مدیر اولیه.

## فایل‌های مهم اپ پیک

- `delivery-app/src/app/_layout.tsx`: layout اصلی، Provider احراز هویت و ثبت task پس‌زمینه.
- `delivery-app/src/app/index.tsx`: صفحه ورود و کنترل شروع/توقف ردیابی.
- `delivery-app/src/contexts/auth-context.tsx`: نگهداری وضعیت کاربر و بازیابی نشست.
- `delivery-app/src/services/api.ts`: ارتباط REST با بک‌اند.
- `delivery-app/src/services/token-storage.ts`: ذخیره امن توکن روی موبایل.
- `delivery-app/src/tasks/background-location.ts`: دریافت و ارسال GPS حتی در پس‌زمینه.
- `delivery-app/app.json`: تنظیمات Expo و مجوزهای سیستم‌عامل.

## فایل‌های مهم پنل مدیریت

- `delivery-panel/src/App.tsx`: انتخاب صفحه ورود یا داشبورد بر اساس نشست.
- `delivery-panel/src/auth.tsx`: مدیریت نشست مدیر در مرورگر.
- `delivery-panel/src/api.ts`: همه درخواست‌های REST پنل.
- `delivery-panel/src/components/Dashboard.tsx`: دریافت داده‌ها، اتصال Socket.IO و مدیریت state داشبورد.
- `delivery-panel/src/components/LiveMap.tsx`: نقشه Leaflet، markerها و تنظیم محدوده نقشه.
- `delivery-panel/src/components/AddUserModal.tsx`: فرم ایجاد مدیر یا پیک.
- `delivery-panel/src/styles.css`: ظاهر واکنش‌گرای پنل.

## نکات فنی مناسب ارائه

- رمز عبور خام ذخیره نمی‌شود و با `bcrypt` هش می‌شود.
- Queryها پارامتری هستند تا ریسک SQL injection کم شود.
- هم routeهای REST و هم اتصال Socket.IO احراز هویت جداگانه دارند.
- نقش `DRIVER` اجازه ارسال موقعیت دارد و نقش `ADMIN` اجازه مشاهده و مدیریت.
- وضعیت کاربر در هر درخواست از دیتابیس خوانده می‌شود؛ غیرفعال‌کردن حساب، توکن قبلی را هم بی‌اثر می‌کند.
- برای نمایش اولیه از REST و برای تغییرات سریع از WebSocket استفاده شده است.
- توکن موبایل در SecureStore نگهداری می‌شود، نه در state موقت برنامه.
- محدودیت اندازه JSON و فهرست مجاز CORS از تنظیمات امنیتی بک‌اند هستند.

## سؤال‌های احتمالی و جواب کوتاه

**چرا هم REST و هم Socket.IO؟**  
REST برای ورود، مدیریت و دریافت داده اولیه مناسب است؛ Socket.IO موقعیت جدید را بدون refresh به پنل می‌رساند.

**آنلاین بودن پیک چطور تشخیص داده می‌شود؟**  
اگر از آخرین موقعیت کمتر از دو دقیقه گذشته باشد، پنل او را آنلاین نشان می‌دهد.

**اگر WebSocket قطع شود چه می‌شود؟**  
پنل هر ۳۰ ثانیه یک همگام‌سازی REST دارد و Socket.IO نیز امکان اتصال مجدد دارد.

**آیا هر کاربر می‌تواند موقعیت‌ها را ببیند؟**  
خیر. routeهای مشاهده موقعیت و اتصال realtime فقط نقش `ADMIN` را می‌پذیرند.

**چرا location task بیرون کامپوننت تعریف شده؟**  
زیرا سیستم‌عامل باید بتواند task را وقتی رابط React روی صفحه نیست نیز اجرا کند.

## ترتیب پیشنهادی نمایش کد

1. از `delivery-backend/src/server.ts` شروع کن تا معماری کلی مشخص شود.
2. `delivery-backend/src/app.ts` را برای routeها نشان بده.
3. مسیر ورود را در `auth.routes.ts` و `middleware/auth.ts` توضیح بده.
4. مسیر کامل GPS را از `background-location.ts` تا `locations.routes.ts` دنبال کن.
5. سپس `realtime.ts` و listener موجود در `Dashboard.tsx` را کنار هم نشان بده.
6. در پایان `LiveMap.tsx` را نمایش بده و دمو را اجرا کن.

## نکات دمو قبل از جلسه

- مقادیر واقعی `.env` و مخصوصاً `JWT_SECRET` و رمز دیتابیس را روی پرده نشان نده.
- قبل از دمو، health endpoint، ورود مدیر و ورود پیک را آزمایش کن.
- GPS گوشی و مجوز «همیشه مجاز» را از قبل فعال کن.
- یک سناریوی جایگزین داشته باش: اگر GPS یا شبکه ضعیف بود، داده‌های قبلی دیتابیس را روی پنل نشان بده.
- موقع ارائه روی «جریان داده» تمرکز کن؛ لازم نیست تمام JSX یا CSS را خط‌به‌خط توضیح بدهی.
