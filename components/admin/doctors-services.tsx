"use client";
/** الأطباء والجداول، والخدمات وقالب التحليل — Admin.dc.html (isDoctors, isServices). العقد 3 و12. */
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Icon } from "@/components/icon";
import { toast } from "@/components/toast";
import { Alert, Badge, Button, CellStack, DataGrid, DateField, DoctorPhoto, Empty, Field, ISelect, Modal, ReasonDialog, Segmented, Spinner, TimeField, type Column } from "@/components/ui";
import { branchesApi, doctorsAdminApi, servicesAdminApi, type Doctor, type LabParam, type ScheduleSlot, type Weekday } from "@/lib/api/admin";
import type { Service, ServiceType } from "@/lib/api/billing";
import { errorMessage, fieldErrors } from "@/lib/api/errors";
import { addDays, todayBaghdad } from "@/lib/date";
import { fmtDate, fmtNum } from "@/lib/format";
import { MODALITY_AR } from "@/lib/labels";
import { useAuth } from "@/lib/auth/store";
import { MoneyInput, TextInput, useDebounced } from "@/components/reception/common";
import { Panel, Pill, Select } from "./kit";

const DAYS: { k: Weekday; ar: string }[] = [{ k: "sat", ar: "السبت" }, { k: "sun", ar: "الأحد" }, { k: "mon", ar: "الإثنين" }, { k: "tue", ar: "الثلاثاء" }, { k: "wed", ar: "الأربعاء" }, { k: "thu", ar: "الخميس" }, { k: "fri", ar: "الجمعة" }];

export function DoctorsScreen() {
  const q = useQuery({ queryKey: ["doctors", "admin"], queryFn: () => doctorsAdminApi.list() });
  const [sel, setSel] = useState<Doctor | null>(null);
  useEffect(() => { if (!sel && q.data?.items[0]) setSel(q.data.items[0]); }, [q.data, sel]);
  const columns: Column<Doctor>[] = [
    { key: "full_name", header: "الطبيب", sortable: true, value: (d) => `${d.full_name} ${d.specialty}`, cell: (d) => <CellStack title={d.full_name} sub={`${d.specialty} · ${d.default_slot_minutes} د للمريض`} icon={<DoctorPhoto src={d.photo_url} name={d.full_name} className="size-10 rounded-xl" />} /> },
  ];
  return (
    <div className="grid items-start gap-4 xl:grid-cols-[300px_minmax(0,1fr)]">
      <DataGrid<Doctor> aria-label="الأطباء" rows={q.data?.items} loading={q.isPending} error={q.isError ? errorMessage(q.error) : undefined} rowKey={(d) => d.doctor_id} columns={columns} minWidth={260} dense pageSize={0} maxHeight="min(75vh, 800px)"
        onRowClick={setSel} selectedKey={sel?.doctor_id} search={{ placeholder: "ابحث باسم الطبيب" }} empty={{ icon: "stethoscope", title: "لا يوجد أطباء", hint: "أضف طبيباً من «المستخدمون» بدور «طبيب»." }} />
      {sel && <DoctorDetail key={sel.doctor_id} d={sel} />}
    </div>
  );
}

function DoctorDetail({ d }: { d: Doctor }) {
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-center gap-4 rounded-card border border-line bg-surface p-4">
        <DoctorPhoto src={d.photo_url} name={d.full_name} textClass="text-3xl" className="size-20 rounded-3xl" />
        <div className="flex flex-1 flex-col gap-0.5"><span className="text-lg font-bold">{d.full_name}</span><span className="sub">{d.specialty}{d.job_title ? ` · ${d.job_title}` : ""} · {d.clinic_name}</span>
          <span className="flex items-center gap-1 text-xs text-ink-2"><Icon name="image-plus" size={14} />الصورة تظهر في تطبيق المريض وبطاقات الموقع (تُرفع من التخزين)</span></div>
      </div>
      <Schedule d={d} />
      <DoctorSettingsPanel d={d} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Commissions d={d} />
        <CancelDay d={d} />
      </div>
    </div>
  );
}

const PARAM_AR = { code: "الرمز", name: "الاسم", unit: "الوحدة", critical_low: "حرج أدنى", ref_low: "أدنى", ref_high: "أعلى", critical_high: "حرج أعلى" } as const;

