import type { Metadata } from "next";
import { AuditScreen } from "@/components/accountant/accountant";
export const metadata: Metadata = { title: "سجل التدقيق" };
export default function Page() { return <AuditScreen />; }
