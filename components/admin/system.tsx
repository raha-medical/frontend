"use client";
/** الأجهزة، قوائم الاختيار، الإعدادات، الدمج والتدقيق، النسخ الاحتياطي، الرسائل التجريبية — Admin.dc.html. */
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Icon } from "@/components/icon";
import { toast } from "@/components/toast";
import { Alert, Badge, Button, CellStack, DataGrid, ISelect, Spinner, type Column } from "@/components/ui";
import { backupsApi, branchesApi, devicesApi, lookupsApi, mergeApi, sandboxApi, settingsApi, type Device, type DeviceKind, type Lookup, type Setting } from "@/lib/api/admin";
import { patientsApi } from "@/lib/api/reception";
import { errorMessage } from "@/lib/api/errors";
import { fmtDateTime, fmtNum } from "@/lib/format";
import { auditActionAr, entityAr } from "@/lib/labels";
import { useAuth } from "@/lib/auth/store";
import { PatientPicker, TextInput } from "@/components/reception/common";
import { BranchSelect, Panel, Pill, SecretBox, Select } from "./kit";

// ------------------------------------------------------------------ الأجهزة
const displayLink = (id: string, key: string) => `${typeof window === "undefined" ? "" : window.location.origin}/display?display_id=${id}&key=${encodeURIComponent(key)}`;

const KIND: Record<DeviceKind, { label: string; icon: string }> = {
  reception_pc: { label: "حاسوب استقبال", icon: "monitor" }, display: { label: "شاشة انتظار", icon: "monitor-smartphone" },
  lab_pc: { label: "حاسوب مختبر", icon: "flask-conical" }, radiology_pc: { label: "حاسوب أشعة", icon: "scan-line" }, pharmacy_pc: { label: "حاسوب صيدلية", icon: "pill" },
};
export function DevicesScreen() {
  const me = useAuth((s) => s.user)!;
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ["devices"], queryFn: devicesApi.list });
  const clinics = useQuery({ queryKey: ["clinics", me.branch_id, "all"], queryFn: () => branchesApi.clinics(me.branch_id, true) });
  const [kind, setKind] = useState<DeviceKind>("reception_pc");
  const [name, setName] = useState("");
  const [clinic, setClinic] = useState("");
  const [busy, setBusy] = useState(false);
  const [secret, setSecret] = useState<{ label: string; v: string; link?: string } | null>(null);
  const cName = (id: string | null) => clinics.data?.items.find((c) => c.clinic_id === id)?.name ?? "الفرع";
  const deviceCols: Column<Device>[] = [
    { key: "name", header: "الجهاز", sortable: true, value: (d) => `${d.name} ${d.device_code}`, cell: (d) => <CellStack title={d.name} sub={<span className="num" dir="ltr">{d.device_code}</span>} icon={<span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary"><Icon name={KIND[d.kind]?.icon ?? "monitor"} size={18} /></span>} /> },
    { key: "kind", header: "النوع", width: "130px", value: (d) => KIND[d.kind]?.label ?? d.kind, cell: (d) => <span className="text-[13px] text-ink-2">{KIND[d.kind]?.label ?? d.kind}{!d.is_active && <> · <Pill tone="muted">متوقف</Pill></>}</span> },
    { key: "clinic", header: "القسم", width: "130px", value: (d) => cName(d.clinic_id), cell: (d) => <span className="text-[13px] text-ink-2">{cName(d.clinic_id)}</span> },
    { key: "act", header: <span className="sr-only">إجراءات</span>, width: "150px", sticky: true, cell: (d) => (
      <span className="flex items-center gap-1">
        <button onClick={() => navigator.clipboard?.writeText(d.device_code)} title="نسخ الرمز" aria-label="نسخ الرمز" className="grid size-8 place-items-center rounded-full text-ink-2 hover:bg-bg"><Icon name="copy" size={15} /></button>
        {d.kind === "display" && <Button size="sm" variant="ghost" icon="key-round" onClick={async () => { try { const k = (await devicesApi.displayKey(d.device_id)).display_key; setSecret({ label: `مفتاح ${d.name}`, v: k, link: displayLink(d.device_id, k) }); } catch (e) { toast.error(errorMessage(e)); } }}>مفتاح جديد</Button>}
      </span>
    ) },
  ];
  return (
    <div className="grid items-start gap-4 2xl:grid-cols-[minmax(0,1fr)_380px]">
      <DataGrid<Device> aria-label="الأجهزة" rows={list.data?.items} loading={list.isPending} error={list.isError ? errorMessage(list.error) : undefined} rowKey={(d) => d.device_id} minWidth={560} columns={deviceCols}
        search={{ placeholder: "ابحث باسم الجهاز أو رمزه" }} empty={{ icon: "monitor-smartphone", title: "لا توجد أجهزة", hint: "سجّل حاسوب الاستقبال أولاً، ثم ضع رمزه في NEXT_PUBLIC_DEVICE_CODE." }} />
      <Panel title="جهاز جديد" icon="monitor-smartphone" className="2xl:sticky 2xl:top-24">
        <ISelect label="نوع الجهاز" value={kind} searchable={false} onChange={(v) => { if (v) setKind(v as DeviceKind); }} options={(Object.keys(KIND) as DeviceKind[]).map((k) => ({ value: k, label: KIND[k].label, icon: KIND[k].icon }))} />
        <TextInput label="الاسم" value={name} onChange={setName} icon="tag" placeholder={kind === "display" ? "شاشة انتظار الباطنية" : "حاسوب الاستقبال 1"} />
        <Select label={kind === "display" ? "العيادة (إلزامي للشاشة)" : "القسم (اختياري)"} value={clinic} placeholder="—" onChange={setClinic} options={(clinics.data?.items ?? []).filter((c) => c.is_active).map((c) => ({ value: c.clinic_id, label: c.name }))} />
        {secret && <SecretBox label={secret.label} value={secret.v} link={secret.link} />}
        <Button loading={busy} disabled={!name.trim() || (kind === "display" && !clinic)} icon="plus" onClick={async () => {
          setBusy(true);
          try { const r = await devicesApi.create({ kind, name: name.trim(), clinic_id: clinic || null }); toast.success(`سُجل الجهاز · ${r.device_code}`); if (r.display_key) setSecret({ label: "مفتاح الشاشة", v: r.display_key, link: displayLink(r.device_id, r.display_key) }); setName(""); void qc.invalidateQueries({ queryKey: ["devices"] }); }
          catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); }
        }}>تسجيل الجهاز</Button>
        <span className="flex items-start gap-1.5 text-xs leading-6 text-ink-2"><Icon name="info" size={14} className="mt-1" />رمز جهاز الاستقبال يوضع في إعداد الواجهة NEXT_PUBLIC_DEVICE_CODE ليعمل الأوفلاين وكتل الإيصالات.</span>
      </Panel>
    </div>
  );
}

