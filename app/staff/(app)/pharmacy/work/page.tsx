import type { Metadata } from "next";
import { Suspense } from "react";
import { Spinner } from "@/components/ui";
import { PharmacyWork } from "@/components/pharmacy/pharmacy";
export const metadata: Metadata = { title: "قائمة عمل الصيدلية" };
export default function Page() { return <Suspense fallback={<Spinner />}><PharmacyWork /></Suspense>; }
