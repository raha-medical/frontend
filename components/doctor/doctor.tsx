"use client";
/** واجهة الطبيب — Doctor.dc.html: طابوري، المعاينة، سجل المريض، الإشعارات. العقد 7 و11. */
import { ExternalResultsList } from "@/components/reception/external-results";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Icon } from "@/components/icon";
import { toast } from "@/components/toast";
import { Alert, Button, Card, Empty, ReasonDialog, Spinner } from "@/components/ui";
import { getLiveSessions, patientsApi, queueApi, searchParamsFor, type QueueItem, type QueueSession } from "@/lib/api/reception";
import { clinicalApi, type Consultation, type ConsultInput, type RxLine } from "@/lib/api/clinical";
import { catalogApi } from "@/lib/api/billing";
import { errorMessage } from "@/lib/api/errors";
import { fmtDate, fmtDateTime, fmtNum, fmtTime, fmtTimeRange } from "@/lib/format";
import { uuidv7 } from "@/lib/id";
import { useAuth } from "@/lib/auth/store";
import { staffApi } from "@/lib/api/staff";
import { useLive } from "@/lib/realtime/provider";
import { STATUS, PAYMENT, PRIORITY } from "@/components/reception/meta";
import { TextInput } from "@/components/reception/common";
import { DeferDialog } from "@/components/reception/defer-dialog";

const DQ = (id?: string | null) => ["queue", "doctor", id] as const;

function useMyQueue() {
  const user = useAuth((s) => s.user)!;
  const qc = useQueryClient();
  const { live } = useLive();
  const q = useQuery({ queryKey: DQ(user.doctor_id), queryFn: async () => (await getLiveSessions(user.doctor_id ? { doctor_id: user.doctor_id } : {}))[0] ?? null, refetchInterval: 30_000, enabled: !!user.doctor_id });
  useEffect(() => {
    if (!live) return;
    const a = live.on("queue.updated", () => void qc.invalidateQueries({ queryKey: DQ(user.doctor_id) }));
    const b = live.onReconnected(() => void qc.invalidateQueries({ queryKey: DQ(user.doctor_id) }));
    return () => { a(); b(); };
  }, [live, qc, user.doctor_id]);
  return q;
}

