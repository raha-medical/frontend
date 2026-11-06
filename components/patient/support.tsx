"use client";
/** تطبيق المراجع — الدعم (الجلسة 4): الأسئلة الشائعة، التواصل مع المجمع، طلب دعم أو شكوى. وخيارات إلغاء الطبيب جدوله (5.1-ب). */
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Icon } from "@/components/icon";
import { toast } from "@/components/toast";
import { Alert, Button, Empty, Modal, Spinner } from "@/components/ui";
import { patientApi } from "@/lib/api/staff";
import type { PatientSessionUser } from "@/lib/api/types";
import { errorMessage } from "@/lib/api/errors";
import { fmtDate, fmtDateTime, fmtNum, fmtTime } from "@/lib/format";
import { uuidv7 } from "@/lib/id";
import { pub } from "./shared";
import type { PBooking } from "./types";

type Faq = { faq_id: string; category: string; category_ar: string; question_ar: string; answer_ar: string };
type Contact = { branch_id: string; name: string; city: string | null; address: string | null; phone: string | null; whatsapp: string | null; whatsapp_url: string | null; call_url: string | null; directions: { google_maps_url: string } | null; working_hours: string | null; open_now: boolean | null };
type SupportRequest = { support_request_id: string; type: string; type_ar: string; description: string; status: string; status_ar: string; patient_name: string | null; booking_label: string | null; reply: string | null; replied_by_name: string | null; replied_at: string | null; created_at: string };

const TYPES: [string, string][] = [["booking", "حجز"], ["payment", "دفع"], ["refund", "استرجاع"], ["app", "التطبيق"], ["other", "أخرى"]];

export function SupportCenter({ user }: { user: PatientSessionUser }) {
  const [tab, setTab] = useState<"faq" | "contact" | "request">("faq");
  return (
    <>
      <div className="grid grid-cols-3 gap-1 rounded-xl bg-surface p-1">
        {([["faq", "الأسئلة الشائعة"], ["contact", "تواصل معنا"], ["request", "طلب دعم"]] as const).map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={`h-10 rounded-xl text-sm font-semibold ${tab === k ? "bg-primary text-on-accent" : "text-ink-2"}`}>{l}</button>
        ))}
      </div>
      {tab === "faq" && <FaqList />}
      {tab === "contact" && <Contacts />}
      {tab === "request" && <Requests user={user} />}
    </>
  );
}

function FaqList() {
  const q = useQuery({ queryKey: ["p", "faq"], queryFn: () => pub<{ items: Faq[] }>("/public/faq") });
  const [open, setOpen] = useState<string | null>(null);
  if (q.isPending) return <Spinner />;
  if (!q.data?.items.length) return <Empty icon="info" title="لا توجد أسئلة بعد" />;
  return (
    <div className="flex flex-col gap-2">
      {q.data.items.map((f) => (
        <div key={f.faq_id} className="rounded-2xl border border-line bg-surface">
          <button onClick={() => setOpen(open === f.faq_id ? null : f.faq_id)} aria-expanded={open === f.faq_id} className="flex min-h-12 w-full items-center gap-2 px-4 py-3 text-start">
            <span className="flex flex-1 flex-col"><span className="font-semibold">{f.question_ar}</span><span className="sub-sm">{f.category_ar}</span></span>
            <Icon name={open === f.faq_id ? "chevron-up" : "chevron-down"} size={18} className="text-ink-3" />
          </button>
          {open === f.faq_id && <p className="border-t border-line px-4 py-3 text-[15px] leading-7">{f.answer_ar}</p>}
        </div>
      ))}
    </div>
  );
}

