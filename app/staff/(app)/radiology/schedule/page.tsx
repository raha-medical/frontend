import type { Metadata } from "next";
import { Suspense } from "react";
import { Spinner } from "@/components/ui";
import { RadiologySchedule } from "@/components/radiology/radiology";
export const metadata: Metadata = { title: "مواعيد الأشعة" };
export default function Page() { return <Suspense fallback={<Spinner />}><RadiologySchedule /></Suspense>; }
