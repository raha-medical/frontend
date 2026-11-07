"use client";
/** أدوات مشتركة للنوافذ (Modal و Drawer): قفل تمرير الصفحة، وحماية التعديلات غير المحفوظة، وجذر العرض. */
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

let locks = 0;

/** يقفل تمرير الصفحة الخلفية ما دامت نافذة واحدة على الأقل مفتوحة (UI-111). */
export function useScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    locks += 1;
    document.documentElement.style.overflow = "hidden";
    return () => {
      locks -= 1;
      if (locks === 0) document.documentElement.style.overflow = "";
    };
  }, [active]);
}

const stack: { current: () => void }[] = [];
let listening = false;
const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && stack.length) { e.stopPropagation(); stack[stack.length - 1].current(); } };

/** Esc يغلق أعلى نافذة مفتوحة أينما كان التركيز، حتى لو ضاع إلى body بعد إغلاق نافذة فوقها. */
export function useEscape(active: boolean, handler: () => void) {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    if (!active) return;
    stack.push(ref);
    if (!listening) { document.addEventListener("keydown", onKey); listening = true; }
    return () => {
      stack.splice(stack.indexOf(ref), 1);
      if (!stack.length) { document.removeEventListener("keydown", onKey); listening = false; }
    };
  }, [active]);
}

/** يغلق مباشرة، أو يطلب تأكيداً إذا كان في النافذة نموذج بتعديلات غير محفوظة (UI-110). */
export function useGuardedClose(open: boolean, onClose: () => void, dirty?: boolean) {
  const [confirming, setConfirming] = useState(false);
  useEffect(() => { if (!open) setConfirming(false); }, [open]);
  const request = useCallback(() => { if (dirty) setConfirming(true); else onClose(); }, [dirty, onClose]);
  const discard = useCallback(() => { setConfirming(false); onClose(); }, [onClose]);
  const keep = useCallback(() => setConfirming(false), []);
  return { confirming, request, discard, keep };
}

/** النوافذ تُرسم داخل جذر التطبيق حتى تبقى توكنز الخط، وخارج الحاويات الزجاجية التي تحبس position: fixed. */
export const overlayRoot = () => (typeof document === "undefined" ? null : (document.querySelector(".scale-staff, .scale-patient") as HTMLElement | null) ?? document.body);

const PHONE = "(max-width: 767px)";
/** عرض الهاتف: الجداول تتحول إلى بطاقات (UI-103). على الخادم يُفترض الحاسوب. */
export function useIsPhone() {
  return useSyncExternalStore(
    (cb) => { const m = window.matchMedia(PHONE); m.addEventListener("change", cb); return () => m.removeEventListener("change", cb); },
    () => window.matchMedia(PHONE).matches,
    () => false,
  );
}
