"use client";
/** المحاسب — Accountant.dc.html: اللوحة، المطابقة، الاسترجاع، الآجل، الإيراد، الأرباح، الفواتير، المصاريف، التسويات، الغياب، التدقيق. */
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Icon } from "@/components/icon";
import { toast } from "@/components/toast";
import { Alert, Badge, Button, CellStack, DataGrid, DateField, ISelect, Modal, ReasonDialog, Spinner, type Column } from "@/components/ui";
import { billingApi, shiftsApi, type Invoice, type ShiftListItem } from "@/lib/api/billing";
import { deferralsApi, expensesApi, reportsApi } from "@/lib/api/finance";
import { lookupsApi, mergeApi, type AuditLog } from "@/lib/api/admin";
import { errorMessage } from "@/lib/api/errors";
import { fmtDate, fmtDateTime, fmtNum, fmtTime, fmtTimeRange } from "@/lib/format";
import { AUDIT_ACTION_OPTIONS, auditActionAr, entityAr, paymentsAr } from "@/lib/labels";
import { addDays, todayBaghdad } from "@/lib/date";
import { uuidv7 } from "@/lib/id";
import { useAuth } from "@/lib/auth/store";
import { useLive } from "@/lib/realtime/provider";
import { hardwareAgent } from "@/lib/agent";
import { MoneyInput, TextInput, useDebounced } from "@/components/reception/common";
import { Panel, Pill, Select, useBranches } from "@/components/admin/kit";

const monthStart = () => todayBaghdad().slice(0, 8) + "01";
export function useRange(def: "today" | "month" = "month") {
  const [from, setFrom] = useState(def === "today" ? todayBaghdad() : monthStart());
  const [to, setTo] = useState(todayBaghdad());
  const ui = (
    <div className="flex flex-wrap items-end gap-2">
      <DateField size="sm" className="w-[190px]" label="من" value={from} max={to} onChange={(v) => { if (v) setFrom(v); }} />
      <DateField size="sm" className="w-[190px]" label="إلى" value={to} min={from} onChange={(v) => { if (v) setTo(v); }} />
      <button onClick={() => { setFrom(todayBaghdad()); setTo(todayBaghdad()); }} className="h-10 rounded-full border border-line px-3 text-xs font-semibold">اليوم</button>
      <button onClick={() => { setFrom(monthStart()); setTo(todayBaghdad()); }} className="h-10 rounded-full border border-line px-3 text-xs font-semibold">هذا الشهر</button>
    </div>
  );
  return { from, to, ui };
}
export function BranchFilter({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const b = useBranches();
  if ((b.data?.items.length ?? 0) < 2) return null;
  return <div className="w-56"><Select value={value} onChange={onChange} placeholder="كل الفروع" options={(b.data?.items ?? []).map((x) => ({ value: x.branch_id, label: x.name }))} /></div>;
}
export function Stat({ icon, label, value, sub, tone = "text-primary" }: { icon: string; label: string; value: string; sub?: string; tone?: string }) {
  return (
    <div className="flex items-center gap-3 rounded-card border border-line bg-surface p-4">
      <span className={`grid size-11 place-items-center rounded-xl bg-bg ${tone}`}><Icon name={icon} size={21} /></span>
      <span className="flex min-w-0 flex-col"><span className="sub-sm">{label}</span><span className="num text-xl font-bold">{value}</span>{sub && <span className="sub-sm">{sub}</span>}</span>
    </div>
  );
}
const Bar = ({ v, max, cls = "bg-primary" }: { v: number; max: number; cls?: string }) => <span className="h-2 w-full overflow-hidden rounded-full bg-bg"><span className={`block h-full rounded-full ${cls}`} style={{ width: `${max ? Math.max(2, (v / max) * 100) : 0}%` }} /></span>;
const DEPT_AR: Record<string, string> = { clinic: "العيادات", lab: "المختبر", radiology: "الأشعة", pharmacy: "الصيدلية", deposit: "العربون", procedure: "الإجراءات" };
const METHOD_AR: Record<string, string> = { cash: "نقداً", pos: "POS", online: "إلكتروني", patient_credit: "رصيد" };

// ------------------------------------------------------------------ اللوحة
export function DashScreen() {
  const q = useQuery({ queryKey: ["fin", "dash"], queryFn: () => reportsApi.dashboard(), refetchInterval: 60_000 });
  if (q.isPending) return <Spinner />;
  if (q.isError) return <Alert tone="danger">{errorMessage(q.error)}</Alert>;
  const t = q.data.totals;
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat icon="banknote" label="صافي إيراد اليوم" value={fmtNum(t.today.revenue_net)} sub={paymentsAr(t.today.payments_count)} />
        <Stat icon="calendar-days" label="منذ بداية الشهر" value={fmtNum(t.month_to_date.revenue_net)} sub={`بعد المصاريف ${fmtNum(t.month_to_date.net_after_expenses)}`} />
        <Stat icon="users" label="مرضى اليوم" value={`${t.activity.completed}/${t.activity.checked_in}`} sub={`حجوزات ${t.activity.bookings} · غياب ${t.activity.no_shows}`} tone="text-info" />
        <Stat icon="triangle-alert" label="تحتاج تدخلاً" value={String(t.alerts.shifts_pending_review + t.alerts.pending_refunds + t.alerts.overdue_deferrals)} sub={`حسابات يومية ${t.alerts.shifts_pending_review} · استرجاع ${t.alerts.pending_refunds} · آجل متأخر ${t.alerts.overdue_deferrals}`} tone="text-warn" />
      </div>
      <DataGrid aria-label="ملخص الفروع" rows={q.data.branches} rowKey={(b) => b.branch_id} minWidth={860} pageSize={0} search={q.data.branches.length > 6}
        empty={{ icon: "building-2", title: "لا توجد فروع" }}
        columns={[
          { key: "branch_name", header: "الفرع", sortable: true, cell: (b) => <span className="flex items-center gap-2 font-semibold">{b.branch_name}{b.closed_today && <Pill tone="warn">مغلق اليوم</Pill>}</span> },
          { key: "today", header: "اليوم", numeric: true, sortable: true, value: (b) => b.today.revenue_net, cell: (b) => <span className="font-bold">{fmtNum(b.today.revenue_net)}</span> },
          { key: "cash_in", header: "نقد داخل", numeric: true, value: (b) => b.today.cash_in, cell: (b) => fmtNum(b.today.cash_in) },
          { key: "expenses", header: "مصاريف", numeric: true, value: (b) => b.today.expenses, cell: (b) => <span className="text-danger-strong">{fmtNum(b.today.expenses)}</span> },
          { key: "month", header: "الشهر", numeric: true, sortable: true, value: (b) => b.month_to_date.revenue_net, cell: (b) => fmtNum(b.month_to_date.revenue_net) },
          { key: "patients", header: "مرضى", numeric: true, value: (b) => b.activity.completed, cell: (b) => `${b.activity.completed}/${b.activity.checked_in}` },
          { key: "alerts", header: "تنبيهات", cell: (b) => <span className="flex flex-wrap gap-1">{b.alerts.shifts_pending_review > 0 && <Pill tone="warn" icon="scale">{b.alerts.shifts_pending_review}</Pill>}{b.alerts.pending_refunds > 0 && <Pill tone="danger" icon="undo-2">{b.alerts.pending_refunds}</Pill>}{b.alerts.shifts_with_variance > 0 && <Pill tone="danger" icon="triangle-alert">{fmtNum(b.alerts.variance_total)}</Pill>}</span> },
        ]} />
    </div>
  );
}

