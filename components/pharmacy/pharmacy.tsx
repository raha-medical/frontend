"use client";
/** الصيدلية — Pharmacy.dc.html (isScan, isDone, isDup, isExpired). العقد 15. */
import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Icon } from "@/components/icon";
import { toast } from "@/components/toast";
import { Alert, Badge, Button, Card, CellStack, DataGrid, Empty, Segmented, Spinner } from "@/components/ui";
import { pharmacyApi, type Prescription } from "@/lib/api/clinical";
import { errorMessage, isApiError } from "@/lib/api/errors";
import { fmtDate, fmtDateTime, fmtTime } from "@/lib/format";
import { todayBaghdad } from "@/lib/date";
import { PharmacyExternalList } from "./external-list";
import { DispenseLink, ReferralList, ServiceTabs, referralApi, useReferralSummary, type ServiceTab } from "@/components/diagnostics/referrals";
import { useAuth } from "@/lib/auth/store";
import { hasPerm } from "@/lib/roles";
import { PharmacyLog, RxPricing } from "./billing";
import { TextPrescription } from "./text-prescription";

type Line = { dispensed: boolean; substitute: string; reason: string };
const REASONS = ["غير متوفر", "رفض المريض", "بديل غير مناسب", "سعر مرتفع"];

/** قائمة عمل الصيدلية: الحاضرون، والتحويلات الواردة، والمكتملة. */
export function PharmacyWork() {
  const [source, setSource] = useState<"doctor" | "direct">("doctor");
  const [tab, setTab] = useState<ServiceTab>("work");
  const summary = useReferralSummary("pharmacy");
  const canWrite = hasPerm(useAuth((s) => s.user), "pharmacy.dispense");
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3"><Segmented value={source} onChange={setSource} options={[{ value: "doctor", label: "إحالات الأطباء", icon: "stethoscope" }, { value: "direct", label: "مراجعون مباشرون", icon: "user-round" }]} /><div className="flex flex-wrap gap-2">{canWrite && <Link href="/staff/pharmacy/external" className="inline-flex h-11 items-center gap-2 rounded-full bg-primary px-4 text-sm font-bold text-on-accent"><Icon name="user-plus" size={17} />تسجيل مراجع مباشر</Link>}<Link href="/staff/pharmacy/settings" className="inline-flex h-11 items-center gap-2 rounded-full border border-line-strong bg-surface px-4 text-sm font-semibold"><Icon name="settings-2" size={17} />العلاجات والأسعار</Link></div></div>
      {source === "direct" ? <PharmacyExternalList canWrite={canWrite} /> : <>
        <ServiceTabs value={tab} onChange={setTab} summary={summary} />
        {tab === "work" && <ReferralList service="pharmacy" status="activated" canWrite={false} action={canWrite ? (r) => <DispenseLink code={r.prescription_code} /> : undefined} />}
        {tab === "incoming" && <ReferralList service="pharmacy" status="referred" canWrite={canWrite} />}
        {tab === "done" && <ReferralList service="pharmacy" status="completed" canWrite={false} />}
      </>}
    </div>
  );
}

