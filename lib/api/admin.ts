/** الإدارة — العقد الأقسام 2 (المستخدمون) و3 (الفروع، العيادات، الإغلاق، الإعدادات، القوائم، الأطباء، الأجهزة) و4 (الدمج) و12 (قالب التحليل) و19 (التدقيق) و21 (النسخ) والرسائل التجريبية. */
import { staffApi } from "./staff";
import type { Branch, NavSection, Paged, RoleCode, WeekdayCode } from "./types";
import type { Clinic, Department, Service, ServiceType } from "./billing";

// ---------- المستخدمون (2) ----------
export interface DoctorProfile { doctor_id?: string; specialty: string; job_title?: string | null; clinic_id: string; default_slot_minutes: number }
export interface User {
  user_id: string; username: string; full_name: string; phone_number: string | null; role: RoleCode; is_active: boolean; must_change_password: boolean;
  branch_ids: string[]; clinic_ids: string[]; extra_permissions: string[]; permissions: string[]; doctor_profile: DoctorProfile | null; last_login_at: string | null; created_at: string;
  role_name_ar?: string;
}
/** الدور (العقد 2.1). permissions = المخزن للدور، effective_permissions = بعد توسيع الرموز الشاملة. */
export interface Role {
  code: RoleCode; role: RoleCode; name_ar: string; description: string | null;
  is_system: boolean; is_active: boolean; is_locked: boolean;
  home_section: NavSection | null; sections: NavSection[];
  permissions: string[]; effective_permissions: string[];
  user_count: number; active_user_count: number; assignable: boolean;
  created_at: string; updated_at: string;
}
export interface RoleInput { code?: string; name_ar?: string; description?: string | null; home_section?: NavSection | "" | null; permissions?: string[]; is_active?: boolean }
export interface CatalogPermission { code: string; action: "view" | "create" | "edit" | "delete" | "all" | "special"; name_ar: string; description: string | null; implies: string[]; admin_only: boolean; legacy: boolean }
export interface PermissionCatalog {
  actions: { code: CatalogPermission["action"]; name_ar: string }[];
  sections: { code: string; name_ar: string; permissions: CatalogPermission[] }[];
  nav_sections: NavSection[];
}
export const rolesApi = {
  list: (includeInactive = false) => staffApi.get<{ items: Role[] }>("/roles", { include_inactive: includeInactive || undefined }),
  get: (code: string) => staffApi.get<Role>(`/roles/${encodeURIComponent(code)}`),
  create: (b: RoleInput) => staffApi.post<Role>("/roles", b),
  update: (code: string, b: RoleInput) => staffApi.patch<Role>(`/roles/${encodeURIComponent(code)}`, b),
  remove: (code: string) => staffApi.del(`/roles/${encodeURIComponent(code)}`),
  catalog: () => staffApi.get<PermissionCatalog>("/permissions/catalog"),
};
export interface UserInput {
  username?: string; full_name?: string; phone_number?: string | null; role?: RoleCode; branch_ids?: string[]; clinic_ids?: string[]; extra_permissions?: string[];
  doctor_profile?: { specialty: string; clinic_id: string; default_slot_minutes: number; job_title?: string | null } | null; temporary_password?: string;
}
export const usersApi = {
  list: (q: { branch_id?: string; role?: string; q?: string; is_active?: boolean; page?: number; page_size?: number }) => staffApi.get<Paged<User>>("/users", q),
  get: (id: string) => staffApi.get<User>(`/users/${id}`),
  create: (b: UserInput) => staffApi.post<User & { temporary_password?: string }>("/users", b),
  update: (id: string, b: UserInput) => staffApi.patch<User>(`/users/${id}`, b),
  disable: (id: string, cancelBookings: boolean) => staffApi.request<{ cancelled_sessions: number; cancelled_bookings: number; credited_bookings: number }>(`/users/${id}/disable`, { method: "POST", query: { cancel_bookings: cancelBookings } }),
  enable: (id: string) => staffApi.post<User>(`/users/${id}/enable`),
  resetPassword: (id: string) => staffApi.post<{ temporary_password: string }>(`/users/${id}/reset-password`),
  roles: () => rolesApi.list(),
};

