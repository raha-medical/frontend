"use client";
/** نافذتا إلغاء الحجز وتغيير موعده (المواصفة 3.2، العقد 5.x). مشتركتان بين تطبيق المريض وجدول مراجعي اليوم.
 *  تعرضان ما سيحدث من السيرفر (preview) قبل زر التأكيد دائماً، ولا تحسبان أي مبلغ في الواجهة. */
import { useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import { Icon } from "@/components/icon";
import { toast } from "@/components/toast";
import { Alert, Button, Field, Modal, Spinner, controlCls } from "@/components/ui";
import type { ApiClient } from "@/lib/api/client";
import { policyApi, type CancelResult } from "@/lib/api/booking";
import { errorMessage } from "@/lib/api/errors";
import { API_URL } from "@/lib/config";
import { addDays, todayBaghdad, weekdayAr } from "@/lib/date";
import { fmtDateTime, fmtDayMonth, fmtIqd, fmtTextDates, fmtTime, fmtTimeRange } from "@/lib/format";
import { uuidv7 } from "@/lib/id";

type Mode = "patient" | "staff";

/** تطبيق المريض: فوق شريط التنقل السفلي وبأحجام خط التطبيق. */
function Layer({ mode, children }: { mode: Mode; children: ReactNode }) {
  if (mode === "staff") return <>{children}</>;
  return createPortal(<div className="scale-patient">{children}</div>, document.body);
}

function Fact({ label, children, tone }: { label: string; children: ReactNode; tone?: "danger" | "success" }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-line py-2 text-sm last:border-0">
      <span className="text-ink-2">{label}</span>
      <span className={`text-end font-semibold ${tone === "danger" ? "text-danger-strong" : tone === "success" ? "text-success-strong" : ""}`}>{children}</span>
    </div>
  );
}
const Conditions = ({ items }: { items: string[] }) => (
  <details className="rounded-xl bg-bg px-3 py-2 text-sm" open>
    <summary className="cursor-pointer font-semibold">الشروط</summary>
    <ul className="mt-1.5 flex list-disc flex-col gap-1 ps-4 leading-6 text-ink-2">{items.map((c) => <li key={c}>{fmtTextDates(c)}</li>)}</ul>
  </details>
);

