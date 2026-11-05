import type { NavSection, RoleCode, StaffRole, StaffUser } from "./api/types";

/* ==========================================================================
   التوجيه بالصلاحيات (المرحلة 2، العقد 1 و2.1):
   - الأقسام المسموحة = user.sections من /auth/me، وقسم البداية = user.home_section.
   - إن غابت الحقول (جلسة محفوظة قديمة أو سيرفر أقدم) نرجع لجدول SECTION_ROLES الثابت للأدوار الثمانية.
   - داخل القسم تُخفى الشاشات التي لا يملك المستخدم صلاحيتها (NavItem.perm / roles).
   - السيرفر هو الحكم النهائي (403) على أي حال.
   ========================================================================== */

export interface RoleMeta {
  label: string;
  icon: string; // اسم أيقونة Lucide (انظر components/icon.tsx)
  home: string;
  /** لون القائمة الجانبية: طبي أو مالي/إداري (README التصميم) */
  nav: "medical" | "finance";
}

export const ROLES: Record<StaffRole, RoleMeta> = {
  admin: { label: "المدير العام", icon: "shield-check", home: "/staff/admin/map", nav: "finance" },
  branch_manager: { label: "مدير فرع", icon: "building-2", home: "/staff/admin/branches", nav: "finance" },
  doctor: { label: "طبيب", icon: "stethoscope", home: "/staff/doctor/queue", nav: "medical" },
  receptionist: { label: "موظف استقبال", icon: "concierge-bell", home: "/staff/reception/queue", nav: "medical" },
  accountant: { label: "محاسب", icon: "calculator", home: "/staff/accountant/dash", nav: "finance" },
  lab_tech: { label: "فني مختبر", icon: "microscope", home: "/staff/lab", nav: "medical" },
  radiologist: { label: "أخصائي أشعة", icon: "scan-line", home: "/staff/radiology", nav: "medical" },
  pharmacist: { label: "صيدلي", icon: "pill", home: "/staff/pharmacy/work", nav: "medical" },
};

export const isSystemRole = (r: RoleCode): r is StaffRole => Object.prototype.hasOwnProperty.call(ROLES, r);

/** احتياط فقط: الأقسام لكل دور نظام إن لم يرسل السيرفر sections. */
export const SECTION_ROLES: Record<string, StaffRole[]> = {
  reception: ["receptionist", "admin", "branch_manager"],
  doctor: ["doctor"],
  diagnostics: ["lab_tech", "radiologist", "admin", "branch_manager"], // مسارات قديمة تُحوّل للقسمين
  lab: ["lab_tech", "admin", "branch_manager"],
  radiology: ["radiologist", "admin", "branch_manager"],
  pharmacy: ["pharmacist", "branch_manager"],
  accountant: ["accountant", "admin", "branch_manager"],
  admin: ["admin", "branch_manager"],
};

export const NAV_SECTIONS: NavSection[] = ["reception", "doctor", "lab", "radiology", "pharmacy", "accountant", "admin"];

export const SECTION_META: Record<NavSection, { label: string; icon: string; nav: "medical" | "finance" }> = {
  reception: { label: "الاستقبال", icon: "concierge-bell", nav: "medical" },
  doctor: { label: "الطبيب", icon: "stethoscope", nav: "medical" },
  lab: { label: "المختبر", icon: "microscope", nav: "medical" },
  radiology: { label: "الأشعة والسونار", icon: "scan-line", nav: "medical" },
  pharmacy: { label: "الصيدلية", icon: "pill", nav: "medical" },
  accountant: { label: "المحاسبة", icon: "calculator", nav: "finance" },
  admin: { label: "الإدارة", icon: "shield-check", nav: "finance" },
};

type UserLike = Pick<StaffUser, "role" | "permissions"> & Partial<Pick<StaffUser, "sections" | "home_section" | "role_name_ar">>;

/** هوية الدور للعرض (الاسم، الأيقونة، لون القائمة). الأدوار المخصصة تأخذ لون قسم بدايتها. */
export function roleMeta(user: UserLike): RoleMeta {
  const sys = isSystemRole(user.role) ? ROLES[user.role] : null;
  const home = user.home_section ?? null;
  return {
    label: user.role_name_ar || sys?.label || user.role,
    icon: sys?.icon ?? (home ? SECTION_META[home]?.icon : undefined) ?? "user-cog",
    home: homeFor(user),
    nav: sys?.nav ?? (home ? SECTION_META[home]?.nav : undefined) ?? "medical",
  };
}

