"use client";

/**
 * ワークスコープの React Context（IMP-021）。
 *
 * ダッシュボードや一覧画面で「自分 / 店舗 / 全店舗」のデータ表示範囲を
 * クライアント側で共有するための薄い Context。
 *
 * 状態管理は URL searchParams (`scope` パラメータ) を真実源とし、
 * router.replace で更新する。サーバコンポーネントは searchParams から
 * 直接読めるので、この Provider は同一ページ内の複数クライアントコンポーネントが
 * スコープを共有する場合にのみ使う。
 *
 * ponytail: all_stores は store と同挙動（単一店舗前提）。多店舗対応時に分岐を追加。
 */

import { createContext, useContext, useCallback, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { WorkScope } from "./scope";
import { availableScopes, defaultScope, WORK_SCOPE_LABELS } from "./scope";
import { useCurrentRole } from "@/lib/auth/useCurrentRole";

interface WorkScopeContextValue {
  scope: WorkScope;
  setScope: (s: WorkScope) => void;
  scopes: readonly WorkScope[];
  labels: Record<WorkScope, string>;
}

const WorkScopeContext = createContext<WorkScopeContextValue | null>(null);

/** URL の `scope` パラメータから WorkScope を安全にパースする。 */
function parseScope(raw: string | null, allowed: readonly WorkScope[]): WorkScope | null {
  if (!raw) return null;
  return allowed.includes(raw as WorkScope) ? (raw as WorkScope) : null;
}

export function WorkScopeProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { role, loading } = useCurrentRole();

  const effectiveRole = role ?? "viewer";
  const scopes = loading ? (["self", "store", "all_stores"] as const) : availableScopes(effectiveRole);
  const fallback = loading ? "store" : defaultScope(effectiveRole);
  const scope = parseScope(searchParams?.get("scope") ?? null, scopes) ?? fallback;

  const setScope = useCallback(
    (next: WorkScope) => {
      const params = new URLSearchParams(searchParams?.toString() ?? "");
      // ponytail: デフォルトスコープなら param を消す（URL を綺麗に保つ）。
      if (next === fallback) {
        params.delete("scope");
      } else {
        params.set("scope", next);
      }
      const qs = params.toString();
      router.replace(qs ? `?${qs}` : window.location.pathname, { scroll: false });
    },
    [router, searchParams, fallback],
  );

  return (
    <WorkScopeContext.Provider value={{ scope, setScope, scopes, labels: WORK_SCOPE_LABELS }}>
      {children}
    </WorkScopeContext.Provider>
  );
}

export function useWorkScope(): WorkScopeContextValue {
  const ctx = useContext(WorkScopeContext);
  if (!ctx) throw new Error("useWorkScope must be used within WorkScopeProvider");
  return ctx;
}
