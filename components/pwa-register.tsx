"use client";
import { useEffect, useState } from "react";
import { Icon } from "./icon";

/** تسجيل الـ Service Worker + إشعار «تحديث جديد» (Cache Busting & Force Update — وثيقة المعمارية 2.أ). */
export function PwaRegister() {
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") {
      // وضع التطوير: نزيل أي Service Worker قديم من تشغيل سابق، وإلا يخدم CSS/JS قديماً (سبب «حقل داخل حقل» بعد الإصلاح)
      navigator.serviceWorker.getRegistrations().then((rs) => rs.forEach((r) => r.unregister())).catch(() => {});
      if ("caches" in window) caches.keys().then((ks) => ks.forEach((k) => caches.delete(k))).catch(() => {});
      return;
    }
    let reloading = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => { if (!reloading) { reloading = true; location.reload(); } });
    navigator.serviceWorker.register("/sw.js").then((reg) => {
      if (reg.waiting && navigator.serviceWorker.controller) setWaiting(reg.waiting);
      reg.addEventListener("updatefound", () => {
        const w = reg.installing;
        w?.addEventListener("statechange", () => { if (w.state === "installed" && navigator.serviceWorker.controller) setWaiting(w); });
      });
      setInterval(() => reg.update().catch(() => {}), 30 * 60 * 1000);
    }).catch(() => { /* التسجيل اختياري */ });
  }, []);

  if (!waiting) return null;
  return (
    <div className="fixed inset-x-4 bottom-4 z-50 mx-auto flex max-w-md items-center gap-3 rounded-2xl bg-nav-finance p-4 text-white shadow-pop" role="status">
      <Icon name="refresh-cw" size={20} />
      <span className="flex-1 text-sm font-semibold">يتوفر إصدار أحدث من النظام</span>
      <button onClick={() => waiting.postMessage("SKIP_WAITING")} className="h-9 rounded-full bg-white px-4 text-sm font-bold text-nav-finance">تحديث الآن</button>
    </div>
  );
}
