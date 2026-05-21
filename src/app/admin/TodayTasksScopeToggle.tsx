"use client";

import { useRouter, useSearchParams } from "next/navigation";

/**
 * 今日のタスクの「あなた担当のみ / 店舗全体」切替トグル。
 *
 * URL search param `tasks` (= "mine" | "team") を更新して、サーバ側で再描画する。
 * SetupChecklist などの他コンポーネントには影響しない。
 */
export default function TodayTasksScopeToggle({ scope }: { scope: "tenant" | "mine" }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const setScope = (next: "tenant" | "mine") => {
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    if (next === "mine") params.set("tasks", "mine");
    else params.delete("tasks");
    const qs = params.toString();
    router.replace(qs ? `/admin?${qs}` : "/admin", { scroll: false });
  };

  return (
    <div
      role="tablist"
      aria-label="タスクの表示範囲"
      className="inline-flex rounded-md border border-border-default bg-surface p-0.5 text-[11px]"
    >
      <button
        type="button"
        role="tab"
        aria-selected={scope === "mine"}
        onClick={() => setScope("mine")}
        className={`px-2.5 py-1 rounded-[5px] transition-colors ${
          scope === "mine" ? "bg-accent text-white" : "text-secondary hover:text-primary"
        }`}
      >
        あなた担当
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={scope === "tenant"}
        onClick={() => setScope("tenant")}
        className={`px-2.5 py-1 rounded-[5px] transition-colors ${
          scope === "tenant" ? "bg-accent text-white" : "text-secondary hover:text-primary"
        }`}
      >
        店舗全体
      </button>
    </div>
  );
}
