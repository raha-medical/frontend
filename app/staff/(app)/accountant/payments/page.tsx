import type { Metadata } from "next";
import { PaymentsScreen } from "@/components/accountant/entitlements";
export const metadata: Metadata = { title: "المدفوعات" };
export default function Page() { return <PaymentsScreen />; }
