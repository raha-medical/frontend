import type { Metadata } from "next";
import { Suspense } from "react";
import { Spinner } from "@/components/ui";
import { LabScreen } from "@/components/lab/lab";
export const metadata: Metadata = { title: "المختبر" };
export default function Page() { return <Suspense fallback={<Spinner />}><LabScreen /></Suspense>; }
