# نظام التصميم الموحّد — components/ui

المرجع الوحيد للألوان والخطوط والمكونات المشتركة في واجهة مجمع الرحمة. الاستيراد دائماً من `@/components/ui`.

```tsx
import { Alert, Badge, Button, Card, DataGrid, Empty, Field, ISelect, Modal, ReasonDialog, Segmented, Spinner, StatusBadge, type Column } from "@/components/ui";
```

| الملف | المحتوى |
|---|---|
| `core.tsx` | Alert, Button, Field, Spinner, Skeleton, Modal, ReasonDialog, Segmented, Card, Empty, `controlCls` |
| `badge.tsx` | Badge, StatusBadge |
| `iselect.tsx` | ISelect (combobox قابل للبحث، مفرد/متعدد)، `normalizeAr` |
| `data-grid.tsx` | DataGrid, CellStack, نوع Column |
| `tones.ts` | خرائط الدرجات الدلالية (soft/solid/outline/dot/icon) |

أغلفة متوافقة قديمة ما زالت تعمل وتبني على المكتبة: `Pill` و`Select` في `components/admin/kit.tsx` (فوق Badge وISelect)، و`Chip` في `components/staff/shell.tsx` (فوق Badge)، و`toast` في `components/toast.tsx` (يستخدم tones).

---

## 1. الألوان (التوكنز)

**المكان الوحيد:** `app/globals.css` (القيم، فاتح `:root` وداكن `[data-theme="dark"]`) + `tailwind.config.ts` (الأسماء).
القيم قنوات RGB حتى تعمل الشفافية: `bg-primary/20`. **لا** hex ولا `rgb()` ولا `bg-[#…]` داخل المكونات.
**لا أصفر ولا برتقالي** في النظام كله (فحص: انظر §8).

| التوكن | الاستخدام | فاتح | داكن |
|---|---|---|---|
| `bg` / `surface` | خلفية الصفحة / البطاقات | `#F3F7F9` / `#FFFFFF` | `#0B1E2E` / `#102739` |
| `line` / `line-strong` | الحدود (`line-strong` لحدود الحقول، ≥3:1 في الوضعين) | `#DEE7EB` / `#7D8F99` | `#244058` / `#608096` |
| `ink` `ink-2` `ink-3` `ink-muted` | النص (من الأقوى للأخف) | `#0C1E26` (17:1) … `#5E7079` (5.2:1) | `#ECF3F5` (13.6:1) … `#92A6B0` (6:1) |
| `on-accent` | نص فوق أي تعبئة صلبة (`bg-primary`، `bg-danger`…) | أبيض | `#061A22` داكن |
| `primary` (+`-strong` `-soft`) | الهوية: تركواز طبي | `#0E747C` | `#38BEC4` |
| `success` | نجاح/مدفوع | `#158052` أخضر | `#46CC96` |
| `warn` | **تنبيه** — برقوقي (plum/berry) بدل الأصفر | `#A33185` | `#EC88CC` |
| `danger` | خطر/خطأ | `#C42630` أحمر | `#FF8080` |
| `info` | معلومة | `#2360C4` أزرق | `#76A6F5` |
| `lab` | قسم المختبر (بنفسجي) | `#6A3EC4` | `#B092F5` |
| `pharm` | قسم الصيدلية (أزرق سماوي بدل البرتقالي) | `#0370A0` | `#54BCEC` |
| `brand-navy` / `brand-green` / `brand-green-strong` / `brand-green-deep` | ألوان الشعار في الموقع | `#163F66` / `#108062` / `#0C6850` / `#0E7056` | `#285C8C` / `#34C896` / `#6EDEB2` / `#0E7056` |
| `nav-medical` / `nav-finance` / `nav-active` | القائمة الجانبية حسب الدور، شاشة الانتظار، لوحة الدخول (داكنة في الوضعين) | `#0A3A40` / `#102C44` / `#168087` | نفسها |
| `on-nav` `on-nav-2` `on-nav-3` `on-nav-icon` | نص فوق خلفيات nav | أبيض / `#C9E4E5` / `#A6D8DA` / `#6FBFC3` | نفسها |
| `on-nav-success` `on-nav-warn` `on-nav-danger` | حالات فوق nav | `#7FDBB2` / `#F4B8E4` / `#FF9698` | نفسها |
| `--mark-*`, `--qr-*` | الشعار ورمز QR (أسود/أبيض دائماً) | — | — |

