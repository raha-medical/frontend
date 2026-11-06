"use client";
/** مستحقات الكوادر وصرفها، والمدفوعات، والكشوفات (المواصفة 6، العقد 24). كل شاشة على مستوى الفرع، والمدير العام يختار أي فرع. */
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/components/toast";
import { Alert, Button, CellStack, DataGrid, DateField, Field, ISelect, Modal, Segmented, Spinner } from "@/components/ui";
import { MoneyInput, TextInput } from "@/components/reception/common";
import { Pill, Select, useBranches } from "@/components/admin/kit";
import { entitlementsApi, type EntitlementRow, type PayPlan, type StatementRow } from "@/lib/api/finance";
import { errorMessage } from "@/lib/api/errors";
import { useAuth } from "@/lib/auth/store";
import { todayBaghdad } from "@/lib/date";
import { fmtDate, fmtDateTime, fmtMonthYear, fmtNum } from "@/lib/format";
import { paymentsAr } from "@/lib/labels";
import { uuidv7 } from "@/lib/id";
import { ROLES, isSystemRole } from "@/lib/roles";
import { BranchFilter, Stat, useRange } from "./accountant";

const roleAr = (r: string) => (isSystemRole(r) ? ROLES[r].label : r);
const METHOD: Record<string, string> = { cash: "نقداً", transfer: "تحويل" };

