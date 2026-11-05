"use client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth/store";
import { PwaRegister } from "./pwa-register";
import { ToastHost } from "./toast";

export function Providers({ children }: { children: React.ReactNode }) {
  const [qc] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 15_000,
        refetchOnWindowFocus: false,
        // لا نعيد المحاولة على أخطاء العميل 4xx؛ الشبكة تُعاد مرتين
        retry: (n, e: any) => (e?.status >= 400 && e?.status < 500 ? false : n < 2),
        networkMode: "offlineFirst",
      },
    },
  }));
  const hydrate = useAuth((s) => s.hydrate);
  useEffect(() => { void hydrate(); }, [hydrate]);
  return (
    <QueryClientProvider client={qc}>
      {children}
      <PwaRegister />
      <ToastHost />
    </QueryClientProvider>
  );
}