/** الرموز الشاملة وما تتضمنه (العقد 2.1). السيرفر يرسل الصلاحيات موسعة، وهذا احتياط للجلسات القديمة. */
const IMPLIES: Record<string, string[]> = {
  "users.manage": ["users.view", "users.create", "users.edit", "users.delete"],
  "services.manage": ["services.view", "services.create", "services.edit", "services.delete", "devices.view", "devices.create", "devices.edit", "settings.edit"],
};

/** هل يملك المستخدم أياً من الصلاحيات؟ المدير العام يملك كل شيء. */
export function hasPerm(user: Pick<StaffUser, "role" | "permissions"> | null | undefined, codes: string | string[]): boolean {
  if (!user) return false;
  if (user.role === "admin") return true;
  const want = Array.isArray(codes) ? codes : [codes];
  const have = new Set(user.permissions);
  for (const p of user.permissions) for (const x of IMPLIES[p] ?? []) have.add(x);
  return want.some((c) => have.has(c));
}

/** أقسام الواجهة المسموحة للمستخدم. */
export function userSections(user: UserLike): string[] {
  if (Array.isArray(user.sections)) return user.sections;
  if (!isSystemRole(user.role)) return deriveSections(user.permissions);
  // احتياط مطابق لـ NavSections.Resolve: الأقسام الثابتة لدور النظام + ما تفتحه صلاحياته (8.6-ق5)
  const fixed = Object.entries(SECTION_ROLES).filter(([k, roles]) => k !== "diagnostics" && roles.includes(user.role as StaffRole)).map(([k]) => k);
  if (user.role === "admin") return fixed;
  const extra = deriveSections(user.permissions, true);
  return NAV_SECTIONS.filter((k) => fixed.includes(k) || extra.includes(k));
}

export function canOpenSection(user: UserLike, section: string): boolean {
  if (!SECTION_ROLES[section]) return true; // ليس قسماً محمياً
  const s = userSections(user);
  if (section === "diagnostics") return s.includes("lab") || s.includes("radiology");
  return s.includes(section);
}

export interface NavItem {
  href: string; label: string; icon: string; subtitle?: string; badge?: "sync";
  /** أدوار النظام فقط (سلوك مرتبط برمز الدور) */
  roles?: StaffRole[];
  /** يكفي أي واحدة من هذه الصلاحيات لإظهار الشاشة. نفس القاعدة للقائمة الجانبية والـ hub وحارس المسارات (canSeeItem).
   *  القيم مأخوذة من صلاحية الـ API الرئيسي للشاشة في العقد. */
  perm?: string[];
}