/** المستحقات لفرع واحد: الفرع الحالي افتراضياً، ومن يملك عدة فروع يختار. */
function OneBranch({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const b = useBranches();
  if ((b.data?.items.length ?? 0) < 2) return null;
  return <div className="w-56"><Select label="الفرع" value={value} onChange={onChange} placeholder="الفرع الحالي" options={(b.data?.items ?? []).map((x) => ({ value: x.branch_id, label: x.name }))} /></div>;
}

export function EntitlementsScreen() {
  const r = useRange();
  const [branch, setBranch] = useState("");
  const [tab, setTab] = useState<"due" | "plans" | "payouts">("due");
  const canWrite = useAuth((s) => s.can("expenses.manage"));
  const [pay, setPay] = useState<EntitlementRow | null>(null);
  const [plan, setPlan] = useState<{ user_id?: string } | null>(null);
  const b = branch || undefined;
  const st = useQuery({ queryKey: ["fin", "entitlements", b, r.from, r.to], queryFn: () => entitlementsApi.statement({ branch_id: b, from: r.from, to: r.to }) });
  const plans = useQuery({ queryKey: ["fin", "pay-plans", b], queryFn: () => entitlementsApi.plans(b) });
  const payouts = useQuery({ queryKey: ["fin", "payouts", b, r.from, r.to], queryFn: () => entitlementsApi.payouts({ branch_id: b, from: r.from, to: r.to }), enabled: tab === "payouts" });
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">{r.ui}<OneBranch value={branch} onChange={setBranch} /><span className="flex-1" />{canWrite && <Button size="md" icon="plus" onClick={() => setPlan({})}>نظام أجر</Button>}</div>
      {st.isError ? <Alert tone="danger">{errorMessage(st.error)}</Alert> : st.data && (
        <div className="grid gap-3 sm:grid-cols-3">
          <Stat icon="wallet" label="المستحق للفترة" value={fmtNum(st.data.total_earned)} />
          <Stat icon="hand-coins" label="المصروف" value={fmtNum(st.data.total_paid)} tone="text-success" />
          <Stat icon="scale" label="المتبقي" value={fmtNum(st.data.total_balance)} tone="text-warn" />
        </div>
      )}
      <Segmented value={tab} onChange={setTab} options={[{ value: "due", label: "المستحقات", icon: "wallet" }, { value: "plans", label: "أنظمة الأجور", icon: "percent" }, { value: "payouts", label: "سجل الصرف", icon: "hand-coins" }]} />
      {tab === "due" && (
        <DataGrid<EntitlementRow> aria-label="المستحقات" rows={st.data?.items} loading={st.isPending} rowKey={(x) => x.user_id} minWidth={840}
          search={{ placeholder: "ابحث باسم الموظف" }} empty={{ icon: "wallet", title: "لا مستحقات للفترة", hint: "الطبيب بلا نظام أجر يأخذ نسبته من الفواتير. لبقية الكوادر حدد نظام الأجر." }}
          columns={[
            { key: "user_name", header: "الموظف", sortable: true, cell: (x) => <CellStack title={x.user_name} sub={roleAr(x.role)} /> },
            { key: "model_ar", header: "النظام", cell: (x) => <Pill tone={x.model === "none" ? "muted" : "primary"}>{x.model_ar}</Pill> },
            { key: "cases", header: "الحالات", numeric: true, sortable: true, cell: (x) => fmtNum(x.cases) },
            { key: "basis", header: "الأساس", numeric: true, sortable: true, cell: (x) => fmtNum(x.basis) },
            { key: "earned", header: "المستحق", numeric: true, sortable: true, cell: (x) => <span className="font-bold">{fmtNum(x.earned)}</span> },
            { key: "paid", header: "المصروف", numeric: true, sortable: true, cell: (x) => fmtNum(x.paid) },
            { key: "balance", header: "المتبقي", numeric: true, sortable: true, cell: (x) => <span className={`font-bold ${x.balance < 0 ? "text-danger-strong" : ""}`}>{fmtNum(x.balance)}</span> },
            { key: "act", header: <span className="sr-only">إجراء</span>, sticky: true, cell: (x) => canWrite ? <Button size="sm" icon="hand-coins" onClick={() => setPay(x)}>صرف</Button> : null },
          ]} />
      )}
      {tab === "plans" && (
        <DataGrid<PayPlan> aria-label="أنظمة الأجور" rows={plans.data?.items} loading={plans.isPending} error={plans.isError ? errorMessage(plans.error) : undefined} rowKey={(x) => x.plan_id} minWidth={620}
          search={{ placeholder: "ابحث باسم الموظف" }} empty={{ icon: "percent", title: "لا توجد أنظمة أجور بعد" }}
          columns={[
            { key: "user_name", header: "الموظف", sortable: true, cell: (x) => <span className="font-semibold">{x.user_name}</span> },
            { key: "model_ar", header: "النظام", cell: (x) => <Pill tone="primary">{x.model_ar}</Pill> },
            { key: "value", header: "القيمة", numeric: true, cell: (x) => (x.model === "percentage" ? `${x.percent}%` : fmtNum(x.model === "fixed" ? x.fixed_monthly ?? 0 : x.per_case_amount ?? 0)) },
            { key: "effective_from", header: "يسري من", sortable: true, cell: (x) => <span className="num text-xs">{fmtDate(x.effective_from)}</span> },
            { key: "act", header: <span className="sr-only">إجراء</span>, sticky: true, cell: (x) => canWrite ? <Button size="sm" variant="ghost" icon="pencil" onClick={() => setPlan({ user_id: x.user_id })}>تعديل</Button> : null },
          ]} />
      )}
      {tab === "payouts" && (
        <DataGrid aria-label="سجل الصرف" rows={payouts.data?.items} loading={payouts.isPending} error={payouts.isError ? errorMessage(payouts.error) : undefined} rowKey={(x) => x.payout_id} minWidth={760}
          search={{ placeholder: "ابحث باسم الموظف" }} empty={{ icon: "hand-coins", title: "لا عمليات صرف للفترة" }}
          columns={[
            { key: "user_name", header: "الموظف", sortable: true, value: (x) => `${x.user_name} ${x.note ?? ""}`, cell: (x) => <CellStack title={x.user_name} sub={x.note ?? undefined} /> },
            { key: "period", header: "عن فترة", cell: (x) => <span className="num text-xs">{fmtDate(x.period_from)} – {fmtDate(x.period_to)}</span> },
            { key: "method", header: "الطريقة", cell: (x) => METHOD[x.method] ?? x.method },
            { key: "amount", header: "المبلغ", numeric: true, sortable: true, cell: (x) => <span className="font-bold">{fmtNum(x.amount)}</span> },
            { key: "created_at", header: "سجلها", sortable: true, cell: (x) => <CellStack title={x.created_by_name} sub={fmtDateTime(x.created_at)} /> },
          ]} />
      )}
      {pay && <PayoutDialog row={pay} branch={b} from={r.from} to={r.to} onClose={() => setPay(null)} />}
      {plan && <PlanDialog branch={b} userId={plan.user_id} onClose={() => setPlan(null)} />}
    </div>
  );
}

