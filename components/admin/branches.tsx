"use client";
/** الفروع والأقسام (المواصفة 2.4، العقد 3.0 و3.1): شبكة الفروع بحالتها الحية، صفحة إضافة/تعديل الفرع
 *  (البيانات، أوقات الدوام الأسبوعية، الموقع على OpenStreetMap)، ما داخل الفرع، والإغلاق المؤقت. */
import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Icon } from "@/components/icon";
import { toast } from "@/components/toast";
import { Alert, Badge, Button, Card, CellStack, DataGrid, DateField, Empty, Field, ISelect, Modal, Segmented, Spinner, type Column, type StatusMap } from "@/components/ui";
import { StatusBadge } from "@/components/ui";
import { branchesApi, lookupsApi, type BranchInput, type Closure, type ClosureResult } from "@/lib/api/admin";
import type { Branch, LiveStatus } from "@/lib/api/types";
import type { Clinic, Department } from "@/lib/api/billing";
import { errorMessage, fieldErrors, isApiError } from "@/lib/api/errors";
import { addDays, todayBaghdad } from "@/lib/date";
import { fmtDate, fmtNum, fmtTimeRange, fmtTimesInText } from "@/lib/format";
import { useAuth } from "@/lib/auth/store";
import { hasPerm } from "@/lib/roles";
import { BranchSelect, DEPT_AR, Panel, Pill, useBranches } from "./kit";
import { TextInput } from "@/components/reception/common";
import { WorkingHoursEditor, defaultWeek, validateWeek, weekFrom, weekToInput, type DayState } from "./working-hours";

const BranchMap = dynamic(() => import("./branch-map"), { ssr: false, loading: () => <div className="grid h-[340px] place-items-center rounded-card border border-line bg-bg sm:h-[400px]"><Spinner label="جارٍ تحميل الخريطة…" /></div> });

export const LIVE: StatusMap = {
  open: { tone: "success", label: "مفتوح الآن", icon: "circle-check" },
  open_after_hours: { tone: "info", label: "يعمل بعد الدوام", icon: "clock-alert" },
  closed: { tone: "muted", label: "مغلق الآن", icon: "moon" },
  temporarily_closed: { tone: "warn", label: "مغلق مؤقتاً", icon: "door-closed" },
  inactive: { tone: "muted", label: "موقوف", icon: "power" },
};
const liveOf = (b: Branch): LiveStatus => b.live_status ?? (b.status === "inactive" ? "inactive" : b.status === "closed" ? "temporarily_closed" : "open");

function TodayHours({ b }: { b: Branch }) {
  if (b.today_hours == null) return <span className="text-[13px] text-ink-muted">{b.working_hours ? fmtTimesInText(b.working_hours) : "لم يُضبط جدول"}</span>;
  if (!b.today_hours.length) return <span className="text-[13px] text-ink-2">مغلق اليوم</span>;
  return <span className="num flex flex-col whitespace-nowrap text-[13px]">{b.today_hours.map((s) => <span key={s.open}>{fmtTimeRange(s.open, s.close)}</span>)}</span>;
}

