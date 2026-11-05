import type { Metadata } from "next";
import { StatementScreen } from "@/components/accountant/entitlements";
export const metadata: Metadata = { title: "الكشوفات" };
export default function Page() { return <StatementScreen />; }
