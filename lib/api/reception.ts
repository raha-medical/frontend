/** استدعاءات الاستقبال — العقد الأقسام 4 (المرضى) و5 (الحجز) و7 (الطابور) و17 (المزامنة). */
import { staffApi } from "./staff";
import { API_URL } from "../config";

// ---------- الطابور (7) ----------
export type TicketStatus = "waiting" | "arrived" | "called" | "in_room" | "completed" | "no_show" | "skipped" | "cancelled" | "awaiting_results";
export type PaymentStatus = "paid" | "unpaid" | "deferred" | "refunded" | "not_billed";
export type TicketSource = "online" | "walk_in" | "phone";
export type Priority = "normal" | "emergency" | "late_reinserted" | "returning";
/** حالة العرض من السيرفر (التدقيق 1.2 و2.3-ج). */
export type DisplayState = "awaiting_results" | "ready_to_return" | "returning" | "awaiting_payment";

export interface QueueItem {
  ticket_id: string;
  ticket_number: string;
  patient_id: string;
  patient_name: string;
  file_number?: string | null;
  booking_id: string | null;
  source: TicketSource;
  priority: Priority;
  status: TicketStatus;
  payment_status: PaymentStatus;
  invoice_id: string | null;
  queue_position: number | null;
  estimated_time: string | null;
  arrived_at?: string | null;
  called_at?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
  call_acknowledged_at?: string | null;
  call_alerts_sent?: number;
  on_the_way_at?: string | null;
  on_the_way_eta_minutes?: number | null;
  /** «بانتظار المختبر» / «جاهز للعودة» / «عائد بالنتائج» / «حاضر — بانتظار الدفع» */
  display_state?: DisplayState | null;
  display_state_ar?: string | null;
  awaiting_services?: string[] | null;
  awaiting_since?: string | null;
  returned_at?: string | null;
  original_ticket_id?: string | null;
  /** مراجع «إضافي» فوق السعة (المرحلة 2أ). */
  is_extra?: boolean;
  /** علامة محلية: تغيير محفوظ أوفلاين بانتظار المزامنة */
  _pending?: boolean;
}

export interface CallPolicy { call_next_by: "doctor" | "reception" | "both"; auto_call_next: boolean }

export interface QueueSession {
  session_id: string;
  doctor_id: string;
  doctor_name: string;
  clinic_id: string;
  clinic_name: string;
  date: string;
  start: string;
  end: string;
  session_status: string;
  avg_consult_minutes_today: number | null;
  delay_minutes: number | null;
  call_policy?: CallPolicy;
  /** يوم العيادة المرن: `end` النهاية الفعلية بعد التمديد، و`scheduled_end` نهاية الجدول. */
  doctor_arrived_at?: string | null;
  scheduled_end?: string;
  extended?: boolean;
  registration_closed?: boolean;
  allow_extra?: boolean;
  capacity_total?: number;
  /** «تأخر الطبيب» المعلن من الاستقبال أو الإدارة (0 = لا تأخير). */
  doctor_delay_minutes?: number;
  doctor_delay_reason?: string | null;
  items: QueueItem[];
}
export interface SessionControl { session_id: string; start: string; end: string; scheduled_end: string; doctor_arrived_at: string | null; registration_closed: boolean; doctor_delay_minutes?: number; doctor_delay_reason?: string | null }
export interface DoctorDelayResult { session_id: string; delay_minutes: number; reason: string | null; notified_patients: number }

/** بدون doctor_id يعيد { sessions } لعيادات موظف الاستقبال؛ مع doctor_id جلسة واحدة أو 204. */
export async function getLiveSessions(params: { clinic_id?: string; date?: string; doctor_id?: string } = {}): Promise<QueueSession[]> {
  const r = await staffApi.get<{ sessions?: QueueSession[] } | QueueSession | undefined>("/queue/live", params);
  if (!r) return [];
  if ("sessions" in r && Array.isArray(r.sessions)) return r.sessions;
  return [r as QueueSession];
}

