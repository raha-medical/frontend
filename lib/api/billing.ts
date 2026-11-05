/** الفوترة والتحصيل والإيصالات والورديات والحظر والطلب المباشر — العقد الأقسام 3 (الخدمات والعيادات) و4 (الحظر) و8 و9 و10 و11 (الطلب المباشر). */
import { staffApi } from "./staff";
import type { Paged } from "./types";

// ---------- الخدمات والعيادات (3) ----------
export type ServiceType = "consultation" | "lab" | "radiology" | "procedure";
export interface Service {
  service_id: string; name: string; type: ServiceType; visit_kind?: "new_visit" | "follow_up" | null; modality?: "xray" | "ultrasound" | "ct" | "mri" | null;
  clinic_id?: string | null; price: number; is_commissionable: boolean; is_active: boolean; updated_at?: string;
}
export type Department = "clinic" | "lab" | "radiology" | "pharmacy";
export interface Clinic {
  clinic_id: string; branch_id: string; name: string; department: Department; floor: number | null; is_active: boolean; is_open_today: boolean;
  closure: { reason_ar: string; ends_on: string | null; status: string } | null;
  /** مدة العودة المجانية بالنتائج لأطباء العيادة (فارغ = إعداد الفرع، التدقيق 1.2) */
  free_return_days?: number | null;
}

export const catalogApi = {
  services: (q: { type?: ServiceType; clinic_id?: string; q?: string } = {}) => staffApi.get<{ items: Service[] }>("/services", q),
  clinics: (branchId: string, q: { department?: Department } = {}) => staffApi.get<{ items: Clinic[] }>(`/branches/${branchId}/clinics`, q),
};

// ---------- السلة والتحصيل (8، 9) ----------
export type ItemStatus = "unpaid" | "paid" | "deferred" | "partially_refunded" | "refunded" | "void";
export interface BillableItem {
  invoice_item_id: string; invoice_id: string; invoice_number: string; service_name: string; item_type: string; department: Department;
  ordered_by: string | null; ordered_at: string; quantity: number; price: number; status: ItemStatus; is_current_department: boolean;
}
export interface Basket { patient_id: string; deposit_credit: number; items: BillableItem[]; total_due: number }

export interface Tender { method: "cash" | "pos"; amount: number; pos_terminal?: string | null; pos_reference?: string | null }
export interface ReceiptRef { receipt_id: string; receipt_number: string; type: "payment" | "deposit" | "refund"; issued_at: string; qr_code: string; print_payload_url: string }
export interface DrawerResult { receipt: ReceiptRef | null; drawer_token: string | null; open_drawer: boolean }
export interface PaymentResult extends DrawerResult { payment_id: string; shift_id: string; total_paid: number; deposit_used: number }

export interface PrintPayload {
  receipt_number: string; type: string; type_ar: string; branch_name: string; issued_at: string; cashier_name: string; patient_name: string; file_number: string;
  lines: { text: string; amount: number; doctor_name?: string | null; ticket_number?: string | null }[]; deposit_used?: number; tenders?: { method: string; amount: number }[]; total: number; qr_code: string; footer: string;
  is_copy: boolean; copy_number: number;
  /** نقطة التحصيل (عيادة الطبيب) والطبيب ورقم الدور إن كانت كل البنود لطبيب واحد */
  clinic_name?: string | null; doctor_name?: string | null; ticket_number?: string | null;
}
/** إيصالات الوردية لإعادة الطباعة (GET /receipts) */
export interface ShiftReceipt {
  receipt_id: string; receipt_number: string; type: string; type_ar: string; issued_at: string; total: number; status: string;
  patient_name: string | null; file_number: string | null; doctor_name: string | null; ticket_number: string | null; reprint_count: number; can_reprint: boolean; print_payload_url: string;
}