/** إعدادات الطبيب باتفاقه مع مدير الفرع (المرحلة 3). الحقل الفارغ = إعداد الفرع. */
function DoctorSettingsPanel({ d }: { d: Doctor }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["doctor-settings", d.doctor_id], queryFn: () => doctorsAdminApi.settings(d.doctor_id) });
  const [f, setF] = useState<Record<string, string>>({});
  const [extra, setExtra] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  if (q.isPending) return <Spinner />;
  if (q.isError) return <Alert tone="danger">{errorMessage(q.error)}</Alert>;
  const v = q.data;
  const val = (k: keyof typeof v) => f[k as string] ?? (v[k] == null ? "" : String(v[k]));
  const num = (k: keyof typeof v) => { const x = val(k).trim(); return x === "" ? null : Number(x); };
  // دالة عادية (لا مكوّن) حتى لا يُعاد إنشاء الحقل ويفقد التركيز مع كل حرف
  const numField = (k: keyof typeof v, label: string, hint: string) => (
    <label key={k as string} className="flex min-w-0 flex-col gap-1.5"><span className="sub">{label}</span>
      <input inputMode="numeric" dir="ltr" value={val(k)} onChange={(e) => setF((o) => ({ ...o, [k]: e.target.value.replace(/[^\d]/g, "") }))} placeholder={hint}
        className="num h-11 rounded-field border-[1.5px] border-line-strong bg-surface px-3 outline-none" />
      <span className="sub-sm">{hint}</span>
    </label>
  );
  const allow = extra ?? v.allow_extra;
  return (
    <Panel title="إعدادات الطبيب" icon="settings-2" actions={<span className="sub-sm">الفارغ = إعداد الفرع</span>}>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {numField("follow_up_days", "مدة المراجعة (يوم)", `الفرع: ${v.branch_follow_up_days}`)}
        {numField("follow_up_price", "سعر المراجعة (د.ع)", "0 = مجانية · فارغ = سعر الخدمة")}
        {numField("online_deposit_amount", "العربون الإلكتروني (د.ع)", `0 = لا عربون · الفرع: ${v.branch_online_deposit_amount}`)}
        {numField("late_grace_minutes", "مهلة المتأخر (دقيقة)", `الفرع: ${v.branch_late_grace_minutes}`)}
        {numField("free_return_days", "مدة العودة المجانية بالنتائج (يوم)", `فارغ = العيادة ثم الفرع · المطبق: ${v.effective_free_return_days ?? 7}`)}
        <label className="flex items-center gap-3 rounded-xl border border-line px-3.5 py-3 text-sm sm:col-span-2">
          <input type="checkbox" checked={allow} onChange={(e) => setExtra(e.target.checked)} className="size-4" />
          <span className="flex-1">يقبل مراجعين «إضافي» فوق السعة<span className="sub-sm block">إلغاء التحديد = «ممنوع الإضافي»</span></span>
        </label>
      </div>
      <Button size="md" icon="save" loading={busy} onClick={async () => {
        setBusy(true);
        try {
          await doctorsAdminApi.putSettings(d.doctor_id, { allow_extra: allow, late_grace_minutes: num("late_grace_minutes"), follow_up_days: num("follow_up_days"), follow_up_price: num("follow_up_price"), online_deposit_amount: num("online_deposit_amount"), free_return_days: num("free_return_days") });
          toast.success("حُفظت إعدادات الطبيب"); setF({}); setExtra(null);
          void qc.invalidateQueries({ queryKey: ["doctor-settings", d.doctor_id] });
        } catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); }
      }}>حفظ الإعدادات</Button>
    </Panel>
  );
}

