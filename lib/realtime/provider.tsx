"use client";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { staffApi } from "../api/staff";
import { useAuth } from "../auth/store";
import { LiveConnection, type LiveState } from "./live";

interface Ctx { live: LiveConnection | null; state: LiveState }
const LiveCtx = createContext<Ctx>({ live: null, state: "idle" });
export const useLive = () => useContext(LiveCtx);

/** يفتح الاتصال اللحظي للموظف المسجّل ويغلقه عند الخروج. */
export function LiveProvider({ children }: { children: React.ReactNode }) {
  const authed = useAuth((s) => s.status === "authed" && !s.user?.must_change_password);
  const branchId = useAuth((s) => s.user?.branch_id);
  const [state, setState] = useState<LiveState>("idle");
  const live = useMemo(() => (authed && typeof window !== "undefined" ? new LiveConnection(() => staffApi.getFreshAccessToken()) : null), [authed, branchId]);

  useEffect(() => {
    if (!live) return;
    const off = live.onState(setState);
    live.start();
    return () => { off(); live.stop(); };
  }, [live]);

  return <LiveCtx.Provider value={{ live, state }}>{children}</LiveCtx.Provider>;
}
