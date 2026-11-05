import type { Metadata } from "next";
import { Suspense } from "react";
import { Spinner } from "@/components/ui";
import { DoctorConsult } from "@/components/doctor/doctor";
export const metadata: Metadata = { title: "المعاينة" };
export default function Page() { return <Suspense fallback={<Spinner />}><DoctorConsult /></Suspense>; }