export interface InvoiceItem {
  invoice_item_id: string; service_id: string; service_name: string; item_type: string; department: Department; doctor_id: string | null; doctor_name: string | null;
  ticket_id: string | null; quantity: number; unit_price: number; price: number; discount: number; net_price: number; commission_rate: number; doctor_share: number;
  complex_share: number; refunded_amount: number; status: ItemStatus; performed_at: string | null;
}
export interface Invoice {
  invoice_id: string; invoice_number: string; branch_id: string; patient_id: string; patient_name: string; file_number: string;
  status: "unpaid" | "partially_paid" | "paid" | "deferred" | "void";
  gross_amount: number; discount_amount: number; net_amount: number; paid_amount: number; refunded_amount: number; discount_reason: string | null; void_reason: string | null; created_at: string;
  items: InvoiceItem[];
  payments: { payment_id: string; receipt_id: string; receipt_number: string; amount: number; created_at: string; cashier_name: string }[];
  refunds: { refund_id: string; invoice_item_id: string; amount: number; method: string; status: string; reason: string; created_at: string }[];
}
export interface InvoiceListItem { invoice_id: string; invoice_number: string; patient_id: string; patient_name: string; file_number: string; status: Invoice["status"]; net_amount: number; paid_amount: number; items_count: number; created_at: string }

export type RefundMethod = "cash" | "pos" | "patient_credit" | "online_reversal";
export interface Refund extends DrawerResult {
  refund_id: string; status: "pending_approval" | "completed" | "rejected"; invoice_item_id: string; invoice_id: string; service_name: string; amount: number; method: RefundMethod;
  reason: string; requested_by: string; requested_by_name: string; created_at: string; decided_by: string | null; decided_at: string | null; reject_reason: string | null;
  doctor_share_adjustment: number; complex_share_adjustment: number; invoice_net_after: number; invoice_paid_after: number;
}

export const billingApi = {
  basket: (patientId: string, department?: Department) => staffApi.get<Basket>(`/patients/${patientId}/billable-items`, { department }),
  pay: (b: { payment_id: string; patient_id: string; invoice_item_ids: string[]; use_deposit_credit: number; tenders: Tender[] }, key?: string) =>
    staffApi.post<PaymentResult>("/payments", b, { idempotencyKey: key }),
  createInvoice: (b: { invoice_id: string; patient_id: string; items: { service_id: string; doctor_id?: string | null; quantity: number }[]; discount?: { type: "amount" | "percent"; value: number; reason: string } }, key?: string) =>
    staffApi.post<Invoice>("/invoices", b, { idempotencyKey: key }),
  invoices: (q: { patient_id?: string; status?: string; from?: string; to?: string; q?: string; page?: number; page_size?: number }) => staffApi.get<Paged<InvoiceListItem>>("/invoices", q),
  invoice: (id: string) => staffApi.get<Invoice>(`/invoices/${id}`),
  voidInvoice: (id: string, reason: string) => staffApi.post<Invoice>(`/invoices/${id}/void`, { reason }),
  refund: (itemId: string, b: { refund_id: string; amount: number; method: RefundMethod; reason: string }, key?: string) =>
    staffApi.post<Refund>(`/invoice-items/${itemId}/refunds`, b, { idempotencyKey: key }),
  refunds: (q: { status?: Refund["status"]; page?: number; page_size?: number } = {}) => staffApi.get<Paged<Refund>>("/refunds", q),
  approveRefund: (id: string) => staffApi.post<Refund>(`/refunds/${id}/approve`),
  rejectRefund: (id: string, reason: string) => staffApi.post<Refund>(`/refunds/${id}/reject`, { reason }),
  printPayload: (url: string) => staffApi.get<PrintPayload>(url.replace(/^\/api\/v1/, "")),
  shiftReceipts: (shiftId?: string) => staffApi.get<{ items: ShiftReceipt[] }>("/receipts", { shift_id: shiftId }),
  reprint: (receiptId: string) => staffApi.post<{ print_payload_url: string; copy_number: number }>(`/receipts/${receiptId}/reprint`),
};

// ---------- الحظر (4) ----------
export interface BanStatus { is_banned: boolean; reason: string | null; no_show_count: number; banned_at: string | null; unban_deposit_amount: number }
export const banApi = {
  status: (patientId: string) => staffApi.get<BanStatus>(`/patients/${patientId}/ban-status`),
  unban: (patientId: string, b: { method: "cash" | "pos" | "waived"; amount: number; pos_reference?: string | null; note?: string }, key?: string) =>
    staffApi.post<DrawerResult & { is_banned: boolean; deposit_credit: number }>(`/patients/${patientId}/unban`, b, { idempotencyKey: key }),
};