// ------------------------------------------------------------------ قوائم الاختيار
export function LookupsScreen() {
  const qc = useQueryClient();
  const cats = useQuery({ queryKey: ["lookups"], queryFn: lookupsApi.categories });
  const [cat, setCat] = useState<string>("");
  useEffect(() => { if (!cat && cats.data?.items[0]) setCat(cats.data.items[0].category); }, [cats.data, cat]);
  const items = useQuery({ queryKey: ["lookups", cat, "all"], queryFn: () => lookupsApi.list(cat, true), enabled: !!cat });
  const [name, setName] = useState("");
  const [editing, setEditing] = useState<Lookup | null>(null);
  const [editName, setEditName] = useState("");
  const inv = () => { void qc.invalidateQueries({ queryKey: ["lookups"] }); };
  const act = async (fn: () => Promise<unknown>, ok: string) => { try { await fn(); toast.success(ok); inv(); } catch (e) { toast.error(errorMessage(e)); } };
  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-full sm:w-[300px]"><ISelect label="القائمة" value={cat} loading={cats.isPending} onChange={(v) => { if (v) setCat(v); }} options={cats.data?.items.map((c) => ({ value: c.category, label: c.name_ar, icon: "list", hint: String(c.active_count) }))} /></div>
        <form className="flex min-w-[260px] flex-1 gap-2" onSubmit={(e) => { e.preventDefault(); if (name.trim()) void act(() => lookupsApi.create(cat, { name_ar: name.trim() }), "أُضيفت القيمة").then(() => setName("")); }}>
          <div className="flex h-[42px] flex-1 items-center gap-2 rounded-field border-[1.5px] border-line-strong bg-surface px-3 focus-within:border-primary"><Icon name="plus" size={15} className="text-primary" /><input value={name} onChange={(e) => setName(e.target.value)} placeholder="قيمة جديدة" aria-label="قيمة جديدة" className="min-w-0 flex-1 bg-transparent text-sm outline-none" /></div>
          <Button size="md" icon="check" disabled={!name.trim()}>إضافة</Button>
        </form>
      </div>
      <DataGrid<Lookup> aria-label="قيم القائمة" rows={items.data?.items} loading={items.isPending} error={items.isError ? errorMessage(items.error) : undefined} rowKey={(l) => l.lookup_id} minWidth={560} rowClassName={(l) => (l.is_active ? "" : "opacity-55")}
        search={{ placeholder: "ابحث في القيم" }} empty={{ icon: "list", title: "لا توجد قيم" }}
        columns={[
          { key: "name_ar", header: "القيمة", sortable: true, cell: (l) => (editing?.lookup_id === l.lookup_id
            ? <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); void act(() => lookupsApi.update(cat, l.lookup_id, { name_ar: editName.trim() }), "حُفظ").then(() => setEditing(null)); }}>
                <input autoFocus value={editName} onChange={(e) => setEditName(e.target.value)} aria-label="الاسم" className="h-9 min-w-0 flex-1 rounded-xl border border-primary bg-surface px-2 text-sm outline-none" /><Button size="sm" icon="check">حفظ</Button></form>
            : <span className="flex items-center gap-2 text-sm font-medium">{l.name_ar}{l.is_system && <Pill tone="muted" icon="lock">نظام</Pill>}</span>) },
          { key: "code", header: "الرمز", width: "160px", cell: (l) => <span className="num text-xs text-ink-2" dir="ltr">{l.code}</span> },
          { key: "is_active", header: "الحالة", width: "100px", value: (l) => (l.is_active ? "فعّال" : "موقوف"), cell: (l) => (l.is_active ? <Pill tone="success">فعّال</Pill> : <Pill tone="muted">موقوف</Pill>) },
          { key: "act", header: <span className="sr-only">إجراءات</span>, width: "84px", sticky: true, cell: (l) => (
            <span className="flex gap-1">
              <button onClick={() => { setEditing(l); setEditName(l.name_ar); }} aria-label={`تعديل ${l.name_ar}`} title="تعديل" className="grid size-8 place-items-center rounded-full text-ink-2 hover:bg-bg"><Icon name="pencil" size={15} /></button>
              {!l.is_system && <button onClick={() => act(() => lookupsApi.update(cat, l.lookup_id, { is_active: !l.is_active }), l.is_active ? "أُوقفت" : "فُعّلت")} aria-label={l.is_active ? "إيقاف" : "تفعيل"} title={l.is_active ? "إيقاف" : "تفعيل"} className="grid size-8 place-items-center rounded-full text-ink-2 hover:bg-bg"><Icon name={l.is_active ? "eye-off" : "eye"} size={15} /></button>}
            </span>
          ) },
        ]} />
    </div>
  );
}