// ------------------------------------------------------------------ الإلغاء
export function CancelDialog({ client, bookingId, who, mode, onClose, onDone }: { client: ApiClient; bookingId: string; who?: string; mode: Mode; onClose: () => void; onDone: (r: CancelResult) => void }) {
  const api = useMemo(() => policyApi(client), [client]);
  const q = useQuery({ queryKey: ["booking", "cancel-preview", bookingId], queryFn: () => api.cancelPreview(bookingId), gcTime: 0, staleTime: 0 });
  const [reason, setReason] = useState("");
  const [waive, setWaive] = useState(false);
  const [waiveReason, setWaiveReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  const p = q.data;
  const staff = mode === "staff";
  const ready = !!p?.allowed && (!staff || !!reason.trim()) && (!waive || !!waiveReason.trim());

  async function confirm() {
    setBusy(true); setErr(null);
    try {
      const r = await api.cancel(bookingId, { reason: reason.trim() || "ألغاه المريض من التطبيق", ...(waive ? { waive_fee: true, waive_reason: waiveReason.trim() } : {}) });
      toast.success(r.fee_amount > 0 ? `أُلغي الحجز · رسوم ${fmtIqd(r.fee_amount)}` : "أُلغي الحجز");
      onDone(r);
    } catch (e) { setErr(e); } finally { setBusy(false); }
  }

  return (
    <Layer mode={mode}>
      <Modal open onClose={onClose} title={who ? `إلغاء حجز ${who}` : "إلغاء الحجز"} icon="calendar-x" width={500}>
        {q.isPending ? <Spinner /> : q.isError ? <Alert tone="danger">{errorMessage(q.error)}</Alert> : !p ? null : !p.allowed ? <Alert tone="warn">{p.blocked_reason_ar ?? "لا يمكن إلغاء هذا الحجز."}</Alert> : (
          <>
            <Alert tone={p.is_late ? "warn" : "success"} icon={p.is_late ? "triangle-alert" : "circle-check"}>{waive ? "إعفاء من الرسوم والغياب: لا رسوم ولا يُحتسب غياباً." : fmtTextDates(p.summary_ar)}</Alert>
            <div className="flex flex-col">
              {p.appointment_at && <Fact label="الموعد"><span className="num">{fmtDateTime(p.appointment_at)}</span></Fact>}
              {p.free_cancel_until && <Fact label="الإلغاء المجاني حتى"><span className="num">{fmtDateTime(p.free_cancel_until)}</span></Fact>}
              <Fact label="رسوم الإلغاء" tone={p.fee_amount > 0 && !waive ? "danger" : "success"}><span className="num">{p.fee_amount > 0 && !waive ? fmtIqd(p.fee_amount) : "بلا رسوم"}</span></Fact>
              <Fact label="يُحتسب غياباً" tone={p.counts_as_no_show && !waive ? "danger" : "success"}>{p.counts_as_no_show && !waive ? "نعم" : "لا"}</Fact>
              {p.paid_amount > 0 && <Fact label="المبلغ المدفوع"><span className="num">{fmtIqd(p.paid_amount)}</span> {p.paid_amount_to === "refund" ? "· يُرجع لوسيلة الدفع" : "· يتحول رصيداً لك"}</Fact>}
              {p.deposit_credit > 0 && <Fact label="العربون"><span className="num">{fmtIqd(p.deposit_credit)}</span> · يبقى رصيداً</Fact>}
            </div>
            <Conditions items={p.conditions_ar} />
            {staff && <Field label="سبب الإلغاء (إلزامي)" icon="notebook-pen" value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />}
            {p.can_waive && (
              <div className="flex flex-col gap-2 rounded-xl border border-line p-3">
                <label className="flex cursor-pointer items-center gap-2.5 text-sm font-semibold"><input type="checkbox" className="size-5 accent-primary" checked={waive} onChange={(e) => setWaive(e.target.checked)} />إعفاء من الرسوم والغياب</label>
                {waive && <Field label="سبب الإعفاء (إلزامي، يُسجل في التدقيق)" value={waiveReason} onChange={(e) => setWaiveReason(e.target.value)} />}
              </div>
            )}
            {err != null && <Alert tone="danger">{errorMessage(err)}</Alert>}
          </>
        )}
        <div className="flex flex-wrap gap-2">
          {p?.allowed && <Button size="md" variant="danger" className="flex-1" icon="calendar-x" loading={busy} disabled={!ready} onClick={confirm}>تأكيد الإلغاء</Button>}
          <Button size="md" variant="ghost" onClick={onClose}>رجوع</Button>
        </div>
      </Modal>
    </Layer>
  );
}

// ------------------------------------------------------------------ تغيير الموعد
type Day = { session_id: string; date: string; start: string; end: string; status: string; online_remaining: number; next_estimated_time: string | null };
export type RescheduleBooking = { booking_id: string; doctor_id: string; doctor_name?: string; session_id?: string };

export function RescheduleDialog({ client, booking, who, mode, onClose, onDone }: { client: ApiClient; booking: RescheduleBooking; who?: string; mode: Mode; onClose: () => void; onDone: () => void }) {
  const api = useMemo(() => policyApi(client), [client]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const from = todayBaghdad(), to = addDays(from, 13);
  const days = useQuery({
    queryKey: ["booking", "availability", booking.doctor_id, from],
    queryFn: async () => { const r = await fetch(`${API_URL}/public/doctors/${booking.doctor_id}/availability?from=${from}&to=${to}`); if (!r.ok) throw new Error("تعذر جلب المواعيد المتاحة."); return (await r.json()) as { days: Day[] }; },
  });
  const pv = useQuery({ queryKey: ["booking", "reschedule-preview", booking.booking_id, sessionId], queryFn: () => api.reschedulePreview(booking.booking_id, sessionId ?? undefined), gcTime: 0, staleTime: 0 });
  const [override, setOverride] = useState(false);
  const [overrideReason, setOverrideReason] = useState("");
  const [reason, setReason] = useState("");
  const [key] = useState(uuidv7);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  const p = pv.data;
  const blocked = !!p && !p.allowed;
  const canOverride = !!p?.can_override;
  const ready = !!sessionId && !!p?.target && !pv.isFetching && (p.allowed || (override && !!overrideReason.trim()));

  async function confirm() {
    if (!sessionId) return;
    setBusy(true); setErr(null);
    try {
      await api.reschedule(booking.booking_id, { session_id: sessionId, reason: reason.trim() || undefined, ...(override ? { override_policy: true, override_reason: overrideReason.trim() } : {}) }, key);
      toast.success("تغيّر الموعد");
      onDone();
    } catch (e) { setErr(e); } finally { setBusy(false); }
  }

  return (
    <Layer mode={mode}>
      <Modal open onClose={onClose} title={who ? `تغيير موعد ${who}` : "تغيير الموعد"} icon="calendar-clock" width={540}>
        {pv.isPending && !p ? <Spinner /> : pv.isError ? <Alert tone="danger">{errorMessage(pv.error)}</Alert> : p && (
          <>
            {blocked && !canOverride && <Alert tone="warn">{p.blocked_reason_ar ?? "لا يمكن تغيير موعد هذا الحجز."}</Alert>}
            {blocked && canOverride && <Alert tone="warn">{p.blocked_reason_ar}</Alert>}
            {(!blocked || canOverride) && (
              <>
                <span className="sub">{booking.doctor_name ? `${booking.doctor_name} · ` : ""}اختر موعداً آخر عند نفس الطبيب. متبقي <b className="num">{p.remaining_reschedules}</b> من <b className="num">{p.max_reschedules}</b> {p.max_reschedules === 1 ? "مرة" : "مرات"}.</span>
                {days.isPending ? <Spinner /> : days.isError ? <Alert tone="danger">{errorMessage(days.error)}</Alert> : !days.data?.days.length ? <Alert tone="info">لا توجد مواعيد متاحة خلال أسبوعين.</Alert> : (
                  <div className="grid max-h-56 grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3" role="radiogroup" aria-label="المواعيد المتاحة">
                    {days.data.days.map((d) => {
                      const cur = d.session_id === booking.session_id;
                      const ok = d.status === "open" && (mode === "staff" || d.online_remaining > 0) && !cur;
                      const on = sessionId === d.session_id;
                      return (
                        <button key={d.session_id} type="button" role="radio" aria-checked={on} disabled={!ok} onClick={() => { setSessionId(d.session_id); setErr(null); }}
                          className={`flex flex-col items-center gap-0.5 rounded-2xl border-[1.5px] p-2.5 transition-colors duration-base disabled:opacity-45 ${on ? "border-primary bg-primary-soft" : "border-line bg-surface hover:border-primary/50"}`}>
                          <span className="text-sm font-semibold">{d.date === from ? "اليوم" : weekdayAr(d.date)}</span>
                          <span className="num text-sm font-bold">{fmtDayMonth(d.date)}</span>
                          <span className="num text-[13px] text-ink-2">{fmtTimeRange(d.start, d.end)}</span>
                          <span className="text-[13px] text-ink-3">{cur ? "موعدك الحالي" : d.status === "cancelled" ? "ملغى" : d.status === "closed" ? "مغلق" : d.status === "full" || !d.online_remaining ? "ممتلئ" : `متبقي ${d.online_remaining}`}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
                {p.target && (
                  <div className="enter flex flex-col">
                    <Fact label="الموعد الجديد"><span className="num">{fmtDayMonth(p.target.date)} · {fmtTimeRange(p.target.start, p.target.end)}</span></Fact>
                    {p.target.estimated_time && <Fact label="الدخول التقريبي"><span className="num">{fmtTime(p.target.estimated_time)}</span></Fact>}
                    <Fact label="رسوم التغيير" tone="success"><span className="num">{p.fee_amount > 0 ? fmtIqd(p.fee_amount) : "بلا رسوم"}</span></Fact>
                    <Fact label="المرات المتبقية بعد التغيير"><span className="num">{p.remaining_after}</span></Fact>
                    {p.paid_amount > 0 && <Fact label="المبلغ المدفوع"><span className="num">{fmtIqd(p.paid_amount)}</span> · يبقى على الحجز</Fact>}
                  </div>
                )}
                {pv.isFetching && <Spinner label="جارٍ فحص الموعد…" />}
                <Conditions items={p.conditions_ar} />
                {mode === "staff" && <Field label="السبب (اختياري)" icon="notebook-pen" value={reason} onChange={(e) => setReason(e.target.value)} />}
                {canOverride && blocked && (
                  <div className="flex flex-col gap-2 rounded-xl border border-line p-3">
                    <label className="flex cursor-pointer items-center gap-2.5 text-sm font-semibold"><input type="checkbox" className="size-5 accent-primary" checked={override} onChange={(e) => setOverride(e.target.checked)} />تجاوز السياسة لهذا الحجز</label>
                    {override && <textarea rows={2} value={overrideReason} onChange={(e) => setOverrideReason(e.target.value)} aria-label="سبب التجاوز" placeholder="سبب التجاوز (إلزامي، يُسجل في التدقيق)" className={`${controlCls} h-auto py-2.5`} />}
                  </div>
                )}
              </>
            )}
          </>
        )}
        {err != null && <Alert tone="danger">{errorMessage(err)}</Alert>}
        <div className="flex flex-wrap gap-2">
          {p && (!blocked || canOverride) && <Button size="md" className="flex-1" icon="calendar-check" loading={busy} disabled={!ready} onClick={confirm}>تأكيد الموعد الجديد</Button>}
          <Button size="md" variant="ghost" onClick={onClose}>رجوع</Button>
        </div>
        {!sessionId && p && (!blocked || canOverride) && <span className="sub-sm flex items-center gap-1.5"><Icon name="info" size={14} />اختر موعداً لترى تفاصيل التغيير قبل التأكيد.</span>}
      </Modal>
    </Layer>
  );
}
