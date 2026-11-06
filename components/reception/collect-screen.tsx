"use client";
/** التحصيل — Reception.dc.html (isCollect): السلة الموحدة + طريقة الدفع + معاينة الإيصال. العقد 8 و9. */
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Icon } from "@/components/icon";
import { toast } from "@/components/toast";
import { Alert, Button, Card, Empty, Spinner } from "@/components/ui";
import { BrandMark } from "@/components/brand-mark";
import { billingApi, DEPT, type BillableItem, type PaymentResult, type Tender } from "@/lib/api/billing";
import { fmtTime } from "@/lib/format";
import { errorMessage, isApiError } from "@/lib/api/errors";
import { fmtDateTime, fmtNum } from "@/lib/format";
import { uuidv7 } from "@/lib/id";
import { useAuth } from "@/lib/auth/store";
import { LIVE_KEY } from "@/lib/reception/use-live-queue";
import { reprintReceipt } from "@/lib/reception/print";
import { ChoiceGrid, MoneyInput, PatientHeader, PatientPicker, ShiftGuard, TextInput, useCurrentShift, usePatientParam, SHIFT_KEY } from "./common";
import { DeferDialog } from "./defer-dialog";
import { ReceiptPrintDialog } from "./receipt-dialog";

type Mode = "cash" | "pos" | "mixed";

export function CollectScreen() {
  const pp = usePatientParam();
  if (!pp.id) return <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]"><div className="flex flex-col gap-4"><ShiftGuard /><PatientPicker title="تحصيل لمريض" quick="unpaid" onPick={pp.set} /><ShiftReceipts /></div><Hint /></div>;
  if (pp.loading) return <Spinner />;
  if (pp.error || !pp.patient) return <Alert tone="danger">{errorMessage(pp.error)}</Alert>;
  return <Collect key={pp.patient.patient_id} onClear={() => pp.set(null)} patient={pp.patient} />;
}

function Hint() {
  return (
    <Card className="flex flex-col gap-2 p-5 text-sm leading-7 text-ink-2">
      <span className="flex items-center gap-2 text-base font-bold text-ink"><Icon name="shopping-basket" size={19} className="text-primary" />ادفع حيث تُخدم</span>
      <span>تظهر بنود قسمك أولاً، ويمكن تحصيل كل بنود المريض غير المدفوعة مرة واحدة.</span>
      <span>كل تحصيل يُصدر إيصالاً برقم تسلسلي و QR ويُطبع على الطابعة.</span>
    </Card>
  );
}

