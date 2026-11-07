"use client";
import { ExternalResultUpload } from "./external-results";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Icon } from "@/components/icon";
import { toast } from "@/components/toast";
import { Alert, Button, Card, DataGrid, DoctorPhoto, Empty, Field, Modal, ReasonDialog, Segmented, Spinner, TimeField, type Column } from "@/components/ui";
import { doctorsApi, queueApi, type QueueItem, type QueueSession } from "@/lib/api/reception";
import { errorMessage, isApiError } from "@/lib/api/errors";
import { hardwareAgent } from "@/lib/agent";
import { useAuth } from "@/lib/auth/store";
import { todayBaghdad } from "@/lib/date";
import { fmtNum, fmtTime, fmtTimeRange, stripBidi } from "@/lib/format";
import { onlineOrQueue } from "@/lib/reception/offline-action";
import { LIVE_KEY, patchTicket, useLiveQueue } from "@/lib/reception/use-live-queue";
import { PAYMENT, PRIORITY, SOURCE, STATUS, STEPS } from "./meta";
import { useSync } from "@/lib/offline/sync-provider";
import { collectCashOffline, consultationPrice } from "@/lib/reception/offline-payment";
import { MoneyInput } from "./common";

const ACTIVE = new Set(["waiting", "arrived", "called", "in_room", "completed", "skipped", "no_show", "awaiting_results"]);

/** شارة العرض من السيرفر: بانتظار المختبر/الأشعة، جاهز للعودة، عائد بالنتائج، حاضر — بانتظار الدفع. */
function DisplayBadge({ t }: { t: QueueItem }) {
  if (!t.display_state || !t.display_state_ar) return null;
  const cls = t.display_state === "ready_to_return" ? "bg-success-soft text-success-strong"
    : t.display_state === "awaiting_payment" ? "bg-danger-soft text-danger-strong" : "bg-info-soft text-info-strong";
  const icon = t.display_state === "ready_to_return" ? "circle-check" : t.display_state === "awaiting_payment" ? "circle-dollar-sign" : t.display_state === "returning" ? "undo-2" : "flask-conical";
  return <span className={`inline-flex items-center gap-1 rounded-full px-2 py-[2px] text-[11px] font-semibold ${cls}`}><Icon name={icon} size={12} />{t.display_state_ar}</span>;
}

export function QueueScreen() {
  const user = useAuth((s) => s.user)!;
  const q = useLiveQueue();
  const sessions = q.data ?? [];
  const [docId, setDocId] = useState<string | null>(null);
  const session = sessions.find((s) => s.doctor_id === docId) ?? sessions[0];

  if (q.isPending) return <Spinner label="جارٍ تحميل الطابور…" />;
  if (q.isError) return <Alert tone="danger">{errorMessage(q.error)} <button className="font-bold underline" onClick={() => q.refetch()}>إعادة المحاولة</button></Alert>;
  if (!sessions.length) return <Card><Empty image="complex" title="لا توجد وجبات اليوم لعياداتك" hint="تظهر هنا وجبات أطباء العيادات المسندة إليك عند وجود دوام اليوم." /></Card>;

  return (
    <>
      <DoctorCards sessions={sessions} selected={session.doctor_id} onSelect={setDocId} />
      <SessionStats session={session} />
      <DayControls session={session} />
      <PolicyBar session={session} role={user.role} />
      <FastForward session={session} />
      <QueueBoard key={session.session_id} session={session} canCall={canCall(session, user.role)} />
    </>
  );
}

function canCall(s: QueueSession, role: string) {
  if (role === "admin" || role === "branch_manager") return true;
  return (s.call_policy?.call_next_by ?? "both") !== "doctor";
}

// ---------------------------------------------------------------------------------------------

function DoctorCards({ sessions, selected, onSelect }: { sessions: QueueSession[]; selected: string; onSelect: (id: string) => void }) {
  const { data } = useQuery({ queryKey: ["doctors"], queryFn: () => doctorsApi.list(), staleTime: 10 * 60_000 });
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {sessions.map((s, i) => {
        const on = s.doctor_id === selected;
        const d = data?.items.find((x) => x.doctor_id === s.doctor_id);
        const count = s.items.filter((t) => t.status !== "cancelled").length;
        const open = s.session_status === "open";
        return (
          <button key={s.session_id} onClick={() => onSelect(s.doctor_id)} aria-pressed={on}
            className={`flex items-center gap-3.5 rounded-card border-[1.5px] p-3 text-start ${on ? "border-primary bg-primary-soft" : "border-line bg-surface hover:border-line-strong"}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <DoctorPhoto src={d?.photo_url} name={s.doctor_name} textClass="text-2xl" className="size-[72px] shrink-0 rounded-2xl" />
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="truncate text-base font-bold">{s.doctor_name}</span>
              <span className="flex items-center gap-1.5 text-[13px] text-ink-2"><Icon name="stethoscope" size={14} className="text-primary" />{d?.specialty ? `${d.specialty} · ` : ""}{s.clinic_name}</span>
              <span className="sub-sm flex items-center gap-1.5"><Icon name="calendar-clock" size={13} /><span className="num">{fmtTimeRange(s.start, s.end)}</span></span>
            </div>
            <div className="flex flex-col items-end gap-1.5">
              <span className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${open ? "bg-success-soft text-success-strong" : "bg-warn-soft text-warn-strong"}`}>
                <Icon name={open ? "door-open" : "users"} size={13} />{open ? "الوجبة مفتوحة" : s.session_status === "full" ? "ممتلئة" : s.session_status}
              </span>
              <span className="flex items-center gap-1.5 text-xs text-ink-2"><Icon name="users" size={13} /><span className="num font-semibold">{count}</span></span>
            </div>
          </button>
        );
      })}
    </div>
  );
}

