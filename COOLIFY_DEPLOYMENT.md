# النشر عبر Coolify

## المتطلبات

- خادم VPS يعمل عليه Coolify مع نطاق يمر عبر HTTPS.
- PostgreSQL داخل شبكة Coolify الخاصة فقط؛ لا تفتح منفذ PostgreSQL للإنترنت.
- مستودع GitHub متصل بـ Coolify.

## إعداد متغيرات البيئة

أنشئ القيم في Coolify ولا تضع أسرارًا في GitHub:

```env
DATABASE_URL=postgresql://qayd_app:STRONG_PASSWORD@postgres:5432/qayd?schema=public
SESSION_SECRET=generate-a-long-random-secret
APP_ORIGIN=https://your-domain.example
SMTP_HOST=smtp.example
SMTP_PORT=587
SMTP_USER=...
SMTP_PASSWORD=...
SMTP_FROM=...
STORAGE_DIR=/data/private-files
```

استخدم `backend/.env.example` و`.env.example` كمرجع للأسماء فقط. أنشئ مستخدم قاعدة بيانات مخصصًا للتطبيق ولا تستخدم حساب المدير العام.

## خطوات النشر

1. أنشئ خدمة PostgreSQL داخل Coolify واتركها بلا منفذ عام.
2. أنشئ خدمة التطبيق من هذا المستودع؛ يستخدم Dockerfile الجذري مع خدمة backend.
3. أضف المتغيرات السابقة واربط مجلدًا دائمًا بـ`/data/private-files` للمرفقات.
4. نفّذ `prisma migrate deploy` ضمن خطوة بدء/إصدار الخدمة قبل تشغيل الخادم.
5. اربط النطاق، فعّل HTTPS، واضبط `APP_ORIGIN` على النطاق النهائي بالضبط.
6. افحص `/api/health/ready` بعد النشر وسجل دخول مستخدم اختبار في بيئة منفصلة قبل تحويل المستخدمين.

## النسخ الاحتياطي والاستعادة

- نفّذ `scripts/backup.sh` من بيئة لديها وصول خاص إلى PostgreSQL ومجلد المرفقات.
- خزّن نسخ قاعدة البيانات والمرفقات معًا وبصلاحيات مقيدة.
- جرّب `scripts/restore.sh` أولًا على قاعدة/مجلد تجريبيين، وليس على الإنتاج.
- لا تستخدم أوامر reset أو drop في الإنتاج.