// ------------------------------------------------------------------ الإعدادات
export function SettingsScreen() {
  const me = useAuth((s) => s.user)!;
  const qc = useQueryClient();
  const [scope, setScope] = useState<"global" | "branch">(me.role === "admin" ? "global" : "branch");
  const [branch, setBranch] = useState(me.branch_id);
  const q = useQuery({ queryKey: ["settings", scope, branch], queryFn: () => scope === "global" ? settingsApi.global() : settingsApi.branch(branch) });
  const [draft, setDraft] = useState<Record<string, number | string | null>>({});
  const [busy, setBusy] = useState(false);
  useEffect(() => setDraft({}), [scope, branch]);
  const row = (s: Setting) => <SettingRow key={s.key} s={s} scope={scope} draft={draft[s.key]} onChange={(v) => setDraft((d) => ({ ...d, [s.key]: v }))} onReset={() => save({ [s.key]: null })} />;
  async function save(values = draft) {
    setBusy(true);
    try { if (scope === "global") await settingsApi.patchGlobal(values as Record<string, number | string>); else await settingsApi.patchBranch(branch, values); toast.success("حُفظت الإعدادات"); setDraft({}); void qc.invalidateQueries({ queryKey: ["settings"] }); }
    catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); }
  }
  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex flex-wrap items-center gap-3">
        {me.role === "admin" && <div className="w-full sm:w-[220px]"><ISelect size="md" aria-label="نطاق الإعدادات" value={scope} searchable={false} onChange={(v) => { if (v) setScope(v as typeof scope); }} options={[{ value: "global", label: "الإعدادات العامة", icon: "globe" }, { value: "branch", label: "تخصيص فرع", icon: "building-2" }]} /></div>}
        {scope === "branch" && <BranchSelect value={branch} onChange={setBranch} />}
        <span className="flex-1" />
        <Button size="md" icon="save" loading={busy} disabled={!Object.keys(draft).length} onClick={() => save()}>حفظ التغييرات</Button>
      </div>
      <span className="flex items-center gap-1.5 text-[13px] text-ink-2"><Icon name="info" size={15} />قيمة الفرع تتقدم على القيمة العامة</span>
      {q.isPending ? <Spinner /> : q.isError ? <Alert tone="danger">{errorMessage(q.error)}</Alert> : (<>
        {SETTING_GROUPS.map((g) => {
          const items = g.keys.map((k) => q.data.items.find((s) => s.key === k)).filter((s): s is Setting => !!s);
          return items.length > 0 && (
            <Panel key={g.title} title={g.title} icon={g.icon}>
              <div className="grid gap-2.5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">{items.map(row)}</div>
            </Panel>
          );
        })}
        <span className="text-sm font-bold">إعدادات أخرى</span>
        <div className="grid gap-2.5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          {q.data.items.filter((s) => !POLICY_KEYS.includes(s.key)).map(row)}
        </div>
      </>)}
    </div>
  );
}

