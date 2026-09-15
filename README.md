YadakShop Delivery
سامانه مدیریت و ردیابی آنلاین پیک شامل سه بخش:
- delivery-backend: سرور، API و ارتباط با دیتابیس
- delivery-panel: پنل مدیریت و نمایش موقعیت پیک‌ها
- delivery-app: اپلیکیشن مخصوص پیک
پیش‌نیازها
- Node.js
- npm
- MySQL
- Expo Go یا Android Studio برای اجرای اپلیکیشن
اجرای Backend
cd delivery-backend
npm install
npm run dev
Backend به‌صورت پیش‌فرض روی پورت 3000 اجرا می‌شود.
قبل از اجرا، فایل .env را با اطلاعات دیتابیس، حساب مدیر، JWT_SECRET و دامنه‌های مجاز CORS تنظیم کنید.
اجرای پنل مدیریت
cd delivery-panel
npm install
npm run dev
آدرس Backend را در فایل .env پنل تنظیم کنید:
VITE_API_URL=http://localhost:3000
پنل معمولاً در آدرس زیر اجرا می‌شود:
http://localhost:5173
اجرای اپلیکیشن پیک
cd delivery-app
npm install
npm start
آدرس Backend را در فایل .env.local تنظیم کنید:
EXPO_PUBLIC_API_URL=http://YOUR_LOCAL_IP:3000
برای اجرای مستقیم روی اندروید:
npm run android
برای اجرای اپ روی گوشی واقعی، گوشی و کامپیوتر باید به یک شبکه متصل باشند و به‌جای YOUR_LOCAL_IP، آی‌پی کامپیوتر وارد شود.
