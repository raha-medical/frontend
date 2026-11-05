import type { Metadata } from "next";
import { BranchPage } from "@/components/admin/branches";
export const metadata: Metadata = { title: "فرع جديد" };
export default function Page() { return <BranchPage id={null} />; }
