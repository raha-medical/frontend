import type { Metadata } from "next";
import { Suspense } from "react";
import { Spinner } from "@/components/ui";
import { PharmacyToday } from "@/components/pharmacy/pharmacy";
export const metadata: Metadata = { title: "المصروف اليوم" };
export default function Page() { return <Suspense fallback={<Spinner />}><PharmacyToday /></Suspense>; }