function Schedule({ d }: { d: Doctor }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["schedule", d.doctor_id], queryFn: () => doctorsAdminApi.schedule(d.doctor_id) });
  const [rows, setRows] = useState<ScheduleSlot[] | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (q.data) setRows(q.data.weekly); }, [q.data]);
  const upd = (i: number, p: Partial<ScheduleSlot>) => setRows((r) => r!.map((x, j) => j === i ? { ...x, ...p } : x));
  const cap = (s: ScheduleSlot) => { const [h1, m1] = s.start.split(":").map(Number), [h2, m2] = s.end.split(":").map(Number); const mins = h2 * 60 + m2 - (h1 * 60 + m1); return s.slot_minutes > 0 && mins > 0 ? Math.floor(mins / s.slot_minutes) : 0; };
  return (
    <Panel title="الجدول الأسبوعي" icon="calendar-cog" actions={<span className="sub-sm">السعة = مدة الوجبة ÷ مدة المريض</span>}>
      {q.isPending || !rows ? <Spinner /> : (
        <>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {DAYS.map((day) => {
              const list = rows.map((r, i) => ({ r, i })).filter((x) => x.r.weekday === day.k);
              return (
                <div key={day.k} className="flex flex-col gap-1.5 rounded-2xl bg-bg p-2.5">
                  <span className="flex items-center text-[13px] font-bold"><span className="flex-1">{day.ar}</span>
                    <button aria-label={`إضافة وجبة ${day.ar}`} onClick={() => setRows((r) => [...r!, { weekday: day.k, start: "16:00", end: "20:00", slot_minutes: d.default_slot_minutes || 10, online_quota_percent: 60 }])} className="grid size-6 place-items-center rounded-full bg-primary text-on-accent"><Icon name="plus" size={13} /></button></span>
                  {!list.length && <span className="sub-sm">لا دوام</span>}
                  {list.map(({ r, i }) => (
                    <div key={i} className="flex flex-col gap-1 rounded-xl bg-surface p-2">
                      {([["start", "من"], ["end", "إلى"]] as const).map(([k, lbl]) => (
                        <div key={k} className="flex items-center gap-1.5 text-[11px] text-ink-2">
                          <span className="w-5 shrink-0">{lbl}</span>
                          <TimeField size="sm" aria-label={`${day.ar} ${lbl}`} value={r[k]} onChange={(v) => upd(i, { [k]: v })} />
                        </div>
                      ))}
                      <div className="flex items-center gap-1 text-[11px] text-ink-2">
                        <input inputMode="numeric" value={r.slot_minutes} onChange={(e) => upd(i, { slot_minutes: Number(e.target.value.replace(/\D/g, "")) || 0 })} className="num h-7 w-9 rounded-chip border border-line-strong bg-bg text-center text-xs text-ink outline-none focus:border-primary" aria-label="دقائق المريض" />د
                        <input inputMode="numeric" value={r.online_quota_percent} onChange={(e) => upd(i, { online_quota_percent: Math.min(100, Number(e.target.value.replace(/\D/g, "")) || 0) })} className="num h-7 w-9 rounded-chip border border-line-strong bg-bg text-center text-xs text-ink outline-none focus:border-primary" aria-label="نسبة الأونلاين" />%
                        <span className="flex-1 text-end">سعة <b className="num">{cap(r)}</b></span>
                        <button aria-label="حذف" onClick={() => setRows((x) => x!.filter((_, j) => j !== i))}><Icon name="trash-2" size={13} className="text-ink-muted hover:text-danger" /></button>
                      </div>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
          <Button size="md" className="self-start" loading={busy} icon="save" onClick={async () => {
            setBusy(true);
            try { await doctorsAdminApi.putSchedule(d.doctor_id, rows.map(({ weekday, start, end, slot_minutes, online_quota_percent, session_template_id }) => ({ weekday, start, end, slot_minutes, online_quota_percent, session_template_id }))); toast.success("حُفظ الجدول"); void qc.invalidateQueries({ queryKey: ["schedule", d.doctor_id] }); }
            catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); }
          }}>حفظ الجدول</Button>
        </>
      )}
    </Panel>
  );
}

function Commissions({ d }: { d: Doctor }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["commissions", d.doctor_id], queryFn: () => doctorsAdminApi.commissions(d.doctor_id) });
  const [open, setOpen] = useState(false);
  const [nv, setNv] = useState("70"); const [fu, setFu] = useState("60"); const [from, setFrom] = useState(todayBaghdad());
  const [busy, setBusy] = useState(false);
  const today = todayBaghdad();
  return (
    <Panel title="نسب الطبيب" icon="percent" actions={<Button size="md" variant="ghost" icon="plus" onClick={() => setOpen(true)}>نسبة جديدة</Button>}>
      {q.isPending ? <Spinner /> : !q.data?.items.length ? <span className="sub">لا توجد نسب مسجلة.</span> : q.data.items.map((c) => {
        const future = c.effective_from > today, cur = q.data.current?.effective_from === c.effective_from;
        return (
          <div key={c.effective_from + c.created_at} className="flex items-center gap-3 rounded-xl bg-bg px-3 py-2.5">
            <Icon name={cur ? "circle-check" : future ? "calendar-clock" : "history"} size={18} className={cur ? "text-success" : future ? "text-info" : "text-ink-muted"} />
            <span className="flex flex-1 flex-col"><span className="text-sm font-semibold">{cur ? "سارية" : future ? "قادمة" : "سابقة"}</span><span className="sub-sm">من <span className="num">{fmtDate(c.effective_from)}</span></span></span>
            <span className="text-xs">جديد <b className="num">{c.new_visit_rate}%</b></span>
            <span className="text-xs">مراجعة <b className="num">{c.follow_up_rate}%</b></span>
          </div>
        );
      })}
      <span className="flex items-center gap-1.5 text-xs text-ink-2"><Icon name="info" size={14} />النسب الجديدة لا تمس الفواتير السابقة.</span>
      <Modal open={open} onClose={() => setOpen(false)} title="نسبة جديدة" icon="percent" width={400}>
        <div className="grid grid-cols-2 gap-2"><Field label="جديد %" ltr inputMode="numeric" value={nv} onChange={(e) => setNv(e.target.value.replace(/\D/g, ""))} /><Field label="مراجعة %" ltr inputMode="numeric" value={fu} onChange={(e) => setFu(e.target.value.replace(/\D/g, ""))} /></div>
        <DateField label="تسري من" value={from} min={today} onChange={(v) => { if (v) setFrom(v); }} />
        <Button loading={busy} icon="check" onClick={async () => {
          setBusy(true);
          try { await doctorsAdminApi.addCommission(d.doctor_id, { new_visit_rate: Math.min(100, Number(nv)), follow_up_rate: Math.min(100, Number(fu)), effective_from: from }); toast.success("أُضيفت النسبة"); setOpen(false); void qc.invalidateQueries({ queryKey: ["commissions", d.doctor_id] }); }
          catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); }
        }}>حفظ</Button>
      </Modal>
    </Panel>
  );
}