كل درجة دلالية لها ثلاث درجات: `DEFAULT` (تعبئة أو نص/أيقونة، ≥4.9:1 على السطح الفاتح و≥6:1 على الداكن)، `strong` (نص فوق `soft`، ≥6.6:1 في الوضعين)، `soft` (خلفية هادئة).
الحالات الأربع تختلف باللون **وبالأيقونة** (`TONE_ICON`: circle-check / triangle-alert / circle-alert / info) حتى لا يعتمد التمييز على اللون وحده.

**قواعد سريعة**
- نص عادي: `text-ink`، ثانوي: `text-ink-2`. لا تستخدم `text-ink-muted` لنص مهم.
- تعبئة ملونة صلبة؟ النص دائماً `text-on-accent` (وليس `text-white`) حتى يبقى مقروءاً في الداكن.
- شريط ملون كبير فيه عناصر بيضاء شفافة (`bg-white/15`): استخدم `bg-primary text-white dark:bg-primary-soft` (انظر ماسح الحجز والصيدلية).
- الاستثناءات الحرفية المقصودة فقط: `app/layout.tsx` (themeColor)، `app/manifest.ts`، `lib/agent/print-html.ts` (مستند طباعة منفصل)، و`bg-white`/`text-white`/`bg-black/45` المحايدة.

## 2. الخط وسُلّم الأحجام

خط واحد لكل شيء: **Readex Pro** (عربي ولاتيني وأرقام) محلياً عبر `@fontsource/readex-pro`. أُزيل Space Grotesk.
الصنف `.num` = نفس الخط + `tabular-nums` + اتجاه LTR معزول (للمبالغ والهواتف والرموز).

توكنز الحجم (Tailwind): `text-small`، `text-body`، `text-heading`، `text-display`. قيمها تتغير حسب التطبيق بصنف على الجذر:

| الصنف | أين | small / body / heading / display |
|---|---|---|
| `scale-staff` | `Shell` الموظفين — كثيف ومتوازن | 13 / 15 / 20 / 32px |
| `scale-patient` | تطبيق المريض — كبير وواضح (و`.sub` 15px) | 15 / 17 / 22 / 36px |
| `scale-display` | شاشة الانتظار — يُقرأ من بعيد | 22 / 30 / 44 / 140px |

`.sub` و`.sub-sm` للعناوين الفرعية الصغيرة (وزن 600، `ink-2`).

## 3. الشكل: نصف القطر، الزجاج، الحركة

- نصف القطر (16–24px): `rounded-control`/`rounded-field` = 16، `rounded-card` = 20، `rounded-panel` = 24. و`rounded-xl` = 16، `rounded-2xl` = 20، `rounded-3xl` = 24 (أُعيد تعريفها لتتبع الشاشات القديمة). `rounded-chip` = 8 للرقاقات الصغيرة جداً فقط (رمز فاتورة، مربع اختيار، جزء من حقل الوقت). `rounded-full` للشارات والأزرار الدائرية الصغيرة فقط.
- الزجاج (في `globals.css`، مع بديل صلب عند عدم دعم `backdrop-filter`):
  - `.glass` — بطاقات وحاويات: سطح 78% (82% داكن) + blur 16px. `Card` وDataGrid و`Panel` تستخدمه افتراضياً (`<Card solid>` لإلغائه).
  - `.glass-bar` — رأس عائم: blur 12px، سطح 18%، حد شعري 1px (مع طبقة `bg` خفيفة 50% لرفع تباين النص). مطبق على رأس الموظفين ورأس/شريط تطبيق المريض.
  - `.glass-dark` — فوق خلفيات nav (بطاقة الفرع في القائمة، لوحات شاشة الانتظار).
- الحركة: كل العناصر التفاعلية تنتقل خلال 200ms (`duration-fast/base/slow` = 150/200/250ms، `ease-out`). `.enter` ظهور لطيف، `.lift` رفع عند المرور. `prefers-reduced-motion` يلغي كل ذلك.
- الظلال: `shadow-glass`، `shadow-pop`، `shadow-float`، `shadow-card` (من `--shadow-ink`).

## 4. التاريخ والوقت — `lib/format.ts` فقط

