"use client";
/** المكونات الأساسية: Alert, Button, Field, Spinner, Modal, ReasonDialog, Segmented, Card, Empty.
 *  نُقلت من components/ui.tsx كما هي (نفس الواجهة البرمجية) مع توكنز نصف القطر والحركة والزجاج. */
import { forwardRef, useEffect, useId, useRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Icon } from "../icon";
import { DiscardBar } from "./drawer";
import { Illustration } from "./illustration";
import { overlayRoot, useEscape, useGuardedClose, useScrollLock } from "./overlay";
import { TONE_ICON, TONE_SOFT, type Tone } from "./tones";

export type { Tone } from "./tones";

/** أصناف موحّدة لحقل إدخال خام (input/textarea/select) عند عدم استخدام <Field>. */
export const controlCls = "h-12 w-full rounded-field border-[1.5px] border-line-strong bg-surface px-3.5 text-body text-ink outline-none placeholder:text-ink-muted focus:border-primary focus:ring-4 focus:ring-primary/15 disabled:opacity-60";

export function Alert({ tone = "info", children, icon }: { tone?: Tone; children: ReactNode; icon?: string }) {
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={`enter flex gap-2 rounded-xl px-3.5 py-3 text-[14px] leading-relaxed ${TONE_SOFT[tone]}`}>
      <Icon name={icon ?? TONE_ICON[tone]} size={17} className="mt-0.5 shrink-0" />
      <div>{children}</div>
    </div>
  );
}

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  loading?: boolean; icon?: string;
  /** primary: الإجراء الرئيسي. soft: ثانوي ملوّن. ghost: محايد بإطار. danger: إجراء خطر. */
  variant?: "primary" | "soft" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
};
export function Button({ loading, icon, variant = "primary", size = "lg", className = "", children, disabled, ...rest }: BtnProps) {
  const v = variant === "primary" ? "bg-primary text-on-accent hover:bg-primary-strong shadow-sm"
    : variant === "danger" ? "bg-danger text-on-accent hover:bg-danger-strong shadow-sm"
    : variant === "soft" ? "bg-primary-soft text-primary-strong hover:bg-primary/20"
    : "border border-line-strong bg-surface text-ink hover:border-primary/50 hover:bg-primary-soft";
  const s = size === "lg" ? "h-[52px] px-6 text-base" : size === "md" ? "h-[42px] px-5 text-sm" : "h-9 px-3.5 text-[13px]";
  return (
    <button {...rest} disabled={disabled || loading}
      className={`inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-control font-semibold transition-[background-color,border-color,color,box-shadow,transform] duration-base ease-out active:scale-[.98] disabled:pointer-events-none disabled:opacity-50 ${v} ${s} ${className}`}>
      {(loading || icon) && <Icon name={loading ? "loader-circle" : icon!} size={size === "sm" ? 16 : 18} className={loading ? "animate-spin" : ""} />}
      {children}
    </button>
  );
}

type FieldProps = InputHTMLAttributes<HTMLInputElement> & { label: string; icon?: string; error?: string; invalid?: boolean; ltr?: boolean; secret?: boolean; hint?: string };
export const Field = forwardRef<HTMLInputElement, FieldProps>(function Field({ label, icon, error, invalid, ltr, secret, hint, className = "", id, ...rest }, ref) {
  const [show, setShow] = useState(false);
  const fid = id ?? `f-${label}`;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={fid} className="sub">{label}</label>
      <div className={`flex h-[50px] items-center gap-2 rounded-field border-[1.5px] bg-surface px-3.5 transition-[border-color,box-shadow] duration-base focus-within:border-primary focus-within:ring-4 focus-within:ring-primary/15 ${error || invalid ? "border-danger" : "border-line-strong"}`}>
        {icon && <Icon name={icon} size={17} className="shrink-0 text-ink-muted" />}
        <input ref={ref} id={fid} {...rest} type={secret && !show ? "password" : secret ? "text" : rest.type}
          dir={ltr || secret ? "ltr" : undefined} aria-invalid={error || invalid ? true : undefined}
          className={`min-w-0 flex-1 bg-transparent text-body text-ink outline-none placeholder:text-ink-muted ${ltr || secret ? "num text-start" : ""} ${className}`} />
        {secret && (
          <button type="button" onClick={() => setShow((s) => !s)} aria-label={show ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"} className="-me-2 grid size-11 shrink-0 place-items-center rounded-xl text-ink-muted hover:text-ink">
            <Icon name={show ? "eye-off" : "eye"} size={17} />
          </button>
        )}
      </div>
      {error ? <span className="text-xs font-semibold text-danger-strong">{error}</span> : hint ? <span className="sub-sm">{hint}</span> : null}
    </div>
  );
});

