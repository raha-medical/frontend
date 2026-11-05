/** المرحلة 3 (العقد 5.x و7.y): معاينة الإلغاء وتغيير الموعد، تثبيت الحضور الذاتي، وجدول مراجعي اليوم.
 *  دوال المعاينة تعمل بتوكن المريض أو الموظف، فتأخذ عميل الـ API معاملاً. */
import type { ApiClient } from "./client";
import { staffApi } from "./staff";

export interface BookingPolicy { free_cancel_hours: number; late_cancel_fee: number; late_cancel_counts_as_no_show: boolean; max_reschedules: number; reschedule_min_hours: number; cancel_paid_to: "credit" | "refund" }

export interface CancelPreview {
  booking_id: string; allowed: boolean; blocked_code: string | null; blocked_reason_ar: string | null;
  appointment_at: string | null; free_cancel_until: string | null; hours_before_appointment: number | null; free_cancel_hours: number;
  is_late: boolean; fee_amount: number; counts_as_no_show: boolean; paid_amount: number; paid_amount_to: "credit" | "refund" | "none";
  credit_amount: number; refund_amount: number; deposit_credit: number; can_waive: boolean;
  conditions_ar: string[]; summary_ar: string; policy: BookingPolicy;
}
export interface CancelResult { status: string; counted_as_no_show: boolean; credit_added: number; late: boolean; fee_amount: number; fee_invoice_id: string | null; fee_waived: boolean; refund_amount: number; paid_amount_to: string }

export interface RescheduleTarget { session_id: string; doctor_id: string; date: string; start: string; end: string; estimated_time: string | null; online_remaining: number; status: string }
export interface ReschedulePreview {
  booking_id: string; allowed: boolean; blocked_code: string | null; blocked_reason_ar: string | null;
  reschedule_count: number; max_reschedules: number; remaining_reschedules: number; remaining_after: number; min_notice_hours: number;
  appointment_at: string | null; reschedule_deadline: string | null; fee_amount: number; paid_amount: number; payment_effect: "kept" | "none"; can_override: boolean;
  target: RescheduleTarget | null; conditions_ar: string[]; policy: BookingPolicy;
}

export const policyApi = (c: ApiClient) => ({
  cancelPreview: (id: string) => c.get<CancelPreview>(`/bookings/${id}/cancel-preview`),
  cancel: (id: string, b: { reason: string; waive_fee?: boolean; waive_reason?: string | null }) => c.post<CancelResult>(`/bookings/${id}/cancel`, b),
  reschedulePreview: (id: string, sessionId?: string) => c.get<ReschedulePreview>(`/bookings/${id}/reschedule-preview`, { session_id: sessionId }),
  reschedule: (id: string, b: { session_id: string; reason?: string; override_policy?: boolean; override_reason?: string | null }, key: string) => c.post<{ booking_id: string; date: string; ticket_number: string | null; estimated_time: string | null; reschedule_count: number }>(`/bookings/${id}/reschedule`, b, { idempotencyKey: key }),
});

export interface SelfCheckInResult {
  booking_id: string; ticket_id: string; ticket_number: string; status: string; queue_position: number | null; estimated_time: string | null;
  invoice_id: string | null; visit_kind: string; amount_due: number; payment_status: string; already_checked_in: boolean;
  doctor_name: string; clinic_name: string; floor: number | null; message_ar: string;
}

export type TodayStatus = "booked" | "arrived" | "in_room" | "completed" | "cancelled" | "no_show";
export type TodayPayment = "paid" | "unpaid" | "partial" | "deferred" | "refunded";
export type TodayAction = "check_in" | "late_arrival" | "cancel" | "reschedule" | "no_show" | "collect_payment";
export interface TodayRow {
  ticket_id: string; booking_id: string | null; ticket_number: string; patient_id: string; patient_name: string; phone_number: string; file_number: string;
  date: string; scheduled_time: string | null; estimated_time: string | null; arrived_at: string | null;
  doctor_id: string; doctor_name: string; clinic_id: string; clinic_name: string; session_id: string; source: string;
  status: TodayStatus; ticket_status: string; booking_status: string | null; payment_status: TodayPayment; invoice_id: string | null; amount_due: number;
  queue_position: number | null; priority: string; is_extra: boolean; check_in_method: "reception" | "self_qr" | null; reschedule_count: number; actions: TodayAction[];
}
export interface TodayResponse { date: string; items: TodayRow[]; page: number; page_size: number; total: number; summary: { total: number; booked: number; arrived: number; in_room: number; completed: number; cancelled: number; no_show: number } }
export const receptionTodayApi = {
  list: (q: { date?: string; doctor_id?: string; status?: string; payment_status?: string; q?: string; page_size?: number }) => staffApi.get<TodayResponse>("/reception/today", q),
};
