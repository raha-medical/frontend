"use client";
/** حقول التاريخ والوقت الموحّدة بالعربية (بدل input type=date/time/datetime-local التي تعرض لغة المتصفح):
 *  - DateField: تقويم عربي (الأسبوع يبدأ بالسبت، أشهر عراقية). القيمة "YYYY-MM-DD" كما تُرسل للـ API.
 *  - TimeField: ساعة 12 مع ص/م. القيمة "HH:mm" (24 ساعة) كما تُرسل للـ API.
 *  - DateTimeField: القيمة "YYYY-MM-DDTHH:mm" بنفس صيغة datetime-local.
 *  لوحة المفاتيح: في التقويم الأسهم تنقل بين الأيام، PageUp/PageDown للأشهر، Home/End لبداية ونهاية الأسبوع، Enter اختيار، Esc إغلاق.
 *  في الوقت الأسهم للأعلى/الأسفل تغيّر القيمة، وزر ص/م يقلب الفترة (أو حرفا ص وم). */
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Icon } from "../icon";
import { AM, MONTHS_AR, PM, fmtDate, fmtMonthYear } from "@/lib/format";
import { todayBaghdad } from "@/lib/date";

type Size = "sm" | "md" | "lg";
const H: Record<Size, string> = { sm: "h-10 text-sm", md: "h-[42px] text-sm", lg: "h-[50px] text-body" };
const BOX = "rounded-field border-[1.5px] bg-surface transition-[border-color,box-shadow] duration-base focus-within:border-primary focus-within:ring-4 focus-within:ring-primary/15";

const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;
const parts = (v: string) => ({ y: +v.slice(0, 4), m: +v.slice(5, 7), d: +v.slice(8, 10) });
const utc = (v: string) => { const p = parts(v); return Date.UTC(p.y, p.m - 1, p.d); };
/** يضيف أياماً إلى تاريخ تقويمي (بلا اعتماد على منطقة الجهاز). */
const plusDays = (v: string, n: number) => { const x = new Date(utc(v) + n * 86_400_000); return ymd(x.getUTCFullYear(), x.getUTCMonth() + 1, x.getUTCDate()); };
const plusMonths = (v: string, n: number) => {
  const p = parts(v); const t = p.y * 12 + (p.m - 1) + n; const y = Math.floor(t / 12), m = t % 12 + 1;
  return ymd(y, m, Math.min(p.d, new Date(Date.UTC(y, m, 0)).getUTCDate()));
};
/** عمود اليوم حين يبدأ الأسبوع بالسبت (0 = السبت). */
const col = (v: string) => (new Date(utc(v)).getUTCDay() + 1) % 7;
const clampDate = (v: string, min?: string, max?: string) => (min && v < min ? min : max && v > max ? max : v);

const WEEK_HEAD = [["س", "السبت"], ["ح", "الأحد"], ["ن", "الإثنين"], ["ث", "الثلاثاء"], ["ر", "الأربعاء"], ["خ", "الخميس"], ["ج", "الجمعة"]] as const;

type DateProps = {
  value: string | null | undefined;
  onChange: (v: string) => void;
  label?: ReactNode;
  /** أقل وأكبر تاريخ مسموح "YYYY-MM-DD". */
  min?: string; max?: string;
  placeholder?: string;
  disabled?: boolean; required?: boolean; clearable?: boolean;
  error?: string; hint?: string;
  size?: Size; icon?: string; className?: string;
  /** يبدأ التقويم بشبكة السنوات (لتاريخ الميلاد). */
  startInYears?: boolean;
  "aria-label"?: string;
};