export function Spinner({ label = "جارٍ التحميل…" }: { label?: string }) {
  return <div className="flex items-center justify-center gap-2 p-8 text-sm text-ink-2" role="status"><Icon name="loader-circle" size={20} className="animate-spin" />{label}</div>;
}

/** هيكل تحميل رمادي (للجداول والبطاقات). */
export function Skeleton({ className = "h-4 w-full" }: { className?: string }) {
  return <span aria-hidden className={`block animate-pulse rounded-chip bg-line/70 ${className}`} />;
}

/** نافذة حوار للإجراءات القصيرة (RTL، تُغلق بـ Esc وبالنقر خارجها، وتنقل التركيز إليها عند الفتح).
 *  تقفل تمرير الصفحة، و`dirty` يطلب تأكيداً قبل إغلاق نموذج فيه تعديلات غير محفوظة. تفاصيل السجل تُعرض في Drawer. */
export function Modal({ open, onClose, title, icon, children, width = 460, footer, dirty }: { open: boolean; onClose: () => void; title: string; icon?: string; children: ReactNode; width?: number; footer?: ReactNode; dirty?: boolean }) {
  const panel = useRef<HTMLDivElement>(null);
  const hid = useId();
  const guard = useGuardedClose(open, onClose, dirty);
  useScrollLock(open);
  useEscape(open, guard.request);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    // لا نسرق التركيز من حقل autoFocus داخل النافذة
    if (!panel.current?.contains(document.activeElement)) panel.current?.focus();
    return () => { prev?.focus?.(); };
  }, [open]);
  const root = overlayRoot();
  if (!open || !root) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 grid grid-cols-[minmax(0,1fr)] place-items-center p-4 max-sm:place-items-end max-sm:p-0" role="dialog" aria-modal="true" aria-labelledby={hid}>
      <div className="absolute inset-0 bg-black/45 [animation:rh-enter_var(--dur-base)_var(--ease-out)_both]" onClick={guard.request} />
      <div ref={panel} tabIndex={-1} className="enter relative flex max-h-[90dvh] w-full flex-col overflow-hidden rounded-panel border border-line bg-surface shadow-pop outline-none max-sm:!max-w-none max-sm:rounded-b-none" style={{ maxWidth: width }}>
        <div className="flex shrink-0 items-center gap-2 px-6 pb-2 pt-5">
          {icon && <Icon name={icon} size={20} className="text-primary" />}
          <h2 id={hid} className="flex-1 text-lg font-bold">{title}</h2>
          <button type="button" onClick={guard.request} aria-label="إغلاق" className="grid size-10 place-items-center rounded-full hover:bg-bg"><Icon name="x" size={18} /></button>
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain px-6 pb-5 pt-2">
          {children}
          {footer && <div className="flex flex-wrap gap-2">{footer}</div>}
        </div>
        {guard.confirming && <DiscardBar onDiscard={guard.discard} onKeep={guard.keep} />}
      </div>
    </div>, root);
}

