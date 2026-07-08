"use client";

/**
 * AI 抽出済み予約候補 (ai_extracted スナップショット or その場の抽出結果) を表示するカード。
 *
 * 顧客 360 のメッセージタブ・横断受信箱 (メール含む) の両方で使う共有コンポーネント。
 * 「予約候補として開く →」は /admin/jobs/new に prefill して遷移するだけで、この場で
 * 予約は作らない (スタッフがフォームで顧客等を確認して submit する)。メール送信元を
 * 顧客に束ねるような危険な紐付けは行わない。
 */

export interface ExtractedResult {
  customer_name?: string;
  phone?: string;
  email?: string;
  vehicle?: string;
  scheduled_date?: string;
  date_text?: string;
  service?: string;
  note?: string;
  intent: "new_reservation" | "change_reservation" | "cancel" | "inquiry_only" | "other";
  confidence: number;
  ai: boolean;
  extracted_at?: string;
  /** "history_import" のとき履歴一括取り込みで生成された候補。 */
  source?: string;
  /** スタッフが「対応済み」にした時刻。設定済みなら候補は収束 (バッジ/CTA を消す)。 */
  handled_at?: string | null;
}

const INTENT_LABEL: Record<ExtractedResult["intent"], string> = {
  new_reservation: "新規予約",
  change_reservation: "予約変更",
  cancel: "キャンセル",
  inquiry_only: "問い合わせのみ",
  other: "その他",
};

/**
 * 予約候補から /admin/jobs/new への prefill リンクを組み立てる。予約意図でない、または
 * 対応済みなら null。遷移先 (WalkinJobClient) は customer_id / title / note を読む。
 * この場では予約を作らず、スタッフがフォームで顧客等を確認して submit する。
 */
export function buildReservationPrefillHref(result: ExtractedResult, customerId?: string): string | null {
  const isReservation = result.intent === "new_reservation" || result.intent === "change_reservation";
  if (!isReservation || result.handled_at) return null;
  const params = new URLSearchParams();
  if (customerId) params.set("customer_id", customerId);
  if (result.service) params.set("title", result.service);
  const noteParts: string[] = [];
  if (result.scheduled_date || result.date_text) noteParts.push(`希望日: ${result.scheduled_date ?? result.date_text}`);
  if (result.vehicle) noteParts.push(`車両: ${result.vehicle}`);
  if (result.service) noteParts.push(`施工: ${result.service}`);
  if (result.customer_name) noteParts.push(`お客様: ${result.customer_name}`);
  if (result.phone) noteParts.push(`電話: ${result.phone}`);
  if (result.email) noteParts.push(`メール: ${result.email}`);
  if (noteParts.length) params.set("note", noteParts.join("\n"));
  const qs = params.toString();
  return `/admin/jobs/new${qs ? `?${qs}` : ""}`;
}

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
  const handled = !!result.handled_at;
  const reservationHint = buildReservationPrefillHref(result, customerId);

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
