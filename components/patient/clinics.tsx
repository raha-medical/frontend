"use client";
/** العيادات في تطبيق المراجع: بحث وفلترة حسب التخصص (UI-36)، بطاقة العيادة (UI-37)، صفحة العيادة (UI-38)، بطاقة الطبيب (UI-31). */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Icon } from "@/components/icon";
import { Badge, Button, DoctorPhoto, Empty, ErrorState, ISelect, Spinner, normalizeAr } from "@/components/ui";
import { fmtDayMonth, fmtIqd, fmtTime, fmtTimesInText, WEEKDAYS_AR } from "@/lib/format";
import { specialtyIcon } from "@/lib/specialty";
import { DirectionsButton } from "./location";
import { pub } from "./shared";
import type { PBranch } from "./types";

export type PDoctor = {
  doctor_id: string; full_name: string; specialty: string; job_title: string | null; clinic_id: string; clinic_name: string; photo_url: string | null;
  new_visit_price: number | null; follow_up_price: number | null; working_days: number[]; next_date: string | null; next_start: string | null;
};
type PClinic = { clinic_id: string; name: string; floor: number | null; is_open_today: boolean; closure_label: string | null; doctors_count: number };
type Home = { departments: { department: string; department_ar: string; clinics: PClinic[] }[]; doctors: PDoctor[] };

export function Back({ onBack, title }: { onBack: () => void; title: string }) {
  return <div className="flex items-center gap-2"><button onClick={onBack} aria-label="رجوع" className="grid size-11 shrink-0 place-items-center rounded-full bg-surface"><Icon name="arrow-right" size={18} /></button><h2 className="min-w-0 truncate text-lg font-bold">{title}</h2></div>;
}

export function DoctorCard({ d, onBook }: { d: PDoctor; onBook: () => void }) {
  return (
    <article className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-3.5">
      <div className="flex items-start gap-3">
        <DoctorPhoto src={d.photo_url} name={d.full_name} textClass="text-2xl" className="size-16 shrink-0 rounded-2xl" />
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="font-bold">{d.full_name}</span>
          <span className="sub-sm">{d.specialty}{d.job_title ? ` · ${d.job_title}` : ""}</span>
          <span className="sub-sm">{d.clinic_name}</span>
        </div>
        {d.new_visit_price != null && <span className="num shrink-0 font-bold text-primary-strong">{fmtIqd(d.new_visit_price)}</span>}
      </div>
      <div className="flex flex-col gap-1 text-[15px] text-ink-2">
        <span className="flex items-start gap-1.5"><Icon name="calendar-days" size={16} className="mt-1 shrink-0 text-primary" />{d.working_days?.length ? [...d.working_days].sort((a, b) => (a + 1) % 7 - (b + 1) % 7).map((w) => WEEKDAYS_AR[w]).join("، ") : "—"}</span>
        <span className="flex items-center gap-1.5"><Icon name="clock" size={16} className="shrink-0 text-primary" />أقرب موعد: {d.next_date ? <span className="num">{fmtDayMonth(d.next_date)}{d.next_start ? ` · ${fmtTime(d.next_start)}` : ""}</span> : "—"}</span>
      </div>
      <Button size="md" icon="calendar-plus" onClick={onBook}>احجز موعداً</Button>
    </article>
  );
}

/** قائمة عيادات الفرع. */
export function BranchClinics({ b, onBack, onPick }: { b: PBranch; onBack: () => void; onPick: (d: PDoctor) => void }) {
  const q = useQuery({ queryKey: ["p", "home", b.branch_id], queryFn: () => pub<Home>(`/public/branches/${b.branch_id}`) });
  const [text, setText] = useState("");
  const [spec, setSpec] = useState("");
  const [clinic, setClinic] = useState<PClinic | null>(null);
  const doctors = useMemo(() => q.data?.doctors ?? [], [q.data]);
  const specs = useMemo(() => [...new Set(doctors.map((d) => d.specialty))], [doctors]);
  const clinics = useMemo(() => (q.data?.departments ?? []).flatMap((d) => d.clinics).filter((c) => c.doctors_count > 0), [q.data]);
  const shown = clinics.filter((c) => {
    const mine = doctors.filter((d) => d.clinic_id === c.clinic_id);
    const n = normalizeAr(text.trim());
    return (!spec || mine.some((d) => d.specialty === spec)) && (!n || normalizeAr(`${c.name} ${mine.map((d) => `${d.full_name} ${d.specialty}`).join(" ")}`).includes(n));
  });

  if (clinic) return (
    <>
      <Back onBack={() => setClinic(null)} title={clinic.name} />
      {doctors.filter((d) => d.clinic_id === clinic.clinic_id).map((d) => <DoctorCard key={d.doctor_id} d={d} onBook={() => onPick(d)} />)}
    </>
  );

  return (
    <>
      <Back onBack={onBack} title={b.name} />
      {(b.address || b.working_hours || b.latitude != null) && (
        <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-surface p-3 text-[15px]">
          {b.address && <span className="flex items-center gap-1.5"><Icon name="map-pin" size={14} className="text-primary" />{b.address}</span>}
          {b.working_hours && <span className="flex items-center gap-1.5"><Icon name="clock" size={14} className="text-primary" />{fmtTimesInText(b.working_hours)}</span>}
          <DirectionsButton compact directions={b.directions} name={b.name} className="ms-auto" />
        </div>
      )}
      <label className="flex h-12 items-center gap-2 rounded-field border-[1.5px] border-line-strong bg-surface px-3.5 focus-within:border-primary">
        <Icon name="search" size={18} className="shrink-0 text-ink-muted" />
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="ابحث عن عيادة أو طبيب" aria-label="ابحث عن عيادة أو طبيب" className="min-w-0 flex-1 bg-transparent text-body text-ink outline-none placeholder:text-ink-muted" />
      </label>
      {specs.length > 1 && <ISelect aria-label="التخصص" size="md" placeholder="كل التخصصات" value={spec} onChange={setSpec} clearable options={specs.map((s) => ({ value: s, label: s, icon: specialtyIcon(s) }))} />}
      {q.isPending ? <Spinner /> : q.isError ? <ErrorState hint="تحقق من الاتصال ثم أعد المحاولة." onRetry={() => void q.refetch()} />
        : !shown.length ? <Empty icon={text || spec ? "search" : "stethoscope"} title={text || spec ? "لا نتائج مطابقة" : "لا توجد عيادات متاحة"} />
        : shown.map((c) => {
          const first = doctors.find((d) => d.clinic_id === c.clinic_id);
          return (
            <button key={c.clinic_id} onClick={() => setClinic(c)} className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-3.5 text-start">
              <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-primary-soft text-primary"><Icon name={specialtyIcon(first?.specialty ?? c.name)} size={26} /></span>
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="font-bold">{c.name}</span>
                <span className="sub-sm"><span className="num">{c.doctors_count}</span> {c.doctors_count === 1 ? "طبيب" : "أطباء"}{c.floor != null ? <> · الطابق <span className="num">{c.floor}</span></> : null}</span>
                <span><Badge tone={c.is_open_today ? "success" : "muted"} size="sm">{c.is_open_today ? "مفتوحة اليوم" : c.closure_label ?? "مغلقة اليوم"}</Badge></span>
              </span>
              <Icon name="chevron-left" size={18} className="shrink-0 text-ink-muted" />
            </button>
          );
        })}
    </>
  );
}
