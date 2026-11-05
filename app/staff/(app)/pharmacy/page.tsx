"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Spinner } from "@/components/ui";
import { useAuth } from "@/lib/auth/store";
import { sectionHome } from "@/lib/roles";
export default function Page() {
  const user = useAuth((s) => s.user);
  const router = useRouter();
  useEffect(() => { if (user) router.replace(sectionHome(user, "pharmacy")); }, [user, router]);
  return <Spinner />;
}
