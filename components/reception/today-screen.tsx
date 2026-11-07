"use client";
/** مراجعو اليوم (المواصفة 3.1 و3.4، العقد 7.y): جدول واحد لكل مواعيد اليوم بإجراءات سريعة واختصارات لوحة المفاتيح.
 *  التحديث مباشر من booking.changed وqueue.updated بلا ضغط تحديث. */
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { Icon } from "@/components/icon";
import { toast } from "@/components/toast";
import { Alert, Button, CellStack, DataGrid, DateField, ISelect, Modal, StatusBadge, type Column, type StatusMap } from "@/components/ui";
import { CancelDialog, RescheduleDialog } from "@/components/booking/policy-dialogs";
import { receptionTodayApi, type TodayRow, type TodayStatus } from "@/lib/api/booking";
import { errorMessage, isApiError } from "@/lib/api/errors";
import { queueApi, type CheckInResult } from "@/lib/api/reception";
import { staffApi } from "@/lib/api/staff";
import { hardwareAgent } from "@/lib/agent";
import { doctorsApi } from "@/lib/api/reception";
import { todayBaghdad } from "@/lib/date";
import { fmtDate, fmtIqd, fmtNum, fmtTime } from "@/lib/format";
import { uuidv7 } from "@/lib/id";
import { onlineOrQueue } from "@/lib/reception/offline-action";
import { useLive } from "@/lib/realtime/provider";
import { useDebounced } from "./common";
import { ReturnOrNewDialog, returnChoiceFrom, type ReturnChoice } from "./checkin-screen";

const ST: StatusMap = {
  booked: { tone: "info", label: "محجوز", icon: "calendar-clock" },
  arrived: { tone: "success", label: "حاضر", icon: "user-check" },
  in_room: { tone: "primary", label: "داخل المعاينة", icon: "stethoscope" },
  completed: { tone: "muted", label: "منتهٍ", icon: "circle-check" },
  cancelled: { tone: "danger", label: "ملغى", icon: "circle-x" },
  no_show: { tone: "warn", label: "لم يحضر", icon: "user-x" },
  waiting: { tone: "info", label: "انتظار الوصول", icon: "hourglass" },
  called: { tone: "primary", label: "تم الاستدعاء", icon: "megaphone" },
  skipped: { tone: "muted", label: "متخطى مؤقتاً", icon: "skip-forward" },
  awaiting_results: { tone: "info", label: "بانتظار قسم", icon: "flask-conical" },
};
const PAY: StatusMap = {
  paid: { tone: "success", label: "مدفوع", icon: "circle-check" },
  unpaid: { tone: "warn", label: "غير مدفوع", icon: "circle-dollar-sign" },
  partial: { tone: "info", label: "عربون", icon: "piggy-bank" },
  deferred: { tone: "lab", label: "آجل", icon: "hand-coins" },
  refunded: { tone: "muted", label: "مُرجع", icon: "undo-2" },
};
const SOURCE_AR: Record<string, string> = { online: "حجز من التطبيق", app: "حجز من التطبيق", phone: "حجز هاتفي", reception: "حجز من الاستقبال", walk_in: "حضور مباشر" };
const METHOD_AR: Record<string, string> = { reception: "الاستقبال", self_qr: "مسح رمز الشاشة من التطبيق" };
const TILES: { k: TodayStatus | ""; label: string; icon: string; tone: string }[] = [
  { k: "", label: "الكل", icon: "users", tone: "text-primary" }, { k: "booked", label: "محجوز", icon: "calendar-clock", tone: "text-info" }, { k: "arrived", label: "حاضر", icon: "user-check", tone: "text-success" },
  { k: "in_room", label: "داخل المعاينة", icon: "stethoscope", tone: "text-primary" }, { k: "completed", label: "منتهٍ", icon: "circle-check", tone: "text-ink-3" }, { k: "cancelled", label: "ملغى", icon: "circle-x", tone: "text-danger" }, { k: "no_show", label: "لم يحضر", icon: "user-x", tone: "text-warn" },
];
const KEY = ["reception", "today"] as const;
const typing = (el: EventTarget | null) => el instanceof HTMLElement && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName));

const Kbd = ({ children }: { children: React.ReactNode }) => <kbd className="num rounded-chip border border-line-strong bg-surface px-1.5 py-0.5 text-[11px] font-semibold" dir="ltr">{children}</kbd>;

