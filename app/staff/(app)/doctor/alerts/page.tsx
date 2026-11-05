import type { Metadata } from "next";
import { Suspense } from "react";
import { Spinner } from "@/components/ui";
import { DoctorAlerts } from "@/components/doctor/doctor";
export const metadata: Metadata = { title: "الإشعارات" };
export default function Page() { return <Suspense fallback={<Spinner />}><DoctorAlerts /></Suspense>; }