// ------------------------------------------------------------------ شبكة الفروع
export function BranchesScreen() {
  const me = useAuth((s) => s.user)!;
  const router = useRouter();
  const isAdmin = me.role === "admin";
  const list = useQuery({ queryKey: ["branches", "grid", isAdmin], queryFn: () => (isAdmin ? branchesApi.listAll() : branchesApi.list()), refetchInterval: 60_000 });
  const [live, setLive] = useState("");
  const rows = list.data?.items.filter((b) => (isAdmin || me.branch_ids.includes(b.branch_id)) && (!live || liveOf(b) === live));

  const columns: Column<Branch>[] = [
    { key: "name", header: "الفرع", sortable: true, value: (b) => `${b.name} ${b.code} ${b.city ?? ""}`,
      cell: (b) => <CellStack title={b.name} sub={<><span className="num">{b.code}</span>{b.city ? ` · ${b.city}` : ""}</>} icon={<span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary-strong"><Icon name="building-2" size={17} /></span>} /> },
    { key: "address", header: "العنوان والمدراء", hideBelow: "md", value: (b) => `${b.address ?? ""} ${(b.managers ?? []).map((m) => m.full_name).join(" ")}`,
      cell: (b) => <span className="flex max-w-[210px] flex-col text-[13px]"><span className="truncate">{b.address || "—"}</span><span className="truncate text-xs text-ink-2">{b.managers?.length ? b.managers.map((m) => m.full_name).join("، ") : b.is_assigned === false ? "" : "بلا مدير"}</span></span> },
    { key: "hours", header: "دوام اليوم", width: "150px", cell: (b) => <TodayHours b={b} /> },
    { key: "live", header: "الحالة الآن", width: "140px", value: (b) => LIVE[liveOf(b)]?.label,
      cell: (b) => <span className="flex flex-col items-start gap-1"><StatusBadge map={LIVE} value={liveOf(b)} />{b.status === "closed" && b.status_reason_ar && <span className="text-[11px] text-warn-strong">{b.status_reason_ar}{b.closed_until ? ` حتى ${fmtDate(b.closed_until)}` : ""}</span>}</span> },
    { key: "depts", header: "الأقسام والنشاط", width: "140px", hideBelow: "lg", value: (b) => b.department_counts?.total ?? 0,
      cell: (b) => (b.department_counts ? <span className="flex flex-col gap-0.5 text-[12px] text-ink-2">
        <span title={`عيادات ${b.department_counts.clinic} · مختبر ${b.department_counts.lab} · أشعة ${b.department_counts.radiology} · صيدلية ${b.department_counts.pharmacy}`} className="num inline-flex items-center gap-1.5">{(["clinic", "lab", "radiology", "pharmacy"] as const).map((k) => <span key={k} className="inline-flex items-center gap-0.5"><Icon name={DEPT_AR[k].icon} size={13} />{b.department_counts![k]}</span>)}</span>
        {b.activity && <span title={`${b.activity.open_shifts} وردية مفتوحة`}><span className="num font-semibold text-ink">{fmtNum(b.activity.patients_waiting)}</span> بالانتظار · <span className="num font-semibold text-ink">{fmtNum(b.activity.patients_in_room)}</span> بالداخل</span>}
      </span> : <span className="text-ink-muted">—</span>) },
    { key: "go", header: <span className="sr-only">فتح</span>, width: "44px", sticky: true, cell: (b) => <Link href={`/staff/admin/branches/${b.branch_id}`} onClick={(e) => e.stopPropagation()} aria-label={`فتح ${b.name}`} className="grid size-8 place-items-center rounded-full text-ink-2 hover:bg-bg"><Icon name="chevron-left" size={17} /></Link> },
  ];

  return (
    <DataGrid<Branch> aria-label="الفروع" rows={rows} loading={list.isPending} error={list.isError ? errorMessage(list.error) : undefined}
      rowKey={(b) => b.branch_id} columns={columns} minWidth={700} dense pageSize={0}
      onRowClick={(b) => router.push(`/staff/admin/branches/${b.branch_id}`)}
      search={{ placeholder: "ابحث باسم الفرع أو رمزه أو مدينته" }}
      filters={<div className="w-full sm:w-[190px]"><ISelect placeholder="كل الحالات" size="md" aria-label="الحالة الآن" value={live} onChange={setLive} searchable={false}
        options={[{ value: "", label: "كل الحالات" }, ...Object.entries(LIVE).filter(([k]) => isAdmin || k !== "inactive").map(([k, v]) => ({ value: k, label: v.label, icon: v.icon }))]} /></div>}
      actions={hasPerm(me, "branches.create") && <Link href="/staff/admin/branches/new" className="inline-flex h-[42px] items-center gap-2 rounded-control bg-primary px-5 text-sm font-semibold text-on-accent hover:bg-primary-strong"><Icon name="plus" size={18} />فرع جديد</Link>}
      empty={{ icon: "building-2", title: "لا توجد فروع مطابقة" }} />
  );
}

// ------------------------------------------------------------------ صفحة الفرع (إضافة / تعديل)
export function BranchPage({ id }: { id: string | null }) {
  const q = useQuery({ queryKey: ["branch", "one", id], queryFn: () => branchesApi.get(id!), enabled: !!id });
  if (id && q.isPending) return <Spinner />;
  if (q.isError) return <Alert tone="danger">{errorMessage(q.error)}</Alert>;
  return <BranchEditor key={q.data?.branch_id ?? "new"} initial={q.data ?? null} />;
}

type Step = "info" | "hours" | "map" | "inside" | "closures";
const round6 = (n: number) => Math.round(n * 1e6) / 1e6;

function BranchEditor({ initial }: { initial: Branch | null }) {
  const me = useAuth((s) => s.user)!;
  const router = useRouter();
  const qc = useQueryClient();
  const canSave = hasPerm(me, initial ? "branches.edit" : "branches.create");
  const [step, setStep] = useState<Step>("info");
  const [f, setF] = useState({ code: initial?.code ?? "", name: initial?.name ?? "", city: initial?.city ?? "", address: initial?.address ?? "", phone: initial?.phone ?? "", working_hours: initial?.working_hours ?? "" });
  const [structured, setStructured] = useState<boolean>(initial ? !!initial.working_hours_schedule?.length : true);
  const [week, setWeek] = useState<DayState[]>(() => weekFrom(initial?.working_hours_schedule));
  const [pos, setPos] = useState<{ lat: string; lng: string }>({ lat: initial?.latitude != null ? initial.latitude.toFixed(6) : "", lng: initial?.longitude != null ? initial.longitude.toFixed(6) : "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  const fe = fieldErrors(err);
  const latN = pos.lat.trim() ? Number(pos.lat) : null, lngN = pos.lng.trim() ? Number(pos.lng) : null;
  const geoOk = (latN === null) === (lngN === null) && (latN === null || (Number.isFinite(latN) && Number.isFinite(lngN!) && Math.abs(latN) <= 90 && Math.abs(lngN!) <= 180));
  const weekErrs = structured ? validateWeek(week) : {};
  const hoursOk = Object.keys(weekErrs).length === 0;
  const infoOk = !!f.name.trim() && (!!initial || /^[A-Za-z][A-Za-z0-9]{0,9}$/.test(f.code));
  const steps: { value: Step; label: string; icon: string }[] = [
    { value: "info", label: "البيانات", icon: "building-2" }, { value: "hours", label: "أوقات الدوام", icon: "clock" }, { value: "map", label: "الموقع", icon: "map-pin" },
    ...(initial ? [{ value: "inside" as Step, label: "ما داخل الفرع", icon: "layout-dashboard" }, { value: "closures" as Step, label: "الإغلاق المؤقت", icon: "door-closed" }] : []),
  ];
  const formStep = step === "info" || step === "hours" || step === "map";
  const idx = steps.findIndex((s) => s.value === step);

  async function save() {
    setBusy(true); setErr(null);
    const schedule = structured ? weekToInput(week) : initial?.working_hours_schedule?.length ? [] : null;
    const body: Partial<BranchInput> = {
      name: f.name.trim(), city: f.city.trim(), address: f.address.trim(), phone: f.phone.trim(),
      latitude: latN === null ? null : round6(latN), longitude: lngN === null ? null : round6(lngN!),
      ...(schedule !== null ? { working_hours_schedule: schedule } : {}),
      // مع الجدول المهيكل يكتب السيرفر الملخص في working_hours تلقائياً
      ...(!structured ? { working_hours: f.working_hours.trim() } : {}),
    };
    try {
      if (initial) { await branchesApi.update(initial.branch_id, body); toast.success("حُفظت بيانات الفرع"); }
      else { const b = await branchesApi.create({ code: f.code.trim().toUpperCase(), ...body }); toast.success("أُنشئ الفرع"); router.replace(`/staff/admin/branches/${b.branch_id}`); }
      void qc.invalidateQueries({ queryKey: ["branches"] }); void qc.invalidateQueries({ queryKey: ["branch"] });
    } catch (e) {
      setErr(e);
      const keys = Object.keys(fieldErrors(e));
      if (keys.some((k) => k.startsWith("working_hours_schedule"))) setStep("hours");
      else if (keys.some((k) => k === "latitude" || k === "longitude")) setStep("map");
      else if (keys.length) setStep("info");
    } finally { setBusy(false); }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Link href="/staff/admin/branches" className="flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"><Icon name="arrow-right" size={16} />كل الفروع</Link>
        <span className="flex-1" />
        {initial && <StatusBadge map={LIVE} value={liveOf(initial)} />}
        {initial && <Badge tone="muted"><span className="num" dir="ltr">{initial.code}</span></Badge>}
      </div>
      <h2 className="text-heading font-bold">{initial ? initial.name : "فرع جديد"}</h2>
      <div className="-mx-1 overflow-x-auto px-1 pb-1"><Segmented value={step} onChange={setStep} options={steps} /></div>
      {!canSave && formStep && <Alert tone="info" icon="eye">عرض فقط: لا تملك صلاحية {initial ? "تعديل" : "إضافة"} الفروع.</Alert>}

      <div key={step} className="enter flex flex-col gap-4">
        {step === "info" && (
          <fieldset disabled={!canSave} className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
            <Card className="flex flex-col gap-3.5 p-5">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="الرمز" icon="hash" ltr value={f.code} disabled={!!initial} maxLength={10} onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "") })}
                  error={fe.code} hint={initial ? "لا يتغير بعد الإنشاء (يدخل في أرقام الملفات والفواتير)" : "حرف إنجليزي ثم حروف أو أرقام · مثل B2 · لا يتغير بعد الإنشاء"} placeholder="B2" />
                <Field label="اسم الفرع" icon="building-2" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} error={fe.name} placeholder="فرع الكرادة" />
                <Field label="المدينة" icon="map-pinned" value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })} error={fe.city} placeholder="بغداد" />
                <Field label="الهاتف" icon="phone" ltr inputMode="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} error={fe.phone} placeholder="07XXXXXXXXX" />
              </div>
              <Field label="العنوان" icon="map-pin" value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} error={fe.address} placeholder="شارع 62، قرب ساحة الحرية" />
            </Card>
            <Managers b={initial} />
          </fieldset>
        )}
        {step === "hours" && (
          <Card className="flex flex-col gap-3.5 p-5">
            <label className="flex items-center gap-2.5 text-sm">
              <input type="checkbox" className="size-5 accent-primary" checked={structured} disabled={!canSave} onChange={(e) => { setStructured(e.target.checked); if (e.target.checked && !week.length) setWeek(defaultWeek()); }} />
              <span className="flex-1 font-semibold">جدول دوام أسبوعي مهيكل</span>
              <span className="sub-sm hidden sm:inline">يُحسب منه «مفتوح الآن» ويظهر للمرضى</span>
            </label>
            {structured
              ? <WorkingHoursEditor value={week} onChange={setWeek} disabled={!canSave} />
              : <Field label="ساعات العمل (نص حر)" icon="clock" value={f.working_hours} disabled={!canSave} onChange={(e) => setF({ ...f, working_hours: e.target.value })} placeholder="السبت - الخميس 8:00 ص - 10:00 م" hint="بدون جدول مهيكل تظهر حالة الفرع «مفتوح» دائماً" />}
            {Object.entries(fe).filter(([k]) => k.startsWith("working_hours")).map(([k, v]) => <Alert key={k} tone="danger">{v}</Alert>)}
            {initial?.working_hours_summary && <span className="sub-sm flex items-center gap-1.5"><Icon name="info" size={14} />المحفوظ الآن: {fmtTimesInText(initial.working_hours_summary)}</span>}
          </Card>
        )}
        {step === "map" && <LocationStep lat={latN} lng={lngN} pos={pos} setPos={setPos} readOnly={!canSave} geoOk={geoOk} err={fe.latitude ?? fe.longitude}
          onPickAddress={(a) => setF((x) => ({ ...x, address: x.address || a.address, city: x.city || a.city }))} />}
        {step === "inside" && initial && <BranchInside id={initial.branch_id} />}
        {step === "closures" && initial && <ClosurePanel scope="branch" id={initial.branch_id} title="إغلاق الفرع كاملاً" hint="يغلق كل عيادات الفرع وأقسامه معاً. الحجز والاستقبال يُرفضان، والمدفوع يتحول رصيداً." />}
      </div>

      {formStep && canSave && (
        <div className="glass sticky bottom-3 z-20 flex flex-wrap items-center gap-2.5 rounded-panel p-3 shadow-float">
          {!initial && idx > 0 && <Button size="md" variant="ghost" icon="arrow-right" onClick={() => setStep(steps[idx - 1].value)}>السابق</Button>}
          {!initial && idx < 2 && <Button size="md" variant="soft" icon="arrow-left" disabled={step === "info" ? !infoOk : step === "hours" ? !hoursOk : false} onClick={() => setStep(steps[idx + 1].value)}>التالي</Button>}
          <span className="flex-1 text-[13px]">
            {err != null ? <span className="font-semibold text-danger-strong">{errorMessage(err)}</span>
              : !hoursOk ? <span className="text-danger-strong">صحّح أوقات الدوام</span>
              : !geoOk ? <span className="text-danger-strong">صحّح الإحداثيات</span>
              : !infoOk ? <span className="text-ink-2">أدخل الاسم {initial ? "" : "والرمز"}</span> : null}
          </span>
          {(initial || idx === 2) && <Button size="md" icon={initial ? "save" : "check"} loading={busy} disabled={!infoOk || !hoursOk || !geoOk} onClick={save}>{initial ? "حفظ التعديلات" : "إنشاء الفرع"}</Button>}
        </div>
      )}
      {initial && step === "info" && hasPerm(me, "branches.delete") && <ActiveToggle b={initial} />}
    </div>
  );
}

