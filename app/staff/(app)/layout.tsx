"use client";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Shell } from "@/components/staff/shell";
import { Spinner } from "@/components/ui";
import { useAuth } from "@/lib/auth/store";
import { LiveProvider } from "@/lib/realtime/provider";
import { SyncProvider } from "@/lib/offline/sync-provider";
import { canOpenPath, homeFor } from "@/lib/roles";
import type { StaffUser } from "@/lib/api/types";

/** حارس واجهات الموظفين: جلسة + تغيير كلمة المرور المؤقتة + القسم والشاشة المسموحان (user.sections والصلاحيات). السيرفر يرفض بـ 403 على أي حال. */
export default function StaffAppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const path = usePathname();
  const { status, user, otherAccount } = useAuth();
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
        {otherAccount && <OtherAccountNotice current={user.full_name} other={otherAccount} />}
      </LiveProvider>
    </SyncProvider>
  );
}

/** رسالة «تم تسجيل الدخول بحساب آخر في هذا المتصفح» بدل التحديث المفاجئ: الجلسة واحدة لكل متصفح. */
function OtherAccountNotice({ current, other }: { current: string; other: StaffUser }) {
  const router = useRouter();
  const accept = useAuth((s) => s.acceptOtherAccount);
  return (
    <div role="alertdialog" aria-modal="true" aria-labelledby="other-account-title" className="fixed inset-0 z-[100] grid place-items-center bg-black/50 p-4">
      <div className="flex w-full max-w-md flex-col gap-3 rounded-2xl bg-surface p-6 text-center shadow-pop">
        <span id="other-account-title" className="text-lg font-bold">تم تسجيل الدخول بحساب آخر في هذا المتصفح</span>
        <span className="text-sm leading-7 text-ink-2">
          هذا التبويب كان لحساب <b>{current}</b>، ودخل الآن <b>{other.full_name}</b> من تبويب آخر. المتصفح يحفظ حساباً واحداً فقط،
          فلا يمكن العمل بالحسابين معاً هنا. لتجربة حسابين معاً افتح كل حساب في متصفح مختلف أو نافذة خاصة.
        </span>
        <button onClick={() => { accept(); router.replace(homeFor(other)); }} className="h-11 rounded-full bg-primary px-4 font-semibold text-on-accent">المتابعة بحساب {other.full_name}</button>
      </div>
    </div>
  );
}
