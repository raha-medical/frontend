import type { Metadata } from "next";
import { NoShowsScreen } from "@/components/accountant/accountant";
export const metadata: Metadata = { title: "الغياب والحظر" };
export default function Page() { return <NoShowsScreen />; }