export function TodayScreen() {
  const qc = useQueryClient();
  const { live } = useLive();
  const [date, setDate] = useState(todayBaghdad());
  const [text, setText] = useState("");
  const q = useDebounced(text, 250);
  const [doctor, setDoctor] = useState("");
  const [status, setStatus] = useState<TodayStatus | "">("");
  const [pay, setPay] = useState("");
  const [sel, setSel] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [choice, setChoice] = useState<{ row: TodayRow; c: ReturnChoice } | null>(null);
  const [cancel, setCancel] = useState<TodayRow | null>(null);
  const [resched, setResched] = useState<TodayRow | null>(null);
  const [noShow, setNoShow] = useState<TodayRow | null>(null);
  const search = useRef<HTMLInputElement>(null);
  const dialogOpen = !!(cancel || resched || noShow);

  const list = useQuery({
    queryKey: [...KEY, { date, doctor, status, pay, q }],
    queryFn: () => receptionTodayApi.list({ date, doctor_id: doctor || undefined, status: status || undefined, payment_status: pay || undefined, q: q || undefined, page_size: 100 }),
    placeholderData: keepPreviousData, refetchInterval: 60_000,
  });
  const docs = useQuery({ queryKey: ["doctors"], queryFn: () => doctorsApi.list(), staleTime: 600_000 });
  const rows = useMemo(() => list.data?.items ?? [], [list.data]);
  const selected = rows.find((r) => r.ticket_id === sel) ?? null;
  const refresh = useCallback(() => void qc.invalidateQueries({ queryKey: KEY }), [qc]);

  // تحديث مباشر: عدة أحداث تصل معاً لكل عملية، فنجمعها في طلب واحد
  useEffect(() => {
    if (!live) return;
    let t: ReturnType<typeof setTimeout>;
    const h = () => { clearTimeout(t); t = setTimeout(refresh, 150); };
    const offs = [live.on("booking.changed", h), live.on("queue.updated", h), live.onReconnected(h)];
    return () => { clearTimeout(t); offs.forEach((f) => f()); };
  }, [live, refresh]);

  const checkIn = useCallback(async (r: TodayRow, visitMode?: "return" | "new") => {
    if (!r.booking_id || busy) return;
    setBusy(r.ticket_id);
    setChoice(null);
    const body = { ticket_id: uuidv7(), booking_id: r.booking_id, visit_kind: "auto" as const, visit_mode: visitMode };
    try {
      const res = await onlineOrQueue<CheckInResult>(() => queueApi.checkIn(body), { type: "queue.check_in", payload: { ...body }, label: `حضور ${r.patient_name}` });
      if (res.mode === "offline") { toast.warn("حُفظ الحضور أوفلاين ويُرسل عند عودة الاتصال"); return; }
      toast.success(`ثُبّت الحضور · ${res.data.ticket_number}${res.data.amount_due > 0 ? ` · المستحق ${fmtIqd(res.data.amount_due)}` : ""}`);
      hardwareAgent.printTicket({ ticket_number: res.data.ticket_number, doctor_name: r.doctor_name, estimated_time: res.data.estimated_time ? fmtTime(res.data.estimated_time) : undefined }).catch((e) => toast.error(errorMessage(e)));
      refresh();
    } catch (e) {
      // التدقيق 1.2: المحجوز ينتظر نتائج الطبيب نفسه أو له عودة مجانية → نفس حوار «حضور وتسجيل»
      const c = returnChoiceFrom(e, { booking_id: r.booking_id }, r.patient_name);
      if (c) { setChoice({ row: r, c }); return; }
      toast.error(isApiError(e) && e.code === "PATIENT_BANNED" ? "المريض محظور. فك الحظر من شاشة «فك الحظر» أولاً." : errorMessage(e));
    } finally { setBusy(null); }
  }, [busy, refresh]);

  async function lateArrival(r: TodayRow) {
    setBusy(r.ticket_id);
    try { await queueApi.lateArrival(r.ticket_id); toast.success("أُعيد للطابور"); refresh(); }
    catch (e) { toast.error(errorMessage(e)); } finally { setBusy(null); }
  }

  // الاختصارات: / بحث، ↑↓ تنقل، Enter تثبيت الحضور، Esc إلغاء التحديد
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (dialogOpen || e.ctrlKey || e.metaKey || e.altKey) return;
      if (typing(e.target)) {
        if (e.key === "Escape" && e.target === search.current) { setText(""); search.current?.blur(); }
        else if (e.key === "ArrowDown" && e.target === search.current && rows[0]) { e.preventDefault(); search.current?.blur(); setSel(rows[0].ticket_id); }
        else if (e.key === "Enter" && e.target === search.current && rows.length === 1) { e.preventDefault(); setSel(rows[0].ticket_id); if (rows[0].actions.includes("check_in")) void checkIn(rows[0]); }
        return;
      }
      // Slash بالرمز حتى يعمل الاختصار مع لوحة المفاتيح العربية أيضاً
      if (e.key === "/" || e.code === "Slash") { e.preventDefault(); search.current?.focus(); search.current?.select(); return; }
      if (e.key === "Escape") { setSel(null); return; }
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        if (!rows.length) return;
        e.preventDefault();
        const i = rows.findIndex((r) => r.ticket_id === sel);
        const n = i < 0 ? 0 : Math.min(rows.length - 1, Math.max(0, i + (e.key === "ArrowDown" ? 1 : -1)));
        setSel(rows[n].ticket_id);
        return;
      }
      if (e.key === "Enter" && selected?.actions.includes("check_in") && !(e.target instanceof HTMLButtonElement) && !(e.target instanceof HTMLAnchorElement)) { e.preventDefault(); void checkIn(selected); }
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [rows, sel, selected, dialogOpen, checkIn]);

  const iconBtn = "grid size-8 shrink-0 place-items-center rounded-full text-ink-2 hover:bg-primary-soft disabled:opacity-40";
  const columns: Column<TodayRow>[] = [
    { key: "ticket_number", header: "الرقم", width: "70px", cell: (r) => <span className="num whitespace-nowrap text-[13px] font-bold">{r.ticket_number}</span> },
    { key: "patient_name", header: "المراجع", value: (r) => r.patient_name, sortable: true, cell: (r) => <CellStack title={r.patient_name} sub={<span className="num">{r.phone_number}</span>} /> },
    { key: "time", header: "الموعد", width: "130px", sortable: true, value: (r) => r.scheduled_time ?? r.arrived_at ?? "", cell: (r) => <span className="num flex flex-col whitespace-nowrap text-[13px]"><b>{r.scheduled_time ? fmtTime(r.scheduled_time) : "مباشر"}</b><span className="text-xs text-ink-2">{fmtDate(r.date)}</span></span> },
    { key: "doctor", header: "الطبيب والعيادة", hideBelow: "lg", value: (r) => r.doctor_name, cell: (r) => <span className="flex max-w-[170px] flex-col text-[13px]"><span className="truncate">{r.doctor_name}</span><span className="truncate text-xs text-ink-2">{r.clinic_name}</span></span> },
    { key: "status", header: "الحالة", width: "118px", value: (r) => ST[r.status]?.label, cell: (r) => <StatusBadge map={ST} value={r.status} /> },
    { key: "payment", header: "الدفع", width: "104px", value: (r) => PAY[r.payment_status]?.label, cell: (r) => <StatusBadge map={PAY} value={r.payment_status} /> },
    { key: "act", header: <span className="sr-only">إجراءات</span>, width: "206px", sticky: true, cell: (r) => (
      <span className="flex items-center justify-end gap-0.5" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
        {r.actions.includes("check_in") && <Button size="sm" icon="user-check" className="!h-8 !px-2.5" loading={busy === r.ticket_id} onClick={() => void checkIn(r)}>تثبيت</Button>}
        {r.actions.includes("late_arrival") && <Button size="sm" variant="soft" icon="clock" className="!h-8 !px-2.5" loading={busy === r.ticket_id} onClick={() => void lateArrival(r)}>وصل متأخراً</Button>}
        {r.actions.includes("collect_payment") && <Link href={`/staff/reception/collect?patient_id=${r.patient_id}`} title="تحصيل" aria-label={`تحصيل ${r.patient_name}`} className={`${iconBtn} text-primary`}><Icon name="banknote" size={17} /></Link>}
        {r.actions.includes("reschedule") && r.booking_id && <button type="button" title="تغيير الموعد" aria-label={`تغيير موعد ${r.patient_name}`} onClick={() => setResched(r)} className={iconBtn}><Icon name="calendar-clock" size={17} /></button>}
        {r.actions.includes("no_show") && <button type="button" title="لم يحضر" aria-label={`${r.patient_name} لم يحضر`} onClick={() => setNoShow(r)} className={iconBtn}><Icon name="user-x" size={17} /></button>}
        {r.actions.includes("cancel") && r.booking_id && <button type="button" title="إلغاء الحجز" aria-label={`إلغاء حجز ${r.patient_name}`} onClick={() => setCancel(r)} className={`${iconBtn} text-danger hover:bg-danger-soft`}><Icon name="calendar-x" size={17} /></button>}
      </span>
    ) },
  ];
  const s = list.data?.summary;

  return (
    <div className="flex flex-col gap-3.5">
      {choice && <ReturnOrNewDialog choice={choice.c} onClose={() => setChoice(null)} onPick={(mode) => checkIn(choice.row, mode)} />}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-7">
        {TILES.map((t) => {
          const n = s ? (t.k ? s[t.k] : s.total) : null;
          const on = status === t.k;
          return (
            <button key={t.label} type="button" aria-pressed={on} onClick={() => setStatus(t.k)}
              className={`flex items-center gap-2.5 rounded-2xl border-[1.5px] px-3 py-2.5 text-start transition-colors duration-base ${on ? "border-primary bg-primary-soft" : "border-line bg-surface hover:border-primary/50"}`}>
              <Icon name={t.icon} size={18} className={`shrink-0 ${t.tone}`} />
              <span className="flex min-w-0 flex-col"><span className="num text-lg font-bold leading-tight">{n == null ? "—" : fmtNum(n)}</span><span className="truncate text-xs text-ink-2">{t.label}</span></span>
            </button>
          );
        })}
      </div>
      <DataGrid<TodayRow> aria-label="مراجعو اليوم" rows={list.data ? rows : undefined} loading={list.isPending} error={list.isError ? errorMessage(list.error) : undefined} rowKey={(r) => r.ticket_id} columns={columns} minWidth={720} dense pageSize={0}
        rowClassName={(r) => (r.status === "cancelled" || r.status === "no_show" ? "opacity-70" : "")} onRowClick={(r) => setSel(r.ticket_id)} selectedKey={sel}
        expanded={(r) => (r.ticket_id === sel ? <RowDetail r={r} /> : null)}
        empty={{ icon: "calendar-check", title: q || status || pay || doctor ? "لا نتائج مطابقة" : "لا توجد مواعيد لهذا اليوم" }}
        filters={<>
          <label className="flex h-[42px] min-w-[220px] flex-1 items-center gap-2 rounded-xl border-[1.5px] border-line-strong bg-surface px-3 focus-within:border-primary focus-within:ring-4 focus-within:ring-primary/15">
            <Icon name="search" size={16} className="shrink-0 text-ink-muted" />
            <input ref={search} value={text} onChange={(e) => setText(e.target.value)} placeholder="الاسم، الهاتف، رقم الملف أو الدور" aria-label="بحث في مراجعي اليوم" aria-keyshortcuts="/" className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-ink-muted" />
            {text ? <button type="button" onClick={() => setText("")} aria-label="مسح البحث" className="text-ink-muted hover:text-ink"><Icon name="x" size={15} /></button> : <span className="hidden md:inline"><Kbd>/</Kbd></span>}
          </label>
          <DateField size="md" className="w-full sm:w-[190px]" aria-label="اليوم" value={date} onChange={(v) => { if (v) { setDate(v); setSel(null); } }} />
          <div className="w-full sm:w-[170px]"><ISelect size="md" aria-label="الطبيب" placeholder="كل الأطباء" value={doctor} onChange={setDoctor} clearable loading={docs.isPending} options={docs.data?.items.map((d) => ({ value: d.doctor_id, label: d.full_name, hint: d.clinic_name ?? undefined }))} /></div>
          <div className="w-full sm:w-[150px]"><ISelect size="md" aria-label="الحالة" placeholder="كل الحالات" value={status} onChange={(v) => setStatus(v as TodayStatus | "")} clearable searchable={false} options={Object.entries(ST).map(([k, v]) => ({ value: k, label: v.label, icon: v.icon }))} /></div>
          <div className="w-full sm:w-[140px]"><ISelect size="md" aria-label="الدفع" placeholder="كل الدفع" value={pay} onChange={setPay} clearable searchable={false} options={Object.entries(PAY).map(([k, v]) => ({ value: k, label: v.label, icon: v.icon }))} /></div>
        </>} />
      <p className="hidden flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-2 md:flex">
        <span className="flex items-center gap-1"><Kbd>/</Kbd> بحث</span>
        <span className="flex items-center gap-1"><Kbd>↑</Kbd><Kbd>↓</Kbd> تنقل بين الصفوف</span>
        <span className="flex items-center gap-1"><Kbd>Enter</Kbd> تثبيت حضور الصف المحدد</span>
        <span className="flex items-center gap-1"><Kbd>Esc</Kbd> إلغاء التحديد</span>
        {list.isFetching && <span className="flex items-center gap-1 text-ink-muted"><Icon name="loader-circle" size={13} className="animate-spin" />تحديث</span>}
      </p>
      {(list.data?.total ?? 0) > rows.length && <Alert tone="info">يعرض الجدول أول {rows.length} من {list.data!.total}. استخدم البحث أو الفلاتر.</Alert>}
      {cancel && <CancelDialog client={staffApi} mode="staff" bookingId={cancel.booking_id!} who={cancel.patient_name} onClose={() => setCancel(null)} onDone={() => { setCancel(null); refresh(); }} />}
      {resched && <RescheduleDialog client={staffApi} mode="staff" who={resched.patient_name} booking={{ booking_id: resched.booking_id!, doctor_id: resched.doctor_id, doctor_name: resched.doctor_name, session_id: resched.session_id }} onClose={() => setResched(null)} onDone={() => { setResched(null); refresh(); }} />}
      {noShow && <NoShowDialog r={noShow} onClose={() => setNoShow(null)} onDone={() => { setNoShow(null); refresh(); }} />}
    </div>
  );
}

