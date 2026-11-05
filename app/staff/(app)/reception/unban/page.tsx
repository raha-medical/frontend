import type { Metadata } from "next";
import { Suspense } from "react";
import { Spinner } from "@/components/ui";
import { UnbanScreen } from "@/components/reception/unban-screen";
export const metadata: Metadata = { title: "فك الحظر" };
export default function Page() { return <Suspense fallback={<Spinner />}><UnbanScreen /></Suspense>; }
