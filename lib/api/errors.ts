/** صيغة Problem Details (العقد 0.6). نعتمد على code وليس النص. */
export class ApiError extends Error {
  status: number;
  code: string;
  title: string;
  detail?: string;
  errors?: Record<string, string[]>;
  traceId?: string;
  retryAfter?: number;
  extra?: Record<string, unknown>;

  constructor(init: { status: number; code: string; title?: string; detail?: string; errors?: Record<string, string[]>; traceId?: string; retryAfter?: number; extra?: Record<string, unknown> }) {
    super(init.detail || init.title || init.code);
    this.name = "ApiError";
    this.status = init.status;
    this.code = init.code;
    this.title = init.title ?? init.code;
    this.detail = init.detail;
    this.errors = init.errors;
    this.traceId = init.traceId;
    this.retryAfter = init.retryAfter;
    this.extra = init.extra;
  }
  get isNetwork() { return this.code === "NETWORK"; }
}

export const isApiError = (e: unknown): e is ApiError => e instanceof ApiError;
export const isNetworkError = (e: unknown) => isApiError(e) && e.isNetwork;

/** رسائل عربية للرموز الشائعة. إن لم يوجد الرمز نعرض detail/title القادمة من السيرفر (عربية). */
const MESSAGES: Record<string, string> = {
  NETWORK: "تعذر الاتصال بالخادم. تحقق من الإنترنت وحاول مرة أخرى.",
  INVALID_CREDENTIALS: "اسم المستخدم أو كلمة المرور غير صحيحة.",
  ACCOUNT_LOCKED: "الحساب مقفل مؤقتاً بعد محاولات فاشلة. حاول بعد 15 دقيقة.",
  USER_DISABLED: "هذا الحساب معطّل. راجع مدير النظام.",
  BRANCH_NOT_ASSIGNED: "أنت غير معيّن على هذا الفرع.",
  SHIFT_OPEN: "لا يمكن تبديل الفرع مع وجود وردية مفتوحة. أغلق الوردية أولاً.",
  PASSWORD_CHANGE_REQUIRED: "يجب تغيير كلمة المرور المؤقتة أولاً.",
  WEAK_PASSWORD: "كلمة المرور ضعيفة. استخدم 10 أحرف على الأقل.",
  UNAUTHORIZED: "انتهت الجلسة. سجّل الدخول من جديد.",
  TOKEN_EXPIRED: "انتهت الجلسة. سجّل الدخول من جديد.",
  FORBIDDEN: "لا تملك صلاحية لهذه العملية.",
  VALIDATION_ERROR: "تحقق من الحقول المدخلة.",
  RATE_LIMITED: "طلبات كثيرة. انتظر قليلاً ثم حاول.",
  NOT_FOUND: "العنصر المطلوب غير موجود.",
  IDEMPOTENCY_KEY_REQUIRED: "خطأ داخلي: مفتاح منع التكرار مفقود.",
  INTERNAL_ERROR: "حدث خطأ في الخادم. حاول لاحقاً.",
  // المرحلة 3: الحجز وتثبيت الحضور
  CHECKIN_TOKEN_INVALID: "الرمز غير صالح. امسح الرمز الظاهر على شاشة الانتظار داخل العيادة.",
  CHECKIN_TOKEN_EXPIRED: "انتهت صلاحية هذا الرمز. امسح الرمز الظاهر على الشاشة الآن.",
  CHECKIN_WRONG_CLINIC: "هذا الرمز لعيادة أخرى. امسح الرمز على شاشة عيادتك.",
  CHECKIN_WRONG_BRANCH: "هذا الرمز لفرع آخر. حجزك في فرع مختلف.",
  SELF_CHECKIN_DISABLED: "تثبيت الحضور من التطبيق متوقف في هذا الفرع. راجع موظف الاستقبال.",
  PATIENT_BANNED: "الملف موقوف بسبب تكرار الغياب. راجع الاستقبال لفك الحظر.",
  BOOKING_NOT_TODAY: "موعد هذا الحجز ليس اليوم. يُثبت الحضور في يوم الموعد.",
  BOOKING_NOT_ACTIVE: "هذا الحجز ملغى أو منتهٍ.",
  BOOKING_NOT_FOUND: "الحجز غير موجود.",
  BOOKING_NOT_CANCELLABLE: "لا يمكن إلغاء هذا الحجز بعد تثبيت الحضور أو انتهائه.",
  BOOKING_NOT_RESCHEDULABLE: "لا يمكن تغيير موعد حجز ثُبت حضوره أو أُلغي.",
  RESCHEDULE_DISABLED: "تغيير الموعد غير متاح في هذا الفرع.",
  RESCHEDULE_LIMIT_REACHED: "بلغ هذا الحجز الحد الأقصى لتغيير الموعد.",
  RESCHEDULE_TOO_LATE: "فات وقت تغيير الموعد. راجع الاستقبال.",
  RESCHEDULE_DIFFERENT_DOCTOR: "تغيير الموعد لنفس الطبيب فقط. لطبيب آخر ألغِ الحجز واحجز من جديد.",
  SAME_SESSION: "هذا هو موعدك الحالي. اختر موعداً آخر.",
  SESSION_FULL: "اكتمل هذا الموعد. اختر موعداً آخر.",
  SESSION_CANCELLED: "أُلغي هذا الموعد. اختر موعداً آخر.",
  SESSION_CLOSED: "أُغلق هذا الموعد. اختر موعداً آخر.",
  SESSION_NOT_FOUND: "الموعد غير موجود.",
  DUPLICATE_BOOKING: "لديك حجز في هذا الموعد مسبقاً.",
  CLINIC_CLOSED: "العيادة مغلقة في هذا الموعد.",
  BRANCH_CLOSED: "الفرع مغلق مؤقتاً.",
  CONCURRENT_UPDATE: "تغيّر الحجز للتو. أعد فتح النافذة وحاول مرة أخرى.",
  POLICY_OVERRIDE_FORBIDDEN: "الإعفاء أو تجاوز السياسة يحتاج صلاحية خاصة.",
};

export function errorMessage(e: unknown): string {
  if (isApiError(e) && e.code === "VALIDATION_ERROR" && e.errors) {
    // نعرض نص السيرفر لكل حقل، حتى الحقول غير الظاهرة في النموذج لا تضيع خلف رسالة عامة
    const msgs = [...new Set(Object.values(e.errors).flat())];
    if (msgs.length) return `${MESSAGES.VALIDATION_ERROR.replace(/\.$/, "")}: ${msgs.join("، ")}`;
  }
  if (isApiError(e)) return MESSAGES[e.code] ?? e.detail ?? e.title ?? MESSAGES.INTERNAL_ERROR;
  if (e instanceof Error && e.message && !/^(Failed to fetch|NetworkError|Load failed)/.test(e.message)) return e.message; // رسائل الواجهة نفسها (عربية)
  return "حدث خطأ غير متوقع.";
}
export function fieldErrors(e: unknown): Record<string, string> {
  if (!isApiError(e) || !e.errors) return {};
  return Object.fromEntries(Object.entries(e.errors).map(([k, v]) => [k, v[0]]));
}