/** حوار يطلب سبباً إلزامياً (الطوارئ، الغياب النهائي، الإلغاء…) */
export function ReasonDialog({ open, title, icon, label = "السبب", confirmText, danger, requireReason = true, note, onClose, onConfirm }: {
  open: boolean; title: string; icon?: string; label?: string; confirmText: string; danger?: boolean; requireReason?: boolean; note?: ReactNode;
  onClose: () => void; onConfirm: (reason: string) => Promise<void>;
}) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <Modal open={open} onClose={() => { setReason(""); setErr(null); onClose(); }} title={title} icon={icon}>
      {note}
      {requireReason && (
        <label className="flex flex-col gap-1.5">
          <span className="sub">{label}</span>
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} autoFocus
            className="rounded-field border-[1.5px] border-line-strong bg-surface p-3 text-body outline-none focus:border-primary focus:ring-4 focus:ring-primary/15" />
        </label>
      )}
      {err && <Alert tone="danger">{err}</Alert>}
      <div className="flex gap-2">
        <Button size="md" variant={danger ? "danger" : "primary"} loading={busy} disabled={requireReason && !reason.trim()} className="flex-1"
          onClick={async () => { setBusy(true); setErr(null); try { await onConfirm(reason.trim()); setReason(""); onClose(); } catch (e) { setErr((e as Error)?.message ?? "خطأ"); } finally { setBusy(false); } }}>
          {confirmText}
        </Button>
        <Button size="md" variant="ghost" onClick={onClose}>إلغاء</Button>
      </div>
    </Modal>
  );
}

export function Segmented<T extends string>({ value, options, onChange, size = "md" }: { value: T; options: { value: T; label: string; icon?: string }[]; onChange: (v: T) => void; size?: "sm" | "md" }) {
  return (
    <div className="inline-flex gap-1 rounded-xl bg-bg p-1" role="tablist">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button key={o.value} type="button" role="tab" aria-selected={on} onClick={() => onChange(o.value)}
            className={`flex items-center justify-center gap-1.5 rounded-xl px-3 font-semibold ${size === "sm" ? "h-8 text-[13px]" : "h-[38px] text-sm"} ${on ? "bg-surface text-primary-strong shadow-sm" : "text-ink-3 hover:text-ink"}`}>
            {o.icon && <Icon name={o.icon} size={15} />}{o.label}
          </button>
        );
      })}
    </div>
  );
}

/** بطاقة زجاجية (glass): شفافية 78–82% مع تمويه، وبديل صلب حيث لا يُدعم backdrop-filter. solid لإلغاء الزجاج. */
export function Card({ className = "", children, solid }: { className?: string; children: ReactNode; solid?: boolean }) {
  return <div className={`rounded-card ${solid ? "border border-line bg-surface" : "glass shadow-glass"} ${className}`}>{children}</div>;
}

const EMPTY_ICON = { lab: "flask-conical", radiology: "scan-line", pharmacy: "pill", clinics: "stethoscope", complex: "hospital" } as const;

/** حالة فارغة بنمط الرسم الموحد. `image` يختار أيقونة القسم (مختبر، أشعة، صيدلية، عيادات، المجمع). */
export function Empty({ icon = "inbox", title, hint, image, action }: { icon?: string; title: string; hint?: string; image?: keyof typeof EMPTY_ICON; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-8 text-center">
      <Illustration icon={image ? EMPTY_ICON[image] : icon} />
      <span className="font-bold">{title}</span>
      {hint && <span className="sub">{hint}</span>}
      {action}
    </div>
  );
}

/** حالة خطأ بنمط الرسم نفسه، مع إعادة المحاولة. */
export function ErrorState({ title = "تعذر تحميل البيانات", hint, onRetry }: { title?: string; hint?: ReactNode; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center gap-2 px-6 py-8 text-center">
      <Illustration icon="circle-alert" tone="danger" />
      <span className="font-bold">{title}</span>
      {hint != null && <span className="sub">{hint}</span>}
      {onRetry && <Button size="sm" variant="ghost" icon="rotate-cw" onClick={onRetry}>إعادة المحاولة</Button>}
    </div>
  );
}
