import type { Metadata } from "next";
import { UsersScreen } from "@/components/admin/users";
export const metadata: Metadata = { title: "المستخدمون" };
export default function Page() { return <UsersScreen />; }
