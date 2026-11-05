/** العيادة والمختبر والأشعة والصيدلية — العقد الأقسام 11 و12 و13 و15. */
import { staffApi } from "./staff";
import type { Paged } from "./types";

export interface PatientSummary { patient_id: string; full_name: string; file_number: string; gender: "male" | "female" | null; age: number | null }
export interface RxLine { line_no?: number; drug_name: string; dose: string | null; frequency: string | null; duration_days: number | null; instructions: string | null }
export type OrderStatus = "ordered" | "paid" | "deferred" | "sample_collected" | "in_progress" | "resulted" | "scheduled" | "performed" | "reported" | "released" | "cancelled";
export interface ConsultOrder { order_item_id: string; department: "lab" | "radiology"; service_id: string; service_name: string; note: string | null; status: OrderStatus; payment_status: string; invoice_item_id: string; price: number; has_critical: boolean; result_available: boolean }
export interface Consultation {
  consultation_id: string; ticket_id: string; ticket_number: string; patient: PatientSummary; doctor_id: string; doctor_name: string; clinic_name: string; visit_kind: string | null;
  diagnosis: string | null; icd10_code: string | null; clinical_notes: string | null; private_notes: string | null; follow_up_after_days: number | null; follow_up_date: string | null;
  prescription: { prescription_id: string; prescription_code: string; status: string; expires_at: string; lines: RxLine[] } | null;
  orders: ConsultOrder[]; addenda: { addendum_id: string; text: string; created_by: string; created_at: string }[]; editable_until: string; created_at: string; updated_at: string;
}
export interface ConsultInput {
  diagnosis?: string | null; icd10_code?: string | null; clinical_notes?: string | null; private_notes?: string | null; follow_up_after_days?: number | null;
  prescription?: RxLine[]; lab_orders?: { service_id: string; note?: string }[]; radiology_orders?: { service_id: string; note?: string }[]; finish_visit?: boolean; call_next?: boolean;
}
export interface HistoryItem {
  consultation_id: string; date: string; branch_name: string; doctor_name: string; clinic_name: string; visit_kind: string | null; diagnosis: string | null; icd10_code: string | null;
  clinical_notes: string | null; private_notes: string | null; prescription: { prescription_code: string; status: string; lines: RxLine[] } | null;
  orders: { order_item_id: string; department: string; service_name: string; status: OrderStatus; has_critical: boolean; result_available: boolean }[]; addenda_count: number;
}

export const clinicalApi = {
  start: (ticketId: string) => staffApi.post(`/queue/tickets/${ticketId}/start`),
  byTicket: async (ticketId: string) => (await staffApi.get<Paged<Consultation>>("/consultations", { ticket_id: ticketId })).items[0] ?? null,
  list: (q: { patient_id?: string; page?: number; page_size?: number } = {}) => staffApi.get<Paged<Consultation>>("/consultations", q),
  get: (id: string) => staffApi.get<Consultation>(`/consultations/${id}`),
  create: (b: ConsultInput & { consultation_id: string; ticket_id: string }) => staffApi.post<Consultation & { next_ticket?: unknown }>("/consultations", b, { idempotencyKey: b.consultation_id }),
  update: (id: string, b: ConsultInput) => staffApi.patch<Consultation & { next_ticket?: unknown }>(`/consultations/${id}`, b),
  addOrders: (id: string, b: { lab_orders: { service_id: string }[]; radiology_orders: { service_id: string }[] }) => staffApi.post<Consultation>(`/consultations/${id}/orders`, b),
  addendum: (id: string, text: string) => staffApi.post<Consultation>(`/consultations/${id}/addenda`, { text }),
  history: (patientId: string, page = 1) => staffApi.get<{ patient_id: string; items: HistoryItem[]; page: number; page_size: number; total: number }>(`/patients/${patientId}/history`, { page, page_size: 20 }),
};

