import type { Metadata } from "next";
import { Suspense } from "react";
import { Spinner } from "@/components/ui";
import { RadiologyScreen } from "@/components/radiology/radiology";
export const metadata: Metadata = { title: "الأشعة والسونار" };
export default function Page() { return <Suspense fallback={<Spinner />}><RadiologyScreen /></Suspense>; }
