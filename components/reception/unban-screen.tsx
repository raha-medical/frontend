"use client";
/** فك الحظر — Reception.dc.html (isUnban): حالة الحظر والغيابات، وعربون نقدي أو POS أو إعفاء بصلاحية المدير. العقد 4. */
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Icon } from "@/components/icon";
import { toast } from "@/components/toast";
import { Alert, Button, Card, Spinner } from "@/components/ui";
import { banApi } from "@/lib/api/billing";
import { errorMessage } from "@/lib/api/errors";
import { fmtDate, fmtNum } from "@/lib/format";
import { uuidv7 } from "@/lib/id";
import { useAuth } from "@/lib/auth/store";
import { printReceipt } from "@/lib/reception/print";
import { ChoiceGrid, MoneyInput, PatientPicker, SHIFT_KEY, ShiftGuard, TextInput, usePatientParam } from "./common";

type Method = "cash" | "pos" | "waived";

export function UnbanScreen() {
  const pp = usePatientParam();
  if (!pp.id) return <div className="max-w-2xl"><PatientPicker title="ابحث عن المريض المحظور" onPick={pp.set} /></div>;
  if (pp.loading) return <Spinner />;
  if (!pp.patient) return <Alert tone="danger">{errorMessage(pp.error)}</Alert>;
  return <Unban key={pp.patient.patient_id} patient={pp.patient} onClear={() => pp.set(null)} />;
}