/** مدراء الفرع: الموظفون بدور مدير فرع المسندون له (عرض فقط، يُدارون من المستخدمين). */
function Managers({ b }: { b: Branch | null }) {
  return (
    <Card className="flex flex-col gap-2.5 p-5">
      <h3 className="flex items-center gap-2 font-bold"><Icon name="users-round" size={17} className="text-primary" />مدراء الفرع</h3>
      {!b ? <span className="sub-sm">بعد إنشاء الفرع أضف موظفاً بدور «مدير فرع» وأسنده للفرع.</span>
        : !b.managers?.length ? <span className="sub-sm">لا يوجد مدير فرع مسند لهذا الفرع.</span>
        : b.managers.map((m) => (
          <Link key={m.user_id} href={`/staff/admin/users/${m.user_id}`} className="flex items-center gap-2.5 rounded-xl px-2 py-1.5 hover:bg-primary-soft">
            <span className="grid size-8 place-items-center rounded-full bg-primary-soft text-primary-strong"><Icon name="building-2" size={15} /></span>
            <span className="flex flex-1 flex-col"><span className="text-sm font-semibold">{m.full_name}</span>{m.phone_number && <span className="num sub-sm">{m.phone_number}</span>}</span>
            <Icon name="chevron-left" size={15} className="text-ink-muted" />
          </Link>
        ))}
      <span className="sub-sm flex items-start gap-1.5"><Icon name="info" size={14} className="mt-0.5 shrink-0" />المدراء هم الموظفون الفعالون بدور «مدير فرع» المسندون للفرع. عدّلهم من <Link href="/staff/admin/users" className="font-semibold text-primary hover:underline">المستخدمين</Link>.</span>
    </Card>
  );
}

