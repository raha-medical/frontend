"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Spinner } from "@/components/ui";
import { useAuth } from "@/lib/auth/store";
import { homeFor } from "@/lib/roles";
export default function Page() {
  const user = useAuth((s) => s.user);
  const router = useRouter();
  useEffect(() => { if (user) router.replace(homeFor(user)); }, [user, router]);
  return <Spinner />;
}
