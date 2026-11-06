import type { Metadata } from "next";
import { ShiftsReview } from "@/components/accountant/accountant";
export const metadata: Metadata = { title: "مطابقة الحسابات اليومية" };
export default function Page() { return <ShiftsReview />; }
