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
  const { status, user } = useAuth();
  const allowed = !user || canOpenPath(user, path);

  useEffect(() => {
    if (status === "anon") {
      router.replace("/staff/login");
      // احتياط: إن أُلغي التنقل الناعم (طلبا تنقل متزامنان) لا نبقى عالقين على «جارٍ التحقق من الجلسة»
      const t = setTimeout(() => { if (window.location.pathname !== "/staff/login") window.location.replace("/staff/login"); }, 1500);
      return () => clearTimeout(t);
    }
    if (status === "authed" && user?.must_change_password) router.replace("/staff/change-password");
    else if (status === "authed" && user && !allowed) router.replace(homeFor(user));
  }, [status, user, allowed, router]);

  if (status !== "authed" || !user || user.must_change_password || !allowed) return <Spinner label="جارٍ التحقق من الجلسة…" />;
  return (
    <SyncProvider>
      <LiveProvider>
        <Shell user={user}>{children}</Shell>
      </LiveProvider>
    </SyncProvider>
  );
}
