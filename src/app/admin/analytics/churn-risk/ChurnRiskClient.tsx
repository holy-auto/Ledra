"use client";

import { useEffect, useRef, useState } from "react";
import MutationGuard from "@/components/ui/MutationGuard";
import PageHeader from "@/components/ui/PageHeader";

// ─── 型定義 ──────────────────────────────────────────────────────
type RiskLevel = "high" | "medium" | "low";

interface ChurnRow {
  customer_id: string;
  name: string | null;
  has_line: boolean;
  visit_count: number;
  last_visit_date: string | null;
  days_since_last_visit: number | null;
  avg_visit_interval_days: number | null;
  risk: RiskLevel;
  risk_score: number;
  ai_insight: string | null;
}

interface ChurnResponse {
  ok: boolean;
  items: ChurnRow[];
  page: number;
  per_page: number;
  total: number;
  risk: RiskLevel | null;
  counts: { high: number; medium: number; low: number };
}

type FilterTab = "all" | RiskLevel;

const RISK_LABEL: Record<RiskLevel, string> = { high: "高", medium: "中", low: "低" };

function riskBadgeClass(risk: RiskLevel): string {
  if (risk === "high") return "bg-danger/15 text-danger";
  if (risk === "medium") return "bg-warning/15 text-warning";
  return "bg-surface-hover text-secondary";
}

// ─── ユーティリティ ───────────────────────────────────────────────
function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return iso;
}

function fmtDays(n: number | null): string {
  if (n == null) return "—";
  return `${n.toLocaleString("ja-JP")}日`;
}