// ---------- المختبر والأشعة ----------
export interface WorkItem {
  awaiting_payment?: boolean; activation_method?: string | null; referral_id?: string | null;
  order_item_id: string; patient_id: string; patient_name: string; file_number: string; gender: string | null; age: number | null; service_id: string; service_name: string;
  ordered_by: string | null; referring_doctor_name: string | null; status: OrderStatus; payment_status: string; sample_barcode: string | null; has_critical: boolean; ordered_at: string; note: string | null;
  modality: string | null; scheduled_at: string | null; room: string | null; performed_at: string | null;
}
export interface Attachment { file_id: string; file_name: string; content_type: string; url: string; expires_in: number }
export interface LabValue { code: string; name: string; unit: string | null; value: number; ref_low: number | null; ref_high: number | null; flag: "normal" | "low" | "high" | "critical_low" | "critical_high" | string }
export interface LabResult {
  order_item_id: string; service_name: string; status: OrderStatus; patient: PatientSummary; ordered_by: string | null; sample_barcode: string | null; sample_collected_at: string | null;
  values: LabValue[]; text_result: string | null; comment: string | null; attachments: Attachment[]; has_critical: boolean; released_at: string | null; released_by: string | null; amended: boolean;
}
export interface RadReport {
  order_item_id: string; service_name: string; modality: string | null; status: OrderStatus; patient: PatientSummary; ordered_by: string | null; scheduled_at: string | null; room: string | null;
  performed_at: string | null; findings: string | null; impression: string | null; attachments: Attachment[]; released_at: string | null; reported_by: string | null; amended: boolean;
}
type WQ = { status?: string; date?: string; q?: string; page?: number; page_size?: number };
export const labApi = {
  worklist: (q: WQ = {}) => staffApi.get<Paged<WorkItem>>("/lab/worklist", q),
  collect: (id: string, barcode?: string) => staffApi.post<{ order_item_id: string; status: string; sample_barcode: string }>(`/lab/orders/${id}/collect-sample`, barcode ? { sample_barcode: barcode } : {}),
  start: (id: string) => staffApi.post(`/lab/orders/${id}/start`),
  template: (serviceId: string) => staffApi.get<{ service_id: string; service_name: string; result_type: string; parameters: { code: string; name: string; unit: string | null; ref_low: number | null; ref_high: number | null; critical_low: number | null; critical_high: number | null }[] }>(`/lab/tests/${serviceId}/template`),
  result: (id: string) => staffApi.get<LabResult>(`/lab/orders/${id}/result`),
  putResult: (id: string, b: { values?: { code: string; value: number }[]; text_result?: string | null; comment?: string | null; attachments?: { file_id: string }[]; release: boolean; critical_flag?: boolean; amend_reason?: string }) =>
    staffApi.put<LabResult>(`/lab/orders/${id}/result`, b),
};
export const radApi = {
  worklist: (q: WQ & { modality?: string } = {}) => staffApi.get<Paged<WorkItem>>("/radiology/worklist", q),
  schedule: (id: string, b: { scheduled_at: string; room?: string }) => staffApi.post(`/radiology/orders/${id}/schedule`, b),
  performed: (id: string) => staffApi.post(`/radiology/orders/${id}/performed`),
  report: (id: string) => staffApi.get<RadReport>(`/radiology/orders/${id}/report`),
  putReport: (id: string, b: { findings: string; impression: string; attachments?: { file_id: string }[]; release: boolean; critical_flag?: boolean; amend_reason?: string }) => staffApi.put<RadReport>(`/radiology/orders/${id}/report`, b),
};

// ---------- الصيدلية ----------
export interface RxItem extends RxLine { line_no: number; dispensed: boolean | null; substitute_drug_name: string | null; not_dispensed_reason: string | null }
export interface Prescription {
  prescription_id: string; prescription_code: string; patient_name: string; file_number: string | null; gender: string | null; age: number | null; doctor_name: string; clinic_name: string;
  branch_name: string; diagnosis: string | null; issued_at: string; expires_at: string; status: "not_dispensed" | "dispensed" | "expired"; dispensed_at: string | null; dispensed_by: string | null; items: RxItem[];
}
export const pharmacyApi = {
  get: (code: string) => staffApi.get<Prescription>(`/pharmacy/prescriptions/${encodeURIComponent(code.trim().toUpperCase())}`),
  dispense: (id: string, lines: { line_no: number; dispensed: boolean; substitute_drug_name?: string | null; not_dispensed_reason?: string | null }[]) => staffApi.post<Prescription>(`/pharmacy/prescriptions/${id}/dispense`, { lines }),
  dispensed: (q: { date?: string; page?: number; page_size?: number } = {}) => staffApi.get<Paged<Prescription>>("/pharmacy/dispensed", q),
};

// ---------- الملفات (رفع مرفقات) ----------
export const filesApi = {
  /** العقد: POST /files/upload-url ثم PUT للرابط الموقع ثم يُرسل file_id. */
  upload: async (file: File, purpose: string, extra: { order_item_id?: string; doctor_id?: string } = {}) => {
    // المتصفحات لا تعطي ملفات DICOM نوعاً، والخادم يقبل application/dicom فقط
    const type = file.type || (/\.dcm$/i.test(file.name) ? "application/dicom" : "application/octet-stream");
    const r = await staffApi.post<{ file_id: string; upload_url: string; headers?: Record<string, string> }>("/files/upload-url", { file_name: file.name, content_type: type, size_bytes: file.size, purpose, ...extra });
    let put: Response;
    try { put = await fetch(r.upload_url, { method: "PUT", body: file, headers: { "Content-Type": type, ...(r.headers ?? {}) } }); }
    catch { throw new Error("تعذر الوصول إلى تخزين الملفات. تأكد أن خدمة التخزين تعمل."); }
    if (!put.ok) throw new Error("فشل رفع الملف");
    // العقد: الخادم يتحقق من وصول الملف وحجمه. بدون هذا يُرفض المرفق عند حفظ النتيجة
    await staffApi.post(`/files/${r.file_id}/complete`);
    return r.file_id;
  },
};
