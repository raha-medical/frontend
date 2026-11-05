import type { Metadata } from "next";
import { EarningsScreen } from "@/components/accountant/accountant";
export const metadata: Metadata = { title: "أرباح الأطباء" };
export default function Page() { return <EarningsScreen />; }