function SessionStats({ session }: { session: QueueSession }) {
  const today = todayBaghdad();
  const { data } = useQuery({ queryKey: ["doctor-sessions", session.doctor_id, today], queryFn: () => doctorsApi.sessions(session.doctor_id, today, today), staleTime: 5 * 60_000 });
  const cap = data?.items.find((x) => x.session_id === session.session_id);
  const live = session.items.filter((t) => t.status !== "cancelled");
  const online = live.filter((t) => t.source === "online").length;
  const walk = live.filter((t) => t.source !== "online").length;
  const Stat = ({ icon, label, value }: { icon: string; label: string; value: string }) => (
    <div className="flex items-center gap-1.5 whitespace-nowrap rounded-xl border border-line bg-surface px-3 py-2 text-[13px] text-ink-2">
      <Icon name={icon} size={16} className="text-primary" />{label} <span className="num font-semibold text-ink">{value}</span>
    </div>
  );
  return (
    <div className="flex flex-wrap gap-2.5">
      <Stat icon="users" label="السعة" value={cap ? `${live.length} / ${cap.capacity_total}` : fmtNum(live.length)} />
      <Stat icon="globe" label="أونلاين" value={cap ? `${online} / ${cap.online_quota}` : fmtNum(online)} />
      <Stat icon="footprints" label="حضوري وهاتفي" value={cap ? `${walk} / ${cap.capacity_total - cap.online_quota}` : fmtNum(walk)} />
      <Stat icon="timer" label="متوسط المعاينة" value={session.avg_consult_minutes_today == null ? "—" : `${session.avg_consult_minutes_today} د`} />
      {!!session.delay_minutes && session.delay_minutes > 0 && (
        <div className="flex items-center gap-1.5 whitespace-nowrap rounded-xl bg-warn-soft px-3 py-2 text-[13px] text-warn-strong"><Icon name="clock" size={16} />تأخير <span className="num font-semibold">+{session.delay_minutes}</span> د</div>
      )}
    </div>
  );
}

