import type { PaymentStatus, Priority, TicketSource, TicketStatus } from "@/lib/api/reception";

/** ألوان وأيقونات الحالات كما في Reception.dc.html (S، P، SRC). */
export const STATUS: Record<TicketStatus, { label: string; cls: string; icon: string }> = {
  waiting: { label: "انتظار الوصول", cls: "bg-info-soft text-info-strong", icon: "hourglass" },
  arrived: { label: "وصل", cls: "bg-primary-soft text-primary-strong", icon: "user-check" },
  called: { label: "تم الاستدعاء", cls: "bg-warn-soft text-warn-strong", icon: "megaphone" },
  in_room: { label: "في الغرفة", cls: "bg-primary text-on-accent", icon: "door-open" },
  completed: { label: "مكتمل", cls: "bg-success-soft text-success-strong", icon: "circle-check" },
  skipped: { label: "متخطى مؤقتاً", cls: "bg-bg text-ink-2", icon: "skip-forward" },
  no_show: { label: "غياب", cls: "bg-danger-soft text-danger-strong", icon: "user-x" },
  cancelled: { label: "ملغى", cls: "bg-bg text-ink-3", icon: "circle-x" },
  awaiting_results: { label: "بانتظار قسم", cls: "bg-info-soft text-info-strong", icon: "flask-conical" },
};
export const PAYMENT: Record<PaymentStatus, { label: string; cls: string }> = {
  paid: { label: "مدفوع", cls: "bg-success-soft text-success-strong" },
  unpaid: { label: "غير مدفوع", cls: "bg-warn-soft text-warn-strong" },
  deferred: { label: "آجل", cls: "bg-info-soft text-info-strong" },
  refunded: { label: "مسترجع", cls: "bg-bg text-ink-2" },
  not_billed: { label: "لم يُفوتر", cls: "bg-bg text-ink-3" },
};
export const SOURCE: Record<TicketSource, { label: string; icon: string }> = {
  online: { label: "أونلاين", icon: "globe" },
  walk_in: { label: "حضوري", icon: "footprints" },
  phone: { label: "هاتفي", icon: "phone" },
};
export const PRIORITY: Record<Priority, { label: string; icon: string; cls: string }> = {
  normal: { label: "عادي", icon: "minus", cls: "text-ink-muted" },
  emergency: { label: "طوارئ", icon: "siren", cls: "text-danger-strong" },
  late_reinserted: { label: "متأخر · أُعيد إدراجه", icon: "alarm-clock", cls: "text-warn-strong" },
  returning: { label: "عائد بالنتائج", icon: "undo-2", cls: "text-info-strong" },
};
export const STEPS: { key: TicketStatus; label: string; icon: string }[] = [
  { key: "waiting", label: "الحجز", icon: "hourglass" },
  { key: "arrived", label: "وصل", icon: "user-check" },
  { key: "called", label: "استدعاء", icon: "megaphone" },
  { key: "in_room", label: "الغرفة", icon: "door-open" },
  { key: "completed", label: "مكتمل", icon: "circle-check" },
];
