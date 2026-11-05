"use client";
/** محرر أوقات الدوام الأسبوعية للفرع (العقد 3.0): 7 أيام من السبت للجمعة، يوم مغلق أو فترة/فترتان بصيغة HH:mm. */
import { Icon } from "@/components/icon";
import { TimeField } from "@/components/ui";
import type { WeekdayCode, WorkingDay } from "@/lib/api/types";

export const WEEK: { code: WeekdayCode; ar: string }[] = [
  { code: "sat", ar: "السبت" }, { code: "sun", ar: "الأحد" }, { code: "mon", ar: "الاثنين" }, { code: "tue", ar: "الثلاثاء" },
  { code: "wed", ar: "الأربعاء" }, { code: "thu", ar: "الخميس" }, { code: "fri", ar: "الجمعة" },
];

export type DayState = { weekday: WeekdayCode; is_closed: boolean; shifts: { open: string; close: string }[] };

export function defaultWeek(): DayState[] {
  return WEEK.map((d) => ({ weekday: d.code, is_closed: d.code === "fri", shifts: d.code === "fri" ? [] : [{ open: "09:00", close: "21:00" }] }));
}
/** من جدول السيرفر إلى حالة المحرر (الأيام الناقصة مغلقة). */
export function weekFrom(schedule: WorkingDay[] | null | undefined): DayState[] {
  if (!schedule?.length) return defaultWeek();
  return WEEK.map((d) => {
    const s = schedule.find((x) => x.weekday === d.code);
    return s && !s.is_closed && s.shifts.length ? { weekday: d.code, is_closed: false, shifts: s.shifts.map((x) => ({ open: x.open.slice(0, 5), close: x.close.slice(0, 5) })) } : { weekday: d.code, is_closed: true, shifts: [] };
  });
}
export const weekToInput = (w: DayState[]) => w.map((d) => (d.is_closed ? { weekday: d.weekday, is_closed: true } : { weekday: d.weekday, shifts: d.shifts }));

/** فترة ثانية مقترحة تبدأ بعد نهاية الأولى. */
function secondShift(firstClose?: string) {
  const open = !firstClose || firstClose < "16:00" ? "16:00" : firstClose;
  return { open, close: open < "21:00" ? "21:00" : "23:59" };
}

const HM = /^([01]\d|2[0-3]):[0-5]\d$/;
/** نفس قواعد السيرفر (BranchHours.Parse): الإغلاق بعد الفتح، والفترة الثانية تبدأ بعد نهاية الأولى. المفتاح: "اليوم.الفترة". */
export function validateWeek(w: DayState[]): Record<string, string> {
  const e: Record<string, string> = {};
  w.forEach((d, i) => {
    if (d.is_closed) return;
    if (d.shifts.length < 1 || d.shifts.length > 2) { e[`${i}`] = "فترة أو فترتان لليوم، أو اجعله مغلقاً"; return; }
    let prev: string | null = null;
    d.shifts.forEach((s, j) => {
      const k = `${i}.${j}`;
      if (!HM.test(s.open) || !HM.test(s.close)) e[k] = "الوقت بصيغة HH:mm (24 ساعة)";
      else if (s.close <= s.open) e[k] = "وقت الإغلاق بعد وقت الفتح (للدوام الكامل 00:00 – 23:59)";
      else if (prev && s.open < prev) e[k] = "الفترة الثانية تبدأ بعد نهاية الأولى";
      prev = s.close;
    });
  });
  return e;
}

