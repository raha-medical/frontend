"use client";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, Button, Card, Spinner, controlCls } from "@/components/ui";
import { pharmacyApi, type Prescription } from "@/lib/api/clinical";
import { pharmacyBillingApi } from "@/lib/api/session4";
import { errorMessage } from "@/lib/api/errors";
import { fmtNum } from "@/lib/format";
import { esc, printHtml } from "@/lib/agent/print-html";
import { BillView } from "./billing";

export function TextPrescription({ initial }: { initial: Prescription }) {
  const qc = useQueryClient();
  const query = useQuery({ queryKey: ["text-rx", initial.prescription_id], queryFn: () => pharmacyApi.get(initial.prescription_code), initialData: initial });
  const rx = query.data;
  const bill = useQuery({ queryKey: ["rx-bill", rx.prescription_id], queryFn: () => pharmacyBillingApi.getBill(rx.prescription_id), enabled: rx.items.length > 0, refetchInterval: 10000 });
  const drugs = useQuery({ queryKey: ["pharmacy-drugs"], queryFn: pharmacyBillingApi.drugs });
  const [selected, setSelected] = useState([{ service_id: "", quantity: 1 }]);
  const [reasons, setReasons] = useState<Record<number, string>>({});
  const [omitted, setOmitted] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  async function reload() {
    qc.setQueryData(["text-rx", rx.prescription_id], await pharmacyApi.get(rx.prescription_code));
    await qc.invalidateQueries({ queryKey: ["rx-bill", rx.prescription_id] });
    void qc.invalidateQueries({ queryKey: ["referrals"] });
  }
  const valid = selected.length > 0 && selected.length <= 30 && selected.every(l => l.service_id && Number.isInteger(l.quantity) && l.quantity >= 1 && l.quantity <= 1000);
  return <div className="flex flex-col gap-4">
    <Card className="flex flex-col gap-3 p-5"><div className="flex flex-wrap justify-between gap-2"><span className="font-bold">{rx.patient_name} · {rx.doctor_name}</span><Button size="sm" variant="ghost" icon="printer" onClick={() => void printHtml(`<h2>الوصفة الطبية</h2><p>${esc(rx.patient_name)} · ${esc(rx.doctor_name)}</p><div dir="auto" style="white-space:pre-wrap;overflow-wrap:anywhere">${esc(rx.text ?? "")}</div>`, "الوصفة الطبية", "a4")}>طباعة الوصفة</Button></div><h2 className="font-bold">الوصفة كما كتبها الطبيب</h2><div dir="auto" className="whitespace-pre-wrap break-words rounded-field bg-bg p-4 text-base leading-8">{rx.text}</div></Card>
    {rx.status === "dispensed" ? <Alert tone="success">سُجل صرف الوصفة. لا يمكن صرفها مرة أخرى.</Alert> : rx.status === "expired" ? <Alert tone="danger">انتهت صلاحية الوصفة.</Alert> : rx.items.length === 0 ? <Card className="flex flex-col gap-3 p-5">
      <h2 className="font-bold">بنود الصرف</h2><p className="sub">اختر العلاجات والكميات بعد قراءة الوصفة. النص لا يتحول تلقائيًا إلى أدوية.</p>
      {drugs.isPending ? <Spinner /> : drugs.isError ? <Alert tone="danger">{errorMessage(drugs.error)}</Alert> : selected.map((line, i) => <div key={i} className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2 sm:grid-cols-[minmax(0,1fr)_110px_auto]">
        <label className="col-span-2 flex min-w-0 flex-col gap-1 text-sm sm:col-span-1">العلاج<select aria-label="علاج الصرف" value={line.service_id} onChange={e => setSelected(ls => ls.map((l,j) => i === j ? { ...l, service_id: e.target.value } : l))} className={`${controlCls} h-12`}><option value="">اختر العلاج</option>{drugs.data?.map(d => <option key={d.service_id} value={d.service_id}>{d.name} · {fmtNum(d.price)} {d.currency === "USD" ? "$" : "د.ع"}</option>)}</select></label>
        <label className="flex min-w-0 flex-col gap-1 text-sm">الكمية<input aria-label="كمية الصرف" type="number" min={1} max={1000} step={1} value={line.quantity} onChange={e => setSelected(ls => ls.map((l,j) => i === j ? { ...l, quantity: Number(e.target.value) } : l))} className={`${controlCls} h-12`} /></label>
        <Button className="!h-12 self-end" variant="ghost" icon="trash-2" disabled={selected.length === 1} onClick={() => setSelected(ls => ls.filter((_,j) => i !== j))}>حذف</Button>
      </div>)}
      <Button variant="ghost" icon="plus" disabled={selected.length >= 30} onClick={() => setSelected(ls => [...ls, { service_id: "", quantity: 1 }])}>إضافة علاج للصرف</Button>
      <Button loading={busy} disabled={!valid || drugs.isError} icon="receipt" onClick={async () => { setBusy(true); setError(null); try { await pharmacyBillingApi.bill(rx.prescription_id, selected.map((l,i) => ({ ...l, line_no: i + 1, available: true, wanted: true }))); await reload(); } catch(e) { setError(e); } finally { setBusy(false); } }}>إنشاء فاتورة العلاجات</Button>
    </Card> : bill.isPending ? <Spinner /> : bill.isError ? <Alert tone="danger">{errorMessage(bill.error)}</Alert> : bill.data && <BillView bill={bill.data}>
      {bill.data.all_paid && <div className="flex flex-col gap-3">{rx.items.map(item => <div key={item.line_no}><label className="flex gap-2 text-sm"><input type="checkbox" checked={!omitted.includes(item.line_no)} onChange={e => setOmitted(xs => e.target.checked ? xs.filter(n => n !== item.line_no) : [...xs, item.line_no])} />صرف {item.drug_name} · الكمية {item.quantity}</label>{omitted.includes(item.line_no) && <input aria-label={`سبب عدم صرف ${item.drug_name}`} value={reasons[item.line_no] ?? ""} onChange={e => setReasons(v => ({ ...v, [item.line_no]: e.target.value }))} placeholder="سبب عدم الصرف" className={controlCls} />}</div>)}<Button loading={busy} disabled={omitted.some(n => !reasons[n]?.trim())} icon="package-check" onClick={async () => { setBusy(true); setError(null); try { await pharmacyApi.dispense(rx.prescription_id, rx.items.map(l => ({ line_no: l.line_no, dispensed: !omitted.includes(l.line_no), not_dispensed_reason: omitted.includes(l.line_no) ? reasons[l.line_no] : null }))); await reload(); } catch(e) { setError(e); } finally { setBusy(false); } }}>تأكيد صرف الوصفة</Button></div>}
    </BillView>}
    {error != null && <Alert tone="danger">{errorMessage(error)}</Alert>}
  </div>;
}
