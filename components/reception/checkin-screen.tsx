"use client";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Icon } from "@/components/icon";
import { toast } from "@/components/toast";
import { useAuth } from "@/lib/auth/store";
import { Alert, Button, Card, DateField, DoctorPhoto, Empty, Field, ISelect, Modal, Segmented, Spinner } from "@/components/ui";
import { bookingsApi, doctorsApi, patientsApi, queueApi, searchParamsFor, type CheckInRequest, type CheckInResult, type PatientSearchItem, type QueueSession } from "@/lib/api/reception";
import { errorMessage, fieldErrors, isApiError, isNetworkError } from "@/lib/api/errors";
import { hardwareAgent } from "@/lib/agent";
import { addDays, todayBaghdad, weekdayAr } from "@/lib/date";
import { fmtDate, fmtIqd, fmtTime, fmtTimeRange, stripBidi } from "@/lib/format";
import { uuidv7 } from "@/lib/id";
import { db } from "@/lib/offline/db";
import { onlineOrQueue } from "@/lib/reception/offline-action";
import { LIVE_KEY, addTicket, useLiveQueue } from "@/lib/reception/use-live-queue";
import { useSync } from "@/lib/offline/sync-provider";

type Done = { kind: "online"; r: CheckInResult; name: string; doctor: string; patientId?: string } | { kind: "offline"; name: string; doctor: string };

export function CheckinScreen() {
  const live = useLiveQueue();
  const sessions = useMemo(() => live.data ?? [], [live.data]);
  const [doctorId, setDoctorId] = useState<string | null>(null);
  const doctor = sessions.find((s) => s.doctor_id === doctorId) ?? sessions.find((s) => s.session_status === "open") ?? sessions[0];
  const [selected, setSelected] = useState<PatientSearchItem | null>(null);
  const [done, setDone] = useState<Done | null>(null);
  const [hasBooking, setHasBooking] = useState<{ booking_id: string; name: string; patient_id?: string } | null>(null);
  const [family, setFamily] = useState<{ phone: string; n: number } | null>(null);
  const [extra, setExtra] = useState<{ req: Omit<CheckInRequest, "ticket_id">; who: string; patientId?: string; expectedEnd?: string } | null>(null);
  const [choice, setChoice] = useState<ReturnChoice | null>(null);
  const qc = useQueryClient();

  /** تثبيت الحضور (العقد 7 POST /queue/check-in). يعمل أوفلاين بمعرف تذكرة مولّد محلياً. */
  async function checkIn(req: Omit<CheckInRequest, "ticket_id">, who: string, patientId = req.patient_id ?? undefined) {
    const body: CheckInRequest = { ticket_id: uuidv7(), visit_kind: "auto", ...req };
    const docName = sessions.find((s) => s.doctor_id === req.doctor_id)?.doctor_name ?? "";
    setHasBooking(null);
    setExtra(null);
    setChoice(null);
    try {
      const r = await onlineOrQueue(() => queueApi.checkIn(body), { type: "queue.check_in", payload: { ...body }, label: `حضور ${who}` });
      if (r.mode === "offline") {
        if (req.doctor_id && req.patient_id) addTicket(qc, req.doctor_id, { ticket_id: body.ticket_id, ticket_number: "—", patient_id: req.patient_id, patient_name: who, booking_id: null, source: "walk_in", priority: "normal", status: "arrived", payment_status: "unpaid", invoice_id: null, queue_position: null, estimated_time: null, _pending: true });
        setDone({ kind: "offline", name: who, doctor: docName });
        toast.warn("حُفظ الحضور أوفلاين ويُرسل عند عودة الاتصال");
        return;
      }
      setDone({ kind: "online", r: r.data, name: who, doctor: docName, patientId });
      void qc.invalidateQueries({ queryKey: LIVE_KEY });
      toast.success(`ثُبّت الحضور · ${r.data.ticket_number}`);
      hardwareAgent.printTicket({ ticket_number: r.data.ticket_number, doctor_name: docName, estimated_time: r.data.estimated_time ? fmtTime(r.data.estimated_time) : undefined }).catch((e) => toast.error(errorMessage(e)));
    } catch (e) {
      if (isApiError(e) && e.code === "PATIENT_HAS_BOOKING" && typeof e.extra?.booking_id === "string") { setHasBooking({ booking_id: e.extra.booking_id, name: who, patient_id: patientId }); return; }
      // السعة اكتملت والطبيب يقبل الإضافي: تأكيد واحد من الاستقبال (المرحلة 2أ)
      // التدقيق 1.2 (قرار المالك): المراجع ينتظر نتائج الطبيب أو له عودة مجانية → الاستقبال يختار، والافتراضي «عودة بالنتائج»
      const c = returnChoiceFrom(e, req, who, patientId);
      if (c) { setChoice(c); return; }
      if (isApiError(e) && e.code === "SESSION_FULL_EXTRA_POSSIBLE") { setExtra({ req, who, patientId, expectedEnd: typeof e.extra?.expected_end === "string" ? e.extra.expected_end : undefined }); return; }
      toast.error(errorMessage(e));
      throw e;
    }
  }

  return (
    <>
      {done && <DoneBanner done={done} onClose={() => setDone(null)} />}
      {hasBooking && (
        <Alert tone="info" icon="calendar-clock">
          للمريض {hasBooking.name} حجز في هذه الوجبة. <button className="font-bold underline" onClick={() => checkIn({ booking_id: hasBooking.booking_id }, hasBooking.name, hasBooking.patient_id).catch(() => {})}>تثبيت الحضور بالحجز</button>
        </Alert>
      )}
      {extra && (
        <Alert tone="warn" icon="users">
          اكتملت سعة الوجبة. قبول {extra.who} «إضافي»؟{extra.expectedEnd && <> الطبيب ينتهي تقريباً <b className="num">{fmtTime(extra.expectedEnd)}</b>.</>}{" "}
          <button className="font-bold underline" onClick={() => checkIn({ ...extra.req, allow_extra: true }, extra.who, extra.patientId).catch(() => {})}>قبول إضافي</button>{" · "}
          <button className="underline" onClick={() => setExtra(null)}>إلغاء</button>
        </Alert>
      )}
      {choice && <ReturnOrNewDialog choice={choice} onClose={() => setChoice(null)} onPick={(mode) => checkIn({ ...choice.req, visit_mode: mode }, choice.who, choice.patientId)} />}
      {live.isError && !sessions.length && <Alert tone="danger">{errorMessage(live.error)}</Alert>}
      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-4">
          <SearchCard selected={selected} onSelect={setSelected}
            onWalkIn={(p) => doctor ? checkIn({ patient_id: p.patient_id, doctor_id: doctor.doctor_id }, p.full_name).catch(() => {}) : toast.error("اختر طبيباً من قائمة «مريض جديد وحضور مباشر»")} doctorName={doctor?.doctor_name}
            onFamily={(phone) => setFamily((f) => ({ phone, n: (f?.n ?? 0) + 1 }))} />
          {selected && <PhoneBooking patient={selected} />}
        </div>
        <NewPatientCard family={family} sessions={sessions} loading={live.isPending} doctor={doctor} onDoctor={setDoctorId} onSubmit={async (p) => checkIn({ patient_id: p.patient_id, doctor_id: doctor!.doctor_id }, p.full_name)} />
      </div>
    </>
  );
}

