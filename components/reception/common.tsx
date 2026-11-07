"use client";
/** عناصر مشتركة بين شاشات التحصيل والاسترجاع وفك الحظر والطلب المباشر (Reception.dc.html). */
import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Icon } from "@/components/icon";
import { Alert, Card, Empty, Spinner } from "@/components/ui";
import { patientsApi, searchParamsFor, type Patient, type PatientSearchItem } from "@/lib/api/reception";
import { shiftsApi } from "@/lib/api/billing";
import { errorMessage, isNetworkError } from "@/lib/api/errors";
import { fmtIqd } from "@/lib/format";
import { kvGet, kvSet } from "@/lib/offline/db";
import { SHIFT_CACHE_KEY } from "@/lib/reception/offline-payment";
import { useLiveQueue } from "@/lib/reception/use-live-queue";

export function useDebounced<T>(v: T, ms = 350) {
  const [d, setD] = useState(v);
  useEffect(() => { const t = setTimeout(() => setD(v), ms); return () => clearTimeout(t); }, [v, ms]);
  return d;
}

export const SHIFT_KEY = ["shift", "current"] as const;
/** الحساب اليومي المفتوح للموظف (null = لا توجد). */
export function useCurrentShift() {
  return useQuery({ queryKey: SHIFT_KEY, queryFn: currentShiftCached, staleTime: 30_000 });
}

/** الحساب اليومي تُحفظ على الجهاز، فيبقى التحصيل الأوفلاين يعرف حسابه اليومي عند انقطاع الاتصال (C3). */
async function currentShiftCached() {
  try {
    const s = await shiftsApi.current();
    await kvSet(SHIFT_CACHE_KEY, s);
    return s;
  } catch (e) {
    if (!isNetworkError(e)) throw e;
    const cached = await kvGet<Awaited<ReturnType<typeof shiftsApi.current>>>(SHIFT_CACHE_KEY);
    if (cached === undefined) throw e;
    return cached;
  }
}

/** تنبيه «لا يوجد حساب يومي مفتوح» مع رابط فتحها (409 NO_OPEN_SHIFT). */
export function ShiftGuard({ children }: { children?: ReactNode }) {
  const s = useCurrentShift();
  if (s.isPending) return null;
  if (s.isError) return <Alert tone="danger">{errorMessage(s.error)}</Alert>;
  if (s.data) return <>{children}</>;
  return (
    <Alert tone="warn" icon="lock-keyhole">
      لا يوجد حساب يومي مفتوح. التحصيل والعربون والاسترجاع النقدي تحتاج حساباً يومياً مفتوحاً.{" "}
      <Link href="/staff/reception/shift" className="font-bold underline">فتح حساب يومي</Link>
    </Alert>
  );
}

/** المريض المختار عبر ?patient_id= في الرابط حتى تنتقل الشاشات بين بعضها بنفس المريض. */
export function usePatientParam() {
  const params = useSearchParams();
  const router = useRouter();
  const id = params.get("patient_id");
  const set = (pid: string | null) => {
    const u = new URL(window.location.href);
    if (pid) u.searchParams.set("patient_id", pid); else u.searchParams.delete("patient_id");
    router.replace(u.pathname + u.search, { scroll: false });
  };
  const q = useQuery({ queryKey: ["patient", id], queryFn: () => patientsApi.get(id!), enabled: !!id });
  return { id, set, patient: q.data ?? null, loading: !!id && q.isPending, error: q.error };
}

/** بطاقة المريض (رأس الشاشة) */
export function PatientHeader({ p, extra, onClear }: { p: Patient; extra?: ReactNode; onClear?: () => void }) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-card border border-line bg-surface p-4">
      <span className={`grid size-[46px] shrink-0 place-items-center rounded-full ${p.is_banned ? "bg-danger-soft text-danger" : "bg-primary-soft text-primary-strong"}`}><Icon name={p.is_banned ? "ban" : "user-round"} size={22} /></span>
      <div className="flex min-w-[160px] flex-1 flex-col">
        <span className="text-[17px] font-bold">{p.full_name}</span>
        <span className="sub"><span className="num">{p.file_number} · {p.phone_number}</span>{p.is_banned && <span className="text-danger-strong"> · محظور</span>}</span>
      </div>
      {extra}
      {p.credit_balance > 0 && <span className="flex items-center gap-1.5 rounded-xl bg-success-soft px-3 py-2 text-[13px] text-success-strong"><Icon name="piggy-bank" size={16} />رصيد <span className="num font-semibold">{p.credit_balance.toLocaleString("en-US")}</span></span>}
      {onClear && <button onClick={onClear} aria-label="تغيير المريض" title="تغيير المريض" className="grid size-9 place-items-center rounded-full border border-line-strong text-ink-2 hover:bg-bg"><Icon name="x" size={16} /></button>}
    </div>
  );
}

