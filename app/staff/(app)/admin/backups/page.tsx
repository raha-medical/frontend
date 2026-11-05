import type { Metadata } from "next";
import { BackupsScreen } from "@/components/admin/system";
export const metadata: Metadata = { title: "النسخ الاحتياطي" };
export default function Page() { return <BackupsScreen />; }