export function WorkingHoursEditor({ value, onChange, disabled }: { value: DayState[]; onChange: (w: DayState[]) => void; disabled?: boolean }) {
  const errs = validateWeek(value);
  const setDay = (i: number, d: Partial<DayState>) => onChange(value.map((x, k) => (k === i ? { ...x, ...d } : x)));
  const setShift = (i: number, j: number, p: Partial<{ open: string; close: string }>) => setDay(i, { shifts: value[i].shifts.map((s, k) => (k === j ? { ...s, ...p } : s)) });
  const copyToAll = (i: number) => onChange(value.map((x) => ({ ...x, is_closed: value[i].is_closed, shifts: value[i].shifts.map((s) => ({ ...s })) })));
  return (
    <div className="flex flex-col gap-2" role="group" aria-label="أوقات الدوام الأسبوعية">
      {value.map((d, i) => {
        const ar = WEEK[i].ar;
        return (
          <div key={d.weekday} className={`flex flex-col gap-2 rounded-2xl border p-3 transition-colors duration-base sm:flex-row sm:items-start ${d.is_closed ? "border-line bg-bg/60" : "border-line-strong bg-surface"}`}>
            <div className="flex items-center gap-2.5 sm:w-[170px] sm:pt-1.5">
              <label className="relative inline-flex cursor-pointer items-center" title={d.is_closed ? "مغلق" : "مفتوح"}>
                <input type="checkbox" role="switch" className="peer absolute inset-0 z-10 m-0 cursor-pointer opacity-0 disabled:cursor-not-allowed" checked={!d.is_closed} disabled={disabled} aria-label={`${ar}: ${d.is_closed ? "مغلق" : "مفتوح"}`}
                  onChange={(e) => setDay(i, e.target.checked ? { is_closed: false, shifts: d.shifts.length ? d.shifts : [{ open: "09:00", close: "21:00" }] } : { is_closed: true, shifts: [] })} />
                <span className="h-6 w-11 rounded-full bg-line-strong transition-colors duration-base peer-checked:bg-primary peer-focus-visible:ring-4 peer-focus-visible:ring-primary/25 peer-disabled:opacity-50" />
                <span className="absolute start-0.5 top-0.5 size-5 rounded-full bg-white shadow transition-transform duration-base peer-checked:-translate-x-5" />
              </label>
              <span className="w-16 font-semibold">{ar}</span>
              {d.is_closed && <span className="text-[13px] text-ink-muted">مغلق</span>}
            </div>
            {!d.is_closed && (
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                {d.shifts.map((s, j) => (
                  <div key={j} className="flex flex-col gap-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="sub-sm w-12">{j === 0 ? "الفترة 1" : "الفترة 2"}</span>
                      <TimeField size="sm" value={s.open} disabled={disabled} invalid={!!errs[`${i}.${j}`]} aria-label={`${ar} الفترة ${j + 1} من`} onChange={(v) => setShift(i, j, { open: v })} />
                      <span className="text-ink-muted">إلى</span>
                      <TimeField size="sm" value={s.close} disabled={disabled} invalid={!!errs[`${i}.${j}`]} aria-label={`${ar} الفترة ${j + 1} إلى`} onChange={(v) => setShift(i, j, { close: v })} />
                                            {j === 1 && !disabled && <button type="button" onClick={() => setDay(i, { shifts: d.shifts.slice(0, 1) })} aria-label={`حذف الفترة الثانية ليوم ${ar}`} title="حذف الفترة" className="grid size-8 place-items-center rounded-full text-danger hover:bg-danger-soft"><Icon name="x" size={15} /></button>}
                    </div>
                    {errs[`${i}.${j}`] && <span className="text-xs font-semibold text-danger-strong">{errs[`${i}.${j}`]}</span>}
                  </div>
                ))}
                {errs[`${i}`] && <span className="text-xs font-semibold text-danger-strong">{errs[`${i}`]}</span>}
              </div>
            )}
            {!disabled && (
              <div className="flex gap-1 sm:pt-1">
                {!d.is_closed && d.shifts.length < 2 && (
                  <button type="button" onClick={() => setDay(i, { shifts: [...d.shifts, secondShift(d.shifts[0]?.close)] })}
                    className="flex h-8 items-center gap-1 rounded-full px-2.5 text-xs font-semibold text-primary hover:bg-primary-soft"><Icon name="plus" size={14} />فترة ثانية</button>
                )}
                <button type="button" onClick={() => copyToAll(i)} title={`نسخ دوام ${ar} لكل الأيام`} aria-label={`نسخ دوام ${ar} لكل الأيام`} className="flex h-8 items-center gap-1 rounded-full px-2.5 text-xs font-semibold text-ink-2 hover:bg-bg"><Icon name="copy" size={14} />للكل</button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