export type ReturnChoice = { req: Omit<CheckInRequest, "ticket_id">; who: string; patientId?: string; ticketNumber: string; sameTicket: boolean; pending: string[]; ready: boolean; freeUntil: string | null };

/** رد 409 RETURN_OR_NEW_REQUIRED → بيانات حوار الاختيار (null لأي خطأ آخر). */
export function returnChoiceFrom(e: unknown, req: Omit<CheckInRequest, "ticket_id">, who: string, patientId?: string): ReturnChoice | null {
  if (!isApiError(e) || e.code !== "RETURN_OR_NEW_REQUIRED") return null;
  const x = e.extra ?? {};
  return { req, who, patientId, ticketNumber: typeof x.ticket_number === "string" ? x.ticket_number : "", sameTicket: x.same_ticket === true,
    pending: Array.isArray(x.pending_services_ar) ? x.pending_services_ar.filter((v): v is string => typeof v === "string") : [], ready: x.ready_to_return === true,
    freeUntil: typeof x.free_return_until === "string" ? x.free_return_until : null };
}

/** «عودة بالنتائج» (افتراضي، بلا رسوم) أو «زيارة جديدة» لمراجع ينتظر نتائج الطبيب نفسه. القرار يُسجل في سجل العمليات. */
export function ReturnOrNewDialog({ choice, onClose, onPick }: { choice: ReturnChoice; onClose: () => void; onPick: (mode: "return" | "new") => Promise<void> }) {
  const [mode, setMode] = useState<"return" | "new">("return");
  const [busy, setBusy] = useState(false);
  const status = choice.ready ? "جاهز للعودة" : choice.pending.length ? `بانتظار ${choice.pending.join(" و")}` : "له عودة مجانية بالنتائج";
  const options: { value: "return" | "new"; title: string; hint: string; icon: string }[] = [
    { value: "return", icon: "undo-2", title: "عودة بالنتائج", hint: choice.sameTicket ? `نفس الدور ${choice.ticketNumber} · بلا رسوم · بعد الطوارئ مباشرة` : `دور جديد مجاني مربوط بالدور ${choice.ticketNumber}${choice.freeUntil ? ` · صالحة حتى ${fmtDate(choice.freeUntil)}` : ""}` },
    { value: "new", icon: "user-plus", title: "زيارة جديدة", hint: "دور وكشفية جديدان بالسعر المعتاد" },
  ];
  return (
    <Modal open onClose={onClose} title={`${choice.who} · ${status}`} icon="flask-conical"
      footer={<Button loading={busy} icon={mode === "return" ? "undo-2" : "user-plus"} onClick={async () => { setBusy(true); try { await onPick(mode); } catch { /* الرسالة ظهرت */ } finally { setBusy(false); } }}>تأكيد</Button>}>
      <div role="radiogroup" aria-label="نوع الحضور" className="flex flex-col gap-2">
        {options.map((o) => (
          <button key={o.value} type="button" role="radio" aria-checked={mode === o.value} onClick={() => setMode(o.value)}
            className={`flex items-start gap-3 rounded-xl border p-3 text-start ${mode === o.value ? "border-primary bg-primary-soft" : "border-line hover:bg-bg"}`}>
            <Icon name={o.icon} size={20} className="mt-0.5 shrink-0" />
            <span className="flex flex-col gap-0.5"><span className="font-semibold">{o.title}</span><span className="text-[13px] text-ink-2">{o.hint}</span></span>
          </button>
        ))}
      </div>
    </Modal>
  );
}

