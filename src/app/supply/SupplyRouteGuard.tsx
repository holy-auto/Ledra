"use client";

import { ReactNode, useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * 供給パートナーポータルのルートガード。
 * AgentRouteGuard と同じ思想だが、状態確認は RPC ではなく /api/supply/profile を叩く。
 *  - 未ログイン → /supply/login
 *  - パートナー未登録 → /supply/register
 *  - suspended → 全面ブロック
 *  - 審査中 (active_pending_review) → バナー表示しつつ閲覧は許可
 */
export default function SupplyRouteGuard({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [state, setState] = useState<"loading" | "ok" | "suspended" | "pending">("loading");
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const supabase = createClient();
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!session) {
          router.replace("/supply/login");
          return;
        }

        const res = await fetch("/api/supply/profile", { cache: "no-store" });
        if (cancelled) return;
        const j = await res.json().catch(() => null);

        if (!res.ok || !j?.ok) {
          router.replace("/supply/login");
          return;
        }
        if (!j.partner) {
          // ログイン済みだがパートナー未登録 → 登録へ
          router.replace("/supply/register");
          return;
        }

        const status = j.partner.status as string;
        if (status === "suspended") {
          setState("suspended");
        } else if (status === "active_pending_review") {
          setState("pending");
        } else {
          setState("ok");
        }
      } catch {
        if (!cancelled) router.replace("/supply/login");
      } finally {
        if (!cancelled) setChecked(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [router, pathname]);

  if (!checked || state === "loading") {
    return null;
  }

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
            このパートナーアカウントは現在停止中です。詳細は運営にお問い合わせください。
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
              window.location.replace("/supply/login");
            }}
            className="btn-primary mt-6"
          >
            ログアウト
          </button>
        </div>
      </div>
    );
  }

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
            このパートナーアカウントは現在審査中です。商材・連絡先・API 設定の登録は今のうちに進められます。
            店舗からの提携・発注は審査完了後に有効になります。
          </p>
        </div>
        {children}
      </div>
    );
  }

  return <>{children}</>;
}