// ─── メインコンポーネント ─────────────────────────────────────────
export default function ChurnRiskClient() {
  const [tab, setTab] = useState<FilterTab>("high");
  const [data, setData] = useState<ChurnResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function showToast(type: "success" | "error", msg: string) {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ type, msg });
    toastTimer.current = setTimeout(() => setToast(null), 4000);
  }

  async function fetchData() {
    setLoading(true);
    setSelected(new Set());
    try {
      const q = tab === "all" ? "" : `?risk=${tab}`;
      const res = await fetch(`/api/admin/analytics/churn-risk${q}`, { cache: "no-store" });
      if (!res.ok) throw new Error("fetch failed");
      const json = (await res.json()) as ChurnResponse;
      setData(json);
    } catch {
      showToast("error", "離反リスクデータの読み込みに失敗しました");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const rows = data?.items ?? [];
  const counts = data?.counts ?? { high: 0, medium: 0, low: 0 };

  // LINE 連携済みかつ選択中の顧客のみ送信対象。
  const lineSelectable = rows.filter((r) => r.has_line);
  const selectedLineCount = rows.filter((r) => selected.has(r.customer_id) && r.has_line).length;

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (selectedLineCount === lineSelectable.length && lineSelectable.length > 0) {
      setSelected(new Set());
    } else {
      setSelected(new Set(lineSelectable.map((r) => r.customer_id)));
    }
  }

  async function sendLine() {
    const ids = rows.filter((r) => selected.has(r.customer_id) && r.has_line).map((r) => r.customer_id);
    if (ids.length === 0) {
      showToast("error", "LINE連携済みの顧客を選択してください");
      return;
    }
    if (ids.length > 20) {
      showToast("error", "一度に送信できるのは最大20件です");
      return;
    }
    setSending(true);
    try {
      const res = await fetch("/api/admin/analytics/churn-risk/notify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customer_ids: ids }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        sent?: number;
        failed?: number;
        message?: string;
      };
      if (!res.ok || !json.ok) throw new Error(json.message ?? "送信に失敗しました");
      showToast("success", `${json.sent ?? 0}件にLINEを送信しました${json.failed ? ` (失敗 ${json.failed}件)` : ""}`);
      setSelected(new Set());
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "送信に失敗しました");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-6 pb-20">
      <PageHeader
        tag="分析"
        title="AI 顧客離反予測"
        description="来店履歴から離反リスクの高い顧客を自動抽出し、AIが再来店を促す提案を生成します。LINE連携済みの顧客にはワンクリックで再来店メッセージを送れます。"
      />

      {/* フィルタタブ + 一括送信 */}
      <div className="glass-card flex flex-wrap items-center justify-between gap-4 p-4">
        <div className="flex items-center gap-1">
          <TabButton active={tab === "high"} onClick={() => setTab("high")}>
            高リスク <CountBadge n={counts.high} tone="danger" />
          </TabButton>
          <TabButton active={tab === "medium"} onClick={() => setTab("medium")}>
            中リスク <CountBadge n={counts.medium} tone="warning" />
          </TabButton>
          <TabButton active={tab === "low"} onClick={() => setTab("low")}>
            低リスク <CountBadge n={counts.low} tone="muted" />
          </TabButton>
          <TabButton active={tab === "all"} onClick={() => setTab("all")}>
            全件
          </TabButton>
        </div>
        <MutationGuard minRole="admin">
          <button
            onClick={sendLine}
            disabled={sending || selectedLineCount === 0}
            className="btn-primary disabled:opacity-40"
          >
            選択顧客にLINE送信 {selectedLineCount > 0 ? `(${selectedLineCount})` : ""}
          </button>
        </MutationGuard>
      </div>

      {/* テーブル */}
      <section className="glass-card overflow-hidden">
        {loading ? (
          <div className="flex min-h-[200px] items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-accent border-t-transparent" />
          </div>
        ) : rows.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted">該当する顧客がありません。</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-surface-hover">
                <tr>
                  <th className="p-3 text-left">
                    <input
                      type="checkbox"
                      checked={selectedLineCount === lineSelectable.length && lineSelectable.length > 0}
                      onChange={toggleAll}
                      aria-label="全選択"
                      className="h-4 w-4 accent-[var(--color-accent,#000)]"
                    />
                  </th>
                  <Th>顧客名</Th>
                  <Th>最終来店</Th>
                  <Th>来店間隔(平均)</Th>
                  <Th>経過日数</Th>
                  <Th>離反リスク</Th>
                  <Th>AI提案</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {rows.map((r) => (
                  <tr key={r.customer_id} className="hover:bg-surface-hover/60">
                    <td className="p-3">
                      <input
                        type="checkbox"
                        checked={selected.has(r.customer_id)}
                        onChange={() => toggle(r.customer_id)}
                        disabled={!r.has_line}
                        title={r.has_line ? "" : "LINE未連携のため送信できません"}
                        aria-label={`${r.name ?? "顧客"}を選択`}
                        className="h-4 w-4 accent-[var(--color-accent,#000)] disabled:opacity-30"
                      />
                    </td>
                    <td className="p-3 text-primary">
                      <div className="flex items-center gap-2">
                        {r.name || "—"}
                        {r.has_line && (
                          <span className="rounded bg-success/15 px-1.5 py-0.5 text-[10px] font-semibold text-success">
                            LINE
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-muted">来店 {r.visit_count}回</div>
                    </td>
                    <td className="p-3 whitespace-nowrap text-secondary">{fmtDate(r.last_visit_date)}</td>
                    <td className="p-3 whitespace-nowrap text-secondary">{fmtDays(r.avg_visit_interval_days)}</td>
                    <td className="p-3 whitespace-nowrap text-secondary">{fmtDays(r.days_since_last_visit)}</td>
                    <td className="p-3 whitespace-nowrap">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${riskBadgeClass(r.risk)}`}>
                        {RISK_LABEL[r.risk]}
                      </span>
                    </td>
                    <td className="max-w-[280px] p-3 text-xs text-secondary">{r.ai_insight || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {toast && (
        <div
          className={`fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-medium text-white shadow-xl ${
            toast.type === "success" ? "bg-accent" : "bg-danger"
          }`}
        >
          {toast.msg}
        </div>
      )}
    </div>
  );
}

// ─── 小コンポーネント ─────────────────────────────────────────────
function Th({ children }: { children: React.ReactNode }) {
  return <th className="p-3 text-left text-xs font-semibold tracking-[0.12em] text-muted">{children}</th>;
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
        active ? "bg-accent text-white" : "text-secondary hover:bg-surface-hover"
      }`}
    >
      {children}
    </button>
  );
}

function CountBadge({ n, tone }: { n: number; tone: "danger" | "warning" | "muted" }) {
  if (n <= 0) return null;
  const cls =
    tone === "danger" ? "bg-danger/20 text-danger" : tone === "warning" ? "bg-warning/20 text-warning" : "bg-black/20";
  return <span className={`ml-1 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${cls}`}>{n}</span>;
}