// ------------------------------------------------------------------ مطابقة الحسابات اليومية
export function ShiftsReview() {
  const [status, setStatus] = useState<"closed_pending_review" | "open" | "reviewed">("closed_pending_review");
  const [sel, setSel] = useState<ShiftListItem | null>(null);
  const qc = useQueryClient();
  const { live } = useLive();
  const list = useQuery({ queryKey: ["shifts", status], queryFn: () => shiftsApi.list({ status, page_size: 100 }) });
  useEffect(() => { if (!live) return; return live.on("shift.closed", () => void qc.invalidateQueries({ queryKey: ["shifts"] })); }, [live, qc]);
  const AUD: Record<string, { tone: "success" | "danger" | "warn"; ar: string }> = { MATCHED: { tone: "success", ar: "مطابق" }, SHORTAGE: { tone: "danger", ar: "عجز" }, OVERAGE: { tone: "warn", ar: "زيادة" } };
  const columns: Column<ShiftListItem>[] = [
    { key: "cashier_name", header: "الموظف", sortable: true, value: (r) => `${r.cashier_name} ${r.clinic_name ?? ""}`, cell: (r) => <CellStack title={r.cashier_name} sub={r.clinic_name ?? "استقبال عام"} /> },
    { key: "opened_at", header: "الوقت", width: "170px", sortable: true, cell: (r) => <span className="num whitespace-nowrap text-[13px] text-ink-2">{fmtTimeRange(r.opened_at, r.closed_at)}</span> },
    { key: "audit_status", header: "المطابقة", width: "100px", value: (r) => (r.audit_status ? AUD[r.audit_status].ar : ""), cell: (r) => (r.audit_status ? <Pill tone={AUD[r.audit_status].tone}>{AUD[r.audit_status].ar}</Pill> : <span className="text-ink-muted">—</span>) },
    { key: "variance_total", header: "الفرق", numeric: true, width: "100px", sortable: true, cell: (r) => (r.variance_total ? <span className={`font-bold ${r.variance_total < 0 ? "text-danger-strong" : "text-warn-strong"}`}>{fmtNum(r.variance_total)}</span> : "—") },
  ];
  return (
    <div className="grid items-start gap-4 2xl:grid-cols-[minmax(0,1fr)_440px]">
      <DataGrid<ShiftListItem> aria-label="الحسابات اليومية" rows={list.data?.items} loading={list.isPending} error={list.isError ? errorMessage(list.error) : undefined} rowKey={(r) => r.shift_id} columns={columns} minWidth={560}
        onRowClick={setSel} selectedKey={sel?.shift_id} search={{ placeholder: "ابحث باسم الموظف أو القسم" }} empty={{ icon: "scale", title: "لا توجد حسابات يومية" }}
        filters={<div className="w-full sm:w-[210px]"><ISelect size="md" aria-label="حالة الحساب اليومي" value={status} searchable={false} onChange={(v) => { if (v) { setStatus(v as typeof status); setSel(null); } }}
          options={[{ value: "closed_pending_review", label: "بانتظار المراجعة", icon: "hourglass" }, { value: "open", label: "مفتوحة", icon: "lock-keyhole-open" }, { value: "reviewed", label: "مراجعة", icon: "circle-check" }]} /></div>} />
      {sel && <Reconcile key={sel.shift_id} id={sel.shift_id} />}
    </div>
  );
}
function Reconcile({ id }: { id: string }) {
  const qc = useQueryClient();
  const me = useAuth((s) => s.user)!;
  const r = useQuery({ queryKey: ["recon", id], queryFn: () => shiftsApi.reconciliation(id) });
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  if (r.isPending) return <Spinner />;
  if (r.isError) return <Alert tone="danger">{errorMessage(r.error)}</Alert>;
  const d = r.data;
  const M: Record<string, string> = { cash: "نقد", pos: "POS", online: "إلكتروني" };
  const own = d.user_id === me.user_id;
  const review = async (decision: "accepted" | "escalated") => { setBusy(true); try { await shiftsApi.review(id, { decision, note: note.trim() || undefined }); toast.success("رُوجع الحساب اليومي"); void qc.invalidateQueries({ queryKey: ["shifts"] }); void qc.invalidateQueries({ queryKey: ["recon", id] }); } catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); } };
  return (
    <Panel title={`${d.cashier_name} · ${d.clinic_name ?? "استقبال عام"}`} icon="scale" className="2xl:sticky 2xl:top-24">
      <span className="sub-sm"><span className="num">{fmtDateTime(d.opened_at)}</span> ← {d.closed_at ? <span className="num">{fmtDateTime(d.closed_at)}</span> : "مفتوحة"}</span>
      <div className="grid grid-cols-4 gap-1 text-[13px]">
        <span className="sub-sm">الطريقة</span><span className="sub-sm">المتوقع</span><span className="sub-sm">المُعلن</span><span className="sub-sm">الفرق</span>
        {d.lines.map((l) => (<div key={l.method} className="contents"><span>{M[l.method] ?? l.method}</span><span className="num">{fmtNum(l.expected)}</span><span className="num">{l.declared == null ? "—" : fmtNum(l.declared)}</span><span className={`num font-bold ${l.variance && l.variance < 0 ? "text-danger-strong" : l.variance ? "text-warn-strong" : "text-success-strong"}`}>{l.variance == null ? "—" : fmtNum(l.variance)}</span></div>))}
      </div>
      <div className="flex flex-col gap-1 rounded-xl bg-bg p-3 text-[13px]">
        {([["الفكة الافتتاحية", d.cash_breakdown.opening_float], ["نقد مقبوض", d.cash_breakdown.cash_received], ["استرجاع نقدي", d.cash_breakdown.cash_refunds], ["مصاريف من الصندوق", d.cash_breakdown.cash_expenses], ["المتوقع (في ذمة الموظف)", d.cash_breakdown.expected_in_drawer]] as const).map(([k, v]) => <div key={k} className="flex justify-between"><span className="text-ink-2">{k}</span><span className="num">{fmtNum(v)}</span></div>)}
      </div>
      <span className="sub-sm">إيصالات <span className="num">{d.receipts_count}</span> · استرجاع <span className="num">{d.refunds_count}</span> · نسخ مكررة <span className="num">{d.reprints_count}</span> · قسائم POS <span className="num">{d.declared_pos_slips_count ?? "—"}/{d.pos_slips_count}</span></span>
      {d.cash_denominations && <span className="sub-sm num">{Object.entries(d.cash_denominations).filter(([, n]) => n).map(([k, n]) => `${fmtNum(Number(k))}×${n}`).join(" · ")}</span>}
      {d.close_note && <span className="text-[13px]">ملاحظة الموظف: {d.close_note}</span>}
      {d.auto_closed && <Alert tone="warn" icon="clock-alert">أُغلق تلقائياً بنهاية اليوم{d.lines[0]?.declared == null ? " · بانتظار إقرار الموظف بالمبلغ المعدود" : ""}</Alert>}
      {(d.electronic_for_check_ins ?? 0) > 0 && <span className="text-[13px] text-ink-2">إلكتروني لمن أكّد حضورهم: <span className="num font-semibold">{fmtNum(d.electronic_for_check_ins)}</span> (لا يدخل في النقد)</span>}
      {(d.unprinted_receipts?.length ?? 0) > 0 && (
        <div className="flex flex-col gap-1 rounded-xl bg-warn-soft p-2.5 text-[13px]">
          <span className="font-semibold text-warn-strong">وصولات لم تُطبع</span>
          {d.unprinted_receipts!.map((u) => <span key={u.receipt_id}><span className="num">{u.receipt_number}</span> · <span className="num">{fmtNum(u.total)}</span> · {u.reason ?? "بلا سبب بعد"}</span>)}
        </div>
      )}
      {d.status === "closed_pending_review" ? (own ? <Alert tone="warn">لا يمكنك مراجعة حسابك اليومي.</Alert> : <>
        <TextInput label={d.audit_status === "MATCHED" ? "ملاحظة (اختيارية)" : "ملاحظة (إلزامية للعجز والزيادة)"} value={note} onChange={setNote} icon="notebook-pen" />
        <div className="flex gap-2"><Button size="md" className="flex-1" icon="circle-check" loading={busy} disabled={d.audit_status !== "MATCHED" && !note.trim()} onClick={() => review("accepted")}>اعتماد</Button><Button size="md" variant="danger" icon="triangle-alert" disabled={busy || !note.trim()} onClick={() => review("escalated")}>تصعيد</Button></div>
      </>) : d.review_decision && <Alert tone={d.review_decision === "accepted" ? "success" : "warn"}>{d.review_decision === "accepted" ? "اعتُمدت" : "صُعّدت"}{d.review_note ? ` · ${d.review_note}` : ""}</Alert>}
    </Panel>
  );
}

