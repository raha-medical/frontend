import type { Directions } from "@/lib/geo";

export type PBranch = { branch_id: string; name: string; city: string | null; address?: string | null; working_hours?: string | null; phone?: string | null; latitude?: number | null; longitude?: number | null; status: string; status_ar: string; status_reason_ar: string | null; departments: string[]; doctors_count: number; directions?: Directions | null };

export type PBooking = { booking_id: string; patient_id: string; patient_name: string; doctor_id: string; doctor_name: string; session_id: string; branch_id?: string | null; branch_name?: string | null; reschedule_count?: number; check_in_method?: "reception" | "self_qr" | null; date: string; sequence_number: number; ticket_number: string | null; estimated_time: string | null; visit_kind: string; price: number; status: string; payment_status: string; payment_options: string[]; cancel_reason: string | null; cancel_resolution?: "credit" | "rebooked" | "refunded" | null; cancel_options_pending?: boolean; warnings?: { code: string; message: string }[] | null };

export type RxLine = { drug_name: string; dose: string | null; frequency: string | null; duration_days: number | null; instructions: string | null };
export type MyPrescription = { prescription_id: string; prescription_code: string; status: string; patient_name: string; doctor_name: string | null; branch_name: string | null; issued_at: string; expires_at: string; items: RxLine[]; referral_id?: string | null; referral_status?: string | null; referral_status_ar?: string | null };
export type MyOrder = { order_item_id: string; department: string; service_name: string; status: string; status_ar: string; branch_name: string; doctor_name: string | null; ordered_at: string; result_ready: boolean; payment_status: string; payment_required: boolean; amount_due: number; invoice_id?: string | null; invoice_item_id: string; result_available: boolean; referral_id?: string | null; referral_status?: string | null; referral_status_ar?: string | null };
export type VisitOrder = { order_item_id: string; department: string; service_name: string; status: string; result_available: boolean; payment_required: boolean };
export type Visit = { consultation_id: string; date: string; branch_name?: string | null; doctor_name: string; clinic_name: string; diagnosis: string | null; follow_up_date: string | null; prescription: { prescription_code: string; status: string; expires_at: string; lines: RxLine[] } | null; orders: VisitOrder[] };
export type MyInvoiceItem = { invoice_item_id: string; item_type: string; item_type_ar: string; service_name: string; net_price: number; refunded_amount: number; status: string; status_ar: string; payable: boolean };
export type MyInvoice = { invoice_id: string; invoice_number: string; branch_name: string; status: string; status_ar: string; net_amount: number; paid_amount: number; due_amount: number; created_at: string; items: MyInvoiceItem[] };
export type PatientFile = {
  patient: { patient_id: string; full_name: string; file_number: string; relation: string; gender: string | null; birth_date: string | null; age: number | null; is_banned: boolean };
  branches: { branch_id: string; name: string }[];
  upcoming_appointments: PBooking[]; past_appointments: PBooking[]; visits: Visit[]; prescriptions: MyPrescription[]; orders: MyOrder[]; generated_at: string;
};
