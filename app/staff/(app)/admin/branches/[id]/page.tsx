import type { Metadata } from "next";
import { BranchPage } from "@/components/admin/branches";
export const metadata: Metadata = { title: "الفرع" };
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <BranchPage id={id} />;
}
