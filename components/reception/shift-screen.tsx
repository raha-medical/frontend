"use client";
/** الحساب اليومي — Reception.dc.html (isShift): الفتح ونقطة التحصيل، وملخص اليوم للموظف، والإغلاق بالمبلغ المعدود والوصولات غير المطبوعة. العقد 10. */
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Icon } from "@/components/icon";
import { toast } from "@/components/toast";
import { Alert, Button, Card, ISelect, Spinner } from "@/components/ui";
import { catalogApi, DEPT, shiftsApi, type Shift, type ShiftSummary } from "@/lib/api/billing";
import { errorMessage, isApiError } from "@/lib/api/errors";
import { fmtNum, fmtTime } from "@/lib/format";
import { uuidv7 } from "@/lib/id";
import { useAuth } from "@/lib/auth/store";
import { useSync } from "@/lib/offline/sync-provider";
import { DEVICE_CODE } from "@/lib/config";
import { reserveReceiptBlock, returnReceiptBlock } from "@/lib/agent/lifecycle";
import { reprintReceipt } from "@/lib/reception/print";
import { ShiftReceipts } from "./collect-screen";
import { MoneyInput, SHIFT_KEY, TextInput, useCurrentShift } from "./common";

const DENOMS = [25000, 10000, 5000, 1000, 250] as const;
/** فوق هذه الفكة يُطلب تأكيد ثانٍ قبل فتح الحساب اليومي (يمنع خطأ كتابة مثل 50,00050000). */
const LARGE_FLOAT = 5_000_000;

export function ShiftScreen() {
  const shift = useCurrentShift();
  const [closed, setClosed] = useState<{ s: Shift; cash: number; pos: number } | null>(null);
  // حساب يوم سابق أُغلق تلقائياً: يُقرّ صاحبه بالمبلغ المعدود قبل أي شيء آخر
  const ack = useQuery({ queryKey: [...SHIFT_KEY, "ack"], queryFn: () => shiftsApi.awaitingAck() });
  if (shift.isPending || ack.isPending) return <Spinner />;
  if (shift.isError) return <Alert tone="danger">{errorMessage(shift.error)}</Alert>;
  if (ack.data?.length && !closed) return <CloseShift shift={ack.data[0]} onClosed={(r) => { setClosed(r); void ack.refetch(); }} />;
  if (shift.data) return <><CloseShift shift={shift.data} onClosed={setClosed} /><ShiftReceipts /></>;
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-4 lg:grid-cols-2">
      {closed ? (
        <Card className="flex flex-col items-center gap-3 p-7 text-center">
          <span className="grid size-[72px] place-items-center rounded-full bg-warn-soft text-warn"><Icon name="hourglass" size={34} /></span>
          <span className="text-xl font-bold">أُغلق الحساب اليومي</span>
          <span className="text-sm leading-7 text-ink-2">الحالة: بانتظار مراجعة المحاسب.<br />أعلنت <b className="num">{fmtNum(closed.cash)}</b> نقداً و <b className="num">{fmtNum(closed.pos)}</b> POS.</span>
          <Variance s={closed.s} />
          <span className="flex items-center gap-1.5 text-[13px] font-semibold text-ink-2"><Icon name="undo-dot" size={15} />أُعيدت أرقام الإيصالات غير المستخدمة من الكتلة</span>
        </Card>
      ) : (
        <Card className="flex flex-col items-center gap-3 p-7 text-center">
          <span className="grid size-[72px] place-items-center rounded-full bg-primary-soft text-primary"><Icon name="lock-keyhole" size={32} /></span>
          <span className="text-xl font-bold">لا يوجد حساب يومي مفتوح</span>
          <span className="text-sm leading-7 text-ink-2">افتح الحساب اليومي قبل التحصيل. كل نقطة تحصيل (عيادة، مختبر، أشعة) لها حساب وإغلاق مستقل.</span>
        </Card>
      )}
      <OpenShift />
    </div>
  );
}