// ------------------------------------------------------------------ اعتماد الاسترجاع
export function RefundApprovals() {
  const qc = useQueryClient();
  const me = useAuth((s) => s.user)!;
  const { live } = useLive();
  const q = useQuery({ queryKey: ["refunds", "pending"], queryFn: () => billingApi.refunds({ status: "pending_approval", page_size: 100 }) });
  const [rej, setRej] = useState<string | null>(null);
  useEffect(() => { if (!live) return; return live.on("refund.approval_needed", () => void qc.invalidateQueries({ queryKey: ["refunds"] })); }, [live, qc]);
  const approve = async (id: string) => { try { const x = await billingApi.approveRefund(id); toast.success("اعتُمد الاسترجاع"); if (x.receipt) { const p = await billingApi.printPayload(x.receipt.print_payload_url); void hardwareAgent.printReceipt({ print_payload: p as never, drawer_token: null, open_drawer: false }); /* 7.1-أ: الدرج موقوف */ } void qc.invalidateQueries({ queryKey: ["refunds"] }); } catch (e) { toast.error(errorMessage(e)); } };
  return (
    <>
      <DataGrid aria-label="طلبات الاسترجاع" rows={q.data?.items} loading={q.isPending} error={q.isError ? errorMessage(q.error) : undefined} rowKey={(r) => r.refund_id} minWidth={720}
        search={{ placeholder: "ابحث بالبند أو السبب أو الموظف" }} empty={{ icon: "undo-2", title: "لا توجد طلبات بانتظار الاعتماد" }}
        columns={[
          { key: "service_name", header: "البند", sortable: true, value: (r) => `${r.service_name} ${r.reason} ${r.requested_by_name}`, cell: (r) => <CellStack title={r.service_name} sub={`${r.reason} · طلبه ${r.requested_by_name}`} icon={<span className="grid size-9 shrink-0 place-items-center rounded-xl bg-danger-soft text-danger"><Icon name="undo-2" size={17} /></span>} /> },
          { key: "created_at", header: "الوقت", width: "130px", sortable: true, cell: (r) => <span className="num flex flex-col whitespace-nowrap text-xs text-ink-2"><span>{fmtDate(r.created_at)}</span><span>{fmtTime(r.created_at)}</span></span> },
          { key: "method", header: "الطريقة", width: "90px", value: (r) => METHOD_AR[r.method] ?? r.method, cell: (r) => <Pill tone="muted">{METHOD_AR[r.method] ?? r.method}</Pill> },
          { key: "amount", header: "المبلغ", numeric: true, width: "110px", sortable: true, cell: (r) => <span className="font-bold">{fmtNum(r.amount)}</span> },
          { key: "act", header: <span className="sr-only">إجراء</span>, width: "190px", sticky: true, cell: (r) => (r.requested_by === me.user_id ? <span className="sub-sm">طلبك</span> : (
            <span className="flex gap-1.5"><Button size="sm" icon="check" onClick={() => void approve(r.refund_id)}>اعتماد</Button><Button size="sm" variant="ghost" icon="x" onClick={() => setRej(r.refund_id)}>رفض</Button></span>
          )) },
        ]} />
      <ReasonDialog open={!!rej} title="رفض الاسترجاع" icon="x" danger confirmText="رفض" onClose={() => setRej(null)} onConfirm={async (reason) => { await billingApi.rejectRefund(rej!, reason); toast.success("رُفض الطلب"); void qc.invalidateQueries({ queryKey: ["refunds"] }); }} />
    </>
  );
}