// ---------- الفروع والعيادات والإغلاق (3) ----------
export interface Closure { closure_id: string; clinic_id?: string; branch_id?: string; reason: string; reason_ar: string; note: string | null; starts_on: string; ends_on: string | null; status: "scheduled" | "active" | "ended" | string; created_at: string; ended_at: string | null }
export interface BranchOverview {
  branch: Branch & { working_hours?: string | null };
  departments: { department: Department; department_ar: string; total: number; active: number; open_today: number }[];
  clinics: { clinic_id: string; name: string; department: Department; department_ar: string; floor: number | null; is_active: boolean; is_open_today: boolean; closure: Closure | null; active_services: number; doctors: { doctor_id: string; full_name: string; specialty: string; has_schedule_today: boolean }[] }[];
  staff: { role: string; role_ar: string; count: number }[];
  active_doctors: number;
  today: { date: string; sessions: number; open_sessions: number; booked: number; in_queue: number; completed: number; no_shows: number };
  setup_warnings: string[];
}
export interface ClosureResult { closure: Closure; cancelled_sessions: number; cancelled_bookings: number; credited_bookings: number }
/** يوم في جدول الدوام كما يُرسل (العقد 3.0): اليوم المغلق is_closed بلا shifts. */
export interface WorkingDayInput { weekday: WeekdayCode; is_closed?: boolean; shifts?: { open: string; close: string }[] }
export interface BranchInput {
  name: string; city: string; address: string; phone: string; working_hours: string; latitude: number | null; longitude: number | null;
  /** null = لا تغيير، [] = إلغاء الجدول المهيكل */
  working_hours_schedule: WorkingDayInput[] | null; is_active: boolean; cancel_bookings: boolean;
}
export const branchesApi = {
  list: () => staffApi.get<{ items: Branch[] }>("/branches"),
  /** المدير العام: مع الفروع الموقوفة */
  listAll: () => staffApi.get<{ items: Branch[] }>("/branches", { include_inactive: true }),
  get: (id: string) => staffApi.get<Branch>(`/branches/${id}`),
  overview: (id: string) => staffApi.get<BranchOverview>(`/branches/${id}/overview`),
  create: (b: { code: string } & Partial<BranchInput>) => staffApi.post<Branch>("/branches", b),
  update: (id: string, b: Partial<BranchInput>) => staffApi.patch<Branch>(`/branches/${id}`, b),
  closures: (id: string) => staffApi.get<{ items: Closure[] }>(`/branches/${id}/closures`),
  close: (id: string, b: { reason: string; note?: string; starts_on: string; ends_on?: string | null; cancel_bookings?: boolean }) => staffApi.post<ClosureResult>(`/branches/${id}/closures`, b),
  endClosure: (id: string, closureId: string) => staffApi.post<Closure>(`/branches/${id}/closures/${closureId}/end`),
  clinics: (id: string, includeInactive = false) => staffApi.get<{ items: Clinic[] }>(`/branches/${id}/clinics`, { include_inactive: includeInactive || undefined }),
  createClinic: (branchId: string, b: { name: string; department: Department; floor?: number | null }) => staffApi.post<Clinic>(`/branches/${branchId}/clinics`, b),
  updateClinic: (id: string, b: Partial<{ name: string; floor: number; is_active: boolean }>) => staffApi.patch<Clinic>(`/clinics/${id}`, b),
  clinicClosures: (id: string) => staffApi.get<{ items: Closure[] }>(`/clinics/${id}/closures`),
  closeClinic: (id: string, b: { reason: string; note?: string; starts_on: string; ends_on?: string | null; cancel_bookings?: boolean }) => staffApi.post<ClosureResult>(`/clinics/${id}/closures`, b),
  endClinicClosure: (id: string, closureId: string) => staffApi.post<Closure>(`/clinics/${id}/closures/${closureId}/end`),
};