/** يوم العيادة المرن (المرحلة 2أ): «الطبيب وصل»، «تمديد اليوم»، «إغلاق/فتح التسجيل». الجدول الأسبوعي والحجوزات لا تتغير. */
function DayControls({ session }: { session: QueueSession }) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const [extendOpen, setExtendOpen] = useState(false);
  const [end, setEnd] = useState(session.end);
  const [delayOpen, setDelayOpen] = useState(false);
  const [delayMin, setDelayMin] = useState("30");
  const [delayReason, setDelayReason] = useState("");
  const delay = session.doctor_delay_minutes ?? 0;
  const isToday = session.date === todayBaghdad();
  async function run(k: string, label: string, f: () => Promise<unknown>) {
    setBusy(k);
    try { await f(); toast.success(label); void qc.invalidateQueries({ queryKey: LIVE_KEY }); }
    catch (e) { toast.error(errorMessage(e)); } finally { setBusy(null); }
  }
  const Btn = ({ k, icon, label, onClick, tone = "o" }: { k: string; icon: string; label: string; onClick: () => void; tone?: "o" | "w" }) => (
    <button disabled={!!busy} onClick={onClick}
      className={`flex h-[38px] items-center gap-1.5 rounded-full px-3.5 text-[13px] font-semibold disabled:opacity-50 ${tone === "w" ? "bg-warn-soft text-warn-strong" : "border border-line-strong bg-surface text-ink hover:bg-bg"}`}>
      <Icon name={busy === k ? "loader-circle" : icon} size={16} className={busy === k ? "animate-spin" : ""} />{label}
    </button>
  );
  return (
    <div className="flex flex-wrap items-center gap-2.5 rounded-2xl border border-line bg-surface px-4 py-2.5 text-[13px] text-ink-2">
      <Icon name="calendar-clock" size={17} className="text-primary" />
      <span className="font-semibold text-ink">الدوام</span>
      <span className="num">{fmtTimeRange(session.start, session.end)}</span>
      {session.extended && <span className="rounded-full bg-info-soft px-2.5 py-1 font-semibold text-info-strong">ممدّد · الجدول <span className="num">{session.scheduled_end}</span></span>}
      {session.doctor_arrived_at
        ? <span className="flex items-center gap-1 rounded-full bg-success-soft px-2.5 py-1 font-semibold text-success-strong"><Icon name="user-check" size={14} />وصل الطبيب <span className="num">{fmtTime(session.doctor_arrived_at)}</span></span>
        : <Btn k="arrived" icon="user-check" label="الطبيب وصل" onClick={() => run("arrived", "سُجّل وصول الطبيب وأُعيد حساب الأوقات", () => queueApi.doctorArrived(session.session_id))} />}
      {!session.doctor_arrived_at && delay > 0 && <span className="flex items-center gap-1 rounded-full bg-warn-soft px-2.5 py-1 font-semibold text-warn-strong"><Icon name="timer" size={14} />تأخر الطبيب <span className="num">{delay}</span> دقيقة</span>}
      {!session.doctor_arrived_at && isToday && <Btn k="delay" icon="timer" label={delay > 0 ? "تعديل التأخير" : "تأخر الطبيب"} onClick={() => { setDelayMin(String(delay || 30)); setDelayReason(session.doctor_delay_reason ?? ""); setDelayOpen(true); }} />}
      <Btn k="extend" icon="clock" label="تمديد اليوم" onClick={() => { setEnd(session.end); setExtendOpen(true); }} />
      {session.registration_closed
        ? <Btn k="reg" icon="lock-open" tone="w" label="التسجيل مغلق · فتحه" onClick={() => run("reg", "فُتح التسجيل", () => queueApi.registration(session.session_id, false))} />
        : <Btn k="reg" icon="lock" label="إغلاق التسجيل" onClick={() => run("reg", "أُغلق التسجيل للمراجعين بدون حجز", () => queueApi.registration(session.session_id, true))} />}
      {session.allow_extra === false && <span className="rounded-full bg-danger-soft px-2.5 py-1 font-semibold text-danger-strong">ممنوع الإضافي</span>}
      <Modal open={extendOpen} onClose={() => setExtendOpen(false)} title="تمديد اليوم" icon="clock">
        <span className="text-sm leading-7 text-ink-2">نهاية جديدة لهذه الوجبة فقط. الجدول الأسبوعي والحجوزات لا تتغير، ويُعاد فتح التسجيل.</span>
        <TimeField label="النهاية الجديدة" value={end} onChange={setEnd} />
        <Button loading={busy === "extend"} disabled={!end} icon="check" onClick={() => run("extend", `مُدّد الدوام حتى ${stripBidi(fmtTime(end))}`, async () => { await queueApi.extend(session.session_id, end); setExtendOpen(false); })}>تمديد</Button>
      </Modal>
      <Modal open={delayOpen} onClose={() => setDelayOpen(false)} title="تأخر الطبيب" icon="timer">
        <span className="text-sm leading-7 text-ink-2">يصل كل محجوز لم يدخل بعد إشعار بالتأخير وبموعده التقريبي الجديد. يُلغى التأخير تلقائياً عند تسجيل «الطبيب وصل».</span>
        <Field label="مدة التأخير (دقيقة)" inputMode="numeric" ltr value={delayMin} onChange={(e) => setDelayMin(e.target.value.replace(/\D/g, "").slice(0, 3))} />
        <Field label="السبب (اختياري، يظهر للمراجع)" value={delayReason} maxLength={200} onChange={(e) => setDelayReason(e.target.value)} />
        <div className="flex gap-2">
          <Button className="flex-1" loading={busy === "delay"} disabled={!delayMin || Number(delayMin) < 1 || Number(delayMin) > 240} icon="bell-ring"
            onClick={() => run("delay", `أُعلن تأخر ${delayMin} دقيقة وأُخطر المحجوزون`, async () => { await queueApi.delay(session.session_id, Number(delayMin), delayReason.trim()); setDelayOpen(false); })}>إعلان التأخير</Button>
          {delay > 0 && <Button variant="ghost" loading={busy === "delay0"} icon="x" onClick={() => run("delay0", "أُلغي التأخير وأُخطر المحجوزون", async () => { await queueApi.delay(session.session_id, 0); setDelayOpen(false); })}>إلغاء التأخير</Button>}
        </div>
      </Modal>
    </div>
  );
}

