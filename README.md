# YadakShop Delivery

سامانه مدیریت و ردیابی آنلاین پیک شامل سه بخش است:

- `delivery-backend`: سرور، API و ارتباط با دیتابیس
- `delivery-panel`: پنل مدیریت و نمایش موقعیت پیک‌ها
- `delivery-app`: اپلیکیشن مخصوص پیک

## پیش‌نیازها

- Node.js
- npm
- MySQL
- Expo Go یا Android Studio برای اجرای اپلیکیشن

## اجرای Backend

```bash
cd delivery-backend
npm install
npm run dev
```

Backend به‌صورت پیش‌فرض روی پورت `3000` اجرا می‌شود. قبل از اجرا، فایل `.env` را با اطلاعات دیتابیس، حساب مدیر، `JWT_SECRET` و دامنه‌های مجاز CORS تنظیم کنید.

### توضیحات وظایف

روی سرور مدیریت‌شده، هر دیپلوی migrationهای جدید را پس از بک‌آپ دیتابیس و قبل از فعال‌سازی نسخه اجرا می‌کند. برای محیط توسعه:

```bash
cd delivery-backend
npm run migrate
```

Runner ترتیب اجرای فایل‌ها و سابقهٔ checksum آن‌ها را نگه می‌دارد و موارد اجراشده را تکرار نمی‌کند. جدول‌های قدیمی ۰۰۱ و ۰۰۲ بدون اجرای دوبارهٔ seed ثبت می‌شوند. پنل، بک‌اند و اپ پیک را با هم به‌روزرسانی کنید تا توضیحات اختیاری در گوشی هم نمایش داده شود. ثبت «انجام شد» فقط برای پیکِ همان وظیفه مجاز است.

جزئیات بک‌آپ، توقف در خطا و بازیابی در [راهنمای انتشار](ops/peik-deploy/README.md) آمده است. اجرای دستی و تأیید schema برای دیپلوی معمول نیاز نیست.

## اجرای پنل مدیریت

```bash
cd delivery-panel
npm install
npm run dev
```

آدرس Backend را در فایل `.env` پنل تنظیم کنید:

```env
VITE_API_URL=http://localhost:3000
```

پنل معمولاً در آدرس زیر اجرا می‌شود:

```text
http://localhost:5173
```

## اجرای اپلیکیشن پیک

```bash
cd delivery-app
npm install
npm start
```

آدرس Backend را در فایل `.env.local` تنظیم کنید:

```env
EXPO_PUBLIC_API_URL=http://YOUR_LOCAL_IP:3000
```

برای اجرای مستقیم روی اندروید:

```bash
npm run android
```

> برای اجرای اپ روی گوشی واقعی، گوشی و کامپیوتر باید به یک شبکه متصل باشند. به‌جای `YOUR_LOCAL_IP`، آدرس IP کامپیوتر را وارد کنید.


