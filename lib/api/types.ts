/** أنواع مطابقة للعقد api_contracts_v5.md. snake_case كما يرسلها السيرفر. */
export type StaffRole = "admin" | "branch_manager" | "doctor" | "receptionist" | "accountant" | "lab_tech" | "radiologist" | "pharmacist";
/** رمز دور: أحد أدوار النظام الثمانية أو دور مخصص يضيفه المدير العام (العقد 2.1). */
export type RoleCode = StaffRole | (string & {});
/** أقسام الواجهة (/staff/{section}) كما يعيدها السيرفر في sections و home_section. */
export type NavSection = "reception" | "doctor" | "lab" | "radiology" | "pharmacy" | "accountant" | "admin";

export interface StaffUser {
  user_id: string;
  full_name: string;
  role: RoleCode;
  branch_id: string;
  branch_ids: string[];
  clinic_ids: string[];
  doctor_id: string | null;
  permissions: string[];
  must_change_password: boolean;
  /** المرحلة 2 (العقد 1): اسم الدور للعرض، ونوعه، وأقسام الواجهة المسموحة وقسم البداية (null = لا شاشات). */
  role_name_ar?: string;
  is_system_role?: boolean;
  home_section?: NavSection | null;
  sections?: NavSection[];
}

export interface LoginResponse {
  access_token: string;
  access_expires_in: number;
  refresh_token: string;
  refresh_expires_in: number;
  user: StaffUser;
}

export interface LoginRequest { username: string; password: string; branch_id?: string; device_id?: string }

export type BranchStatus = "open" | "closed" | "inactive";
export interface Branch {
  branch_id: string;
  /** للخريطة في تطبيق المريض والموقع (يُرسلان معاً) */
  latitude?: number | null;
  longitude?: number | null;
  working_hours?: string | null;
  code: string;
  name: string;
  /** الاسم بالإنجليزية (الترحيل 024) */
  name_en?: string | null;
  city?: string;
  address?: string;
  phone?: string;
  is_active: boolean;
  status: BranchStatus;
  status_ar: string;
  status_reason_ar?: string | null;
  closed_until?: string | null;
  // ---- المرحلة 2 (العقد 3.0) ----
  status_reason?: string | null;
  working_hours_schedule?: WorkingDay[] | null;
  working_hours_summary?: string | null;
  today_hours?: Shift[] | null;
  live_status?: LiveStatus;
  live_status_ar?: string;
  managers?: { user_id: string; full_name: string; phone_number: string | null }[] | null;
  department_counts?: { clinic: number; lab: number; radiology: number; pharmacy: number; total: number } | null;
  activity?: { open_shifts: number; patients_waiting: number; patients_in_room: number } | null;
  is_assigned?: boolean;
}

export type WeekdayCode = "sat" | "sun" | "mon" | "tue" | "wed" | "thu" | "fri";
export interface Shift { open: string; close: string }
export interface WorkingDay { weekday: WeekdayCode; weekday_ar?: string; is_closed: boolean; shifts: Shift[] }
export type LiveStatus = "open" | "closed" | "open_after_hours" | "temporarily_closed" | "inactive";

export interface Paged<T> { items: T[]; page: number; page_size: number; total: number }

// ---- تطبيق المريض ----
export interface PatientAccount { patient_account_id: string; phone_number: string }
export interface PatientRef {
  patient_id: string; full_name: string; file_number: string; relation: "self" | "child" | "spouse" | "parent" | "other";
  gender: "male" | "female"; birth_date: string | null; is_banned: boolean;
}
export interface PatientSessionUser { account: PatientAccount; patients: PatientRef[] }
