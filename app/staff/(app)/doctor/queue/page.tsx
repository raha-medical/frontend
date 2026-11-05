import type { Metadata } from "next";
import { Suspense } from "react";
import { Spinner } from "@/components/ui";
import { DoctorQueue } from "@/components/doctor/doctor";
export const metadata: Metadata = { title: "طابوري" };
export default function Page() { return <Suspense fallback={<Spinner />}><DoctorQueue /></Suspense>; }