function RowDetail({ r }: { r: TodayRow }) {
  const f: [string, React.ReactNode][] = [
    ["رقم الملف", <span key="f" className="num">{r.file_number}</span>], ["الطبيب والعيادة", `${r.doctor_name} · ${r.clinic_name}`], ["المصدر", SOURCE_AR[r.source] ?? r.source],
    ["تثبيت الحضور", r.check_in_method ? METHOD_AR[r.check_in_method] ?? r.check_in_method : "لم يُثبَّت بعد"],
    ["وقت الوصول", r.arrived_at ? <span key="a" className="num">{fmtTime(r.arrived_at)}</span> : "—"],
    ["الدخول التقريبي", r.estimated_time ? <span key="e" className="num">{fmtTime(r.estimated_time)}</span> : "—"],
    ["الترتيب", r.queue_position ?? "—"],
    ["تغيير الموعد", r.reschedule_count ? `${r.reschedule_count} ${r.reschedule_count === 1 ? "مرة" : "مرات"}` : "لم يتغير"],
    ["المتبقي", r.amount_due ? <span key="d" className="num">{fmtIqd(r.amount_due)}</span> : "لا شيء"],
  ];
  return (
    <div className="grid gap-x-5 gap-y-1.5 px-4 py-3 text-[13px] sm:grid-cols-2 lg:grid-cols-3">
      {f.map(([k, v]) => <span key={k} className="flex justify-between gap-2"><span className="text-ink-2">{k}</span><span className="text-end font-semibold">{v}</span></span>)}
      {r.is_extra && <span className="text-warn-strong">مراجع إضافي فوق السعة</span>}
    </div>
  );
}

