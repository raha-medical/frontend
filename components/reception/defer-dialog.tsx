"use client";
/** منح الدفع الآجل (العقد 14: POST /deferrals). البنود تبقى ديناً على المريض، والخدمة تُنفذ، والنتيجة تبقى حسب إعداد الفرع. */
import { useState } from "react";
import { toast } from "@/components/toast";
import { Alert, Button, DateField, Field, ISelect, Modal } from "@/components/ui";
import { errorMessage } from "@/lib/api/errors";
import { deferralsApi } from "@/lib/api/finance";
import { todayBaghdad } from "@/lib/date";
import { fmtNum } from "@/lib/format";
import { uuidv7 } from "@/lib/id";

const REASONS = [{ value: "emergency", label: "حالة طارئة" }, { value: "humanitarian", label: "حالة إنسانية" }, { value: "other", label: "سبب آخر" }];

export function DeferDialog({ patientId, itemIds, amount, onClose, onDone }: { patientId: string; itemIds: string[]; amount: number; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [due, setDue] = useState("");
  const [busy, setBusy] = useState(false);
  const [id] = useState(uuidv7);
  const ready = !!reason && (reason !== "other" || !!note.trim());
  async function save() {
    setBusy(true);
    try {
      await deferralsApi.create({ deferral_id: id, patient_id: patientId, invoice_item_ids: itemIds, reason, note: note.trim() || undefined, due_date: due || undefined });
      toast.success("سُجل الدفع الآجل");
      onDone();
    } catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); }
  }
  return (
    <Modal open onClose={onClose} title="تأجيل الدفع" icon="hand-coins" width={460}>
      <Alert tone="info" icon="info">يؤجَّل <b className="num">{fmtNum(amount)}</b> د.ع وتبقى ديناً على المريض، وتتابعها المحاسبة في «الذمم الآجلة».</Alert>
      <ISelect label="السبب" value={reason} onChange={(v) => setReason(v ?? "")} searchable={false} placeholder="اختر السبب" options={REASONS} />
      <Field label={reason === "other" ? "ملاحظة (إلزامية)" : "ملاحظة"} value={note} onChange={(e) => setNote(e.target.value)} />
      <DateField label="تاريخ السداد المتوقع (اختياري)" value={due} min={todayBaghdad()} clearable onChange={setDue} />
      <Button loading={busy} disabled={!ready} icon="hand-coins" onClick={save}>تأكيد التأجيل</Button>
    </Modal>
  );
}