/**
 * اختيار مريض: بحث بالهاتف أو الاسم أو رقم الملف، مع قائمة سريعة اختيارية من طابور اليوم.
 * `filter` يحدد ما يظهر في القائمة السريعة (مثلاً غير المدفوع فقط).
 */
export function PatientPicker({ onPick, title = "اختر المريض", quick, onlyBanned }: {
  onPick: (patientId: string) => void; title?: string; quick?: "unpaid" | "all"; onlyBanned?: boolean;
}) {
  const [text, setText] = useState("");
  const dq = useDebounced(text);
  const params = searchParamsFor(dq);
  const q = useQuery({ queryKey: ["patients", "search", dq], enabled: !!params, queryFn: () => patientsApi.search(params!) });
  const items: PatientSearchItem[] = (q.data?.items ?? []).filter((p) => !onlyBanned || p.is_banned);
  return (
    <Card className="flex flex-col gap-3 p-[18px]">
      <span className="text-base font-bold">{title}</span>
      <div className="flex h-12 items-center gap-2 rounded-field border-2 border-primary px-3.5 shadow-[0_0_0_4px_rgb(var(--primary-soft))]">
        <Icon name="search" size={18} className="text-primary" />
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="هاتف، اسم، أو رقم الملف" aria-label="بحث عن مريض" autoFocus
          className="min-w-0 flex-1 bg-transparent text-base font-semibold outline-none placeholder:font-normal placeholder:text-ink-muted" />
      </div>
      {!params ? (quick ? <QuickList mode={quick} onPick={onPick} /> : <span className="sub">اكتب حرفين على الأقل.</span>)
        : q.isPending ? <Spinner label="جارٍ البحث…" />
        : q.isError ? <Alert tone="danger">{errorMessage(q.error)}</Alert>
        : !items.length ? <Empty icon="user-round" title={onlyBanned ? "لا يوجد مريض محظور بهذا البحث" : "لا نتائج"} />
        : items.map((p) => (
          <button key={p.patient_id} onClick={() => onPick(p.patient_id)}
            className={`flex items-center gap-3 rounded-xl border-[1.5px] p-3 text-start hover:border-primary ${p.is_banned ? "border-danger/40 bg-danger-soft/50" : "border-line bg-surface"}`}>
            <span className={`grid size-10 shrink-0 place-items-center rounded-full ${p.is_banned ? "bg-danger-soft text-danger" : "bg-primary-soft text-primary-strong"}`}><Icon name={p.is_banned ? "ban" : "user-round"} size={19} /></span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="text-[15px] font-semibold">{p.full_name}</span>
              <span className="sub-sm num">{p.file_number} · {p.phone_number}</span>
            </span>
            {p.outstanding_balance > 0 && <span className="text-xs font-semibold text-warn-strong">مستحق {fmtIqd(p.outstanding_balance)}</span>}
            <Icon name="chevron-left" size={18} className="text-ink-muted" />
          </button>
        ))}
    </Card>
  );
}

function QuickList({ mode, onPick }: { mode: "unpaid" | "all"; onPick: (id: string) => void }) {
  const live = useLiveQueue();
  const rows = useMemo(() => (live.data ?? []).flatMap((s) => s.items.map((t) => ({ t, doctor: s.doctor_name })))
    .filter(({ t }) => t.status !== "cancelled" && (mode === "all" || t.payment_status === "unpaid")), [live.data, mode]);
  if (live.isPending) return <Spinner />;
  if (!rows.length) return <span className="sub">{mode === "unpaid" ? "لا توجد كشفيات غير مدفوعة في طابور اليوم. ابحث عن المريض بالأعلى." : "ابحث عن المريض بالأعلى."}</span>;
  return (
    <div className="flex flex-col gap-1.5">
      <span className="sub-sm">{mode === "unpaid" ? "غير مدفوع في طابور اليوم" : "طابور اليوم"}</span>
      {rows.map(({ t, doctor }) => (
        <button key={t.ticket_id} onClick={() => onPick(t.patient_id)} className="flex items-center gap-3 rounded-xl px-2.5 py-2 text-start hover:bg-bg">
          <span className="num grid h-9 min-w-[52px] place-items-center rounded-chip bg-warn-soft px-1.5 text-[13px] font-bold text-warn-strong">{t.ticket_number}</span>
          <span className="flex min-w-0 flex-1 flex-col"><span className="text-sm font-semibold">{t.patient_name}</span><span className="sub-sm">{doctor}</span></span>
          <Icon name="chevron-left" size={16} className="text-ink-muted" />
        </button>
      ))}
    </div>
  );
}