function CancelDay({ d }: { d: Doctor }) {
  const [date, setDate] = useState(addDays(todayBaghdad(), 1));
  const [open, setOpen] = useState(false);
  return (
    <Panel title="إلغاء وجبة يوم (إجازة)" icon="calendar-off">
      <DateField label="التاريخ" value={date} min={todayBaghdad()} onChange={(v) => { if (v) setDate(v); }} />
      <span className="flex items-center gap-1.5 text-xs text-warn-strong"><Icon name="bell-ring" size={15} />الحجوزات تُلغى ويُبلغ أصحابها، والمدفوع يتحول رصيداً.</span>
      <Button variant="danger" size="md" icon="calendar-x" onClick={() => setOpen(true)}>إلغاء الوجبة</Button>
      <ReasonDialog open={open} title={`إلغاء وجبة ${fmtDate(date)}`} icon="calendar-x" danger confirmText="إلغاء الوجبة" onClose={() => setOpen(false)}
        onConfirm={async (reason) => { const r = await doctorsAdminApi.cancelSession(d.doctor_id, date, reason); toast.success(`أُلغيت · ${r.affected_bookings} حجز · أُبلغ ${r.notified}`); }} />
    </Panel>
  );
}

// ------------------------------------------------------------------ الخدمات
const TYPES: Record<ServiceType, { label: string; icon: string; cls: string }> = {
  consultation: { label: "كشفية", icon: "stethoscope", cls: "bg-primary-soft text-primary-strong" },
  lab: { label: "تحليل", icon: "flask-conical", cls: "bg-lab-soft text-lab" },
  radiology: { label: "أشعة", icon: "scan-line", cls: "bg-info-soft text-info" },
  procedure: { label: "إجراء", icon: "hand-coins", cls: "bg-pharm-soft text-pharm" },
};
const MODALITY = MODALITY_AR;