type NominatimHit = { place_id: number; display_name: string; lat: string; lon: string; address?: Record<string, string> };
/** بحث العناوين عبر Nominatim (سياسة الاستخدام: طلب واحد في الثانية كحد أقصى، تأخير ≥ 1 ثانية، ونتائج مخزنة مؤقتاً). */
const nomCache = new Map<string, NominatimHit[]>();
let nomLast = 0;

function LocationStep({ lat, lng, pos, setPos, readOnly, geoOk, err, onPickAddress }: {
  lat: number | null; lng: number | null; pos: { lat: string; lng: string }; setPos: (p: { lat: string; lng: string }) => void;
  readOnly: boolean; geoOk: boolean; err?: string; onPickAddress: (a: { address: string; city: string }) => void;
}) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<NominatimHit[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [geoErr, setGeoErr] = useState<string | null>(null);
  const ctl = useRef<AbortController | null>(null);
  const place = (la: number, ln: number) => setPos({ lat: la.toFixed(6), lng: ln.toFixed(6) });

  async function search(text: string) {
    const t = text.trim();
    if (t.length < 3) { setHits(null); return; }
    if (nomCache.has(t)) { setHits(nomCache.get(t)!); return; }
    const wait = 1100 - (Date.now() - nomLast);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    ctl.current?.abort(); ctl.current = new AbortController();
    nomLast = Date.now(); setSearching(true);
    try {
      const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=6&addressdetails=1&countrycodes=iq&accept-language=ar&q=${encodeURIComponent(t)}`, { signal: ctl.current.signal });
      const items = r.ok ? ((await r.json()) as NominatimHit[]) : [];
      nomCache.set(t, items); setHits(items);
    } catch (e) { if ((e as Error).name !== "AbortError") setHits([]); } finally { setSearching(false); }
  }
  // تأخير 1.2 ثانية بعد آخر حرف (Nominatim usage policy)
  useEffect(() => { const t = setTimeout(() => void search(q), 1200); return () => clearTimeout(t); }, [q]);

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <Card className="flex flex-col gap-3 p-4">
        {!readOnly && (
          <div className="relative">
            <form onSubmit={(e) => { e.preventDefault(); void search(q); }} className="flex h-11 items-center gap-2 rounded-field border-[1.5px] border-line-strong bg-surface px-3 focus-within:border-primary focus-within:ring-4 focus-within:ring-primary/15">
              <Icon name={searching ? "loader-circle" : "search"} size={17} className={`shrink-0 text-ink-muted ${searching ? "animate-spin" : ""}`} />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ابحث عن عنوان أو منطقة في العراق" aria-label="بحث عن عنوان على الخريطة" className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-ink-muted" />
              {q && <button type="button" onClick={() => { setQ(""); setHits(null); }} aria-label="مسح البحث" className="text-ink-muted hover:text-ink"><Icon name="x" size={15} /></button>}
            </form>
            {hits && (
              <ul className="absolute inset-x-0 top-12 z-[1100] max-h-72 overflow-auto rounded-xl border border-line bg-surface p-1 shadow-pop" role="listbox" aria-label="نتائج البحث">
                {!hits.length ? <li className="px-3 py-2.5 text-sm text-ink-2">لا نتائج. جرّب اسم الحي أو الشارع.</li> : hits.map((h) => (
                  <li key={h.place_id}>
                    <button type="button" role="option" aria-selected={false} onClick={() => {
                      place(Number(h.lat), Number(h.lon)); setHits(null);
                      const a = h.address ?? {};
                      onPickAddress({ address: h.display_name.split(/[,،]/).slice(0, 2).map((x) => x.trim()).join("، "), city: a.city ?? a.town ?? a.state ?? "" });
                    }} className="flex w-full items-start gap-2 rounded-xl px-3 py-2 text-start text-sm hover:bg-primary-soft focus-visible:bg-primary-soft focus-visible:outline-none">
                      <Icon name="map-pin" size={15} className="mt-0.5 shrink-0 text-primary" /><span>{h.display_name}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        <BranchMap lat={lat} lng={lng} readOnly={readOnly} label="موقع الفرع على الخريطة. اسحب الدبوس أو انقر لوضعه" onChange={place} />
        <span className="sub-sm">{readOnly ? "موقع الفرع كما يظهر للمرضى." : "انقر على الخريطة لوضع الدبوس، أو اسحبه للمكان الدقيق. انقر داخل الخريطة لتفعيل التكبير بعجلة الفأرة."}</span>
      </Card>
      <Card className="flex flex-col gap-3 p-5">
        <h3 className="flex items-center gap-2 font-bold"><Icon name="crosshair" size={17} className="text-primary" />الإحداثيات</h3>
        <Field label="خط العرض (Latitude)" ltr inputMode="decimal" value={pos.lat} disabled={readOnly} onChange={(e) => setPos({ ...pos, lat: e.target.value })} placeholder="33.304500" error={err} />
        <Field label="خط الطول (Longitude)" ltr inputMode="decimal" value={pos.lng} disabled={readOnly} onChange={(e) => setPos({ ...pos, lng: e.target.value })} placeholder="44.429000" />
        {!geoOk && <Alert tone="warn">أدخل الإحداثيين معاً وبقيم صحيحة (العرض بين -90 و90، والطول بين -180 و180).</Alert>}
        {!readOnly && (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="soft" icon="locate-fixed" type="button" onClick={() => {
              setGeoErr(null);
              if (!navigator.geolocation) { setGeoErr("المتصفح لا يدعم تحديد الموقع"); return; }
              navigator.geolocation.getCurrentPosition((p) => place(p.coords.latitude, p.coords.longitude), () => setGeoErr("تعذر تحديد موقعك. اسمح للمتصفح بالوصول للموقع."), { enableHighAccuracy: true, timeout: 10_000 });
            }}>استخدم موقعي</Button>
            {(pos.lat || pos.lng) && <Button size="sm" variant="ghost" icon="x" type="button" onClick={() => setPos({ lat: "", lng: "" })}>مسح الموقع</Button>}
          </div>
        )}
        {geoErr && <Alert tone="warn">{geoErr}</Alert>}
        <span className="sub-sm">تُحفظ بست خانات عشرية. يظهر للمرضى زر «الموقع على الخريطة».</span>
        <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer" className="sub-sm hover:underline">بيانات الخريطة © OpenStreetMap contributors</a>
      </Card>
    </div>
  );
}

/** الإيقاف النهائي وإعادة التفعيل (المدير العام، branches.delete). */
function ActiveToggle({ b }: { b: Branch }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  const [bookings, setBookings] = useState<number | null>(null);
  async function run(cancel: boolean) {
    setBusy(true); setErr(null);
    try {
      await branchesApi.update(b.branch_id, { is_active: !b.is_active, ...(cancel ? { cancel_bookings: true } : {}) });
      toast.success(b.is_active ? "أُوقف الفرع" : "أُعيد تفعيل الفرع"); setOpen(false); setBookings(null);
      void qc.invalidateQueries({ queryKey: ["branches"] }); void qc.invalidateQueries({ queryKey: ["branch"] });
    } catch (e) {
      if (isApiError(e) && e.code === "BRANCH_HAS_BOOKINGS") setBookings(Number(e.extra?.bookings_count ?? 0));
      else setErr(e);
    } finally { setBusy(false); }
  }
  return (
    <Card solid className="flex flex-wrap items-center gap-3 p-4">
      <Icon name="power" size={18} className={b.is_active ? "text-danger" : "text-success"} />
      <span className="flex-1 text-sm">{b.is_active ? "الإيقاف النهائي: يختفي الفرع من تطبيق المريض ولا يُدخل عليه. للإغلاق المؤقت استخدم «الإغلاق المؤقت»." : "الفرع موقوف نهائياً."}</span>
      <Button size="md" variant={b.is_active ? "danger" : "primary"} icon="power" onClick={() => setOpen(true)}>{b.is_active ? "إيقاف الفرع" : "إعادة التفعيل"}</Button>
      <Modal open={open} onClose={() => { setOpen(false); setBookings(null); setErr(null); }} title={b.is_active ? `إيقاف ${b.name}` : `تفعيل ${b.name}`} icon="power"
        footer={<>
          <Button size="md" variant={b.is_active ? "danger" : "primary"} loading={busy} onClick={() => void run(bookings !== null)}>{bookings !== null ? `إلغاء ${fmtNum(bookings)} حجز والإيقاف` : "تأكيد"}</Button>
          <Button size="md" variant="ghost" onClick={() => setOpen(false)}>إلغاء</Button>
        </>}>
        {bookings !== null && <Alert tone="warn">في الفرع <b className="num">{fmtNum(bookings)}</b> حجز قادم. ستُلغى الوجبات والحجوزات ويتحول المدفوع رصيداً للمرضى.</Alert>}
        {err != null && <Alert tone="danger">{errorMessage(err)}</Alert>}
      </Modal>
    </Card>
  );
}

/** ما داخل الفرع: الأقسام، تنبيهات الإعداد، العيادات وأطباؤها، وأرقام اليوم (overview). */
function BranchInside({ id }: { id: string }) {
  const ov = useQuery({ queryKey: ["branch", "overview", id], queryFn: () => branchesApi.overview(id) });
  if (ov.isPending) return <Spinner />;
  if (ov.isError) return <Alert tone="danger">{errorMessage(ov.error)}</Alert>;
  const o = ov.data;
  const t = o.today;
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <Panel title={`ماذا يوجد في ${o.branch.name}`} icon="layout-dashboard">
        <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
          {o.departments.map((d) => (
            <div key={d.department} className="flex flex-col gap-1 rounded-2xl bg-bg p-3">
              <span className="flex items-center gap-1.5 text-[13px] font-semibold text-ink-2"><Icon name={DEPT_AR[d.department]?.icon ?? "building"} size={16} />{d.department_ar}</span>
              <span className="num text-2xl font-bold">{d.total}</span>
              <span className="sub-sm">مفتوح اليوم <span className="num">{d.open_today}</span> · فعّال <span className="num">{d.active}</span></span>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {[["calendar-days", t.sessions, "وجبة اليوم"], ["calendar-check", t.booked, "حجز"], ["users", t.in_queue, "في الطابور"], ["circle-check", t.completed, "مكتمل"], ["user-x", t.no_shows, "غياب"]].map(([ic, n, l]) => (
            <span key={l as string} className="flex items-center gap-1.5 rounded-full bg-bg px-3 py-1.5 text-[13px]"><Icon name={ic as string} size={15} className="text-primary" /><b className="num">{n as number}</b>{l as string}</span>
          ))}
        </div>
      </Panel>
      {o.setup_warnings.length > 0
        ? <Panel title={<span className="flex items-center gap-2">أكمل إعداد الفرع <span className="num rounded-full bg-warn-soft px-2 text-xs text-warn-strong">{o.setup_warnings.length}</span></span>} icon="list-todo">
            {o.setup_warnings.map((w) => <span key={w} className="flex items-center gap-2 rounded-xl bg-warn-soft/60 px-3 py-2.5 text-[13px]"><Icon name="triangle-alert" size={16} className="text-warn" />{w}</span>)}
          </Panel>
        : <Alert tone="success" icon="circle-check">الفرع جاهز للعمل</Alert>}
      <Panel title="الأقسام والأطباء" icon="hospital" actions={<span className="sub-sm flex items-center gap-1"><Icon name="users-round" size={14} />{o.staff.map((s) => `${s.role_ar} ${s.count}`).join(" · ")}</span>}>
        {!o.clinics.length ? <Empty icon="building-2" title="لا توجد أقسام" hint="أضف عيادة أو مختبراً من «الأقسام والعيادات»." /> : o.clinics.map((c) => (
          <div key={c.clinic_id} className="flex flex-wrap items-center gap-3 border-b border-line py-2.5 last:border-0">
            <span className={`grid size-9 place-items-center rounded-xl ${DEPT_AR[c.department]?.cls}`}><Icon name={DEPT_AR[c.department]?.icon ?? "building"} size={16} /></span>
            <span className="flex min-w-[150px] flex-1 flex-col"><span className="text-sm font-semibold">{c.name}</span>
              <span className="flex flex-wrap gap-x-2 text-xs text-ink-2">{c.doctors.map((d) => <span key={d.doctor_id} className={d.has_schedule_today ? "text-success-strong" : ""}>{d.full_name}</span>)}</span></span>
            <span className="sub-sm flex items-center gap-1"><Icon name="tags" size={13} /><span className="num">{c.active_services}</span> خدمة</span>
            {!c.is_active ? <Pill tone="muted" icon="power">متوقف</Pill> : c.is_open_today ? <Pill tone="success" icon="circle-check">مفتوح اليوم</Pill> : <Pill tone="warn" icon="door-closed">{c.closure?.reason_ar ?? "مغلق"}</Pill>}
          </div>
        ))}
      </Panel>
    </div>
  );
}

/** إغلاق مؤقت (فرع أو قسم) مع السجل وإعادة الفتح — العقد 3.1. */
export function ClosurePanel({ scope, id, title, hint }: { scope: "branch" | "clinic"; id: string; title: string; hint: string }) {
  const qc = useQueryClient();
  const reasons = useQuery({ queryKey: ["lookups", "closure_reason"], queryFn: () => lookupsApi.list("closure_reason"), staleTime: 600_000 });
  const hist = useQuery({ queryKey: ["closures", scope, id], queryFn: () => scope === "branch" ? branchesApi.closures(id) : branchesApi.clinicClosures(id) });
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [from, setFrom] = useState(todayBaghdad());
  const [to, setTo] = useState(addDays(todayBaghdad(), 1));
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ClosureResult | null>(null);
  const active = (hist.data?.items ?? []).filter((c) => c.status === "active" || c.status === "scheduled");
  const invalidate = () => { void qc.invalidateQueries({ queryKey: ["closures", scope, id] }); void qc.invalidateQueries({ queryKey: ["branch"] }); void qc.invalidateQueries({ queryKey: ["branches"] }); void qc.invalidateQueries({ queryKey: ["clinics"] }); };

  async function close() {
    setBusy(true);
    try {
      const b = { reason, note: note.trim() || undefined, starts_on: from, ends_on: to || null, cancel_bookings: true };
      const r = scope === "branch" ? await branchesApi.close(id, b) : await branchesApi.closeClinic(id, b);
      setResult(r); toast.success(`أُغلق · أُلغي ${r.cancelled_bookings} حجز`); invalidate();
    } catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); }
  }
  async function end(c: Closure) {
    try { if (scope === "branch") await branchesApi.endClosure(id, c.closure_id); else await branchesApi.endClinicClosure(id, c.closure_id); toast.success("أُعيد الفتح"); invalidate(); }
    catch (e) { toast.error(errorMessage(e)); }
  }
  return (
    <Panel title={title} icon="door-closed">
      <span className="sub">{hint}</span>
      <div className="flex flex-wrap gap-1.5">
        {(reasons.data?.items ?? []).filter((r) => r.is_active).map((r) => (
          <button key={r.code} onClick={() => setReason(r.code)} aria-pressed={reason === r.code} className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${reason === r.code ? "border-warn bg-warn-soft text-warn-strong" : "border-line text-ink-2"}`}>{r.name_ar}</button>
        ))}
      </div>
      <div className="grid gap-2.5 sm:grid-cols-2">
        <DateField label="من" value={from} onChange={(v) => { if (v) setFrom(v); }} />
        <DateField label="إلى (اختياري)" value={to} min={from} clearable onChange={setTo} />
      </div>
      <TextInput label="ملاحظة" value={note} onChange={setNote} icon="notebook-pen" required={reason === "other"} />
      <Alert tone="warn" icon="calendar-off">وجبات الأطباء في الفترة تُلغى، ويُبلغ أصحاب الحجوزات، والمدفوع يتحول رصيداً للمريض.</Alert>
      {result && <Alert tone="info">أُلغيت <b className="num">{result.cancelled_sessions}</b> وجبة و<b className="num">{result.cancelled_bookings}</b> حجز (<span className="num">{result.credited_bookings}</span> تحول رصيداً).</Alert>}
      <Button variant="danger" onClick={close} loading={busy} disabled={!reason || (reason === "other" && !note.trim())} icon="lock">إغلاق وإلغاء الحجوزات</Button>
      {(hist.data?.items.length ?? 0) > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className="sub-sm">سجل الإغلاقات</span>
          {hist.data!.items.map((c) => (
            <div key={c.closure_id} className="flex flex-wrap items-center gap-2 rounded-xl bg-bg px-3 py-2 text-[13px]">
              <Icon name="door-closed" size={15} className="text-warn" /><span className="flex-1">{c.reason_ar}{c.note ? ` · ${c.note}` : ""}</span>
              <span className="num text-xs text-ink-2">{fmtDate(c.starts_on)} ← {c.ends_on ? fmtDate(c.ends_on) : "حتى إعادة الفتح"}</span>
              <Pill tone={c.status === "active" ? "warn" : c.status === "scheduled" ? "info" : "muted"}>{c.status === "active" ? "ساري" : c.status === "scheduled" ? "مجدول" : "منتهي"}</Pill>
              {active.includes(c) && <button onClick={() => end(c)} className="flex items-center gap-1 rounded-full bg-success px-3 py-1 text-xs font-semibold text-on-accent"><Icon name="door-open" size={13} />إعادة الفتح</button>}
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

// ------------------------------------------------------------------ الأقسام والعيادات
export function UnitsScreen() {
  const me = useAuth((s) => s.user)!;
  const [branch, setBranch] = useState(me.branch_id);
  const [dept, setDept] = useState<"all" | Department>("all");
  const [sel, setSel] = useState<Clinic | null>(null);
  const q = useQuery({ queryKey: ["clinics", branch, "all"], queryFn: () => branchesApi.clinics(branch, true) });
  const items = q.data?.items ?? [];
  const count = (d: Department) => items.filter((c) => c.department === d).length;
  return (
    <div className="flex flex-col gap-3.5">
      <div className="grid items-start gap-4 2xl:grid-cols-[minmax(0,1fr)_420px]">
        <DataGrid<Clinic> aria-label="الأقسام والعيادات" rows={q.data ? items.filter((c) => dept === "all" || c.department === dept) : undefined} loading={q.isPending} error={q.isError ? errorMessage(q.error) : undefined} rowKey={(c) => c.clinic_id} minWidth={560}
          onRowClick={setSel} selectedKey={sel?.clinic_id} rowClassName={(c) => (c.is_active ? "" : "opacity-55")} search={{ placeholder: "ابحث باسم القسم" }} empty={{ icon: "building-2", title: "لا توجد أقسام" }}
          filters={<>
            <div className="w-full sm:w-[190px]"><ISelect size="md" aria-label="نوع القسم" value={dept} searchable={false} onChange={(v) => { if (v) setDept(v as typeof dept); }}
              options={[{ value: "all", label: "كل الأنواع", hint: String(items.length) }, ...(Object.keys(DEPT_AR) as Department[]).map((d) => ({ value: d, label: DEPT_AR[d].label, icon: DEPT_AR[d].icon, hint: String(count(d)) }))]} /></div>
            <BranchSelect value={branch} onChange={(b) => { setBranch(b); setSel(null); }} />
          </>}
          columns={[
            { key: "name", header: "القسم", sortable: true, cell: (c) => { const d = DEPT_AR[c.department]; return <CellStack title={c.name} sub={d.label} icon={<span className={`grid size-9 shrink-0 place-items-center rounded-xl ${d.cls}`}><Icon name={d.icon} size={18} /></span>} />; } },
            { key: "floor", header: "الطابق", numeric: true, width: "80px", sortable: true, value: (c) => c.floor ?? "" },
            { key: "status", header: "الحالة", width: "130px", value: (c) => (!c.is_active ? "متوقف" : c.is_open_today ? "مفتوح" : "مغلق"), cell: (c) => (!c.is_active ? <Pill tone="muted" icon="power">متوقف</Pill> : c.is_open_today ? <Pill tone="success" icon="circle-check">مفتوح</Pill> : <Pill tone="warn" icon="door-closed">{c.closure?.reason_ar ?? "مغلق"}</Pill>) },
          ]} />
        {sel ? <UnitDetail key={sel.clinic_id} c={sel} onClose={() => setSel(null)} /> : <NewUnit branch={branch} />}
      </div>
    </div>
  );
}

function NewUnit({ branch }: { branch: string }) {
  const qc = useQueryClient();
  const branches = useBranches();
  const [b, setB] = useState(branch);
  const [type, setType] = useState<Department>("clinic");
  const [name, setName] = useState("");
  const [floor, setFloor] = useState(1);
  const [busy, setBusy] = useState(false);
  const steps: Record<Department, string[]> = {
    clinic: ["أضف طبيباً من «المستخدمون» واربطه بالعيادة", "حدد جدوله الأسبوعي ونسبه", "أضف الكشفية (جديد ومراجعة) في «الخدمات»"],
    lab: ["أضف التحاليل في «الخدمات» مع قالب كل تحليل", "اربط فني المختبر وموظف الاستقبال بالقسم"],
    radiology: ["أضف خدمات الأشعة والسونار مع الجهاز", "اربط أخصائي الأشعة بالقسم"],
    pharmacy: ["اربط الصيدلي بالقسم"],
  };
  return (
    <Panel title="قسم جديد" icon="square-plus" className="2xl:sticky 2xl:top-24">
      {(branches.data?.items.length ?? 0) > 1 && <ISelect label="الفرع" value={b} onChange={(v) => { if (v) setB(v); }} options={branches.data!.items.map((x) => ({ value: x.branch_id, label: x.name, icon: "building-2" }))} />}
      <ISelect label="نوع القسم" value={type} searchable={false} onChange={(v) => { if (v) setType(v as Department); }} options={(Object.keys(DEPT_AR) as Department[]).map((d) => ({ value: d, label: DEPT_AR[d].label, icon: DEPT_AR[d].icon }))} />
      <TextInput label="الاسم" value={name} onChange={setName} icon={DEPT_AR[type].icon} placeholder={type === "clinic" ? "عيادة الباطنية" : type === "lab" ? "المختبر" : type === "radiology" ? "الأشعة والسونار" : "الصيدلية"} />
      <div className="flex items-center gap-3"><span className="flex-1 text-sm font-medium">الطابق</span>
        <button onClick={() => setFloor((f) => Math.max(-3, f - 1))} className="grid size-9 place-items-center rounded-full border border-line-strong"><Icon name="minus" size={15} /></button>
        <span className="num w-8 text-center text-lg font-bold">{floor}</span>
        <button onClick={() => setFloor((f) => Math.min(50, f + 1))} className="grid size-9 place-items-center rounded-full bg-primary text-on-accent"><Icon name="plus" size={15} /></button>
      </div>
      <div className="flex flex-col gap-1.5 rounded-2xl bg-bg p-3"><span className="flex items-center gap-1.5 text-[13px] font-semibold"><Icon name="list-checks" size={15} className="text-primary" />بعد الإضافة</span>
        {steps[type].map((s) => <span key={s} className="flex items-center gap-1.5 text-xs text-ink-2"><Icon name="arrow-left" size={13} />{s}</span>)}</div>
      <Button loading={busy} disabled={name.trim().length < 2} icon="check" onClick={async () => {
        setBusy(true);
        try { await branchesApi.createClinic(b, { name: name.trim(), department: type, floor }); toast.success("أُضيف القسم"); setName(""); void qc.invalidateQueries({ queryKey: ["clinics"] }); void qc.invalidateQueries({ queryKey: ["branch"] }); }
        catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); }
      }}>إضافة {DEPT_AR[type].label}</Button>
      <span className="flex items-center gap-1.5 text-xs text-ink-2"><Icon name="info" size={14} />يمكن إضافة أكثر من مختبر أو صيدلية أو قسم أشعة في الفرع.</span>
    </Panel>
  );
}

function UnitDetail({ c, onClose }: { c: Clinic; onClose: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState(c.name);
  const [floor, setFloor] = useState(String(c.floor ?? ""));
  const [busy, setBusy] = useState(false);
  const d = DEPT_AR[c.department];
  async function patch(b: Partial<{ name: string; floor: number; is_active: boolean }>) {
    setBusy(true);
    try { await branchesApi.updateClinic(c.clinic_id, b); toast.success("حُفظ"); void qc.invalidateQueries({ queryKey: ["clinics"] }); void qc.invalidateQueries({ queryKey: ["branch"] }); }
    catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); }
  }
  return (
    <div className="flex flex-col gap-3.5 2xl:sticky 2xl:top-24">
      <Panel title={c.name} icon={d.icon} actions={<button onClick={onClose} aria-label="إغلاق" className="grid size-8 place-items-center rounded-full hover:bg-bg"><Icon name="x" size={16} /></button>}>
        <div className="grid grid-cols-[minmax(0,1fr)_100px] gap-2"><TextInput label="الاسم" value={name} onChange={setName} /><TextInput label="الطابق" value={floor} onChange={(v) => setFloor(v.replace(/[^\d-]/g, ""))} ltr /></div>
        <div className="flex flex-wrap gap-2">
          <Button size="md" loading={busy} icon="save" onClick={() => patch({ name: name.trim(), floor: Number(floor) || 0 })}>حفظ</Button>
          <Button size="md" variant={c.is_active ? "danger" : "primary"} icon="power" onClick={() => patch({ is_active: !c.is_active })}>{c.is_active ? "إيقاف دائم" : "إعادة التفعيل"}</Button>
        </div>
      </Panel>
      {c.is_active && <ClosurePanel scope="clinic" id={c.clinic_id} title="إغلاق مؤقت" hint="صيانة، إجازة، أو افتتاح قريب. الحجز يُرفض خلال الفترة." />}
    </div>
  );
}
