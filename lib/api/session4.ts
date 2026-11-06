/** الجلسة 4: الدعم، الملفات الخارجية، الصيدلية بالأسعار، العملات. */
import { staffApi } from "./staff";

export interface Paged<T> { items: T[]; page: number; page_size: number; total: number }

// ---------- الدعم ----------
export interface FaqItem { faq_id: string; category: string; category_ar: string; question_ar: string; answer_ar: string; sort: number; is_active: boolean }
export interface SupportRequest {
  support_request_id: string; type: string; type_ar: string; description: string; status: "open" | "replied"; status_ar: string;
  patient_id: string | null; patient_name: string | null; booking_id: string | null; booking_label: string | null; reply: string | null;
  replied_by_name: string | null; replied_at: string | null; created_at: string; phone_number: string | null;
}
export const FAQ_CATEGORIES: [string, string][] = [["booking", "الحجز"], ["cancel", "الإلغاء"], ["payment", "الدفع"], ["refund", "الاسترجاع"], ["hours", "أوقات الدوام"], ["app", "التطبيق"], ["other", "أخرى"]];
export const supportApi = {
  faq: () => staffApi.get<{ items: FaqItem[] }>("/faq-items"),
  createFaq: (b: Partial<FaqItem>) => staffApi.post<FaqItem>("/faq-items", b),
  updateFaq: (id: string, b: Partial<FaqItem>) => staffApi.patch<FaqItem>(`/faq-items/${id}`, b),
  deleteFaq: (id: string) => staffApi.del(`/faq-items/${id}`),
  requests: (q: { status?: string; type?: string; page?: number; page_size?: number } = {}) => staffApi.get<Paged<SupportRequest>>("/support-requests", q),
  reply: (id: string, reply: string) => staffApi.post<SupportRequest>(`/support-requests/${id}/reply`, { reply }),
};

// ---------- ملفات المراجع (النتائج الخارجية وصور الوصفات) ----------
export interface PatientFile { file_id: string; purpose: string; file_name: string; content_type: string; size_bytes: number; ticket_id: string | null; patient_id: string | null; uploaded_by_name: string | null; created_at: string; download_url: string }
export const patientFilesApi = {
  list: (q: { ticket_id?: string; patient_id?: string; purpose?: string }) => staffApi.get<{ items: PatientFile[] }>("/files", q),
};

// ---------- الصيدلية بالأسعار ----------
export interface PharmacyBillLine { dispense_line_id: string; line_no: number | null; drug_name: string; quantity: number; unit_price: number; amount: number; status: string; status_ar: string; invoice_item_id: string | null; payment_status: string | null }
export interface PharmacyBill { invoice_id: string | null; invoice_number: string | null; patient_id: string; patient_name: string; file_number: string | null; total_due: number; all_paid: boolean; lines: PharmacyBillLine[] }
export interface BillLineInput { line_no: number; available: boolean; wanted?: boolean; quantity?: number; service_id?: string | null; unit_price?: number | null; reason?: string | null }
export interface DispenseLogItem {
  dispense_line_id: string; at: string; patient_id: string; patient_name: string; file_number: string | null; drug_name: string; quantity: number; unit_price: number;
  amount: number; doctor_name: string; is_external: boolean; user_name: string | null; status: string; status_ar: string; prescription_code: string | null;
  prescription_status: string | null; prescription_status_ar: string | null; reason: string | null;
}
export interface DispenseLog {
  from: string; to: string; items: DispenseLogItem[];
  summary: { prescriptions_count: number; external_sales_count: number; complete_count: number; partial_count: number; not_available_count: number; total_amount: number; per_drug: { drug_name: string; quantity: number; amount: number }[] };
}
export interface DrugService { service_id: string; name: string; type: string; price: number; currency: string; requires_prescription: boolean; is_active: boolean }
export const pharmacyBillingApi = {
  drugs: () => staffApi.get<DrugService[] | { items: DrugService[] }>("/services", { type: "pharmacy" }).then((r) => (Array.isArray(r) ? r : r.items)),
  bill: (id: string, lines: BillLineInput[]) => staffApi.post<PharmacyBill>(`/pharmacy/prescriptions/${id}/bill`, { lines }),
  getBill: (id: string) => staffApi.get<PharmacyBill>(`/pharmacy/prescriptions/${id}/bill`),
  externalSale: (b: { patient_id?: string | null; new_patient?: { full_name: string; phone_number: string } | null; items: { service_id: string; quantity: number }[]; referring_doctor_name?: string | null; prescription_file_id?: string | null; note?: string | null }) =>
    staffApi.post<PharmacyBill>("/pharmacy/external-sales", b),
  deliver: (invoiceId: string) => staffApi.post<PharmacyBill>(`/pharmacy/external-sales/${invoiceId}/deliver`),
  log: (q: { from?: string; to?: string; drug?: string; doctor_id?: string; user_id?: string; status?: string; external?: boolean }) => staffApi.get<DispenseLog>("/pharmacy/dispense-log", q),
  csv: (q: { from?: string; to?: string; drug?: string; status?: string }) => staffApi.get<Blob>("/pharmacy/dispense-log", { ...q, format: "csv" }, { as: "blob" }),
};

// ---------- العملات ----------
export interface ExchangeRate { branch_id: string; date: string; usd_to_iqd: number; set_by_name: string | null; set_at: string }
export const currencyApi = {
  get: () => staffApi.get<{ date: string; today: ExchangeRate | null; history: ExchangeRate[] }>("/exchange-rates"),
  set: (usd_to_iqd: number, date?: string) => staffApi.put<ExchangeRate>("/exchange-rates", { usd_to_iqd, date }),
};
