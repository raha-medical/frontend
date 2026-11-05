import type { Metadata } from "next";
import { Suspense } from "react";
import { Spinner } from "@/components/ui";
import { NotificationCenter } from "@/components/staff/notifications";
export const metadata: Metadata = { title: "الإشعارات" };
export default function Page() { return <Suspense fallback={<Spinner />}><NotificationCenter /></Suspense>; }
