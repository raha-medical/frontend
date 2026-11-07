"use client";
/**
 * الصيدلية بالأسعار (الجلسة 4، خطة المالك): تسعير الوصفة (متوفر/غير متوفر، الكمية، الدواء من القائمة أو سعر يدوي)
 * ثم التحصيل من شاشة التحصيل على الحساب اليومي، ثم التسليم. والمراجع الخارجي، وسجل الصرف اليومي.
 */
import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Icon } from "@/components/icon";
import { toast } from "@/components/toast";
import { Alert, Badge, Button, Card, DataGrid, DateField, Field, Spinner, controlCls } from "@/components/ui";
import { pharmacyBillingApi, type BillLineInput, type DrugService, type PharmacyBill } from "@/lib/api/session4";
import { filesApi, type Prescription } from "@/lib/api/clinical";
import { errorMessage, isApiError } from "@/lib/api/errors";
import { fmtNum, fmtTime, fmtDateTime } from "@/lib/format";
import { todayBaghdad } from "@/lib/date";

export const collectHref = (patientId: string) => `/staff/reception/collect?patient_id=${patientId}`;

function useDrugs() {
  return useQuery({ queryKey: ["pharmacy-drugs"], queryFn: () => pharmacyBillingApi.drugs(), staleTime: 5 * 60_000 });
}

function DrugSelect({ drugs, value, onChange }: { drugs: DrugService[]; value: string; onChange: (v: string) => void }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={`${controlCls} h-10 px-3 text-sm`} aria-label="الدواء من القائمة">
      <option value="">— سعر يدوي (غير موجود في القائمة) —</option>
      {drugs.filter((d) => d.is_active).map((d) => <option key={d.service_id} value={d.service_id}>{d.name} · {fmtNum(d.price)} {d.currency === "USD" ? "$" : "د.ع"}{d.requires_prescription ? " · يحتاج وصفة" : ""}</option>)}
    </select>
  );
}

type PLine = { available: boolean; wanted: boolean; quantity: number; service_id: string; unit_price: number; reason: string };

