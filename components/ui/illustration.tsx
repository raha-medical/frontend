"use client";
/** نمط الرسم الوحيد في النظام للحالات الفارغة والأخطاء (UI-15): مشهد خطي ثابت حول أيقونة من المجموعة الموحدة. */
import { Icon } from "../icon";

export function Illustration({ icon = "inbox", tone = "primary", size = 132 }: { icon?: string; tone?: "primary" | "danger"; size?: number }) {
  const stroke = tone === "danger" ? "text-danger" : "text-primary";
  const fill = tone === "danger" ? "text-danger-soft" : "text-primary-soft";
  const height = Math.round(size * 0.74);
  return (
    <span aria-hidden className="relative inline-grid place-items-center" style={{ width: size, height }}>
      <svg viewBox="0 0 160 118" className="absolute inset-0 size-full" fill="none">
        <ellipse cx="80" cy="60" rx="66" ry="46" className={`${fill} fill-current`} />
        <path d="M34 106h92" className="stroke-current text-line-strong/50" strokeWidth="2" strokeLinecap="round" />
        <path d="M46 106h22M92 106h12" className={`stroke-current ${stroke}`} strokeWidth="2" strokeLinecap="round" />
        <rect x="50" y="24" width="60" height="68" rx="14" className="fill-current text-surface" />
        <rect x="50" y="24" width="60" height="68" rx="14" className={`stroke-current ${stroke}`} strokeWidth="2" />
        <path d="M24 34v8M20 38h8" className={`stroke-current ${stroke}`} strokeWidth="2" strokeLinecap="round" />
        <path d="M136 18v6M133 21h6" className={`stroke-current ${stroke}`} strokeWidth="2" strokeLinecap="round" />
        <circle cx="134" cy="76" r="3" className={`stroke-current ${stroke}`} strokeWidth="2" />
      </svg>
      <Icon name={icon} size={Math.round(size * 0.24)} className={`relative -mt-2 ${stroke}`} />
    </span>
  );
}