export function DateField({ value, onChange, label, min, max, placeholder = "اختر التاريخ", disabled, required, clearable, error, hint, size = "lg", icon = "calendar-days", className = "", startInYears, ...rest }: DateProps) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"days" | "months" | "years">("days");
  // اليوم الذي عليه تركيز لوحة المفاتيح، ومنه يُشتق الشهر المعروض
  const [focus, setFocus] = useState(() => clampDate(value || todayBaghdad(), min, max));
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const POP_W = 304, POP_H = 372;

  const place = useCallback(() => {
    const r = trigger.current?.parentElement?.getBoundingClientRect();
    if (!r) return;
    const up = innerHeight - r.bottom < POP_H + 12 && r.top > innerHeight - r.bottom;
    const left = Math.min(Math.max(8, r.right - POP_W), innerWidth - POP_W - 8);
    setPos({ top: up ? Math.max(8, r.top - POP_H - 6) : Math.min(r.bottom + 6, Math.max(8, innerHeight - POP_H - 8)), left });
  }, []);
  useLayoutEffect(() => { if (open) place(); }, [open, place]);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { const t = e.target as Node; if (!trigger.current?.contains(t) && !pop.current?.contains(t)) setOpen(false); };
    addEventListener("resize", place); addEventListener("scroll", place, true); document.addEventListener("mousedown", onDoc);
    return () => { removeEventListener("resize", place); removeEventListener("scroll", place, true); document.removeEventListener("mousedown", onDoc); };
  }, [open, place]);
  useEffect(() => { if (open && view === "days") requestAnimationFrame(() => pop.current?.querySelector<HTMLElement>(`[data-day="${focus}"]`)?.focus()); }, [open, view, focus]);
  useEffect(() => { if (open && view !== "days") requestAnimationFrame(() => pop.current?.querySelector<HTMLElement>("[data-current]")?.focus()); }, [open, view]);

  const show = () => { if (disabled) return; setFocus(clampDate(value || todayBaghdad(), min, max)); setView(startInYears && !value ? "years" : "days"); setOpen(true); };
  const hide = (refocus = true) => { setOpen(false); if (refocus) trigger.current?.focus(); };
  const pick = (v: string) => { onChange(v); hide(); };
  const allowed = (v: string) => (!min || v >= min) && (!max || v <= max);
  const go = (next: string) => setFocus(clampDate(next, min, max));

  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); hide(); return; }
    if (e.key === "Tab") { const f = [...(pop.current?.querySelectorAll<HTMLElement>("button:not([disabled]):not([tabindex='-1'])") ?? [])]; const i = f.indexOf(document.activeElement as HTMLElement); if ((e.shiftKey && i <= 0) || (!e.shiftKey && i === f.length - 1)) { e.preventDefault(); f[e.shiftKey ? f.length - 1 : 0]?.focus(); } return; }
    if (view !== "days") return;
    // RTL: السهم الأيمن لليوم السابق بصرياً
    const map: Record<string, () => string> = {
      ArrowRight: () => plusDays(focus, -1), ArrowLeft: () => plusDays(focus, 1), ArrowUp: () => plusDays(focus, -7), ArrowDown: () => plusDays(focus, 7),
      PageUp: () => plusMonths(focus, e.shiftKey ? -12 : -1), PageDown: () => plusMonths(focus, e.shiftKey ? 12 : 1),
      Home: () => plusDays(focus, -col(focus)), End: () => plusDays(focus, 6 - col(focus)),
    };
    if (map[e.key]) { e.preventDefault(); go(map[e.key]()); }
  };

  const { y, m } = parts(focus);
  const first = ymd(y, m, 1);
  const lead = col(first);
  const count = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const today = todayBaghdad();
  const startY = Math.floor(y / 12) * 12;
  const display = value ? fmtDate(value) : "";

  return (
    <div className={`flex min-w-0 flex-col gap-1.5 ${className}`}>
      {label && <span id={`${id}-l`} className="sub">{label}{required && <span className="text-danger-strong"> *</span>}</span>}
      <div className={`relative flex items-center gap-2 px-3 ${H[size]} ${BOX} ${error ? "border-danger" : "border-line-strong"} ${disabled ? "opacity-60" : ""}`}>
        <button ref={trigger} type="button" id={id} disabled={disabled} onClick={() => (open ? hide(false) : show())} aria-haspopup="dialog" aria-expanded={open}
          aria-labelledby={label ? `${id}-l ${id}` : undefined} aria-label={label ? undefined : rest["aria-label"]} aria-invalid={error ? true : undefined}
          onKeyDown={(e) => { if (e.key === "ArrowDown") { e.preventDefault(); show(); } }}
          className="flex h-full min-w-0 flex-1 items-center gap-2 text-start outline-none disabled:cursor-not-allowed">
          <Icon name={icon} size={17} className="shrink-0 text-ink-muted" />
          {display ? <span className="num truncate text-ink">{display}</span> : <span className="truncate text-ink-muted">{placeholder}</span>}
        </button>
        {clearable && value && !disabled && <button type="button" onClick={() => onChange("")} aria-label="مسح التاريخ" className="shrink-0 text-ink-muted hover:text-ink"><Icon name="x" size={15} /></button>}
      </div>
      {error ? <span className="text-xs font-semibold text-danger-strong">{error}</span> : hint ? <span className="sub-sm">{hint}</span> : null}
      {open && pos && createPortal(
        <div ref={pop} role="dialog" aria-modal="true" aria-label="اختيار التاريخ" dir="rtl" onKeyDown={onKey} onClick={(e) => e.stopPropagation()} style={{ top: pos.top, left: pos.left, width: POP_W }}
          className="enter fixed z-[70] flex flex-col gap-2 rounded-2xl border border-line bg-surface p-3 text-ink shadow-pop">
          <div className="flex items-center gap-1">
            <PopBtn icon="chevron-right" label={view === "years" ? "السنوات السابقة" : view === "months" ? "السنة السابقة" : "الشهر السابق"} onClick={() => go(view === "years" ? plusMonths(focus, -144) : view === "months" ? plusMonths(focus, -12) : plusMonths(focus, -1))} />
            <button type="button" onClick={() => setView(view === "days" ? "months" : view === "months" ? "years" : "days")} aria-live="polite"
              className="num h-9 flex-1 rounded-xl text-sm font-bold hover:bg-primary-soft">
              {view === "days" ? fmtMonthYear(first) : view === "months" ? y : `${startY} – ${startY + 11}`}
            </button>
            <PopBtn icon="chevron-left" label={view === "years" ? "السنوات التالية" : view === "months" ? "السنة التالية" : "الشهر التالي"} onClick={() => go(view === "years" ? plusMonths(focus, 144) : view === "months" ? plusMonths(focus, 12) : plusMonths(focus, 1))} />
          </div>
          {view === "days" && (
            <div role="grid" aria-label={MONTHS_AR[m - 1]} className="grid grid-cols-7 gap-0.5">
              {WEEK_HEAD.map(([s, full]) => <span key={full} role="columnheader" aria-label={full} title={full} className="grid h-7 place-items-center text-xs font-semibold text-ink-3">{s}</span>)}
              {Array.from({ length: lead }, (_, i) => <span key={`e${i}`} aria-hidden />)}
              {Array.from({ length: count }, (_, i) => {
                const v = ymd(y, m, i + 1), sel = v === value, isToday = v === today, ok = allowed(v);
                return (
                  <button key={v} type="button" role="gridcell" data-day={v} disabled={!ok} tabIndex={v === focus ? 0 : -1} aria-selected={sel} aria-current={isToday ? "date" : undefined} aria-label={fmtDate(v).replace(/[⁦-⁩]/g, "")}
                    onClick={() => pick(v)} onFocus={() => setFocus(v)}
                    className={`num grid h-9 place-items-center rounded-xl text-sm disabled:cursor-not-allowed disabled:opacity-30 ${sel ? "bg-primary font-bold text-on-accent" : isToday ? "font-bold text-primary-strong ring-1 ring-inset ring-primary" : "hover:bg-primary-soft"}`}>{i + 1}</button>
                );
              })}
            </div>
          )}
          {view === "months" && (
            <div className="grid grid-cols-3 gap-1">
              {MONTHS_AR.map((name, i) => <button key={name} type="button" data-current={i + 1 === m ? "" : undefined} onClick={() => { go(ymd(y, i + 1, Math.min(parts(focus).d, new Date(Date.UTC(y, i + 1, 0)).getUTCDate()))); setView("days"); }}
                className={`h-11 rounded-xl text-[13px] font-semibold ${i + 1 === m ? "bg-primary-soft text-primary-strong" : "hover:bg-primary-soft"}`}>{name}</button>)}
            </div>
          )}
          {view === "years" && (
            <div className="grid grid-cols-3 gap-1">
              {Array.from({ length: 12 }, (_, i) => startY + i).map((yr) => {
                const bad = (!!min && `${yr}-12-31` < min) || (!!max && `${yr}-01-01` > max);
                return <button key={yr} type="button" disabled={bad} data-current={yr === y ? "" : undefined} onClick={() => { go(ymd(yr, m, Math.min(parts(focus).d, new Date(Date.UTC(yr, m, 0)).getUTCDate()))); setView("months"); }}
                  className={`num h-11 rounded-xl text-sm font-semibold disabled:opacity-30 ${yr === y ? "bg-primary-soft text-primary-strong" : "hover:bg-primary-soft"}`}>{yr}</button>;
              })}
            </div>
          )}
          <div className="flex items-center justify-between border-t border-line pt-2">
            <button type="button" disabled={!allowed(today)} onClick={() => pick(today)} className="rounded-xl px-2.5 py-1.5 text-[13px] font-semibold text-primary hover:bg-primary-soft disabled:opacity-40">اليوم</button>
            <button type="button" onClick={() => hide()} className="rounded-xl px-2.5 py-1.5 text-[13px] font-semibold text-ink-2 hover:bg-bg">إغلاق</button>
          </div>
        </div>, document.body)}
    </div>
  );
}

