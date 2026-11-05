"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { BrandMark } from "@/components/brand-mark";
import { Button, Card, Spinner } from "@/components/ui";
import { useAuth } from "@/lib/auth/store";
import { homeFor, roleMeta } from "@/lib/roles";

/** دور بلا أي قسم واجهة (home_section = null، العقد 1). */
export default function NoAccessPage() {
  const router = useRouter();
  const { status, user, logout } = useAuth();
  useEffect(() => {
    if (status === "anon") router.replace("/staff/login");
    else if (user && homeFor(user) !== "/staff/no-access") router.replace(homeFor(user));
  }, [status, user, router]);
  if (status !== "authed" || !user) return <Spinner />;
  return (
    <main className="grid min-h-dvh place-items-center bg-bg p-4">
      <Card className="flex w-full max-w-[440px] flex-col items-center gap-4 p-8 text-center">
        <BrandMark size={64} />
        <h1 className="text-heading font-bold">لا توجد شاشات متاحة لدورك</h1>
        <p className="sub">دورك الحالي «{roleMeta(user).label}» لا يملك صلاحية أي قسم في الواجهة. راجع المدير العام لإضافة الصلاحيات المناسبة لدورك.</p>
        <Button size="md" variant="ghost" icon="log-out" onClick={() => void logout()}>تسجيل الخروج</Button>
      </Card>
    </main>
  );
}