function DoneBanner({ done, onClose }: { done: Done; onClose: () => void }) {
  const canCollect = useAuth((x) => x.can("payments.collect"));
  if (done.kind === "offline") return <Alert tone="warn" icon="cloud-off">حُفظ حضور {done.name} لدى {done.doctor} أوفلاين. يظهر رقم التذكرة بعد المزامنة.</Alert>;
  const r = done.r;
  return (
    <div className="flex flex-wrap items-center gap-3.5 rounded-card border border-success/40 bg-success-soft p-4">
      <span className="num grid size-14 place-items-center rounded-2xl bg-success text-base font-bold text-on-accent">{r.ticket_number}</span>
      <div className="flex min-w-[200px] flex-1 flex-col">
        <span className="font-bold">{done.name}{done.doctor ? <> · {done.doctor}</> : null}</span>
        <span className="text-[13px] text-success-strong">{r.visit_kind === "follow_up" ? "مراجعة" : "كشف جديد"} · الدخول التقريبي <span className="num">{fmtTime(r.estimated_time)}</span>{r.queue_position ? <> · الترتيب <span className="num">{r.queue_position}</span></> : null}</span>
      </div>
      {r.amount_due > 0 && !canCollect ? <span className="text-[13px] font-semibold text-danger-strong">الكشفية غير مدفوعة · التحصيل عند موظف الاستقبال</span>
        : r.amount_due > 0
        ? <Link href={done.patientId ? `/staff/reception/collect?patient_id=${done.patientId}` : "/staff/reception/collect"} className="flex h-10 items-center gap-2 rounded-full bg-danger px-4 text-sm font-semibold text-on-accent hover:text-white"><Icon name="banknote" size={16} />تحصيل {fmtIqd(r.amount_due)}</Link>
        : <span className="flex items-center gap-1.5 rounded-full bg-surface px-3 py-2 text-sm font-semibold text-success-strong"><Icon name="circle-check" size={16} />مدفوع</span>}
      <button onClick={onClose} aria-label="إغلاق" className="grid size-9 place-items-center rounded-full hover:bg-surface"><Icon name="x" size={18} /></button>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------

/** مسح QR أو باركود بالكاميرا. تستخدمه الصيدلية (رمز الوصفة). */
export function CameraScanner({ onClose, onCode, title }: { onClose: () => void; onCode: (c: string) => void; title: string }) {
  const video = useRef<HTMLVideoElement>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let stream: MediaStream | null = null, stop = false;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        if (!video.current) return;
        video.current.srcObject = stream; await video.current.play();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const det = new (window as any).BarcodeDetector({ formats: ["qr_code", "code_128"] });
        while (!stop) {
          const found = await det.detect(video.current).catch(() => []);
          if (found?.[0]?.rawValue) { onCode(found[0].rawValue); return; }
          await new Promise((r) => setTimeout(r, 300));
        }
      } catch { setErr("تعذر فتح الكاميرا. استخدم قارئ الباركود أو اكتب الرمز."); }
    })();
    return () => { stop = true; stream?.getTracks().forEach((t) => t.stop()); };
  }, [onCode]);
  return (
    <Modal open onClose={onClose} title={title} icon="scan-qr-code">
      {err ? <Alert tone="danger">{err}</Alert> : <video ref={video} muted playsInline className="aspect-square w-full rounded-2xl bg-black object-cover" />}
    </Modal>
  );
}

