import type { Metadata } from "next";
import { Suspense } from "react";
import { Spinner } from "@/components/ui";
import { RefundsScreen } from "@/components/reception/refunds-screen";
export const metadata: Metadata = { title: "الاسترجاع" };
export default function Page() { return <Suspense fallback={<Spinner />}><RefundsScreen /></Suspense>; }
