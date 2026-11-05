import type { Metadata } from "next";
import { DoctorsScreen } from "@/components/admin/doctors-services";
export const metadata: Metadata = { title: "الأطباء" };
export default function Page() { return <DoctorsScreen />; }