function PolicyBar({ session, role }: { session: QueueSession; role: string }) {
  const p = session.call_policy ?? { call_next_by: "both" as const, auto_call_next: false };
  const label = { both: "الطبيب والاستقبال", doctor: "الطبيب فقط", reception: "الاستقبال فقط" }[p.call_next_by];
  const icon = { both: "users", doctor: "stethoscope", reception: "concierge-bell" }[p.call_next_by];
  return (
    <div className="flex flex-wrap items-center gap-2.5 rounded-2xl border border-line bg-surface px-4 py-2.5 text-[13px] text-ink-2">
      <Icon name="megaphone" size={17} className="text-primary" /><span className="font-semibold text-ink">من يستدعي المرضى:</span>
      <span className="flex items-center gap-1.5 rounded-full bg-primary-soft px-2.5 py-1 font-semibold text-primary-strong"><Icon name={icon} size={14} />{label}</span>
      <span className="flex items-center gap-1.5 rounded-full bg-bg px-2.5 py-1"><Icon name={p.auto_call_next ? "zap" : "zap-off"} size={14} />استدعاء تلقائي بعد الإنهاء: {p.auto_call_next ? "مفعّل" : "مطفأ"}</span>
      {!canCall(session, role) && <span className="ms-auto flex items-center gap-1.5 font-semibold text-warn-strong"><Icon name="stethoscope" size={14} />الطبيب يستدعي من شاشته · أزرار الاستدعاء مخفية هنا</span>}
    </div>
  );
}

