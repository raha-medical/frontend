import type { Metadata } from "next";
import { CheckinScreen } from "@/components/reception/checkin-screen";
export const metadata: Metadata = { title: "حضور وتسجيل" };
export default function Page() { return <CheckinScreen />; }