| الدالة | المثال |
|---|---|
| `fmtDateTime(iso)` | `4 تشرين الثاني 2026 · 3:41 م` |
| `fmtDate(iso \| "YYYY-MM-DD")` | `4 تشرين الثاني 2026` |
| `fmtTime(iso \| "HH:mm")` | `9:30 ص` |
| `fmtTimeRange("08:00","23:30")` | `8:00 ص – 11:30 م` |
| `fmtDayMonth`، `fmtMonthYear`، `fmtWeekday`، `fmtWeekdayDate` | `4 تشرين الثاني`، `أيار 2026`، `الأربعاء`، `الأربعاء 4 تشرين الثاني` |
| `fmtTimesInText(text)` | يحوّل كل `HH:mm` في نص حر (ساعات الدوام) |
| `fmtIqd`، `fmtNum` | المبالغ |

- كل شيء بتوقيت بغداد (`BAGHDAD_TZ`). "HH:mm" من الـ API تُعامل كوقت بغداد محلي.
- المخرجات معزولة الاتجاه (U+2067…U+2069) لتظهر صحيحة داخل `.num`. للمقارنة أو نص خام استخدم `stripBidi()`.
- `lib/date.ts` لحساب القيم فقط (`todayBaghdad`، `addDays`).
- حقول الإدخال: `DateField` و`TimeField` و`DateTimeField` من `components/ui` فقط (عربي، 12 ساعة ص/م، والقيمة كما تُرسل للـ API: `YYYY-MM-DD` و`HH:mm` و`YYYY-MM-DDTHH:mm`). ممنوع `input type=date|time|datetime-local`.
- ممنوع: `toLocaleDateString`، `toLocaleTimeString`، `Intl.DateTimeFormat` للعرض خارج `lib/format.ts`.

## 5. المكونات

### Button
`variant`: `primary` (افتراضي) | `soft` | `ghost` | `danger` — `size`: `sm` | `md` | `lg` — `icon`، `loading`.
```tsx
<Button size="md" icon="save" loading={busy} onClick={save}>حفظ</Button>
```

### Field / controlCls
`<Field label icon error hint ltr secret …inputProps />`. لحقل خام: `<input className={controlCls} />`.

### Badge / StatusBadge
`tone`: success | warn | danger | info | primary | muted | lab | pharm — `variant`: soft | solid | outline — `size`: sm | md | lg — `icon` أو `dot`.
```tsx
const ST = { paid: { tone: "success", label: "مدفوع", icon: "circle-check" }, unpaid: { tone: "warn", label: "غير مدفوع" } } satisfies StatusMap;
<StatusBadge map={ST} value={row.payment_status} />
```

### ISelect (combobox)
مفرد أو متعدد، بحث مع تطبيع العربية، زر مسح، لوحة مفاتيح كاملة (↓↑ Home End Enter Esc Tab، Backspace يحذف آخر شارة)، RTL، portal بموضع ثابت (لا يُقص داخل Modal أو جدول)، `name`/`required` للنماذج.
```tsx
<ISelect label="الطبيب" value={docId} onChange={setDocId} options={docs?.map((d) => ({ value: d.id, label: d.name, hint: d.clinic }))} clearable />
<ISelect multiple label="الفروع" value={ids} onChange={setIds} options={branchOptions} loading={q.isPending} />
// غير متزامن: الأب يجلب حسب النص
<ISelect value={v} onChange={setV} options={remote.data} onSearch={setQ} filter={false} loading={remote.isFetching} />
```
`options` = undefined يعني «جارٍ التحميل». يظهر البحث تلقائياً عند أكثر من 6 خيارات (`searchable` للتحكم).

### DateField / TimeField / DateTimeField
```tsx
<DateField label="من" value={from} max={to} onChange={setFrom} />
<TimeField size="sm" aria-label="الفتح" value={open} onChange={setOpen} />
<DateTimeField label="الموعد" value={when} onChange={setWhen} />
```

