/** أسماء عربية لرموز السيرفر. أي رمز جديد غير موجود هنا يُعرض بصيغة مقروءة بدل أن يكسر الشاشة. */

export const MODALITY_AR: Record<string, string> = { xray: "أشعة سينية", ultrasound: "سونار", ct: "مفراس", mri: "رنين مغناطيسي", mammography: "ماموغرام", fluoroscopy: "تنظير شعاعي", dexa: "كثافة عظام" };
export const modalityAr = (m: string | null | undefined) => (m ? MODALITY_AR[m.toLowerCase()] ?? m : "");

const AUDIT_ACTIONS: Record<string, string> = {
  LOGIN: "تسجيل دخول", LOGOUT: "تسجيل خروج", ACCOUNT_LOCKED: "قفل حساب", PASSWORD_CHANGED: "تغيير كلمة المرور", REFRESH_TOKEN_REUSE: "إعادة استخدام توكن", PATIENT_REFRESH_TOKEN_REUSE: "إعادة استخدام توكن مريض", BRANCH_SWITCHED: "تبديل الفرع",
  USER_CREATED: "إضافة مستخدم", USER_DISABLED: "تعطيل مستخدم", USER_ENABLED: "تفعيل مستخدم", USER_UPDATED: "تعديل مستخدم", USER_PASSWORD_RESET: "إعادة تعيين كلمة المرور",
  ROLE_CREATED: "إضافة دور", ROLE_UPDATED: "تعديل دور", ROLE_DELETED: "حذف دور", ROLE_PERMISSIONS_CHANGED: "تغيير صلاحيات دور",
  BRANCH_CREATED: "إضافة فرع", BRANCH_UPDATED: "تعديل فرع", BRANCH_CLOSED: "إغلاق فرع", BRANCH_REOPENED: "إعادة فتح فرع", BRANCH_DEACTIVATED: "إيقاف فرع",
  CLINIC_CREATED: "إضافة قسم", CLINIC_UPDATED: "تعديل قسم", CLINIC_CLOSED: "إغلاق قسم", CLINIC_REOPENED: "إعادة فتح قسم",
  DEVICE_CREATED: "إضافة جهاز", DISPLAY_KEY_ROTATED: "تجديد مفتاح شاشة", LOOKUP_CREATED: "إضافة قيمة قائمة", LOOKUP_UPDATED: "تعديل قيمة قائمة", SETTINGS_UPDATED: "تعديل الإعدادات", SERVICE_CREATED: "إضافة خدمة", SERVICE_UPDATED: "تعديل خدمة", PRICE_CHANGED: "تغيير سعر",
  COMMISSION_CHANGED: "تغيير نسبة طبيب", SCHEDULE_CHANGED: "تغيير جدول طبيب", DOCTOR_PHOTO_CHANGED: "تغيير صورة طبيب", DOCTOR_SETTINGS_CHANGED: "تغيير إعدادات طبيب", SESSION_CANCELLED: "إلغاء وجبة",
  PATIENT_UPDATED: "تعديل مريض", PATIENT_CREATED_BY_APP: "مريض من التطبيق", PATIENT_BANNED: "حظر مريض", PATIENT_UNBANNED: "فك حظر مريض", PATIENTS_MERGED: "دمج ملفين",
  BOOKING_CREATED: "حجز جديد", BOOKING_CANCELLED: "إلغاء حجز", CHECKED_IN: "تسجيل حضور", TICKET_EMERGENCY: "حالة طارئة", TICKET_LATE_REINSERTED: "إعادة متأخر للطابور", TICKET_NO_SHOW: "غياب", TICKET_SKIPPED: "تخطي مريض", FAST_FORWARD_OFFERED: "عرض تقديم موعد", FAST_FORWARD_ACCEPTED: "قبول تقديم موعد", EARLY_INVITE_ACCEPTED: "قبول دعوة مبكرة",
  PAY_PLAN_CHANGED: "تعديل نظام أجر", PAYOUT_RECORDED: "تسجيل صرف مستحقات",
  REFERRAL_ACTIVATED: "تفعيل تحويل", REFERRAL_EXTERNAL: "تحويل خارجي",
  INVOICE_CREATED: "إنشاء فاتورة", INVOICE_VOIDED: "إلغاء فاتورة", PAYMENT_COLLECTED: "تحصيل دفعة", ONLINE_PAYMENT_CREATED: "دفع إلكتروني", ONLINE_PAYMENT_PAID: "نجاح دفع إلكتروني", ONLINE_PAYMENT_FAILED: "فشل دفع إلكتروني", RECEIPT_REPRINTED: "نسخة إيصال مكررة", RECEIPT_BLOCK_ISSUED: "إصدار كتلة إيصالات", RECEIPT_BLOCK_RETURNED: "إرجاع كتلة إيصالات", DRAWER_OPENED_WITHOUT_RECEIPT: "فتح الدرج بلا إيصال",
  REFUND_CREATED: "طلب استرجاع", REFUND_REQUESTED: "طلب استرجاع", REFUND_APPROVED: "اعتماد استرجاع", REFUND_REJECTED: "رفض استرجاع", REFUND_COMPLETED: "إتمام استرجاع",
  SHIFT_OPENED: "فتح وردية", SHIFT_CLOSED: "إغلاق وردية", SHIFT_REVIEWED: "مراجعة وردية", SHIFT_LATE_PAYMENT: "دفعة بعد الإغلاق", DEFERRAL_GRANTED: "منح دفع آجل", DEFERRAL_WRITTEN_OFF: "إعفاء دين آجل", EXPENSE_RECORDED: "تسجيل مصروف", EXPENSE_VOIDED: "إلغاء مصروف",
  CONSULTATION_CREATED: "معاينة جديدة", CONSULTATION_UPDATED: "تعديل معاينة", CONSULTATION_ADDENDUM: "ملحق معاينة", ORDERS_ADDED: "طلبات للمريض", DIRECT_ORDERS_CREATED: "طلب مباشر", ORDER_CANCELLED: "إلغاء طلب", PRESCRIPTION_DISPENSED: "صرف وصفة",
  SAMPLE_COLLECTED: "سحب عينة", LAB_RESULT_SAVED: "حفظ نتيجة", LAB_RESULT_RELEASED: "اعتماد نتيجة", LAB_RESULT_AMENDED: "تعديل نتيجة معتمدة", LAB_TEMPLATE_UPDATED: "تعديل قالب تحليل",
  RADIOLOGY_SCHEDULED: "جدولة أشعة", RADIOLOGY_PERFORMED: "تنفيذ أشعة", RADIOLOGY_REPORT_SAVED: "حفظ تقرير أشعة", RADIOLOGY_REPORT_RELEASED: "اعتماد تقرير أشعة", RADIOLOGY_REPORT_AMENDED: "تعديل تقرير معتمد",
  BACKUP_REQUESTED: "طلب نسخة احتياطية",
};
const ENTITIES: Record<string, string> = {
  backup_run: "نسخة احتياطية", booking: "حجز", branch: "فرع", clinic: "قسم", consultation: "معاينة", deferral: "دفع آجل", device: "جهاز", doctor: "طبيب", doctor_session: "وجبة طبيب", expense: "مصروف",
  referral: "تحويل", pay_plan: "نظام أجر", payout: "صرف مستحقات",
  invoice: "فاتورة", invoice_item: "بند فاتورة", lookup: "قائمة اختيار", medical_order: "طلب طبي", online_payment: "دفع إلكتروني", patient: "مريض", patient_account: "حساب مريض", payment: "دفعة", prescription: "وصفة",
  queue_ticket: "تذكرة طابور", receipt: "إيصال", refund: "استرجاع", role: "دور", service: "خدمة", shift: "وردية", user: "مستخدم", settings: "إعدادات",
};
/** رمز غير معروف: يُعرض بلا شرطات سفلية ويبقى الرمز الأصلي في title. */
const readable = (c: string) => c.replace(/_/g, " ").toLowerCase();
export const auditActionAr = (a: string) => AUDIT_ACTIONS[a] ?? readable(a);
export const entityAr = (e: string | null | undefined) => (e ? ENTITIES[e] ?? readable(e) : "");
export const AUDIT_ACTION_OPTIONS = Object.entries(AUDIT_ACTIONS).map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label, "ar"));

/** تمييز العدد العربي للمعدود: 1 دفعة، 2 دفعتان، 3 دفعات، 11 دفعة. */
export function countAr(n: number, one: string, two: string, few: string, many = one) {
  const m = Math.abs(n) % 100;
  return n === 1 ? one : n === 2 ? two : m >= 3 && m <= 10 ? few : many;
}
export const paymentsAr = (n: number) => `${n} ${countAr(n, "دفعة", "دفعتان", "دفعات")}`;
