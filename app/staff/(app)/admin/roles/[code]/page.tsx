import type { Metadata } from "next";
import { RoleForm } from "@/components/admin/roles";
export const metadata: Metadata = { title: "تعديل دور" };
export default async function Page({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <RoleForm code={decodeURIComponent(code)} />;
}
