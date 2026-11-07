"use client";
/** ملفي: الملف الطبي الكامل لكل فرد في الحساب من كل الفروع (4.2)، والوصفات والطلبات متاحة دائماً (4.3). العقد 22.1 و22.2. */
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Icon } from "@/components/icon";
import { toast } from "@/components/toast";
import { Alert, Badge, Button, Empty, Spinner, type BadgeTone } from "@/components/ui";
import { errorMessage } from "@/lib/api/errors";
import { patientApi } from "@/lib/api/staff";
import type { PatientRef, PatientSessionUser } from "@/lib/api/types";
import { fmtDate, fmtNum, fmtTime } from "@/lib/format";
import { QrToggle, ResultSheet, payOnline } from "./shared";
import type { MyInvoice, MyOrder, MyPrescription, PBooking, PatientFile, RxLine, Visit } from "./types";

const REL: Record<string, string> = { self: "أنا", child: "ابن/ابنة", spouse: "زوج/زوجة", parent: "أب/أم", other: "آخر" };
const relationAr = (r: string) => REL[r] ?? r;

type Tab = "overview" | "visits" | "rx" | "orders" | "appointments" | "invoices";
const TABS: { key: Tab; label: string; icon: string }[] = [
  { key: "overview", label: "البيانات", icon: "id-card" }, { key: "visits", label: "المعاينات", icon: "stethoscope" }, { key: "rx", label: "الوصفات", icon: "pill" },
  { key: "orders", label: "التحاليل والأشعة", icon: "flask-conical" }, { key: "appointments", label: "المواعيد", icon: "calendar-days" }, { key: "invoices", label: "الفواتير", icon: "receipt-text" },
];