function PayoutDialog({ row, branch, from, to, onClose }: { row: EntitlementRow; branch?: string; from: string; to: string; onClose: () => void }) {
  const qc = useQueryClient();
  const [amount, setAmount] = useState(Math.max(0, row.balance));
  const [method, setMethod] = useState<"cash" | "transfer">("cash");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [id] = useState(uuidv7);
  async function save() {
    setBusy(true);
    try {
      await entitlementsApi.recordPayout({ user_id: row.user_id, period_from: from, period_to: to, amount, method, note: note.trim() || undefined }, branch, id);
      toast.success(`سُجل صرف ${fmtNum(amount)} د.ع`);
      void qc.invalidateQueries({ queryKey: ["fin"] });
      onClose();
    } catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); }
  }
  return (
    <Modal open onClose={onClose} title={`صرف مستحقات ${row.user_name}`} icon="hand-coins" width={460}>
      <span className="sub">عن الفترة <span className="num">{fmtDate(from)}</span> إلى <span className="num">{fmtDate(to)}</span>. المتبقي <b className="num">{fmtNum(row.balance)}</b> د.ع.</span>
      <MoneyInput label="المبلغ" value={amount} onChange={setAmount} />
      {amount > row.balance && <Alert tone="warn">المبلغ أكبر من المتبقي، ويُسجل كسلفة ويصبح الرصيد سالباً.</Alert>}
      <Segmented value={method} onChange={setMethod} options={[{ value: "cash", label: "نقداً", icon: "banknote" }, { value: "transfer", label: "تحويل", icon: "arrow-left-right" }]} />
      <TextInput label="ملاحظة" value={note} onChange={setNote} />
      <span className="sub-sm">يُسجل في الكشف وسجل التدقيق، ولا يحرك صندوق الحساب اليومي ولا يمكن حذفه.</span>
      <Button loading={busy} disabled={amount <= 0} icon="check" onClick={save}>تسجيل الصرف</Button>
    </Modal>
  );
}

function PlanDialog({ branch, userId, onClose }: { branch?: string; userId?: string; onClose: () => void }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["fin", "pay-plans", branch], queryFn: () => entitlementsApi.plans(branch) });
  const latest = q.data?.items.find((p) => p.user_id === userId);
  const [user, setUser] = useState(userId ?? "");
  const [model, setModel] = useState<"percentage" | "fixed" | "per_case">(latest?.model ?? "fixed");
  const [percent, setPercent] = useState(String(latest?.percent ?? ""));
  const [amount, setAmount] = useState(latest?.fixed_monthly ?? latest?.per_case_amount ?? 0);
  const [from, setFrom] = useState(todayBaghdad().slice(0, 8) + "01");
  const [busy, setBusy] = useState(false);
  const pct = Number(percent);
  const valid = !!user && (model === "percentage" ? percent !== "" && pct >= 0 && pct <= 100 : amount >= 0);
  async function save() {
    setBusy(true);
    try {
      await entitlementsApi.savePlan({ user_id: user, model, percent: model === "percentage" ? pct : undefined, fixed_monthly: model === "fixed" ? amount : undefined, per_case_amount: model === "per_case" ? amount : undefined, effective_from: from }, branch);
      toast.success("حُفظ نظام الأجر");
      void qc.invalidateQueries({ queryKey: ["fin"] });
      onClose();
    } catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); }
  }
  return (
    <Modal open onClose={onClose} title="نظام الأجر" icon="percent" width={460}>
      <ISelect label="الموظف" value={user} onChange={(v) => setUser(v ?? "")} loading={q.isPending} options={(q.data?.staff ?? []).map((s) => ({ value: s.user_id, label: s.full_name, hint: roleAr(s.role) }))} />
      <Segmented value={model} onChange={setModel} options={[{ value: "percentage", label: "نسبة" }, { value: "fixed", label: "أجر ثابت" }, { value: "per_case", label: "لكل حالة" }]} />
      {model === "percentage"
        ? <Field label="النسبة %" ltr inputMode="decimal" value={percent} onChange={(e) => setPercent(e.target.value.replace(/[^\d.]/g, ""))} hint="للطبيب تبقى النسبة المسجلة في الفاتورة لحظة الفوترة. هذا الحقل يخص بقية الكوادر." />
        : <MoneyInput label={model === "fixed" ? "الأجر الشهري" : "أجر الحالة"} value={amount} onChange={setAmount} />}
      <DateField label="يسري من" value={from} onChange={(v) => { if (v) setFrom(v); }} />
      <Button loading={busy} disabled={!valid} icon="check" onClick={save}>حفظ</Button>
    </Modal>
  );
}

