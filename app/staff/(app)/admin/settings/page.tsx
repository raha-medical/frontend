import type { Metadata } from "next";
import { SettingsScreen } from "@/components/admin/system";
export const metadata: Metadata = { title: "الإعدادات" };
export default function Page() { return <SettingsScreen />; }