function PopBtn({ icon, label, onClick }: { icon: string; label: string; onClick: () => void }) {
  return <button type="button" onClick={onClick} aria-label={label} title={label} className="grid size-9 shrink-0 place-items-center rounded-xl text-ink-2 hover:bg-primary-soft"><Icon name={icon} size={17} /></button>;
}

// ------------------------------------------------------------------ الوقت
const HM = /^(\d{1,2}):(\d{2})/;
const split = (v: string | null | undefined) => {
  const m = HM.exec(v ?? "");
  if (!m) return { h12: "", mm: "", pm: false };
  const h = +m[1];
  return { h12: String(h % 12 === 0 ? 12 : h % 12), mm: m[2], pm: h >= 12 };
};
const join = (h12: number, mm: number, pm: boolean) => `${pad((h12 % 12) + (pm ? 12 : 0))}:${pad(mm)}`;

type TimeProps = {
  value: string | null | undefined;
  onChange: (v: string) => void;
  label?: ReactNode;
  disabled?: boolean; required?: boolean;
  error?: string; hint?: string; invalid?: boolean;
  size?: Size; className?: string;
  /** خطوة أسهم الدقائق. */
  minuteStep?: number;
  "aria-label"?: string;
};

export function TimeField({ value, onChange, label, disabled, required, error, hint, invalid, size = "lg", className = "", minuteStep = 5, ...rest }: TimeProps) {
  const id = useId();
  const name = rest["aria-label"] ?? (typeof label === "string" ? label : "الوقت");
  const v = split(value);
  const minRef = useRef<HTMLInputElement>(null);
  // نص الكتابة أثناء التركيز، حتى يكتب المستخدم "1" ثم "12" دون قفز
  const [hText, setHText] = useState<string | null>(null);
  const [mText, setMText] = useState<string | null>(null);
  const emit = (h: number, m: number, pm: boolean) => onChange(join(h, m, pm));
  const curH = Number(v.h12) || 12, curM = Number(v.mm) || 0;
  const step = (kind: "h" | "m", d: number) => {
    if (disabled) return;
    if (kind === "h") { const total = ((curH % 12) + (v.pm ? 12 : 0) + d + 24) % 24; emit(total % 12 === 0 ? 12 : total % 12, curM, total >= 12); }
    else { const total = (curM + d + 60) % 60; emit(curH, total, v.pm); }
  };
  const keys = (kind: "h" | "m") => (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowUp") { e.preventDefault(); step(kind, kind === "h" ? 1 : minuteStep); }
    else if (e.key === "ArrowDown") { e.preventDefault(); step(kind, kind === "h" ? -1 : -minuteStep); }
    else if (e.key === "ص" || e.key.toLowerCase() === "a") { e.preventDefault(); emit(curH, curM, false); }
    else if (e.key === "م" || e.key.toLowerCase() === "p") { e.preventDefault(); emit(curH, curM, true); }
  };
  const cell = "num w-[2.1ch] min-w-[26px] bg-transparent text-center font-semibold text-ink outline-none placeholder:text-ink-muted focus:rounded-chip focus:bg-primary-soft disabled:cursor-not-allowed";
  return (
    <div className={`flex min-w-0 flex-col gap-1.5 ${className}`}>
      {label && <span id={`${id}-l`} className="sub">{label}{required && <span className="text-danger-strong"> *</span>}</span>}
      {/* الترتيب البصري "9:30 ص" داخل صفحة RTL: الفترة يساراً ثم الساعة:الدقيقة */}
      <div role="group" aria-labelledby={label ? `${id}-l` : undefined} aria-label={label ? undefined : name} dir="ltr"
        className={`inline-flex w-fit max-w-full items-center gap-1 px-2 ${H[size]} ${BOX} ${error || invalid ? "border-danger" : "border-line-strong"} ${disabled ? "opacity-60" : ""}`}>
        <button type="button" disabled={disabled} onClick={() => emit(curH, curM, !v.pm)} aria-label={`${name}: ${v.pm ? "مساءً" : "صباحاً"}، اضغط للتبديل`}
          className="grid h-7 w-7 shrink-0 place-items-center rounded-chip bg-bg text-sm font-bold text-primary-strong hover:bg-primary-soft disabled:cursor-not-allowed">{v.pm ? PM : AM}</button>
        <Icon name="clock" size={15} className="ms-0.5 shrink-0 text-ink-muted" />
        <input role="spinbutton" inputMode="numeric" disabled={disabled} maxLength={2} aria-label={`${name}: الساعة`} aria-valuemin={1} aria-valuemax={12} aria-valuenow={v.h12 ? Number(v.h12) : undefined}
          value={hText ?? v.h12} placeholder="--" className={cell} onKeyDown={keys("h")} onFocus={(e) => e.target.select()} onBlur={() => setHText(null)}
          onChange={(e) => {
            const t = e.target.value.replace(/\D/g, "").slice(0, 2); setHText(t);
            const n = Number(t);
            if (t && n >= 1 && n <= 12) { emit(n, curM, v.pm); if (t.length === 2 || n > 1) minRef.current?.focus(); }
          }} />
        <span className="font-bold text-ink-muted">:</span>
        <input ref={minRef} role="spinbutton" inputMode="numeric" disabled={disabled} maxLength={2} aria-label={`${name}: الدقائق`} aria-valuemin={0} aria-valuemax={59} aria-valuenow={v.mm ? Number(v.mm) : undefined}
          value={mText ?? v.mm} placeholder="--" className={cell} onKeyDown={keys("m")} onFocus={(e) => e.target.select()} onBlur={() => setMText(null)}
          onChange={(e) => {
            const t = e.target.value.replace(/\D/g, "").slice(0, 2); setMText(t);
            const n = Number(t);
            if (t && n <= 59) emit(curH, n, v.pm);
          }} />
      </div>
      {error ? <span className="text-xs font-semibold text-danger-strong">{error}</span> : hint ? <span className="sub-sm">{hint}</span> : null}
    </div>
  );
}

