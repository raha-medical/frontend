import type { Metadata } from "next";
import { RefundApprovals } from "@/components/accountant/accountant";
export const metadata: Metadata = { title: "اعتماد الاسترجاع" };
export default function Page() { return <RefundApprovals />; }
