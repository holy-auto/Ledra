"use client";

import { ReactNode, useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */
type AgentStatus = {
  agent_id: string;
  agent_name: string;
  status: string; // "active" | "suspended" | "pending_review" etc.
};

/* ------------------------------------------------------------------ */
/*  AgentRouteGuard                                                    */
/* ------------------------------------------------------------------ */
export default function AgentRouteGuard({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [state, setState] = useState<"loading" | "ok" | "suspended" | "pending">("loading");
  const [checked, setChecked] = useState(false);

  // Don't guard the login page — it must render without auth
  const isLoginPage = pathname === "/agent/login";

  useEffect(() => {
    if (isLoginPage) return;
    let cancelled = false;

    (async () => {
      try {
        const supabase = createClient();

        // 1. Check auth session
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!session) {
          router.replace("/agent/login");
          return;
        }

        // 2. Check agent status via RPC
        //    get_my_agent_status を使い、user_id ベースで代理店を確認
        const { data, error } = await supabase.rpc("get_my_agent_status");

        if (cancelled) return;

        if (error || !data?.agent_id) {
          // Not an agent user — redirect to login
          router.replace("/agent/login");
          return;
        }

        const status = (data as AgentStatus).status;

        if (status === "suspended") {
          setState("suspended");
        } else if (status === "pending_review") {
          setState("pending");
        } else {
          setState("ok");
        }
      } catch {
        if (!cancelled) {
          router.replace("/agent/login");
        }
      } finally {
        if (!cancelled) {
          setChecked(true);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [router, isLoginPage]);

  // Login page — render children directly without guard
  if (isLoginPage) {
    return <>{children}</>;
  }

  // Still loading — show nothing to avoid flash
  if (!checked || state === "loading") {
    return null;
  }

  // Suspended — block access entirely
  if (state === "suspended") {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="glass-card max-w-md p-6 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-500/10">
            <svg
              width="24"
              height="24"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
              className="text-red-400"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
              />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-primary">アカウントが停止されています</h2>
          <p className="mt-2 text-sm text-muted">
            お客様のエージェントアカウントは現在停止中です。詳細については管理者にお問い合わせください。
          </p>
          <button
            type="button"
            onClick={async () => {
              try {
                const supabase = createClient();
                await supabase.auth.signOut();
                try {
                  sessionStorage.clear();
                } catch {
                  /* ignore */
                }
              } catch {
                /* ignore */
              }
              window.location.replace("/agent/login");
            }}
            className="btn-primary mt-6"
          >
            ログアウト
          </button>
        </div>
      </div>
    );
  }

  // Pending review — show banner but allow access
  if (state === "pending") {
    return (
      <div className="space-y-4">
        <div className="glass-card glow-amber p-4 text-sm">
          <div className="flex items-center gap-2">
            <svg
              width="18"
              height="18"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
              className="shrink-0 text-amber-400"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
            </svg>
            <span className="font-semibold text-amber-400">アカウント審査中</span>
          </div>
          <p className="mt-1.5 text-muted">
            お客様のエージェントアカウントは現在審査中です。審査完了まで一部の機能が制限される場合があります。
          </p>
        </div>
        {children}
      </div>
    );
  }

  // Active — render children normally
  return <>{children}</>;
}