/** المرحلة 3: مجموعات سياسة الحجز وتثبيت الحضور، بأسماء ومساعدة أوضح مما يعيده السيرفر. */
const SETTING_GROUPS: { title: string; icon: string; keys: string[] }[] = [
  { title: "سياسة إلغاء الحجز", icon: "calendar-x", keys: ["booking.cancel_min_hours", "booking.late_cancel_fee", "booking.late_cancel_counts_no_show", "booking.cancel_paid_to"] },
  { title: "تغيير موعد الحجز", icon: "calendar-clock", keys: ["booking.max_reschedules", "booking.reschedule_min_hours"] },
  { title: "تثبيت الحضور الذاتي", icon: "scan-qr-code", keys: ["checkin.self_enabled", "checkin.qr_scope"] },
];
const POLICY_KEYS = SETTING_GROUPS.flatMap((g) => g.keys);
const SETTING_META: Record<string, { label: string; help: string; warn?: (v: string) => string | null }> = {
  "booking.cancel_min_hours": { label: "مهلة الإلغاء المجاني", help: "الإلغاء قبل الموعد بهذه المدة أو أكثر مجاني. بعدها يُعد إلغاءً متأخراً." },
  "booking.late_cancel_fee": { label: "رسوم الإلغاء المتأخر", help: "تُضاف لحساب المريض وتُدفع في زيارته القادمة. 0 = بلا رسوم." },
  "booking.late_cancel_counts_no_show": { label: "الإلغاء المتأخر يُحتسب غياباً", help: "عند التفعيل يُحسب ضمن عدد مرات الغياب التي تؤدي للحظر." },
  "booking.cancel_paid_to": { label: "مصير المبلغ المدفوع إلكترونياً عند الإلغاء", help: "رصيد يُستخدم في الزيارة القادمة، أو إرجاع لوسيلة الدفع.", warn: (v) => (v === "refund" ? "الإرجاع غير مربوط ببوابة دفع حقيقية بعد: البوابة الحالية تجريبية، ولن يصل مال فعلي للمريض. استخدم «رصيد» حتى ربط البوابة." : null) },
  "booking.max_reschedules": { label: "أقصى عدد مرات تغيير الموعد", help: "لكل حجز. 0 = تغيير الموعد غير متاح." },
  "booking.reschedule_min_hours": { label: "مهلة تغيير الموعد", help: "لا يمكن للمريض تغيير موعده قبل الموعد بأقل من هذه المدة." },
  "checkin.self_enabled": { label: "تثبيت الحضور بمسح رمز الشاشة", help: "عند الإيقاف تُخفي الشاشة الرمز، ويثبت الحضور من الاستقبال فقط." },
  "checkin.qr_scope": { label: "نطاق رمز الشاشة", help: "«العيادة»: يصلح لحجوزات عيادة الشاشة فقط. «الفرع»: لأي عيادة في الفرع (لشاشة استعلامات عامة)." },
};

