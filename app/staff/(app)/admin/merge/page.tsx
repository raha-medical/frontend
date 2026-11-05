import type { Metadata } from "next";
import { Suspense } from "react";
import { MergeScreen } from "@/components/admin/system";
export const metadata: Metadata = { title: "دمج الملفات" };
export default function Page() { return <Suspense><MergeScreen /></Suspense>; }
