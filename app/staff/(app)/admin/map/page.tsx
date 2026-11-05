import type { Metadata } from "next";
import { BranchMapScreen } from "@/components/admin/overview";
export const metadata: Metadata = { title: "خريطة الفروع" };
export default function Page() { return <BranchMapScreen />; }
