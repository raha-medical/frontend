import type { Metadata } from "next";
import { RoleForm } from "@/components/admin/roles";
export const metadata: Metadata = { title: "دور جديد" };
export default function Page() { return <RoleForm code={null} />; }