/** الخطوة الأولى: التسعير. ثم حالة الدفع. children = زر الصرف، يظهر فقط بعد دفع كل البنود. */
export function RxPricing({ rx, children }: { rx: Prescription; children: React.ReactNode }) {
  const qc = useQueryClient();
  const bill = useQuery({ queryKey: ["rx-bill", rx.prescription_id], queryFn: () => pharmacyBillingApi.getBill(rx.prescription_id), refetchInterval: 15_000 });
  const drugs = useDrugs();
  const guess = (name: string) => drugs.data?.find((d) => d.is_active && d.name.trim().toLowerCase() === name.trim().toLowerCase())?.service_id ?? "";
  const [lines, setLines] = useState<Record<number, PLine> | null>(null);
  const current = useMemo(() => lines ?? Object.fromEntries(rx.items.map((i) => [i.line_no, { available: true, wanted: true, quantity: 1, service_id: guess(i.drug_name), unit_price: 0, reason: "" }])),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lines, rx.items, drugs.data]);
  const upd = (n: number, p: Partial<PLine>) => setLines({ ...current, [n]: { ...current[n], ...p } });
  const [busy, setBusy] = useState(false);
  if (bill.isPending || drugs.isPending) return <Spinner />;
  const b = bill.data;
  if (b && b.lines.length > 0) return <BillView bill={b}>{b.all_paid ? children : null}</BillView>;
  const priceOf = (l: PLine) => l.service_id ? (drugs.data?.find((d) => d.service_id === l.service_id)?.price ?? 0) : l.unit_price;
  const total = rx.items.reduce((a, i) => { const l = current[i.line_no]; return a + (l.available && l.wanted ? priceOf(l) * l.quantity : 0); }, 0);
  return (
    <div className="flex flex-col gap-2.5">
      <Alert tone="info" icon="tags">حدد لكل دواء: متوفر أم لا، وهل يريده المراجع، والكمية. تُنشأ فاتورة الأدوية، والتسليم بعد التحصيل.</Alert>
      {rx.items.map((i) => {
        const l = current[i.line_no];
        const sell = l.available && l.wanted;
        return (
          <Card key={i.line_no} className="flex flex-col gap-2 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="num flex-1 font-bold" dir="ltr">{i.drug_name}</span>
              <div className="inline-flex gap-1 rounded-xl bg-bg p-1">
                <button onClick={() => upd(i.line_no, { available: true })} className={`h-9 rounded-xl px-3 text-[13px] font-semibold ${l.available ? "bg-success text-on-accent" : "text-ink-2"}`}>متوفر</button>
                <button onClick={() => upd(i.line_no, { available: false })} className={`h-9 rounded-xl px-3 text-[13px] font-semibold ${!l.available ? "bg-danger text-on-accent" : "text-ink-2"}`}>غير متوفر</button>
              </div>
              {l.available && <label className="flex items-center gap-1.5 text-sm"><input type="checkbox" checked={l.wanted} onChange={(e) => upd(i.line_no, { wanted: e.target.checked })} />يريده المراجع</label>}
            </div>
            {sell && (
              <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_110px_140px]">
                <DrugSelect drugs={drugs.data ?? []} value={l.service_id} onChange={(v) => upd(i.line_no, { service_id: v })} />
                <input type="number" min={1} max={1000} value={l.quantity} onChange={(e) => upd(i.line_no, { quantity: Math.max(1, Number(e.target.value) || 1) })} aria-label="الكمية" className={`${controlCls} num h-10 px-3 text-sm`} />
                {l.service_id ? <span className="num self-center text-sm font-bold">{fmtNum(priceOf(l) * l.quantity)} د.ع</span>
                  : <input type="number" min={0} value={l.unit_price || ""} onChange={(e) => upd(i.line_no, { unit_price: Number(e.target.value) || 0 })} placeholder="سعر الوحدة" aria-label="سعر الوحدة" className={`${controlCls} num h-10 px-3 text-sm`} />}
              </div>
            )}
            {!sell && <input value={l.reason} onChange={(e) => upd(i.line_no, { reason: e.target.value })} placeholder="السبب (اختياري)" className={`${controlCls} h-10 px-3 text-sm`} />}
          </Card>
        );
      })}
      <Button loading={busy} icon="receipt-text" onClick={async () => {
        setBusy(true);
        try {
          const body: BillLineInput[] = rx.items.map((i) => {
            const l = current[i.line_no];
            const sell = l.available && l.wanted;
            return { line_no: i.line_no, available: l.available, wanted: l.wanted, quantity: sell ? l.quantity : undefined,
              service_id: sell && l.service_id ? l.service_id : null, unit_price: sell && !l.service_id ? l.unit_price : null, reason: l.reason.trim() || null };
          });
          await pharmacyBillingApi.bill(rx.prescription_id, body);
          toast.success("أُنشئت فاتورة الأدوية");
          void qc.invalidateQueries({ queryKey: ["rx-bill", rx.prescription_id] });
        } catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); }
      }}>إنشاء الفاتورة · <span className="num">{fmtNum(total)}</span> د.ع</Button>
    </div>
  );
}

export function BillView({ bill, children }: { bill: PharmacyBill; children?: React.ReactNode }) {
  return (
    <Card className="flex flex-col gap-2 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex-1 font-bold">فاتورة الأدوية {bill.invoice_number && <span className="num sub-sm" dir="ltr">{bill.invoice_number}</span>}</span>
        {bill.all_paid ? <Badge tone="success" icon="circle-check">مدفوعة</Badge> : <Badge tone="warn" icon="clock">المطلوب <span className="num">{fmtNum(bill.total_due)}</span> د.ع</Badge>}
      </div>
      {bill.lines.map((l) => (
        <div key={l.dispense_line_id} className="flex flex-wrap items-center gap-2 text-sm">
          <Icon name={l.status === "dispensed" ? "circle-check" : l.status === "billed" ? "pill" : "circle-x"} size={16} className={l.status === "not_available" || l.status === "not_wanted" ? "text-danger" : "text-pharm"} />
          <span className="num flex-1" dir="ltr">{l.drug_name}</span>
          {l.quantity > 0 && <span className="num">× {l.quantity}</span>}
          {l.amount > 0 && <span className="num font-semibold">{fmtNum(l.amount)}</span>}
          <span className="sub-sm">{l.status_ar}</span>
        </div>
      ))}
      {!bill.all_paid && bill.invoice_id && <Link href={collectHref(bill.patient_id)} className="flex h-10 items-center justify-center gap-1.5 rounded-full bg-primary text-sm font-semibold text-on-accent"><Icon name="banknote" size={16} />التحصيل على حسابك اليومي</Link>}
      {children}
    </Card>
  );
}

