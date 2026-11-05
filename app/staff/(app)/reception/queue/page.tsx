import type { Metadata } from "next";
import { QueueScreen } from "@/components/reception/queue-screen";
export const metadata: Metadata = { title: "الطابور الحي" };
export default function Page() { return <QueueScreen />; }
