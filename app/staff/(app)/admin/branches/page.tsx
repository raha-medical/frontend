import type { Metadata } from "next";
import { BranchesScreen } from "@/components/admin/branches";
export const metadata: Metadata = { title: "الفروع" };
export default function Page() { return <BranchesScreen />; }