// ---------------------------------------------------------------------------------------------

function useDebounced<T>(v: T, ms = 350) {
  const [d, setD] = useState(v);
  useEffect(() => { const t = setTimeout(() => setD(v), ms); return () => clearTimeout(t); }, [v, ms]);
  return d;
}

/** بحث محلي في مرضى اليوم المخزنين (GET /sync/snapshot) عند انقطاع الإنترنت. */
async function searchLocal(text: string): Promise<PatientSearchItem[]> {
  const t = text.trim();
  const all = (await db().patients.toArray()) as PatientSearchItem[];
  return all.filter((p) => p.full_name?.includes(t) || p.phone_number?.includes(t) || p.file_number?.includes(t.toUpperCase())).slice(0, 20)
    .map((p) => ({ ...p, last_visit_date: p.last_visit_date ?? null, is_banned: !!p.is_banned, outstanding_balance: p.outstanding_balance ?? 0 }));
}

function SearchCard({ selected, onSelect, onWalkIn, onFamily, doctorName }: { selected: PatientSearchItem | null; onSelect: (p: PatientSearchItem | null) => void; onWalkIn: (p: PatientSearchItem) => void; onFamily: (phone: string) => void; doctorName?: string }) {
  const canUnban = useAuth((x) => x.can("patients.unban"));
  const [text, setText] = useState("");
  const dq = useDebounced(text);
  const params = searchParamsFor(dq);
  const { online } = useSync();
  const q = useQuery({
    queryKey: ["patients", "search", dq, online],
    enabled: !!params,
    queryFn: async () => {
      if (!online) return { items: await searchLocal(dq), local: true };
      try { return { ...(await patientsApi.search(params!)), local: false }; }
      catch (e) { if (isNetworkError(e)) return { items: await searchLocal(dq), local: true }; throw e; }
    },
  });
  const [edit, setEdit] = useState<PatientSearchItem | null>(null);
  const items = q.data?.items ?? [];
  return (
    <Card className="flex flex-col gap-3 p-[18px]">
      <span className="text-base font-bold">البحث عن مريض</span>
      <div className="flex h-12 items-center gap-2 rounded-field border-2 border-primary px-3.5 shadow-[0_0_0_4px_rgb(var(--primary-soft))]">
        <Icon name="search" size={18} className="text-primary" />
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="هاتف، اسم، أو رقم الملف" aria-label="بحث عن مريض"
          className="min-w-0 flex-1 bg-transparent text-base font-semibold outline-none placeholder:font-normal placeholder:text-ink-muted" />
        <span className="sub-sm whitespace-nowrap">{q.data?.local ? "مرضى اليوم (محلي)" : "في كل الفروع"}</span>
      </div>
      {!params ? <span className="sub">اكتب حرفين على الأقل. يبحث بالهاتف أو رقم الملف (مثل B1-004512) أو الاسم.</span>
        : q.isPending ? <Spinner label="جارٍ البحث…" />
        : q.isError ? <Alert tone="danger">{errorMessage(q.error)}</Alert>
        : !items.length ? <Empty icon="user-round" title="لا نتائج" hint="سجّل المريض من «مريض جديد وحضور مباشر»." />
        : items.map((p) => {
          const on = selected?.patient_id === p.patient_id;
          return (
            <div key={p.patient_id} className={`flex flex-wrap items-center gap-3 rounded-xl border-[1.5px] p-3 ${p.is_banned ? "border-danger/40 bg-danger-soft/50" : on ? "border-primary bg-primary-soft" : "border-line bg-surface"}`}>
              <button onClick={() => onSelect(on ? null : p)} className="flex min-w-[200px] flex-1 items-center gap-3 text-start" aria-pressed={on}>
                <span className={`grid size-10 shrink-0 place-items-center rounded-full ${p.is_banned ? "bg-danger-soft text-danger" : "bg-primary-soft text-primary-strong"}`}><Icon name={p.is_banned ? "ban" : "user-round"} size={19} /></span>
                <span className="flex min-w-0 flex-col">
                  <span className="text-[15px] font-semibold">{p.full_name}</span>
                  <span className="sub-sm"><span className="num">{p.file_number} · {p.phone_number}</span>{p.last_visit_date ? <> · آخر زيارة <span className="num">{fmtDate(p.last_visit_date)}</span></> : null}</span>
                  {p.is_banned ? <span className="text-xs text-danger-strong">محظور · يلزم عربون لفك الحظر</span>
                    : p.outstanding_balance > 0 ? <span className="text-xs text-warn-strong">ذمة غير مدفوعة {fmtIqd(p.outstanding_balance)}</span> : null}
                </span>
              </button>
              {!q.data?.local && <button title="فرد جديد من العائلة بنفس الهاتف" aria-label="فرد جديد من العائلة بنفس الهاتف" onClick={() => onFamily(p.phone_number)} className="grid size-9 place-items-center rounded-full border border-line-strong bg-surface text-ink-2 hover:bg-bg"><Icon name="user-round-plus" size={16} /></button>}
              {!q.data?.local && <button title="تعديل بيانات المريض" aria-label="تعديل بيانات المريض" onClick={() => setEdit(p)} className="grid size-9 place-items-center rounded-full border border-line-strong bg-surface text-ink-2 hover:bg-bg"><Icon name="user-pen" size={16} /></button>}
              {p.is_banned
                ? (canUnban ? <Link href={`/staff/reception/unban?patient_id=${p.patient_id}`} className="flex h-9 items-center gap-1.5 rounded-full bg-danger px-3.5 text-[13px] font-semibold text-on-accent hover:text-white"><Icon name="hand-coins" size={15} />قبض العربون</Link> : <span className="flex h-9 items-center gap-1.5 rounded-full bg-danger-soft px-3.5 text-[13px] font-semibold text-danger-strong"><Icon name="ban" size={15} />محظور · راجع المحاسب</span>)
                : <button onClick={() => onWalkIn(p)} title={doctorName ? `حضور مباشر لدى ${doctorName}` : undefined} className="flex h-9 items-center gap-1.5 rounded-full border-[1.5px] border-primary bg-surface px-3.5 text-[13px] font-semibold text-primary hover:bg-primary-soft"><Icon name="footprints" size={15} />حضور مباشر</button>}
            </div>
          );
        })}
      {edit && <EditPatient id={edit.patient_id} onClose={() => setEdit(null)} />}
    </Card>
  );
}

