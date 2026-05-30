import { redirect } from "next/navigation";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import PageHeader from "@/components/ui/PageHeader";

/**
 * `/admin/reviews`
 * ----------------------------------------------------------------
 * 受領サイン後の顧客レビュー (signature_reviews) を一覧表示する。
 * `review.auto_analyze` が opt-in のテナントでは AI 感情解析
 * (sentiment / summary / topics / actionable) も併記し、
 * ネガティブ・要対応レビューを素早くトリアージできる。
 *
 * - 表示のみ (RLS は tenant メンバーの SELECT を許可)
 * - AI 列が未マイグレーションでも degrade して評価・コメントは表示する
 */
export const dynamic = "force-dynamic";

type ReviewRow = {
  id: string;
  rating: number;
  comment: string | null;
  created_at: string;
  customer_id: string | null;
  ai_sentiment?: string | null;
  ai_summary?: string | null;
  ai_topics?: string[] | null;
  ai_actionable?: boolean | null;
  ai_confidence?: number | null;
  ai_analyzed_at?: string | null;
};

const SENTIMENT_BADGE: Record<string, { label: string; cls: string }> = {
  positive: { label: "ポジティブ", cls: "border-success/40 bg-success-dim text-success-text" },
  neutral: { label: "中立", cls: "border-border-default bg-surface text-secondary" },
  negative: { label: "ネガティブ", cls: "border-danger/40 bg-danger-dim text-danger-text" },
};

function isMissingColumn(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  if (err.code === "42703" || err.code === "PGRST204") return true;
  return (err.message ?? "").toLowerCase().includes("does not exist");
}

export default async function AdminReviewsPage() {
  const supabase = await createSupabaseServerClient();
  const caller = await resolveCallerWithRole(supabase);
  if (!caller) redirect("/login?next=/admin/reviews");

  const FULL =
    "id, rating, comment, created_at, customer_id, ai_sentiment, ai_summary, ai_topics, ai_actionable, ai_confidence, ai_analyzed_at";

  let rows: ReviewRow[] = [];
  let aiAvailable = true;
  {
    const res = await supabase
      .from("signature_reviews")
      .select(FULL)
      .eq("tenant_id", caller.tenantId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (res.error && isMissingColumn(res.error)) {
      aiAvailable = false;
      const retry = await supabase
        .from("signature_reviews")
        .select("id, rating, comment, created_at, customer_id")
        .eq("tenant_id", caller.tenantId)
        .order("created_at", { ascending: false })
        .limit(50);
      rows = (retry.data as ReviewRow[]) ?? [];
    } else {
      rows = (res.data as ReviewRow[]) ?? [];
    }
  }

  // 顧客名を解決
  const customerIds = [...new Set(rows.map((r) => r.customer_id).filter(Boolean))] as string[];
  const nameById: Record<string, string> = {};
  if (customerIds.length > 0) {
    const { data: customers } = await supabase
      .from("customers")
      .select("id, name")
      .eq("tenant_id", caller.tenantId)
      .in("id", customerIds);
    (customers ?? []).forEach((c) => {
      nameById[c.id as string] = c.name as string;
    });
  }

  const actionableCount = rows.filter((r) => r.ai_actionable).length;

  return (
    <main className="space-y-6">
      <PageHeader
        tag="REVIEWS"
        title="顧客レビュー"
        description="受領サイン後に届いた顧客レビューの一覧です。AI 感情解析が有効なら要対応レビューを優先表示できます。"
      />

      {!aiAvailable && (
        <div className="rounded-xl border border-warning/30 bg-warning-dim px-4 py-3 text-xs text-warning">
          ⚠ AI 解析列が未作成のため、評価とコメントのみ表示しています。マイグレーション (
          <code>20260531000002_signature_reviews_ai.sql</code>) を適用すると感情解析が表示されます。
        </div>
      )}

      {aiAvailable && actionableCount > 0 && (
        <div className="rounded-xl border border-danger/30 bg-danger-dim px-4 py-3 text-sm text-danger-text">
          🔔 要対応のレビューが <strong>{actionableCount}</strong> 件あります（AI が改善余地ありと判定）。
        </div>
      )}

      {rows.length === 0 ? (
        <div className="glass-card p-6 text-sm text-muted">まだレビューはありません。</div>
      ) : (
        <ul className="space-y-3">
          {rows.map((r) => {
            const badge = r.ai_sentiment ? SENTIMENT_BADGE[r.ai_sentiment] : null;
            return (
              <li key={r.id} className="glass-card p-4 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-amber-500" aria-label={`評価 ${r.rating} / 5`}>
                      {"★".repeat(r.rating)}
                      <span className="text-border-default">{"★".repeat(5 - r.rating)}</span>
                    </span>
                    <span className="text-sm font-medium text-primary">
                      {r.customer_id ? (nameById[r.customer_id] ?? "顧客") : "匿名"}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {r.ai_actionable && (
                      <span className="rounded-full border border-danger/40 bg-danger-dim px-2 py-0.5 text-[11px] font-medium text-danger-text">
                        要対応
                      </span>
                    )}
                    {badge && (
                      <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${badge.cls}`}>
                        {badge.label}
                      </span>
                    )}
                    <span className="text-[11px] text-muted">{new Date(r.created_at).toLocaleDateString("ja-JP")}</span>
                  </div>
                </div>

                {r.comment && <p className="whitespace-pre-wrap text-sm text-secondary">{r.comment}</p>}

                {r.ai_summary && (
                  <p className="text-xs text-muted">
                    <span className="font-semibold">AI 要約:</span> {r.ai_summary}
                  </p>
                )}

                {r.ai_topics && r.ai_topics.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {r.ai_topics.map((t) => (
                      <span
                        key={t}
                        className="rounded-md border border-border-subtle bg-surface px-2 py-0.5 text-[11px] text-secondary"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
