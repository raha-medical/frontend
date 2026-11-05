import type { Metadata } from "next";
import { EntitlementsScreen } from "@/components/accountant/entitlements";
export const metadata: Metadata = { title: "المستحقات والصرف" };
export default function Page() { return <EntitlementsScreen />; }
