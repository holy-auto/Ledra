"use client";

/**
 * `/admin/jobs/new` 用: 受信メッセージ (LINE / メール / 電話文字起こし) を
 * 貼り付けて AI で予約フォームに流し込むサブパネル。
 *
 * 抽出結果は親フォーム (title / note) に流し込みつつ、確証の高い場合のみ
 * 顧客名 / 電話 / 車両情報をプレビュー表示する。実際の予約作成は親フォーム
 * の submit に任せる (本パネルはデータ前処理だけ担当)。
 */
import { useState } from "react";

interface ExtractedFields {
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
}

interface Props {
  onApply: (fields: { title?: string; note?: string }) => void;
}

const INTENT_LABEL: Record<ExtractedFields["intent"], string> = {
  new_reservation: "新規予約",
  change_reservation: "予約変更",
  cancel: "キャンセル",
  inquiry_only: "問い合わせのみ",
  other: "その他",
};

export default function MessageExtractPanel({ onApply }: Props) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [channel, setChannel] = useState<"line" | "email" | "phone" | "form">("line");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ExtractedFields | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function run() {
    if (!text.trim()) {
      setErr("メッセージを貼り付けてください。");
      return;
    }
    setLoading(true);
    setErr(null);
    setResult(null);
    try {
      const res = await fetch("/api/admin/reservations/ai-from-message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: text.trim(), channel }),
      });
      if (res.status === 403) {
        const j = await res.json().catch(() => ({}));
        setErr(j?.message ?? "AI 抽出は Standard プラン以上でご利用いただけます。");
        return;
      }
      if (res.status === 429) {
        setErr("AI コール数の制限に達しました。しばらくお待ちください。");
        return;
      }
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j?.ok) {
        setErr(j?.message ?? "AI 抽出に失敗しました。");
        return;
      }
      if (j.ai_disabled) {
        setErr("テナント設定で AI 自動入力が OFF になっています。");
        return;
      }
      setResult(j.extracted);
    } catch {
      setErr("通信エラーが発生しました。");
    } finally {
      setLoading(false);
    }
  }

  function apply() {
    if (!result) return;
    const titleParts: string[] = [];
    if (result.customer_name) titleParts.push(`${result.customer_name.split(/\s+/)[0]}様`);
    if (result.service) titleParts.push(result.service);
    if (result.vehicle) titleParts.push(result.vehicle);
    const title = titleParts.join(" ") || undefined;

    const noteParts: string[] = [];
    if (result.phone) noteParts.push(`電話: ${result.phone}`);
    if (result.email) noteParts.push(`メール: ${result.email}`);
    if (result.date_text) noteParts.push(`希望日 (元の表現): ${result.date_text}`);
    if (result.scheduled_date) noteParts.push(`抽出日: ${result.scheduled_date}`);
    if (result.note) noteParts.push(result.note);
    const note = noteParts.length ? noteParts.join("\n") : undefined;

    onApply({ title, note });
  }

  return (
    <div className="rounded-xl border border-accent/30 bg-accent/5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-4 py-3 text-left text-sm font-medium text-accent hover:bg-accent/10 rounded-xl transition-colors"
      >
        <span>✨ 受信メッセージから AI 抽出</span>
        <span className="ml-auto text-muted text-xs">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-3 border-t border-accent/20">
          <p className="text-xs text-muted mt-3">
            LINE / メール / 電話の文字起こしを貼ると、案件タイトルと備考に流し込めます。
          </p>

          <div className="flex flex-wrap gap-2 text-xs">
            {(["line", "email", "phone", "form"] as const).map((ch) => (
              <button
                key={ch}
                type="button"
                onClick={() => setChannel(ch)}
                className={`px-2.5 py-1 rounded-full border ${
                  channel === ch
                    ? "border-accent bg-accent/10 text-accent"
                    : "border-border-default bg-surface text-muted"
                }`}
              >
                {ch === "line" ? "LINE" : ch === "email" ? "メール" : ch === "phone" ? "電話" : "フォーム"}
              </button>
            ))}
          </div>

          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={5}
            placeholder="例: 明日の午後 2 時にプリウスのガラスコーティングお願いしたいです。山田です。090-1234-5678"
            className="w-full rounded-xl border border-border-default bg-surface px-3 py-2 text-sm text-primary outline-none focus:ring-2 focus:ring-accent/30 resize-none"
          />

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={run}
              disabled={loading}
              className="rounded-xl border border-accent bg-accent/10 px-4 py-2 text-sm font-medium text-accent hover:bg-accent/20 disabled:opacity-50"
            >
              {loading ? "解析中…" : "✨ AI 抽出"}
            </button>
            {result && (
              <button
                type="button"
                onClick={apply}
                className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent/90"
              >
                フォームに反映
              </button>
            )}
          </div>

          {err && (
            <div className="rounded-lg border border-red-400/30 bg-red-400/10 px-3 py-2 text-xs text-red-400">
              {err}
            </div>
          )}

          {result && (
            <div className="rounded-xl border border-accent/20 bg-surface px-3 py-3 space-y-2 text-sm">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="rounded-full bg-accent/10 text-accent px-2 py-0.5 font-semibold">
                  {INTENT_LABEL[result.intent]}
                </span>
                <span className="text-muted">信頼度 {Math.round(result.confidence * 100)}%</span>
                {!result.ai && <span className="text-muted">(AI 不在)</span>}
              </div>
              <ul className="space-y-1 text-xs text-secondary">
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
                {result.email && (
                  <li>
                    <span className="text-muted">メール:</span> {result.email}
                  </li>
                )}
                {result.vehicle && (
                  <li>
                    <span className="text-muted">車両:</span> {result.vehicle}
                  </li>
                )}
                {(result.scheduled_date || result.date_text) && (
                  <li>
                    <span className="text-muted">希望日:</span> {result.scheduled_date ?? result.date_text}
                  </li>
                )}
                {result.service && (
                  <li>
                    <span className="text-muted">希望施工:</span> {result.service}
                  </li>
                )}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