// ------------------------------------------------------------------ الذمم الآجلة
export function DeferralsScreen() {
  const qc = useQueryClient();
  const [status, setStatus] = useState("active");
  const q = useQuery({ queryKey: ["deferrals", status], queryFn: () => deferralsApi.list({ status: status === "overdue" ? "active" : status, overdue: status === "overdue" || undefined, page_size: 100 }) });
  const [wo, setWo] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="w-full sm:w-[200px]"><ISelect size="md" aria-label="حالة الذمة" value={status} searchable={false} onChange={(v) => { if (v) setStatus(v); }} options={[{ value: "active", label: "مفتوحة" }, { value: "overdue", label: "متأخرة", icon: "triangle-alert", hint: q.data ? String(q.data.overdue_count) : undefined }, { value: "settled", label: "مسددة" }, { value: "written_off", label: "معفاة" }]} /></div>
        <span className="flex-1" />{q.data && <span className="text-sm">المتبقي الكلي <b className="num">{fmtNum(q.data.total_outstanding)}</b> د.ع</span>}
      </div>
      <DataGrid aria-label="الذمم الآجلة" rows={q.data?.items} loading={q.isPending} rowKey={(d) => d.deferral_id} minWidth={860}
        search={{ placeholder: "ابحث بالاسم أو الهاتف أو الفرع" }} empty={{ icon: "hand-coins", title: "لا توجد ذمم" }}
        columns={[
          { key: "patient_name", header: "المريض", sortable: true, value: (d) => `${d.patient_name} ${d.phone_number} ${d.branch_name} ${d.reason ?? ""}`,
            cell: (d) => <span className="flex min-w-0 flex-col"><span className="font-bold">{d.patient_name}</span><span className="sub-sm"><span className="num">{d.phone_number}</span> · {d.branch_name} · منحها {d.granted_by}</span><span className="sub-sm">{d.reason}{d.note ? ` · ${d.note}` : ""}</span></span> },
          { key: "amount", header: "المبلغ", numeric: true, sortable: true, cell: (d) => fmtNum(d.amount) },
          { key: "paid", header: "المسدد", numeric: true, cell: (d) => fmtNum(d.paid) },
          { key: "remaining", header: "المتبقي", numeric: true, sortable: true, cell: (d) => <span className="text-base font-bold text-warn-strong">{fmtNum(d.remaining)}</span> },
          { key: "due_date", header: "الاستحقاق", sortable: true, cell: (d) => (d.is_overdue ? <Pill tone="danger" icon="calendar-x">متأخرة · {fmtDate(d.due_date)}</Pill> : d.due_date ? <Pill tone="muted">تستحق {fmtDate(d.due_date)}</Pill> : <span className="text-ink-muted">—</span>) },
          { key: "act", header: <span className="sr-only">إجراء</span>, width: "110px", cell: (d) => (d.status === "active" ? <Button size="sm" variant="ghost" icon="circle-x" onClick={() => setWo(d.deferral_id)}>إعفاء</Button> : null) },
        ]} />
      <ReasonDialog open={!!wo} title="إعفاء نهائي من المتبقي" icon="circle-x" danger confirmText="إعفاء" onClose={() => setWo(null)} note={<Alert tone="warn">البنود غير المسددة لا تُحصّل بعد الإعفاء.</Alert>}
        onConfirm={async (r) => { await deferralsApi.writeOff(wo!, r); toast.success("أُعفي المتبقي"); void qc.invalidateQueries({ queryKey: ["deferrals"] }); }} />
    </div>
  );
}

