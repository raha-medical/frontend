import type { Metadata } from "next";
import { Suspense } from "react";
import { Spinner } from "@/components/ui";
import { CollectScreen } from "@/components/reception/collect-screen";
export const metadata: Metadata = { title: "التحصيل" };
export default function Page() { return <Suspense fallback={<Spinner />}><CollectScreen /></Suspense>; }