export function ServicesScreen() {
  const me = useAuth((s) => s.user)!;
  const [type, setType] = useState<"all" | ServiceType>("all");
  const [text, setText] = useState("");
  const q = useDebounced(text);
  const list = useQuery({ queryKey: ["services", "admin", type, q], queryFn: () => servicesAdminApi.list({ type: type === "all" ? undefined : type, q: q || undefined, include_inactive: true }) });
  const clinics = useQuery({ queryKey: ["clinics", me.branch_id, "all"], queryFn: () => branchesApi.clinics(me.branch_id, true) });
  const cName = (id?: string | null) => clinics.data?.items.find((c) => c.clinic_id === id)?.name;
  const [edit, setEdit] = useState<Service | "new" | null>(null);
  const [tpl, setTpl] = useState<Service | null>(null);
  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="w-full sm:w-[180px]"><ISelect size="md" aria-label="نوع الخدمة" value={type} searchable={false} onChange={(v) => { if (v) setType(v as typeof type); }} options={[{ value: "all", label: "كل الأنواع" }, ...(Object.keys(TYPES) as ServiceType[]).map((t) => ({ value: t, label: TYPES[t].label, icon: TYPES[t].icon }))]} /></div>
        <div className="flex h-10 min-w-[200px] flex-1 items-center gap-2 rounded-full border border-line-strong bg-surface px-3.5"><Icon name="search" size={16} className="text-ink-muted" /><input value={text} onChange={(e) => setText(e.target.value)} placeholder="بحث" className="min-w-0 flex-1 bg-transparent text-sm outline-none" /></div>
        <Button size="md" icon="plus" onClick={() => setEdit("new")}>خدمة جديدة</Button>
      </div>
      <DataGrid aria-label="الخدمات" rows={list.data?.items} loading={list.isPending} rowKey={(s) => s.service_id} minWidth={760}
        empty={{ icon: "tags", title: "لا توجد خدمات" }} rowClassName={(s) => (s.is_active ? "" : "opacity-55")}
        columns={[
          { key: "name", header: "الخدمة", sortable: true, cell: (s) => <span className="flex min-w-0 items-center gap-2.5"><span className={`grid size-8 shrink-0 place-items-center rounded-xl ${TYPES[s.type].cls}`}><Icon name={TYPES[s.type].icon} size={16} /></span><span className="truncate font-semibold">{s.name}</span>{!s.is_active && <Pill tone="muted">معطلة</Pill>}</span> },
          { key: "type", header: "النوع", width: "130px", value: (s) => TYPES[s.type].label, cell: (s) => <span className="text-[13px]">{TYPES[s.type].label}{s.visit_kind ? ` · ${s.visit_kind === "new_visit" ? "جديد" : "مراجعة"}` : ""}</span> },
          { key: "where", header: "العيادة / الجهاز", value: (s) => (s.modality ? MODALITY[s.modality] : cName(s.clinic_id) ?? ""), cell: (s) => <span className="text-[13px] text-ink-2">{s.modality ? MODALITY[s.modality] : cName(s.clinic_id) ?? "—"}</span> },
          { key: "price", header: "السعر", numeric: true, sortable: true, width: "120px", cell: (s) => <span className="font-semibold">{fmtNum(s.price)}</span> },
          { key: "commission", header: "نسبة الطبيب", width: "120px", cell: (s) => (s.is_commissionable ? <Pill tone="success" icon="percent">تُحتسب</Pill> : <Pill tone="muted">لا</Pill>) },
          { key: "act", header: <span className="sr-only">إجراءات</span>, width: "90px", cell: (s) => (
            <span className="flex gap-1">
              <button onClick={() => setEdit(s)} aria-label="تعديل" title="تعديل" className="grid size-8 place-items-center rounded-full text-ink-2 hover:bg-primary-soft"><Icon name="pencil" size={16} /></button>
              {s.type === "lab" && <button onClick={() => setTpl(s)} aria-label="قالب التحليل" title="قالب التحليل" className="grid size-8 place-items-center rounded-full text-lab hover:bg-lab-soft"><Icon name="list-checks" size={16} /></button>}
            </span>) },
        ]} />
      <span className="flex items-center gap-1.5 text-xs text-ink-2"><Icon name="history" size={15} />تغيير السعر لا يؤثر على الفواتير السابقة · كل بند يحفظ نسخة من السعر</span>
      {edit && <ServiceForm s={edit === "new" ? null : edit} clinics={(clinics.data?.items ?? []).filter((c) => c.is_active)} onClose={() => setEdit(null)} />}
      {tpl && <Template s={tpl} onClose={() => setTpl(null)} />}
    </div>
  );
}

