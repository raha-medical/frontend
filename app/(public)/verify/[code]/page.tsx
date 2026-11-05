import { VerifyReceipt } from "@/components/landing/verify-receipt";
export const metadata = { title: "التحقق من إيصال" };
export default async function Page({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <VerifyReceipt code={decodeURIComponent(code)} />;
}