// ------------------------------------------------------------------ طابوري
export function DoctorQueue() {
  const user = useAuth((s) => s.user)!;
  const q = useMyQueue();
  const router = useRouter();
  const qc = useQueryClient();
  const [emerg, setEmerg] = useState<QueueItem | null>(null);
  if (!user.doctor_id) return <Alert tone="warn">حسابك غير مربوط بملف طبيب. راجع الإدارة.</Alert>;
  if (q.isPending) return <Spinner />;
  if (q.isError) return <Alert tone="danger">{errorMessage(q.error)}</Alert>;
  const s: QueueSession | null = q.data;
  if (!s) return <Empty image="clinics" title="لا توجد وجبة لك اليوم" hint="الجدول الأسبوعي يحدده مدير الفرع." />;
  const pol = s.call_policy?.call_next_by ?? "both";
  const canCall = pol !== "reception";
  const inRoom = s.items.find((t) => t.status === "in_room");
  const called = s.items.filter((t) => t.status === "called");
  const next = s.items.filter((t) => ["arrived", "waiting", "called", "skipped"].includes(t.status)).sort((a, b) => (a.queue_position ?? 999) - (b.queue_position ?? 999));
  const refresh = () => void qc.invalidateQueries({ queryKey: DQ(user.doctor_id) });
  const act = async (fn: () => Promise<unknown>, ok?: string) => { try { await fn(); if (ok) toast.success(ok); refresh(); } catch (e) { toast.error(errorMessage(e)); } };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2.5 rounded-2xl border border-line bg-surface px-4 py-3 text-[13px]">
        <Icon name="megaphone" size={16} className="text-primary" />من يستدعي المرضى:
        <b>{{ both: "الطبيب والاستقبال", doctor: "الطبيب فقط", reception: "الاستقبال فقط" }[pol]}</b>
        <span className="flex items-center gap-1 text-ink-2"><Icon name={s.call_policy?.auto_call_next ? "zap" : "zap-off"} size={14} />استدعاء تلقائي بعد الإنهاء: {s.call_policy?.auto_call_next ? "مفعّل" : "مطفأ"}</span>
        <span className="flex-1" /><span className="num text-ink-2">{fmtTimeRange(s.start, s.end)}</span>
      </div>
      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
        {inRoom ? (
          <Card className="flex flex-col gap-4 border-primary p-5">
            <span className="flex items-center gap-2 text-sm font-semibold text-primary"><Icon name="door-open" size={17} />في الغرفة الآن{inRoom.started_at ? <> · منذ <span className="num">{fmtTime(inRoom.started_at)}</span></> : null}</span>
            <div className="flex flex-wrap items-center gap-4">
              <span className="num grid h-16 min-w-16 place-items-center rounded-2xl bg-primary px-2.5 text-xl font-bold text-on-accent">{inRoom.ticket_number}</span>
              <div className="flex flex-1 flex-col"><span className="text-xl font-bold">{inRoom.patient_name}</span><span className="sub num">{inRoom.file_number}</span></div>
              <span className={`rounded-full px-3 py-1 text-xs ${PAYMENT[inRoom.payment_status].cls}`}>{PAYMENT[inRoom.payment_status].label}</span>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="md" icon="clipboard-plus" onClick={() => router.push(`/staff/doctor/consult?ticket=${inRoom.ticket_id}`)}>فتح المعاينة</Button>
              <Button size="md" variant="ghost" icon="history" onClick={() => router.push(`/staff/doctor/history?patient_id=${inRoom.patient_id}`)}>السجل</Button>
            </div>
            <div className="flex flex-wrap gap-2 border-t border-line pt-3">
              {canCall && <Button size="md" icon="skip-forward" onClick={() => act(() => queueApi.complete(inRoom.ticket_id, true), "أُنهيت الزيارة واستُدعي التالي")}>إنهاء واستدعاء التالي</Button>}
              <Button size="md" variant="ghost" icon="circle-check" onClick={() => act(() => queueApi.complete(inRoom.ticket_id, false), "أُنهيت الزيارة")}>إنهاء فقط</Button>
            </div>
          </Card>
        ) : (
          <Card className="flex flex-col items-center gap-3 p-8 text-center">
            <span className="grid size-14 place-items-center rounded-2xl bg-primary-soft text-primary"><Icon name="door-closed" size={26} /></span>
            <span className="font-bold">لا يوجد مريض في الغرفة</span>
            {called.length > 0 ? <span className="sub">تم استدعاء {called.map((c) => c.ticket_number).join("، ")} · اضغط «دخل» عند وصوله</span>
              : canCall ? <Button size="md" icon="megaphone" onClick={() => act(() => queueApi.callNext(user.doctor_id!), "استُدعي التالي")}>استدعاء التالي</Button>
              : <span className="sub flex items-center gap-1"><Icon name="concierge-bell" size={14} />الاستدعاء من الاستقبال في هذا الفرع</span>}
          </Card>
        )}
        <Card className="flex flex-col gap-2 p-4">
          <span className="flex items-center gap-2 font-bold"><Icon name="list-ordered" size={18} className="text-primary" />التالي في طابوري <span className="num rounded-full bg-bg px-2 text-xs">{next.length}</span></span>
          {!next.length ? <span className="sub">لا يوجد مرضى بالانتظار.</span> : next.map((t) => {
            const st = STATUS[t.status];
            const canStart = !inRoom && (t.status === "called" || t.status === "arrived") && (t.payment_status !== "unpaid" || t.priority === "emergency");
            return (
              <div key={t.ticket_id} className="flex flex-wrap items-center gap-2.5 rounded-xl border border-line p-2.5">
                <span className="num grid h-10 min-w-[54px] place-items-center rounded-chip bg-bg text-sm font-bold">{t.ticket_number}</span>
                {/* حد أدنى لعرض الاسم: عند ضيق العمود تنزل الأزرار لسطر جديد بدل قص الاسم إلى «حسين …» */}
                <span className="flex min-w-[150px] flex-1 flex-col">
                  <span className="text-sm font-semibold leading-5">{t.patient_name}</span>
                  <span className="flex flex-wrap items-center gap-1.5 text-[11px]">
                    <span className={`rounded-full px-2 py-0.5 ${st.cls}`}>{st.label}</span>
                    {t.payment_status === "unpaid" && <span className={`rounded-full px-2 py-0.5 ${PAYMENT.unpaid.cls}`}>غير مدفوع</span>}
                    {t.priority !== "normal" && <span className={PRIORITY[t.priority].cls}>{PRIORITY[t.priority].label}</span>}
                    {t.call_acknowledged_at && <span className="text-success-strong">قادم</span>}
                    {t.on_the_way_at && <span className="text-info-strong">في الطريق</span>}
                  </span>
                </span>
                <span className="num text-xs text-ink-2">{fmtTime(t.estimated_time)}</span>
                {canStart && <Button size="md" icon="door-open" onClick={() => act(async () => { await clinicalApi.start(t.ticket_id); router.push(`/staff/doctor/consult?ticket=${t.ticket_id}`); }, "بدأت المعاينة")}>دخل</Button>}
                {canCall && t.status === "arrived" && !inRoom && <button onClick={() => act(() => queueApi.call(t.ticket_id), `استُدعي ${t.ticket_number}`)} aria-label="استدعاء" className="grid size-9 place-items-center rounded-full border border-line-strong text-primary"><Icon name="megaphone" size={15} /></button>}
                {t.priority !== "emergency" && <button onClick={() => setEmerg(t)} aria-label="طوارئ" title="طوارئ" className="grid size-9 place-items-center rounded-full text-danger hover:bg-danger-soft"><Icon name="siren" size={15} /></button>}
              </div>
            );
          })}
          <span className="flex items-center gap-1.5 text-xs text-ink-2"><Icon name="info" size={14} />غير المدفوعين لا يدخلون الغرفة عدا الطوارئ أو الاستثناء.</span>
        </Card>
      </div>
      <ReasonDialog open={!!emerg} title={`طوارئ · ${emerg?.ticket_number ?? ""}`} icon="siren" danger confirmText="تقديم كطوارئ" onClose={() => setEmerg(null)}
        onConfirm={async (r) => { await queueApi.emergency(emerg!.ticket_id, r); toast.success("قُدّم كطوارئ"); refresh(); }} />
    </div>
  );
}