function Collect({ patient, onClear }: { patient: NonNullable<ReturnType<typeof usePatientParam>["patient"]>; onClear: () => void }) {
  const shift = useCurrentShift();
  const user = useAuth((s) => s.user);
  const qc = useQueryClient();
  const dept = shift.data?.department ?? undefined;
  const basket = useQuery({ queryKey: ["basket", patient.patient_id, dept], queryFn: () => billingApi.basket(patient.patient_id, dept) });
  const items = useMemo(() => basket.data?.items ?? [], [basket.data]);
  const [unchecked, setUnchecked] = useState<Record<string, boolean>>({});
  const [mode, setMode] = useState<Mode>("cash");
  const [useCredit, setUseCredit] = useState(true);
  const [posAmount, setPosAmount] = useState(0);
  const [posRef, setPosRef] = useState("");
  const [busy, setBusy] = useState(false);
  const [key, setKey] = useState(uuidv7);
  const [done, setDone] = useState<PaymentResult | null>(null);
  const [preview, setPreview] = useState<PaymentResult | null>(null);

  const chosen = items.filter((i) => !unchecked[i.invoice_item_id]);
  const canDefer = useAuth((s) => s.can("deferrals.grant"));
  const [defer, setDefer] = useState(false);
  const deferrable = chosen.filter((i) => i.status !== "deferred");
  const subtotal = chosen.reduce((a, i) => a + i.price, 0);
  const credit = useCredit ? Math.min(basket.data?.deposit_credit ?? 0, subtotal) : 0;
  const due = subtotal - credit;
  const pos = mode === "pos" ? due : mode === "mixed" ? Math.min(posAmount, due) : 0;
  const cash = due - pos;
  useEffect(() => { setKey(uuidv7()); }, [subtotal, credit, mode, pos]); // تغيّر الطلب = مفتاح جديد

  const needsRef = pos > 0 && !posRef.trim();
  const canPay = !!shift.data && chosen.length > 0 && !needsRef && !busy;

  async function pay() {
    setBusy(true);
    const tenders: Tender[] = [];
    if (cash > 0) tenders.push({ method: "cash", amount: cash });
    if (pos > 0) tenders.push({ method: "pos", amount: pos, pos_reference: posRef.trim() });
    try {
      const r = await billingApi.pay({ payment_id: key, patient_id: patient.patient_id, invoice_item_ids: chosen.map((i) => i.invoice_item_id), use_deposit_credit: credit, tenders }, key);
      setDone(r);
      toast.success(`تم التحصيل · ${r.receipt?.receipt_number ?? ""}`);
      setPreview(r); // معاينة الوصل الفعلي ثم الطباعة
      setUnchecked({}); setPosAmount(0); setPosRef("");
      void qc.invalidateQueries({ queryKey: ["basket", patient.patient_id] });
      void qc.invalidateQueries({ queryKey: ["patient", patient.patient_id] });
      void qc.invalidateQueries({ queryKey: LIVE_KEY });
      void qc.invalidateQueries({ queryKey: SHIFT_KEY });
    } catch (e) {
      if (isApiError(e) && (e.code === "ITEM_NOT_PAYABLE" || e.code === "INVOICE_ITEM_NOT_FOUND")) void basket.refetch();
      toast.error(isApiError(e) && e.code === "AMOUNT_MISMATCH" ? `المبلغ غير مطابق. المطلوب ${fmtNum(e.extra?.expected_amount as number)}` : errorMessage(e));
    } finally { setBusy(false); }
  }

  return (
    <div className="flex flex-col gap-4">
      <ShiftGuard />
      <ReceiptPrintDialog result={preview} onClose={() => setPreview(null)} />
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-4">
          <PatientHeader p={patient} onClear={onClear} />
          {done && <PaidBanner r={done} onClose={() => setDone(null)} />}
          <Card className="flex flex-col gap-3 p-[18px]">
            <div className="flex flex-wrap items-center gap-2.5">
              <Icon name="shopping-basket" size={20} className="text-primary" />
              <span className="flex-1 text-[17px] font-bold">السلة الموحدة</span>
              <span className="sub-sm">{dept ? `بنود ${DEPT[dept].label} أولاً · يمكن تحصيل الكل` : "كل البنود غير المدفوعة"}</span>
            </div>
            {basket.isPending ? <Spinner /> : basket.isError ? <Alert tone="danger">{errorMessage(basket.error)}</Alert>
              : !items.length ? <Empty icon="circle-check" title="لا توجد بنود غير مدفوعة" hint="كل مستحقات المريض مسددة." />
              : items.map((b) => <BasketRow key={b.invoice_item_id} b={b} on={!unchecked[b.invoice_item_id]} toggle={() => setUnchecked((u) => ({ ...u, [b.invoice_item_id]: !u[b.invoice_item_id] }))} />)}
          </Card>
          {items.length > 0 && (
            <Card className="flex flex-col gap-3 p-[18px]">
              <span className="text-[17px] font-bold">طريقة الدفع</span>
              <ChoiceGrid value={mode} onChange={setMode} options={[{ value: "cash", label: "نقداً", icon: "banknote" }, { value: "pos", label: "POS", icon: "credit-card" }, { value: "mixed", label: "نقد + POS", icon: "coins" }]} />
              {(basket.data?.deposit_credit ?? 0) > 0 && (
                <label className="flex cursor-pointer items-center gap-3 rounded-xl bg-success-soft px-3.5 py-3 text-success-strong">
                  <input type="checkbox" checked={useCredit} onChange={(e) => setUseCredit(e.target.checked)} className="size-4 accent-[rgb(var(--success))]" />
                  <Icon name="piggy-bank" size={18} />
                  <span className="flex-1 text-sm font-semibold">خصم رصيد المريض (عربون)</span>
                  <span className="num text-sm font-bold">{fmtNum(basket.data?.deposit_credit)}</span>
                </label>
              )}
              {mode === "mixed" && <MoneyInput label="مبلغ POS" value={posAmount} onChange={setPosAmount} icon="credit-card" strong={false} hint={`من ${fmtNum(due)}`} />}
              {mode !== "cash" && <TextInput label="رقم عملية POS" value={posRef} onChange={setPosRef} icon="hash" ltr placeholder="TX-883201" required />}
              <TenderLine icon="banknote" label="نقداً" amount={cash} />
              {pos > 0 && <TenderLine icon="credit-card" label="POS" amount={pos} refText={posRef} />}
            </Card>
          )}
        </div>
        <div className="flex flex-col gap-3 lg:sticky lg:top-24">
          <ReceiptPreview patientName={patient.full_name} file={patient.file_number} cashier={user?.full_name ?? ""} lines={chosen} credit={credit} total={due} />
          <Button onClick={pay} disabled={!canPay} loading={busy} icon="printer">تحصيل وطباعة الإيصال</Button>
          {canDefer && deferrable.length > 0 && <Button variant="ghost" size="md" icon="hand-coins" onClick={() => setDefer(true)}>تأجيل الدفع</Button>}
          {defer && <DeferDialog patientId={patient.patient_id} itemIds={deferrable.map((i) => i.invoice_item_id)} amount={deferrable.reduce((a, i) => a + i.price, 0)} onClose={() => setDefer(false)} onDone={() => { setDefer(false); void basket.refetch(); }} />}
          {done?.receipt && <ReprintButton receiptId={done.receipt.receipt_id} />}
          <span className="flex items-center justify-center gap-2 text-xs font-semibold text-ink-2">
            <Icon name={cash > 0 ? "lock-keyhole-open" : "lock-keyhole"} size={15} />
            {cash > 0 ? "النقد يُستلم يدوياً بعد طباعة الوصل" : "دفع بدون نقد"}
          </span>
        </div>
      </div>
    </div>
  );
}

