import type { Metadata } from "next";
import { ExpensesScreen } from "@/components/accountant/accountant";
export const metadata: Metadata = { title: "المصاريف" };
export default function Page() { return <ExpensesScreen />; }