// ------------------------------------------------------------------ التاريخ والوقت
/** القيمة "YYYY-MM-DDTHH:mm" بنفس صيغة datetime-local. */
export function DateTimeField({ value, onChange, label, min, max, disabled, required, error, size = "lg", className = "" }: {
  value: string; onChange: (v: string) => void; label?: ReactNode; min?: string; max?: string; disabled?: boolean; required?: boolean; error?: string; size?: Size; className?: string;
}) {
  const date = value.slice(0, 10), time = value.slice(11, 16);
  const name = typeof label === "string" ? label : "الموعد";
  return (
    <div className={`flex min-w-0 flex-col gap-1.5 ${className}`}>
      {label && <span className="sub">{label}{required && <span className="text-danger-strong"> *</span>}</span>}
      <div className="flex flex-wrap items-start gap-2">
        <DateField aria-label={`${name}: التاريخ`} className="min-w-[190px] flex-1" value={date} min={min} max={max} disabled={disabled} size={size} onChange={(d) => { if (d) onChange(`${d}T${time || "09:00"}`); }} />
        <TimeField aria-label={`${name}: الوقت`} value={time} disabled={disabled} size={size} onChange={(t) => onChange(`${date || todayBaghdad()}T${t}`)} />
      </div>
      {error && <span className="text-xs font-semibold text-danger-strong">{error}</span>}
    </div>
  );
}
