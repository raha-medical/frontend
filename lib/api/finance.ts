/** المحاسبة والتقارير — العقد الأقسام 14 (الآجل) و19 (التقارير) و20 (المصاريف). */
import { staffApi } from "./staff";

export interface Money { gross: number; refunds: number; revenue_net: number; cash_in: number; expenses: number; net_after_expenses: number; payments_count: number }
export interface Activity { bookings: number; checked_in: number; completed: number; no_shows: number }
export interface FinAlerts { open_shifts: number; shifts_pending_review: number; shifts_with_variance: number; variance_total: number; pending_refunds: number; pending_refunds_amount: number; deferrals_outstanding: number; overdue_deferrals: number }
export interface Dashboard {
  date: string; month_from: string;
  branches: { branch_id: string; branch_name: string; code: string; is_active: boolean; closed_today: boolean; today: Money; month_to_date: Money; activity: Activity; alerts: FinAlerts }[];
  totals: { today: Money; month_to_date: Money; activity: Activity; alerts: FinAlerts };
}
export interface Revenue {
  from: string; to: string; branch_id: string | null; by_department: { department: string; gross: number; refunds: number; net: number }[]; by_method: { method: string; amount: number; refunded: number; net: number }[];
  total_gross: number; total_refunds: number; total_net: number; deposits_received: number; credit_used: number; deferred_new: number; discounts: number; expenses: number; net_after_expenses: number; payments_count: number;
  by_branch: { branch_id: string; branch_name: string; gross: number; refunds: number; total_net: number; deposits_received: number; cash_in: number; expenses: number; net_after_expenses: number; payments_count: number }[];
}
export interface EarningGroup { count: number; gross: number; doctor_share: number }
export interface Earnings { from: string; to: string; items: { doctor_id: string; doctor_name: string; clinic_name: string | null; new_visits: EarningGroup; follow_ups: EarningGroup; other_services: EarningGroup; refund_adjustments: number; total_doctor_share: number; total_complex_share: number }[]; total_doctor_share: number; total_complex_share: number }
export interface NoShows { from: string; to: string; total_no_shows: number; distinct_patients: number; by_doctor: { doctor_id: string; doctor_name: string; clinic_name: string | null; count: number }[]; patients_banned: number; patients_unbanned: number; unbanned_by_deposit: number; unbanned_by_waiver: number; currently_banned: number }
export interface Settlements { from: string; to: string; total_outstanding_credit?: number; branches: { branch_id: string; branch_name: string; credit_received: number; credit_used: number; used_from_other_branches: number; used_by_other_branches: number; net_settlement: number; outstanding_credit_held: number }[]; flows: { holder_branch_id: string; holder_branch_name: string; serving_branch_id: string; serving_branch_name: string; amount: number; entries: number }[] }
export interface Deferral {
  deferral_id: string; patient_id: string; patient_name: string; phone_number: string | null; branch_id: string; branch_name: string; reason: string; note: string | null; amount: number; paid: number; remaining: number;
  due_date: string | null; is_overdue: boolean; status: "active" | "settled" | "written_off" | string; granted_by: string; created_at: string; settled_at: string | null; write_off_reason: string | null;
  items?: { invoice_item_id: string; service_name: string; department: string; price: number; status: string }[] | null;
}
export interface Expense {
  expense_id: string; expense_number: string; branch_id: string; branch_name: string; category: string; category_name: string; amount: number; expense_date: string; description: string; payee: string | null;
  paid_from: "drawer" | "branch_cash" | string; shift_id: string | null; status: "active" | "void" | string; created_by: string; created_at: string; void_reason: string | null; drawer_token?: string | null; open_drawer?: boolean;
}

type Range = { from?: string; to?: string; branch_id?: string };
export const reportsApi = {
  dashboard: (q: { date?: string; branch_id?: string } = {}) => staffApi.get<Dashboard>("/reports/dashboard", q),
  revenue: (q: Range & { date?: string }) => staffApi.get<Revenue>("/reports/daily-revenue", q),
  earnings: (q: Range & { doctor_id?: string }) => staffApi.get<Earnings>("/reports/doctor-earnings", q),
  noShows: (q: Range & { doctor_id?: string }) => staffApi.get<NoShows>("/reports/no-shows", q),
  settlements: (q: { from?: string; to?: string }) => staffApi.get<Settlements>("/reports/branch-settlements", q),
};
export const deferralsApi = {
  list: (q: { status?: string; patient_id?: string; branch_id?: string; overdue?: boolean; page?: number; page_size?: number } = {}) =>
    staffApi.get<{ items: Deferral[]; page: number; page_size: number; total: number; total_outstanding: number; overdue_count: number }>("/deferrals", q),
  get: (id: string) => staffApi.get<Deferral>(`/deferrals/${id}`),
  writeOff: (id: string, reason: string) => staffApi.post<Deferral>(`/deferrals/${id}/write-off`, { reason }),
  create: (b: { deferral_id: string; patient_id: string; invoice_item_ids: string[]; reason: string; note?: string; due_date?: string }) => staffApi.post<Deferral>("/deferrals", b, { idempotencyKey: b.deferral_id }),
};
export const expensesApi = {
  list: (q: { branch_id?: string; category?: string; paid_from?: string; from?: string; to?: string; status?: string; page?: number; page_size?: number } = {}) =>
    staffApi.get<{ items: Expense[]; page: number; page_size: number; total: number; total_amount: number; by_category: { category: string; category_name: string; amount: number; count: number }[] }>("/expenses", q),
  create: (b: { expense_id: string; branch_id?: string; category: string; amount: number; expense_date: string; description: string; payee?: string; paid_from: string }) => staffApi.post<Expense>("/expenses", b, { idempotencyKey: b.expense_id }),
  void: (id: string, reason: string) => staffApi.post<Expense>(`/expenses/${id}/void`, { reason }),
};

