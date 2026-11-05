import type { Metadata } from "next";
import { InvoicesScreen } from "@/components/accountant/accountant";
export const metadata: Metadata = { title: "الفواتير" };
export default function Page() { return <InvoicesScreen />; }