/** تبويبات كل قسم في القائمة الجانبية (مطابقة لـ screens في ملف التصميم). */
export const SECTION_NAV: Record<string, NavItem[]> = {
  reception: [
    { href: "/staff/reception/queue", label: "الطابور الحي", icon: "list-ordered", subtitle: "طابور أطباء عياداتك لليوم", perm: ["queue.manage"] },
    { href: "/staff/reception/today", label: "مراجعو اليوم", icon: "calendar-check", subtitle: "كل مواعيد اليوم بإجراءات سريعة وتحديث مباشر", perm: ["queue.manage"] },
    { href: "/staff/reception/checkin", label: "حضور وتسجيل", icon: "user-plus", subtitle: "تسجيل حضور مباشر", perm: ["queue.manage", "patients.write"] },
    { href: "/staff/reception/collect", label: "التحصيل", icon: "banknote", subtitle: "السلة الموحدة · ادفع حيث تُخدم", perm: ["payments.collect"] },
    { href: "/staff/reception/invoice", label: "طلب مباشر", icon: "file-plus-2", subtitle: "تحليل أو أشعة بورقة طبيب خارجي، أو فاتورة يدوية بخصم", perm: ["payments.collect", "patients.write"] },
    { href: "/staff/reception/refunds", label: "الاسترجاعات", icon: "undo-2", subtitle: "استرجاع كلي أو جزئي لبند مدفوع", perm: ["payments.collect", "refunds.approve"] },
    { href: "/staff/reception/unban", label: "فك الحظر", icon: "shield-check", subtitle: "عربون نقدي أو POS، أو إعفاء بصلاحية المدير", perm: ["patients.unban"] },
    { href: "/staff/reception/shift", label: "الحساب اليومي", icon: "clock", subtitle: "فتح الحساب اليومي (الوردية) وإغلاقه الأعمى", perm: ["payments.collect"] },
    { href: "/staff/reception/sync", label: "المزامنة", icon: "refresh-cw", subtitle: "الصادر أوفلاين والعمليات التي تحتاج مراجعة", badge: "sync", perm: ["queue.manage", "payments.collect", "patients.write"] },
  ],
  doctor: [
    { href: "/staff/doctor/queue", label: "طابوري", icon: "list-ordered", subtitle: "مرضى وجبتك اليوم", perm: ["clinical.write"] },
    { href: "/staff/doctor/consult", label: "المعاينة", icon: "clipboard-plus", subtitle: "التشخيص والوصفة والطلبات", perm: ["clinical.write"] },
    { href: "/staff/doctor/history", label: "سجل المريض", icon: "history", subtitle: "الزيارات والوصفات والنتائج", perm: ["clinical.write"] },
      ],
  // المختبر والأشعة قسمان منفصلان: لكل واحد سير عمله وموظفوه
  lab: [
    { href: "/staff/lab", label: "قائمة العمل", icon: "flask-conical", subtitle: "المراجعون الحاضرون، والتحويلات الواردة، والمكتملة", perm: ["lab.write", "lab.view"] },
  ],
  radiology: [
    { href: "/staff/radiology", label: "قائمة العمل", icon: "scan-line", subtitle: "المراجعون الحاضرون، والتحويلات الواردة، والمكتملة", perm: ["radiology.write", "radiology.view"] },
    { href: "/staff/radiology/schedule", label: "مواعيد اليوم", icon: "calendar-clock", subtitle: "المجدول حسب الغرفة والوقت", perm: ["radiology.write", "radiology.view"] },
  ],
  pharmacy: [
    { href: "/staff/pharmacy/work", label: "قائمة العمل", icon: "list-todo", subtitle: "الحاضرون، والتحويلات الواردة، والمكتملة", perm: ["pharmacy.dispense", "pharmacy.view"] },
    { href: "/staff/pharmacy/scan", label: "صرف وصفة", icon: "scan-qr-code", subtitle: "امسح كود الوصفة أو اكتبه", perm: ["pharmacy.dispense"] },
    { href: "/staff/pharmacy/today", label: "المصروف اليوم", icon: "history", subtitle: "سجل الصرف اليوم", perm: ["pharmacy.dispense", "pharmacy.view"] },
  ],
  accountant: [
    { href: "/staff/accountant/dash", label: "لوحة الفروع", icon: "layout-dashboard", subtitle: "اليوم ومنذ بداية الشهر · كل الفروع", perm: ["reports.finance"] },
    { href: "/staff/accountant/shifts", label: "تدقيق الحسابات اليومية", icon: "scale", subtitle: "بانتظار المراجعة من كل نقاط التحصيل", perm: ["shifts.review"] },
    { href: "/staff/accountant/refunds", label: "اعتماد الاسترجاع", icon: "undo-2", subtitle: "طلبات فوق حد صلاحية الاستقبال", perm: ["refunds.approve"] },
    { href: "/staff/accountant/deferrals", label: "الذمم الآجلة", icon: "hand-coins", subtitle: "الدفع الآجل بصلاحية الطبيب أو المدير", perm: ["reports.finance"] },
    { href: "/staff/accountant/revenue", label: "الإيراد اليومي", icon: "chart-column", subtitle: "حسب القسم وطريقة الدفع", perm: ["reports.finance"] },
    { href: "/staff/accountant/earnings", label: "أرباح الأطباء", icon: "percent", subtitle: "حصة الطبيب والمجمع", perm: ["reports.finance"] },
    { href: "/staff/accountant/entitlements", label: "المستحقات والصرف", icon: "wallet", subtitle: "أجور الأطباء والكوادر وتسجيل الصرف", perm: ["reports.finance"] },
    { href: "/staff/accountant/payments", label: "المدفوعات", icon: "banknote", subtitle: "كل دفعة بإيصالها وطريقتها", perm: ["reports.finance"] },
    { href: "/staff/accountant/statement", label: "الكشوفات", icon: "file-text", subtitle: "الكشف اليومي والشهري", perm: ["reports.finance"] },
    { href: "/staff/accountant/invoices", label: "الفواتير", icon: "file-text", subtitle: "بحث، تفاصيل، وإلغاء غير المدفوعة", perm: ["reports.finance", "refunds.approve", "payments.collect"] },
    { href: "/staff/accountant/expenses", label: "المصاريف", icon: "receipt-text", subtitle: "من درج الوردية أو صندوق الفرع", perm: ["expenses.manage"] },
    { href: "/staff/accountant/settle", label: "تسويات الفروع", icon: "arrow-left-right", subtitle: "أرصدة المرضى بين الفروع", perm: ["reports.finance"] },
    { href: "/staff/accountant/noshows", label: "الغياب والحظر", icon: "user-x", subtitle: "حسب الطبيب والفترة", perm: ["reports.finance"] },
    { href: "/staff/accountant/audit", label: "سجل التدقيق", icon: "scroll-text", subtitle: "كل العمليات الحساسة", perm: ["audit.read"] },
  ],
  admin: [
    { href: "/staff/admin/map", label: "خريطة الفروع", icon: "map", subtitle: "الحالة الحية لكل فرع ومؤشرات اليوم", perm: ["branches.map"] },
    { href: "/staff/admin/compare", label: "مقارنة الفروع", icon: "chart-column", subtitle: "الإيراد والمراجعون والحضور والإلغاء", perm: ["branches.map"] },
    { href: "/staff/admin/users", label: "المستخدمون", icon: "users", subtitle: "الموظفون وأدوارهم وفروعهم", perm: ["users.view"] },
    { href: "/staff/admin/roles", label: "الأدوار والصلاحيات", icon: "key-round", subtitle: "أدوار النظام والأدوار المخصصة ومصفوفة الصلاحيات", perm: ["roles.view"] },
    { href: "/staff/admin/branches", label: "الفروع", icon: "map-pinned", subtitle: "حالة كل فرع الحية، أوقات دوامه، موقعه، وما بداخله", perm: ["branches.view", "branches.edit", "services.manage"] },
    { href: "/staff/admin/units", label: "الأقسام والعيادات", icon: "building-2", subtitle: "عيادات الأطباء، المختبرات، الأشعة والسونار، الصيدليات", perm: ["services.manage", "services.view"] },
    { href: "/staff/admin/doctors", label: "الأطباء والجداول", icon: "stethoscope", subtitle: "الصور، الوجبات الأسبوعية، والنسب", perm: ["services.manage", "services.view"] },
    { href: "/staff/admin/services", label: "الخدمات والأسعار", icon: "tags", subtitle: "كشفيات، تحاليل، أشعة، إجراءات", perm: ["services.view", "services.manage"] },
    { href: "/staff/admin/merge", label: "دمج الملفات والتدقيق", icon: "git-merge", subtitle: "ملفات سُجلت أوفلاين وأونلاين بنفس الوقت", perm: ["patients.merge"] },
    { href: "/staff/admin/devices", label: "الأجهزة والشاشات", icon: "monitor-smartphone", subtitle: "أجهزة الاستقبال والأقسام وشاشات الانتظار", perm: ["devices.view", "services.manage"] },
    { href: "/staff/admin/lookups", label: "قوائم الاختيار", icon: "list", subtitle: "القوائم المنسدلة التي يديرها المدير", perm: ["lookups.manage"] },
    { href: "/staff/admin/settings", label: "الإعدادات", icon: "settings-2", subtitle: "قيم عامة لكل الفروع، ويمكن لكل فرع تخصيصها", perm: ["settings.edit", "services.manage"] },
    { href: "/staff/admin/backups", label: "النسخ الاحتياطي", icon: "database-backup", subtitle: "المدير العام فقط · حالة النسخ وسجل التشغيل", perm: ["backups.manage"] },
    { href: "/staff/admin/sandbox", label: "الرسائل التجريبية", icon: "message-square-dashed", subtitle: "ما كان سيُرسل SMS و Push في الوضع التجريبي", perm: ["sandbox.view"] },
  ],
};

