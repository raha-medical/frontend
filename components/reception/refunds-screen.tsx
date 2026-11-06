"use client";
/** الاسترجاع — Reception.dc.html (isRefunds): البنود المدفوعة، لوحة استرجاع بند، وطلبات اليوم. العقد 8. */
import { useState } from "react";
import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { Icon } from "@/components/icon";
import { toast } from "@/components/toast";
import { Alert, Button, Card, CellStack, DataGrid, Spinner } from "@/components/ui";
import { billingApi, DEPT, type Invoice, type InvoiceItem, type Refund, type RefundMethod } from "@/lib/api/billing";
import { errorMessage, isApiError } from "@/lib/api/errors";
import { fmtNum, fmtTime } from "@/lib/format";
import { uuidv7 } from "@/lib/id";
import { useAuth } from "@/lib/auth/store";
import { printReceipt } from "@/lib/reception/print";
import { todayBaghdad } from "@/lib/date";
import { ChoiceGrid, MoneyInput, PatientHeader, PatientPicker, SHIFT_KEY, TextInput, usePatientParam } from "./common";

const REFUND_ST: Record<Refund["status"], { label: string; cls: string; icon: string }> = {
  completed: { label: "منفذ", cls: "bg-success-soft text-success-strong", icon: "circle-check" },
  pending_approval: { label: "بانتظار الاعتماد", cls: "bg-warn-soft text-warn-strong", icon: "hourglass" },
  rejected: { label: "مرفوض", cls: "bg-danger-soft text-danger-strong", icon: "circle-x" },
};

export function RefundsScreen() {
  const pp = usePatientParam();
  const [sel, setSel] = useState<{ item: InvoiceItem; inv: Invoice } | null>(null);
  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_400px]">
      <div className="flex min-w-0 flex-col gap-4">
        {!pp.id ? <PatientPicker title="استرجاع لمريض" onPick={pp.set} />
          : pp.loading ? <Spinner /> : pp.patient ? (
            <>
              <PatientHeader p={pp.patient} onClear={() => { setSel(null); pp.set(null); }} />
              <PaidItems patientId={pp.patient.patient_id} selected={sel?.item.invoice_item_id} onSelect={(item, inv) => setSel({ item, inv })} />
            </>
          ) : <Alert tone="danger">{errorMessage(pp.error)}</Alert>}
        <RefundLog />
      </div>
      {sel ? <RefundPanel key={sel.item.invoice_item_id} item={sel.item} inv={sel.inv} onClose={() => setSel(null)} />
        : <Card className="flex flex-col items-center gap-2 p-8 text-center"><span className="grid size-12 place-items-center rounded-2xl bg-danger-soft text-danger"><Icon name="undo-2" size={22} /></span><span className="font-bold">اختر بنداً مدفوعاً</span><span className="sub">الاسترجاع كلي أو جزئي، والسبب إلزامي. ما فوق حد الاستقبال يحتاج اعتماد المحاسب.</span></Card>}
    </div>
  );
}

