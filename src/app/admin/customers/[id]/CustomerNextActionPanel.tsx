import Link from "next/link";
import type { CustomerSignals, NextAction } from "@/lib/customers/signals";

/**
 * 顧客 360° ビューの「次のアクション」サマリパネル (Phase 1)。
 *
 * deterministic な signals だけを受け取り、優先度順にカード化する。AI 文章化は
 * しない (Phase 2 で `summary` を差し込む予定)。サーバコンポーネントとしてレンダ
 * される想定なので "use client" は付けない。
 */

const PRIORITY_STYLE: Record<NextAction["priority"], { badge: string; ring: string; label: string }> = {
  high: {
    badge: "bg-red-400/10 text-red-400 border-red-400/30",
    ring: "border-red-400/30 hover:border-red-400/50",
    label: "急ぎ",
  },
  medium: {
    badge: "bg-warning-dim text-warning border-warning/30",
    ring: "border-border-default hover:border-accent/40",
    label: "推奨",
  },
  low: {
    badge: "bg-surface text-muted border-border-default",
    ring: "border-border-default hover:border-border-strong",
    label: "提案",
  },
};

function formatYen(value: number): string {
  return `¥${value.toLocaleString("ja-JP")}`;
}

function SignalChip({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "warn" | "danger";
}) {
  const toneCls =
    tone === "danger"
      ? "border-red-400/30 bg-red-400/10 text-red-400"
      : tone === "warn"
        ? "border-warning/30 bg-warning-dim text-warning"
        : "border-border-default bg-surface text-secondary";
  return (
    <div className={`rounded-xl border px-3 py-2 text-xs ${toneCls}`}>
      <div className="text-[10px] font-medium uppercase tracking-wider opacity-70">{label}</div>
      <div className="mt-0.5 text-sm font-semibold">{value}</div>
    </div>
  );
}

export default function CustomerNextActionPanel({
  signals,
  summary,
}: {
  signals: CustomerSignals;
  /** Phase 2: AI が生成した 1〜2 文のサマリ。null/undefined なら表示しない */
  summary?: string | null;
}) {
  const lastVisitText =
    signals.daysSinceLastVisit == null
      ? "未来店"
      : signals.daysSinceLastVisit === 0
        ? "本日"
        : `${signals.daysSinceLastVisit} 日前`;

  const unpaidTone = signals.overdueInvoiceCount > 0 ? "danger" : signals.unpaidInvoiceCount > 0 ? "warn" : "default";

  return (
    <section className="glass-card p-5 space-y-4">
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <div className="text-xs font-semibold tracking-[0.18em] text-muted">NEXT ACTIONS</div>
          <div className="mt-0.5 text-base font-semibold text-primary">次のアクション</div>
        </div>
        <span className="text-[10px] text-muted">{summary ? "AI summary · v2" : "deterministic signals · v1"}</span>
      </div>

      {/* AI サマリ (Phase 2) — signals だけで動くため null なら省略 */}
      {summary && (
        <div className="rounded-xl border border-accent/30 bg-accent-dim px-4 py-3">
          <div className="flex items-start gap-2">
            <p className="text-sm text-primary leading-relaxed">{summary}</p>
          </div>
        </div>
      )}

      {/* signals サマリ */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <SignalChip
          label="車両"
          value={`${signals.vehicleCount} 台`}
          tone={signals.vehicleCount === 0 ? "warn" : "default"}
        />
        <SignalChip label="有効証明書" value={`${signals.activeCertificateCount} / ${signals.totalCertificateCount}`} />
        <SignalChip
          label="最終来店"
          value={lastVisitText}
          tone={signals.daysSinceLastVisit != null && signals.daysSinceLastVisit >= 180 ? "warn" : "default"}
        />
        <SignalChip
          label="未払請求"
          value={
            signals.unpaidInvoiceCount === 0
              ? "なし"
              : `${signals.unpaidInvoiceCount} 件 / ${formatYen(signals.unpaidInvoiceTotal)}`
          }
          tone={unpaidTone}
        />
      </div>

      {/* LTV / 離反リスク */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <SignalChip label="来店回数" value={`${signals.visitCount} 回`} />
        <SignalChip label="累計売上" value={signals.totalSpend > 0 ? formatYen(signals.totalSpend) : "—"} />
        <SignalChip
          label="離反リスク"
          value={
            signals.churnRisk === "high"
              ? "高"
              : signals.churnRisk === "medium"
                ? "中"
                : signals.churnRisk === "low"
                  ? "低"
                  : "—"
          }
          tone={signals.churnRisk === "high" ? "danger" : signals.churnRisk === "medium" ? "warn" : "default"}
        />
      </div>

      {/* 次アクション */}
      {signals.nextActions.length === 0 ? (
        <div className="rounded-xl border border-border-subtle bg-surface px-4 py-3 text-xs text-muted">
          特筆すべき次アクションはありません。良好な状態です。
        </div>
      ) : (
        <ul className="space-y-2">
          {signals.nextActions.map((action) => {
            const style = PRIORITY_STYLE[action.priority];
            return (
              <li key={action.id} className={`rounded-xl border bg-surface px-4 py-3 transition-colors ${style.ring}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${style.badge}`}>
                        {style.label}
                      </span>
                      <span className="text-sm font-semibold text-primary">{action.label}</span>
                    </div>
                    <p className="mt-1 text-xs text-muted">{action.reason}</p>
                  </div>
                  <Link
                    href={action.cta.href}
                    className="shrink-0 rounded-lg border border-border-default bg-surface px-3 py-1.5 text-xs font-medium text-primary hover:bg-surface-hover hover:border-border-strong"
                  >
                    {action.cta.text}
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