### DataGrid
رأس ثابت داخل حاوية تمرير خاصة (أفقي/عمودي)، أعمدة رقمية (`numeric`: محاذاة للنهاية، أرقام جدولية)، zebra + hover، بحث مدمج، `filters`/`actions`/`title`، فرز (`sortable`)، ترقيم صفحات بالعميل مع حجم الصفحة (`pageSize`، 0 = بلا ترقيم)، حالات التحميل (هيكل رمادي) والفراغ والخطأ، اختيار صف (`onRowClick` + `selectedKey`، يعمل بـ Enter/Space).
```tsx
<DataGrid aria-label="الفواتير" rows={q.data?.items} loading={q.isPending} error={q.isError ? errorMessage(q.error) : undefined}
  rowKey={(i) => i.invoice_id} onRowClick={(i) => setSel(i.invoice_id)} selectedKey={sel}
  search={{ placeholder: "ابحث بالاسم" }} filters={<ISelect … />} empty={{ icon: "file-text", title: "لا توجد فواتير" }}
  columns={[
    { key: "patient_name", header: "المريض", sortable: true, cell: (i) => <CellStack title={i.patient_name} sub={i.file_number} /> },
    { key: "status", header: "الحالة", cell: (i) => <StatusBadge map={ST} value={i.status} /> },
    { key: "net_amount", header: "الصافي", numeric: true, sortable: true, cell: (i) => fmtNum(i.net_amount) },
  ]} />
```
`sticky` يثبّت عمود الإجراءات عند التمرير، و`expanded(row)` يرسم صف تفاصيل تحت الصف. `value(row)` يحدد ما يُبحث ويُفرز به (الافتراضي `row[key]`). أزرار داخل الخلايا في جدول قابل للنقر: أوقف الانتشار (`onClick={(e) => e.stopPropagation()}`) كما في `UserActions`.

### Modal / ReasonDialog / Alert / Empty / Spinner / Skeleton / Segmented / Card
كما كانت (نفس الواجهة). Modal يدعم `footer`، ويركّز على نفسه عند الفتح ويعيد التركيز عند الإغلاق.

## 6. ما نُقل إلى DataGrid / ISelect

- **DataGrid:** المحاسب (ملخص الفروع، أرباح الأطباء، التسويات، الفواتير، المصاريف، الذمم الآجلة)، الإدارة (المستخدمون، الخدمات، سجل التدقيق في الدمج، سجل النسخ الاحتياطي، الرسائل التجريبية)، الاستقبال (الطابور الحي)، الصيدلية (المصروف اليوم).
- **ISelect:** كل `Select` في الإدارة والمحاسب (عبر الغلاف في kit)، اختيار الطبيب في الحجز الهاتفي، «أصل خلال» في تطبيق المريض، الفروع والعيادات (متعدد) في نموذج المستخدم، حجم الصفحة في DataGrid.
- **باقٍ كقوائم بطاقات** (بيانات غير جدولية أو صفوف قابلة للتوسيع): سجل التدقيق للمحاسب (صفوف تتوسع)، اعتماد الاسترجاع، مطابقة الورديات، قوائم عمل المختبر/الأشعة (عمود جانبي ضيق)، سجل الاسترجاع اليوم في الاستقبال، صادر المزامنة، الأجهزة والفروع والأقسام والقوائم في الإدارة، سجل المريض للطبيب.

## 7. للوكلاء القادمين
- شاشة جديدة: ابدأ بـ `Card`/`Panel` + `DataGrid` + `ISelect` + `Badge`. لا تكتب جدولاً بـ grid يدوي ولا `<select>` خام.
- لون جديد؟ أضفه في `globals.css` (فاتح وداكن) ثم `tailwind.config.ts`، وتحقق من التباين ≥4.5:1 (يفضل 7:1 للنص).
- لا تضف رسوماً توضيحية جديدة (الصور الحقيقية قادمة عبر `lib/photos.ts`).

## 8. فحوص القبول
```bash
# لا ألوان دافئة (أصفر/برتقالي) — سكربت يفحص كل hex/rgb/توكن ويحسب التدرج اللوني
grep -rnE "amber-|orange-|yellow-|#F5C77E|warn: 233" app components lib   # يجب أن يكون فارغاً
grep -rnE "#[0-9a-fA-F]{3,8}\b|rgba?\([0-9]" app components lib | grep -v globals.css   # فقط الاستثناءات الثلاثة في §1
grep -rn "grotesk" app components lib package.json                       # فارغ
grep -rnE "toLocale(Date|Time)String|Intl\.DateTimeFormat|hour12" app components lib | grep -v lib/format.ts | grep -v lib/date.ts   # فارغ
npx tsc --noEmit -p .
```