function BasketRow({ b, on, toggle }: { b: BillableItem; on: boolean; toggle: () => void }) {
  const d = DEPT[b.department] ?? DEPT.clinic;
  return (
    <button onClick={toggle} aria-pressed={on} className={`flex items-center gap-3 rounded-xl border-[1.5px] p-3 text-start ${on ? "border-primary bg-primary-soft/60" : "border-line bg-surface"}`}>
      <span className={`grid size-[22px] shrink-0 place-items-center rounded-chip border-2 text-on-accent ${on ? "border-primary bg-primary" : "border-line-strong bg-surface"}`}>{on && <Icon name="check" size={14} strokeWidth={3} />}</span>
      <span className={`grid size-9 shrink-0 place-items-center rounded-xl ${d.cls}`}><Icon name={d.icon} size={18} /></span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-sm font-semibold">{b.service_name}{b.quantity > 1 && <span className="num"> ×{b.quantity}</span>}</span>
        <span className="sub-sm">{d.label}{b.ordered_by ? ` · ${b.ordered_by}` : ""}{b.status === "deferred" ? " · آجل" : ""}{b.is_current_department ? " · قسمك" : ""}</span>
      </span>
      <span className="num text-[15px] font-semibold">{fmtNum(b.price)}</span>
    </button>
  );
}

function TenderLine({ icon, label, amount, refText }: { icon: string; label: string; amount: number; refText?: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl bg-bg px-3.5 py-3">
      <Icon name={icon} size={19} className="text-primary" />
      <span className="flex-1 text-sm font-medium">{label}</span>
      {refText && <span className="num text-xs font-semibold text-ink-2">{refText}</span>}
      <span className="num min-w-[90px] text-end text-[17px] font-semibold">{fmtNum(amount)}</span>
    </div>
  );
}

/** معاينة الإيصال الحراري كما سيُطبع (البيانات الفعلية تأتي من print-payload بعد التحصيل). */
function ReceiptPreview({ patientName, file, cashier, lines, credit, total }: { patientName: string; file: string; cashier: string; lines: BillableItem[]; credit: number; total: number }) {
  return (
    <div className="flex flex-col gap-2.5 rounded-xl border-t-[6px] border-primary bg-surface px-5 py-[22px] shadow-pop">
      <div className="flex flex-col items-center gap-1 border-b border-dashed border-line-strong pb-2.5">
        <BrandMark size={40} />
        <span className="text-sm font-bold">مجمع الرحمة الطبي</span>
        <span className="sub-sm">مسودة قبل التحصيل · الوصل الفعلي يُعاين بعد التحصيل</span>
      </div>
      <div className="flex flex-wrap gap-x-1.5 text-xs text-ink-2"><span>الموظف: {cashier}</span><span aria-hidden>·</span><span className="num">{fmtDateTime(new Date().toISOString())}</span></div>
      <div className="flex justify-between text-xs text-ink-2"><span>{patientName}</span><span className="num">{file}</span></div>
      <div className="flex flex-col gap-1.5 border-y border-dashed border-line-strong py-2.5">
        {lines.length ? lines.map((l) => <div key={l.invoice_item_id} className="flex justify-between gap-2 text-[13px]"><span>{l.service_name}</span><span className="num">{fmtNum(l.price)}</span></div>)
          : <span className="sub-sm text-center">اختر بنوداً من السلة</span>}
        {credit > 0 && <div className="flex justify-between text-[13px] text-success-strong"><span>رصيد عربون</span><span className="num">−{fmtNum(credit)}</span></div>}
      </div>
      <div className="flex items-baseline justify-between"><span className="text-sm font-semibold">المجموع</span><span className="num text-2xl font-bold">{fmtNum(total)}</span></div>
      <div className="flex items-center gap-3 pt-1.5">
        <span className="grid size-[72px] shrink-0 place-items-center border border-ink"><Icon name="qr-code" size={56} strokeWidth={1.4} /></span>
        <span className="flex-1 text-[11px] leading-relaxed text-ink-2">امسح للتحقق من أصالة الإيصال. لا يعتد بأي إيصال يدوي.</span>
      </div>
    </div>
  );
}