// ------------------------------------------------------------------ الإيراد
export function RevenueScreen() {
  const r = useRange("today");
  const [branch, setBranch] = useState("");
  const q = useQuery({ queryKey: ["fin", "rev", r.from, r.to, branch], queryFn: () => reportsApi.revenue({ from: r.from, to: r.to, branch_id: branch || undefined }) });
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">{r.ui}<BranchFilter value={branch} onChange={setBranch} /></div>
      {q.isPending ? <Spinner /> : q.isError ? <Alert tone="danger">{errorMessage(q.error)}</Alert> : (() => { const d = q.data; const maxD = Math.max(...d.by_department.map((x) => x.net), 1); const maxM = Math.max(...d.by_method.map((x) => x.net), 1); return (<>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Stat icon="banknote" label="الصافي" value={fmtNum(d.total_net)} sub={`إجمالي ${fmtNum(d.total_gross)} · استرجاع ${fmtNum(d.total_refunds)}`} />
          <Stat icon="receipt-text" label="المصاريف" value={fmtNum(d.expenses)} sub={`الصافي بعدها ${fmtNum(d.net_after_expenses)}`} tone="text-danger" />
          <Stat icon="piggy-bank" label="عربون مقبوض" value={fmtNum(d.deposits_received)} sub={`رصيد مستخدم ${fmtNum(d.credit_used)}`} tone="text-success" />
          <Stat icon="badge-percent" label="خصومات" value={fmtNum(d.discounts)} sub={`آجل جديد ${fmtNum(d.deferred_new)} · ${paymentsAr(d.payments_count)}`} tone="text-warn" />
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <Panel title="حسب القسم" icon="building-2">{d.by_department.map((x) => <div key={x.department} className="flex flex-col gap-1"><span className="flex justify-between text-sm"><span>{DEPT_AR[x.department] ?? x.department}</span><span className="num font-semibold">{fmtNum(x.net)}</span></span><Bar v={x.net} max={maxD} /></div>)}</Panel>
          <Panel title="حسب طريقة الدفع" icon="credit-card">{d.by_method.map((x) => <div key={x.method} className="flex flex-col gap-1"><span className="flex justify-between text-sm"><span>{METHOD_AR[x.method] ?? x.method}</span><span className="num font-semibold">{fmtNum(x.net)}</span></span><Bar v={x.net} max={maxM} cls="bg-info" /></div>)}</Panel>
        </div>
        {d.by_branch.length > 1 && <Panel title="حسب الفرع" icon="map-pinned">{d.by_branch.map((b) => <div key={b.branch_id} className="flex flex-wrap justify-between gap-2 border-b border-line py-2 text-sm last:border-0"><span className="font-semibold">{b.branch_name}</span><span className="text-ink-2">نقد داخل <span className="num">{fmtNum(b.cash_in)}</span> · مصاريف <span className="num">{fmtNum(b.expenses)}</span></span><span className="num font-bold">{fmtNum(b.total_net)}</span></div>)}</Panel>}
      </>); })()}
    </div>
  );
}

// ------------------------------------------------------------------ أرباح الأطباء
export function EarningsScreen() {
  const r = useRange();
  const q = useQuery({ queryKey: ["fin", "earn", r.from, r.to], queryFn: () => reportsApi.earnings({ from: r.from, to: r.to }) });
  return (
    <div className="flex flex-col gap-4">
      {r.ui}
      {q.isPending ? <Spinner /> : q.isError ? <Alert tone="danger">{errorMessage(q.error)}</Alert> : <>
        <div className="grid gap-3 sm:grid-cols-2"><Stat icon="stethoscope" label="حصة الأطباء" value={fmtNum(q.data.total_doctor_share)} /><Stat icon="building-2" label="حصة المجمع" value={fmtNum(q.data.total_complex_share)} tone="text-success" /></div>
        <DataGrid aria-label="أرباح الأطباء" rows={q.data.items} rowKey={(d) => d.doctor_id} minWidth={760} search={{ placeholder: "ابحث باسم الطبيب أو العيادة" }}
          empty={{ icon: "percent", title: "لا بيانات للفترة" }}
          columns={[
            { key: "doctor_name", header: "الطبيب", sortable: true, value: (d) => `${d.doctor_name} ${d.clinic_name ?? ""}`, cell: (d) => <CellStack title={d.doctor_name} sub={d.clinic_name} /> },
            { key: "new", header: "جديد", numeric: true, value: (d) => d.new_visits.doctor_share, cell: (d) => `${d.new_visits.count} · ${fmtNum(d.new_visits.doctor_share)}` },
            { key: "follow", header: "مراجعة", numeric: true, value: (d) => d.follow_ups.doctor_share, cell: (d) => `${d.follow_ups.count} · ${fmtNum(d.follow_ups.doctor_share)}` },
            { key: "other", header: "خدمات أخرى", numeric: true, value: (d) => d.other_services.doctor_share, cell: (d) => `${d.other_services.count} · ${fmtNum(d.other_services.doctor_share)}` },
            { key: "refund_adjustments", header: "تعديلات الاسترجاع", numeric: true, sortable: true, cell: (d) => <span className="text-danger-strong">{fmtNum(d.refund_adjustments)}</span> },
            { key: "total_doctor_share", header: "حصة الطبيب", numeric: true, sortable: true, cell: (d) => <span className="font-bold">{fmtNum(d.total_doctor_share)}</span> },
          ]} />
      </>}
    </div>
  );
}