// ---------- الإعدادات ----------
export interface Setting { key: string; label_ar: string; unit: string; value: number; source: "branch" | "global" | "default"; global_value: number; min: number; max: number; value_text?: string | null; global_value_text?: string | null; options?: { value: string; label_ar: string }[] | null }
export const settingsApi = {
  global: () => staffApi.get<{ items: Setting[] }>("/settings"),
  patchGlobal: (values: Record<string, number | string>) => staffApi.patch<{ items: Setting[] }>("/settings", { values }),
  branch: (id: string) => staffApi.get<{ items: Setting[] }>(`/branches/${id}/settings`),
  patchBranch: (id: string, values: Record<string, number | string | null>) => staffApi.patch<{ items: Setting[] }>(`/branches/${id}/settings`, { values }),
};

// ---------- قوائم الاختيار ----------
export interface Lookup { lookup_id: string; category: string; code: string; name_ar: string; sort_order: number; is_active: boolean; is_system: boolean }
export const lookupsApi = {
  categories: () => staffApi.get<{ items: { category: string; name_ar: string; active_count: number }[] }>("/lookups"),
  list: (cat: string, includeInactive = false) => staffApi.get<{ items: Lookup[] }>(`/lookups/${cat}`, { include_inactive: includeInactive || undefined }),
  create: (cat: string, b: { name_ar: string; code?: string; sort_order?: number }) => staffApi.post<Lookup>(`/lookups/${cat}`, b),
  update: (cat: string, id: string, b: Partial<{ name_ar: string; sort_order: number; is_active: boolean }>) => staffApi.patch<Lookup>(`/lookups/${cat}/${id}`, b),
};

// ---------- الأطباء (3) ----------
export interface Doctor { doctor_id: string; full_name: string; specialty: string; job_title: string | null; clinic_id: string; clinic_name: string; default_slot_minutes: number; photo_url: string | null }
export interface ScheduleSlot { session_template_id?: string | null; weekday: Weekday; start: string; end: string; slot_minutes: number; online_quota_percent: number; capacity?: number; online_quota?: number }
export type Weekday = "sun" | "mon" | "tue" | "wed" | "thu" | "fri" | "sat";
export interface Commission { new_visit_rate: number; follow_up_rate: number; effective_from: string; created_at: string }
/** إعدادات الطبيب (المرحلة 3): الفارغ = إعداد الفرع (branch_*). */
export interface DoctorSettings {
  allow_extra: boolean; late_grace_minutes: number | null; follow_up_days: number | null; follow_up_price: number | null; online_deposit_amount: number | null;
  branch_late_grace_minutes: number; branch_follow_up_days: number; branch_online_deposit_amount: number;
}
export const doctorsAdminApi = {
  settings: (id: string) => staffApi.get<DoctorSettings>(`/doctors/${id}/settings`),
  putSettings: (id: string, b: Pick<DoctorSettings, "allow_extra" | "late_grace_minutes" | "follow_up_days" | "follow_up_price" | "online_deposit_amount">) =>
    staffApi.put<DoctorSettings>(`/doctors/${id}/settings`, b),
  list: (q: { clinic_id?: string; specialty?: string } = {}) => staffApi.get<{ items: Doctor[] }>("/doctors", q),
  schedule: (id: string) => staffApi.get<{ doctor_id: string; weekly: ScheduleSlot[] }>(`/doctors/${id}/schedule`),
  putSchedule: (id: string, weekly: ScheduleSlot[]) => staffApi.put<{ doctor_id: string; weekly: ScheduleSlot[] }>(`/doctors/${id}/schedule`, { weekly }),
  commissions: (id: string) => staffApi.get<{ doctor_id: string; current: Commission | null; items: Commission[] }>(`/doctors/${id}/commissions`),
  addCommission: (id: string, b: { new_visit_rate: number; follow_up_rate: number; effective_from: string }) => staffApi.post<{ doctor_id: string; current: Commission | null; items: Commission[] }>(`/doctors/${id}/commissions`, b),
  cancelSession: (id: string, date: string, reason: string) => staffApi.post<{ cancelled_sessions: number; affected_bookings: number; notified: number }>(`/doctors/${id}/sessions/${date}/cancel`, { reason }),
  setPhoto: (id: string, fileId: string) => staffApi.put<Doctor>(`/doctors/${id}/photo`, { file_id: fileId }),
  deletePhoto: (id: string) => staffApi.del(`/doctors/${id}/photo`),
};

