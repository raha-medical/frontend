import type { Metadata } from "next";
import { UserFormPage } from "@/components/admin/users";
export const metadata: Metadata = { title: "موظف جديد" };
export default function Page() { return <UserFormPage id={null} />; }