// ------------------------------------------------------------------ الفواتير
export function InvoicesScreen() {
  const [text, setText] = useState("");
  const q = useDebounced(text);
  const [status, setStatus] = useState("");
  const list = useQuery({ queryKey: ["invoices", "search", q, status], queryFn: () => billingApi.invoices({ q: q || undefined, status: status || undefined, page_size: 50 }) });
  const [sel, setSel] = useState<string | null>(null);
  const ST: Record<string, { tone: "success" | "danger" | "warn" | "info" | "muted"; ar: string }> = { paid: { tone: "success", ar: "مدفوعة" }, unpaid: { tone: "danger", ar: "غير مدفوعة" }, partially_paid: { tone: "warn", ar: "جزئي" }, deferred: { tone: "info", ar: "آجل" }, void: { tone: "muted", ar: "ملغاة" } };
  return (
    <div className="grid grid-cols-1 items-start gap-4 2xl:grid-cols-[minmax(0,1fr)_460px]">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-2">
          <div className="flex h-11 min-w-[220px] flex-1 items-center gap-2 rounded-field border-[1.5px] border-line-strong bg-surface px-3 focus-within:border-primary"><Icon name="search" size={16} className="text-ink-muted" /><input value={text} onChange={(e) => setText(e.target.value)} placeholder="رقم الفاتورة، رقم الملف، أو اسم المريض" className="min-w-0 flex-1 bg-transparent text-sm outline-none" /></div>
          <div className="w-44"><Select value={status} onChange={setStatus} placeholder="كل الحالات" options={Object.entries(ST).map(([k, v]) => ({ value: k, label: v.ar }))} /></div>
        </div>
        <DataGrid aria-label="الفواتير" rows={list.data?.items} loading={list.isPending} rowKey={(i) => i.invoice_id} minWidth={620}
          onRowClick={(i) => setSel(i.invoice_id)} selectedKey={sel} empty={{ icon: "file-text", title: "لا توجد فواتير" }}
          columns={[
            { key: "invoice_number", header: "الفاتورة", width: "120px", cell: (i) => <span className="num rounded-chip bg-bg px-2 py-1 text-xs font-bold">{i.invoice_number}</span> },
            { key: "patient_name", header: "المريض", sortable: true, cell: (i) => <CellStack title={i.patient_name} sub={<><span className="num">{i.file_number}</span> · {i.items_count} بنود</>} /> },
            { key: "created_at", header: "التاريخ", width: "140px", sortable: true, cell: (i) => <span className="num text-[13px] text-ink-2">{fmtDate(i.created_at)}</span> },
            { key: "status", header: "الحالة", width: "110px", value: (i) => ST[i.status]?.ar, cell: (i) => <Pill tone={ST[i.status].tone}>{ST[i.status].ar}</Pill> },
            { key: "net_amount", header: "الصافي", numeric: true, sortable: true, width: "120px", cell: (i) => <span className="font-bold">{fmtNum(i.net_amount)}</span> },
          ]} />
      </div>
      {sel && <InvoiceDetail key={sel} id={sel} />}
    </div>
  );
}
function InvoiceDetail({ id }: { id: string }) {
  const qc = useQueryClient();
  const canVoid = useAuth((s) => s.can("refunds.approve"));
  const q = useQuery({ queryKey: ["invoice", id], queryFn: () => billingApi.invoice(id) });
  const [voidOpen, setVoidOpen] = useState(false);
  if (q.isPending) return <Spinner />;
  if (q.isError) return <Alert tone="danger">{errorMessage(q.error)}</Alert>;
  const v: Invoice = q.data;
  return (
    <Panel title={<span className="num">{v.invoice_number}</span>} icon="file-text" className="2xl:sticky 2xl:top-24">
      <span className="text-sm">{v.patient_name} · <span className="num">{v.file_number}</span></span>
      {v.items.map((i) => <div key={i.invoice_item_id} className="flex justify-between gap-2 text-[13px]"><span>{i.service_name}{i.doctor_name ? ` · ${i.doctor_name}` : ""}{i.refunded_amount ? <span className="text-danger-strong"> (مسترجع {fmtNum(i.refunded_amount)})</span> : null}</span><span className="num">{fmtNum(i.net_price)}</span></div>)}
      <div className="flex flex-col gap-1 border-t border-dashed border-line-strong pt-2 text-[13px]">
        {([["الإجمالي", v.gross_amount], ["الخصم", -v.discount_amount], ["الصافي", v.net_amount], ["المدفوع", v.paid_amount], ["المسترجع", -v.refunded_amount]] as const).map(([k, n]) => <div key={k} className="flex justify-between"><span className="text-ink-2">{k}</span><span className="num">{fmtNum(n)}</span></div>)}
      </div>
      {v.discount_reason && <span className="sub-sm">سبب الخصم: {v.discount_reason}</span>}
      {v.payments.map((p) => <div key={p.payment_id} className="flex justify-between text-xs"><span>إيصال <span className="num">{p.receipt_number}</span> · {p.cashier_name}</span><span className="num">{fmtNum(p.amount)}</span></div>)}
      {v.status === "unpaid" && canVoid && <Button size="md" variant="danger" icon="circle-x" onClick={() => setVoidOpen(true)}>إلغاء الفاتورة</Button>}
      {v.void_reason && <Alert tone="info">أُلغيت: {v.void_reason}</Alert>}
      <ReasonDialog open={voidOpen} title="إلغاء فاتورة غير مدفوعة" icon="circle-x" danger confirmText="إلغاء الفاتورة" onClose={() => setVoidOpen(false)} onConfirm={async (r) => { await billingApi.voidInvoice(id, r); toast.success("أُلغيت الفاتورة"); void qc.invalidateQueries({ queryKey: ["invoice", id] }); void qc.invalidateQueries({ queryKey: ["invoices"] }); }} />
    </Panel>
  );
}

