import type { Metadata } from "next";
import { CurrenciesScreen } from "@/components/admin/currencies";
export const metadata: Metadata = { title: "العملات" };
export default function Page() { return <CurrenciesScreen />; }