function SettingRow({ s, scope, draft, onChange, onReset }: { s: Setting; scope: "global" | "branch"; draft: number | string | null | undefined; onChange: (v: number | string) => void; onReset: () => void }) {
  const isEnum = !!s.options?.length;
  const v = draft ?? (isEnum ? s.value_text ?? "" : s.value);
  const custom = scope === "branch" && s.source === "branch";
  const isBool = !isEnum && s.min === 0 && s.max === 1;
  const meta = SETTING_META[s.key];
  const warning = meta?.warn?.(String(v));
  return (
    <div className={`flex min-w-0 flex-col gap-2 rounded-2xl border bg-surface p-3.5 ${draft !== undefined ? "border-primary" : "border-line"}`}>
      <div className="flex items-start gap-2"><span className="flex flex-1 flex-col gap-0.5"><span className="text-sm font-semibold">{meta?.label ?? s.label_ar}</span>{meta && <span className="sub-sm leading-5">{meta.help}</span>}<span className="num text-[11px] text-ink-muted" dir="ltr">{s.key}</span></span>
        <Pill tone={s.source === "branch" ? "primary" : s.source === "global" ? "info" : "muted"} icon={s.source === "branch" ? "building-2" : "globe"}>{s.source === "branch" ? "مخصص للفرع" : s.source === "global" ? "عام" : "افتراضي"}</Pill></div>
      <div className="flex items-center gap-2">
        {isEnum ? <div className="min-w-0 flex-1"><Select value={String(v)} onChange={onChange} options={s.options!.map((o) => ({ value: o.value, label: o.label_ar }))} /></div>
          : isBool ? <button onClick={() => onChange(Number(v) ? 0 : 1)} className={`flex h-10 items-center gap-2 rounded-full px-4 text-sm font-semibold ${Number(v) ? "bg-success text-on-accent" : "bg-bg text-ink-2"}`}><Icon name={Number(v) ? "zap" : "zap-off"} size={15} />{Number(v) ? "مفعّل" : "مطفأ"}</button>
          : (
            <div className="flex items-center gap-1.5">
              <button aria-label="إنقاص" onClick={() => onChange(Math.max(s.min, Number(v) - (s.max > 1000 ? 1000 : 1)))} className="grid size-9 place-items-center rounded-full border border-line-strong"><Icon name="minus" size={14} /></button>
              <input inputMode="numeric" dir="ltr" aria-label={meta?.label ?? s.label_ar} value={fmtNum(Number(v))} onChange={(e) => { const n = Number(e.target.value.replace(/\D/g, "")) || 0; onChange(Math.min(s.max, n)); }} className="num h-10 w-28 rounded-xl border border-line-strong bg-surface text-center text-base font-bold outline-none focus:border-primary" />
              <button aria-label="زيادة" onClick={() => onChange(Math.min(s.max, Number(v) + (s.max > 1000 ? 1000 : 1)))} className="grid size-9 place-items-center rounded-full bg-primary text-on-accent"><Icon name="plus" size={14} /></button>
              <span className="sub-sm">{s.unit}</span>
            </div>
          )}
        <span className="flex-1" />
        {!isEnum && !isBool && <span className="num text-[11px] text-ink-muted">{fmtNum(s.min)} – {fmtNum(s.max)}</span>}
      </div>
      {warning && <Alert tone="warn" icon="triangle-alert">{warning}</Alert>}
      {custom && <button onClick={onReset} className="flex items-center gap-1 self-start text-xs font-semibold text-primary"><Icon name="rotate-ccw" size={13} />إرجاع للعامة ({isEnum ? s.global_value_text : fmtNum(s.global_value)})</button>}
    </div>
  );
}

