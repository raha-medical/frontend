import { BAGHDAD_TZ } from "./config";

/* ==========================================================================
   المصدر الوحيد لتنسيق المبالغ والتواريخ والأوقات في الواجهة.
   - الأشهر بالتسمية العراقية/الشامية (كانون الثاني، شباط، …).
   - الوقت 12 ساعة مع ص / م ("9:30 ص"، "4:15 م").
   - كل الأوقات بتوقيت بغداد (BAGHDAD_TZ) مهما كانت منطقة جهاز المستخدم.
   - المدخلات: ISO بتوقيت UTC من السيرفر، أو "YYYY-MM-DD" (تاريخ تقويمي)، أو "HH:mm" (وقت محلي لبغداد).
   - المخرجات معزولة الاتجاه (RLI…PDI) حتى تُقرأ صحيحة داخل span.num (LTR) أو داخل نص عربي.
   لا تستخدم toLocaleDateString / Intl.DateTimeFormat خارج هذا الملف للعرض.
   (قيم حقول datetime-local وما يُرسل للـ API لا تمر من هنا.)
   ========================================================================== */

/** المبالغ أعداد صحيحة بالدينار، تُعرض بفواصل الآلاف وأرقام لاتينية. */
export const fmtIqd = (n: number | null | undefined) => (n == null ? "—" : `\u2067${Math.trunc(n).toLocaleString("en-US")} د.ع\u2069`);
export const fmtNum = (n: number | null | undefined) => (n == null ? "—" : n.toLocaleString("en-US"));

export const MONTHS_AR = ["كانون الثاني", "شباط", "آذار", "نيسان", "أيار", "حزيران", "تموز", "آب", "أيلول", "تشرين الأول", "تشرين الثاني", "كانون الأول"] as const;
export const WEEKDAYS_AR = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"] as const;
export const AM = "ص";
export const PM = "م";

const RLI = "⁧", PDI = "⁩";
const iso = (s: string) => `${RLI}${s}${PDI}`;
/** يحذف علامات عزل الاتجاه (للمقارنة أو لحقول نصية بحتة). */
export const stripBidi = (s: string) => s.replace(/[⁦-⁩]/g, "");

export type DateInput = string | number | Date | null | undefined;
type Parts = { y: number; m: number; d: number; h: number; min: number; wd: number; hasTime: boolean };

const YMD = /^(\d{4})-(\d{2})-(\d{2})$/;
const HM = /^(\d{1,2}):(\d{2})(?::\d{2}(?:\.\d+)?)?$/;

let _fmt: Intl.DateTimeFormat | null = null;
const fmt = () => (_fmt ??= new Intl.DateTimeFormat("en-US", { timeZone: BAGHDAD_TZ, year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit", hourCycle: "h23", weekday: "short" }));
const WD: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/** يحوّل أي مدخل إلى أجزاء بتوقيت بغداد. null إن كان فارغاً أو غير صالح. */
export function baghdadParts(v: DateInput): Parts | null {
  if (v == null || v === "") return null;
  if (typeof v === "string") {
    const ymd = YMD.exec(v);
    if (ymd) {
      const y = +ymd[1], m = +ymd[2], d = +ymd[3];
      return { y, m, d, h: 0, min: 0, wd: new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay(), hasTime: false };
    }
    const hm = HM.exec(v);
    if (hm) return { y: 0, m: 0, d: 0, h: +hm[1], min: +hm[2], wd: -1, hasTime: true };
  }
  const date = v instanceof Date ? v : new Date(v);
  if (isNaN(date.getTime())) return null;
  const p: Record<string, string> = {};
  for (const x of fmt().formatToParts(date)) p[x.type] = x.value;
  return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour % 24, min: +p.minute, wd: WD[p.weekday] ?? -1, hasTime: true };
}

const clock = (h: number, min: number) => `${h % 12 === 0 ? 12 : h % 12}:${String(min).padStart(2, "0")} ${h < 12 ? AM : PM}`;

/** "3:41 م" — يقبل ISO أو "HH:mm" (وقت بغداد كما يرسله السيرفر للجلسات). */
export function fmtTime(v: DateInput) {
  const p = baghdadParts(v);
  return p && p.hasTime ? iso(clock(p.h, p.min)) : "—";
}
/** مرادف واضح لأوقات "HH:mm" القادمة من الـ API (بداية/نهاية الجلسة). */
export const fmtClock = fmtTime;
/** "8:00 ص – 11:30 م" */
export function fmtTimeRange(from: DateInput, to: DateInput) {
  return iso(`${stripBidi(fmtTime(from))} – ${to ? stripBidi(fmtTime(to)) : "…"}`);
}
/** "4 تشرين الثاني 2026" */
export function fmtDate(v: DateInput) {
  const p = baghdadParts(v);
  return p && p.y ? iso(`${p.d} ${MONTHS_AR[p.m - 1]} ${p.y}`) : "—";
}
/** "4 تشرين الثاني 2026 · 3:41 م" */
export function fmtDateTime(v: DateInput) {
  const p = baghdadParts(v);
  if (!p || !p.y) return "—";
  return iso(`${p.d} ${MONTHS_AR[p.m - 1]} ${p.y}${p.hasTime && !(typeof v === "string" && YMD.test(v)) ? ` · ${clock(p.h, p.min)}` : ""}`);
}
/** "4 تشرين الثاني" */
export function fmtDayMonth(v: DateInput) {
  const p = baghdadParts(v);
  return p && p.y ? iso(`${p.d} ${MONTHS_AR[p.m - 1]}`) : "—";
}
/** "تشرين الثاني 2026" — يقبل "YYYY-MM" أيضاً. */
export function fmtMonthYear(v: DateInput) {
  if (typeof v === "string" && /^\d{4}-\d{2}$/.test(v)) v = `${v}-01`;
  const p = baghdadParts(v);
  return p && p.y ? iso(`${MONTHS_AR[p.m - 1]} ${p.y}`) : "—";
}
/** "الأربعاء" */
export function fmtWeekday(v: DateInput) {
  const p = baghdadParts(v);
  return p && p.wd >= 0 ? WEEKDAYS_AR[p.wd] : "—";
}
/** "الأربعاء 4 تشرين الثاني" */
export function fmtWeekdayDate(v: DateInput) {
  const p = baghdadParts(v);
  return p && p.y ? iso(`${WEEKDAYS_AR[p.wd]} ${p.d} ${MONTHS_AR[p.m - 1]}`) : "—";
}
/** اسم يوم الأسبوع لتاريخ "YYYY-MM-DD" (التوافق مع lib/date). */
export const weekdayAr = (ymd: string) => fmtWeekday(ymd);
/** يحوّل التواريخ "YYYY-MM-DD" والأوقات "HH:mm" داخل نص من السيرفر (شروط الحجز) إلى العرض العربي. */
export function fmtTextDates(text: string | null | undefined) {
  if (!text) return text ?? "";
  return fmtTimesInText(text.replace(/\b\d{4}-\d{2}-\d{2}\b/g, (d) => stripBidi(fmtDate(d))));
}
/** يحوّل أي "HH:mm" داخل نص حر (مثل ساعات الدوام "08:00–23:30") إلى 12 ساعة ص/م. */
export function fmtTimesInText(text: string | null | undefined) {
  if (!text) return text ?? "";
  return text.replace(/\b(\d{1,2}):(\d{2})\b/g, (all, h, m) => (+h < 24 && +m < 60 ? clock(+h, +m) : all));
}