export const canSeeItem = (user: Pick<StaffUser, "role" | "permissions">, n: NavItem) =>
  (!n.roles || (isSystemRole(user.role) && n.roles.includes(user.role))) && (!n.perm || hasPerm(user, n.perm));

/** شاشات القسم التي يراها المستخدم. */
export const visibleNav = (user: UserLike, section: string): NavItem[] => (SECTION_NAV[section] ?? []).filter((n) => canSeeItem(user, n));

const matches = (path: string, href: string) => path === href || path.startsWith(href + "/");

/** أول شاشة متاحة في القسم (الرئيسية لأدوار النظام كما كانت). */
export function sectionHome(user: UserLike, section: string): string {
  const items = visibleNav(user, section);
  if (isSystemRole(user.role)) {
    const h = ROLES[user.role].home;
    if (h.split("/")[2] === section && items.some((n) => n.href === h)) return h;
  }
  return items[0]?.href ?? `/staff/${section}`;
}

/** الصفحة الرئيسية للمستخدم: قسم البداية من السيرفر، أو احتياطاً الصفحة الثابتة لدور النظام. */
export function homeFor(user: UserLike): string {
  if (Array.isArray(user.sections) || user.home_section !== undefined) {
    const home = user.home_section && canOpenSection(user, user.home_section) ? user.home_section : userSections(user)[0];
    return home ? sectionHome(user, home) : "/staff/no-access";
  }
  return isSystemRole(user.role) ? ROLES[user.role].home : "/staff/no-access";
}