// ------------------------------------------------------------------ المراجع الخارجي (6.3-ب)

export function PharmacyExternal() {
  const invoiceId = useSearchParams().get("invoice_id");
  const router = useRouter();
  const existing = useQuery({ queryKey: ["pharmacy-external-bill", invoiceId], queryFn: () => pharmacyBillingApi.externalBill(invoiceId!), enabled: !!invoiceId, refetchInterval: 15000 });
  const drugs = useDrugs();
  const [person, setPerson] = useState({ full_name: "", phone_number: "" });
  const [items, setItems] = useState<{ service_id: string; quantity: number }[]>([{ service_id: "", quantity: 1 }]);
  const [doctor, setDoctor] = useState("");
  const [note, setNote] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [bill, setBill] = useState<PharmacyBill | null>(null);
  const [needRx, setNeedRx] = useState<string[] | null>(null);
  const restricted = items.filter((i) => drugs.data?.find((d) => d.service_id === i.service_id)?.requires_prescription).length > 0;
  const valid = person.full_name.trim().length >= 2 && /^07\d{9}$/.test(person.phone_number.trim()) && items.length <= 30 && items.every((i) => i.service_id && Number.isInteger(i.quantity) && i.quantity > 0 && i.quantity <= 1000)
    && (!restricted || !!file || note.trim().length >= 5);
  if (invoiceId && existing.isPending) return <Spinner />;
  if (invoiceId && existing.isError) return <Alert tone="danger">{errorMessage(existing.error)}</Alert>;
  const displayed = bill ?? existing.data;
  if (displayed) return <ExternalBill bill={displayed} onNew={() => { router.replace("/staff/pharmacy/external"); setBill(null); setPerson({ full_name: "", phone_number: "" }); setDoctor(""); setItems([{ service_id: "", quantity: 1 }]); setNote(""); setFile(null); }} onChange={setBill} />;
  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
      <Card className="flex flex-col gap-3 p-5">
        <span className="text-lg font-bold">تسجيل مراجع مباشر للصيدلية</span>
        <p className="sub">الاسم والهاتف، ثم العلاج والكمية المطلوبة للمريض. الأسعار من قائمة الصيدلية.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="الاسم" value={person.full_name} onChange={(e) => setPerson({ ...person, full_name: e.target.value })} />
          <Field label="الهاتف" ltr inputMode="tel" value={person.phone_number} onChange={(e) => setPerson({ ...person, phone_number: e.target.value })} placeholder="07XXXXXXXXX" />
        </div>
        <Field label="الطبيب الكاتب للوصفة (اختياري)" value={doctor} onChange={(e) => setDoctor(e.target.value)} />
        {drugs.isError && <Alert tone="danger">{errorMessage(drugs.error)}</Alert>}
        {drugs.isPending ? <Spinner /> : items.map((it, idx) => (
          <div key={idx} className="grid items-end gap-2 sm:grid-cols-[minmax(0,1fr)_110px_40px]">
            <select value={it.service_id} onChange={(e) => setItems(items.map((x, j) => j === idx ? { ...x, service_id: e.target.value } : x))} className={`${controlCls} h-10 px-3 text-sm`} aria-label="الدواء">
              <option value="">اختر الدواء</option>
              {(drugs.data ?? []).filter((d) => d.is_active).map((d) => <option key={d.service_id} value={d.service_id}>{d.name} · {fmtNum(d.price)}{d.requires_prescription ? " · يحتاج وصفة" : ""}</option>)}
            </select>
            <label className="flex flex-col gap-1 text-xs font-semibold">كمية المريض<input type="number" min={1} max={1000} step={1} value={it.quantity} onChange={(e) => setItems(items.map((x, j) => j === idx ? { ...x, quantity: Number(e.target.value) } : x))} aria-label="الكمية" className={`${controlCls} num h-10 px-3 text-sm`} /></label>
            <button onClick={() => setItems(items.length > 1 ? items.filter((_, j) => j !== idx) : items)} aria-label="حذف" className="grid h-10 place-items-center rounded-xl text-ink-3 hover:text-danger"><Icon name="trash-2" size={16} /></button>
            {it.service_id && <span className="num text-xs sm:col-span-full">سعر الوحدة: {fmtNum(drugs.data?.find(d => d.service_id === it.service_id)?.price ?? 0)} {drugs.data?.find(d => d.service_id === it.service_id)?.currency === "USD" ? "$" : "د.ع"} · الكمية: {it.quantity}</span>}
          </div>
        ))}
        <Button variant="ghost" size="sm" icon="plus" className="self-start" disabled={items.length >= 30} onClick={() => setItems([...items, { service_id: "", quantity: 1 }])}>دواء آخر</Button>
        {(restricted || needRx) && (
          <Alert tone="warn" icon="file-text">
            دواء يحتاج وصفة{needRx ? `: ${needRx.join("، ")}` : ""}. أرفق صورة الوصفة أو اكتب ملاحظة إلزامية.
            <div className="mt-2 flex flex-col gap-2">
              <input type="file" accept="image/jpeg,image/png,application/pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} aria-label="صورة الوصفة" />
              <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="ملاحظة (مثل: وصفة ورقية من د. … اطلعتُ عليها)" className={`${controlCls} h-auto p-3 text-sm`} />
            </div>
          </Alert>
        )}
      </Card>
      <div className="flex flex-col gap-3">
        <Button loading={busy} disabled={!valid} icon="receipt-text" onClick={async () => {
          setBusy(true); setNeedRx(null);
          try {
            const fileId = file ? await filesApi.upload(file, "prescription") : null;
            setBill(await pharmacyBillingApi.externalSale({ new_patient: { full_name: person.full_name.trim(), phone_number: person.phone_number.trim() }, items, referring_doctor_name: doctor.trim() || null, prescription_file_id: fileId, note: note.trim() || null }));
            toast.success("أُنشئت الفاتورة");
          } catch (e) {
            if (isApiError(e) && e.code === "PRESCRIPTION_REQUIRED") setNeedRx((e.extra?.drugs as string[]) ?? []);
            toast.error(errorMessage(e));
          } finally { setBusy(false); }
        }}>إنشاء الفاتورة</Button>
        <Card className="p-4 text-sm leading-7 text-ink-2">يُنشأ للمراجع ملف مختصر (الاسم والهاتف) أو يُستخدم ملفه الموجود. الدواء الذي يحتاج وصفة لا يُصرف إلا بصورة الوصفة أو ملاحظة، والتسليم بعد التحصيل.</Card>
      </div>
    </div>
  );
}

