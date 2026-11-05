"use client";
/** شاشة ترحيب سريعة للزائر العائد (4.1)، ثم الرئيسية مباشرة. */
import { useEffect } from "react";
import { BrandMark } from "@/components/brand-mark";

export const SPLASH_MS = 900;

export function Splash({ name, onDone }: { name: string | null; onDone: () => void }) {
  useEffect(() => { const t = setTimeout(onDone, SPLASH_MS); return () => clearTimeout(t); }, [onDone]);
  return (
    <div className="enter fixed inset-0 z-[70] flex flex-col items-center justify-center gap-4 bg-bg text-center" role="status" aria-label="مرحباً بعودتك">
      <span className="grid place-items-center rounded-full bg-primary-soft/60 p-5"><BrandMark size={112} /></span>
      <span className="text-heading font-bold">{name ? `أهلاً بعودتك، ${name.split(" ")[0]}` : "أهلاً بعودتك"}</span>
      <span className="sub">مجمع الرحمة الطبي</span>
    </div>
  );
}
