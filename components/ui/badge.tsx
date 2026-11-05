import type { ReactNode } from "react";
import { Icon } from "../icon";
import { TONE_DOT, TONE_OUTLINE, TONE_SOFT, TONE_SOLID, type BadgeTone } from "./tones";

export type BadgeProps = {
  tone?: BadgeTone;
  /** soft (افتراضي): خلفية هادئة. solid: تعبئة. outline: إطار. */
  variant?: "soft" | "solid" | "outline";
  size?: "sm" | "md" | "lg";
  icon?: string;
  /** نقطة ملونة بدل الأيقونة (للحالات داخل الجداول). */
  dot?: boolean;
  className?: string;
  title?: string;
  children?: ReactNode;
};

const SIZE = { sm: "gap-1 px-2 py-0.5 text-[11px]", md: "gap-1 px-2.5 py-1 text-xs", lg: "gap-1.5 px-3 py-2 text-[13px]" };
const ICON = { sm: 12, md: 13, lg: 16 };

/** شارة حالة دلالية. مثال: <Badge tone="success" icon="circle-check">مدفوع</Badge> */
export function Badge({ tone = "muted", variant = "soft", size = "md", icon, dot, className = "", title, children }: BadgeProps) {
  const c = variant === "solid" ? TONE_SOLID[tone] : variant === "outline" ? TONE_OUTLINE[tone] : TONE_SOFT[tone];
  return (
    <span title={title} className={`inline-flex items-center whitespace-nowrap rounded-full font-semibold leading-5 ${SIZE[size]} ${c} ${className}`}>
      {dot && <span aria-hidden className={`size-2 shrink-0 rounded-full ${variant === "solid" ? "bg-current" : TONE_DOT[tone]}`} />}
      {icon && <Icon name={icon} size={ICON[size]} className="shrink-0" />}
      {children}
    </span>
  );
}

/** خريطة حالة → شارة: تعريف واحد لكل جدول. مثال:
 *  const ST = { paid: { tone: "success", label: "مدفوع" }, unpaid: { tone: "warn", label: "غير مدفوع" } } satisfies StatusMap;
 *  <StatusBadge map={ST} value={row.status} /> */
export type StatusMap = Record<string, { tone: BadgeTone; label: string; icon?: string }>;
export function StatusBadge({ map, value, fallback, size }: { map: StatusMap; value: string | null | undefined; fallback?: string; size?: BadgeProps["size"] }) {
  if (!value) return <span className="text-ink-muted">—</span>;
  const s = map[value];
  return <Badge tone={s?.tone ?? "muted"} icon={s?.icon} size={size}>{s?.label ?? fallback ?? value}</Badge>;
}