function Contacts() {
  const q = useQuery({ queryKey: ["p", "contacts"], queryFn: () => pub<{ items: Contact[] }>("/public/contacts") });
  if (q.isPending) return <Spinner />;
  if (!q.data?.items.length) return <Empty icon="phone" title="لا توجد بيانات تواصل" />;
  return (
    <div className="flex flex-col gap-2.5">
      {q.data.items.map((b) => (
        <div key={b.branch_id} className="flex flex-col gap-2 rounded-2xl border border-line bg-surface p-4">
          <div className="flex items-center gap-2">
            <span className="flex flex-1 flex-col"><span className="font-bold">{b.name}</span><span className="sub-sm">{[b.city, b.address].filter(Boolean).join(" · ")}</span></span>
            {b.open_now != null && <span className={`rounded-full px-2.5 py-1 text-sm ${b.open_now ? "bg-success-soft text-success-strong" : "bg-bg text-ink-3"}`}>{b.open_now ? "مفتوح الآن" : "مغلق الآن"}</span>}
          </div>
          {b.working_hours && <span className="sub flex items-center gap-1.5"><Icon name="clock" size={15} />{b.working_hours}</span>}
          <div className="flex flex-wrap gap-2">
            {b.call_url && <a href={b.call_url} className="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-full bg-primary px-4 text-sm font-semibold text-on-accent"><Icon name="phone" size={16} />اتصال <span className="num" dir="ltr">{b.phone}</span></a>}
            {b.whatsapp_url && <a href={b.whatsapp_url} target="_blank" rel="noreferrer" className="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-full bg-success px-4 text-sm font-semibold text-on-accent"><Icon name="message-circle" size={16} />واتساب</a>}
            {b.directions && <a href={b.directions.google_maps_url} target="_blank" rel="noreferrer" className="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-full border border-line px-4 text-sm font-semibold"><Icon name="map-pin" size={16} />الموقع على الخريطة</a>}
          </div>
        </div>
      ))}
    </div>
  );
}

function Requests({ user }: { user: PatientSessionUser }) {
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ["p", "support"], queryFn: () => patientApi.get<{ items: SupportRequest[] }>("/me/support-requests") });
  const bookings = useQuery({ queryKey: ["p", "bookings", "upcoming"], queryFn: () => patientApi.get<{ items: PBooking[] }>("/bookings/my", { scope: "upcoming" }) });
  const past = useQuery({ queryKey: ["p", "bookings", "past"], queryFn: () => patientApi.get<{ items: PBooking[] }>("/bookings/my", { scope: "past" }) });
  const [f, setF] = useState({ type: "booking", description: "", booking_id: "", patient_id: user.patients.find((p) => p.relation === "self")?.patient_id ?? user.patients[0]?.patient_id ?? "" });
  const [busy, setBusy] = useState(false);
  const all = [...(bookings.data?.items ?? []), ...(past.data?.items ?? [])].slice(0, 20);
  return (
    <>
      <div className="flex flex-col gap-2.5 rounded-2xl bg-surface p-4">
        <span className="font-bold">نوع المشكلة</span>
        <div className="grid grid-cols-3 gap-1">{TYPES.map(([k, l]) => <button key={k} onClick={() => setF({ ...f, type: k })} className={`h-10 rounded-xl border text-sm font-semibold ${f.type === k ? "border-primary bg-primary-soft text-primary-strong" : "border-line"}`}>{l}</button>)}</div>
        {user.patients.length > 1 && (
          <label className="flex flex-col gap-1 text-sm">المراجع
            <select value={f.patient_id} onChange={(e) => setF({ ...f, patient_id: e.target.value, booking_id: "" })} className="h-11 rounded-xl border border-line-strong bg-surface px-3">{user.patients.map((p) => <option key={p.patient_id} value={p.patient_id}>{p.full_name}</option>)}</select>
          </label>
        )}
        <label className="flex flex-col gap-1 text-sm">الحجز (اختياري)
          <select value={f.booking_id} onChange={(e) => setF({ ...f, booking_id: e.target.value })} className="h-11 rounded-xl border border-line-strong bg-surface px-3">
            <option value="">بلا حجز</option>
            {all.filter((b) => !f.patient_id || b.patient_id === f.patient_id).map((b) => <option key={b.booking_id} value={b.booking_id}>{b.doctor_name} · {fmtDate(b.date)} · #{b.sequence_number}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">الوصف
          <textarea value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} rows={4} maxLength={2000} placeholder="اكتب المشكلة باختصار" className="rounded-xl border border-line-strong bg-surface p-3 text-[15px] outline-none focus:border-primary" />
        </label>
        <Button loading={busy} disabled={f.description.trim().length < 5} icon="send" onClick={async () => {
          setBusy(true);
          try {
            await patientApi.post("/me/support-requests", { support_request_id: uuidv7(), type: f.type, description: f.description.trim(), patient_id: f.patient_id || null, booking_id: f.booking_id || null });
            toast.success("أُرسل طلبك، وسيصلك إشعار عند الرد");
            setF({ ...f, description: "", booking_id: "" });
            void qc.invalidateQueries({ queryKey: ["p", "support"] });
          } catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); }
        }}>إرسال</Button>
      </div>
      <span className="font-bold">طلباتي</span>
      {list.isPending ? <Spinner /> : !list.data?.items.length ? <Empty icon="inbox" title="لا توجد طلبات" /> : list.data.items.map((r) => (
        <div key={r.support_request_id} className="flex flex-col gap-1.5 rounded-2xl border border-line bg-surface p-4">
          <div className="flex items-center gap-2"><span className="flex-1 font-semibold">{r.type_ar}</span><span className={`rounded-full px-2.5 py-1 text-sm ${r.status === "open" ? "bg-warn-soft text-warn-strong" : "bg-success-soft text-success-strong"}`}>{r.status_ar}</span></div>
          <span className="sub-sm num">{fmtDateTime(r.created_at)}{r.booking_label ? ` · ${r.booking_label}` : ""}</span>
          <p className="text-[15px]">{r.description}</p>
          {r.reply && <div className="rounded-xl bg-primary-soft p-3 text-[15px]"><span className="sub-sm">{r.replied_by_name} · <span className="num">{fmtDateTime(r.replied_at)}</span></span><p>{r.reply}</p></div>}
        </div>
      ))}
    </>
  );
}