function PaidBanner({ r, onClose }: { r: PaymentResult; onClose: () => void }) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-card border border-success/40 bg-success-soft p-4">
      <span className="grid size-12 place-items-center rounded-2xl bg-success text-on-accent"><Icon name="circle-check" size={24} /></span>
      <div className="flex min-w-[180px] flex-1 flex-col">
        <span className="font-bold">تم التحصيل · <span className="num">{fmtNum(r.total_paid)}</span> د.ع</span>
        <span className="text-[13px] text-success-strong">إيصال <span className="num">{r.receipt?.receipt_number}</span>{r.deposit_used > 0 && <> · رصيد مستخدم <span className="num">{fmtNum(r.deposit_used)}</span></>}</span>
      </div>
      <button onClick={onClose} aria-label="إغلاق" className="grid size-9 place-items-center rounded-full hover:bg-surface"><Icon name="x" size={18} /></button>
    </div>
  );
}

export function ReprintButton({ receiptId, compact, onDone }: { receiptId: string; compact?: boolean; onDone?: () => void }) {
  const [busy, setBusy] = useState(false);
  const [used, setUsed] = useState(false);
  return (
    <Button variant="ghost" size="md" loading={busy} disabled={used} icon="printer-check"
      onClick={async () => { setBusy(true); try { const n = await reprintReceipt(receiptId); setUsed(true); toast.info(`طُبعت النسخة ${n}`); onDone?.(); } catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); } }}>
      {compact ? "نسخة مكررة" : "نسخة مكررة (مرة واحدة)"}
    </Button>
  );
}

/** إيصالات ورديتي (GET /receipts): نسخة مكررة لأي إيصال سابق. الاستقبال مرة واحدة لكل إيصال ولا تفتح الدرج. */
function ShiftReceipts() {
  const shift = useCurrentShift();
  const q = useQuery({ queryKey: ["receipts", "shift", shift.data?.shift_id], enabled: !!shift.data, queryFn: () => billingApi.shiftReceipts(), refetchInterval: 30_000 });
  const [filter, setFilter] = useState("");
  if (!shift.data) return null;
  const items = (q.data?.items ?? []).filter((r) => !filter.trim() || [r.receipt_number, r.patient_name, r.file_number, r.ticket_number].some((x) => x?.includes(filter.trim())));
  return (
    <Card className="flex flex-col gap-3 p-[18px]">
      <div className="flex flex-wrap items-center gap-2.5">
        <Icon name="receipt-text" size={20} className="text-primary" />
        <span className="flex-1 text-[17px] font-bold">إيصالات ورديتي</span>
        <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="رقم الإيصال، الاسم، الدور" aria-label="بحث في الإيصالات"
          className="h-9 w-48 rounded-full border border-line-strong bg-surface px-3.5 text-sm outline-none focus:border-primary" />
      </div>
      {q.isPending ? <Spinner /> : q.isError ? <Alert tone="danger">{errorMessage(q.error)}</Alert>
        : !items.length ? <Empty icon="receipt-text" title="لا إيصالات" hint="تظهر هنا إيصالات ورديتك المفتوحة." />
        : <div className="flex max-h-[420px] flex-col gap-2 overflow-y-auto">
            {items.map((r) => (
              <div key={r.receipt_id} className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface p-3">
                <span className="flex min-w-[180px] flex-1 flex-col">
                  <span className="text-sm font-semibold"><span className="num">{r.receipt_number}</span> · {r.type_ar}{r.status !== "valid" ? <span className="text-warn-strong"> · {r.status === "refunded" ? "مسترجع" : "مسترجع جزئياً"}</span> : null}</span>
                  <span className="sub-sm">{r.patient_name ?? "—"}{r.doctor_name ? ` · ${r.doctor_name}` : ""}{r.ticket_number ? <> · دور <span className="num">{r.ticket_number}</span></> : null} · <span className="num">{fmtTime(r.issued_at)}</span></span>
                </span>
                <span className="num text-[15px] font-semibold">{fmtNum(r.total)}</span>
                {r.can_reprint ? <ReprintButton receiptId={r.receipt_id} compact onDone={() => void q.refetch()} />
                  : <span className="sub-sm">طُبعت نسخة · للمحاسب فقط</span>}
              </div>
            ))}
          </div>}
    </Card>
  );
}