function ExternalBill({ bill, onNew, onChange }: { bill: PharmacyBill; onNew: () => void; onChange: (b: PharmacyBill) => void }) {
  const [busy, setBusy] = useState(false);
  const delivered = bill.lines.every((l) => l.status === "dispensed");
  return (
    <div className="flex max-w-2xl flex-col gap-3">
      <Card className="flex items-center gap-3 p-4"><span className="flex flex-1 flex-col"><span className="font-bold">{bill.patient_name}</span><span className="num sub-sm">{bill.file_number}</span></span></Card>
      <BillView bill={bill} />
      {delivered ? <Alert tone="success">سُلّمت الأدوية.</Alert> : (
        <Button loading={busy} disabled={!bill.all_paid} icon="package-check" onClick={async () => {
          setBusy(true);
          try { onChange(await pharmacyBillingApi.deliver(bill.invoice_id!)); toast.success("سُلّمت الأدوية"); }
          catch (e) { toast.error(isApiError(e) && e.code === "INVOICE_UNPAID" ? "حصّل الفاتورة أولاً" : errorMessage(e)); } finally { setBusy(false); }
        }}>تسليم الأدوية (بعد الدفع)</Button>
      )}
      <Link href="/staff/pharmacy/work" className="text-center font-semibold text-primary">العودة لقائمة المراجعين</Link>
      <Button variant="ghost" icon="plus" onClick={onNew}>مراجع جديد</Button>
    </div>
  );
}

// ------------------------------------------------------------------ سجل الصرف اليومي (6.2-ج)