function OpenShift() {
  const user = useAuth((s) => s.user);
  const qc = useQueryClient();
  const clinics = useQuery({ queryKey: ["clinics", user?.branch_id], queryFn: () => catalogApi.clinics(user!.branch_id), enabled: !!user });
  const [float, setFloat] = useState(50000);
  const [point, setPoint] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [confirmLarge, setConfirmLarge] = useState(false);
  const [key] = useState(uuidv7);
  const large = float > LARGE_FLOAT;
  const mine = (clinics.data?.items ?? []).filter((c) => c.is_active && (user?.clinic_ids.length ? user.clinic_ids.includes(c.clinic_id) || c.department !== "clinic" : true));

  async function open() {
    // فكة غير معتادة: خطوة تأكيد ثانية بدل فتح الحساب اليومي بها مباشرة
    if (large && !confirmLarge) { setConfirmLarge(true); return; }
    setBusy(true);
    try {
      let onDevice = !!DEVICE_CODE;
      try {
        await shiftsApi.open({ shift_id: key, opening_float: float, clinic_id: point || null, device_code: DEVICE_CODE }, key);
      } catch (e) {
        // رمز الجهاز غير مسجل في هذا الفرع: نفتح الحساب اليومي بدونه (بلا أوفلاين ولا كتلة) وننبه
        if (!(isApiError(e) && e.errors?.device_code && DEVICE_CODE)) throw e;
        onDevice = false;
        await shiftsApi.open({ shift_id: key, opening_float: float, clinic_id: point || null }, key);
        toast.warn(`فُتح الحساب اليومي بدون جهاز: الرمز ${DEVICE_CODE} غير مسجل في هذا الفرع (الإدارة ← النظام ← الأجهزة)`);
      }
      toast.success("فُتح الحساب اليومي");
      // كتلة أرقام الإيصالات للعمل أوفلاين، تُسلَّم للوكيل المحلي
      if (onDevice) {
        const r = await reserveReceiptBlock();
        if (r.warning) toast.warn(r.warning);
      }
      await qc.invalidateQueries({ queryKey: SHIFT_KEY });
    } catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); }
  }

  return (
    <Card className="flex flex-col gap-3.5 p-[22px]">
      <span className="flex items-center gap-2.5 text-[17px] font-bold"><Icon name="lock-keyhole-open" size={20} className="text-primary" />فتح حساب يومي جديد</span>
      <MoneyInput label="الفكة المستلمة" value={float} onChange={(n) => { setFloat(n); setConfirmLarge(false); }} icon="coins" />
      {confirmLarge && large && (
        <Alert tone="warn" icon="triangle-alert">الفكة {fmtNum(float)} د.ع أكبر بكثير من المعتاد. تأكد من الرقم، ثم اضغط «تأكيد الفكة وفتح الحساب اليومي».</Alert>
      )}
      <div className="flex flex-col gap-1.5">
        <ISelect label="نقطة التحصيل" placeholder="استقبال عام" value={point} onChange={setPoint} loading={clinics.isPending} hint="إيرادات الحساب اليومي تُنسب لهذا القسم في تقارير المحاسب."
          options={clinics.data ? [{ value: "", label: "استقبال عام", icon: "concierge-bell" }, ...mine.map((c) => ({ value: c.clinic_id, label: c.name, icon: DEPT[c.department]?.icon ?? "building" }))] : undefined} />
      </div>
      <span className="flex items-center gap-2 text-[13px] text-ink-2"><Icon name="ticket" size={16} />تُحجز كتلة أرقام إيصالات للعمل أوفلاين تلقائياً</span>
      <Button onClick={open} loading={busy} icon="play">{confirmLarge && large ? "تأكيد الفكة وفتح الحساب اليومي" : "فتح الحساب اليومي"}</Button>
    </Card>
  );
}


