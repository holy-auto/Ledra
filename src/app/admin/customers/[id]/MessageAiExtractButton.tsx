"use client";

/**
 * inbound メッセージ 1 件を AI で予約候補に抽出するボタン。
 *
 * 押下時に POST /api/admin/customer-messages/[id]/ai-extract を叩き、結果を
 * 同じ吹き出しに展開表示する。結果は `customer_messages.ai_extracted` に保存
 * されるが、UI 表示はメモリ内 (リロード後は再抽出が必要)。
 *
 * 「予約候補にする」ボタンで /admin/jobs/new に reservation hint を引き継ぐ。
 */
import { useState } from "react";

export interface ExtractedResult {
  customer_name?: string;
  phone?: string;
  vehicle?: string;
  scheduled_date?: string;
  date_text?: string;
  service?: string;
  intent: "new_reservation" | "change_reservation" | "cancel" | "inquiry_only" | "other";
  confidence: number;
  ai: boolean;
  extracted_at?: string;
  /** "history_import" のとき履歴一括取り込みで生成された候補。 */
  source?: string;
  /** スタッフが「対応済み」にした時刻。設定済みなら候補は収束 (バッジ/CTA を消す)。 */
  handled_at?: string | null;
}

interface Props {
  messageId: string;
  customerId?: string;
}

const INTENT_LABEL: Record<ExtractedResult["intent"], string> = {
  new_reservation: "新規予約",
  change_reservation: "予約変更",
  cancel: "キャンセル",
  inquiry_only: "問い合わせのみ",
  other: "その他",
};

/**
 * 抽出済み予約候補 (ai_extracted スナップショット or その場の抽出結果) を表示するカード。
 * MessageAiExtractButton のその場抽出と、履歴一括取り込みで保存済みの候補の両方で使う。
 */
export function ExtractedCandidateCard({
  result,
  customerId,
  onDismiss,
  dismissing,
}: {
  result: ExtractedResult;
  customerId?: string;
  /** 指定時のみ「対応済みにする」ボタンを表示する (保存済み候補の収束用)。 */
  onDismiss?: () => void;
  dismissing?: boolean;
}) {
  const isReservation = result.intent === "new_reservation" || result.intent === "change_reservation";
  const handled = !!result.handled_at;

  // 予約候補を /admin/jobs/new に渡すためのクエリ。
  // 遷移先 (WalkinJobClient) は customer_id / title / note を読んでフォームに反映する。
  const params = new URLSearchParams();
  if (customerId) params.set("customer_id", customerId);
  if (result.service) params.set("title", result.service);
  const noteParts: string[] = [];
  if (result.scheduled_date || result.date_text) noteParts.push(`希望日: ${result.scheduled_date ?? result.date_text}`);
  if (result.vehicle) noteParts.push(`車両: ${result.vehicle}`);
  if (result.service) noteParts.push(`施工: ${result.service}`);
  if (result.customer_name) noteParts.push(`お客様: ${result.customer_name}`);
  if (result.phone) noteParts.push(`電話: ${result.phone}`);
  if (noteParts.length) params.set("note", noteParts.join("\n"));
  const reservationHint =
    isReservation && !handled ? `/admin/jobs/new${params.toString() ? `?${params.toString()}` : ""}` : null;

  return (
    <div
      className={`mt-1.5 rounded-lg border px-2 py-1.5 text-[11px] space-y-1 ${
        handled ? "border-border-subtle bg-surface-hover/40 opacity-70" : "border-accent/30 bg-accent/5"
      }`}
    >
      <div className="flex items-center gap-1.5">
        <span className={`font-semibold ${handled ? "text-muted" : "text-accent"}`}>✨ AI 抽出</span>
        <span className="rounded-full bg-accent/10 text-accent px-1.5 py-0">{INTENT_LABEL[result.intent]}</span>
        <span className="text-muted">{Math.round(result.confidence * 100)}%</span>
        {result.source === "history_import" && (
          <span
            className="rounded-full bg-surface-hover text-muted px-1.5 py-0"
            title="紐づけ時に過去のやり取りから自動取り込み"
          >
            履歴から
          </span>
        )}
        {handled && <span className="rounded-full bg-success-dim text-success px-1.5 py-0">✓ 対応済み</span>}
      </div>
      {(result.customer_name ||
        result.phone ||
        result.vehicle ||
        result.service ||
        result.scheduled_date ||
        result.date_text) && (
        <ul className="text-[10px] text-secondary space-y-0.5">
          {result.customer_name && (
            <li>
              <span className="text-muted">顧客:</span> {result.customer_name}
            </li>
          )}
          {result.phone && (
            <li>
              <span className="text-muted">電話:</span> {result.phone}
            </li>
          )}
          {result.vehicle && (
            <li>
              <span className="text-muted">車両:</span> {result.vehicle}
            </li>
          )}
          {result.service && (
            <li>
              <span className="text-muted">施工:</span> {result.service}
            </li>
          )}
          {(result.scheduled_date || result.date_text) && (
            <li>
              <span className="text-muted">希望日:</span> {result.scheduled_date ?? result.date_text}
            </li>
          )}
        </ul>
      )}
      {(reservationHint || (onDismiss && !handled)) && (
        <div className="flex items-center gap-3 pt-0.5">
          {reservationHint && (
            <a href={reservationHint} className="inline-block underline text-accent">
              予約候補として開く →
            </a>
          )}
          {onDismiss && !handled && (
            <button
              type="button"
              onClick={onDismiss}
              disabled={dismissing}
              className="text-[10px] text-muted underline hover:text-secondary disabled:opacity-50"
            >
              {dismissing ? "処理中…" : "対応済みにする"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default function MessageAiExtractButton({ messageId, customerId }: Props) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ExtractedResult | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function run() {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch(`/api/admin/customer-messages/${messageId}/ai-extract`, {
        method: "POST",
      });
      if (res.status === 403) {
        const j = await res.json().catch(() => ({}));
        setErr(j?.message ?? "Standard プラン以上で利用できます。");
        return;
      }
      if (res.status === 429) {
        setErr("AI コール上限に達しました。");
        return;
      }
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j?.ok || j.ai_disabled) {
        setErr(j?.message ?? "抽出に失敗しました。");
        return;
      }
      setResult(j.extracted ?? null);
    } catch {
      setErr("通信エラーが発生しました。");
    } finally {
      setLoading(false);
    }
  }

  if (!result && !err) {
    return (
      <button
        type="button"
        onClick={run}
        disabled={loading}
        className="mt-1.5 text-[10px] underline text-muted hover:text-accent"
      >
        {loading ? "解析中..." : "✨ AI で予約候補に抽出"}
      </button>
    );
  }

  if (err) {
    return (
      <div className="mt-1.5 text-[10px] text-danger-text">
        {err}{" "}
        <button type="button" onClick={() => setErr(null)} className="underline">
          再試行
        </button>
      </div>
    );
  }

  if (!result) return null;

  return <ExtractedCandidateCard result={result} customerId={customerId} />;
}