// ------------------------------------------------------------------ الدمج والتدقيق
export function MergeScreen() {
  const qc = useQueryClient();
  const [a, setA] = useState<string | null>(null);
  const [b, setB] = useState<string | null>(null);
  const pa = useQuery({ queryKey: ["patient", a], queryFn: () => patientsApi.get(a!), enabled: !!a });
  const pb = useQuery({ queryKey: ["patient", b], queryFn: () => patientsApi.get(b!), enabled: !!b });
  const [busy, setBusy] = useState(false);
  const audit = useQuery({ queryKey: ["audit"], queryFn: () => mergeApi.audit({ page_size: 30 }) });
  const Card = ({ p, tag, tone, clear }: { p: typeof pa.data; tag: string; tone: "success" | "warn"; clear: () => void }) => p ? (
    <div className="flex flex-col gap-2 rounded-card border border-line bg-surface p-4">
      <span className="flex items-center"><Pill tone={tone} icon={tone === "success" ? "shield-check" : "copy"}>{tag}</Pill><span className="flex-1" /><button onClick={clear} aria-label="تغيير"><Icon name="x" size={16} className="text-ink-muted" /></button></span>
      <span className="text-lg font-bold">{p.full_name}</span><span className="num text-sm text-ink-2">{p.file_number} · {p.phone_number}</span>
      <span className="sub-sm">غيابات <span className="num">{p.no_show_count}</span> · رصيد <span className="num">{fmtNum(p.credit_balance)}</span>{p.merged_into_patient_id ? " · مدموج مسبقاً" : ""}</span>
    </div>
  ) : null;
  return (
    <div className="flex flex-col gap-4">
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_60px_minmax(0,1fr)]">
        {a && pa.data ? <Card p={pa.data} tag="الملف الأساسي (يبقى)" tone="success" clear={() => setA(null)} /> : <PatientPicker title="الملف الأساسي" onPick={setA} />}
        <span className="hidden place-self-center text-primary lg:grid"><Icon name="git-merge" size={26} /></span>
        {b && pb.data ? <Card p={pb.data} tag="الملف المكرر (يُغلق)" tone="warn" clear={() => setB(null)} /> : <PatientPicker title="الملف المكرر" onPick={setB} />}
      </div>
      {a && b && (
        <div className="flex flex-wrap items-center gap-3 rounded-card border border-warn/50 bg-warn-soft p-4">
          <Icon name="triangle-alert" size={20} className="text-warn" />
          <span className="flex-1 text-sm text-warn-strong">ستنتقل كل الزيارات والفواتير والحجوزات إلى الملف الأساسي، ويُغلق الملف المكرر. العملية تُسجل في سجل التدقيق ولا يمكن التراجع عنها.</span>
          <Button size="md" loading={busy} disabled={a === b} icon="git-merge" onClick={async () => {
            setBusy(true);
            try { const r = await mergeApi.merge({ primary_patient_id: a, duplicate_patient_id: b }); toast.success(`دُمج الملفان · نُقل ${r.moved_records} سجل`); setB(null); void qc.invalidateQueries({ queryKey: ["audit"] }); void qc.invalidateQueries({ queryKey: ["patient"] }); }
            catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); }
          }}>دمج الملفين</Button>
        </div>
      )}
      <DataGrid title={<span className="flex items-center gap-2"><Icon name="scroll-text" size={19} className="text-primary" />سجل التدقيق</span>} aria-label="سجل التدقيق"
        rows={audit.data?.items} loading={audit.isPending} error={audit.isError ? errorMessage(audit.error) : undefined} rowKey={(l) => String(l.log_id)} minWidth={680} dense
        search={{ placeholder: "بحث في العمليات" }} empty={{ icon: "scroll-text", title: "لا توجد عمليات" }}
        columns={[
          { key: "action", header: "العملية", value: (l) => `${auditActionAr(l.action)} ${l.action}`, cell: (l) => <span title={l.action} className="flex items-center gap-2 font-semibold"><Icon name={l.synced_offline ? "cloud-off" : "scroll-text"} size={15} className="text-ink-3" />{auditActionAr(l.action)}</span> },
          { key: "entity_type", header: "الكيان", value: (l) => `${entityAr(l.entity_type)} ${l.reason ?? ""}`, cell: (l) => <span className="text-[13px] text-ink-2">{entityAr(l.entity_type)}{l.reason ? ` · ${l.reason}` : ""}</span> },
          { key: "user_name", header: "المستخدم", value: (l) => l.user_name ?? "النظام", cell: (l) => <span className="text-[13px] text-ink-2">{l.user_name ?? "النظام"}</span> },
          { key: "occurred_at", header: "الوقت", sortable: true, width: "200px", cell: (l) => <span className="num text-xs text-ink-2">{fmtDateTime(l.occurred_at)}</span> },
        ]} />
    </div>
  );
}