export function PharmacyLog() {
  const [from, setFrom] = useState(todayBaghdad());
  const [to, setTo] = useState(todayBaghdad());
  const [drug, setDrug] = useState("");
  const [status, setStatus] = useState("");
  const q = useQuery({ queryKey: ["dispense-log", from, to, drug, status], queryFn: () => pharmacyBillingApi.log({ from, to, drug: drug || undefined, status: status || undefined }), refetchInterval: 60_000 });
  const s = q.data?.summary;
  return (
    <div className="flex flex-col gap-3 print:gap-1">
      <Card className="flex flex-wrap items-end gap-2 p-4 print:hidden">
        <div className="w-44"><DateField aria-label="من" size="md" value={from} onChange={setFrom} /></div>
        <div className="w-44"><DateField aria-label="إلى" size="md" value={to} onChange={setTo} /></div>
        <div className="w-48"><Field label="الدواء" value={drug} onChange={(e) => setDrug(e.target.value)} /></div>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className={`${controlCls} h-12 w-44 px-3`} aria-label="الحالة">
          <option value="">كل الحالات</option><option value="dispensed">صُرف</option><option value="billed">بانتظار الدفع</option><option value="not_available">غير متوفر</option><option value="not_wanted">لم يرده المراجع</option>
        </select>
        <Button size="md" variant="ghost" icon="printer" onClick={() => window.print()}>طباعة</Button>
        <Button size="md" variant="ghost" icon="download" onClick={async () => {
          try {
            const blob = await pharmacyBillingApi.csv({ from, to, drug: drug || undefined, status: status || undefined });
            const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `pharmacy-${from}_${to}.csv`; a.click(); URL.revokeObjectURL(a.href);
          } catch (e) { toast.error(errorMessage(e)); }
        }}>تصدير CSV</Button>
      </Card>
      {s && (
        <div className="grid gap-2 sm:grid-cols-4">
          {[["الوصفات", s.prescriptions_count], ["كاملة / جزئية", `${s.complete_count} / ${s.partial_count}`], ["مراجعون خارجيون", s.external_sales_count], ["إجمالي المبالغ", fmtNum(s.total_amount)]].map(([l, v]) => (
            <Card key={l as string} solid className="flex flex-col p-3"><span className="sub-sm">{l}</span><span className="num text-lg font-bold">{v}</span></Card>
          ))}
        </div>
      )}
      {s && s.per_drug.length > 0 && <Card solid className="flex flex-wrap gap-2 p-3 text-sm">{s.per_drug.map((d) => <span key={d.drug_name} className="rounded-chip bg-bg px-2 py-1"><span dir="ltr">{d.drug_name}</span> · <span className="num">{d.quantity}</span> · <span className="num">{fmtNum(d.amount)}</span></span>)}</Card>}
      <DataGrid aria-label="سجل الصرف" rows={q.data?.items} loading={q.isPending} error={q.isError ? errorMessage(q.error) : undefined} rowKey={(r) => r.dispense_line_id} minWidth={860}
        search={{ placeholder: "ابحث بالمراجع أو الدواء أو الطبيب" }} empty={{ icon: "history", title: "لا يوجد صرف في الفترة" }}
        columns={[
          { key: "at", header: "الوقت", width: "120px", sortable: true, cell: (r) => <span className="num text-xs">{from === to ? fmtTime(r.at) : fmtDateTime(r.at)}</span> },
          { key: "patient_name", header: "المراجع", value: (r) => `${r.patient_name} ${r.file_number ?? ""}`, cell: (r) => <span className="flex flex-col"><span>{r.patient_name}</span><span className="num sub-sm">{r.file_number}</span></span> },
          { key: "drug_name", header: "الدواء", cell: (r) => <span dir="ltr" className="num">{r.drug_name}</span> },
          { key: "quantity", header: "الكمية", width: "70px", cell: (r) => <span className="num">{r.quantity}</span> },
          { key: "amount", header: "المبلغ", width: "100px", cell: (r) => <span className="num">{fmtNum(r.amount)}</span> },
          { key: "doctor_name", header: "الطبيب المحوِّل", cell: (r) => r.doctor_name },
          { key: "user_name", header: "الموظف", cell: (r) => r.user_name ?? "" },
          { key: "status", header: "الحالة", width: "150px", value: (r) => `${r.status_ar} ${r.prescription_status_ar ?? ""}`, cell: (r) => (
            <span className="flex flex-col gap-0.5"><Badge tone={r.status === "dispensed" ? "success" : r.status === "billed" ? "info" : "danger"}>{r.status_ar}</Badge>{r.prescription_status_ar && <span className="sub-sm">الوصفة: {r.prescription_status_ar}</span>}</span>) },
        ]} />
    </div>
  );
}
