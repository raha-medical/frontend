import type { Metadata } from "next";
import { Suspense } from "react";
import { Spinner } from "@/components/ui";
import { PharmacyScan } from "@/components/pharmacy/pharmacy";
export const metadata: Metadata = { title: "صرف وصفة" };
export default function Page() { return <Suspense fallback={<Spinner />}><PharmacyScan /></Suspense>; }
