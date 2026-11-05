import type { Metadata } from "next";
import { DevicesScreen } from "@/components/admin/system";
export const metadata: Metadata = { title: "الأجهزة" };
export default function Page() { return <DevicesScreen />; }
