import type { Metadata } from "next";
import { SupportRequestsScreen } from "@/components/admin/support";
export const metadata: Metadata = { title: "طلبات الدعم" };
export default function Page() { return <SupportRequestsScreen />; }
