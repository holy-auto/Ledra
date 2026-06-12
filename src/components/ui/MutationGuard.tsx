"use client";

import { useViewerMode } from "@/hooks/useViewerMode";
import { hasMinRole, type Role } from "@/lib/auth/roles";

/**
 * MutationGuard
 * ------------------------------------------------------------
 * 変更系 UI (POST/PUT/PATCH/DELETE を発火するボタン等) を、最低ロールを
 * 満たすユーザにだけ表示するラッパー。閲覧専用 (viewer) ユーザには
 * children を見せず、代わりに `fallback` (既定 null) を描画する。
 *
 * 設計方針 (安全側に倒す):
 *   - ロール取得中 (loading) は children を出さない。viewer に対する
 *     変更ボタンの一瞬の表示 (フラッシュ) を防ぐ。`fallback` があれば
 *     それを描画する。
 *   - ロール取得に失敗 (role === null) した場合も最低ロール未満として扱う。
 *
 * これは UI 上のガードであり、本当の権限境界はサーバ側 (RLS /
 * requireMinRole) が担保する。ここで隠しても API は別途検証する。
 *
 * @example
 * <MutationGuard>
 *   <button onClick={save}>保存</button>
 * </MutationGuard>
 *
 * @example minRole とフォールバックを指定
 * <MutationGuard minRole="admin" fallback={<span className="text-muted text-xs">権限がありません</span>}>
 *   <button onClick={remove}>削除</button>
 * </MutationGuard>
 */
interface MutationGuardProps {
  children: React.ReactNode;
  /** 表示に必要な最低ロール。既定 "staff"。 */
  minRole?: Role;
  /** 権限不足時に描画する代替要素。既定 null (何も描画しない)。 */
  fallback?: React.ReactNode;
}

export default function MutationGuard({ children, minRole = "staff", fallback = null }: MutationGuardProps) {
  const { role, loading } = useViewerMode();

  // ロール未解決 (取得中 / 失敗) は権限なしとして扱う。
  const allowed = role != null && hasMinRole(role, minRole);

  if (loading || !allowed) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}
