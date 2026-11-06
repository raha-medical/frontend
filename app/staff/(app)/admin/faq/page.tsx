import type { Metadata } from "next";
import { FaqScreen } from "@/components/admin/support";
export const metadata: Metadata = { title: "الأسئلة الشائعة" };
export default function Page() { return <FaqScreen />; }
