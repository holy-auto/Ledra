"use client";

/**
 * 保険会社案件詳細の上部に出る AI 3 行サマリ + 担当者振り分け候補。
 *
 * 「AI で要約する」「担当者を推薦」ボタンの 2 操作。どちらも能動操作にして
 * 月間 AI コスト爆発を防ぐ。
 */
import { useState } from "react";

interface SummaryResult {
  lines: [string, string, string];
  confidence: number;
  ai: boolean;
}
interface AssignCandidate {
  user_id: string;
  user_name?: string;
  score: number;
  method: "rule" | "history" | "ai" | "fallback";
  reason: string;
}

interface Props {
  caseId: string;
  onApplyAssignee?: (userId: string) => void;
  /** 受信時に自動生成され meta.ai_summary に保存済みのサマリ (あれば既定表示)。 */
  initialSummary?: SummaryResult | null;
}

export default function CaseAiBanner({ caseId, onApplyAssignee, initialSummary }: Props) {
  // 手動再要約の結果。無い間は受信時の自動サマリ (initialSummary) を表示する。
  // initialSummary は親のポーリングで後から届く (after() の書き込み完了後) ことがあるため、
  // state に固定せず live prop から導出し、リロードなしで反映されるようにする。
  const [manualSummary, setManualSummary] = useState<SummaryResult | null>(null);
  const [candidates, setCandidates] = useState<AssignCandidate[] | null>(null);
  const [summarizing, setSummarizing] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const summary = manualSummary ?? initialSummary ?? null;
  const isAuto = !manualSummary && !!initialSummary;

  async function runSummary() {
    setSummarizing(true);
    setErr(null);
    try {
      const res = await fetch(`/api/insurer/cases/${caseId}/ai-summary`, { method: "POST" });
      if (res.status === 429) {
        setErr("AI コール数の制限に達しました。");
        return;
      }
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j?.ok) {
        setErr(j?.message ?? "サマリ生成に失敗しました。");
        return;
      }
      setManualSummary(j.summary);
    } catch {
      setErr("通信エラーが発生しました。");
    } finally {
      setSummarizing(false);
    }
  }

  async function runAssignSuggest() {
    setAssigning(true);
    setErr(null);
    try {
      const res = await fetch(`/api/insurer/cases/${caseId}/ai-assign-suggest`, { method: "POST" });
      if (res.status === 429) {
        setErr("AI コール数の制限に達しました。");
        return;
      }
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j?.ok) {
        setErr(j?.message ?? "担当者候補の取得に失敗しました。");
        return;
      }
      setCandidates(j.candidates ?? []);
    } catch {
      setErr("通信エラーが発生しました。");
    } finally {
      setAssigning(false);
    }
  }

  return (
    <section className="rounded-xl border border-accent/30 bg-accent/5 p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs font-semibold tracking-[0.18em] text-accent">✨ AI アシスト</div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={runSummary} disabled={summarizing} className="btn-ghost text-[11px] py-1 px-2">
            {summarizing ? "要約中..." : summary ? "再要約" : "3 行で要約"}
          </button>
          <button
            type="button"
            onClick={runAssignSuggest}
            disabled={assigning}
            className="btn-ghost text-[11px] py-1 px-2"
          >
            {assigning ? "解析中..." : candidates ? "再推薦" : "担当者を推薦"}
          </button>
        </div>
      </div>

      {err && <div className="text-[11px] text-danger-text">{err}</div>}

      {summary && (
        <div className="space-y-1.5">
          {isAuto && <div className="text-[11px] text-muted">受信時に自動生成</div>}
          <ol className="space-y-1.5 text-sm text-primary list-decimal list-inside">
            {summary.lines.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ol>
        </div>
      )}

      {candidates && candidates.length > 0 && (
        <div className="space-y-2">
          <div className="text-[11px] text-muted">担当者候補 ({candidates[0].method})</div>
          {candidates.map((c) => (
            <div
              key={c.user_id}
              className="rounded-lg border border-border-subtle bg-surface px-3 py-2 flex items-center justify-between gap-2"
            >
              <div className="min-w-0">
                <div className="text-sm font-medium text-primary">{c.user_name ?? c.user_id.slice(0, 8)}</div>
                <div className="text-[11px] text-muted truncate">
                  {c.reason} · {Math.round(c.score * 100)}%
                </div>
              </div>
              {onApplyAssignee && (
                <button
                  type="button"
                  className="btn-ghost text-[11px] py-1 px-2 shrink-0"
                  onClick={() => onApplyAssignee(c.user_id)}
                >
                  この担当者にする
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