/** حقل مبلغ بالدينار (أرقام صحيحة، فواصل الآلاف، أرقام عربية تُحوَّل). */
export function MoneyInput({ value, onChange, label, hint, autoFocus, strong = true, icon = "banknote", unit = "د.ع" }: { unit?: string; value: number; onChange: (n: number) => void; label: string; hint?: string; autoFocus?: boolean; strong?: boolean; icon?: string }) {
  const [txt, setTxt] = useState(value ? value.toLocaleString("en-US") : "");
  useEffect(() => { setTxt(value ? value.toLocaleString("en-US") : ""); }, [value]);
  return (
    <label className="flex min-w-0 flex-col gap-1.5">
      <span className="text-sm font-medium">{label}</span>
      <div className={`flex h-[50px] min-w-0 items-center gap-2 rounded-field px-3.5 focus-within:border-primary ${strong ? "border-2 border-primary" : "border-[1.5px] border-line-strong"}`}>
        <Icon name={icon} size={18} className="text-primary" />
        <input inputMode="numeric" dir="ltr" value={txt} autoFocus={autoFocus}
          // تحديد القيمة الحالية عند التركيز: الكتابة تستبدلها بدل أن تُلحق بها (50,000 + 50000 = مليار)
          onFocus={(e) => { const el = e.currentTarget; requestAnimationFrame(() => el.select()); }}
          onChange={(e) => {
            const raw = e.target.value.replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).replace(/[^\d]/g, "");
            const n = raw ? Math.min(Number(raw), 1_000_000_000) : 0;
            setTxt(raw ? n.toLocaleString("en-US") : ""); onChange(n);
          }}
          className="num min-w-0 flex-1 bg-transparent text-xl font-semibold text-ink outline-none" />
        <span className="sub-sm">{hint ?? unit}</span>
      </div>
    </label>
  );
}

/** أزرار اختيار بشكل بطاقات (طريقة الدفع، نقطة التحصيل، طريقة فك الحظر…) */
export function ChoiceGrid<T extends string>({ value, options, onChange, cols = 3, vertical }: { value: T; options: { value: T; label: string; icon: string; disabled?: boolean; hint?: string }[]; onChange: (v: T) => void; cols?: number; vertical?: boolean }) {
  return (
    <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }} role="radiogroup">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button key={o.value} type="button" role="radio" aria-checked={on} disabled={o.disabled} title={o.hint} onClick={() => onChange(o.value)}
            className={`flex items-center justify-center gap-2 rounded-xl border-[1.5px] px-2.5 text-[13px] font-semibold disabled:opacity-45 ${vertical ? "flex-col py-3" : "min-h-[48px] py-2"} ${on ? "border-primary bg-primary-soft text-primary-strong" : "border-line bg-surface text-ink-2 hover:border-line-strong"}`}>
            <Icon name={o.icon} size={vertical ? 20 : 18} />{o.label}
          </button>
        );
      })}
    </div>
  );
}

/** حقل نص بسيط بنفس شكل الحقول في التصميم (للمراجع والملاحظات). */
export function TextInput({ label, value, onChange, icon, ltr, placeholder, multiline, required }: { label: string; value: string; onChange: (v: string) => void; icon?: string; ltr?: boolean; placeholder?: string; multiline?: boolean; required?: boolean }) {
  return (
    <label className="flex min-w-0 flex-col gap-1.5">
      <span className="text-sm font-medium">{label}{required && <span className="text-danger"> *</span>}</span>
      {multiline
        ? <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={3} placeholder={placeholder}
            className="rounded-field border-[1.5px] border-line-strong bg-surface p-3 text-[15px] text-ink outline-none placeholder:text-ink-muted focus:border-primary" />
        : <div className="flex h-12 items-center gap-2 rounded-field border-[1.5px] border-line-strong bg-surface px-3.5 focus-within:border-primary">
            {icon && <Icon name={icon} size={16} className="shrink-0 text-ink-muted" />}
            <input value={value} onChange={(e) => onChange(e.target.value)} dir={ltr ? "ltr" : undefined} placeholder={placeholder}
              className={`min-w-0 flex-1 bg-transparent text-[15px] text-ink outline-none placeholder:text-ink-muted ${ltr ? "num text-start" : ""}`} />
          </div>}
    </label>
  );
}