function ServiceForm({ s, clinics, onClose }: { s: Service | null; clinics: { clinic_id: string; name: string; department: string }[]; onClose: () => void }) {
  const qc = useQueryClient();
  const [f, setF] = useState({ name: s?.name ?? "", type: (s?.type ?? "lab") as ServiceType, visit_kind: s?.visit_kind ?? "new_visit", modality: s?.modality ?? "ultrasound", clinic_id: s?.clinic_id ?? "", price: s?.price ?? 0, is_commissionable: s?.is_commissionable ?? false, is_active: s?.is_active ?? true, reason: "" });
  const [err, setErr] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const fe = fieldErrors(err);
  const deptFor: Record<ServiceType, string> = { consultation: "clinic", lab: "lab", radiology: "radiology", procedure: "clinic" };
  const priceChanged = !!s && s.price !== f.price;
  async function save() {
    setBusy(true); setErr(null);
    try {
      if (s) await servicesAdminApi.update(s.service_id, { name: f.name, clinic_id: f.clinic_id || null, price: f.price, is_commissionable: f.is_commissionable, is_active: f.is_active, reason: f.reason || undefined });
      else await servicesAdminApi.create({ name: f.name, type: f.type, visit_kind: f.type === "consultation" ? f.visit_kind : null, modality: f.type === "radiology" ? f.modality : null, clinic_id: f.clinic_id || null, price: f.price, is_commissionable: f.is_commissionable });
      toast.success("حُفظت الخدمة"); void qc.invalidateQueries({ queryKey: ["services"] }); onClose();
    } catch (e) { setErr(e); } finally { setBusy(false); }
  }
  return (
    <Modal open onClose={onClose} title={s ? `تعديل ${s.name}` : "خدمة جديدة"} icon="tags" width={520}>
      {!s && <ISelect label="نوع الخدمة" value={f.type} searchable={false} onChange={(v) => { if (v) setF({ ...f, type: v as ServiceType, is_commissionable: v === "consultation" }); }} options={(Object.keys(TYPES) as ServiceType[]).map((t) => ({ value: t, label: TYPES[t].label, icon: TYPES[t].icon }))} />}
      <TextInput label="اسم الخدمة" value={f.name} onChange={(v) => setF({ ...f, name: v })} />
      {fe.name && <span className="text-xs text-danger-strong">{fe.name}</span>}
      {!s && f.type === "consultation" && <Segmented size="sm" value={f.visit_kind as "new_visit" | "follow_up"} onChange={(v) => setF({ ...f, visit_kind: v })} options={[{ value: "new_visit", label: "كشف جديد" }, { value: "follow_up", label: "مراجعة" }]} />}
      {!s && f.type === "radiology" && <Select label="الجهاز" value={f.modality as string} onChange={(v) => setF({ ...f, modality: v as "ultrasound" })} options={["xray", "ultrasound", "ct", "mri"].map((k) => ({ value: k, label: MODALITY[k] }))} />}
      <Select label="العيادة / القسم" value={f.clinic_id} placeholder="—" onChange={(v) => setF({ ...f, clinic_id: v })} options={clinics.filter((c) => c.department === deptFor[f.type] || f.type === "procedure").map((c) => ({ value: c.clinic_id, label: c.name }))} />
      <MoneyInput label="السعر" value={f.price} onChange={(n) => setF({ ...f, price: n })} />
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.is_commissionable} onChange={(e) => setF({ ...f, is_commissionable: e.target.checked })} className="size-4" />تُحتسب منها نسبة للطبيب</label>
      {s && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.is_active} onChange={(e) => setF({ ...f, is_active: e.target.checked })} className="size-4" />فعّالة</label>}
      {priceChanged && <TextInput label="سبب تغيير السعر" value={f.reason} onChange={(v) => setF({ ...f, reason: v })} icon="notebook-pen" />}
      {err != null && <Alert tone="danger">{errorMessage(err)}</Alert>}
      <Button loading={busy} disabled={!f.name.trim() || f.price <= 0} icon="save" onClick={save}>حفظ</Button>
    </Modal>
  );
}

