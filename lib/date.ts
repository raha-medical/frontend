import { BAGHDAD_TZ } from "./config";
/** حساب التواريخ (قيم وليست عرضاً). التنسيق للعرض في lib/format.ts فقط. */
/** تاريخ اليوم بتوقيت بغداد YYYY-MM-DD (العقد 0.8) */
export const todayBaghdad = (d = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: BAGHDAD_TZ }).format(d);
export const addDays = (ymd: string, n: number) => { const d = new Date(`${ymd}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
/** اسم اليوم: يُعاد تصديره من lib/format (المصدر الوحيد للتنسيق). */
export { weekdayAr } from "./format";
