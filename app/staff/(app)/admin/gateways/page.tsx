import type { Metadata } from "next";
import { GatewaysScreen } from "@/components/admin/currencies";
export const metadata: Metadata = { title: "بوابات الدفع" };
export default function Page() { return <GatewaysScreen />; }
