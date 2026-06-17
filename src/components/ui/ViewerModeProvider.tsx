"use client";

import { useEffect, useState } from "react";
import { ViewerModeContext } from "./ViewerModeContext";
import { normalizeRole, type Role } from "@/lib/auth/roles";

/**
 * ViewerModeProvider
 * ------------------------------------------------------------
 * `/api/admin/me` から現在ユーザのロールを取得し、ViewerModeContext を
 * 配下に供給する。admin レイアウトの最上位付近で 1 度だけマウントする想定。
 *
 * - 取得は 1 回だけ。結果はモジュールレベルにキャッシュして、画面遷移
 *   (Provider 再マウント) ごとの再取得を避ける。
 * - 取得失敗時 role は null のまま (MutationGuard 側で「権限不明」を
 *   どう扱うかを決める。既定では最低ロール未満として扱い、安全側に倒す)。
 */

// 画面遷移をまたいで保持するモジュールレベルキャッシュ。
let cachedRole: Role | null = null;
let inflight: Promise<Role | null> | null = null;

async function fetchRole(): Promise<Role | null> {
  try {
    const res = await fetch("/api/admin/me", { cache: "no-store" });
    if (!res.ok) return null;
    const json = (await res.json()) as { role?: unknown };
    if (json?.role == null) return null;
    return normalizeRole(json.role);
  } catch {
    return null;
  }
}

export function ViewerModeProvider({ children }: { children: React.ReactNode }) {
  const [role, setRole] = useState<Role | null>(cachedRole);
  const [loading, setLoading] = useState<boolean>(cachedRole == null);

  useEffect(() => {
    let active = true;
    if (cachedRole != null) {
      // 既にキャッシュ済み: 取得不要。
      setLoading(false);
      return;
    }
    if (!inflight) inflight = fetchRole();
    inflight
      .then((resolved) => {
        cachedRole = resolved;
        if (active) {
          setRole(resolved);
          setLoading(false);
        }
      })
      .finally(() => {
        inflight = null;
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <ViewerModeContext.Provider value={{ role, isViewer: role === "viewer", loading }}>
      {children}
    </ViewerModeContext.Provider>
  );
}
