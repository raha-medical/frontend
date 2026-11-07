import type { Metadata } from "next";
import { PharmacyExternal } from "@/components/pharmacy/billing";
import { Suspense } from "react";
import { Spinner } from "@/components/ui";
export const metadata: Metadata = { title: "مراجع خارجي" };
export default function Page() { return <Suspense fallback={<Spinner />}><PharmacyExternal /></Suspense>; }
