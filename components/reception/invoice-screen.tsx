"use client";
/** طلب مباشر — Reception.dc.html (isInvoice): طلب طبي بورقة طبيب خارجي، أو فاتورة يدوية مع خصم. العقد 8 (POST /invoices) و11 (POST /medical-orders). */
import Link from "next/link";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Icon } from "@/components/icon";
import { toast } from "@/components/toast";
import { Alert, Button, Card, Empty, ReasonDialog, Segmented, Spinner } from "@/components/ui";
import { billingApi, catalogApi, ordersApi, type DirectOrderItem, type Service } from "@/lib/api/billing";
import { errorMessage } from "@/lib/api/errors";
import { fmtNum } from "@/lib/format";
import { uuidv7 } from "@/lib/id";
import { useAuth } from "@/lib/auth/store";
import { PatientHeader, PatientPicker, TextInput, useDebounced, usePatientParam } from "./common";
import { staffApi } from "@/lib/api/staff";

type Mode = "order" | "invoice";
type Line = { s: Service; qty: number };
const TYPE: Record<string, { label: string; icon: string; cls: string }> = {
  lab: { label: "تحليل", icon: "flask-conical", cls: "bg-lab-soft text-lab" },
  radiology: { label: "أشعة", icon: "scan-line", cls: "bg-info-soft text-info" },
  procedure: { label: "إجراء", icon: "hand-coins", cls: "bg-primary-soft text-primary" },
};

export function InvoiceScreen() {
  const pp = usePatientParam();
  const [mode, setMode] = useState<Mode>("order");
  return (
    <div className="flex flex-col gap-3.5">
      <Segmented value={mode} onChange={setMode} options={[{ value: "order", label: "طلب بورقة طبيب خارجي", icon: "file-input" }, { value: "invoice", label: "فاتورة يدوية", icon: "receipt" }]} />
      {!pp.id ? <div className="flex max-w-2xl flex-col gap-3"><PatientPicker onPick={pp.set} /><ExternalPatient onCreated={pp.set} /></div>
        : pp.loading ? <Spinner />
        : !pp.patient ? <Alert tone="danger">{errorMessage(pp.error)}</Alert>
        : <Builder key={`${pp.patient.patient_id}-${mode}`} mode={mode} patient={pp.patient} onClear={() => pp.set(null)} />}
    </div>
  );
}