function CloseShift({ shift, onClosed }: { shift: Shift; onClosed: (r: { s: Shift; cash: number; pos: number }) => void }) {
  const qc = useQueryClient();
  const sync = useSync();
  const [n, setN] = useState<Record<number, number>>({ 25000: 0, 10000: 0, 5000: 0, 1000: 0, 250: 0 });
  const [slips, setSlips] = useState(0);
  const [posTotal, setPosTotal] = useState(0);
  const [usd, setUsd] = useState(0);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [key] = useState(uuidv7);
  const cash = DENOMS.reduce((a, d) => a + d * (n[d] ?? 0), 0);
  const sum = shift.summary;
  const unprinted = (sum?.unprinted_receipts ?? []).filter((r) => !r.reason);
  const missingReason = unprinted.some((r) => !reasons[r.receipt_id]?.trim());
  const blocked = (!shift.auto_closed && (!sync.online || sync.pending > 0)) || missingReason;

  async function close() {
    setBusy(true);
    try {
      const s = await shiftsApi.close(shift.shift_id, { declared: { cash, pos_slips_count: slips, pos_total: posTotal, usd: (shift.summary?.usd_received ?? 0) > 0 ? usd : undefined }, cash_denominations: Object.fromEntries(DENOMS.map((d) => [String(d), n[d] ?? 0])), note: note.trim(),
        unprinted_reasons: Object.fromEntries(unprinted.map((r) => [r.receipt_id, reasons[r.receipt_id]?.trim() ?? ""])) }, key);
      toast.success("أُغلق الحساب اليومي");
      const r = await returnReceiptBlock();
      if (r.warning) toast.warn(r.warning);
      onClosed({ s, cash, pos: posTotal });
      await qc.invalidateQueries({ queryKey: SHIFT_KEY });
    } catch (e) {
      toast.error(errorMessage(e)); setConfirm(false);
      if (isApiError(e) && e.code === "UNPRINTED_RECEIPTS") void qc.invalidateQueries({ queryKey: SHIFT_KEY });
    } finally { setBusy(false); }
  }

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
      <Card className="flex flex-col gap-4 p-[22px]">
        <div className="flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-xl bg-nav-medical text-white"><Icon name="lock-keyhole" size={22} /></span>
          <div className="flex flex-1 flex-col"><span className="text-lg font-bold">إغلاق الحساب اليومي</span><span className="sub">عُد النقد بيدك وأدخل الفئات. الفرق عن النقد المستلم يُسجَّل باسمك ويُرحَّل مع الحساب لمحاسب الفرع.</span></div>
        </div>
        {shift.auto_closed && <Alert tone="warn" icon="clock-alert">أُغلق هذا الحساب تلقائياً لأنه من يوم سابق. أدخل المبلغ الذي عددته لإقراره.</Alert>}
        {!shift.auto_closed && sum?.from_previous_day && <Alert tone="danger" icon="clock-alert">هذا الحساب من يوم سابق ولا يقبل تحصيلاً جديداً. أغلقه ثم افتح حساب اليوم.</Alert>}
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-5">
          {DENOMS.map((d) => (
            <div key={d} className="flex min-w-0 flex-col items-center gap-2 rounded-2xl border border-line bg-bg px-1.5 py-3">
              <span className="num flex items-center gap-1 text-sm font-semibold text-primary-strong"><Icon name="banknote" size={15} />{fmtNum(d)}</span>
              <div className="flex items-center gap-1">
                <button aria-label={`زيادة ${d}`} onClick={() => setN((x) => ({ ...x, [d]: (x[d] ?? 0) + 1 }))} className="grid size-7 shrink-0 place-items-center rounded-full bg-primary text-on-accent"><Icon name="plus" size={15} /></button>
                <input aria-label={`عدد فئة ${d}`} inputMode="numeric" value={n[d] ?? 0} dir="ltr"
                  onChange={(e) => { const v = Number(e.target.value.replace(/[^\d]/g, "")) || 0; setN((x) => ({ ...x, [d]: Math.min(v, 9999) })); }}
                  className="num w-10 bg-transparent text-center text-lg font-bold outline-none" />
                <button aria-label={`إنقاص ${d}`} onClick={() => setN((x) => ({ ...x, [d]: Math.max(0, (x[d] ?? 0) - 1) }))} className="grid size-7 shrink-0 place-items-center rounded-full border border-line-strong bg-surface text-ink-2"><Icon name="minus" size={15} /></button>
              </div>
              <span className="num text-xs font-semibold text-ink-2">{fmtNum(d * (n[d] ?? 0))}</span>
            </div>
          ))}
        </div>
        <div className="grid gap-2.5 md:grid-cols-3">
          <div className="flex min-w-0 flex-col gap-1.5">
            <span className="flex items-center gap-1.5 text-sm font-medium"><Icon name="banknote" size={16} className="text-primary" />النقد المعدود</span>
            <div className="flex h-[50px] min-w-0 items-center gap-2 rounded-field border-2 border-primary bg-primary-soft px-3.5"><span className="num min-w-0 flex-1 truncate text-xl font-bold">{fmtNum(cash)}</span><span className="sub-sm shrink-0">د.ع</span></div>
          </div>
          <label className="flex min-w-0 flex-col gap-1.5">
            <span className="flex items-center gap-1.5 text-sm font-medium"><Icon name="file-stack" size={16} className="text-primary" />قسائم POS</span>
            <input inputMode="numeric" dir="ltr" value={slips || ""} onChange={(e) => setSlips(Math.min(Number(e.target.value.replace(/[^\d]/g, "")) || 0, 9999))}
              className="num h-[50px] w-full min-w-0 rounded-field border-[1.5px] border-line-strong bg-surface px-3.5 text-lg font-semibold outline-none focus:border-primary" />
          </label>
          <MoneyInput label="مجموع POS" value={posTotal} onChange={setPosTotal} icon="credit-card" strong={false} />
          {(sum?.usd_received ?? 0) > 0 && <MoneyInput label="الدولارات المعدودة ($)" value={usd} onChange={setUsd} icon="circle-dollar-sign" strong={false} unit="$" />}
        </div>
        <TextInput label="ملاحظة (اختيارية)" value={note} onChange={setNote} icon="notebook-pen" />
        {unprinted.length > 0 && (
          <div className="flex flex-col gap-2 rounded-2xl border border-warn/50 bg-warn-soft p-3.5">
            <span className="text-sm font-semibold text-warn-strong">وصولات لم تُطبع: أعد طباعة كل وصل أو اكتب سبب عدم طباعته (يظهر لمحاسب الفرع)</span>
            {unprinted.map((r) => (
              <div key={r.receipt_id} className="flex flex-wrap items-end gap-2">
                <span className="num min-w-[120px] text-sm font-bold">{r.receipt_number} · {fmtNum(r.total)}</span>
                <div className="min-w-[180px] flex-1"><TextInput label="السبب" value={reasons[r.receipt_id] ?? ""} onChange={(v) => setReasons((x) => ({ ...x, [r.receipt_id]: v }))} icon="message-square" /></div>
                <Button size="md" variant="ghost" icon="printer" onClick={async () => {
                  try { await reprintReceipt(r.receipt_id); toast.success("طُبع الوصل"); await qc.invalidateQueries({ queryKey: SHIFT_KEY }); } catch (e) { toast.error(errorMessage(e)); }
                }}>طباعة</Button>
              </div>
            ))}
          </div>
        )}
        {!shift.auto_closed && (!sync.online || sync.pending > 0) && <Alert tone="warn" icon="cloud-off">لا يمكن الإغلاق مع وجود عمليات غير مزامنة ({fmtNum(sync.pending)}). أعد الاتصال أولاً.</Alert>}
        {!confirm
          ? <Button onClick={() => setConfirm(true)} disabled={blocked} icon="lock-keyhole">تأكيد وإغلاق الحساب اليومي</Button>
          : (
            <div className="flex flex-col gap-2 rounded-2xl border border-warn/50 bg-warn-soft p-3.5">
              <span className="text-sm font-semibold text-warn-strong">سيُغلق الحساب اليومي بإعلان <span className="num">{fmtNum(cash)}</span> نقداً و<span className="num">{fmtNum(posTotal)}</span> POS. لا يمكن التعديل بعدها.</span>
              <div className="flex gap-2"><Button className="flex-1" size="md" loading={busy} onClick={close} icon="lock-keyhole">إغلاق نهائي</Button><Button size="md" variant="ghost" onClick={() => setConfirm(false)}>رجوع</Button></div>
            </div>
          )}
      </Card>
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-3.5 rounded-card bg-nav-medical p-5 text-white">
          <span className="flex items-center gap-2 text-sm text-on-nav-3"><Icon name="clock" size={17} />الحساب اليومي الحالي</span>
          <span className="text-lg font-bold">{shift.clinic_name ?? "استقبال عام"} · <span className="num">{fmtTime(shift.opened_at)}</span></span>
          <div className="flex flex-col gap-2.5 text-sm">
            <Row icon="log-in" label="فُتحت" value={fmtTime(shift.opened_at)} />
            <Row icon="coins" label="الفكة الافتتاحية" value={fmtNum(shift.opening_float)} />
            <Row icon="receipt" label="إيصالات صادرة" value={fmtNum(shift.receipts_count)} />
            <Row icon="building-2" label="نقطة التحصيل" value={shift.clinic_name ?? "استقبال عام"} plain />
          </div>
        </div>
        {sum && <DaySummary sum={sum} />}
        <div className="flex items-start gap-2.5 rounded-2xl border border-line bg-surface p-3.5 text-[13px] leading-7 text-ink-2">
          <Icon name="info" size={18} className="mt-1 shrink-0 text-primary" />المبلغ «في ذمتك» هو ما تسلّمه عند الإغلاق. أي فرق يُسجَّل باسمك ويراجعه محاسب الفرع.
        </div>
      </div>
    </div>
  );
}

