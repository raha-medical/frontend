"use client";
/** شاشة البداية (UI-06): ثانيتان بالضبط عند أول فتح للتطبيق في التبويب، وفيها شعار المجمع.
 *  السكربت في app/layout.tsx يخفيها قبل أول رسم عند إعادة تحميل الصفحة في الجلسة نفسها. */
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { BrandMark } from "./brand-mark";

export const SPLASH_MS = 2000;
export const SPLASH_KEY = "rahma-splash-seen";
// شاشة الانتظار وصفحة التحقق من الوصل تُفتحان مباشرة بلا شاشة بداية
const SKIP = /^\/(display|verify)(\/|$)/;

export function AppSplash() {
  const path = usePathname();
  const skip = SKIP.test(path);
  const [show, setShow] = useState(!skip);

  useEffect(() => {
    if (skip) return;
    let seen = false;
    try {
      seen = !!sessionStorage.getItem(SPLASH_KEY);
      sessionStorage.setItem(SPLASH_KEY, "1");
    } catch { /* تخزين محظور: تظهر الشاشة كل مرة */ }
    if (seen) { setShow(false); return; }
    // تُحسب المدة من بداية تحميل الصفحة، فالشاشة ظاهرة من أول رسم قبل أن يعمل هذا الكود
    const t = setTimeout(() => setShow(false), Math.max(0, SPLASH_MS - performance.now()));
    return () => clearTimeout(t);
  }, [skip]);

  if (!show) return null;
  return (
    <div className="app-splash fixed inset-0 z-[80] flex flex-col items-center justify-center gap-4 bg-bg text-center" role="status" aria-label="مجمع الرحمة الطبي">
      <BrandMark size={120} />
      <span className="text-[22px] font-bold text-ink">مجمع الرحمة الطبي</span>
    </div>
  );
}