/** هل يُسمح بفتح المسار؟ القسم ضمن الأقسام، والشاشة (إن كانت في القائمة) ضمن صلاحياته. */
export function canOpenPath(user: UserLike, path: string): boolean {
  const section = path.split("/")[2] ?? "";
  if (!canOpenSection(user, section)) return false;
  const all = SECTION_NAV[section] ?? [];
  // أطول تطابق (حتى لا تُحسب /staff/radiology لمسار /staff/radiology/schedule)
  const hit = all.filter((n) => matches(path, n.href)).sort((a, b) => b.href.length - a.href.length)[0];
  return !hit || canSeeItem(user, hit);
}

/** وجهة ما بعد الدخول: الشاشة المطلوبة (?next=) إن كانت داخل /staff ومسموحة، وإلا الصفحة الرئيسية للمستخدم. */
export function landingFor(user: UserLike, next: string | null | undefined): string {
  if (!next || !/^\/staff\/[a-z-]+(\/[a-z0-9_-]*)*$/i.test(next)) return homeFor(user);
  const section = next.split("/")[2] ?? "";
  return SECTION_ROLES[section] && canOpenPath(user, next) ? next : homeFor(user);
}

/** الشاشة الحالية (أطول تطابق) بين كل شاشات الأقسام. */
export function findNavItem(path: string): NavItem | undefined {
  return Object.values(SECTION_NAV).flat().filter((n) => matches(path, n.href)).sort((a, b) => b.href.length - a.href.length)[0];
}

// ---------------------------------------------------------------- مجموعات القائمة الجانبية (المواصفة 8.6)
// عناوين وظيفية لا أسماء أدوار. كل شاشة معرّفة مرة واحدة في SECTION_NAV (مسارها وصلاحيتها)، ومكانها هنا مرة واحدة،
// فتظهر في المكان نفسه لأي مستخدم. الكتلة بلا عنوان تُعرض عناصرها مباشرة تحت المجموعة.
export interface NavBlock { key: string; title?: string; icon?: string; items: NavItem[] }
export interface NavGroup { key: string; label: string; icon: string; blocks: NavBlock[] }