export interface TicketActionResult {
  ticket_id: string; ticket_number?: string; status: TicketStatus; priority?: Priority; queue_position?: number | null; estimated_time?: string | null;
  called_at?: string | null; started_at?: string | null; completed_at?: string | null; next_ticket?: TicketActionResult | null;
}

export interface CheckInRequest { ticket_id: string; booking_id?: string | null; booking_qr?: string | null; patient_id?: string | null; doctor_id?: string | null; visit_kind?: "auto" | "new_visit" | "follow_up"; allow_extra?: boolean;
  /** للمراجع الذي ينتظر نتائج الطبيب أو له عودة مجانية: return = عودة بالنتائج، new = زيارة جديدة (وإلا 409 RETURN_OR_NEW_REQUIRED) */
  visit_mode?: "return" | "new" }
export interface CheckInResult {
  ticket_id: string; ticket_number: string; status: TicketStatus; queue_position: number | null; estimated_time: string | null;
  invoice_id: string | null; visit_kind: "new_visit" | "follow_up"; amount_due: number; payment_status: PaymentStatus; is_extra?: boolean;
  /** عربون الحجز المطروح من amount_due (2.3-ب) */
  deposit_credit?: number;
}

export const queueApi = {
  checkIn: (b: CheckInRequest, key?: string) => staffApi.post<CheckInResult>("/queue/check-in", b, { idempotencyKey: key }),
  call: (id: string) => staffApi.post<TicketActionResult>(`/queue/tickets/${id}/call`),
  callNext: (doctorId: string) => staffApi.request<TicketActionResult>("/queue/call-next", { method: "POST", query: { doctor_id: doctorId } }),
  complete: (id: string, callNext?: boolean) => staffApi.post<TicketActionResult>(`/queue/tickets/${id}/complete`, callNext === undefined ? {} : { call_next: callNext }),
  noShow: (id: string, mode: "skip" | "final") =>
    staffApi.post<{ ticket_id: string; status: TicketStatus; queue_recalculated: boolean; counted_as_no_show: boolean; patient_banned: boolean }>(`/queue/tickets/${id}/no-show`, { mode }),
  emergency: (id: string, reason: string) => staffApi.post<{ ticket_id: string; priority: Priority; position: number; affected_tickets: number }>(`/queue/tickets/${id}/emergency`, { reason }),
  lateArrival: (id: string) => staffApi.post<TicketActionResult>(`/queue/tickets/${id}/late-arrival`),
  /** «عاد بالنتائج»: نفس الدور والكشفية بأولوية returning. external = نتائج المتبقي من خارج المجمع. */
  returned: (id: string, external = false) => staffApi.post<CheckInResult>(`/queue/tickets/${id}/returned`, { external }),
  doctorArrived: (sessionId: string) => staffApi.post<SessionControl>(`/queue/sessions/${sessionId}/doctor-arrived`),
  /** «تأخر الطبيب» لوجبة اليوم قبل وصوله: يُخطر المحجوزين. minutes = 0 يلغيه. */
  delay: (sessionId: string, minutes: number, reason?: string) =>
    staffApi.post<DoctorDelayResult>(`/queue/sessions/${sessionId}/delay`, { minutes, reason: reason || undefined }),
  extend: (sessionId: string, end: string) => staffApi.post<SessionControl>(`/queue/sessions/${sessionId}/extend`, { end }),
  registration: (sessionId: string, closed: boolean) => staffApi.post<SessionControl>(`/queue/sessions/${sessionId}/registration`, { closed }),
  fastForward: (sessionId: string, body: { gap_minutes?: number; max_recipients?: number } | { mode: "invite"; from_time?: string; max_recipients?: number; expires_minutes?: number }) =>
    staffApi.post<{ offer_id: string; sent_to: number; expires_at: string; mode?: string }>(`/queue/sessions/${sessionId}/fast-forward-offers`, body),
};

// ---------- المرضى (4) ----------
export interface PatientSearchItem { patient_id: string; file_number: string; full_name: string; phone_number: string; last_visit_date: string | null; is_banned: boolean; outstanding_balance: number }
export interface Patient {
  patient_id: string; file_number: string; full_name: string; phone_number: string; birth_date: string | null; approx_age: number | null;
  gender: "male" | "female"; home_branch_id?: string; is_banned: boolean; no_show_count: number; credit_balance: number; merged_into_patient_id: string | null;
}
export interface NewPatient { patient_id: string; full_name: string; phone_number: string; gender: "male" | "female"; birth_date?: string | null; approx_age?: number | null; created_offline_at?: string | null }