// ------------------------------------------------------------------ المصاريف
export function ExpensesScreen() {
  const qc = useQueryClient();
  const r = useRange();
  const q = useQuery({ queryKey: ["expenses", r.from, r.to], queryFn: () => expensesApi.list({ from: r.from, to: r.to, page_size: 100 }) });
  const [add, setAdd] = useState(false);
  const [vd, setVd] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">{r.ui}<span className="flex-1" /><Button size="md" icon="plus" onClick={() => setAdd(true)}>مصروف جديد</Button></div>
      {q.data && <div className="flex flex-wrap gap-2"><span className="rounded-full bg-danger-soft px-3 py-1.5 text-sm text-danger-strong">المجموع <b className="num">{fmtNum(q.data.total_amount)}</b></span>{q.data.by_category.map((c) => <span key={c.category} className="rounded-full bg-bg px-3 py-1.5 text-xs">{c.category_name} <b className="num">{fmtNum(c.amount)}</b></span>)}</div>}
      <DataGrid aria-label="المصاريف" rows={q.data?.items} loading={q.isPending} rowKey={(e) => e.expense_id} minWidth={720}
        search={{ placeholder: "ابحث بالوصف أو التصنيف أو الجهة" }} empty={{ icon: "receipt-text", title: "لا توجد مصاريف للفترة" }}
        rowClassName={(e) => (e.status === "void" ? "opacity-55" : "")}
        columns={[
          { key: "expense_number", header: "الرقم", width: "110px", cell: (e) => <span className="num rounded-chip bg-bg px-2 py-1 text-xs">{e.expense_number}</span> },
          { key: "description", header: "الوصف", value: (e) => `${e.description} ${e.category_name} ${e.branch_name} ${e.payee ?? ""}`,
            cell: (e) => <CellStack title={e.description} sub={`${e.category_name} · ${e.branch_name}${e.payee ? ` · ${e.payee}` : ""} · ${e.paid_from === "shift_cash" ? "من صندوق الحساب اليومي" : "صندوق الفرع"}`} /> },
          { key: "expense_date", header: "التاريخ", width: "140px", sortable: true, cell: (e) => <span className="num text-xs text-ink-2">{fmtDate(e.expense_date)}</span> },
          { key: "amount", header: "المبلغ", numeric: true, sortable: true, width: "120px", cell: (e) => <span className="font-bold">{fmtNum(e.amount)}</span> },
          { key: "act", header: <span className="sr-only">إجراء</span>, width: "70px", align: "center", cell: (e) => (e.status === "void" ? <Pill tone="muted">ملغى</Pill> : <button onClick={() => setVd(e.expense_id)} aria-label="إلغاء" title="إلغاء" className="grid size-8 place-items-center rounded-full text-ink-2 hover:bg-danger-soft hover:text-danger-strong"><Icon name="circle-x" size={16} /></button>) },
        ]} />
      {add && <NewExpense onClose={() => setAdd(false)} />}
      <ReasonDialog open={!!vd} title="إلغاء المصروف" icon="circle-x" danger confirmText="إلغاء" onClose={() => setVd(null)} onConfirm={async (r2) => { await expensesApi.void(vd!, r2); toast.success("أُلغي"); void qc.invalidateQueries({ queryKey: ["expenses"] }); }} />
    </div>
  );
}
function NewExpense({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const me = useAuth((s) => s.user)!;
  const cats = useQuery({ queryKey: ["lookups", "expense_category"], queryFn: () => lookupsApi.list("expense_category") });
  const [f, setF] = useState({ category: "", amount: 0, description: "", payee: "", paid_from: "treasury", expense_date: todayBaghdad(), branch_id: me.branch_id });
  const [busy, setBusy] = useState(false);
  const [id] = useState(uuidv7);
  return (
    <Modal open onClose={onClose} title="مصروف جديد" icon="receipt-text" width={480}>
      <Select label="التصنيف" value={f.category} placeholder="اختر" onChange={(v) => setF({ ...f, category: v })} options={(cats.data?.items ?? []).filter((c) => c.is_active).map((c) => ({ value: c.code, label: c.name_ar }))} />
      <MoneyInput label="المبلغ" value={f.amount} onChange={(n) => setF({ ...f, amount: n })} />
      <TextInput label="الوصف" value={f.description} onChange={(v) => setF({ ...f, description: v })} required />
      <TextInput label="المستلم" value={f.payee} onChange={(v) => setF({ ...f, payee: v })} />
      <div className="grid grid-cols-2 gap-2">{[["treasury", "صندوق الفرع", "building-2"], ["shift_cash", "صندوق الحساب اليومي", "archive"]].map(([k, l, i]) => <button key={k} onClick={() => setF({ ...f, paid_from: k })} className={`flex items-center justify-center gap-2 rounded-xl border-[1.5px] p-2.5 text-[13px] font-semibold ${f.paid_from === k ? "border-primary bg-primary-soft text-primary-strong" : "border-line text-ink-2"}`}><Icon name={i} size={16} />{l}</button>)}</div>
      <DateField label="التاريخ" value={f.expense_date} max={todayBaghdad()} min={addDays(todayBaghdad(), -60)} onChange={(v) => { if (v) setF({ ...f, expense_date: v }); }} />
      <Button loading={busy} disabled={!f.category || f.amount <= 0 || !f.description.trim()} icon="check" onClick={async () => {
        setBusy(true);
        try { const r = await expensesApi.create({ expense_id: id, ...f, payee: f.payee || undefined }); toast.success(`سُجل المصروف ${r.expense_number}`); if (r.open_drawer && r.drawer_token) void hardwareAgent.printReceipt({ print_payload: { type_ar: "مصروف", receipt_number: r.expense_number, lines: [{ text: r.description, amount: r.amount }], total: r.amount }, drawer_token: r.drawer_token, open_drawer: true }); void qc.invalidateQueries({ queryKey: ["expenses"] }); onClose(); }
        catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); }
      }}>تسجيل</Button>
    </Modal>
  );
}

