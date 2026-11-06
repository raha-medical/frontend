import type { Metadata } from "next";
import { StatsScreen } from "@/components/admin/stats";
export const metadata: Metadata = { title: "لوحة الإحصائيات" };
export default function Page() { return <StatsScreen />; }
