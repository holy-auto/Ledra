"use client";

/**
 * ホーム画面の 3 段階スコープ切替（IMP-021）。
 *
 * IMP-020 の SegmentedControl を使い、URL searchParams `scope` を更新して
 * サーバ側で再描画する。旧 TodayTasksScopeToggle（2 段階）の後継。
 *
 * ponytail: ダッシュボードはサーバコンポーネントなので URL params で状態管理。
 * WorkScopeProvider は将来のクライアント主導ページ向け。
 */

import { useRouter, useSearchParams } from "next/navigation";
import SegmentedControl, { type SegmentItem } from "@/components/ui/SegmentedControl";
import type { WorkScope } from "@/lib/navigation/scope";
import { WORK_SCOPE_LABELS } from "@/lib/navigation/scope";

export default function HomeScopeToggle({
  scope,
  scopes,
  defaultScopeValue,
}: {
  scope: WorkScope;
  scopes: readonly WorkScope[];
  /** サーバ側で解決したデフォルトスコープ。このスコープ選択時は URL param を消す。 */
  defaultScopeValue: WorkScope;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // 選択肢が 1 つしかなければ表示しない（viewer）。
  if (scopes.length <= 1) return null;

  const items: SegmentItem<WorkScope>[] = scopes.map((k) => ({
    key: k,
    label: WORK_SCOPE_LABELS[k],
  }));

  const setScope = (next: WorkScope) => {
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    params.delete("tasks"); // 旧パラメータ削除
    if (next === defaultScopeValue) {
      params.delete("scope");
    } else {
      params.set("scope", next);
    }
    const qs = params.toString();
    router.replace(qs ? `/admin?${qs}` : "/admin", { scroll: false });
  };

  return <SegmentedControl items={items} value={scope} onChange={setScope} size="sm" ariaLabel="表示範囲" />;
}
