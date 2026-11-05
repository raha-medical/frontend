import type { Metadata } from "next";
import { SyncScreen } from "@/components/reception/sync-screen";
export const metadata: Metadata = { title: "المزامنة" };
export default function Page() { return <SyncScreen />; }
