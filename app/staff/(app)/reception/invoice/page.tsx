import type { Metadata } from "next";
import { Suspense } from "react";
import { Spinner } from "@/components/ui";
import { InvoiceScreen } from "@/components/reception/invoice-screen";
export const metadata: Metadata = { title: "طلب مباشر" };
export default function Page() { return <Suspense fallback={<Spinner />}><InvoiceScreen /></Suspense>; }
