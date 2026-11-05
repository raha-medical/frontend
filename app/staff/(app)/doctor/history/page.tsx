import type { Metadata } from "next";
import { Suspense } from "react";
import { Spinner } from "@/components/ui";
import { DoctorHistory } from "@/components/doctor/doctor";
export const metadata: Metadata = { title: "سجل المريض" };
export default function Page() { return <Suspense fallback={<Spinner />}><DoctorHistory /></Suspense>; }
