# اقرأني أولاً: دليل فريق الواجهة (Frontend) لمشروع الرحمة

## محتويات الفولدر
| الملف | ماذا فيه |
|---|---|
| `alrahma-backend-final.zip` | كود الباك اند كاملاً (.NET 8) |
| `alrahma-database-and-api.zip` | سكربت قاعدة البيانات `schema_v5.sql` + ملفات الترحيل + العقود |
| `api_contracts.md` | **المرجع الرسمي** لكل الـ endpoints: الطلب، الرد، الصلاحيات، الأخطاء |
| `swagger.json` | نفس الـ API بصيغة OpenAPI 3 للاستيراد في Postman أو توليد كود الربط |
| `.env.example` | أسماء إعدادات التشغيل بقيم مثال |

عند أي اختلاف بين `swagger.json` والعقود، **العقود هي المرجع**، وأبلغوا فريق الباك اند.

## 1. التشغيل المحلي

### الطريقة الأسهل: Docker
داخل فولدر الباك اند:
```
docker compose up --build
```
- الـ API: `http://localhost:8080` و Swagger: `http://localhost:8080/swagger`
- ينشئ القاعدة وMinIO وحساب المدير تلقائياً: `admin` / `Admin-Change-Me-2026`

### بدون Docker (Windows)
المتطلبات: .NET 8 SDK و PostgreSQL 16.
1. أنشئوا قاعدة فارغة (مثلاً `alrahma`) ونفذوا عليها `database/schema_v5.sql` (ينشئ كل الجداول من الصفر):
```
$env:PGCLIENTENCODING = "UTF8"
& "C:\Program Files\PostgreSQL\16\bin\psql.exe" -U postgres -d alrahma -f database\schema_v5.sql
```
2. اضبطوا الإعدادات (انظر `.env.example`) ثم شغّلوا من داخل فولدر الباك اند:
```
$env:ConnectionStrings__Default = "Host=localhost;Port=5432;Database=alrahma;Username=postgres;Password=..."
$env:Jwt__SigningKey = "نص-عشوائي-طويل-32-حرفاً-على-الأقل"
$env:Swagger__Enabled = "true"
$env:Cors__Origins__0 = "http://localhost:3000"
$env:Bootstrap__AdminUsername = "admin"
$env:Bootstrap__AdminPassword = "Admin-Change-Me-2026"
dotnet run --project src\AlRahma.Api --urls http://localhost:5186
```
3. تحققوا: `http://localhost:5186/health` يرجع ok، و `http://localhost:5186/swagger` يفتح.

> اسم القاعدة غير مهم، المهم أن يطابق `Database=` في سطر الاتصال.

## 2. أساسيات الربط
- **Base URL:** `http://localhost:5186/api/v1` (أو `:8080` مع Docker).
- **الصيغة:** JSON، أسماء الحقول `snake_case`، والمبالغ أعداد صحيحة بالدينار.
- **المعرفات:** UUID نصية، ويمكن توليدها في الواجهة (مفيد للعمل أوفلاين).
- **منع التكرار:** كل `POST` مالي أو ينشئ سجلاً يرسل الهيدر `Idempotency-Key: <uuid>`. عند إعادة المحاولة بسبب انقطاع النت أرسلوا **نفس** المفتاح.
- **الأخطاء:** بصيغة Problem Details، واعتمدوا على الحقل `code` (مثل `PATIENT_BANNED`) وليس على النص. القائمة الكاملة في الملحق (أ) من العقود.
- **التحديث اللحظي:** SignalR على `/hubs/live` (الطابور والإشعارات). التوكن يُمرر في `access_token` ضمن الـ query.

## 3. تسجيل الدخول والتوكن
**الموظفون:**
1. `POST /auth/login` بـ `username` و`password` (و`branch_id` إن كان الموظف على أكثر من فرع).
2. أرسلوا التوكن مع كل طلب: `Authorization: Bearer <access_token>`.
3. الـ access token يعيش **15 دقيقة**. عند رد 401 استدعوا `POST /auth/refresh` بالـ refresh token ثم أعيدوا الطلب.
4. `GET /auth/me` يعطي المستخدم ودوره وفرعه وصلاحياته، فاستخدموه لإظهار وإخفاء الشاشات.
5. التبديل بين الفروع: `POST /auth/switch-branch`. الخروج: `POST /auth/logout`.

**تطبيق المريض:** دخول برقم الهاتف + OTP (القسم 1 في العقود). في وضع التجربة الرمز دائماً **`000000`** ولا تُرسل رسائل حقيقية.

## 4. الأدوار
| الدور | المعنى |
|---|---|
| `admin` | المدير العام، كل شيء + النسخ الاحتياطي |
| `branch_manager` | مدير فرع |
| `doctor` | طبيب |
| `receptionist` | استقبال |
| `accountant` | محاسب |
| `lab_tech` | فني مختبر |
| `radiologist` | أخصائي أشعة |
| `pharmacist` | صيدلي |
| `patient` | مستخدم تطبيق المريض (توكن منفصل) |

كل endpoint في العقود له سطر **الصلاحية**. الطلب غير المسموح يرجع 403.

## 5. تجهيز بيانات للتجربة
بعد الدخول بحساب `admin` أنشئوا بالترتيب: العيادات والخدمات والأطباء (القسم 3)، ثم المستخدمين بأدوارهم (القسم 2: `POST /users`)، ثم جربوا الحجز والطابور والفوترة.

## 6. الخدمات المدفوعة
الرسائل SMS والإشعارات Push والدفع الإلكتروني تعمل كلها بوضع التجربة (`sandbox`) مجاناً. الـ endpoints وردودها نفسها في الإنتاج، فلا يحتاج الفرونت أي تغيير عند تفعيلها لاحقاً.

## 7. ملاحظات أمنية
- لا تضعوا كلمات مرور حقيقية في الكود أو في Git.
- لا تعملوا على نسخة من قاعدة المجمع الحقيقية، بل استخدموا قاعدة تجريبية من `schema_v5.sql`.