function EditPatient({ id, onClose }: { id: string; onClose: () => void }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["patient", id], queryFn: () => patientsApi.get(id) });
  const [f, setF] = useState<{ full_name: string; phone_number: string; gender: "male" | "female"; approx_age: string; birth_date: string } | null>(null);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState<unknown>(null);
  useEffect(() => { if (q.data && !f) setF({ full_name: q.data.full_name, phone_number: q.data.phone_number, gender: q.data.gender, approx_age: q.data.approx_age?.toString() ?? "", birth_date: q.data.birth_date ?? "" }); }, [q.data, f]);
  const fe = fieldErrors(err);
  return (
    <Modal open onClose={onClose} title="تعديل بيانات المريض" icon="user-pen">
      {!f ? <Spinner /> : (
        <form className="flex flex-col gap-3" onSubmit={async (e) => {
          e.preventDefault(); setBusy(true); setErr(null);
          try {
            await patientsApi.update(id, { full_name: f.full_name, phone_number: f.phone_number, gender: f.gender, ...(f.birth_date ? { birth_date: f.birth_date } : f.approx_age ? { approx_age: Number(f.approx_age) } : {}) });
            toast.success("حُفظت بيانات المريض"); void qc.invalidateQueries({ queryKey: ["patients"] }); onClose();
          } catch (e) { setErr(e); } finally { setBusy(false); }
        }}>
          <Field label="الاسم الكامل" icon="user-round" value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} error={fe.full_name} />
          <Field label="الهاتف" icon="smartphone" ltr inputMode="tel" value={f.phone_number} onChange={(e) => setF({ ...f, phone_number: e.target.value })} error={fe.phone_number} />
          <div className="grid grid-cols-2 gap-2.5">
            <DateField label="تاريخ الميلاد" icon="cake" value={f.birth_date} max={todayBaghdad()} startInYears clearable onChange={(v) => setF({ ...f, birth_date: v })} error={fe.birth_date} />
            <Field label="أو العمر التقريبي" icon="cake" ltr inputMode="numeric" value={f.approx_age} onChange={(e) => setF({ ...f, approx_age: e.target.value.replace(/\D/g, "") })} disabled={!!f.birth_date} />
          </div>
          <Segmented value={f.gender} onChange={(g) => setF({ ...f, gender: g })} options={[{ value: "female", label: "أنثى", icon: "user-round" }, { value: "male", label: "ذكر", icon: "user-round" }]} />
          {err != null && <Alert tone="danger">{errorMessage(err)}</Alert>}
          <Button size="md" loading={busy} icon="check">حفظ</Button>
        </form>
      )}
    </Modal>
  );
}

