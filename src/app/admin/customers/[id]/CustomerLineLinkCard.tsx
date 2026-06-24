"use client";

import { useState } from "react";
import { parseJsonSafe } from "@/lib/api/safeJson";

/**
 * CustomerLineLinkCard
 * ------------------------------------------------------------
 * 店スタッフが顧客ごとの LINE 連携コードを発行するカード。
 * 顧客が店舗の LINE 公式アカウントへこのコードを送信すると
 * customers.line_user_id が紐付き、以降 LINE で双方向にやり取りできる。
 *
 * - すでに連携済みなら状態表示のみ（再発行は不要）。
 * - LINE 未連携テナントでは発行ボタンを出さない（設定への導線のみ）。
 */
export default function CustomerLineLinkCard({
  customerId,
  initialLinked,
  lineEnabled,
  canIssue,
}: {
  customerId: string;
  initialLinked: boolean;
  lineEnabled: boolean;
  /** 連携コード発行（書き込み）が許可されたロールか。閲覧のみは false。 */
  canIssue: boolean;
}) {
  const [code, setCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const issue = async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch("/api/parts/line-link-codes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ customer_id: customerId }),
      });
      const j = await parseJsonSafe(res);
      if (!res.ok) throw new Error(j?.message ?? j?.error ?? `HTTP ${res.status}`);
      setCode(j.code as string);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="glass-card p-5 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-semibold tracking-[0.18em] text-muted">LINE 連携</div>
          <div className="mt-1 flex items-center gap-2 text-sm">
            <span
              className={`inline-flex items-center gap-1.5 font-medium ${
                initialLinked ? "text-success" : "text-muted"
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${initialLinked ? "bg-success" : "bg-[var(--text-muted)]"}`} />
              {initialLinked ? "連携済み" : "未連携"}
            </span>
          </div>
        </div>
        {lineEnabled && !initialLinked && !code && canIssue && (
          <button type="button" className="btn-primary text-xs" disabled={loading} onClick={issue}>
            {loading ? "発行中…" : "連携コードを発行"}
          </button>
        )}
      </div>

      {!lineEnabled && (
        <p className="text-xs text-muted">
          LINE公式アカウントが未連携です。設定 &gt; LINE連携 で接続すると、顧客への連携コード発行が利用できます。
        </p>
      )}

      {lineEnabled && !initialLinked && canIssue && (
        <p className="text-xs text-secondary">
          発行したコードをお客様に伝え、店舗の公式LINEを友だち追加してトークに送信してもらうと連携が完了します（30分有効・1回限り）。
        </p>
      )}

      {code && (
        <div className="rounded-lg bg-surface-subtle p-3 text-center">
          <div className="text-xs text-muted">連携コード（30分有効）</div>
          <div className="font-mono text-2xl font-bold tracking-widest text-primary">{code}</div>
          <div className="mt-1 text-xs text-muted">お客様が公式LINEのトークにこのコードを送信すると連携完了です。</div>
        </div>
      )}

      {initialLinked && (
        <p className="text-xs text-secondary">
          このお客様はLINEに連携済みです。「メッセージ」タブからLINEで直接やり取りできます。
        </p>
      )}

      {err && <div className="text-xs text-red-500">{err}</div>}
    </section>
  );
}