// ------------------------------------------------------------------ النسخ الاحتياطي
const BK_TYPES: Record<string, string> = { full: "كاملة", diff: "تفاضلية", incr: "تزايدية", verify: "تحقق", files: "الملفات" };
const BK_ST: Record<string, { tone: "success" | "danger" | "info" | "warn" | "muted"; ar: string }> = { succeeded: { tone: "success", ar: "نجحت" }, success: { tone: "success", ar: "نجحت" }, failed: { tone: "danger", ar: "فشلت" }, running: { tone: "info", ar: "جارٍ" }, requested: { tone: "warn", ar: "مطلوبة" }, queued: { tone: "warn", ar: "بالانتظار" } };
const size = (b: number | null) => b == null ? "—" : b > 1e9 ? `${(b / 1e9).toFixed(1)} GB` : `${(b / 1e6).toFixed(1)} MB`;
export function BackupsScreen() {
  const qc = useQueryClient();
  const st = useQuery({ queryKey: ["backups", "status"], queryFn: backupsApi.status, refetchInterval: 30_000 });
  const [filter, setFilter] = useState("all");
  const runs = useQuery({ queryKey: ["backups", "runs", filter], queryFn: () => backupsApi.list({ type: filter === "all" ? undefined : filter, page_size: 30 }), refetchInterval: 30_000 });
  const [type, setType] = useState("incr");
  const [busy, setBusy] = useState(false);
  if (st.isPending) return <Spinner />;
  if (st.isError) return <Alert tone="danger">{errorMessage(st.error)}</Alert>;
  const s = st.data;
  return (
    <div className="grid items-start gap-4 2xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="flex min-w-0 flex-col gap-4">
        <div className={`flex flex-wrap items-center gap-4 rounded-card p-5 ${s.healthy ? "bg-success-soft text-success-strong" : "bg-danger-soft text-danger-strong"}`}>
          <Icon name={s.healthy ? "shield-check" : "shield-alert"} size={30} />
          <span className="flex flex-1 flex-col"><span className="text-lg font-bold">{!s.enabled ? "النسخ الاحتياطي غير مفعّل" : s.healthy ? "النسخ الاحتياطي سليم" : "النسخ الاحتياطي يحتاج تدخلاً"}</span>
            <span className="text-sm">{s.hours_since_last_success == null ? "لا توجد نسخة ناجحة بعد" : <>آخر نسخة ناجحة قبل <b className="num">{s.hours_since_last_success.toFixed(1)}</b> ساعة</>} · الحد الأقصى بلا نسخة <span className="num">{s.max_hours_without_success}</span> ساعة</span></span>
        </div>
        {s.notes.map((n) => <Alert key={n} tone="info">{n}</Alert>)}
        <DataGrid title={<span className="flex items-center gap-2"><Icon name="history" size={19} className="text-primary" />سجل التشغيل</span>} aria-label="سجل التشغيل"
          filters={<div className="w-full sm:w-[170px]"><ISelect size="md" aria-label="نوع النسخة" value={filter} searchable={false} onChange={(v) => { if (v) setFilter(v); }} options={[{ value: "all", label: "كل الأنواع" }, ...Object.entries(BK_TYPES).map(([k, v]) => ({ value: k, label: v }))]} /></div>}
          rows={runs.data?.items} loading={runs.isPending} rowKey={(r) => r.run_id} minWidth={620} dense pageSize={10} empty={{ icon: "database-backup", title: "لا يوجد تشغيل بعد" }}
          columns={[
            { key: "type", header: "النوع", value: (r) => BK_TYPES[r.type] ?? r.type, cell: (r) => <span className="flex items-center gap-2.5"><Icon name="database-backup" size={16} className="text-primary" /><span className="flex flex-col"><span className="font-semibold">{BK_TYPES[r.type] ?? r.type}</span><span className="sub-sm">{r.trigger === "manual" ? "يدوي" : "مجدول"}{r.error ? ` · ${r.error}` : ""}</span></span></span> },
            { key: "started_at", header: "البدء", value: (r) => r.started_at ?? r.created_at, cell: (r) => <span className="num text-xs text-ink-2">{fmtDateTime(r.started_at ?? r.created_at)}</span> },
            { key: "size_bytes", header: "الحجم", numeric: true, cell: (r) => <span className="text-xs">{size(r.size_bytes)}</span> },
            { key: "status", header: "الحالة", width: "110px", cell: (r) => { const t = BK_ST[r.status] ?? { tone: "muted" as const, ar: r.status }; return <Pill tone={t.tone}>{t.ar}</Pill>; } },
          ]} />
      </div>
      <div className="flex flex-col gap-4 2xl:sticky 2xl:top-24">
        <Panel title="نسخة الآن" icon="play">
          <ISelect label="نوع النسخة" value={type} searchable={false} onChange={(v) => { if (v) setType(v); }} options={Object.entries(BK_TYPES).map(([k, v]) => ({ value: k, label: v, disabled: k === "files" && s.files.mode === "off" }))} />
          {s.files.mode === "off" && <span className="flex items-center gap-1.5 text-xs text-warn-strong"><Icon name="circle-alert" size={14} />نسخ الملفات للموقع الثاني غير مفعّل على السيرفر</span>}
          {s.active ? <Alert tone="info" icon="loader-circle">يوجد نسخ جارٍ ({BK_TYPES[s.active.type] ?? s.active.type})</Alert>
            : <Button loading={busy} icon="database-backup" onClick={async () => { setBusy(true); try { await backupsApi.run(type); toast.success("سُجل الطلب ويُنفذ خلال دقيقة"); void qc.invalidateQueries({ queryKey: ["backups"] }); } catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); } }}>طلب النسخة</Button>}
          <span className="flex items-start gap-1.5 text-xs leading-6 text-ink-2"><Icon name="info" size={14} className="mt-1" />الاسترجاع من السيرفر فقط (docs/backup_restore.md).</span>
        </Panel>
        <Panel title={`الجدول · ${s.schedule.timezone}`} icon="calendar-clock">
          {([["كاملة", s.schedule.full], ["تزايدية", s.schedule.incremental], ["سجل WAL", s.schedule.wal], ["تحقق", s.schedule.verify], ["الاحتفاظ", s.schedule.retention]] as const).map(([k, v]) => (
            <div key={k} className="flex justify-between text-[13px]"><span className="text-ink-2">{k}</span><span>{v}</span></div>
          ))}
        </Panel>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ الرسائل التجريبية