export const patientsApi = {
  search: (q: { phone?: string; q?: string; file_number?: string }) => staffApi.get<{ items: PatientSearchItem[]; total: number }>("/patients/search", q),
  get: (id: string) => staffApi.get<Patient>(`/patients/${id}`),
  create: (b: NewPatient, key?: string) => staffApi.post<{ patient_id: string; file_number: string; full_name: string; phone_number: string; possible_duplicates: PatientSearchItem[] }>("/patients", b, { idempotencyKey: key }),
  update: (id: string, b: Partial<Pick<Patient, "full_name" | "phone_number" | "birth_date" | "approx_age" | "gender">>) => staffApi.patch<Patient>(`/patients/${id}`, b),
  banStatus: (id: string) => staffApi.get<{ is_banned: boolean; reason: string | null; no_show_count: number; banned_at: string | null; unban_deposit_amount: number }>(`/patients/${id}/ban-status`),
};

/** يحدد نوع البحث من النص: هاتف، رقم ملف، أو اسم. */
export function searchParamsFor(text: string): { phone?: string; q?: string; file_number?: string } | null {
  const t = text.trim().replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
  if (t.length < 2) return null;
  if (/^[A-Za-z]{1,3}\d*-\d+$/.test(t)) return { file_number: t.toUpperCase() };
  const digits = t.replace(/[\s+-]/g, "");
  if (/^\d{4,}$/.test(digits)) return { phone: digits };
  return { q: t };
}

// ---------- الأطباء والحجز (3، 5) ----------
export interface Doctor { doctor_id: string; full_name: string; specialty: string; job_title: string | null; clinic_id: string; clinic_name: string; default_slot_minutes: number; photo_url: string | null }
export interface DoctorSession { session_id: string; date: string; weekday: string; start: string; end: string; starts_at: string; slot_minutes: number; capacity_total: number; online_quota: number; status: string; cancel_reason: string | null }
export interface AvailabilityDay { date: string; session_id: string; start: string; end: string; capacity_total: number; online_remaining: number; next_sequence_number: number | null; next_estimated_time: string | null; status: "open" | "full" | "cancelled" | "closed" }
export interface Booking {
  booking_id: string; patient_id: string; patient_name: string; session_id: string; doctor_id: string; doctor_name: string; date: string; sequence_number: number;
  ticket_number: string; estimated_time: string | null; queue_position: number | null; visit_kind: string; price: number; source: TicketSource; status: string; payment_status: string;
  /** تنبيهات لا تمنع الحجز (BOOKING_TIME_OVERLAP) */
  warnings?: { code: string; message: string; booking_id?: string | null }[] | null;
}

export const doctorsApi = {
  list: (q: { clinic_id?: string } = {}) => staffApi.get<{ items: Doctor[] }>("/doctors", q),
  sessions: (id: string, from: string, to: string) => staffApi.get<{ doctor_id: string; items: DoctorSession[] }>(`/doctors/${id}/sessions`, { from, to }),
  /** Public (بلا توكن): الأيام المتاحة وما تبقى من حصة الحجز المسبق. */
  availability: async (id: string, from: string, to: string) => {
    const res = await fetch(`${API_URL}/public/doctors/${id}/availability?from=${from}&to=${to}`);
    if (!res.ok) throw new Error(String(res.status));
    return (await res.json()) as { doctor_id: string; days: AvailabilityDay[] };
  },
};

export const bookingsApi = {
  create: (b: { booking_id: string; patient_id: string; session_id: string; visit_kind?: "auto" | "new_visit" | "follow_up" }, key?: string) =>
    staffApi.post<Booking>("/bookings", b, { idempotencyKey: key }),
  forPatient: (patientId: string) => staffApi.get<{ items: Booking[] }>("/bookings", { patient_id: patientId }),
};