/** التقديم الذكي (العقد 7): فجوة بعد تخطٍّ، أو دعوة حضور مبكر. */
function FastForward({ session }: { session: QueueSession }) {
  const [mode, setMode] = useState<"gap" | "invite">("gap");
  const [gap, setGap] = useState(20); const [max, setMax] = useState(5);
  const [from, setFrom] = useState(""); const [maxInv, setMaxInv] = useState(30); const [exp, setExp] = useState(30);
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState<string | null>(null);
  const invite = mode === "invite";
  async function send() {
    setBusy(true);
    try {
      const r = invite
        ? await queueApi.fastForward(session.session_id, { mode: "invite", ...(from ? { from_time: `${session.date}T${from}:00+03:00` } : {}), max_recipients: maxInv, expires_minutes: exp })
        : await queueApi.fastForward(session.session_id, { gap_minutes: gap, max_recipients: max });
      setLast(`أُرسل إلى ${r.sent_to} · ينتهي ${fmtTime(r.expires_at)}`);
      toast.success(r.sent_to ? `أُرسل العرض إلى ${r.sent_to} مريض` : "لا يوجد مرضى مؤهلون (لهم حساب في التطبيق ولم يصلوا)");
    } catch (e) { toast.error(isApiError(e) && e.code === "OFFER_ACTIVE" ? "يوجد عرض فعال لهذه الوجبة. انتظر انتهاءه." : errorMessage(e)); }
    finally { setBusy(false); }
  }
  const Num = ({ icon, label, value, set, min, maxV, suffix }: { icon: string; label: string; value: number; set: (n: number) => void; min: number; maxV: number; suffix?: string }) => (
    <label className="flex h-9 items-center gap-1.5 rounded-xl border border-line-strong bg-surface px-3 text-[13px]">
      <Icon name={icon} size={14} className="text-primary" />{label}
      <input type="number" min={min} max={maxV} value={value} onChange={(e) => set(Math.max(min, Math.min(maxV, Number(e.target.value) || min)))} className="num w-12 bg-transparent font-bold outline-none" />{suffix}
    </label>
  );
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-primary/30 bg-primary-soft px-4 py-3.5">
      <div className="flex flex-wrap items-center gap-3.5">
        <span className="grid size-10 place-items-center rounded-xl bg-primary text-on-accent"><Icon name="fast-forward" size={20} /></span>
        <div className="flex min-w-[220px] flex-1 flex-col">
          <span className="text-[15px] font-semibold">{invite ? "دعوة الحضور المبكر" : "التقديم الذكي عند وجود فجوة"}</span>
          <span className="text-[13px] text-ink-2">{invite ? "تصل لمن مواعيدهم من الوقت المحدد فما بعد ولم يصلوا ولهم حساب. الترتيب لا يتغير." : "أرسل عرض الحضور المبكر للمرضى اللاحقين. أول من يقبل يأخذ الفجوة."}</span>
        </div>
        <Segmented size="sm" value={mode} onChange={setMode} options={[{ value: "gap", label: "فجوة" }, { value: "invite", label: "دعوة مبكرة" }]} />
        <Button size="md" icon="send" loading={busy} onClick={send}>{invite ? "إرسال الدعوة" : "إرسال العرض"}</Button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {invite ? (
          <>
            <span className="flex items-center gap-1.5 text-[13px]">لمواعيد من<TimeField size="sm" aria-label="لمواعيد من" value={from} onChange={setFrom} /></span>
            <Num icon="users" label="حتى" value={maxInv} set={setMaxInv} min={1} maxV={30} suffix="مريضاً" />
            <Num icon="timer" label="صلاحية الدعوة" value={exp} set={setExp} min={5} maxV={120} suffix="د" />
          </>
        ) : (
          <>
            <Num icon="timer" label="الفجوة" value={gap} set={setGap} min={5} maxV={120} suffix="د" />
            <Num icon="users" label="عدد المرضى" value={max} set={setMax} min={1} maxV={30} />
          </>
        )}
        {last && <span className="ms-auto flex items-center gap-1.5 text-[13px] font-semibold text-success-strong"><Icon name="circle-check" size={15} />آخر إرسال: {last}</span>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------

function QueueBoard({ session, canCall }: { session: QueueSession; canCall: boolean }) {
  const items = useMemo(() => session.items.filter((i) => ACTIVE.has(i.status)), [session.items]);
  const [selId, setSelId] = useState<string | null>(null);
  const sel = items.find((i) => i.ticket_id === selId) ?? items[0];
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);

  async function callNext() {
    setBusy(true);
    try { const r = await queueApi.callNext(session.doctor_id); toast.success(`استُدعي ${r.ticket_number ?? ""}`); void qc.invalidateQueries({ queryKey: LIVE_KEY }); }
    catch (e) { toast.error(isApiError(e) && e.code === "QUEUE_EMPTY" ? "لا يوجد مريض واصل ومدفوع للاستدعاء" : errorMessage(e)); }
    finally { setBusy(false); }
  }

  return (
    <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
      <DataGrid<QueueItem> aria-label="الطابور الحي" rows={items} rowKey={(t) => t.ticket_id} minWidth={640} pageSize={0} dense
        title={<span className="text-[17px]">الطابور الحي</span>}
        search={items.length > 8 ? { placeholder: "ابحث بالاسم أو رقم التذكرة", text: (t) => `${t.ticket_number} ${t.patient_name}` } : undefined}
        actions={<>
          <span className="flex items-center gap-1.5 text-[13px] text-success-strong"><Icon name="radio" size={16} />مباشر</span>
          {canCall && <Button size="md" variant="ghost" icon="megaphone" loading={busy} onClick={callNext} className="!h-[38px] border-[1.5px] !border-primary !text-primary-strong">استدعاء التالي</Button>}
          <Link href="/staff/reception/checkin" className="flex h-[38px] items-center gap-1.5 rounded-control bg-primary px-3.5 text-sm font-semibold text-on-accent hover:bg-primary-strong hover:text-on-accent"><Icon name="user-plus" size={16} />حضور جديد</Link>
        </>}
        onRowClick={(t) => setSelId(t.ticket_id)} selectedKey={sel?.ticket_id ?? null}
        rowClassName={(t) => (t.priority === "emergency" && t.ticket_id !== sel?.ticket_id ? "!bg-danger-soft/40" : "")}
        empty={{ icon: "list-ordered", title: "الطابور فارغ", hint: "لا حجوزات ولا حضور بعد لهذه الوجبة." }}
        columns={QUEUE_COLUMNS} />
      {sel && <TicketPanel t={sel} session={session} canCall={canCall} />}
    </div>
  );
}

/** ساعة تتحدث كل 10 ثوانٍ: تقلب «بانتظار رده» إلى «لم يرد» عند انتهاء المهلة دون انتظار تحديث من الخادم. */
function useNowTick(active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { if (!active) return; const id = setInterval(() => setNow(Date.now()), 10_000); return () => clearInterval(id); }, [active]);
  return now;
}

function Tag({ t }: { t: QueueItem }) {
  const pending = t.status === "called" && !t.call_acknowledged_at && !!t.call_ack_deadline;
  const now = useNowTick(pending);
  if (t.status === "called" && t.call_acknowledged_at) return <span className="flex items-center gap-1 text-[11px] font-semibold text-success-strong"><Icon name="footprints" size={12} />أكّد أنه قادم · <span className="num">{fmtTime(t.call_acknowledged_at)}</span></span>;
  if (pending) return now >= new Date(t.call_ack_deadline!).getTime() || t.call_ack_status === "no_response"
    ? <span className="flex items-center gap-1 text-[11px] font-semibold text-danger-strong"><Icon name="bell" size={12} />لم يرد</span>
    : <span className="flex items-center gap-1 text-[11px] font-semibold text-warn-strong"><Icon name="bell-ring" size={12} />نُبّه في التطبيق · بانتظار رده</span>;
  if (t.on_the_way_at) return <span className="flex items-center gap-1 text-[11px] font-semibold text-info-strong"><Icon name="car" size={12} />في الطريق{t.on_the_way_eta_minutes ? <> · <span className="num">{t.on_the_way_eta_minutes}</span> د</> : null}</span>;
  if (t._pending) return <span className="flex items-center gap-1 text-[11px] font-semibold text-warn-strong"><Icon name="refresh-cw" size={12} />بانتظار المزامنة</span>;
  return null;
}