function PaidItems({ patientId, selected, onSelect }: { patientId: string; selected?: string; onSelect: (i: InvoiceItem, inv: Invoice) => void }) {
  const list = useQuery({ queryKey: ["invoices", "patient", patientId], queryFn: () => billingApi.invoices({ patient_id: patientId, page_size: 20 }) });
  const ids = (list.data?.items ?? []).filter((i) => i.paid_amount > 0).map((i) => i.invoice_id);
  const invs = useQueries({ queries: ids.map((id) => ({ queryKey: ["invoice", id], queryFn: () => billingApi.invoice(id) })) });
  const rows = invs.flatMap((q) => (q.data ? q.data.items.filter((i) => i.status === "paid" || i.status === "partially_refunded" || i.status === "refunded").map((i) => ({ i, inv: q.data! })) : []));
  const pending = list.isPending || invs.some((q) => q.isPending);
  return (
    <DataGrid title={<span className="flex items-center gap-2"><Icon name="receipt-text" size={19} className="text-primary" />البنود المدفوعة</span>} aria-label="البنود المدفوعة"
      rows={pending ? undefined : rows} loading={pending} error={list.isError ? errorMessage(list.error) : undefined} rowKey={(r) => r.i.invoice_item_id} minWidth={480} dense pageSize={0}
      selectedKey={selected} empty={{ icon: "receipt-text", title: "لا توجد بنود مدفوعة لهذا المريض" }}
      columns={[
        { key: "service", header: "البند", sortable: true, value: (r) => r.i.service_name, cell: ({ i, inv }) => {
          const d = DEPT[i.department] ?? DEPT.clinic;
          return <CellStack title={i.service_name} icon={<span className={`grid size-9 shrink-0 place-items-center rounded-xl ${d.cls}`}><Icon name={d.icon} size={18} /></span>}
            sub={<span className={i.performed_at ? "text-warn-strong" : ""}><span className="num">{inv.invoice_number}</span>{i.performed_at ? " · منفذ: يحتاج صلاحية الاعتماد" : ""}{i.refunded_amount > 0 ? ` · مسترجع ${fmtNum(i.refunded_amount)}` : ""}</span>} />;
        } },
        { key: "left", header: "المتبقي", numeric: true, sortable: true, width: "100px", value: (r) => r.i.net_price - r.i.refunded_amount, cell: ({ i }) => <span className="font-semibold">{fmtNum(i.net_price - i.refunded_amount)}</span> },
        { key: "act", header: <span className="sr-only">إجراء</span>, width: "116px", sticky: true, cell: ({ i, inv }) => { const full = i.net_price - i.refunded_amount <= 0, on = selected === i.invoice_item_id; return (
          <button disabled={full} onClick={() => onSelect(i, inv)} className={`flex h-[34px] items-center gap-1.5 rounded-full px-3 text-[13px] font-semibold disabled:opacity-45 ${on ? "bg-danger text-on-accent" : "border border-danger/40 bg-surface text-danger-strong"}`}><Icon name="undo-2" size={15} />{full ? "مسترجع" : "استرجاع"}</button>
        ); } },
      ]} />
  );
}

