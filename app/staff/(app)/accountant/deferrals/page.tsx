import type { Metadata } from "next";
import { DeferralsScreen } from "@/components/accountant/accountant";
export const metadata: Metadata = { title: "الذمم الآجلة" };
export default function Page() { return <DeferralsScreen />; }
