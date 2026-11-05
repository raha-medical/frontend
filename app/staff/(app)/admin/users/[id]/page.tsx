import type { Metadata } from "next";
import { UserFormPage } from "@/components/admin/users";
export const metadata: Metadata = { title: "تعديل موظف" };
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <UserFormPage id={id} />;
}