// ------------------------------------------------------------------ المعاينة
export function DoctorConsult() {
  const params = useSearchParams();
  const ticket = params.get("ticket");
  const q = useMyQueue();
  const inRoom = q.data?.items.find((t) => t.status === "in_room");
  const tid = ticket ?? inRoom?.ticket_id ?? null;
  if (!tid) return <Empty image="clinics" title="لا توجد معاينة مفتوحة" hint="ابدأ المعاينة من «طابوري» عندما يدخل المريض." />;
  const t = q.data?.items.find((x) => x.ticket_id === tid);
  return <ConsultEditor key={tid} ticketId={tid} ticket={t} session={q.data ?? null} />;
}

function ConsultEditor({ ticketId, ticket, session }: { ticketId: string; ticket?: QueueItem; session: QueueSession | null }) {
  const router = useRouter();
  const qc = useQueryClient();
  const user = useAuth((s) => s.user)!;
  const existing = useQuery({ queryKey: ["consult", ticketId], queryFn: () => clinicalApi.byTicket(ticketId) });
  const c = existing.data ?? null;
  const [f, setF] = useState<ConsultInput>({ diagnosis: "", icd10_code: "", clinical_notes: "", private_notes: "", follow_up_after_days: 14, prescription: [] });
  const [labs, setLabs] = useState<string[]>([]);
  const [rads, setRads] = useState<string[]>([]);
  const [callNext, setCallNext] = useState(session?.call_policy?.call_next_by !== "reception");
  const [busy, setBusy] = useState<"save" | "finish" | "return" | null>(null);
  const [defer, setDefer] = useState<{ id: string; price: number } | null>(null);
  const canDefer = useAuth((s) => s.can("deferrals.grant"));
  const [cid] = useState(uuidv7);
  useEffect(() => { if (c) setF({ diagnosis: c.diagnosis, icd10_code: c.icd10_code, clinical_notes: c.clinical_notes, private_notes: c.private_notes, follow_up_after_days: c.follow_up_after_days, prescription: c.prescription?.lines ?? [] }); }, [c]);
  const services = useQuery({ queryKey: ["services", "orderable"], queryFn: () => catalogApi.services({}), staleTime: 300_000 });
  const labSvc = (services.data?.items ?? []).filter((s) => s.type === "lab" && s.is_active);
  const radSvc = (services.data?.items ?? []).filter((s) => s.type === "radiology" && s.is_active);
  const patientId = c?.patient.patient_id ?? ticket?.patient_id;
  const hist = useQuery({ queryKey: ["history", patientId], queryFn: () => clinicalApi.history(patientId!), enabled: !!patientId });
  const editable = !c || new Date(c.editable_until) > new Date();
  const orderedIds = new Set((c?.orders ?? []).map((o) => o.service_id));
  const newTotal = [...labs, ...rads].reduce((a, id) => a + ((services.data?.items ?? []).find((s) => s.service_id === id)?.price ?? 0), 0);
  const set = (p: Partial<ConsultInput>) => setF((x) => ({ ...x, ...p }));
  const rx = f.prescription ?? [];
  const setRx = (i: number, p: Partial<RxLine>) => set({ prescription: rx.map((r, j) => j === i ? { ...r, ...p } : r) });

  /** expectReturn = «يعود إليّ»: المراجع ينتظر نتائج قسم ثم يعود بلا رسوم (التدقيق 1.2). */
  async function save(finish: boolean, expectReturn = false) {
    setBusy(finish ? (expectReturn ? "return" : "finish") : "save");
    const lab_orders = labs.map((service_id) => ({ service_id })), radiology_orders = rads.map((service_id) => ({ service_id }));
    const body: ConsultInput = { ...f, prescription: rx.filter((r) => r.drug_name.trim()), finish_visit: finish || undefined, call_next: finish ? callNext : undefined,
      expect_return: finish && expectReturn ? true : undefined };
    try {
      if (!c) await clinicalApi.create({ ...body, consultation_id: cid, ticket_id: ticketId, lab_orders, radiology_orders });
      else {
        // الطلبات الجديدة قبل الإنهاء، ليعرف الإنهاء أن للزيارة تحويلاً لم يكتمل
        if (lab_orders.length || radiology_orders.length) await clinicalApi.addOrders(c.consultation_id, { lab_orders, radiology_orders });
        await clinicalApi.update(c.consultation_id, body);
      }
      setLabs([]); setRads([]);
      toast.success(finish ? (expectReturn ? "حُفظت المعاينة · المراجع بانتظار النتائج ويعود إليك" : "حُفظت المعاينة وأُنهيت الزيارة") : "حُفظت المعاينة");
      void qc.invalidateQueries({ queryKey: ["consult", ticketId] });
      void qc.invalidateQueries({ queryKey: DQ(user.doctor_id) });
      if (finish) router.push("/staff/doctor/queue");
    } catch (e) { toast.error(errorMessage(e)); } finally { setBusy(null); }
  }

  if (existing.isPending) return <Spinner />;
  const name = c?.patient.full_name ?? ticket?.patient_name ?? "";
  return (
    <div className="grid items-start gap-4 xl:grid-cols-[300px_minmax(0,1fr)]">
      <div className="flex flex-col gap-3 xl:sticky xl:top-24">
        <Card className="flex flex-col gap-2 p-4">
          <span className="num self-start rounded-chip bg-primary px-2.5 py-1 text-sm font-bold text-on-accent">{c?.ticket_number ?? ticket?.ticket_number}</span>
          <span className="text-lg font-bold">{name}</span>
          <span className="sub num">{c?.patient.file_number ?? ticket?.file_number}</span>
          {c && <span className="flex flex-wrap gap-2 text-xs text-ink-2"><span>{c.patient.gender === "female" ? "أنثى" : c.patient.gender === "male" ? "ذكر" : ""}</span>{c.patient.age != null && <span className="num">{c.patient.age} سنة</span>}<span>{c.visit_kind === "follow_up" ? "مراجعة" : "كشف جديد"}</span></span>}
        </Card>
        <ExternalResultsList ticketId={ticketId} />
        <Card className="flex flex-col gap-2 p-4">
          <span className="flex items-center gap-2 text-sm font-bold"><Icon name="history" size={16} className="text-primary" />الزيارات السابقة</span>
          {hist.isPending ? <Spinner /> : !hist.data?.items.filter((v) => v.consultation_id !== c?.consultation_id).length ? <span className="sub-sm">أول زيارة</span>
            : hist.data.items.filter((v) => v.consultation_id !== c?.consultation_id).slice(0, 4).map((v) => (
              <div key={v.consultation_id} className="flex flex-col rounded-xl bg-bg p-2.5 text-xs">
                <span className="font-semibold">{v.diagnosis ?? "—"}</span><span className="text-ink-2"><span className="num">{fmtDate(v.date)}</span> · {v.doctor_name}</span>
                {v.orders.some((o) => o.has_critical) && <span className="flex items-center gap-1 text-danger-strong"><Icon name="triangle-alert" size={12} />نتيجة حرجة</span>}
              </div>
            ))}
          {patientId && <Link href={`/staff/doctor/history?patient_id=${patientId}`} className="text-xs font-semibold">السجل الكامل</Link>}
        </Card>
      </div>
      <div className="flex min-w-0 flex-col gap-4">
        {!editable && <Alert tone="warn" icon="file-clock">انتهت نافذة التعديل. أضف ملحقاً من «سجل المريض».</Alert>}
        <Card className="flex flex-col gap-3 p-[18px]">
          <span className="flex items-center gap-2 font-bold"><Icon name="file-search" size={18} className="text-primary" />التشخيص</span>
          <div className="grid gap-2.5 sm:grid-cols-[minmax(0,1fr)_160px]"><TextInput label="التشخيص" value={f.diagnosis ?? ""} onChange={(v) => set({ diagnosis: v })} ltr /><TextInput label="ICD-10" value={f.icd10_code ?? ""} onChange={(v) => set({ icd10_code: v.toUpperCase() })} ltr placeholder="J20.9" /></div>
          <TextInput label="الملاحظات السريرية" value={f.clinical_notes ?? ""} onChange={(v) => set({ clinical_notes: v })} multiline />
        </Card>
        <Card className="flex flex-col gap-3 p-[18px]">
          <span className="flex items-center gap-2 font-bold"><Icon name="pill" size={18} className="text-pharm" /><span className="flex-1">الوصفة الطبية</span>
            {editable && <Button size="md" variant="ghost" icon="plus" onClick={() => set({ prescription: [...rx, { drug_name: "", dose: "", frequency: "", duration_days: 5, instructions: "" }] })}>إضافة دواء</Button>}</span>
          {!rx.length ? <span className="sub">لا أدوية</span> : (
            <div className="flex flex-col gap-2">
              {rx.map((r, i) => (
                <div key={i} className="grid grid-cols-2 gap-1.5 rounded-xl bg-bg p-2 md:grid-cols-[minmax(0,1.4fr)_100px_120px_70px_minmax(0,1fr)_30px]">
                  <input aria-label="الدواء" dir="ltr" value={r.drug_name} onChange={(e) => setRx(i, { drug_name: e.target.value })} placeholder="Augmentin 1g" className="num col-span-2 h-10 rounded-xl border border-line-strong bg-surface px-2 text-sm outline-none focus:border-primary md:col-span-1" />
                  <input aria-label="الجرعة" value={r.dose ?? ""} onChange={(e) => setRx(i, { dose: e.target.value })} placeholder="1 حبة" className="h-10 rounded-xl border border-line-strong bg-surface px-2 text-sm outline-none focus:border-primary" />
                  <input aria-label="التكرار" value={r.frequency ?? ""} onChange={(e) => setRx(i, { frequency: e.target.value })} placeholder="مرتين يومياً" className="h-10 rounded-xl border border-line-strong bg-surface px-2 text-sm outline-none focus:border-primary" />
                  <input aria-label="الأيام" inputMode="numeric" onFocus={(e) => e.currentTarget.select()} value={r.duration_days ?? ""} onChange={(e) => setRx(i, { duration_days: Number(e.target.value.replace(/\D/g, "")) || null })} className="num h-10 rounded-xl border border-line-strong bg-surface px-2 text-center text-sm outline-none focus:border-primary" />
                  <input aria-label="التعليمات" value={r.instructions ?? ""} onChange={(e) => setRx(i, { instructions: e.target.value })} placeholder="بعد الأكل" className="h-10 rounded-xl border border-line-strong bg-surface px-2 text-sm outline-none focus:border-primary" />
                  <button aria-label="حذف" onClick={() => set({ prescription: rx.filter((_, j) => j !== i) })}><Icon name="trash-2" size={16} className="text-ink-muted hover:text-danger" /></button>
                </div>
              ))}
            </div>
          )}
          {c?.prescription && <span className="flex items-center gap-1.5 text-xs text-ink-2"><Icon name="qr-code" size={14} />كود الوصفة <b className="num" dir="ltr">{c.prescription.prescription_code}</b> · {c.prescription.status === "dispensed" ? "صُرفت" : "لم تُصرف"}</span>}
        </Card>
        <div className="grid gap-4 lg:grid-cols-2">
          <OrderPicker title="طلب تحاليل" icon="flask-conical" cls="text-lab" list={labSvc} sel={labs} setSel={setLabs} ordered={orderedIds} disabled={!editable} />
          <OrderPicker title="طلب أشعة وسونار" icon="scan-line" cls="text-info" list={radSvc} sel={rads} setSel={setRads} ordered={orderedIds} disabled={!editable} />
        </div>
        {c && c.orders.length > 0 && (
          <Card className="flex flex-col gap-2 p-4">
            <span className="text-sm font-bold">الطلبات المرسلة</span>
            {c.orders.map((o) => (
              <div key={o.order_item_id} className="flex items-center gap-2 text-[13px]">
                <Icon name={o.department === "lab" ? "flask-conical" : "scan-line"} size={15} className={o.department === "lab" ? "text-lab" : "text-info"} />
                <span className="flex-1">{o.service_name}</span>
                {o.has_critical && <span className="text-danger-strong">حرج</span>}
                <span className="text-xs text-ink-2">{o.result_available ? "النتيجة جاهزة" : o.payment_status === "unpaid" ? "غير مدفوع" : o.payment_status === "deferred" ? "آجل" : ORDER_AR[o.status] ?? o.status}</span>
                {canDefer && o.payment_status === "unpaid" && <button type="button" onClick={() => setDefer({ id: o.invoice_item_id, price: o.price })} className="min-h-9 rounded-full border border-line-strong px-3 text-xs font-semibold">تأجيل الدفع</button>}
              </div>
            ))}
          </Card>
        )}
        {defer && patientId && <DeferDialog patientId={patientId} itemIds={[defer.id]} amount={defer.price} onClose={() => setDefer(null)} onDone={() => { setDefer(null); void qc.invalidateQueries({ queryKey: ["consult", ticketId] }); }} />}
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="flex flex-col gap-2 p-4">
            <span className="flex items-center gap-2 text-sm font-bold"><Icon name="lock-keyhole" size={16} className="text-primary" />ملاحظات خاصة</span>
            <textarea value={f.private_notes ?? ""} onChange={(e) => set({ private_notes: e.target.value })} rows={3} className="rounded-field border-[1.5px] border-line-strong bg-surface p-3 text-sm outline-none focus:border-primary" />
            <span className="flex items-center gap-1 text-xs text-ink-2"><Icon name="eye-off" size={13} />لا تظهر للمريض ولا للصيدلية أبداً</span>
          </Card>
          <Card className="flex flex-col gap-2 p-4">
            <span className="flex items-center gap-2 text-sm font-bold"><Icon name="calendar-clock" size={16} className="text-primary" />المراجعة بعد</span>
            <div className="flex items-center gap-2">
              <button aria-label="إنقاص" onClick={() => set({ follow_up_after_days: Math.max(0, (f.follow_up_after_days ?? 0) - 1) })} className="grid size-10 place-items-center rounded-full border border-line-strong"><Icon name="minus" size={15} /></button>
              <span className="num w-12 text-center text-2xl font-bold">{f.follow_up_after_days ?? 0}</span>
              <button aria-label="زيادة" onClick={() => set({ follow_up_after_days: Math.min(365, (f.follow_up_after_days ?? 0) + 1) })} className="grid size-10 place-items-center rounded-full bg-primary text-on-accent"><Icon name="plus" size={15} /></button>
              <span className="text-sm">يوماً</span>
            </div>
          </Card>
        </div>
        <div className="sticky bottom-3 z-10 flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-surface p-3 shadow-pop">
          <span className="flex-1 text-[13px]">طلبات جديدة: <b className="num">{labs.length + rads.length}</b> · على المريض <b className="num">{fmtNum(newTotal)}</b> د.ع</span>
          <Button size="md" variant="ghost" icon="save" loading={busy === "save"} disabled={!editable || !!busy} onClick={() => save(false)}>حفظ</Button>
          {session?.call_policy?.call_next_by !== "reception" && (
            <label className="flex items-center gap-1.5 text-[13px]"><input type="checkbox" checked={callNext} onChange={(e) => setCallNext(e.target.checked)} className="size-4" />واستدعاء التالي</label>
          )}
          <Button size="md" variant="soft" icon="undo-2" loading={busy === "return"} disabled={!editable || !!busy} onClick={() => save(true, true)}>يعود إليّ</Button>
          <Button size="md" icon="circle-check" loading={busy === "finish"} disabled={!editable || !!busy} onClick={() => save(true)}>حفظ وإنهاء</Button>
        </div>
        {c && <span className="flex items-center gap-1.5 text-xs text-ink-2"><Icon name="file-clock" size={14} />قابلة للتعديل حتى <span className="num">{fmtDateTime(c.editable_until)}</span>، وبعدها بملحق</span>}
      </div>
    </div>
  );
}

