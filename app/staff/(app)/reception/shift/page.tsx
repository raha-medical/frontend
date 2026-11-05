import type { Metadata } from "next";
import { Suspense } from "react";
import { Spinner } from "@/components/ui";
import { ShiftScreen } from "@/components/reception/shift-screen";
export const metadata: Metadata = { title: "الوردية" };
export default function Page() { return <Suspense fallback={<Spinner />}><ShiftScreen /></Suspense>; }
