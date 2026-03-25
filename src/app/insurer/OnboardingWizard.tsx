"use client";

import { useEffect, useState } from "react";

type OnboardingData = {
  completed: boolean;
  checklist: {
    profile_complete: boolean;
    contact_info: boolean;
    plan_selected: boolean;
  };
  insurer: {
    name: string;
    contact_email: string | null;
    contact_phone: string | null;
    corporate_number: string | null;
    address: string | null;
    plan_tier: string | null;
  };
};

/**
 * Onboarding wizard shown on first login after insurer approval.
 * Checks /api/insurer/onboarding for completion status.
 * Can be dismissed and marks onboarding as complete.
 */
export default function OnboardingWizard() {
  const [data, setData] = useState<OnboardingData | null>(null);
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/insurer/onboarding");
        if (!res.ok) return;
        const json = await res.json();
        if (!json.completed) {
          setData(json);
          setShow(true);
        }
      } catch {
        // silently skip if API fails
      }
    })();
  }, []);

  const completeOnboarding = async () => {
    setBusy(true);
    try {
      await fetch("/api/insurer/onboarding", { method: "POST" });
      setShow(false);
    } catch {
      setShow(false);
    } finally {
      setBusy(false);
    }
  };

  if (!show || !data) return null;

  const { checklist, insurer } = data;
  const allDone = checklist.profile_complete && checklist.contact_info;

  return (
    <div className="rounded-2xl border border-blue-200 bg-blue-50 p-6 space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-lg font-bold text-blue-900">ようこそ、{insurer.name} 様</h2>
          <p className="text-sm text-blue-700 mt-1">
            初期設定を完了して、CARTRUSTのご利用を開始しましょう。
          </p>
        </div>
        <button
          onClick={completeOnboarding}
          disabled={busy}
          className="text-xs text-blue-500 hover:underline"
        >
          スキップ
        </button>
      </div>

      <div className="space-y-3">
        {/* Profile check */}
        <div className={`flex items-center gap-3 rounded-xl p-3 ${checklist.profile_complete ? "bg-green-50 border border-green-200" : "bg-white border border-blue-100"}`}>
          <div className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${checklist.profile_complete ? "bg-green-200 text-green-800" : "bg-blue-200 text-blue-800"}`}>
            {checklist.profile_complete ? "✓" : "1"}
          </div>
          <div className="flex-1">
            <div className="text-sm font-medium text-neutral-900">プロフィール情報</div>
            <div className="text-xs text-neutral-500">
              {checklist.profile_complete ? "完了" : "会社名・メールアドレスを確認してください"}
            </div>
          </div>
        </div>

        {/* Contact info */}
        <div className={`flex items-center gap-3 rounded-xl p-3 ${checklist.contact_info ? "bg-green-50 border border-green-200" : "bg-white border border-blue-100"}`}>
          <div className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${checklist.contact_info ? "bg-green-200 text-green-800" : "bg-blue-200 text-blue-800"}`}>
            {checklist.contact_info ? "✓" : "2"}
          </div>
          <div className="flex-1">
            <div className="text-sm font-medium text-neutral-900">連絡先情報</div>
            <div className="text-xs text-neutral-500">
              {checklist.contact_info ? "完了" : "電話番号を登録してください"}
            </div>
          </div>
        </div>

        {/* Plan selection */}
        <div className={`flex items-center gap-3 rounded-xl p-3 ${checklist.plan_selected ? "bg-green-50 border border-green-200" : "bg-white border border-blue-100"}`}>
          <div className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${checklist.plan_selected ? "bg-green-200 text-green-800" : "bg-blue-200 text-blue-800"}`}>
            {checklist.plan_selected ? "✓" : "3"}
          </div>
          <div className="flex-1">
            <div className="text-sm font-medium text-neutral-900">プラン選択</div>
            <div className="text-xs text-neutral-500">
              {checklist.plan_selected
                ? `${insurer.plan_tier} プラン`
                : "有料プランを選択すると、CSV/PDF出力やユーザー一括登録が利用可能になります"}
            </div>
          </div>
          {!checklist.plan_selected && (
            <a
              href="/api/insurer/billing"
              onClick={(e) => {
                e.preventDefault();
                // Trigger billing flow from parent page
                const btn = document.querySelector("[data-billing-trigger]");
                if (btn instanceof HTMLElement) btn.click();
              }}
              className="text-xs text-blue-600 hover:underline"
            >
              プランを選択
            </a>
          )}
        </div>
      </div>

      {allDone && (
        <button
          onClick={completeOnboarding}
          disabled={busy}
          className="w-full rounded-xl bg-blue-600 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {busy ? "..." : "初期設定を完了する"}
        </button>
      )}
    </div>
  );
}