export function SandboxScreen() {
  const [phone, setPhone] = useState("");
  const q = useQuery({ queryKey: ["sandbox", phone], queryFn: () => sandboxApi.list({ phone_number: phone.replace(/\D/g, "") || undefined, page_size: 100 }), refetchInterval: 15_000 });
  return (
    <div className="flex flex-col gap-3.5">
      <Alert tone="info" icon="flask-round">الوضع التجريبي مفعّل: لا تُرسل SMS ولا Push فعلياً. رمز دخول المريض عشوائي لكل طلب ويظهر هنا (ابحث برقم هاتفه). هذه الصفحة تختفي عند ربط المزودين.</Alert>
      <div className="max-w-sm"><TextInput label="فلترة برقم الهاتف" value={phone} onChange={setPhone} icon="phone" ltr placeholder="07801234567" /></div>
      <DataGrid aria-label="الرسائل التجريبية" rows={q.data?.items} loading={q.isPending} error={q.isError ? errorMessage(q.error) : undefined} rowKey={(_, i) => String(i)} minWidth={640}
        empty={{ icon: "message-square-dashed", title: "لا توجد رسائل" }} search={{ placeholder: "بحث في نص الرسائل" }}
        columns={[
          { key: "channel", header: "القناة", width: "100px", cell: (m) => <Pill tone={m.channel === "sms" ? "info" : "primary"} icon={m.channel === "sms" ? "message-square" : "bell"}>{m.channel.toUpperCase()}</Pill> },
          { key: "to", header: "إلى", width: "150px", cell: (m) => <span className="num text-sm" dir="ltr">{m.to}</span> },
          { key: "text", header: "النص", cell: (m) => <span className="block min-w-[200px] whitespace-pre-wrap">{m.text}</span> },
          { key: "created_at", header: "الوقت", width: "200px", sortable: true, cell: (m) => <span className="num text-xs text-ink-2">{fmtDateTime(m.created_at)}</span> },
        ]} />
    </div>
  );
}
