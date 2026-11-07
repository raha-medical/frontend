"use client";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Shell } from "@/components/staff/shell";
import { Spinner } from "@/components/ui";
import { useAuth } from "@/lib/auth/store";
import { LiveProvider } from "@/lib/realtime/provider";
import { SyncProvider } from "@/lib/offline/sync-provider";
import { canOpenPath, homeFor } from "@/lib/roles";

/** حارس واجهات الموظفين: جلسة + تغيير كلمة المرور المؤقتة + القسم والشاشة المسموحان (user.sections والصلاحيات). السيرفر يرفض بـ 403 على أي حال. */
export default function StaffAppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const path = usePathname();
  const { status, user, sessionChanged } = useAuth();
  const allowed = !user || canOpenPath(user, path);

  useEffect(() => {
    if (sessionChanged) return;
    if (status === "anon") {
      router.replace("/staff/login");
      // احتياط: إن أُلغي التنقل الناعم (طلبا تنقل متزامنان) لا نبقى عالقين على «جارٍ التحقق من الجلسة»
      const t = setTimeout(() => { if (window.location.pathname !== "/staff/login") window.location.replace("/staff/login"); }, 1500);
      return () => clearTimeout(t);
    }
    if (status === "authed" && user?.must_change_password) router.replace("/staff/change-password");
    else if (status === "authed" && user && !allowed) router.replace(homeFor(user));
  }, [status, user, allowed, router, sessionChanged]);

  if (sessionChanged) return <div role="alert" className="mx-auto mt-20 max-w-lg rounded-2xl border border-line bg-surface p-6 text-center">
    <p className="text-lg font-bold">{sessionChanged}</p>
    <p className="my-4">افتح كل حساب في متصفح أو نافذة خاصة منفصلة للاختبار.</p>
    <button className="rounded-xl bg-primary px-5 py-3 text-on-accent" onClick={() => window.location.reload()}>متابعة بالحساب الحالي</button>
  </div>;

  if (status !== "authed" || !user || user.must_change_password || !allowed) return <Spinner label="جارٍ التحقق من الجلسة…" />;
  return (
    <SyncProvider>
      <LiveProvider>
        <Shell user={user}>{children}</Shell>
      </LiveProvider>
    </SyncProvider>
  );
}
