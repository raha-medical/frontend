"use client";
/** لوحة جانبية موحدة لعرض تفاصيل السجل (UI-104 إلى UI-111). الإجراءات القصيرة تبقى في Modal.
 *  رأس ثابت، محتوى يتمرر، شريط إجراءات ثابت، ويفتح بعرض الشاشة كاملاً على الهاتف. */
import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Icon } from "../icon";
import { Button, Skeleton } from "./core";
import { Illustration } from "./illustration";
import { overlayRoot, useEscape, useGuardedClose, useScrollLock } from "./overlay";

export type DrawerProps = {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  /** سطر تحت العنوان: رقم السجل أو نوعه. */
  subtitle?: ReactNode;
  /** شارة الحالة بجانب العنوان. */
  status?: ReactNode;
  icon?: string;
  /** أقصى عرض على الحاسوب. */
  width?: number;
  loading?: boolean;
  error?: ReactNode;
  /** أزرار الإجراءات في الشريط الثابت أسفل النافذة. */
  footer?: ReactNode;
  /** في النافذة نموذج بتعديلات غير محفوظة: يُطلب تأكيد قبل الإغلاق. */
  dirty?: boolean;
  children?: ReactNode;
};

export function Drawer({ open, onClose, title, subtitle, status, icon, width = 560, loading, error, footer, dirty, children }: DrawerProps) {
  const panel = useRef<HTMLDivElement>(null);
  const hid = useId();
  const guard = useGuardedClose(open, onClose, dirty);
  useScrollLock(open);
  useEscape(open, guard.request);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    panel.current?.focus();
    return () => { prev?.focus?.(); };
  }, [open]);
  const root = overlayRoot();
  if (!open || !root) return null;

  return createPortal(
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-labelledby={hid}>
      <div className="absolute inset-0 bg-black/40 [animation:rh-enter_var(--dur-base)_var(--ease-out)_both]" onClick={guard.request} />
      <div ref={panel} tabIndex={-1} style={{ maxWidth: width }}
        className="drawer-in absolute inset-y-0 end-0 flex w-full flex-col border-s border-line bg-surface shadow-pop outline-none">
        <header className="flex shrink-0 items-start gap-3 border-b border-line px-5 py-4">
          {icon && <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary-strong"><Icon name={icon} size={20} /></span>}
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 id={hid} className="min-w-0 text-heading">{title}</h2>
              {status}
            </div>
            {subtitle != null && <div className="sub flex flex-wrap items-center gap-1">{subtitle}</div>}
          </div>
          <button type="button" onClick={guard.request} aria-label="إغلاق" className="grid size-10 shrink-0 place-items-center rounded-xl hover:bg-bg"><Icon name="x" size={20} /></button>
        </header>
        <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto overscroll-contain px-5 py-5">
          {loading ? <DrawerSkeleton /> : error ? <DrawerError>{error}</DrawerError> : children}
        </div>
        {guard.confirming ? <DiscardBar onDiscard={guard.discard} onKeep={guard.keep} />
          : footer && !loading && !error && <footer className="flex shrink-0 flex-wrap items-center gap-2 border-t border-line px-5 py-3.5">{footer}</footer>}
      </div>
    </div>, root);
}

/** تأكيد تجاهل التعديلات داخل النافذة نفسها. */
export function DiscardBar({ onDiscard, onKeep }: { onDiscard: () => void; onKeep: () => void }) {
  return (
    <div role="alert" className="flex shrink-0 flex-wrap items-center gap-2 border-t border-line bg-warn-soft px-5 py-3.5">
      <span className="min-w-0 flex-1 text-sm font-semibold text-warn-strong">لديك تعديلات غير محفوظة. هل تتجاهلها؟</span>
      <Button size="sm" variant="danger" onClick={onDiscard}>تجاهل وإغلاق</Button>
      <Button size="sm" variant="ghost" onClick={onKeep}>متابعة التعديل</Button>
    </div>
  );
}

function DrawerSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" role="status" aria-label="جارٍ التحميل">
      <Skeleton className="h-20 w-full rounded-xl" />
      {[0, 1].map((s) => (
        <div key={s} className="flex flex-col gap-3">
          <Skeleton className="h-4 w-28" />
          <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
            {[0, 1, 2, 3].map((i) => <div key={i} className="flex flex-col gap-1.5"><Skeleton className="h-3 w-16" /><Skeleton className="h-4 w-3/4" /></div>)}
          </div>
        </div>
      ))}
    </div>
  );
}

function DrawerError({ children }: { children: ReactNode }) {
  return <div role="alert" className="flex flex-col items-center gap-3 py-10 text-center"><Illustration icon="circle-alert" tone="danger" /><span className="font-bold">تعذر تحميل التفاصيل</span><span className="sub">{children}</span></div>;
}

const isBlank = (v: ReactNode) => v == null || v === "" || v === false;

/** أهم معلومة في النافذة: الحالة أو المبلغ المستحق (UI-108). */
export function DetailHero({ label, value, hint, tone = "primary" }: { label: string; value: ReactNode; hint?: ReactNode; tone?: "primary" | "success" | "warn" | "danger" | "info" }) {
  const cls = { primary: "bg-primary-soft text-primary-strong", success: "bg-success-soft text-success-strong", warn: "bg-warn-soft text-warn-strong", danger: "bg-danger-soft text-danger-strong", info: "bg-info-soft text-info-strong" }[tone];
  return (
    <div className={`flex flex-col gap-1 rounded-xl px-4 py-3 ${cls}`}>
      <span className="text-[13px] font-semibold opacity-90">{label}</span>
      <span className="text-[26px] font-bold leading-tight">{isBlank(value) ? "—" : value}</span>
      {hint != null && <span className="text-[13px] opacity-90">{hint}</span>}
    </div>
  );
}

/** مجموعة معلومات بعنوان واضح (UI-106): عمودان على الحاسوب وعمود واحد على الهاتف (UI-107). */
export function DetailSection({ title, icon, children, action }: { title: string; icon?: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        {icon && <Icon name={icon} size={16} className="text-primary" />}
        <h3 className="flex-1 text-[15px] font-bold">{title}</h3>
        {action}
      </div>
      <dl className="grid gap-x-6 gap-y-3.5 sm:grid-cols-2">{children}</dl>
    </section>
  );
}

/** «العنوان: القيمة». الحقل الفارغ يُعرض — ولا يُخفى (UI-107). */
export function DetailField({ label, value, full, num }: { label: string; value?: ReactNode; full?: boolean; num?: boolean }) {
  return (
    <div className={`flex min-w-0 flex-col gap-0.5 ${full ? "sm:col-span-2" : ""}`}>
      <dt className="text-[13px] text-ink-muted">{label}</dt>
      <dd className={`min-w-0 break-words text-[15px] font-medium text-ink ${num ? "num" : ""}`}>{isBlank(value) ? "—" : value}</dd>
    </div>
  );
}