const GROUPS: { key: string; label: string; icon: string; blocks: { key: string; title?: string; icon?: string; hrefs: string[] }[] }[] = [
  { key: "home", label: "الرئيسية", icon: "layout-dashboard", blocks: [{ key: "home", hrefs: ["/staff/admin/map"] }] },
  { key: "queue", label: "الطابور والمواعيد", icon: "list-ordered", blocks: [{ key: "queue", hrefs: [
    "/staff/reception/queue", "/staff/reception/today", "/staff/reception/checkin", "/staff/doctor/queue", "/staff/doctor/consult", "/staff/reception/sync",
  ] }] },
  { key: "patients", label: "المراجعون", icon: "users-round", blocks: [{ key: "patients", hrefs: [
    "/staff/doctor/history", "/staff/reception/unban", "/staff/admin/merge", "/staff/accountant/noshows",
  ] }] },
  { key: "finance", label: "المالية", icon: "calculator", blocks: [
    { key: "cash", hrefs: [
      "/staff/reception/collect", "/staff/reception/invoice", "/staff/reception/shift", "/staff/reception/refunds", "/staff/accountant/refunds",
      "/staff/accountant/shifts", "/staff/accountant/invoices", "/staff/accountant/payments", "/staff/accountant/expenses", "/staff/accountant/deferrals",
    ] },
    { key: "reports", title: "التقارير المالية", icon: "chart-column", hrefs: [
      "/staff/accountant/dash", "/staff/accountant/revenue", "/staff/accountant/earnings", "/staff/accountant/entitlements",
      "/staff/accountant/statement", "/staff/accountant/settle", "/staff/admin/compare", "/staff/accountant/audit",
    ] },
  ] },
  { key: "support", label: "الأقسام المساندة", icon: "hospital", blocks: [
    { key: "lab", title: "المختبر", icon: "microscope", hrefs: ["/staff/lab"] },
    { key: "radiology", title: "الأشعة والسونار", icon: "scan-line", hrefs: ["/staff/radiology", "/staff/radiology/schedule"] },
    { key: "pharmacy", title: "الصيدلية", icon: "pill", hrefs: ["/staff/pharmacy/work", "/staff/pharmacy/scan", "/staff/pharmacy/today"] },
  ] },
  { key: "clinics", label: "العيادات والأطباء", icon: "stethoscope", blocks: [{ key: "clinics", hrefs: [
    "/staff/admin/units", "/staff/admin/doctors", "/staff/admin/services",
  ] }] },
  // «الدعم»: لا توجد صفحات واجهة له بعد، فلا مجموعة.
  { key: "users", label: "المستخدمون والصلاحيات", icon: "key-round", blocks: [{ key: "users", hrefs: ["/staff/admin/users", "/staff/admin/roles"] }] },
  { key: "settings", label: "الإعدادات", icon: "settings-2", blocks: [{ key: "settings", hrefs: [
    "/staff/admin/branches", "/staff/admin/settings", "/staff/admin/devices", "/staff/admin/lookups", "/staff/admin/backups", "/staff/admin/sandbox",
  ] }] },
];

const NAV_BY_HREF = new Map(Object.entries(SECTION_NAV).flatMap(([section, items]) => items.map((n) => [n.href, { section, item: n }] as const)));

/** الشاشة تظهر إذا فُتح قسم مسارها (الأقسام مشتقة من الصلاحيات في السيرفر) وكان المستخدم يملك صلاحيتها. */
const canSeeNav = (user: UserLike, href: string): NavItem | null => {
  const hit = NAV_BY_HREF.get(href);
  return hit && canOpenSection(user, hit.section) && canSeeItem(user, hit.item) ? hit.item : null;
};

/** القائمة الجانبية كاملة من صلاحيات المستخدم (الكتل والمجموعات الفارغة تُحذف). */
export function buildNav(user: UserLike): NavGroup[] {
  return GROUPS.map((g) => ({
    key: g.key, label: g.label, icon: g.icon,
    blocks: g.blocks.map((b) => ({ key: b.key, title: b.title, icon: b.icon, items: b.hrefs.map((h) => canSeeNav(user, h)).filter((n): n is NavItem => n !== null) }))
      .filter((b) => b.items.length > 0),
  })).filter((g) => g.blocks.length > 0);
}

/** معاينة الأقسام التي تفتحها صلاحيات دور مخصص (نفس قواعد السيرفر في العقد 1). السيرفر يحسبها فعلياً بعد الحفظ. */
const SECTION_RULES: [NavSection, string[]][] = [
  ["reception", ["queue.manage", "payments.collect", "patients.write"]],
  ["doctor", ["clinical.write"]],
  ["lab", ["lab.write", "lab.view"]],
  ["radiology", ["radiology.write", "radiology.view"]],
  ["pharmacy", ["pharmacy.dispense", "pharmacy.view"]],
  ["accountant", ["shifts.review", "refunds.approve", "reports.finance", "audit.read", "expenses.manage"]],
  ["admin", ["users.view", "roles.view", "branches.view", "branches.edit", "services.view", "services.manage", "devices.view", "patients.merge"]],
];
/** systemRole: لأدوار النظام لا تفتح queue.manage وحدها قسم الاستقبال (الطبيب يملكها لإدارة طابوره). */
export function deriveSections(permissions: string[], systemRole = false): NavSection[] {
  const have = new Set(permissions);
  for (const p of permissions) for (const x of IMPLIES[p] ?? []) have.add(x);
  return SECTION_RULES.filter(([s, codes]) => codes.some((c) => have.has(c) && !(systemRole && s === "reception" && c === "queue.manage"))).map(([s]) => s);
}