function Template({ s, onClose }: { s: Service; onClose: () => void }) {
  const q = useQuery({ queryKey: ["template", s.service_id], queryFn: () => servicesAdminApi.template(s.service_id), retry: false });
  const [type, setType] = useState<"numeric" | "text">("numeric");
  const [ps, setPs] = useState<Omit<LabParam, "sort_order">[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  useEffect(() => { if (q.data) { setType(q.data.result_type === "text" ? "text" : "numeric"); setPs(q.data.parameters); } }, [q.data]);
  const num = (v: string) => (v.trim() === "" ? null : Number(v));
  const upd = (i: number, p: Partial<LabParam>) => setPs((x) => x.map((r, j) => j === i ? { ...r, ...p } : r));
  return (
    <Modal open onClose={onClose} title={`قالب التحليل · ${s.name}`} icon="list-checks" width={860}>
      <span className="sub">البارامترات والمدى المرجعي والحدود الحرجة. يستخدمه المختبر لحساب العلامات.</span>
      <Segmented size="sm" value={type} onChange={setType} options={[{ value: "numeric", label: "رقمي" }, { value: "text", label: "وصفي" }]} />
      {q.isPending ? <Spinner /> : type === "text" ? <Alert tone="info">تحليل وصفي: يكتب المختبر النتيجة نصاً بدون بارامترات.</Alert> : (
        <div className="overflow-x-auto">
          <div className="grid min-w-[720px] grid-cols-[90px_minmax(0,1fr)_80px_80px_80px_80px_80px_30px] gap-1.5 text-xs font-semibold text-ink-2" dir="ltr">
            <span>الرمز</span><span>الاسم</span><span>الوحدة</span><span>حرج أدنى</span><span>أدنى</span><span>أعلى</span><span>حرج أعلى</span><span />
            {ps.map((p, i) => (
              <div key={i} className="contents">
                {(["code", "name", "unit"] as const).map((k) => <input key={k} aria-label={PARAM_AR[k]} dir={k === "name" ? "rtl" : "ltr"} value={p[k] ?? ""} onChange={(e) => upd(i, { [k]: e.target.value })} className="num h-9 rounded-xl border border-line-strong bg-surface px-2 text-sm outline-none focus:border-primary" />)}
                {(["critical_low", "ref_low", "ref_high", "critical_high"] as const).map((k) => <input key={k} aria-label={PARAM_AR[k]} inputMode="decimal" value={p[k] ?? ""} onChange={(e) => upd(i, { [k]: num(e.target.value.replace(/[^\d.-]/g, "")) })} className="num h-9 rounded-xl border border-line-strong bg-surface px-2 text-sm outline-none focus:border-primary" />)}
                <button aria-label="حذف" onClick={() => setPs((x) => x.filter((_, j) => j !== i))}><Icon name="trash-2" size={15} className="text-ink-muted" /></button>
              </div>
            ))}
          </div>
        </div>
      )}
      <button onClick={() => setPs((x) => [...x, { code: "", name: "", unit: "", ref_low: null, ref_high: null, critical_low: null, critical_high: null }])} className="flex items-center gap-1.5 self-start text-sm font-semibold text-lab"><Icon name="plus" size={14} />إضافة بارامتر</button>
      <span className="sub-sm">الحرج الأدنى ≤ الأدنى ≤ الأعلى ≤ الحرج الأعلى · بارامتر عليه نتائج لا يُحذف</span>
      {err != null && <Alert tone="danger">{errorMessage(err)}</Alert>}
      <Button loading={busy} icon="save" onClick={async () => {
        setBusy(true); setErr(null);
        try { await servicesAdminApi.putTemplate(s.service_id, { parameters: type === "text" ? [] : ps.map((p, i) => ({ ...p, sort_order: i + 1 })) }); toast.success("حُفظ القالب"); onClose(); } catch (e) { setErr(e); } finally { setBusy(false); }
      }}>حفظ القالب</Button>
    </Modal>
  );
}
