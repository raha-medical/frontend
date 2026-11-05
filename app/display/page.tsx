import type { Metadata } from "next";
import { DisplayScreen } from "@/components/display/display";
export const metadata: Metadata = { title: "شاشة الانتظار" };
export default function Page() { return <DisplayScreen />; }