function Unban({ patient, onClear }: { patient: NonNullable<ReturnType<typeof usePatientParam>["patient"]>; onClear: () => void }) {
  const qc = useQueryClient();
  const user = useAuth((s) => s.user);
  const canUnban = useAuth((s) => s.can("patients.unban"));
  const isManager = !!user && ["admin", "branch_manager"].includes(user.role);
  const ban = useQuery({ queryKey: ["ban", patient.patient_id], queryFn: () => banApi.status(patient.patient_id) });
  const min = ban.data?.unban_deposit_amount ?? 0;
  const [method, setMethod] = useState<Method>("cash");
  const [amount, setAmount] = useState(0);
  const [posRef, setPosRef] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [key] = useState(uuidv7);
  const amt = method === "waived" ? 0 : Math.max(amount, 0) || min;

  const valid = method === "waived" ? note.trim().length > 0 : amt >= min && (method !== "pos" || posRef.trim().length > 0);

  async function submit() {
    setBusy(true);
    try {
      const r = await banApi.unban(patient.patient_id, { method, amount: amt, pos_reference: method === "pos" ? posRef.trim() : null, note: note.trim() || undefined }, key);
      toast.success(method === "waived" ? "فُك الحظر بإعفاء" : `فُك الحظر · رصيد ${fmtNum(r.deposit_credit)}`);
      if (r.receipt) void printReceipt(r);
      void qc.invalidateQueries({ queryKey: ["ban", patient.patient_id] });
      void qc.invalidateQueries({ queryKey: ["patient", patient.patient_id] });
      void qc.invalidateQueries({ queryKey: ["patients", "search"] });
      void qc.invalidateQueries({ queryKey: SHIFT_KEY });
    } catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); }
  }

  if (ban.isPending) return <Spinner />;
  if (ban.isError) return <Alert tone="danger">{errorMessage(ban.error)}</Alert>;
  const b = ban.data!;

  return (
    <div className="flex flex-col gap-4">
      {method !== "waived" && <ShiftGuard />}
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_400px]">
        <Card className="flex flex-col gap-4 p-[22px]">
          <div className="flex flex-wrap items-center gap-3.5">
            <span className={`grid size-14 place-items-center rounded-full ${b.is_banned ? "bg-danger-soft text-danger" : "bg-success-soft text-success"}`}><Icon name={b.is_banned ? "ban" : "shield-check"} size={26} /></span>
            <span className="flex min-w-[160px] flex-1 flex-col">
              <span className="text-[19px] font-bold">{patient.full_name}</span>
              <span className="sub"><span className="num">{patient.file_number}</span>{b.is_banned && b.banned_at ? <> · محظور منذ <span className="num">{fmtDate(b.banned_at)}</span></> : null}</span>
            </span>
            {b.is_banned
              ? <span className="flex items-center gap-1.5 rounded-full bg-danger-soft px-3 py-1.5 text-[13px] font-semibold text-danger-strong"><Icon name="shield-alert" size={14} />محظور في كل الفروع</span>
              : <span className="flex items-center gap-1.5 rounded-full bg-success-soft px-3 py-1.5 text-[13px] font-semibold text-success-strong"><Icon name="circle-check" size={14} />غير محظور</span>}
            <button onClick={onClear} aria-label="تغيير المريض" className="grid size-9 place-items-center rounded-full border border-line-strong text-ink-2 hover:bg-bg"><Icon name="x" size={16} /></button>
          </div>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            <Stat icon="user-x" v={fmtNum(b.no_show_count)} label="غيابات محتسبة (90 يوماً)" />
            <Stat icon="hand-coins" v={fmtNum(b.unban_deposit_amount)} label="عربون فك الحظر" />
            <Stat icon="piggy-bank" v={fmtNum(patient.credit_balance)} label="رصيد المريض الحالي" />
          </div>
          <span className="flex items-center gap-1.5 text-[13px] text-ink-2"><Icon name="info" size={15} />العربون يصبح رصيداً للمريض ويُخصم من أول فاتورة قادمة.</span>
        </Card>
        <Card className="flex flex-col gap-3 p-[18px] lg:sticky lg:top-24">
          <span className="flex items-center gap-2 text-base font-bold"><Icon name="shield-check" size={19} className="text-primary" />فك الحظر</span>
          {!b.is_banned ? <Alert tone="success">المريض غير محظور، يمكنه الحجز والحضور.</Alert>
            : !canUnban ? <Alert tone="warn" icon="lock">لا تملك صلاحية فك الحظر (patients.unban). اطلب من المحاسب أو مدير الفرع.</Alert>
            : (
              <>
                <ChoiceGrid value={method} onChange={setMethod} vertical options={[
                  { value: "cash", label: "نقداً", icon: "banknote" },
                  { value: "pos", label: "POS", icon: "credit-card" },
                  { value: "waived", label: "إعفاء", icon: "badge-percent", disabled: !isManager, hint: isManager ? undefined : "للمدير فقط" },
                ]} />
                {method !== "waived" && <MoneyInput label="مبلغ العربون" value={amt} onChange={setAmount} hint={`الحد الأدنى ${fmtNum(min)}`} />}
                {method === "pos" && <TextInput label="رقم عملية POS" value={posRef} onChange={setPosRef} icon="hash" ltr required />}
                <TextInput label={method === "waived" ? "سبب الإعفاء" : "ملاحظة"} value={note} onChange={setNote} icon="notebook-pen" required={method === "waived"} placeholder={method === "waived" ? "حالة إنسانية" : "تعهد المريض بالحضور"} />
                {method === "waived" && <span className="flex items-center gap-1.5 text-xs text-warn-strong"><Icon name="lock" size={13} />الإعفاء للمدير فقط · الملاحظة إلزامية · بدون إيصال</span>}
                <Button onClick={submit} disabled={!valid} loading={busy} icon={method === "waived" ? "shield-check" : "printer"}>{method === "waived" ? "فك الحظر بإعفاء" : "قبض العربون وفك الحظر"}</Button>
              </>
            )}
        </Card>
      </div>
    </div>
  );
}

function Stat({ icon, v, label }: { icon: string; v: string; label: string }) {
  return <div className="flex flex-col gap-1 rounded-xl bg-danger-soft/40 p-3"><Icon name={icon} size={17} className="text-danger" /><span className="num text-[15px] font-bold">{v}</span><span className="sub-sm">{label}</span></div>;
}