function OrderPicker({ title, icon, cls, list, sel, setSel, ordered, disabled }: { title: string; icon: string; cls: string; list: { service_id: string; name: string; price: number }[]; sel: string[]; setSel: (v: string[]) => void; ordered: Set<string>; disabled: boolean }) {
  const [text, setText] = useState("");
  const shown = list.filter((s) => !text || s.name.toLowerCase().includes(text.toLowerCase())).slice(0, 12);
  return (
    <Card className="flex flex-col gap-2.5 p-4">
      <span className="flex items-center gap-2 text-sm font-bold"><Icon name={icon} size={16} className={cls} />{title}</span>
      <input value={text} onChange={(e) => setText(e.target.value)} placeholder="بحث" className="h-9 rounded-xl border border-line-strong bg-surface px-2.5 text-sm outline-none focus:border-primary" />
      <div className="flex flex-wrap gap-1.5">
        {shown.map((s) => {
          const on = sel.includes(s.service_id), done = ordered.has(s.service_id);
          return (
            <button key={s.service_id} disabled={disabled || done} onClick={() => setSel(on ? sel.filter((x) => x !== s.service_id) : [...sel, s.service_id])}
              className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold disabled:opacity-50 ${on ? "border-primary bg-primary text-on-accent" : "border-line text-ink-2"}`}>
              <Icon name={done ? "circle-check" : on ? "check" : "plus"} size={12} />{s.name}<span className="num opacity-75">{fmtNum(s.price)}</span>
            </button>
          );
        })}
        {!list.length && <span className="sub-sm">لا توجد خدمات معرفة</span>}
      </div>
      <span className="flex items-center gap-1 text-[11px] text-ink-2"><Icon name="shopping-basket" size={12} />كل طلب يُضاف بنداً غير مدفوع في سلة المريض</span>
    </Card>
  );
}

// ------------------------------------------------------------------ سجل المريض
const ORDER_AR: Record<string, string> = {
  ordered: "مطلوب", paid: "مدفوع", deferred: "آجل", sample_collected: "سُحبت العينة", in_progress: "قيد التنفيذ", resulted: "النتيجة جاهزة",
  scheduled: "محجوز موعده", performed: "أُجري", reported: "كُتب التقرير", released: "التقرير جاهز", cancelled: "ملغى",
};
/** بدون مريض في الغرفة: بحث عن أي مريض (هاتف، اسم، رقم ملف) لفتح سجله الموحد. */
function HistorySearch() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [dq, setDq] = useState("");
  useEffect(() => { const t = setTimeout(() => setDq(text), 350); return () => clearTimeout(t); }, [text]);
  const params = searchParamsFor(dq);
  const q = useQuery({ queryKey: ["patients", "search", dq], enabled: !!params, queryFn: () => patientsApi.search(params!) });
  return (
    <Card className="flex flex-col gap-3 p-[18px]">
      <span className="text-base font-bold">سجل مريض</span>
      <TextInput label="بحث" icon="search" value={text} onChange={setText} placeholder="هاتف، اسم، أو رقم الملف" />
      {!params ? <span className="sub">اختر مريضاً من طابورك، أو ابحث عن أي مريض.</span>
        : q.isPending ? <Spinner /> : q.isError ? <Alert tone="danger">{errorMessage(q.error)}</Alert>
        : !q.data.items.length ? <Empty icon="user-round" title="لا نتائج" />
        : q.data.items.map((p) => (
          <button key={p.patient_id} onClick={() => router.push(`/staff/doctor/history?patient_id=${p.patient_id}`)} className="flex items-center gap-3 rounded-xl border border-line bg-surface p-3 text-start hover:bg-bg">
            <Icon name="user-round" size={18} className="text-primary" />
            <span className="flex flex-1 flex-col"><span className="text-sm font-semibold">{p.full_name}</span><span className="sub-sm num">{p.file_number} · {p.phone_number}</span></span>
            <Icon name="chevron-left" size={16} />
          </button>
        ))}
    </Card>
  );
}

export function DoctorHistory() {
  const params = useSearchParams();
  const pid = params.get("patient_id");
  const q = useMyQueue();
  const fallback = q.data?.items.find((t) => t.status === "in_room")?.patient_id;
  const id = pid ?? fallback;
  const h = useQuery({ queryKey: ["history", id], queryFn: () => clinicalApi.history(id!), enabled: !!id });
  const [add, setAdd] = useState<string | null>(null);
  const qc = useQueryClient();
  if (!id) return <HistorySearch />;
  if (h.isPending) return <Spinner />;
  if (h.isError) return <Alert tone="danger">{errorMessage(h.error)}</Alert>;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 text-[13px] text-ink-2"><Icon name="lock-keyhole" size={14} />الملاحظات الخاصة تظهر للأطباء فقط · <span className="num">{h.data.total}</span> زيارة · ملف موحد لكل الفروع</div>
      {!h.data.items.length ? <Empty icon="history" title="لا زيارات سابقة" /> : h.data.items.map((v) => (
        <Card key={v.consultation_id} className="flex flex-col gap-2 p-4">
          <div className="flex flex-wrap items-center gap-2"><span className="num font-bold">{fmtDate(v.date)}</span><span className="sub-sm">{v.branch_name} · {v.clinic_name}</span><span className="flex-1" /><span className="text-[13px]">{v.doctor_name}</span></div>
          <div className="flex items-center gap-2"><Icon name="stethoscope" size={16} className="text-primary" /><span className="font-semibold" dir="ltr">{v.diagnosis ?? "—"}</span>{v.icd10_code && <span className="num rounded bg-bg px-1.5 text-xs">{v.icd10_code}</span>}</div>
          {v.clinical_notes && <span className="text-[13px] text-ink-2">{v.clinical_notes}</span>}
          {v.prescription && <span className="flex flex-wrap items-center gap-1.5 text-[13px]"><Icon name="pill" size={14} className="text-pharm" /><span dir="ltr" className="num">{v.prescription.lines.map((l) => l.drug_name).join(" · ")}</span></span>}
          {v.orders.length > 0 && <div className="flex flex-wrap gap-1.5">{v.orders.map((o) => <span key={o.order_item_id} className={`rounded-full px-2.5 py-1 text-xs ${o.has_critical ? "bg-danger-soft text-danger-strong" : "bg-bg text-ink-2"}`}>{o.service_name} · {o.result_available ? "جاهزة" : ORDER_AR[o.status] ?? o.status}</span>)}</div>}
          {v.private_notes && <span className="flex items-center gap-1.5 rounded-xl bg-warn-soft/60 px-2.5 py-1.5 text-xs"><Icon name="lock-keyhole" size={13} />{v.private_notes}</span>}
          <div className="flex items-center gap-2"><span className="sub-sm">{v.addenda_count ? `${v.addenda_count} ملحق` : ""}</span><span className="flex-1" /><Button size="md" variant="ghost" icon="file-pen-line" onClick={() => setAdd(v.consultation_id)}>إضافة ملحق</Button></div>
        </Card>
      ))}
      <ReasonDialog open={!!add} title="إضافة ملحق للمعاينة" icon="file-pen-line" label="نص الملحق" confirmText="حفظ الملحق" onClose={() => setAdd(null)}
        onConfirm={async (t) => { await clinicalApi.addendum(add!, t); toast.success("أُضيف الملحق"); void qc.invalidateQueries({ queryKey: ["history", id] }); }} />
    </div>
  );
}

// ------------------------------------------------------------------ الإشعارات
type Alrt = { key: string; icon: string; tone: string; title: string; msg: string; at: string; href?: string };
type StaffNotif = { notification_id: string; type: string; title: string; message: string; link: { type: string; id: string } | null; is_read: boolean; created_at: string };

export { NotificationCenter as DoctorAlerts } from "@/components/staff/notifications";