export function PharmacyScan() {
  const [rx, setRx] = useState<Prescription | null>(null);
  const [err, setErr] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  async function load(c: string) {
    if (!c.trim()) return;
    setBusy(true); setErr(null); setRx(null);
    try {
      setRx(await pharmacyApi.get(c));
      // المسح يثبت حضور المراجع في الصيدلية (العقد 23). الوصفة المفعّلة أو المنتهية لا تُعطل الصرف
      await referralApi.scan("pharmacy", c).catch(() => undefined);
    } catch (e) { setErr(e); } finally { setBusy(false); }
  }
  const given = useSearchParams().get("code");
  useEffect(() => { if (given) void load(given); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [given]);
  const code404 = isApiError(err) && err.code === "PRESCRIPTION_NOT_FOUND";
  if (!given) return <div className="flex flex-col gap-4"><Card className="p-5"><h1 className="font-bold">اختر المراجع لصرف وصفته</h1><p className="sub mt-1">ابحث بالاسم أو رقم الملف ثم اضغط «صرف». لتأكيد الحضور افتح التحويلات الواردة من قائمة العمل.</p><Link href="/staff/pharmacy/work" className="mt-3 inline-block font-semibold text-primary">فتح قائمة العمل والتحويلات</Link></Card><ReferralList service="pharmacy" status="activated" canWrite={false} action={r => <DispenseLink code={r.prescription_code} />} /></div>;
  return (
    <div className="grid items-start gap-4 xl:grid-cols-[380px_minmax(0,1fr)]">
      <div className="flex flex-col gap-3 rounded-card bg-pharm p-5 text-white dark:bg-pharm-soft dark:ring-1 dark:ring-pharm/40">
        <span className="flex items-center gap-3"><Icon name="pill" size={28} /><span className="text-lg font-bold">وصفة المراجع</span></span>
        {busy && <span>جارٍ تحميل الوصفة…</span>}
        <Link href="/staff/pharmacy/work" className="font-semibold text-white">العودة لقائمة المراجعين</Link>
      </div>
      <div className="flex min-w-0 flex-col gap-4">
        {err != null && <Alert tone={code404 ? "warn" : "danger"}>{code404 ? "تعذر العثور على الوصفة. اختر المراجع من قائمة العمل." : errorMessage(err)}</Alert>}
        {rx ? <RxView key={rx.prescription_id} rx={rx} onDone={setRx} /> : !err && <Spinner />}
      </div>
    </div>
  );
}

function RxView({ rx, onDone }: { rx: Prescription; onDone: (r: Prescription) => void }) {
  return rx.text ? <TextPrescription initial={rx} /> : <LegacyRxView rx={rx} onDone={onDone} />;
}

function LegacyRxView({ rx, onDone }: { rx: Prescription; onDone: (r: Prescription) => void }) {
  const qc = useQueryClient();
  const [lines, setLines] = useState<Record<number, Line>>(() => Object.fromEntries(rx.items.map((i) => [i.line_no, { dispensed: true, substitute: "", reason: "" }])));
  const [busy, setBusy] = useState(false);
  const upd = (n: number, p: Partial<Line>) => setLines((l) => ({ ...l, [n]: { ...l[n], ...p } }));
  const valid = rx.items.every((i) => lines[i.line_no].dispensed || lines[i.line_no].reason.trim());
  const head = (
    <Card className="flex flex-wrap items-center gap-3 p-4">
      <span className="grid size-11 place-items-center rounded-full bg-pharm-soft text-pharm"><Icon name="user-round" size={20} /></span>
      <span className="flex min-w-[160px] flex-1 flex-col"><span className="font-bold">{rx.patient_name}</span><span className="sub"><span className="num">{rx.file_number}</span>{rx.age != null ? <> · <span className="num">{rx.age}</span> سنة</> : null}</span></span>
      <span className="flex flex-col text-[13px]"><span>{rx.doctor_name}</span><span className="sub-sm">{rx.clinic_name} · {rx.branch_name}</span></span>
      <span className="num rounded-chip bg-bg px-2.5 py-1 text-sm font-bold" dir="ltr">{rx.prescription_code}</span>
    </Card>
  );
  if (rx.status === "dispensed") return (<>{head}<Alert tone="warn" icon="copy">هذه الوصفة صُرفت سابقاً{rx.dispensed_at ? <> بتاريخ <span className="num">{fmtDateTime(rx.dispensed_at)}</span></> : null}{rx.dispensed_by ? ` بواسطة ${rx.dispensed_by}` : ""}. لا يمكن صرفها مرة أخرى.</Alert><Items rx={rx} /></>);
  if (rx.status === "expired") return (<>{head}<Alert tone="danger" icon="calendar-x">انتهت صلاحية الوصفة بتاريخ <span className="num">{fmtDate(rx.expires_at)}</span>. يحتاج المريض وصفة جديدة من الطبيب.</Alert><Items rx={rx} /></>);
  return (
    <>
      {head}
      {rx.diagnosis && <span className="sub flex items-center gap-1.5"><Icon name="file-search" size={14} />{rx.diagnosis} · صالحة حتى <span className="num">{fmtDate(rx.expires_at)}</span></span>}
      <div className="flex flex-col gap-2.5">
        {rx.items.map((i) => {
          const l = lines[i.line_no];
          return (
            <Card key={i.line_no} className={`flex flex-col gap-2.5 p-4 ${l.dispensed ? "" : "border-danger/40"}`}>
              <div className="flex flex-wrap items-center gap-3">
                <span className="grid size-10 place-items-center rounded-xl bg-pharm-soft text-pharm"><Icon name="pill" size={18} /></span>
                <span className="flex min-w-[180px] flex-1 flex-col"><span className="num font-bold" dir="ltr">{i.drug_name}</span><span className="sub-sm">{[i.dose, i.frequency, i.duration_days ? `${i.duration_days} أيام` : null, i.instructions].filter(Boolean).join(" · ")}</span></span>
                <div className="inline-flex gap-1 rounded-xl bg-bg p-1">
                  <button onClick={() => upd(i.line_no, { dispensed: true })} className={`h-9 rounded-xl px-3 text-[13px] font-semibold ${l.dispensed ? "bg-success text-on-accent" : "text-ink-2"}`}>صُرف</button>
                  <button onClick={() => upd(i.line_no, { dispensed: false })} className={`h-9 rounded-xl px-3 text-[13px] font-semibold ${!l.dispensed ? "bg-danger text-on-accent" : "text-ink-2"}`}>لم يُصرف</button>
                </div>
              </div>
              {l.dispensed
                ? <input value={l.substitute} onChange={(e) => upd(i.line_no, { substitute: e.target.value })} dir="ltr" placeholder="بديل (اختياري): اسم الدواء المصروف بدلاً منه" className="num h-10 rounded-xl border border-line-strong bg-surface px-3 text-sm outline-none focus:border-primary" />
                : <div className="flex flex-wrap gap-1.5">{REASONS.map((r) => <button key={r} onClick={() => upd(i.line_no, { reason: r })} className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${l.reason === r ? "border-danger bg-danger-soft text-danger-strong" : "border-line text-ink-2"}`}>{r}</button>)}
                    <input value={REASONS.includes(l.reason) ? "" : l.reason} onChange={(e) => upd(i.line_no, { reason: e.target.value })} placeholder="سبب آخر" className="h-8 min-w-[140px] flex-1 rounded-full border border-line-strong px-3 text-xs outline-none" /></div>}
            </Card>
          );
        })}
      </div>
      {/* خطة المالك: التسعير ثم التحصيل ثم التسليم. زر الصرف يظهر بعد دفع فاتورة الأدوية */}
      <RxPricing rx={rx}>
      <Button loading={busy} disabled={!valid} icon="circle-check" onClick={async () => {
        setBusy(true);
        try {
          const r = await pharmacyApi.dispense(rx.prescription_id, rx.items.map((i) => ({ line_no: i.line_no, dispensed: lines[i.line_no].dispensed, substitute_drug_name: lines[i.line_no].dispensed ? lines[i.line_no].substitute.trim() || null : null, not_dispensed_reason: lines[i.line_no].dispensed ? null : lines[i.line_no].reason.trim() })));
          toast.success("سُجل الصرف"); onDone(r); void qc.invalidateQueries({ queryKey: ["dispensed"] });
        } catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); }
      }}>تأكيد الصرف</Button>
      </RxPricing>
    </>
  );
}

function Items({ rx }: { rx: Prescription }) {
  return (
    <Card className="flex flex-col gap-2 p-4">
      {rx.items.map((i) => (
        <div key={i.line_no} className="flex flex-wrap items-center gap-2 text-sm">
          <Icon name={i.dispensed ? "circle-check" : i.dispensed === false ? "circle-x" : "pill"} size={16} className={i.dispensed ? "text-success" : i.dispensed === false ? "text-danger" : "text-pharm"} />
          <span className="num flex-1" dir="ltr">{i.drug_name}</span>
          {i.substitute_drug_name && <span className="text-xs text-info-strong">بديل: <span dir="ltr">{i.substitute_drug_name}</span></span>}
          {i.not_dispensed_reason && <span className="text-xs text-danger-strong">{i.not_dispensed_reason}</span>}
        </div>
      ))}
    </Card>
  );
}

/** سجل الصرف اليومي (الجلسة 4): كل سطر بالكمية والسعر والطبيب والموظف والحالة، وملخص وفلاتر وطباعة وتصدير. */
export function PharmacyToday() {
  return <PharmacyLog />;
}

export function PharmacyTodayPrescriptions() {
  const q = useQuery({ queryKey: ["dispensed", todayBaghdad()], queryFn: () => pharmacyApi.dispensed({ date: todayBaghdad(), page_size: 100 }), refetchInterval: 60_000 });
  const partial = (r: { items: { dispensed: boolean | null }[] }) => r.items.some((i) => i.dispensed === false);
  return (
    <DataGrid aria-label="الوصفات المصروفة اليوم" rows={q.data?.items} loading={q.isPending} error={q.isError ? errorMessage(q.error) : undefined}
      rowKey={(r) => r.prescription_id} minWidth={600} search={{ placeholder: "ابحث بالكود أو اسم المريض أو الطبيب" }}
      empty={{ icon: "history", title: "لم تُصرف وصفات اليوم" }}
      columns={[
        { key: "prescription_code", header: "الكود", width: "130px", cell: (r) => <span className="num rounded-chip bg-bg px-2 py-1 text-xs font-bold" dir="ltr">{r.prescription_code}</span> },
        { key: "patient_name", header: "المريض", sortable: true, value: (r) => `${r.patient_name} ${r.doctor_name}`, cell: (r) => <CellStack title={r.patient_name} sub={`${r.doctor_name} · ${r.items.length} أدوية`} /> },
        { key: "status", header: "الصرف", width: "130px", value: (r) => (partial(r) ? "صرف جزئي" : "صُرفت كاملة"), cell: (r) => <Badge tone={partial(r) ? "warn" : "success"} icon={partial(r) ? "triangle-alert" : "circle-check"}>{partial(r) ? "صرف جزئي" : "صُرفت كاملة"}</Badge> },
        { key: "dispensed_at", header: "الوقت", width: "110px", sortable: true, cell: (r) => <span className="num text-xs text-ink-2">{fmtTime(r.dispensed_at)}</span> },
      ]} />
  );
}
