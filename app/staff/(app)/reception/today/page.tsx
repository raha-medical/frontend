import type { Metadata } from "next";
import { TodayScreen } from "@/components/reception/today-screen";
export const metadata: Metadata = { title: "مراجعو اليوم" };
export default function Page() { return <TodayScreen />; }