// ------------------------------------------------------------------ خيارات إلغاء الطبيب جدوله (5.1-ب)
type CancelOption = { code: "rebook" | "credit" | "refund"; label_ar: string; available: boolean; note: string | null; session_id: string | null; date: string | null; start: string | null; estimated_time: string | null };
type CancelOptions = { booking_id: string; doctor_cancelled: boolean; amount: number; resolution: string | null; resolution_ar: string | null; doctor_name: string; options: CancelOption[] };
const ICONS: Record<string, string> = { rebook: "calendar-plus", credit: "wallet", refund: "undo-2" };

export function DoctorCancelOptions({ bookingId, onClose, onDone }: { bookingId: string; onClose: () => void; onDone: () => void }) {
  const q = useQuery({ queryKey: ["p", "cancel-options", bookingId], queryFn: () => patientApi.get<CancelOptions>(`/me/bookings/${bookingId}/cancellation-options`) });
  const [busy, setBusy] = useState<string | null>(null);
  const o = q.data;
  return (
    <Modal open onClose={onClose} title="ألغى الطبيب موعدك">
      {q.isPending ? <Spinner /> : !o ? <Alert tone="danger">{errorMessage(q.error)}</Alert> : (
        <div className="flex flex-col gap-3">
          <Alert tone="info" icon="wallet">أُضيف <span className="num font-bold">{fmtNum(o.amount)}</span> د.ع رصيداً في محفظتك. {o.resolution ? o.resolution_ar : "اختر ما تريد:"}</Alert>
          {!o.resolution && o.options.map((x) => (
            <button key={x.code} disabled={!x.available || busy !== null} onClick={async () => {
              setBusy(x.code);
              try {
                const r = await patientApi.post<{ resolution_ar: string; new_booking: { date: string; sequence_number: number } | null }>(`/me/bookings/${bookingId}/cancellation-choice`, { choice: x.code, session_id: x.session_id });
                toast.success(r.new_booking ? `${r.resolution_ar}: ${fmtDate(r.new_booking.date)}، رقمك ${r.new_booking.sequence_number}` : r.resolution_ar);
                onDone();
              } catch (e) { toast.error(errorMessage(e)); } finally { setBusy(null); }
            }} className="flex items-start gap-3 rounded-2xl border border-line bg-surface p-4 text-start disabled:opacity-50">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary"><Icon name={busy === x.code ? "loader-circle" : ICONS[x.code]} size={19} className={busy === x.code ? "animate-spin" : ""} /></span>
              <span className="flex flex-col gap-0.5">
                <span className="font-bold">{x.label_ar}</span>
                {x.code === "rebook" && x.date && <span className="text-[15px]"><span className="num">{fmtDate(x.date)}</span> · {x.start} · الدخول التقريبي <span className="num">{fmtTime(x.estimated_time)}</span></span>}
                {x.note && <span className="sub-sm">{x.note}</span>}
              </span>
            </button>
          ))}
        </div>
      )}
    </Modal>
  );
}