// ---------- الخدمات وقالب التحليل ----------
export interface LabParam { code: string; name: string; unit: string | null; ref_low: number | null; ref_high: number | null; critical_low: number | null; critical_high: number | null; sort_order: number }
export interface LabTemplate { service_id: string; service_name: string; result_type: "numeric" | "text" | string; parameters: LabParam[] }
export const servicesAdminApi = {
  list: (q: { type?: ServiceType; clinic_id?: string; q?: string; include_inactive?: boolean } = {}) => staffApi.get<{ items: Service[] }>("/services", q),
  create: (b: { name: string; type: ServiceType; visit_kind?: string | null; modality?: string | null; clinic_id?: string | null; price: number; is_commissionable: boolean }) => staffApi.post<Service>("/services", b),
  update: (id: string, b: Partial<{ name: string; clinic_id: string | null; price: number; is_commissionable: boolean; is_active: boolean; reason: string }>) => staffApi.patch<Service>(`/services/${id}`, b),
  template: (serviceId: string) => staffApi.get<LabTemplate>(`/lab/tests/${serviceId}/template`),
  putTemplate: (serviceId: string, b: { parameters: LabParam[] }) => staffApi.put<LabTemplate>(`/lab/tests/${serviceId}/template`, b),
};

// ---------- الأجهزة ----------
export type DeviceKind = "reception_pc" | "display" | "lab_pc" | "radiology_pc" | "pharmacy_pc";
export interface Device { device_id: string; device_code: string; kind: DeviceKind; name: string; clinic_id: string | null; is_active: boolean; created_at: string }
export const devicesApi = {
  list: () => staffApi.get<{ items: Device[] }>("/devices"),
  create: (b: { kind: DeviceKind; name: string; clinic_id?: string | null }) => staffApi.post<Device & { display_key: string | null }>("/devices", b),
  displayKey: (id: string) => staffApi.post<{ display_key: string }>(`/devices/${id}/display-key`),
};

// ---------- الدمج والتدقيق ----------
export interface AuditLog { before?: Record<string, unknown> | null; after?: Record<string, unknown> | null; device_id?: string | null; log_id: number; branch_id: string | null; branch_name: string | null; user_id: string | null; user_name: string | null; action: string; entity_type: string; entity_id: string | null; reason: string | null; ip: string | null; occurred_at: string; synced_offline: boolean }
export const mergeApi = {
  merge: (b: { primary_patient_id: string; duplicate_patient_id: string }) => staffApi.post<{ patient_id: string; moved_records: number }>("/patients/merge", b),
  audit: (q: { entity_type?: string; action?: string; page?: number; page_size?: number } = {}) => staffApi.get<Paged<AuditLog>>("/reports/audit-logs", q),
};

// ---------- النسخ الاحتياطي (21) ----------
export interface BackupRun { run_id: string; type: string; trigger: string; status: string; started_at: string | null; finished_at: string | null; duration_seconds: number | null; backup_label: string | null; size_bytes: number | null; stored_bytes: number | null; repos: string | null; error: string | null; created_at: string }
export interface BackupStatus {
  enabled: boolean; healthy: boolean; repo2_enabled: boolean; last_success: BackupRun | null; last_failure: BackupRun | null; last_verify: BackupRun | null; active: BackupRun | null;
  hours_since_last_success: number | null; max_hours_without_success: number;
  files: { mode: string; pending_files: number; oldest_pending_at: string | null; lag_hours: number | null; healthy: boolean };
  schedule: { timezone: string; full: string; incremental: string; wal: string; verify: string; retention: string }; notes: string[];
}
export const backupsApi = {
  status: () => staffApi.get<BackupStatus>("/admin/backups/status"),
  list: (q: { type?: string; status?: string; page?: number; page_size?: number } = {}) => staffApi.get<Paged<BackupRun>>("/admin/backups", q),
  run: (type: string) => staffApi.post<BackupRun>("/admin/backups/run", { type }),
};

// ---------- الرسائل التجريبية ----------
export interface SandboxMessage { channel: string; to: string; text: string; created_at: string; data?: Record<string, unknown> | null }
export const sandboxApi = { list: (q: { phone_number?: string; page?: number; page_size?: number } = {}) => staffApi.get<Paged<SandboxMessage>>("/sandbox/messages", q) };
