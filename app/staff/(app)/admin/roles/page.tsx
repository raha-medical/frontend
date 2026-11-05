import type { Metadata } from "next";
import { RolesScreen } from "@/components/admin/roles";
export const metadata: Metadata = { title: "الأدوار والصلاحيات" };
export default function Page() { return <RolesScreen />; }
