"use client";
/** الوردية — Reception.dc.html (isShift): فتح الوردية ونقطة التحصيل، والإغلاق الأعمى بالفئات. العقد 10. */
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Icon } from "@/components/icon";
import { toast } from "@/components/toast";
import { Alert, Button, Card, ISelect, Spinner } from "@/components/ui";
import { catalogApi, DEPT, shiftsApi, type Shift } from "@/lib/api/billing";
import { errorMessage, isApiError } from "@/lib/api/errors";
import { fmtNum, fmtTime } from "@/lib/format";
import { uuidv7 } from "@/lib/id";
import { useAuth } from "@/lib/auth/store";
import { useSync } from "@/lib/offline/sync-provider";
import { DEVICE_CODE } from "@/lib/config";
import { reserveReceiptBlock, returnReceiptBlock } from "@/lib/agent/lifecycle";
import { MoneyInput, SHIFT_KEY, TextInput, useCurrentShift } from "./common";

const DENOMS = [25000, 10000, 5000, 1000, 250] as const;
/** فوق هذه الفكة يُطلب تأكيد ثانٍ قبل فتح الوردية (يمنع خطأ كتابة مثل 50,00050000). */
const LARGE_FLOAT = 5_000_000;

export function ShiftScreen() {
  const shift = useCurrentShift();
  const [closed, setClosed] = useState<{ s: Shift; cash: number; pos: number } | null>(null);
  if (shift.isPending) return <Spinner />;
  if (shift.isError) return <Alert tone="danger">{errorMessage(shift.error)}</Alert>;
  if (shift.data) return <CloseShift shift={shift.data} onClosed={setClosed} />;
  return (
    <div className="grid items-start gap-4 lg:grid-cols-2">
      {closed ? (
        <Card className="flex flex-col items-center gap-3 p-7 text-center">
          <span className="grid size-[72px] place-items-center rounded-full bg-warn-soft text-warn"><Icon name="hourglass" size={34} /></span>
          <span className="text-xl font-bold">أُغلقت الوردية</span>
          <span className="text-sm leading-7 text-ink-2">الحالة: بانتظار مراجعة المحاسب.<br />أعلنت <b className="num">{fmtNum(closed.cash)}</b> نقداً و <b className="num">{fmtNum(closed.pos)}</b> POS.</span>
          <span className="flex items-center gap-1.5 text-[13px] font-semibold text-ink-2"><Icon name="undo-dot" size={15} />أُعيدت أرقام الإيصالات غير المستخدمة من الكتلة</span>
        </Card>
      ) : (
        <Card className="flex flex-col items-center gap-3 p-7 text-center">
          <span className="grid size-[72px] place-items-center rounded-full bg-primary-soft text-primary"><Icon name="lock-keyhole" size={32} /></span>
          <span className="text-xl font-bold">لا توجد وردية مفتوحة</span>
          <span className="text-sm leading-7 text-ink-2">افتح وردية قبل التحصيل. كل نقطة تحصيل (عيادة، مختبر، أشعة) لها حساب وإغلاق مستقل.</span>
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
    // فكة غير معتادة: خطوة تأكيد ثانية بدل فتح الوردية بها مباشرة
    if (large && !confirmLarge) { setConfirmLarge(true); return; }
    setBusy(true);
    try {
      let onDevice = !!DEVICE_CODE;
      try {
        await shiftsApi.open({ shift_id: key, opening_float: float, clinic_id: point || null, device_code: DEVICE_CODE }, key);
      } catch (e) {
        // رمز الجهاز غير مسجل في هذا الفرع: نفتح الوردية بدونه (بلا أوفلاين ولا كتلة) وننبه
        if (!(isApiError(e) && e.errors?.device_code && DEVICE_CODE)) throw e;
        onDevice = false;
        await shiftsApi.open({ shift_id: key, opening_float: float, clinic_id: point || null }, key);
        toast.warn(`فُتحت الوردية بدون جهاز: الرمز ${DEVICE_CODE} غير مسجل في هذا الفرع (الإدارة ← النظام ← الأجهزة)`);
      }
      toast.success("فُتحت الوردية");
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
      <span className="flex items-center gap-2.5 text-[17px] font-bold"><Icon name="lock-keyhole-open" size={20} className="text-primary" />فتح وردية جديدة</span>
      <MoneyInput label="الفكة المستلمة" value={float} onChange={(n) => { setFloat(n); setConfirmLarge(false); }} icon="coins" />
      {confirmLarge && large && (
        <Alert tone="warn" icon="triangle-alert">الفكة {fmtNum(float)} د.ع أكبر بكثير من المعتاد. تأكد من الرقم، ثم اضغط «تأكيد الفكة وفتح الوردية».</Alert>
      )}
      <div className="flex flex-col gap-1.5">
        <ISelect label="نقطة التحصيل" placeholder="استقبال عام" value={point} onChange={setPoint} loading={clinics.isPending} hint="إيرادات الوردية تُنسب لهذا القسم في تقارير المحاسب."
          options={clinics.data ? [{ value: "", label: "استقبال عام", icon: "concierge-bell" }, ...mine.map((c) => ({ value: c.clinic_id, label: c.name, icon: DEPT[c.department]?.icon ?? "building" }))] : undefined} />
      </div>
      <span className="flex items-center gap-2 text-[13px] text-ink-2"><Icon name="ticket" size={16} />تُحجز كتلة أرقام إيصالات للعمل أوفلاين تلقائياً</span>
      <Button onClick={open} loading={busy} icon="play">{confirmLarge && large ? "تأكيد الفكة وفتح الوردية" : "فتح الوردية"}</Button>
    </Card>
  );
}


function CloseShift({ shift, onClosed }: { shift: Shift; onClosed: (r: { s: Shift; cash: number; pos: number }) => void }) {
  const qc = useQueryClient();
  const sync = useSync();
  const [n, setN] = useState<Record<number, number>>({ 25000: 0, 10000: 0, 5000: 0, 1000: 0, 250: 0 });
  const [slips, setSlips] = useState(0);
  const [posTotal, setPosTotal] = useState(0);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [key] = useState(uuidv7);
  const cash = DENOMS.reduce((a, d) => a + d * (n[d] ?? 0), 0);
  const blocked = !sync.online || sync.pending > 0;

  async function close() {
    setBusy(true);
    try {
      const s = await shiftsApi.close(shift.shift_id, { declared: { cash, pos_slips_count: slips, pos_total: posTotal }, cash_denominations: Object.fromEntries(DENOMS.map((d) => [String(d), n[d] ?? 0])), note: note.trim() }, key);
      toast.success("أُغلقت الوردية");
      const r = await returnReceiptBlock();
      if (r.warning) toast.warn(r.warning);
      onClosed({ s, cash, pos: posTotal });
      await qc.invalidateQueries({ queryKey: SHIFT_KEY });
    } catch (e) { toast.error(errorMessage(e)); setConfirm(false); } finally { setBusy(false); }
  }

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
      <Card className="flex flex-col gap-4 p-[22px]">
        <div className="flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-xl bg-nav-medical text-white"><Icon name="eye-off" size={22} /></span>
          <div className="flex flex-1 flex-col"><span className="text-lg font-bold">الإغلاق الأعمى للوردية</span><span className="sub">عُد النقد بيدك وأدخل الفئات. متوقع النظام والفرق لا يظهران لك.</span></div>
        </div>
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
        </div>
        <TextInput label="ملاحظة (اختيارية)" value={note} onChange={setNote} icon="notebook-pen" />
        {blocked && <Alert tone="warn" icon="cloud-off">لا يمكن الإغلاق مع وجود عمليات غير مزامنة ({fmtNum(sync.pending)}). أعد الاتصال أولاً.</Alert>}
        {!confirm
          ? <Button onClick={() => setConfirm(true)} disabled={blocked} icon="lock-keyhole">تأكيد وإغلاق الوردية</Button>
          : (
            <div className="flex flex-col gap-2 rounded-2xl border border-warn/50 bg-warn-soft p-3.5">
              <span className="text-sm font-semibold text-warn-strong">ستُغلق الوردية بإعلان <span className="num">{fmtNum(cash)}</span> نقداً و<span className="num">{fmtNum(posTotal)}</span> POS. لا يمكن التعديل بعدها.</span>
              <div className="flex gap-2"><Button className="flex-1" size="md" loading={busy} onClick={close} icon="lock-keyhole">إغلاق نهائي</Button><Button size="md" variant="ghost" onClick={() => setConfirm(false)}>رجوع</Button></div>
            </div>
          )}
      </Card>
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-3.5 rounded-card bg-nav-medical p-5 text-white">
          <span className="flex items-center gap-2 text-sm text-on-nav-3"><Icon name="clock" size={17} />الوردية الحالية</span>
          <span className="text-lg font-bold">{shift.clinic_name ?? "استقبال عام"} · <span className="num">{fmtTime(shift.opened_at)}</span></span>
          <div className="flex flex-col gap-2.5 text-sm">
            <Row icon="log-in" label="فُتحت" value={fmtTime(shift.opened_at)} />
            <Row icon="coins" label="الفكة الافتتاحية" value={fmtNum(shift.opening_float)} />
            <Row icon="receipt" label="إيصالات صادرة" value={fmtNum(shift.receipts_count)} />
            <Row icon="building-2" label="نقطة التحصيل" value={shift.clinic_name ?? "استقبال عام"} plain />
          </div>
        </div>
        <div className="flex items-start gap-2.5 rounded-2xl border border-line bg-surface p-3.5 text-[13px] leading-7 text-ink-2">
          <Icon name="eye-off" size={18} className="mt-1 shrink-0 text-primary" />النتيجة (مطابق / عجز / زيادة) تظهر للمحاسب فقط ويصله إشعار فوري.
        </div>
      </div>
    </div>
  );
}

function Row({ icon, label, value, plain }: { icon: string; label: string; value: string; plain?: boolean }) {
  return <div className="flex items-center gap-2"><Icon name={icon} size={16} className="text-on-nav-icon" /><span className="flex-1 text-on-nav-2">{label}</span><span className={plain ? "" : "num"}>{value}</span></div>;
}