function NoShowDialog({ r, onClose, onDone }: { r: TodayRow; onClose: () => void; onDone: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<unknown>(null);
  const run = async (mode: "skip" | "final") => {
    setBusy(mode); setErr(null);
    try { const x = await queueApi.noShow(r.ticket_id, mode); toast.success(x.patient_banned ? "سُجل الغياب وحُظر المريض لتكرار الغياب" : mode === "skip" ? "تُخطي المراجع" : "سُجل الغياب"); onDone(); }
    catch (e) { setErr(e); } finally { setBusy(null); }
  };
  return (
    <Modal open onClose={onClose} title={`${r.patient_name} لم يحضر`} icon="user-x"
      footer={<>
        <Button size="md" variant="soft" className="flex-1" icon="skip-forward" loading={busy === "skip"} onClick={() => void run("skip")}>تخطٍ مؤقت</Button>
        <Button size="md" variant="danger" className="flex-1" icon="user-x" loading={busy === "final"} onClick={() => void run("final")}>غياب نهائي</Button>
      </>}>
      <p className="text-sm leading-7 text-ink-2">التخطي يبقيه قابلاً للعودة عند وصوله. الغياب النهائي يُحتسب عليه وقد يؤدي تكراره للحظر.</p>
      {err != null && <Alert tone="danger">{errorMessage(err)}</Alert>}
    </Modal>
  );
}