// ------------------------------------------------------------------ العقد 24: المستحقات والكشوفات
export interface PayPlan { plan_id: string; user_id: string; user_name: string; model: "percentage" | "fixed" | "per_case"; model_ar: string; percent: number | null; fixed_monthly: number | null; per_case_amount: number | null; effective_from: string }
export interface EntitlementRow { user_id: string; user_name: string; role: string; model: string; model_ar: string; cases: number; basis: number; earned: number; paid: number; balance: number }
export interface EntitlementStatement { branch_id: string; from: string; to: string; items: EntitlementRow[]; total_earned: number; total_paid: number; total_balance: number }
export interface Payout { payout_id: string; user_id: string; user_name: string; period_from: string; period_to: string; amount: number; method: string; note: string | null; created_by_name: string; created_at: string }
export interface StatementRow { period: string; gross: number; refunds: number; net: number; cash_in: number; expenses: number; payouts: number; net_after_costs: number; payments_count: number }
export interface FinancialStatement { from: string; to: string; group: string; branch_ids: string[]; rows: StatementRow[]; totals: StatementRow }
export interface PaymentRow { payment_id: string; branch_name: string; receipt_number: string | null; patient_name: string; file_number: string; amount: number; methods: string; cashier_name: string | null; created_at: string }
export interface BranchOverview { branch_id: string; code: string; name: string; latitude: number | null; longitude: number | null; live_status: string; live_status_ar: string; hours_today: string | null; patients_today: number; revenue_today: number; doctors_present: number; revenue_month: number; entitlements_month: number; staff_count: number; doctors_count: number; clinics_count: number; patients_month: number; attendance_rate: number | null; cancellation_rate: number | null; queue_now: number; revenue_today_usd: number; revenue_today_usd_iqd: number; online_bookings_today: number; refunds_today: number; refunds_today_amount: number; open_shifts: number; shifts_pending_review: number }
export interface BranchesOverview { date: string; items: BranchOverview[]; open: number; closed: number; open_after_hours: number; patients_today: number; revenue_today: number; doctors_present: number; queue_now: number; revenue_today_usd: number; revenue_today_usd_iqd: number; online_bookings_today: number; refunds_today: number; refunds_today_amount: number; open_shifts: number; shifts_pending_review: number }

type BranchRange = { branch_id?: string; from?: string; to?: string };
const withBranch = (path: string, branch?: string) => (branch ? `${path}?branch_id=${encodeURIComponent(branch)}` : path);
export const entitlementsApi = {
  statement: (q: BranchRange) => staffApi.get<EntitlementStatement>("/reports/entitlements", q),
  plans: (branch?: string) => staffApi.get<{ items: PayPlan[]; staff: { user_id: string; full_name: string; role: string }[] }>("/reports/pay-plans", { branch_id: branch }),
  savePlan: (b: { user_id: string; model: string; percent?: number; fixed_monthly?: number; per_case_amount?: number; effective_from: string }, branch?: string) => staffApi.post<PayPlan>(withBranch("/reports/pay-plans", branch), b, { idempotencyKey: false }),
  payouts: (q: BranchRange) => staffApi.get<{ items: Payout[] }>("/reports/payouts", q),
  recordPayout: (b: { user_id: string; period_from: string; period_to: string; amount: number; method: string; note?: string }, branch: string | undefined, id: string) => staffApi.post<Payout>(withBranch("/reports/payouts", branch), b, { idempotencyKey: id }),
  statement2: (q: BranchRange & { group: "day" | "month" }) => staffApi.get<FinancialStatement>("/reports/statement", q),
  payments: (q: BranchRange & { page_size?: number }) => staffApi.get<{ items: PaymentRow[]; total: number }>("/reports/payments", q),
  overview: () => staffApi.get<BranchesOverview>("/reports/branches-overview"),
};

// ------------------------------------------------------------------ لوحة الإحصائيات (GET /reports/stats)
export interface StatsDay { date: string; revenue: number; refunds: number; visits: number; bookings: number; cancelled: number; no_shows: number; new_patients: number; collected_iqd: number; collected_usd: number }
/** المقبوض بالعملتين منفصلتين: iqd بالدينار، usd بالدولار (المبلغ الأصلي)، usd_as_iqd مقابله بالدينار */
export interface StatsCurrency { iqd: number; usd: number; usd_as_iqd: number }
export interface StatsSlice { key: string; value: number }
export interface StatsBranch { branch_id: string; code: string; name: string; revenue: number; visits: number; patients: number; bookings: number; cancelled: number; no_shows: number }
export interface StatsDoctor { doctor_id: string; name: string; branch_name: string; visits: number }
export interface StatsTotals { revenue: number; refunds: number; visits: number; patients: number; new_patients: number; bookings: number; cancelled: number; no_shows: number; attendance_rate: number | null; cancellation_rate: number | null; avg_per_day: number }
export interface Stats { from: string; to: string; branch_id: string | null; totals: StatsTotals; previous_totals: StatsTotals; days: StatsDay[]; departments: StatsSlice[]; methods: StatsSlice[]; branches: StatsBranch[]; top_doctors: StatsDoctor[]; weekdays: StatsSlice[]; currency: StatsCurrency; previous_currency: StatsCurrency }
export const statsApi = { get: (q: BranchRange) => staffApi.get<Stats>("/reports/stats", q) };
