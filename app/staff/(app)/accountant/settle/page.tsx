import type { Metadata } from "next";
import { SettlementsScreen } from "@/components/accountant/accountant";
export const metadata: Metadata = { title: "تسويات الفروع" };
export default function Page() { return <SettlementsScreen />; }
