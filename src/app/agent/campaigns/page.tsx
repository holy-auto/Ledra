"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import Badge from "@/components/ui/Badge";
import { formatDate, formatJpy } from "@/lib/format";
import type { BadgeVariant } from "@/lib/statusMaps";

type Campaign = {
  id: string;
  title: string;
  description: string | null;
  campaign_type: string;
  bonus_rate: number | null;
  bonus_fixed: number | null;
  start_date: string;
  end_date: string;
  banner_text: string | null;
};

const TYPE_MAP: Record<string, { variant: BadgeVariant; label: string }> = {
  commission_boost: { variant: "success", label: "コミッションUP" },
  bonus: { variant: "violet", label: "ボーナス" },
  referral_bonus: { variant: "info", label: "紹介ボーナス" },
  other: { variant: "default", label: "その他" },
};

export default function AgentCampaignsPage() {
  const supabase = useMemo(() => createClient(), []);
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState<Campaign[]>([]);
  const [upcoming, setUpcoming] = useState<Campaign[]>([]);
  const [past, setPast] = useState<Campaign[]>([]);

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u?.user) { window.location.href = "/agent/login"; return; }
      setReady(true);
      const res = await fetch("/api/agent/campaigns");
      if (res.ok) {
        const json = await res.json();
        setActive(json.active ?? []);
        setUpcoming(json.upcoming ?? []);
        setPast(json.past ?? []);
      }
      setLoading(false);
    })();
  }, [supabase]);

  if (!ready) return null;

  const renderCampaign = (c: Campaign, isActive: boolean) => {
    const tm = TYPE_MAP[c.campaign_type] ?? TYPE_MAP.other;
    const daysLeft = isActive
      ? Math.max(0, Math.ceil((new Date(c.end_date).getTime() - Date.now()) / 86400000))
      : null;

    return (
      <div key={c.id} className={`rounded-2xl border bg-white p-5 shadow-sm ${isActive ? "border-emerald-200" : "border-neutral-200"}`}>
        {c.banner_text && isActive && (
          <div className="mb-3 rounded-xl bg-gradient-to-r from-emerald-50 to-blue-50 px-4 py-2 text-sm font-medium text-emerald-800">
            {c.banner_text}
          </div>
        )}
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-neutral-900">{c.title}</h3>
              <Badge variant={tm.variant}>{tm.label}</Badge>
            </div>
            {c.description && <p className="mt-1 text-sm text-neutral-500">{c.description}</p>}
            <div className="mt-2 flex flex-wrap gap-3 text-xs text-neutral-400">
              <span>{formatDate(c.start_date)} 〜 {formatDate(c.end_date)}</span>
              {c.bonus_rate && <span className="font-semibold text-emerald-600">+{c.bonus_rate}%</span>}
              {c.bonus_fixed && <span className="font-semibold text-emerald-600">+{formatJpy(c.bonus_fixed)}</span>}
            </div>
          </div>
          {daysLeft !== null && (
            <div className="shrink-0 rounded-xl bg-emerald-50 px-3 py-1.5 text-center">
              <div className="text-lg font-bold text-emerald-700">{daysLeft}</div>
              <div className="text-[10px] text-emerald-600">日残り</div>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <div className="inline-flex rounded-full border border-neutral-300 bg-white px-3 py-1 text-[11px] font-semibold tracking-[0.22em] text-neutral-600">
          CAMPAIGNS
        </div>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-neutral-900">キャンペーン</h1>
        <p className="mt-1 text-sm text-neutral-500">現在開催中・今後のキャンペーン情報</p>
      </div>

      {loading ? (
        <div className="animate-pulse space-y-3">
          {[1, 2].map((i) => <div key={i} className="h-24 rounded-2xl bg-neutral-100" />)}
        </div>
      ) : (
        <>
          {active.length > 0 && (
            <div className="space-y-2">
              <h2 className="text-xs font-semibold tracking-[0.18em] text-emerald-600">ACTIVE</h2>
              <div className="space-y-3">{active.map((c) => renderCampaign(c, true))}</div>
            </div>
          )}

          {upcoming.length > 0 && (
            <div className="space-y-2">
              <h2 className="text-xs font-semibold tracking-[0.18em] text-blue-600">UPCOMING</h2>
              <div className="space-y-3">{upcoming.map((c) => renderCampaign(c, false))}</div>
            </div>
          )}

          {past.length > 0 && (
            <div className="space-y-2">
              <h2 className="text-xs font-semibold tracking-[0.18em] text-neutral-500">PAST</h2>
              <div className="space-y-3 opacity-60">{past.map((c) => renderCampaign(c, false))}</div>
            </div>
          )}

          {active.length === 0 && upcoming.length === 0 && past.length === 0 && (
            <div className="rounded-2xl border border-neutral-200 bg-white p-8 text-center text-sm text-neutral-500">
              キャンペーンはまだありません
            </div>
          )}
        </>
      )}
    </div>
  );
}