function RefundPanel({ item, inv, onClose }: { item: InvoiceItem; inv: Invoice; onClose: () => void }) {
  const qc = useQueryClient();
  const canApprove = useAuth((s) => s.can("refunds.approve"));
  const left = item.net_price - item.refunded_amount;
  const [amount, setAmount] = useState(left);
  const [method, setMethod] = useState<RefundMethod>("cash");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [key] = useState(uuidv7);
  const ratio = item.net_price ? amount / item.net_price : 0;
  const docAdj = -Math.round(item.doctor_share * ratio);
  const cxAdj = -(amount + docAdj);
  const valid = amount > 0 && amount <= left && reason.trim().length > 0;

  async function submit() {
    setBusy(true);
    try {
      const r = await billingApi.refund(item.invoice_item_id, { refund_id: key, amount, method, reason: reason.trim() }, key);
      if (r.status === "completed") { toast.success(`تم الاسترجاع · ${r.receipt?.receipt_number ?? ""}`); void printReceipt(r); }
      else toast.info("أُرسل طلب الاسترجاع للمحاسب للاعتماد");
      void qc.invalidateQueries({ queryKey: ["invoice", inv.invoice_id] });
      void qc.invalidateQueries({ queryKey: ["invoices"] });
      void qc.invalidateQueries({ queryKey: ["refunds"] });
      void qc.invalidateQueries({ queryKey: SHIFT_KEY });
      onClose();
    } catch (e) {
      toast.error(isApiError(e) && e.code === "REFUND_EXCEEDS_PAID" ? `المبلغ أكبر من المتبقي (${fmtNum(e.extra?.refundable_amount as number)})` : errorMessage(e));
    } finally { setBusy(false); }
  }

  return (
    <Card className="flex flex-col gap-3.5 p-5 shadow-pop lg:sticky lg:top-24">
      <div className="flex items-center gap-2.5">
        <span className="grid size-10 place-items-center rounded-xl bg-danger-soft text-danger"><Icon name="undo-2" size={20} /></span>
        <div className="flex flex-1 flex-col"><span className="text-[17px] font-bold">استرجاع بند</span><span className="sub">{item.service_name} · مدفوع <span className="num">{fmtNum(left)}</span></span></div>
        <button onClick={onClose} aria-label="إغلاق" className="grid size-9 place-items-center rounded-full hover:bg-bg"><Icon name="x" size={18} /></button>
      </div>
      <MoneyInput label="المبلغ المسترجع" value={amount} onChange={setAmount} hint={amount === left ? "كلي" : "جزئي"} autoFocus />
      {amount > left && <span className="text-xs font-semibold text-danger-strong">الحد الأقصى {fmtNum(left)}</span>}
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">طريقة الإرجاع</span>
        <ChoiceGrid value={method} onChange={setMethod} cols={2} options={[
          { value: "cash", label: "نقداً", icon: "banknote" },
          { value: "pos", label: "عكس على POS", icon: "credit-card" },
          { value: "patient_credit", label: "رصيد للمريض", icon: "piggy-bank" },
          { value: "online_reversal", label: "عكس إلكتروني", icon: "globe", disabled: true, hint: "يُفعّل مع الدفع الإلكتروني" },
        ]} />
      </div>
      <TextInput label="السبب" value={reason} onChange={setReason} multiline required placeholder="مثال: المريض ألغى التحليل قبل سحب العينة" />
      <div className="flex flex-col gap-1.5 rounded-xl bg-bg p-3 text-[13px]">
        <div className="flex justify-between"><span className="text-ink-2">تعديل حصة الطبيب (تقديري)</span><span className="num">{fmtNum(docAdj)}</span></div>
        <div className="flex justify-between"><span className="text-ink-2">تعديل حصة المجمع (تقديري)</span><span className="num">{fmtNum(cxAdj)}</span></div>
      </div>
      <span className={`flex items-center gap-2 text-xs ${canApprove ? "text-success-strong" : "text-warn-strong"}`}>
        <Icon name={canApprove ? "key-round" : "info"} size={15} />
        {canApprove ? "لديك صلاحية الاعتماد: ينفذ فوراً" : "ما فوق حد الاستقبال يُرسل للمحاسب للاعتماد ولا يُصرف الآن"}
      </span>
      <Button variant="danger" onClick={submit} disabled={!valid} loading={busy} icon="undo-2">تنفيذ الاسترجاع وطباعة الإيصال</Button>
    </Card>
  );
}

function RefundLog() {
  const q = useQuery({ queryKey: ["refunds", "today"], queryFn: () => billingApi.refunds({ page_size: 50 }), refetchInterval: 60_000 });
  const today = todayBaghdad();
  const items = q.data?.items.filter((r) => todayBaghdad(new Date(r.created_at)) === today);
  return (
    <DataGrid title="طلبات الاسترجاع اليوم" aria-label="طلبات الاسترجاع اليوم" rows={items} loading={q.isPending} error={q.isError ? errorMessage(q.error) : undefined} rowKey={(r) => r.refund_id} minWidth={480} dense pageSize={10}
      empty={{ icon: "undo-2", title: "لا توجد طلبات اليوم" }}
      columns={[
        { key: "service_name", header: "البند", sortable: true, value: (r) => `${r.service_name} ${r.reason}`, cell: (r) => <CellStack title={r.service_name} sub={r.reason} /> },
        { key: "created_at", header: "الوقت", width: "90px", sortable: true, cell: (r) => <span className="num whitespace-nowrap text-xs text-ink-2">{fmtTime(r.created_at)}</span> },
        { key: "amount", header: "المبلغ", numeric: true, width: "100px", sortable: true, cell: (r) => fmtNum(r.amount) },
        { key: "status", header: "الحالة", width: "130px", value: (r) => REFUND_ST[r.status]?.label, cell: (r) => { const st = REFUND_ST[r.status]; return <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 text-xs ${st.cls}`}><Icon name={st.icon} size={13} />{st.label}</span>; } },
      ]} />
  );
}
