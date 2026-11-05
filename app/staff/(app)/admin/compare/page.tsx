import type { Metadata } from "next";
import { BranchCompareScreen } from "@/components/admin/overview";
export const metadata: Metadata = { title: "مقارنة الفروع" };
export default function Page() { return <BranchCompareScreen />; }