// ---------- الطلب المباشر (11) ----------
export interface DirectOrderItem { order_item_id: string; department: Department; service_name: string; invoice_item_id: string; price: number; status: string }
export const ordersApi = {
  create: (b: { patient_id: string; items: { service_id: string; note?: string }[]; referring_doctor_name: string }, key?: string) =>
    staffApi.post<{ items: DirectOrderItem[] }>("/medical-orders", b, { idempotencyKey: key }),
  cancel: (orderItemId: string, reason: string) => staffApi.post<{ order_item_id: string; status: string }>(`/medical-orders/${orderItemId}/cancel`, { reason }),
};

// ---------- الورديات (10) ----------
export interface Shift {
  shift_id: string; status: "open" | "closed_pending_review" | "reviewed"; opened_at: string; closed_at: string | null; opening_float: number; device_id: string | null;
  receipts_count: number; clinic_id: string | null; clinic_name: string | null; department: Department | null;
}
export interface Reconciliation {
  shift_id: string; user_id: string; cashier_name: string; status: Shift["status"]; clinic_id: string | null; clinic_name: string | null; department: Department | null;
  opened_at: string; closed_at: string | null; opening_float: number;
  lines: { method: string; expected: number; declared: number | null; variance: number | null }[];
  cash_breakdown: { opening_float: number; cash_received: number; cash_refunds: number; cash_expenses: number; expenses_count: number; expected_in_drawer: number };
  receipts_count: number; refunds_count: number; reprints_count: number; declared_pos_slips_count: number | null; pos_slips_count: number;
  cash_denominations: Record<string, number> | null; close_note: string | null; audit_status: "MATCHED" | "SHORTAGE" | "OVERAGE" | null; variance_total: number | null;
  review_decision: "accepted" | "escalated" | null; review_note: string | null; reviewed_at: string | null;
}
export interface ShiftListItem { shift_id: string; user_id: string; cashier_name: string; status: Shift["status"]; opened_at: string; closed_at: string | null; audit_status: Reconciliation["audit_status"]; variance_total: number | null; clinic_id: string | null; clinic_name: string | null; department: Department | null }

export const shiftsApi = {
  /** null = لا توجد وردية مفتوحة (404 NO_OPEN_SHIFT). */
  current: async () => {
    try { return await staffApi.get<Shift>("/shifts/current"); }
    catch (e) { if ((e as { status?: number }).status === 404) return null; throw e; }
  },
  open: (b: { shift_id: string; opening_float: number; device_id?: string | null; device_code?: string | null; clinic_id?: string | null }, key?: string) => staffApi.post<Shift>("/shifts/open", b, { idempotencyKey: key }),
  close: (id: string, b: { declared: { cash: number; pos_slips_count: number; pos_total: number }; cash_denominations?: Record<string, number>; note?: string }, key?: string) =>
    staffApi.post<Shift>(`/shifts/${id}/close`, b, { idempotencyKey: key }),
  reconciliation: (id: string) => staffApi.get<Reconciliation>(`/shifts/${id}/reconciliation`),
  review: (id: string, b: { decision: "accepted" | "escalated"; note?: string }) => staffApi.post<Reconciliation>(`/shifts/${id}/review`, b),
  list: (q: { status?: Shift["status"]; cashier_id?: string; clinic_id?: string; from?: string; to?: string; page?: number; page_size?: number } = {}) => staffApi.get<Paged<ShiftListItem>>("/shifts", q),
};

/** ألوان وأيقونات الأقسام (Reception.dc.html: السلة). */
export const DEPT: Record<Department, { label: string; icon: string; cls: string }> = {
  clinic: { label: "العيادة", icon: "stethoscope", cls: "bg-primary-soft text-primary-strong" },
  lab: { label: "المختبر", icon: "flask-conical", cls: "bg-lab-soft text-lab" },
  radiology: { label: "الأشعة", icon: "scan-line", cls: "bg-info-soft text-info" },
  pharmacy: { label: "الصيدلية", icon: "pill", cls: "bg-pharm-soft text-pharm" },
};
