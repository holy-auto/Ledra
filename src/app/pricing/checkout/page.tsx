"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { siteConfig } from "@/lib/marketing/config";

const VALID_PLANS = ["standard", "pro"] as const;
type UpgradePlan = (typeof VALID_PLANS)[number];

export default function PricingCheckoutPage() {
  const searchParams = useSearchParams();
  const plan = searchParams.get("plan") as UpgradePlan | null;
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!plan || !(VALID_PLANS as readonly string[]).includes(plan)) {
      window.location.href = "/pricing";
      return;
    }

    (async () => {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        const redirectTo = `/pricing/checkout?plan=${plan}`;
        window.location.href = `${siteConfig.loginUrl}?next=${encodeURIComponent(redirectTo)}`;
        return;
      }

      const res = await fetch("/api/stripe/upgrade", {
        method: "POST",
        headers: { "content-type": "application/json; charset=utf-8" },
        body: JSON.stringify({ access_token: session.access_token, plan_tier: plan }),
        cache: "no-store",
      });

      const j = await res.json().catch(() => null);
      if (!res.ok || !j?.url) {
        setError(j?.error ?? "エラーが発生しました");
        return;
      }

      window.location.href = j.url;
    })();
  }, [plan]);

  if (error) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-6">
        <p className="text-sm text-zinc-600">エラー: {error}</p>
        <a href="/pricing" className="rounded-full border border-zinc-200 px-6 py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50">
          料金ページに戻る
        </a>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 px-6">
      <svg className="h-6 w-6 animate-spin text-zinc-400" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
      </svg>
      <p className="text-sm text-zinc-500">決済ページへ移動しています…</p>
    </main>
  );
}