/** بعد الإغلاق يرى الموظف الفرق لكل عملة (UI-54). */
function Variance({ s }: { s: Shift }) {
  const line = (label: string, v: number | null | undefined, unit: string) => {
    if (v == null) return null;
    const tone = v === 0 ? "text-success-strong" : "text-danger-strong";
    return <div key={label} className="flex items-center justify-between gap-3 text-sm"><span className="text-ink-2">{label}</span><span className={`num font-bold ${tone}`}>{v === 0 ? "مطابق" : `${v < 0 ? "عجز" : "زيادة"} ${fmtNum(Math.abs(v))} ${unit}`}</span></div>;
  };
  if (s.variance_cash == null) return null;
  return (
    <div className="flex w-full flex-col gap-1.5 rounded-xl bg-bg p-3.5">
      <span className="text-start text-sm font-bold">الفرق عن المتوقع</span>
      {line("النقد", s.variance_cash, "د.ع")}
      {line("POS", s.variance_pos, "د.ع")}
      {!!s.variance_usd && line("الدولار", s.variance_usd, "$")}
    </div>
  );
}

/** ما يراه الموظف أثناء اليوم وعند الإغلاق (قرار المالك). */
function DaySummary({ sum }: { sum: ShiftSummary }) {
  const line = (icon: string, label: string, value: string, strong?: boolean) => (
    <div className="flex items-center gap-2"><Icon name={icon} size={16} className="text-primary" /><span className="flex-1 text-ink-2">{label}</span><span className={`num ${strong ? "text-base font-bold" : "font-semibold"}`}>{value}</span></div>
  );
  return (
    <Card className="flex flex-col gap-2.5 p-4 text-sm">
      <span className="text-[15px] font-bold">ملخص اليوم</span>
      {line("banknote", "النقد المستلم", fmtNum(sum.cash_received))}
      {line("undo-2", "المسترجع نقداً", fmtNum(sum.cash_refunds))}
      {sum.cash_expenses > 0 && line("receipt-text", "مصاريف من الصندوق", fmtNum(sum.cash_expenses))}
      {line("hand-coins", "في ذمتك وتسلّمه", fmtNum(sum.cash_in_hand), true)}
      {(sum.usd_received ?? 0) > 0 && <>
        {line("circle-dollar-sign", "الدولار المستلم ($)", fmtNum(sum.usd_received))}
        {line("circle-dollar-sign", "دولار في ذمتك ($)", fmtNum(sum.usd_in_hand), true)}
        {(sum.change_given_iqd ?? 0) > 0 && line("coins", "الفكة المعادة بالدينار (مطروحة من النقد)", fmtNum(sum.change_given_iqd))}
      </>}
      <hr className="border-line" />
      {line("smartphone", `إلكتروني لمن أكّدتَ حضورهم (${fmtNum(sum.electronic_count)})`, fmtNum(sum.electronic_for_my_check_ins))}
      {line("user-x", `لم يدفعوا بعد (من ${fmtNum(sum.checked_in_count)} أكّدتَ حضورهم)`, fmtNum(sum.unpaid_count))}
    </Card>
  );
}

function Row({ icon, label, value, plain }: { icon: string; label: string; value: string; plain?: boolean }) {
  return <div className="flex items-center gap-2"><Icon name={icon} size={16} className="text-on-nav-icon" /><span className="flex-1 text-on-nav-2">{label}</span><span className={plain ? "" : "num"}>{value}</span></div>;
}