/** أعمدة جدول الطابور (DataGrid). */
const QUEUE_COLUMNS: Column<QueueItem>[] = [
  { key: "ticket_number", header: "التذكرة", width: "84px", cell: (t) => <span className={`num font-bold ${t.priority === "emergency" ? "text-danger-strong" : "text-primary-strong"}`}>{t.ticket_number}</span> },
  { key: "patient_name", header: "المريض", cell: (t) => { const pr = PRIORITY[t.priority] ?? PRIORITY.normal; return (
    <span className="flex min-w-0 flex-col"><span className="truncate font-semibold">{t.patient_name}</span><span className={`flex items-center gap-1 text-xs ${pr.cls}`}><Icon name={pr.icon} size={13} />{pr.label}{t.is_extra && <span className="ms-1 rounded bg-warn-soft px-1.5 text-[11px] font-semibold text-warn-strong">إضافي</span>}</span></span>); } },
  { key: "source", header: "المصدر", width: "100px", cell: (t) => { const src = SOURCE[t.source]; return <span className="flex items-center gap-1.5 text-[13px] text-ink-2"><Icon name={src.icon} size={15} />{src.label}</span>; } },
  { key: "status", header: "الحالة", width: "150px", cell: (t) => { const s = STATUS[t.status]; return (
    <span className="flex flex-col items-start gap-[3px]"><span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${s.cls}`}><Icon name={s.icon} size={13} />{s.label}</span><DisplayBadge t={t} /><Tag t={t} /></span>); } },
  { key: "payment_status", header: "الدفع", width: "100px", cell: (t) => { const p = PAYMENT[t.payment_status] ?? PAYMENT.not_billed; return <span className={`rounded-chip px-2 py-[3px] text-xs ${p.cls}`}>{p.label}</span>; } },
  { key: "estimated_time", header: "الوقت", width: "92px", numeric: true, cell: (t) => <span className="text-[13px] text-ink-2">{t.status === "skipped" || t.status === "no_show" ? "—" : fmtTime(t.estimated_time)}</span> },
];

function TicketPanel({ t, session, canCall }: { t: QueueItem; session: QueueSession; canCall: boolean }) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const [dlg, setDlg] = useState<"emergency" | "final" | null>(null);
  const canCollect = useAuth((s) => s.can("payments.collect"));
  const [offlinePay, setOfflinePay] = useState(false);
  const { online } = useSync();
  const s = STATUS[t.status], p = PAYMENT[t.payment_status] ?? PAYMENT.not_billed, src = SOURCE[t.source];
  const ix = Math.max(0, STEPS.findIndex((x) => x.key === t.status));
  const em = t.priority === "emergency";
  const unpaid = t.payment_status === "unpaid" && !["completed", "no_show", "cancelled"].includes(t.status);

  async function act(key: string, label: string, online: () => Promise<unknown>, offline: { type: Parameters<typeof onlineOrQueue>[1]["type"]; payload: Record<string, unknown> } | null, optimistic?: Partial<QueueItem>) {
    setBusy(key);
    try {
      if (offline) {
        const r = await onlineOrQueue(online, { ...offline, label: `${label} · ${t.ticket_number}` });
        if (r.mode === "offline") { if (optimistic) patchTicket(qc, t.ticket_id, { ...optimistic, _pending: true }); toast.warn(`حُفظ أوفلاين: ${label}`); return; }
      } else await online();
      if (optimistic) patchTicket(qc, t.ticket_id, optimistic);
      toast.success(`${label} · ${t.ticket_number}`);
      void qc.invalidateQueries({ queryKey: LIVE_KEY });
    } catch (e) {
      if (isApiError(e) && e.code === "INVOICE_UNPAID") toast.error("الكشفية غير مدفوعة · لا يدخل الغرفة قبل الدفع");
      else if (isApiError(e) && e.code === "CALL_NOT_ALLOWED_FOR_ROLE") toast.error("سياسة الفرع لا تسمح للاستقبال بالاستدعاء");
      else toast.error(errorMessage(e));
      throw e;
    } finally { setBusy(null); }
  }
  const safe = (f: () => Promise<unknown>) => () => { f().catch(() => {}); };

  const A = ({ k, label, icon, kind = "o", disabled, onClick }: { k: string; label: string; icon: string; kind?: "p" | "o" | "d"; disabled?: boolean; onClick: () => void }) => (
    <button disabled={disabled || !!busy} onClick={onClick}
      className={`flex h-[46px] items-center justify-center gap-2 rounded-xl text-sm font-semibold disabled:opacity-40 ${kind === "p" ? "bg-primary text-on-accent hover:bg-primary-strong" : kind === "d" ? "bg-danger-soft text-danger-strong hover:bg-danger hover:text-on-accent" : "border border-line-strong bg-surface text-ink hover:bg-bg"}`}>
      <Icon name={busy === k ? "loader-circle" : icon} size={18} className={busy === k ? "animate-spin" : ""} />{label}
    </button>
  );
  const st = t.status;
  const open = !["completed", "no_show", "cancelled", "awaiting_results"].includes(st);

  return (
    <Card className="sticky top-24 flex flex-col gap-4 p-5">
      <div className="flex items-center gap-3.5">
        <span className={`num grid size-[68px] place-items-center rounded-2xl text-[17px] font-bold text-on-accent ${em ? "bg-danger" : "bg-primary"}`}>{t.ticket_number}</span>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate text-lg font-bold">{t.patient_name}</span>
          <span className="sub">{t.file_number ? <><span className="num">{t.file_number}</span> · </> : null}{src.label}</span>
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${s.cls}`}><Icon name={s.icon} size={13} />{s.label}</span>
        <span className={`rounded-chip px-2.5 py-1 text-xs ${p.cls}`}>{p.label}</span>
        <DisplayBadge t={t} />
        <span className="inline-flex items-center gap-1.5 rounded-full bg-bg px-2.5 py-1 text-xs text-ink-2"><Icon name="clock" size={13} />الدخول <span className="num">{fmtTime(t.estimated_time)}</span></span>
      </div>
      <ol className="flex items-start" aria-label="مراحل التذكرة">
        {STEPS.map((x, i) => (
          <li key={x.key} className="relative flex flex-1 flex-col items-center gap-1.5">
            {i > 0 && <span className={`absolute end-1/2 top-[15px] h-[3px] w-full ${i <= ix ? "bg-primary" : "bg-line"}`} />}
            <span className={`relative grid size-8 place-items-center rounded-full border-2 ${i < ix ? "border-primary bg-primary text-on-accent" : i === ix ? "border-primary bg-surface text-primary" : "border-line-strong bg-surface text-ink-muted"}`}><Icon name={x.icon} size={15} /></span>
            <span className={`text-[11px] ${i <= ix ? "text-ink" : "text-ink-muted"} ${i === ix ? "font-bold" : ""}`}>{x.label}</span>
          </li>
        ))}
      </ol>
      {unpaid && (
        <div className="flex items-center gap-2.5 rounded-xl bg-danger-soft p-3 text-[13px] text-danger-strong">
          <Icon name="circle-dollar-sign" size={18} /><span className="flex-1">الكشفية غير مدفوعة · لا يدخل الغرفة قبل الدفع</span>
          {!canCollect ? null : online
            ? <Link href={`/staff/reception/collect?patient_id=${t.patient_id}`} className="flex h-8 items-center rounded-full bg-danger px-3 text-[13px] font-semibold text-on-accent hover:text-white">تحصيل</Link>
            : <button onClick={() => setOfflinePay(true)} className="flex h-8 items-center gap-1 rounded-full bg-danger px-3 text-[13px] font-semibold text-on-accent"><Icon name="cloud-off" size={14} />تحصيل نقدي أوفلاين</button>}
        </div>
      )}
      {offlinePay && <OfflineCollect t={t} session={session} onClose={() => setOfflinePay(false)} />}
      <div className="grid grid-cols-2 gap-2">
        {st === "awaiting_results" && <>
          <A k="returned" kind="p" icon="undo-2" label="عاد بالنتائج"
            onClick={safe(() => act("returned", "عاد بالنتائج", () => queueApi.returned(t.ticket_id), null, { status: "arrived", priority: "returning" }))} />
          <A k="returned-ext" icon="file-up" label="عاد بنتيجة خارجية"
            onClick={safe(() => act("returned-ext", "عاد بنتيجة خارجية", () => queueApi.returned(t.ticket_id, true), null, { status: "arrived", priority: "returning" }))} />
          <div className="col-span-2"><ExternalResultUpload ticketId={t.ticket_id} /></div>
        </>}
        {canCall && <A k="call" kind="p" icon="megaphone" label={st === "called" ? "إعادة استدعاء" : "استدعاء"} disabled={!["arrived", "called"].includes(st) && !em}
          onClick={safe(() => act("call", "استدعاء", () => queueApi.call(t.ticket_id), { type: "queue.call", payload: { ticket_id: t.ticket_id } }, { status: "called" }))} />}
        {canCall && <A k="complete" icon="skip-forward" label="إنهاء واستدعاء التالي" disabled={!["called", "in_room"].includes(st)}
          onClick={safe(() => act("complete", "إنهاء", () => queueApi.complete(t.ticket_id, true), { type: "queue.complete", payload: { ticket_id: t.ticket_id, call_next: true } }, { status: "completed" }))} />}
        <A k="print" icon="printer" label="طباعة التذكرة" disabled={st === "waiting"}
          onClick={safe(() => act("print", "طُبعت التذكرة", () => hardwareAgent.printTicket({ ticket_number: t.ticket_number, doctor_name: session.doctor_name, estimated_time: t.estimated_time ? fmtTime(t.estimated_time) : undefined }), null))} />
        <A k="skip" icon="skip-forward" label="تخطي مؤقت" disabled={!["waiting", "arrived", "called"].includes(st)}
          onClick={safe(() => act("skip", "تخطي مؤقت", () => queueApi.noShow(t.ticket_id, "skip"), { type: "queue.no_show", payload: { ticket_id: t.ticket_id, mode: "skip" } }, { status: "skipped" }))} />
        <A k="late" icon="alarm-clock" label="وصل متأخراً" disabled={!["skipped", "waiting"].includes(st)}
          onClick={safe(() => act("late", "أُعيد إدراجه", () => queueApi.lateArrival(t.ticket_id), { type: "queue.late_arrival", payload: { ticket_id: t.ticket_id } }, { status: "arrived", priority: "late_reinserted" }))} />
        <A k="final" icon="user-x" label="غياب نهائي" disabled={!open || st === "in_room"} onClick={() => setDlg("final")} />
        <A k="emergency" kind="d" icon="siren" label="طوارئ" disabled={!open || st === "in_room" || em} onClick={() => setDlg("emergency")} />
      </div>
      <ReasonDialog open={dlg === "emergency"} title={`طوارئ · ${t.ticket_number}`} icon="siren" label="سبب الطوارئ (يُسجل في التدقيق)" confirmText="نقل لأول الطابور" danger
        onClose={() => setDlg(null)}
        onConfirm={(reason) => act("emergency", "طوارئ", () => queueApi.emergency(t.ticket_id, reason), { type: "queue.emergency", payload: { ticket_id: t.ticket_id, reason } }, { priority: "emergency" }).then(() => {})} />
      <ReasonDialog open={dlg === "final"} title={`غياب نهائي · ${t.ticket_number}`} icon="user-x" requireReason={false} confirmText="تسجيل الغياب" danger
        note={<Alert tone="warn">يُحتسب غياباً في سجل المريض وقد يؤدي إلى حظره، وتُلغى فاتورة الكشفية غير المدفوعة.</Alert>}
        onClose={() => setDlg(null)}
        onConfirm={async () => {
          await act("final", "غياب نهائي", async () => { const r = await queueApi.noShow(t.ticket_id, "final"); if (r.patient_banned) toast.warn(`${t.patient_name} حُظر لبلوغه حد الغياب`); return r; },
            { type: "queue.no_show", payload: { ticket_id: t.ticket_id, mode: "final" } }, { status: "no_show" });
        }} />
    </Card>
  );
}

/** تحصيل الكشفية نقداً أثناء انقطاع الاتصال: رقم من كتلة الجهاز، والدرج يفتح، والمطابقة عند المزامنة. */
function OfflineCollect({ t, session, onClose }: { t: QueueItem; session: QueueSession; onClose: () => void }) {
  const qc = useQueryClient();
  const [amount, setAmount] = useState(0);
  const [busy, setBusy] = useState(false);
  const price = useQuery({ queryKey: ["offline-price", session.clinic_id], queryFn: () => consultationPrice(session.clinic_id) });
  const value = amount || price.data || 0;
  return (
    <Modal open onClose={onClose} title={`تحصيل أوفلاين · ${t.ticket_number}`} icon="cloud-off">
      <Alert tone="warn" icon="cloud-off">لا يوجد اتصال. يُصدر إيصال برقم من كتلة هذا الجهاز ويُطبع، وتُطابق الدفعة تلقائياً عند عودة الاتصال.</Alert>
      <span className="text-sm">{t.patient_name} · كشفية {session.doctor_name}</span>
      <MoneyInput label="المبلغ نقداً" value={value} onChange={setAmount} autoFocus />
      <Button loading={busy} disabled={value <= 0} icon="banknote" onClick={async () => {
        setBusy(true);
        try {
          const r = await collectCashOffline({ ticketId: t.ticket_id, patientId: t.patient_id, patientName: t.patient_name, amount: value, label: `كشفية ${session.doctor_name}` });
          patchTicket(qc, t.ticket_id, { payment_status: "paid", _pending: true });
          if (r.printed) toast.success(`حُفظ التحصيل أوفلاين · إيصال ${r.number}`);
          else toast.warn(`حُفظ التحصيل (${r.number}) لكن الطباعة فشلت: اطبع نسخة عند عودة الطابعة`);
          onClose();
        } catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); }
      }}>تحصيل وطباعة</Button>
    </Modal>
  );
}