// ---------------------------------------------------------------------------------------------

/** الحجز الهاتفي (العقد 5 POST /bookings، الدفع بالعيادة فقط). الأيام المتاحة من GET /public/doctors/{id}/availability. */
function PhoneBooking({ patient }: { patient: PatientSearchItem }) {
  const docs = useQuery({ queryKey: ["doctors"], queryFn: () => doctorsApi.list(), staleTime: 10 * 60_000 });
  const [docId, setDocId] = useState<string>("");
  const doctor = docs.data?.items.find((d) => d.doctor_id === docId) ?? docs.data?.items[0];
  const from = todayBaghdad(), to = addDays(from, 6);
  const av = useQuery({ queryKey: ["availability", doctor?.doctor_id, from], enabled: !!doctor, queryFn: () => doctorsApi.availability(doctor!.doctor_id, from, to) });
  const [day, setDay] = useState<string | null>(null);
  const days = av.data?.days ?? [];
  const sel = days.find((d) => d.date === day) ?? days.find((d) => d.status === "open");
  const [busy, setBusy] = useState(false);
  const qc = useQueryClient();

  async function book() {
    if (!sel) return;
    setBusy(true);
    try {
      const b = await bookingsApi.create({ booking_id: uuidv7(), patient_id: patient.patient_id, session_id: sel.session_id, visit_kind: "auto" });
      toast.success(`حُجز ${patient.full_name} · ${b.ticket_number} · ${stripBidi(fmtDate(b.date))} ${stripBidi(fmtTime(b.estimated_time))}`);
      b.warnings?.forEach((w) => toast.warn(w.message));
      void qc.invalidateQueries({ queryKey: ["availability"] }); void qc.invalidateQueries({ queryKey: LIVE_KEY });
    } catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); }
  }

  return (
    <Card className="flex flex-col gap-3 p-[18px]">
      <div className="flex flex-wrap items-center gap-2.5">
        <Icon name="phone-call" size={19} className="text-primary" /><span className="flex-1 text-base font-bold">حجز هاتفي · {patient.full_name}</span>
        <span className="sub-sm">الدفع بالعيادة فقط</span>
      </div>
      {docs.data && (
        <ISelect aria-label="الطبيب" size="md" value={doctor?.doctor_id ?? ""} onChange={(v) => { if (!v) return; setDocId(v); setDay(null); }}
          options={docs.data.items.map((d) => ({ value: d.doctor_id, label: d.full_name, hint: d.clinic_name ?? undefined }))} searchPlaceholder="ابحث باسم الطبيب أو العيادة" />
      )}
      {av.isPending ? <Spinner /> : av.isError ? <Alert tone="danger">تعذر جلب الأيام المتاحة.</Alert> : !days.length ? <span className="sub">لا وجبات خلال الأسبوع القادم.</span> : (
        <>
          <div className="flex flex-wrap gap-1.5">
            {days.map((d) => {
              const on = d.date === sel?.date, ok = d.status === "open";
              return (
                <button key={d.date} disabled={!ok} onClick={() => setDay(d.date)}
                  className={`flex h-[54px] w-16 flex-col items-center justify-center rounded-xl border-[1.5px] text-[11px] font-semibold disabled:opacity-40 ${on ? "border-primary bg-primary text-on-accent" : "border-line bg-surface text-ink-2"}`}>
                  <span className="num text-base">{d.date.slice(8)}</span>{weekdayAr(d.date)}
                </button>
              );
            })}
          </div>
          {sel && (
            <div className="flex flex-wrap items-center gap-2.5 rounded-xl bg-bg px-3 py-2.5 text-[13px]">
              <Icon name="calendar-clock" size={16} className="text-primary" />
              <span className="flex-1">{doctor?.full_name} · <span className="num">{fmtTimeRange(sel.start, sel.end)}</span>{sel.next_sequence_number ? <> · التسلسل <b className="num">#{sel.next_sequence_number}</b></> : null}{sel.next_estimated_time ? <> · <span className="num">{fmtTime(sel.next_estimated_time)}</span></> : null}</span>
              <span className={`text-xs font-semibold ${sel.online_remaining > 0 ? "text-success-strong" : "text-danger-strong"}`}>متاح <span className="num">{sel.online_remaining}</span></span>
            </div>
          )}
          <Button size="md" variant="ghost" icon="calendar-plus" loading={busy} disabled={!sel || sel.status !== "open"} onClick={book} className="border-[1.5px] !border-primary !text-primary">تأكيد الحجز الهاتفي</Button>
        </>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------------------------

function NewPatientCard({ family, sessions, loading, doctor, onDoctor, onSubmit }: {
  family: { phone: string; n: number } | null;
  sessions: QueueSession[]; loading: boolean; doctor?: QueueSession; onDoctor: (id: string) => void;
  onSubmit: (p: { patient_id: string; full_name: string }) => Promise<void>;
}) {
  const docs = useQuery({ queryKey: ["doctors"], queryFn: () => doctorsApi.list(), staleTime: 10 * 60_000 });
  const [name, setName] = useState(""); const [phone, setPhone] = useState("");
  const [ageMode, setAgeMode] = useState<"age" | "birth">("age");
  const [age, setAge] = useState(""); const [birth, setBirth] = useState("");
  const [gender, setGender] = useState<"female" | "male">("female");
  const [busy, setBusy] = useState<false | "checkin" | "register">(false); const [err, setErr] = useState<unknown>(null);
  // تسجيل العائلة: رقم هاتف واحد لعدة مرضى. «إبقاء الرقم» يجهز النموذج للفرد التالي بنفس الرقم
  const [keepPhone, setKeepPhone] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (family) { setPhone(family.phone); setKeepPhone(true); setName(""); nameRef.current?.focus(); } }, [family]);
  const dphone = useDebounced(phone.replace(/\D/g, ""), 400);
  const dup = useQuery({ queryKey: ["patients", "dup", dphone], enabled: dphone.length >= 10, queryFn: () => patientsApi.search({ phone: dphone }), retry: false });
  const fe = fieldErrors(err);
  const validPatient = name.trim().length >= 3 && (!phone.trim() || phone.replace(/\D/g, "").length >= 10) && (ageMode === "age" ? !!age : !!birth);
  const valid = validPatient && !!doctor;

  async function submit(e: React.SyntheticEvent, mode: "checkin" | "register" = "checkin") {
    e.preventDefault(); setErr(null); setBusy(mode);
    const body = { patient_id: uuidv7(), full_name: name.trim(), phone_number: phone.trim(), gender, ...(ageMode === "birth" ? { birth_date: birth } : { approx_age: Number(age) }) };
    try {
      const r = await onlineOrQueue(() => patientsApi.create(body), { type: "patient.create", payload: { ...body, created_offline_at: new Date().toISOString() }, label: `مريض جديد ${body.full_name}` });
      if (r.mode === "online" && r.data.possible_duplicates?.length) toast.warn(`تنبيه: ${r.data.possible_duplicates.length} ملف آخر بنفس الهاتف`);
      if (mode === "checkin") await onSubmit({ patient_id: body.patient_id, full_name: body.full_name });
      else toast.success(`سُجّل ${body.full_name}${r.mode === "online" ? ` · ${r.data.file_number}` : " (أوفلاين)"}`);
      setName(""); setAge(""); setBirth(""); if (!keepPhone) setPhone(""); else nameRef.current?.focus();
      void dup.refetch();
    } catch (e) { setErr(e); } finally { setBusy(false); }
  }

  return (
    <Card className="flex flex-col gap-3.5 p-5">
      <div className="flex items-center gap-2.5"><Icon name="user-plus" size={20} className="text-primary" /><span className="text-[17px] font-bold">مريض جديد وحضور مباشر</span></div>
      <form onSubmit={submit} className="flex flex-col gap-3.5" noValidate>
        <Field ref={nameRef} label="الاسم الكامل" icon="user-round" value={name} onChange={(e) => setName(e.target.value)} error={fe.full_name} autoComplete="off" />
        <div className="grid gap-2.5 sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
          <Field label="الهاتف" icon="smartphone" ltr inputMode="tel" placeholder="07XXXXXXXXX" value={phone} onChange={(e) => setPhone(e.target.value)} error={fe.phone_number} />
          {ageMode === "age"
            ? <Field label="العمر التقريبي" icon="cake" ltr inputMode="numeric" value={age} onChange={(e) => setAge(e.target.value.replace(/\D/g, "").slice(0, 3))} error={fe.approx_age} />
            : <DateField label="تاريخ الميلاد" icon="cake" value={birth} max={todayBaghdad()} startInYears onChange={setBirth} error={fe.birth_date} />}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Segmented value={gender} onChange={setGender} options={[{ value: "female", label: "أنثى", icon: "user-round" }, { value: "male", label: "ذكر", icon: "user-round" }]} />
          <Segmented size="sm" value={ageMode} onChange={setAgeMode} options={[{ value: "age", label: "عمر تقريبي" }, { value: "birth", label: "تاريخ الميلاد" }]} />
        </div>
        {!!dup.data?.items.length && (
          <div className="flex items-start gap-2.5 rounded-xl bg-warn-soft px-3 py-2.5 text-[13px] text-warn-strong">
            <Icon name="users" size={16} className="mt-0.5" />
            <span className="flex-1 leading-6">مسجلون بنفس الهاتف ({dup.data.items.length}): {dup.data.items.slice(0, 4).map((p) => `${p.full_name} · ${p.file_number}`).join("، ")}{dup.data.items.length > 4 ? "…" : ""}. تأكد أنه فرد جديد وليس ملفاً مكرراً.</span>
          </div>
        )}
        <div className="flex flex-col gap-2">
          <span className="sub">الطبيب</span>
          {loading ? <Spinner /> : !sessions.length ? <span className="sub">لا وجبات اليوم في عياداتك.</span> : sessions.map((s) => {
            const on = s.doctor_id === doctor?.doctor_id, open = s.session_status === "open";
            const d = docs.data?.items.find((x) => x.doctor_id === s.doctor_id);
            return (
              <button type="button" key={s.session_id} onClick={() => onDoctor(s.doctor_id)} aria-pressed={on}
                className={`flex items-center gap-3 rounded-2xl border-[1.5px] p-2.5 text-start ${on ? "border-primary bg-primary-soft" : "border-line bg-surface"}`}>
                <DoctorPhoto src={d?.photo_url} name={s.doctor_name} className="size-[52px] shrink-0 rounded-xl" />
                <span className="flex flex-1 flex-col"><span className="text-sm font-semibold">{s.doctor_name}</span><span className="sub-sm"><span className="num">{fmtTimeRange(s.start, s.end)}</span> · {s.clinic_name}</span></span>
                <span className={`flex items-center gap-1 text-xs ${open ? "text-success-strong" : "text-danger-strong"}`}><Icon name="footprints" size={14} />{open ? `${s.items.filter((t) => t.status !== "cancelled").length} في الطابور` : "مغلقة"}</span>
              </button>
            );
          })}
        </div>
        <span className="sub-sm flex items-center gap-2"><Icon name="info" size={15} />نوع الكشفية (جديد / مراجعة) يحدده السيرفر تلقائياً.</span>
        {err != null && <Alert tone="danger">{errorMessage(err)}</Alert>}
        <label className="flex cursor-pointer items-center gap-2 text-[13px] font-semibold text-ink-2">
          <input type="checkbox" checked={keepPhone} onChange={(e) => setKeepPhone(e.target.checked)} className="size-4 accent-[rgb(var(--primary))]" />
          <Icon name="users" size={15} />إبقاء الرقم لتسجيل فرد آخر من العائلة
        </label>
        <div className="flex flex-wrap gap-2">
          <Button icon="ticket-check" className="min-w-0 flex-1 !whitespace-normal !px-3" loading={busy === "checkin"} disabled={!valid || !!busy}>تثبيت الحضور وطباعة التذكرة</Button>
          <Button type="button" variant="ghost" icon="user-plus" loading={busy === "register"} disabled={!validPatient || !!busy} onClick={(e) => void submit(e, "register")}>تسجيل فقط</Button>
        </div>
      </form>
    </Card>
  );
}