/** التبديل بين ملفات الحساب (أكثر من ملف): بطاقات أفقية بالاسم والصلة ورقم الملف، والاختيار يبقى في كل الشاشات. */
export function MemberSwitcher({ patients, value, onChange }: { patients: PatientRef[]; value: string; onChange: (id: string) => void }) {
  if (patients.length < 2) return null;
  const idx = Math.max(0, patients.findIndex((p) => p.patient_id === value));
  return (
    <section className="flex flex-col gap-2">
      <span className="flex items-center justify-between px-1">
        <span className="text-[15px] font-bold">ملفات الحساب</span>
        <span className="sub-sm">الملف <span className="num">{idx + 1}</span> من <span className="num">{patients.length}</span></span>
      </span>
      <div className="no-scrollbar -mx-4 flex snap-x gap-2 overflow-x-auto px-4 pb-1" role="tablist" aria-label="ملفات الحساب">
        {patients.map((p) => {
          const on = p.patient_id === value;
          return (
            <button key={p.patient_id} role="tab" aria-selected={on} onClick={() => onChange(p.patient_id)}
              className={`flex min-h-[60px] w-[172px] shrink-0 snap-start items-center gap-2.5 rounded-2xl border p-2.5 text-start transition-colors ${on ? "border-primary bg-primary text-on-accent" : "border-line bg-surface"}`}>
              <span className={`grid size-10 shrink-0 place-items-center rounded-full text-[16px] font-bold ${on ? "bg-white/20" : "bg-primary-soft text-primary-strong"}`}>{p.full_name.trim().charAt(0)}</span>
              <span className="flex min-w-0 flex-col leading-tight">
                <span className="truncate text-[15px] font-semibold">{p.full_name.split(" ").slice(0, 2).join(" ")}</span>
                <span className={`truncate text-[13px] ${on ? "opacity-90" : "text-ink-2"}`}>{relationAr(p.relation)} · <span className="num">{p.file_number}</span></span>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

export function MedicalFile({ user, patientId, onSwitch }: { user: PatientSessionUser; patientId: string; onSwitch: (id: string) => void }) {
  const [tab, setTab] = useState<Tab>("overview");
  const q = useQuery({ queryKey: ["p", "file", patientId], queryFn: () => patientApi.get<PatientFile>(`/me/patients/${patientId}/file`), refetchOnMount: "always" });
  return (
    <>
      <MemberSwitcher patients={user.patients} value={patientId} onChange={onSwitch} />
      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1" role="tablist" aria-label="أقسام الملف">
        {TABS.map((t) => <button key={t.key} role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)} className={`flex h-11 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[15px] font-semibold ${tab === t.key ? "bg-primary-soft text-primary-strong" : "bg-surface text-ink-2"}`}><Icon name={t.icon} size={16} />{t.label}</button>)}
      </div>
      {q.isPending ? <Spinner /> : q.isError ? <Alert tone="danger">{errorMessage(q.error)}</Alert> : (
        <>
          {tab === "overview" && <Overview f={q.data} />}
          {tab === "visits" && <Visits f={q.data} />}
          {tab === "rx" && <Prescriptions items={q.data.prescriptions} patientId={patientId} />}
          {tab === "orders" && <Orders items={q.data.orders} patientId={patientId} />}
          {tab === "appointments" && <Appointments upcoming={q.data.upcoming_appointments} past={q.data.past_appointments} />}
          {tab === "invoices" && <Invoices patientId={patientId} />}
        </>
      )}
    </>
  );
}

function Row({ icon, label, value }: { icon: string; label: string; value: React.ReactNode }) {
  return <div className="flex items-center gap-2.5 border-b border-line py-2.5 last:border-0"><Icon name={icon} size={17} className="text-primary" /><span className="flex-1 text-ink-2">{label}</span><span className="font-semibold">{value}</span></div>;
}

function Overview({ f }: { f: PatientFile }) {
  const p = f.patient;
  const stats: [string, number, string][] = [["المعاينات", f.visits.length, "stethoscope"], ["الوصفات", f.prescriptions.length, "pill"], ["التحاليل والأشعة", f.orders.length, "flask-conical"], ["مواعيد قادمة", f.upcoming_appointments.length, "calendar-days"]];
  return (
    <>
      <div className="glass flex flex-col rounded-2xl px-4 py-2 shadow-glass">
        <span className="py-2 text-lg font-bold">{p.full_name}</span>
        <Row icon="hash" label="رقم الملف" value={<span className="num">{p.file_number}</span>} />
        <Row icon="users-round" label="الصلة" value={relationAr(p.relation)} />
        {p.gender && <Row icon="user-round" label="الجنس" value={p.gender === "female" ? "أنثى" : "ذكر"} />}
        {p.birth_date && <Row icon="cake" label="تاريخ الميلاد" value={<span className="num">{fmtDate(p.birth_date)}</span>} />}
        {p.age != null && <Row icon="calendar" label="العمر" value={<><span className="num">{p.age}</span> سنة</>} />}
      </div>
      <div className="flex flex-col gap-1.5 rounded-2xl bg-surface p-4"><span className="font-bold">رمزي للخدمات</span><span className="sub">اعرضه في المختبر أو الأشعة أو الصيدلية لتأكيد وصولك.</span><QrToggle value={`patient:${p.patient_id}`} label={p.file_number} hint="يفعّل تحويلاتك المنتظرة في هذا القسم" /></div>
      {p.is_banned && <Alert tone="danger" icon="ban">هذا الملف محظور بسبب تكرار الغياب. ادفع عربون فك الحظر من «حسابي».</Alert>}
      <div className="grid grid-cols-2 gap-2">{stats.map(([l, n, i]) => <div key={l} className="flex items-center gap-2.5 rounded-2xl bg-surface p-3"><span className="grid size-10 place-items-center rounded-xl bg-primary-soft text-primary"><Icon name={i} size={18} /></span><span className="flex flex-col"><span className="num text-lg font-bold">{n}</span><span className="text-sm text-ink-2">{l}</span></span></div>)}</div>
      <div className="flex flex-col gap-1.5 rounded-2xl bg-surface p-4">
        <span className="font-bold">الفروع التي راجعتها</span>
        {f.branches.length ? <div className="flex flex-wrap gap-1.5">{f.branches.map((b) => <Badge key={b.branch_id} tone="primary" icon="building-2">{b.name}</Badge>)}</div> : <span className="sub">لا توجد زيارات بعد.</span>}
      </div>
    </>
  );
}

function RxLines({ lines }: { lines: RxLine[] }) {
  return <>{lines.map((l, i) => <span key={i} className="text-[15px]"><span dir="ltr" className="num font-semibold">{l.drug_name}</span>{[l.dose, l.frequency, l.duration_days ? `${l.duration_days} أيام` : null].filter(Boolean).length ? ` · ${[l.dose, l.frequency, l.duration_days ? `${l.duration_days} أيام` : null].filter(Boolean).join(" · ")}` : ""}{l.instructions ? <span className="block text-sm text-ink-2">{l.instructions}</span> : null}</span>)}</>;
}

function Visits({ f }: { f: PatientFile }) {
  const [open, setOpen] = useState<{ id: string; dept: string } | null>(null);
  if (!f.visits.length) return <Empty icon="file-text" title="لا توجد معاينات بعد" hint="تظهر هنا كل معايناتك في كل الفروع." />;
  return (
    <>
      {f.visits.map((v: Visit) => (
        <div key={v.consultation_id} className="flex flex-col gap-2 rounded-2xl border border-line bg-surface p-4">
          <div className="flex items-start gap-2"><span className="flex flex-1 flex-col"><span className="font-bold">{v.doctor_name}</span><span className="sub-sm">{v.clinic_name}{v.branch_name ? ` · ${v.branch_name}` : ""}</span></span><span className="num text-sm text-ink-2">{fmtDate(v.date)}</span></div>
          {v.diagnosis && <span className="text-base"><b>التشخيص:</b> <span dir="auto">{v.diagnosis}</span></span>}
          {v.follow_up_date && <span className="text-sm text-info-strong">المراجعة <span className="num">{fmtDate(v.follow_up_date)}</span></span>}
          {v.prescription && <div className="flex flex-col gap-1 rounded-xl bg-pharm-soft/50 p-3"><span className="flex items-center gap-1.5 text-base font-bold"><Icon name="pill" size={15} className="text-pharm" />الوصفة <span className="num" dir="ltr">{v.prescription.prescription_code}</span></span><RxLines lines={v.prescription.lines} /></div>}
          {v.orders.map((o) => (
            <div key={o.order_item_id} className="flex items-center gap-2 text-base">
              <Icon name={o.department === "lab" ? "flask-conical" : "scan-line"} size={15} className={o.department === "lab" ? "text-lab" : "text-info"} />
              <span className="flex-1">{o.service_name}</span>
              {o.result_available ? <button onClick={() => setOpen({ id: o.order_item_id, dept: o.department })} className="min-h-9 rounded-full bg-success-soft px-3 text-sm font-semibold text-success-strong">عرض النتيجة</button> : <span className="text-sm text-ink-2">راجع «التحاليل والأشعة»</span>}
            </div>
          ))}
        </div>
      ))}
      {open && <ResultSheet {...open} onClose={() => setOpen(null)} />}
    </>
  );
}

const RX_STATUS: Record<string, { label: string; tone: BadgeTone }> = { not_dispensed: { label: "فعالة", tone: "success" }, dispensed: { label: "صُرفت", tone: "info" }, expired: { label: "منتهية في المجمع", tone: "muted" }, cancelled: { label: "ملغاة", tone: "muted" } };

/** نص الوصفة للمشاركة أو الشراء من خارج المجمع. */
function rxText(r: MyPrescription) {
  const lines = r.items.map((l) => [l.drug_name, l.dose, l.frequency, l.duration_days ? `${l.duration_days} أيام` : null, l.instructions].filter(Boolean).join(" - "));
  return [`وصفة ${r.prescription_code}`, `المريض: ${r.patient_name}`, r.doctor_name ? `الطبيب: ${r.doctor_name}` : null, `التاريخ: ${fmtDate(r.issued_at)}`, "", ...lines].filter((x) => x !== null).join("\n");
}
async function shareRx(r: MyPrescription) {
  const text = rxText(r);
  try {
    if (navigator.share) await navigator.share({ title: `وصفة ${r.prescription_code}`, text });
    else { await navigator.clipboard.writeText(text); toast.success("نُسخت الوصفة"); }
  } catch (e) { if ((e as Error)?.name !== "AbortError") toast.error("تعذرت المشاركة"); }
}

function Prescriptions({ items, patientId }: { items: MyPrescription[]; patientId: string }) {
  if (!items.length) return <Empty icon="pill" title="لا توجد وصفات" hint="كل وصفة يكتبها طبيبك تبقى هنا دائماً." />;
  return (
    <>
      <Alert tone="info" icon="info">وصفاتك تبقى هنا دائماً. اصرفها الآن أو لاحقاً، أو اشترِ الدواء من أي صيدلية خارج المجمع.</Alert>
      {items.map((r) => {
        const st = RX_STATUS[r.status] ?? { label: r.status, tone: "muted" as BadgeTone };
        return (
          <div key={r.prescription_id ?? r.prescription_code} className="flex flex-col gap-2 rounded-2xl border border-line bg-surface p-4">
            <div className="flex items-start gap-2"><span className="flex flex-1 flex-col"><span className="flex items-center gap-1.5 font-bold"><Icon name="pill" size={16} className="text-pharm" /><span className="num" dir="ltr">{r.prescription_code}</span></span><span className="sub-sm">{r.doctor_name ?? "—"}{r.branch_name ? ` · ${r.branch_name}` : ""} · <span className="num">{fmtDate(r.issued_at)}</span></span></span><Badge tone={st.tone}>{st.label}</Badge></div>
            <RxLines lines={r.items} />
            {r.referral_status_ar && <Badge tone="muted">{r.referral_status_ar}</Badge>}
            {r.status === "not_dispensed" && <span className="sub-sm">صالحة للصرف من أي فرع حتى <span className="num">{fmtDate(r.expires_at)}</span></span>}
            {r.status === "expired" && <span className="sub-sm">انتهت صلاحية الصرف داخل المجمع، ويمكنك شراء الدواء من خارجه.</span>}
            <div className="flex flex-wrap gap-2">
              <Button size="md" variant="ghost" className="flex-1" icon="share-2" onClick={() => void shareRx(r)}>مشاركة الوصفة</Button>
            </div>
            <ReferralChoice id={r.referral_id} status={r.referral_status} patientId={patientId} />
            {r.status === "not_dispensed" && <QrToggle value={r.prescription_code} label={r.prescription_code} hint="اعرضه على الصيدلي لصرف الوصفة" />}
          </div>
        );
      })}
    </>
  );
}

/** تأكيد المريض: سأنفذها داخل المجمع (يدخل قائمة عمل الخدمة)، أو خارجياً (يبقى في ملفه). العقد 23. */
function ReferralChoice({ id, status, patientId, canExternal = true }: { id?: string | null; status?: string | null; patientId: string; canExternal?: boolean }) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  if (!id || !["referred", "expired", "external"].includes(status ?? "")) return null;
  async function act(path: "confirm" | "external") {
    setBusy(true);
    try {
      await patientApi.post(`/me/referrals/${id}/${path}`, undefined, { idempotencyKey: false });
      toast.success(path === "confirm" ? "أُبلغت الخدمة بحضورك" : "سُجل أنك ستنفذها خارج المجمع، وتبقى في ملفك");
      void qc.invalidateQueries({ queryKey: ["p", "file", patientId] });
    } catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); }
  }
  return (
    <div className="flex flex-wrap gap-2">
      <Button size="md" className="flex-1" icon="map-pin-check" loading={busy} onClick={() => void act("confirm")}>سأنفذها داخل المجمع</Button>
      {status === "referred" && canExternal && <Button size="md" variant="ghost" className="flex-1" icon="external-link" disabled={busy} onClick={() => void act("external")}>سأنفذها خارجياً</Button>}
    </div>
  );
}

const PAY: Record<string, { label: string; tone: BadgeTone }> = { paid: { label: "مدفوع", tone: "success" }, unpaid: { label: "غير مدفوع", tone: "warn" }, deferred: { label: "مؤجل", tone: "info" }, partial: { label: "مدفوع جزئياً", tone: "info" } };

function Orders({ items, patientId }: { items: MyOrder[]; patientId: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState<{ id: string; dept: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  async function pay(o: MyOrder) {
    if (!o.invoice_id) return;
    setBusy(o.order_item_id);
    try {
      const r = await payOnline({ purpose: "invoice", patient_id: patientId, invoice_id: o.invoice_id, invoice_item_id: o.invoice_item_id, label: o.service_name });
      toast[r.status === "succeeded" ? "success" : "warn"](r.status === "succeeded" ? "تم الدفع، النتيجة متاحة الآن" : "لم يكتمل الدفع");
      void qc.invalidateQueries({ queryKey: ["p", "file", patientId] });
    } catch (e) { toast.error(errorMessage(e)); } finally { setBusy(null); }
  }
  if (!items.length) return <Empty icon="flask-conical" title="لا توجد تحاليل أو أشعة" hint="كل طلب من طبيبك يبقى هنا لتنفذه متى شئت." />;
  return (
    <>
      <Alert tone="info" icon="info">الطلبات تبقى هنا دائماً. نفّذها الآن أو لاحقاً، داخل المجمع أو خارجه. عرض النتيجة يتطلب دفع مستحقها.</Alert>
      {items.map((o) => {
        const pay_ = PAY[o.payment_status] ?? { label: o.payment_status, tone: "muted" as BadgeTone };
        return (
          <div key={o.order_item_id} className="flex flex-col gap-2 rounded-2xl border border-line bg-surface p-4">
            <div className="flex items-start gap-2">
              <span className={`grid size-10 shrink-0 place-items-center rounded-xl ${o.department === "lab" ? "bg-lab-soft text-lab" : "bg-info-soft text-info"}`}><Icon name={o.department === "lab" ? "flask-conical" : "scan-line"} size={18} /></span>
              <span className="flex flex-1 flex-col"><span className="font-bold">{o.service_name}</span><span className="sub-sm">{o.doctor_name ?? "—"} · {o.branch_name} · <span className="num">{fmtDate(o.ordered_at)}</span></span></span>
            </div>
            <div className="flex flex-wrap gap-1.5"><Badge tone={o.result_ready ? "success" : "info"}>{o.status_ar}</Badge><Badge tone={pay_.tone}>{pay_.label}</Badge>{o.referral_status_ar && <Badge tone="muted">{o.referral_status_ar}</Badge>}</div>
            {o.result_available
              ? <Button size="md" icon="file-text" onClick={() => setOpen({ id: o.order_item_id, dept: o.department })}>عرض النتيجة</Button>
              : o.result_ready && o.amount_due > 0
                ? <div className="flex flex-col gap-2 rounded-xl bg-warn-soft p-3 text-warn-strong"><span className="text-[15px] font-semibold">نتيجتك جاهزة. تظهر بعد دفع <span className="num">{fmtNum(o.amount_due)}</span> د.ع.</span><span className="text-sm">ادفع هنا إلكترونياً أو في استقبال المجمع.</span>{o.invoice_id && <Button size="md" icon="credit-card" loading={busy === o.order_item_id} onClick={() => void pay(o)}>ادفع <span className="num">{fmtNum(o.amount_due)}</span> د.ع</Button>}</div>
                : null}
            <ReferralChoice id={o.referral_id} status={o.referral_status} patientId={patientId} canExternal={o.payment_status === "unpaid"} />
          </div>
        );
      })}
      {open && <ResultSheet {...open} onClose={() => setOpen(null)} />}
    </>
  );
}

const INV: Record<string, BadgeTone> = { paid: "success", partially_paid: "info", deferred: "info", unpaid: "warn" };
const LINE: Record<string, BadgeTone> = { paid: "success", deferred: "info", unpaid: "warn", refunded: "muted", partially_refunded: "muted" };

/** فواتير الفرد من كل الفروع (6): كل بند بنوعه وحالته، والدفع لبند واحد حتى لا يُحصَّل ما لم يختره المريض. */
function Invoices({ patientId }: { patientId: string }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["p", "invoices", patientId], queryFn: () => patientApi.get<{ items: MyInvoice[] }>(`/me/patients/${patientId}/invoices`), refetchOnMount: "always" });
  const [busy, setBusy] = useState<string | null>(null);
  async function pay(i: MyInvoice, itemId: string) {
    setBusy(itemId);
    try {
      const r = await payOnline({ purpose: "invoice", patient_id: patientId, invoice_id: i.invoice_id, invoice_item_id: itemId, label: `فاتورة ${i.invoice_number}` });
      toast[r.status === "succeeded" ? "success" : "warn"](r.status === "succeeded" ? "تم الدفع" : "لم يكتمل الدفع");
      void qc.invalidateQueries({ queryKey: ["p", "invoices", patientId] }); void qc.invalidateQueries({ queryKey: ["p", "file", patientId] });
    } catch (e) { toast.error(errorMessage(e)); } finally { setBusy(null); }
  }
  if (q.isPending) return <Spinner />;
  if (q.isError) return <Alert tone="danger">{errorMessage(q.error)}</Alert>;
  if (!q.data.items.length) return <Empty icon="receipt-text" title="لا توجد فواتير" hint="تظهر هنا فواتيرك من كل الفروع." />;
  const due = q.data.items.reduce((s, i) => s + i.due_amount, 0);
  return (
    <>
      {due > 0 ? <Alert tone="warn" icon="banknote">المستحق عليك <b className="num">{fmtNum(due)}</b> د.ع. ادفع البند الذي تريده هنا، أو في استقبال المجمع.</Alert> : <Alert tone="success">لا يوجد مبلغ مستحق.</Alert>}
      {q.data.items.map((i) => (
        <div key={i.invoice_id} className="flex flex-col gap-2 rounded-2xl border border-line bg-surface p-4">
          <div className="flex items-start gap-2"><span className="flex flex-1 flex-col"><span className="num font-bold" dir="ltr">{i.invoice_number}</span><span className="sub-sm">{i.branch_name} · <span className="num">{fmtDate(i.created_at)}</span></span></span><Badge tone={INV[i.status] ?? "muted"}>{i.status_ar}</Badge></div>
          {i.items.map((l) => (
            <div key={l.invoice_item_id} className="flex flex-col gap-1.5 border-t border-line pt-2">
              <div className="flex items-start gap-2"><span className="flex flex-1 flex-col"><span className="font-semibold">{l.service_name}</span><span className="sub-sm">{l.item_type_ar} · <span className="num">{fmtNum(l.net_price)}</span> د.ع</span></span><Badge tone={LINE[l.status] ?? "muted"}>{l.status_ar}</Badge></div>
              {l.payable && <Button size="md" icon="credit-card" loading={busy === l.invoice_item_id} onClick={() => void pay(i, l.invoice_item_id)}>ادفع <span className="num">{fmtNum(l.net_price)}</span> د.ع</Button>}
              {!l.payable && (l.status === "unpaid" || l.status === "deferred") && <span className="sub-sm">لا يُطالب به لأنه خارج المجمع أو أُغلق.</span>}
            </div>
          ))}
          <div className="flex items-center justify-between border-t border-line pt-2 text-[15px]"><span>المدفوع <b className="num">{fmtNum(i.paid_amount)}</b> من <b className="num">{fmtNum(i.net_amount)}</b> د.ع</span></div>
        </div>
      ))}
    </>
  );
}

const BOOK: Record<string, string> = { booked: "محجوز", cancelled: "ملغى", checked_in: "حضر", completed: "مكتمل", no_show: "غياب" };

function Appointments({ upcoming, past }: { upcoming: PBooking[]; past: PBooking[] }) {
  const card = (b: PBooking) => (
    <div key={b.booking_id} className="flex items-center gap-2 rounded-2xl border border-line bg-surface p-3.5">
      <span className="flex flex-1 flex-col"><span className="font-bold">{b.doctor_name}</span><span className="sub-sm">{b.branch_name ? `${b.branch_name} · ` : ""}<span className="num">{fmtDate(b.date)}</span>{b.estimated_time ? <> · <span className="num">{fmtTime(b.estimated_time)}</span></> : null}</span></span>
      <Badge tone={b.status === "cancelled" || b.status === "no_show" ? "muted" : "info"}>{BOOK[b.status] ?? b.status}</Badge>
    </div>
  );
  return (
    <>
      <span className="font-bold">القادمة</span>
      {upcoming.length ? upcoming.map(card) : <span className="sub">لا توجد مواعيد قادمة.</span>}
      <span className="font-bold">السابقة</span>
      {past.length ? past.map(card) : <span className="sub">لا توجد مواعيد سابقة.</span>}
    </>
  );
}

