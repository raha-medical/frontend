/** المشهد البصري للهوية بدل الصور العامة (UI-12، UI-22): خلفية بلون المجمع، دوائر هادئة الحركة، وخط نبض.
 *  الحركة بطيئة وتتوقف مع prefers-reduced-motion عبر القاعدة العامة في globals.css. */
import type { ReactNode } from "react";
import { BrandMark } from "./brand-mark";
import { Icon } from "./icon";

export function BrandScene({ className = "", children }: { className?: string; children?: ReactNode }) {
  return (
    <div className={`scene isolate ${className}`}>
      <span aria-hidden className="scene-orb scene-orb-a" />
      <span aria-hidden className="scene-orb scene-orb-b" />
      <span aria-hidden className="scene-ring" />
      <span aria-hidden className="scene-ring scene-ring-2" />
      <svg aria-hidden viewBox="0 0 800 120" preserveAspectRatio="none" fill="none" className="scene-pulse">
        <path d="M0 60H240l18-34 30 76 26-58 14 16H470l18-34 30 76 26-58 14 16H800" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" pathLength={100} />
      </svg>
      {/* زخرفة فقط: لا تلتقط اللمس حتى لا تحجب ما فوقها، مثل بطاقة الدخول على الهاتف */}
      {children && <div className="pointer-events-none relative z-[1] flex size-full flex-col items-center justify-center">{children}</div>}
    </div>
  );
}

/** لوح زجاجي فيه الشعار واسم المجمع. */
export function BrandTile({ size = 112, title = "مجمع الرحمة الطبي", hint }: { size?: number; title?: string; hint?: string }) {
  return (
    <div className="scene-tile flex max-w-[360px] flex-col items-center gap-3 rounded-panel px-8 py-7 text-center text-white">
      <BrandMark size={size} tone="onDark" paper="rgb(var(--nav-medical))" />
      <span className="text-[26px] font-bold">{title}</span>
      {hint && <span className="text-[15px] leading-7 text-on-nav-2">{hint}</span>}
    </div>
  );
}

/** لوحة قسم في الموقع: رسم خطي بأيقونة القسم بدل الصورة. */
export function ServiceArt({ icon, className = "" }: { icon: string; className?: string }) {
  return (
    <div aria-hidden className={`relative grid place-items-center overflow-hidden bg-primary-soft text-primary ${className}`}>
      <span className="absolute size-44 rounded-full border-2 border-primary/15" />
      <span className="absolute size-28 rounded-full border-2 border-primary/25" />
      <span className="relative grid size-16 place-items-center rounded-2xl bg-surface shadow-glass"><Icon name={icon} size={30} /></span>
    </div>
  );
}
