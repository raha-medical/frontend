import type { Metadata } from "next";
import { RevenueScreen } from "@/components/accountant/accountant";
export const metadata: Metadata = { title: "الإيراد" };
export default function Page() { return <RevenueScreen />; }
