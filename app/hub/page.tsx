import type { Metadata } from "next";
import { SystemHub } from "@/components/hub/hub";

export const metadata: Metadata = { title: "كل الأقسام" };

export default function HubPage() {
  return <SystemHub />;
}
