import type { Metadata } from "next";
import { PatientApp } from "@/components/patient/app";
export const metadata: Metadata = { title: "تطبيق المريض" };
export default function Page() { return <PatientApp />; }