function Builder({ mode, patient, onClear }: { mode: Mode; patient: NonNullable<ReturnType<typeof usePatientParam>["patient"]>; onClear: () => void }) {
  const qc = useQueryClient();
  const canDiscount = useAuth((s) => s.can("discounts.grant"));
  const canCollect = useAuth((s) => s.can("payments.collect"));
  const [lines, setLines] = useState<Line[]>([]);
  const [text, setText] = useState("");
  const dq = useDebounced(text);
  const svc = useQuery({ queryKey: ["services", "billable", dq], queryFn: () => catalogApi.services({ q: dq || undefined }), staleTime: 60_000 });
  const results = (svc.data?.items ?? []).filter((s) => s.is_active && s.type !== "consultation" && (mode === "invoice" || s.type !== "procedure")).slice(0, 8);
  const [refDoc, setRefDoc] = useState("");
  const [disc, setDisc] = useState<"none" | "percent" | "amount">("none");
  const [discVal, setDiscVal] = useState(0);
  const [discReason, setDiscReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [key, setKey] = useState(uuidv7);
  const [created, setCreated] = useState<DirectOrderItem[]>([]);
  const [cancel, setCancel] = useState<DirectOrderItem | null>(null);

  const gross = lines.reduce((a, l) => a + l.s.price * l.qty, 0);
  const discount = mode === "invoice" && disc !== "none" ? Math.min(gross, disc === "percent" ? Math.round((gross * Math.min(discVal, 100)) / 100) : discVal) : 0;
  const net = gross - discount;
  const add = (s: Service) => { setLines((ls) => ls.some((l) => l.s.service_id === s.service_id) ? ls.map((l) => l.s.service_id === s.service_id ? { ...l, qty: Math.min(l.qty + 1, 100) } : l) : [...ls, { s, qty: 1 }]); setText(""); setKey(uuidv7()); };
  const valid = lines.length > 0 && (mode === "order" ? refDoc.trim().length > 1 : disc === "none" || (discVal > 0 && discReason.trim().length > 0));

  async function submit() {
    setBusy(true);
    try {
      if (mode === "order") {
        // الطلب الطبي: بند لكل خدمة (الكمية بتكرار البند)
        const items = lines.flatMap((l) => Array.from({ length: l.qty }, () => ({ service_id: l.s.service_id })));
        const r = await ordersApi.create({ patient_id: patient.patient_id, items, referring_doctor_name: refDoc.trim() }, key);
        setCreated((c) => [...r.items, ...c]);
        toast.success(`أُنشئ ${r.items.length} طلب · بانتظار الدفع`);
      } else {
        const inv = await billingApi.createInvoice({ invoice_id: key, patient_id: patient.patient_id, items: lines.map((l) => ({ service_id: l.s.service_id, quantity: l.qty })), ...(discount > 0 ? { discount: { type: disc as "percent" | "amount", value: discVal, reason: discReason.trim() } } : {}) }, key);
        toast.success(`أُنشئت الفاتورة ${inv.invoice_number} · ${fmtNum(inv.net_amount)}`);
      }
      setLines([]); setKey(uuidv7());
      void qc.invalidateQueries({ queryKey: ["basket", patient.patient_id] });
    } catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); }
  }

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
      <div className="flex min-w-0 flex-col gap-3.5">
        <PatientHeader p={patient} onClear={onClear} />
        <div className="relative">
          <div className="flex h-[46px] items-center gap-2 rounded-field border-[1.5px] border-line-strong bg-surface px-3.5 focus-within:border-primary">
            <Icon name="search" size={17} className="text-ink-muted" />
            <input value={text} onChange={(e) => setText(e.target.value)} placeholder={mode === "order" ? "ابحث عن تحليل أو أشعة" : "ابحث عن تحليل أو أشعة أو إجراء"} aria-label="بحث عن خدمة"
              className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-ink-muted" />
          </div>
          {text && (
            <div className="absolute inset-x-0 top-[50px] z-20 flex max-h-80 flex-col overflow-auto rounded-2xl border border-line bg-surface p-1.5 shadow-pop">
              {svc.isPending ? <Spinner /> : !results.length ? <span className="sub p-3">لا توجد خدمة بهذا الاسم</span> : results.map((s) => {
                const t = TYPE[s.type] ?? TYPE.procedure;
                return (
                  <button key={s.service_id} onClick={() => add(s)} className="flex items-center gap-3 rounded-xl p-2.5 text-start hover:bg-bg">
                    <span className={`grid size-8 place-items-center rounded-xl ${t.cls}`}><Icon name={t.icon} size={16} /></span>
                    <span className="flex-1 text-sm font-semibold">{s.name}</span>
                    <span className="num text-sm font-semibold">{fmtNum(s.price)}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
        <Card className="overflow-hidden">
          {!lines.length ? <Empty icon="clipboard-list" title="لا توجد بنود" hint="ابحث عن الخدمة وأضفها. السعر من جدول الخدمات." />
            : lines.map((l) => {
              const t = TYPE[l.s.type] ?? TYPE.procedure;
              return (
                <div key={l.s.service_id} className="grid grid-cols-[40px_minmax(0,1fr)_auto_auto_30px] items-center gap-3 border-b border-line px-4 py-3">
                  <span className={`grid size-9 place-items-center rounded-xl ${t.cls}`}><Icon name={t.icon} size={17} /></span>
                  <span className="flex min-w-0 flex-col"><span className="truncate text-sm font-semibold">{l.s.name}</span><span className="sub-sm">{t.label}</span></span>
                  <span className="flex h-9 items-center gap-2 rounded-xl border border-line-strong px-2">
                    <button aria-label="إنقاص" onClick={() => setLines((ls) => ls.map((x) => x === l ? { ...x, qty: Math.max(1, x.qty - 1) } : x))}><Icon name="minus" size={13} className="text-ink-muted" /></button>
                    <span className="num w-6 text-center font-semibold">{l.qty}</span>
                    <button aria-label="زيادة" onClick={() => setLines((ls) => ls.map((x) => x === l ? { ...x, qty: Math.min(100, x.qty + 1) } : x))}><Icon name="plus" size={13} className="text-primary" /></button>
                  </span>
                  <span className="num min-w-[80px] text-end font-bold">{fmtNum(l.s.price * l.qty)}</span>
                  <button aria-label="حذف" onClick={() => setLines((ls) => ls.filter((x) => x !== l))}><Icon name="trash-2" size={16} className="text-ink-muted hover:text-danger" /></button>
                </div>
              );
            })}
          <div className="flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold text-ink-2"><Icon name="info" size={14} />{mode === "order" ? "كل بند يصبح طلباً طبياً وبنداً في السلة، ويظهر للمختبر والأشعة بعد الدفع." : "الكشفية تُنشأ تلقائياً عند الحضور ولا تُضاف هنا."}</div>
        </Card>
        {mode === "order" && created.length > 0 && (
          <Card className="flex flex-col gap-2.5 p-4">
            <span className="flex items-center gap-2 text-[15px] font-bold"><Icon name="clipboard-list" size={18} className="text-primary" />طلبات أُنشئت الآن (غير مدفوعة)</span>
            {created.map((o) => (
              <div key={o.order_item_id} className="flex items-center gap-2.5 rounded-xl bg-bg px-3 py-2.5">
                <Icon name={o.department === "lab" ? "flask-conical" : "scan-line"} size={17} className={o.department === "lab" ? "text-lab" : "text-info"} />
                <span className="flex flex-1 flex-col"><span className="text-sm font-semibold">{o.service_name}</span><span className="sub-sm">{o.status === "cancelled" ? "ملغى" : refDoc || "طبيب خارجي"}</span></span>
                <span className="num font-semibold">{fmtNum(o.price)}</span>
                {o.status !== "cancelled" && <button onClick={() => setCancel(o)} className="flex h-8 items-center gap-1 rounded-full border border-danger/40 bg-surface px-3 text-xs font-semibold text-danger-strong"><Icon name="x" size={13} />إلغاء الطلب</button>}
              </div>
            ))}
            <span className="flex items-center gap-1.5 text-xs font-semibold text-ink-2"><Icon name="undo-2" size={13} />الطلب المدفوع لا يُلغى هنا، يُسترجع من شاشة الاسترجاع.</span>
          </Card>
        )}
      </div>
      <Card className="flex flex-col gap-3 p-[18px] lg:sticky lg:top-24">
        {mode === "order" ? (
          <>
            <span className="flex items-center gap-2 text-base font-bold"><Icon name="file-input" size={19} className="text-primary" />طلب طبي مباشر</span>
            <TextInput label="الطبيب المحيل (من خارج المجمع)" value={refDoc} onChange={setRefDoc} icon="stethoscope" placeholder="د. ماجد العبيدي · عيادة خاصة" required />
          </>
        ) : canDiscount && (
          <>
            <span className="flex items-center gap-2 text-base font-bold"><Icon name="badge-percent" size={19} className="text-primary" />الخصم</span>
            <Segmented size="sm" value={disc} onChange={(v) => { setDisc(v); setDiscVal(0); }} options={[{ value: "none", label: "بدون" }, { value: "percent", label: "نسبة %" }, { value: "amount", label: "مبلغ" }]} />
            {disc !== "none" && (
              <>
                <div className="grid grid-cols-[110px_minmax(0,1fr)] gap-2">
                  <input inputMode="numeric" dir="ltr" aria-label="قيمة الخصم" value={discVal || ""} onChange={(e) => setDiscVal(Math.min(Number(e.target.value.replace(/[^\d]/g, "")) || 0, disc === "percent" ? 100 : 100_000_000))}
                    className="num h-11 rounded-xl border-[1.5px] border-line-strong bg-surface px-3 text-base font-semibold outline-none focus:border-primary" placeholder={disc === "percent" ? "%" : "د.ع"} />
                  <input aria-label="سبب الخصم" value={discReason} onChange={(e) => setDiscReason(e.target.value)} placeholder="السبب (إلزامي)" className="h-11 min-w-0 rounded-xl border-[1.5px] border-line-strong bg-surface px-3 text-sm outline-none focus:border-primary" />
                </div>
                <span className="flex items-center gap-1.5 text-xs text-success-strong"><Icon name="key-round" size={13} />لديك صلاحية منح الخصم · السبب إلزامي</span>
              </>
            )}
          </>
        )}
        <div className="h-px bg-line" />
        <div className="flex items-center text-sm"><span className="flex-1">المجموع</span><span className="num">{fmtNum(gross)}</span></div>
        {discount > 0 && <div className="flex items-center text-sm text-success-strong"><span className="flex-1">الخصم</span><span className="num">−{fmtNum(discount)}</span></div>}
        <div className="flex items-center text-lg font-bold"><span className="flex-1">الصافي</span><span className="num">{fmtNum(net)}</span></div>
        <Button onClick={submit} disabled={!valid || (disc !== "none" && !canDiscount && mode === "invoice")} loading={busy} icon={mode === "order" ? "send" : "receipt"}>{mode === "order" ? "إنشاء الطلب وإضافته للسلة" : "إنشاء الفاتورة"}</Button>
        {canCollect && <Link href={`/staff/reception/collect?patient_id=${patient.patient_id}`} className="flex h-[42px] items-center justify-center gap-2 rounded-full border border-line-strong text-sm font-semibold text-ink-2 hover:bg-bg"><Icon name="banknote" size={16} />الذهاب للتحصيل</Link>}
      </Card>
      <ReasonDialog open={!!cancel} title="إلغاء الطلب" icon="x" confirmText="إلغاء الطلب" danger onClose={() => setCancel(null)}
        onConfirm={async (reason) => {
          const r = await ordersApi.cancel(cancel!.order_item_id, reason);
          setCreated((c) => c.map((o) => o.order_item_id === r.order_item_id ? { ...o, status: "cancelled" } : o));
          void qc.invalidateQueries({ queryKey: ["basket", patient.patient_id] });
          toast.success("أُلغي الطلب");
        }} />
    </div>
  );
}

/** مراجع من خارج المجمع (6.3، الجلسة 4): ملف مختصر بالاسم والهاتف فقط، ثم اختيار التحاليل أو الفحوصات والتحصيل. */
function ExternalPatient({ onCreated }: { onCreated: (id: string) => void }) {
  const [f, setF] = useState({ full_name: "", phone_number: "" });
  const [busy, setBusy] = useState(false);
  const [key] = useState(uuidv7);
  const ok = f.full_name.trim().length >= 2 && /^07\d{9}$/.test(f.phone_number.trim());
  return (
    <Card className="flex flex-col gap-3 p-4">
      <span className="flex items-center gap-2 font-bold"><Icon name="user-plus" size={18} className="text-primary" />مراجع خارجي جديد (الاسم والهاتف فقط)</span>
      <div className="grid gap-2 sm:grid-cols-2">
        <TextInput label="الاسم" value={f.full_name} onChange={(v) => setF({ ...f, full_name: v })} icon="user-round" />
        <TextInput label="الهاتف" value={f.phone_number} onChange={(v) => setF({ ...f, phone_number: v })} icon="phone" ltr placeholder="07XXXXXXXXX" />
      </div>
      <Button size="md" disabled={!ok} loading={busy} icon="check" className="self-start" onClick={async () => {
        setBusy(true);
        try {
          const r = await staffApi.post<{ patient_id: string }>("/patients", { patient_id: key, full_name: f.full_name.trim(), phone_number: f.phone_number.trim() }, { idempotencyKey: key });
          toast.success("أُنشئ ملف مختصر"); onCreated(r.patient_id);
        } catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); }
      }}>متابعة</Button>
    </Card>
  );
}
