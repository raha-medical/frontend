import type { Metadata } from "next";
import { DashScreen } from "@/components/accountant/accountant";
export const metadata: Metadata = { title: "لوحة الفروع" };
export default function Page() { return <DashScreen />; }
