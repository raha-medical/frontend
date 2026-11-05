import type { Metadata } from "next";
import { ServicesScreen } from "@/components/admin/doctors-services";
export const metadata: Metadata = { title: "الخدمات" };
export default function Page() { return <ServicesScreen />; }