// ------------------------------------------------------------------ المدفوعات
export function PaymentsScreen() {
  const r = useRange("today");
  const [branch, setBranch] = useState("");
  const q = useQuery({ queryKey: ["fin", "payments", branch, r.from, r.to], queryFn: () => entitlementsApi.payments({ branch_id: branch || undefined, from: r.from, to: r.to, page_size: 200 }) });
  const shown = q.data?.items ?? [];
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">{r.ui}<BranchFilter value={branch} onChange={setBranch} /></div>
      {q.data && <span className="sub">{q.data.total > shown.length ? <>يعرض أحدث <span className="num">{shown.length}</span> من <span className="num">{fmtNum(q.data.total)}</span> دفعة. ضيّق الفترة لرؤية الباقي.</> : <>{paymentsAr(q.data.total)} بمجموع <b className="num">{fmtNum(shown.reduce((s, p) => s + p.amount, 0))}</b> د.ع</>}</span>}
      <DataGrid aria-label="المدفوعات" rows={q.data?.items} loading={q.isPending} error={q.isError ? errorMessage(q.error) : undefined} rowKey={(p) => p.payment_id} minWidth={820}
        search={{ placeholder: "ابحث بالمريض أو الإيصال أو رقم الملف" }} empty={{ icon: "banknote", title: "لا مدفوعات للفترة" }}
        columns={[
          { key: "patient_name", header: "المريض", sortable: true, value: (p) => `${p.patient_name} ${p.file_number} ${p.receipt_number ?? ""}`, cell: (p) => <CellStack title={p.patient_name} sub={p.file_number} /> },
          { key: "receipt_number", header: "الإيصال", cell: (p) => <span className="num text-xs">{p.receipt_number ?? "—"}</span> },
          { key: "branch_name", header: "الفرع", cell: (p) => p.branch_name },
          { key: "methods", header: "الطريقة", cell: (p) => p.methods },
          { key: "amount", header: "المبلغ", numeric: true, sortable: true, cell: (p) => <span className="font-bold">{fmtNum(p.amount)}</span> },
          { key: "created_at", header: "الوقت", sortable: true, cell: (p) => <CellStack title={fmtDateTime(p.created_at)} sub={p.cashier_name ?? "الدفع الإلكتروني"} /> },
        ]} />
    </div>
  );
}

// ------------------------------------------------------------------ الكشف اليومي والشهري
export function StatementScreen() {
  const r = useRange();
  const [branch, setBranch] = useState("");
  const [group, setGroup] = useState<"day" | "month">("day");
  const q = useQuery({ queryKey: ["fin", "statement", branch, r.from, r.to, group], queryFn: () => entitlementsApi.statement2({ branch_id: branch || undefined, from: r.from, to: r.to, group }) });
  const label = (x: StatementRow) => (x.period === "total" ? "المجموع" : group === "day" ? fmtDate(x.period) : fmtMonthYear(`${x.period}-01`));
  const t = q.data?.totals;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">{r.ui}<BranchFilter value={branch} onChange={setBranch} /><Segmented value={group} onChange={setGroup} options={[{ value: "day", label: "يومي", icon: "calendar-days" }, { value: "month", label: "شهري", icon: "calendar" }]} /></div>
      {q.isPending ? <Spinner /> : q.isError ? <Alert tone="danger">{errorMessage(q.error)}</Alert> : t && <>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Stat icon="banknote" label="صافي الإيراد" value={fmtNum(t.net)} sub={paymentsAr(t.payments_count)} />
          <Stat icon="receipt-text" label="المصاريف" value={fmtNum(t.expenses)} tone="text-danger" />
          <Stat icon="hand-coins" label="المستحقات المصروفة" value={fmtNum(t.payouts)} tone="text-warn" />
          <Stat icon="scale" label="الصافي بعد التكاليف" value={fmtNum(t.net_after_costs)} tone="text-success" />
        </div>
        <DataGrid<StatementRow> aria-label="الكشف" rows={[...q.data.rows, t]} rowKey={(x) => x.period} minWidth={860} pageSize={0} empty={{ icon: "file-text", title: "لا بيانات للفترة" }}
          rowClassName={(x) => (x.period === "total" ? "bg-bg font-bold" : "")}
          columns={[
            { key: "period", header: group === "day" ? "اليوم" : "الشهر", cell: (x) => <span className="num text-xs">{label(x)}</span> },
            { key: "gross", header: "الإجمالي", numeric: true, cell: (x) => fmtNum(x.gross) },
            { key: "refunds", header: "الاسترجاع", numeric: true, cell: (x) => fmtNum(x.refunds) },
            { key: "net", header: "الصافي", numeric: true, cell: (x) => <span className="font-bold">{fmtNum(x.net)}</span> },
            { key: "cash_in", header: "نقد داخل", numeric: true, cell: (x) => fmtNum(x.cash_in) },
            { key: "expenses", header: "المصاريف", numeric: true, cell: (x) => fmtNum(x.expenses) },
            { key: "payouts", header: "الصرف", numeric: true, cell: (x) => fmtNum(x.payouts) },
            { key: "net_after_costs", header: "بعد التكاليف", numeric: true, cell: (x) => <span className={`font-bold ${x.net_after_costs < 0 ? "text-danger-strong" : ""}`}>{fmtNum(x.net_after_costs)}</span> },
          ]} />
      </>}
    </div>
  );
}
