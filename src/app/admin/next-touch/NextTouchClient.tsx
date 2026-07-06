"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import PageHeader from "@/components/ui/PageHeader";

/* ─── 型 (API レスポンス) ─── */
type TouchReason = "service" | "inspection" | "warranty" | "birthday";
type TouchTone = "overdue" | "today" | "soon";
interface TouchItem {
  id: string;
  customer_id: string;
  customer_name: string;
  reason: TouchReason;
  title: string;
  detail: string | null;
  due_date: string | null;
  days_until: number;
  tone: TouchTone;
  channel: "line" | "email" | "phone" | "none";
}
interface Summary {
  total: number;
  overdue: number;
  today: number;
  soon: number;
  reachable: number;
}

type TabKey = "all" | "overdue" | "today" | "soon";

const REASON_META: Record<TouchReason, { label: string; cls: string }> = {
  service: { label: "点検・交換", cls: "bg-accent-dim text-accent-text" },
  inspection: { label: "車検満了", cls: "bg-warning-dim text-warning-text" },
  warranty: { label: "保証満了", cls: "bg-inset text-secondary" },
  birthday: { label: "誕生日", cls: "bg-success-dim text-success-text" },
};

const TONE_META: Record<TouchTone, { label: string; cls: string }> = {
  overdue: { label: "超過", cls: "bg-danger-dim text-danger-text" },
  today: { label: "今日", cls: "bg-warning-dim text-warning-text" },
  soon: { label: "まもなく", cls: "bg-success-dim text-success-text" },
};

const CHANNEL_LABEL: Record<TouchItem["channel"], string> = {
  line: "LINE",
  email: "メール",
  phone: "電話",
  none: "連絡先なし",
};

function whenText(item: TouchItem): string {
  if (item.reason === "birthday") return item.days_until === 0 ? "本日" : `${item.days_until}日後`;
  if (item.due_date == null) return "目安到達";
  if (item.days_until < 0) return `${Math.abs(item.days_until)}日超過 (${item.due_date})`;
  if (item.days_until === 0) return `本日 (${item.due_date})`;
  return `あと${item.days_until}日 (${item.due_date})`;
}

export default function NextTouchClient() {
  const [items, setItems] = useState<TouchItem[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey>("all");

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      setErr(null);
      try {
        const res = await fetch("/api/admin/next-touch", { cache: "no-store" });
        const j = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(j?.message ?? j?.error ?? `HTTP ${res.status}`);
        if (!active) return;
        setItems(Array.isArray(j.items) ? j.items : []);
        setSummary(j.summary ?? null);
      } catch (e) {
        if (active) setErr(e instanceof Error ? e.message : "読み込みに失敗しました");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const visible = useMemo(() => (tab === "all" ? items : items.filter((i) => i.tone === tab)), [items, tab]);

  const TAB_META: Record<TabKey, { label: string; count: number }> = {
    all: { label: "全件", count: summary?.total ?? 0 },
    overdue: { label: "超過", count: summary?.overdue ?? 0 },
    today: { label: "今日", count: summary?.today ?? 0 },
    soon: { label: "まもなく", count: summary?.soon ?? 0 },
  };

  return (
    <div className="mx-auto max-w-4xl pb-20">
      <div className="mb-6">
        <PageHeader
          tag="フォロー"
          title="次の接触"
          description="点検・交換 / 車検満了 / 保証満了 / 誕生日 を横断し、近々連絡すべきお客様をまとめます。"
          tabs={(["all", "overdue", "today", "soon"] as TabKey[]).map((t) => ({
            key: t,
            label: TAB_META[t].label,
            badge: TAB_META[t].count,
          }))}
          activeTab={tab}
          onTabSelect={(k) => setTab(k as TabKey)}
        />
      </div>

      {summary && (
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="超過" value={summary.overdue} tone="danger" />
          <StatCard label="今日" value={summary.today} tone="warning" />
          <StatCard label="まもなく" value={summary.soon} tone="success" />
          <StatCard label="連絡可能" value={`${summary.reachable}/${summary.total}`} tone="muted" />
        </div>
      )}

      {loading ? (
        <div className="flex min-h-[240px] items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-accent border-t-transparent" />
        </div>
      ) : err ? (
        <div className="glass-card rounded-xl p-6 text-sm text-danger">{err}</div>
      ) : visible.length === 0 ? (
        <div className="glass-card rounded-xl p-10 text-center text-muted">
          <p className="text-sm">該当するお客様はいません。</p>
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map((item) => {
            const reason = REASON_META[item.reason];
            const tone = TONE_META[item.tone];
            return (
              <div key={item.id} className="glass-card rounded-xl p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/admin/customers/${item.customer_id}`}
                        className="font-semibold text-primary hover:text-accent hover:underline"
                      >
                        {item.customer_name}
                      </Link>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${reason.cls}`}>
                        {reason.label}
                      </span>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${tone.cls}`}>{tone.label}</span>
                    </div>
                    <div className="mt-1 font-medium text-primary">{item.title}</div>
                    {item.detail && <div className="mt-0.5 text-sm text-secondary">{item.detail}</div>}
                    <div className="mt-1 text-xs text-muted">{whenText(item)}</div>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${
                      item.channel === "none" ? "bg-inset text-muted" : "bg-accent-dim text-accent-text"
                    }`}
                  >
                    {CHANNEL_LABEL[item.channel]}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | string;
  tone: "danger" | "warning" | "success" | "muted";
}) {
  const cls: Record<string, string> = {
    danger: "text-danger-text",
    warning: "text-warning-text",
    success: "text-success-text",
    muted: "text-secondary",
  };
  return (
    <div className="glass-card rounded-xl p-4">
      <div className="text-xs text-muted">{label}</div>
      <div className={`mt-1 text-2xl font-bold ${cls[tone]}`}>{value}</div>
    </div>
  );
}