// ------------------------------------------------------------------ التسويات، الغياب، التدقيق
export function SettlementsScreen() {
  const r = useRange();
  const q = useQuery({ queryKey: ["fin", "settle", r.from, r.to], queryFn: () => reportsApi.settlements({ from: r.from, to: r.to }) });
  return (
    <div className="flex flex-col gap-4">{r.ui}
      {q.isPending ? <Spinner /> : q.isError ? <Alert tone="danger">{errorMessage(q.error)}</Alert> : <>
        {q.data.total_outstanding_credit != null && <div className="max-w-sm"><Stat icon="piggy-bank" label="أرصدة المرضى القائمة (كل الفروع)" value={fmtNum(q.data.total_outstanding_credit)} sub="عرابين لم تُستخدم بعد · التزام على المجمع" tone="text-primary" /></div>}
        <DataGrid aria-label="تسويات الفروع" rows={q.data.branches} rowKey={(b) => b.branch_id} minWidth={760} pageSize={0}
          empty={{ icon: "building-2", title: "لا بيانات للفترة" }}
          columns={[
            { key: "branch_name", header: "الفرع", sortable: true, cell: (b) => <span className="font-semibold">{b.branch_name}</span> },
            { key: "credit_received", header: "رصيد مقبوض", numeric: true, sortable: true, cell: (b) => fmtNum(b.credit_received) },
            { key: "credit_used", header: "رصيد مستخدم", numeric: true, sortable: true, cell: (b) => fmtNum(b.credit_used) },
            { key: "used_from_other_branches", header: "من فروع أخرى", numeric: true, cell: (b) => fmtNum(b.used_from_other_branches) },
            { key: "used_by_other_branches", header: "لفروع أخرى", numeric: true, cell: (b) => fmtNum(b.used_by_other_branches) },
            { key: "net_settlement", header: "صافي التسوية", numeric: true, sortable: true, cell: (b) => <span className={`font-bold ${b.net_settlement < 0 ? "text-danger-strong" : "text-success-strong"}`}>{fmtNum(b.net_settlement)}</span> },
          ]} />
        {q.data.flows.length > 0 && <Panel title="التدفقات بين الفروع" icon="arrow-left-right">{q.data.flows.map((f, i) => <div key={i} className="flex items-center gap-2 text-sm"><span>{f.holder_branch_name}</span><Icon name="arrow-left" size={14} className="text-primary" /><span className="flex-1">{f.serving_branch_name}</span><span className="num font-bold">{fmtNum(f.amount)}</span><span className="sub-sm">{f.entries} عملية</span></div>)}</Panel>}
      </>}
    </div>
  );
}
export function NoShowsScreen() {
  const r = useRange();
  const q = useQuery({ queryKey: ["fin", "ns", r.from, r.to], queryFn: () => reportsApi.noShows({ from: r.from, to: r.to }) });
  return (
    <div className="flex flex-col gap-4">{r.ui}
      {q.isPending ? <Spinner /> : q.isError ? <Alert tone="danger">{errorMessage(q.error)}</Alert> : <>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Stat icon="user-x" label="حالات الغياب" value={fmtNum(q.data.total_no_shows)} sub={`${q.data.distinct_patients} مريض`} tone="text-danger" />
          <Stat icon="ban" label="حُظروا" value={fmtNum(q.data.patients_banned)} sub={`محظور حالياً ${q.data.currently_banned}`} tone="text-danger" />
          <Stat icon="shield-check" label="فُك حظرهم" value={fmtNum(q.data.patients_unbanned)} sub={`عربون ${q.data.unbanned_by_deposit} · إعفاء ${q.data.unbanned_by_waiver}`} tone="text-success" />
        </div>
        <DataGrid title={<span className="flex items-center gap-2"><Icon name="stethoscope" size={19} className="text-primary" />حسب الطبيب</span>} aria-label="الغياب حسب الطبيب" rows={q.data.by_doctor} rowKey={(d) => d.doctor_id} minWidth={520}
          search={{ placeholder: "ابحث باسم الطبيب أو العيادة" }} empty={{ icon: "user-x", title: "لا غياب في الفترة" }}
          columns={[
            { key: "doctor_name", header: "الطبيب", sortable: true, value: (d) => `${d.doctor_name} ${d.clinic_name ?? ""}`, cell: (d) => <CellStack title={d.doctor_name} sub={d.clinic_name} /> },
            { key: "bar", header: <span className="sr-only">النسبة</span>, width: "34%", cell: (d) => <Bar v={d.count} max={Math.max(...q.data.by_doctor.map((x) => x.count), 1)} cls="bg-danger" /> },
            { key: "count", header: "حالات الغياب", numeric: true, width: "120px", sortable: true, cell: (d) => <span className="font-semibold">{d.count}</span> },
          ]} />
      </>}
    </div>
  );
}
export function AuditScreen() {
  const [action, setAction] = useState("");
  const [open, setOpen] = useState<number | null>(null);
  const q = useQuery({ queryKey: ["audit", action], queryFn: () => mergeApi.audit({ action: action || undefined, page_size: 200 }) });
  const hasDetail = (l: AuditLog) => !!(l.before || l.after || l.device_id);
  return (
    <DataGrid<AuditLog> aria-label="سجل التدقيق" rows={q.data?.items} loading={q.isPending} error={q.isError ? errorMessage(q.error) : undefined} rowKey={(l) => String(l.log_id)} minWidth={720} dense
      search={{ placeholder: "بحث في السجل" }} empty={{ icon: "scroll-text", title: "لا توجد سجلات" }}
      filters={<div className="w-full sm:w-[240px]"><ISelect size="md" aria-label="العملية" placeholder="كل العمليات" value={action} clearable onChange={setAction} options={AUDIT_ACTION_OPTIONS} /></div>}
      onRowClick={(l) => { if (hasDetail(l)) setOpen((o) => (o === l.log_id ? null : l.log_id)); }} selectedKey={open != null ? String(open) : null}
      expanded={(l) => (open === l.log_id ? <AuditDetail l={l} /> : null)}
      columns={[
        { key: "action", header: "العملية", sortable: true, value: (l) => `${auditActionAr(l.action)} ${l.action}`, cell: (l) => <span title={l.action} className="flex items-center gap-2 font-semibold"><Icon name={l.synced_offline ? "cloud-off" : "scroll-text"} size={15} className="shrink-0 text-ink-3" />{auditActionAr(l.action)}</span> },
        { key: "entity_type", header: "الكيان", value: (l) => `${entityAr(l.entity_type)} ${l.reason ?? ""}`, cell: (l) => <span className="text-[13px] text-ink-2">{entityAr(l.entity_type)}{l.reason ? ` · ${l.reason}` : ""}</span> },
        { key: "user_name", header: "المستخدم", value: (l) => l.user_name ?? "النظام", cell: (l) => <span className="text-[13px]">{l.user_name ?? "النظام"}</span> },
        { key: "branch_name", header: "الفرع", hideBelow: "xl", cell: (l) => <span className="text-[13px] text-ink-2">{l.branch_name ?? "—"}</span> },
        { key: "occurred_at", header: "الوقت", width: "130px", sortable: true, cell: (l) => <span className="num flex flex-col whitespace-nowrap text-xs text-ink-2"><span>{fmtDate(l.occurred_at)}</span><span>{fmtTime(l.occurred_at)}</span></span> },
        { key: "more", header: <span className="sr-only">التفاصيل</span>, width: "36px", cell: (l) => (hasDetail(l) ? <Icon name={open === l.log_id ? "chevron-down" : "chevron-left"} size={14} className="text-ink-3" /> : null) },
      ]} />
  );
}

/** تفاصيل سطر التدقيق: ما تغيّر (قبل ← بعد) والجهاز إن كانت العملية أوفلاين. */
function AuditDetail({ l }: { l: AuditLog }) {
  const keys = Array.from(new Set([...Object.keys(l.before ?? {}), ...Object.keys(l.after ?? {})]));
  const show = (v: unknown) => (v === null || v === undefined ? "—" : typeof v === "object" ? JSON.stringify(v) : String(v));
  return (
    <div className="grid gap-1 px-4 py-3 text-xs">
      {l.device_id && <span className="sub-sm">الجهاز: <span className="num" dir="ltr">{l.device_id}</span></span>}
      {keys.length > 0 && (
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)] gap-x-3 gap-y-1"><span className="font-semibold">الحقل</span><span className="font-semibold">قبل</span><span className="font-semibold">بعد</span>
          {keys.map((k) => <div key={k} className="contents"><span className="num" dir="ltr">{k}</span><span className="num break-all" dir="ltr">{show(l.before?.[k])}</span><span className="num break-all font-semibold" dir="ltr">{show(l.after?.[k])}</span></div>)}
        </div>
      )}
    </div>
  );
}
