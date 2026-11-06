import type { Metadata } from "next";
import { PharmacyExternal } from "@/components/pharmacy/billing";
export const metadata: Metadata = { title: "مراجع خارجي" };
export default function Page() { return <PharmacyExternal />; }
