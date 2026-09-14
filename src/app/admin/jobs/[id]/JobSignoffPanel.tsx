"use client";

import { useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import Card from "@/components/ui/Card";
import MutationGuard from "@/components/ui/MutationGuard";
import { fetcher } from "@/lib/swr";
import { parseJsonSafe } from "@/lib/api/safeJson";
import type { SignoffStepKey, StepState, SignoffState } from "@/lib/signoff/state";

/**
 * JobSignoffPanel — 案件サインオフ・ワークフロー (全業種共通)
 * ------------------------------------------------------------
 * 「完了報告 → 証明書発行(施工前後写真) → お客様サイン → お会計(任意) →
 *  オンチェーン」を 1 本のパイプラインとして可視化し、現在ステップの
 * アクション (特に受領サイン依頼) をここから起動する。
 *
 * 状態計算はサーバ (GET /api/admin/reservations/[id]/signoff-state) に集約し、
 * 本コンポーネントは結果を描画してサイン依頼を叩くだけに徹する。
 */

type SignoffStateResponse = {
  ok: boolean;
  certificate: {
    id: string;
    public_id: string | null;
    status: string;
    hasBeforePhoto: boolean;
    hasAfterPhoto: boolean;
  } | null;
  signoff: {
    status: "not_requested" | "awaiting" | "signed";
    requested_at: string | null;
    deadline: string | null;
    signed_off_at: string | null;
    overdue: boolean;
  };
  payment_status: string | null;
  customer: { id: string | null; type: "individual" | "corporate"; billing_cycle: "per_job" | "consolidated" | null };
  sign_link: { url: string; token: string; expires_at: string } | null;
  anchored: boolean;
  state: SignoffState;
};

/** 案件の連鎖タイムライン（予約→施工→証明書→請求→フォロー）レスポンスのうち、ここではフォロー欄だけ使う。 */
type TimelineResponse = { steps: { key: string; label: string; state: string; detail: string }[] };

const STEP_LABEL: Record<SignoffStepKey, string> = {
  completion: "完了報告",
  certificate: "証明書 (施工前後写真)",
  signature: "お客様サイン",
  payment: "お会計",
  anchor: "オンチェーン記録",
};

const STATE_STYLE: Record<StepState, { icon: string; cls: string }> = {
  done: { icon: "✓", cls: "border-success/30 bg-success-dim text-success-text" },
  current: { icon: "●", cls: "border-accent bg-accent-dim text-accent-text" },
  blocked: { icon: "⚠", cls: "border-danger/30 bg-danger-dim text-danger-text" },
  pending: { icon: "○", cls: "border-border-default bg-inset text-secondary" },
  optional: { icon: "◍", cls: "border-border-default bg-inset text-muted" },
  deferred: { icon: "⏭", cls: "border-border-default bg-inset text-muted" },
};

const STEP_ORDER: SignoffStepKey[] = ["completion", "certificate", "signature", "payment", "anchor"];

function fmtDeadline(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString("ja-JP", {
    timeZone: "Asia/Tokyo",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function JobSignoffPanel({ reservationId }: { reservationId: string }) {
  const url = `/api/admin/reservations/${reservationId}/signoff-state`;
  const { data, mutate, isLoading } = useSWR<SignoffStateResponse>(url, fetcher, {
    revalidateOnFocus: true,
    dedupingInterval: 5000,
  });
  // 発行後フォロー（証明書発行後の顧客フォロー連絡）の状態。証明書が無い間は無意味なので
  // 証明書発行後にだけ意味を持つ表示（下の JSX 側で cert 有無を見て出し分ける）。
  const { data: timeline } = useSWR<TimelineResponse>(`/api/admin/reservations/${reservationId}/timeline`, fetcher, {
    revalidateOnFocus: true,
    dedupingInterval: 5000,
  });
  const followUp = timeline?.steps?.find((s) => s.key === "follow_up") ?? null;

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [copied, setCopied] = useState(false);
  const [issuing, setIssuing] = useState(false);

  /** 施工前後写真が揃った下書き証明書を1タップで発行する（承認インボックスと同一エンドポイント）。 */
  async function issueCertificate() {
    if (!data?.certificate?.public_id) return;
    setIssuing(true);
    setErr(null);
    try {
      const res = await fetch("/api/admin/certificates/status", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ public_id: data.certificate.public_id, status: "active" }),
      });
      if (!res.ok) {
        const j = await parseJsonSafe(res);
        throw new Error(j?.message ?? j?.error ?? `HTTP ${res.status}`);
      }
      await mutate();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setIssuing(false);
    }
  }

  async function requestSignature() {
    if (!data?.certificate) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/admin/certificates/${data.certificate.id}/delivery-receipt-request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reservation_id: reservationId, signer_email: email.trim() || undefined }),
      });
      if (!res.ok) {
        const j = await parseJsonSafe(res);
        throw new Error(j?.message ?? j?.error ?? `HTTP ${res.status}`);
      }
      await mutate();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function copyLink(link: string) {
    try {
      await navigator.clipboard.writeText(new URL(link, window.location.origin).toString());
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard 不可環境では無視 (リンクは表示済み) */
    }
  }

  if (isLoading || !data) {
    return (
      <Card padding="default">
        <div className="text-[11px] font-semibold tracking-[0.18em] text-muted uppercase mb-3">Sign-off</div>
        <div className="h-16 animate-pulse rounded-lg bg-inset" />
      </Card>
    );
  }

  const { state, certificate, signoff, sign_link, customer } = data;
  const signAbsoluteUrl = sign_link
    ? new URL(sign_link.url, typeof window !== "undefined" ? window.location.origin : "https://ledra.app").toString()
    : null;

  return (
    <Card padding="default">
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="text-[11px] font-semibold tracking-[0.18em] text-muted uppercase">作業完了サインオフ</div>
        {signoff.overdue && (
          <span className="rounded-full border border-danger/30 bg-danger-dim px-2.5 py-1 text-[11px] font-semibold text-danger-text">
            サイン期限超過
          </span>
        )}
      </div>

      {/* ponytail: IMP-022 情報階層 — 現ステップを視覚的に最大化。 */}
      <ol className="flex flex-wrap items-center gap-1.5">
        {STEP_ORDER.map((key, i) => {
          const step = state.steps[key];
          const style = STATE_STYLE[step.state];
          const isCurrent = step.state === "current" || step.state === "blocked";
          return (
            <li key={key} className="flex items-center gap-1.5">
              <div
                className={`flex items-center rounded-full border font-medium ${style.cls} ${
                  isCurrent ? "gap-2 border-2 px-3.5 py-1.5 text-sm" : "gap-1.5 px-2.5 py-0.5 text-[11px]"
                }`}
              >
                <span
                  className={`flex items-center justify-center rounded-full bg-surface/60 font-bold ${
                    isCurrent ? "h-5 w-5 text-[11px]" : "h-4 w-4 text-[10px]"
                  }`}
                >
                  {step.state === "done" ? "✓" : style.icon}
                </span>
                {STEP_LABEL[key]}
              </div>
              {i < STEP_ORDER.length - 1 && <span className="text-muted text-[10px]">→</span>}
            </li>
          );
        })}
      </ol>

      {/* 現在ステップの理由・補足 */}
      {STEP_ORDER.map((key) => {
        const step = state.steps[key];
        if ((step.state === "current" || step.state === "blocked") && step.detail) {
          return (
            <div
              key={key}
              className={`mt-4 rounded-lg border px-3 py-2 text-xs ${
                step.state === "blocked"
                  ? "border-danger/20 bg-danger-dim text-danger-text"
                  : "border-accent/20 bg-accent-dim text-accent-text"
              }`}
            >
              <span className="font-semibold">{STEP_LABEL[key]}:</span> {step.detail}
            </div>
          );
        }
        return null;
      })}

      {/* ── アクション領域 ───────────────────────────── */}
      <div className="mt-4 space-y-3">
        {/* 証明書ステップ: 発行 / 写真追加 / 1タップ発行への導線 */}
        {(state.steps.certificate.state === "current" || state.steps.certificate.state === "blocked") && (
          <div className="flex flex-wrap gap-2">
            {!certificate ? (
              <Link
                href={`/admin/certificates/new?reservation_id=${reservationId}`}
                className="btn-primary text-sm px-4 py-2"
              >
                🪪 証明書を発行
              </Link>
            ) : certificate.status !== "active" &&
              certificate.hasBeforePhoto &&
              certificate.hasAfterPhoto &&
              certificate.public_id ? (
              // 施工前後写真が揃った下書き: 承認インボックスと同じ 1 タップ発行
              <MutationGuard>
                <button
                  onClick={issueCertificate}
                  disabled={issuing}
                  className="btn-primary text-sm px-4 py-2 disabled:opacity-50"
                >
                  {issuing ? "発行中…" : "🪪 証明書を発行する"}
                </button>
              </MutationGuard>
            ) : (
              <Link href={`/admin/certificates/${certificate.id}`} className="btn-secondary text-sm px-4 py-2">
                📷 施工前後の写真を追加
              </Link>
            )}
          </div>
        )}

        {/* 発行後フォロー（証明書発行後の顧客フォロー連絡）の状態 */}
        {certificate && followUp && (
          <div className="text-xs text-muted">
            <span className="font-semibold text-secondary">フォロー:</span> {followUp.detail}
          </div>
        )}

        {/* サインステップ */}
        {state.steps.signature.state === "current" && (
          <div className="rounded-lg border border-border-default bg-inset p-3 space-y-3">
            {signoff.status === "not_requested" && state.canRequestSignature && (
              <>
                <div className="text-xs text-secondary">
                  お客様に受領サイン (電子署名) を依頼します。ご本人確認は登録電話番号の下4桁で行います。
                  ご不在の場合はメール/リンクで <strong>24時間以内</strong> にサインいただけます。
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="email"
                    inputMode="email"
                    placeholder="送信先メール (任意)"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="rounded-md border border-border-default bg-surface px-2 py-1.5 text-xs text-primary w-56"
                  />
                  <MutationGuard>
                    <button
                      onClick={requestSignature}
                      disabled={busy}
                      className="btn-primary text-sm px-4 py-2 disabled:opacity-50"
                    >
                      {busy ? "依頼作成中…" : "✍️ 受領サインを依頼"}
                    </button>
                  </MutationGuard>
                </div>
              </>
            )}

            {signoff.status === "awaiting" && (
              <>
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="text-xs text-secondary">
                    お客様の署名待ちです。
                    {signoff.deadline && (
                      <>
                        {" "}
                        サイン期限:{" "}
                        <strong className={signoff.overdue ? "text-danger-text" : "text-primary"}>
                          {fmtDeadline(signoff.deadline)}
                        </strong>
                      </>
                    )}
                  </span>
                </div>
                {signAbsoluteUrl && (
                  <div className="flex flex-wrap items-center gap-2">
                    <code className="flex-1 min-w-0 truncate rounded-md border border-border-default bg-surface px-2 py-1.5 text-[11px] text-secondary">
                      {signAbsoluteUrl}
                    </code>
                    <button onClick={() => copyLink(sign_link!.url)} className="btn-secondary text-xs px-3 py-1.5">
                      {copied ? "コピー済" : "リンクをコピー"}
                    </button>
                    <a
                      href={signAbsoluteUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn-secondary text-xs px-3 py-1.5"
                    >
                      店頭で開く
                    </a>
                  </div>
                )}
                <MutationGuard>
                  <button
                    onClick={requestSignature}
                    disabled={busy}
                    className="text-xs text-muted underline hover:text-primary disabled:opacity-50"
                  >
                    {busy ? "処理中…" : "メールを再送 / リンクを再発行"}
                  </button>
                </MutationGuard>
              </>
            )}
          </div>
        )}

        {/* サイン完了 */}
        {state.steps.signature.state === "done" && (
          <div className="rounded-lg border border-success/20 bg-success-dim px-3 py-2 text-xs text-success-text">
            ✅ お客様の受領サインが完了しました
            {signoff.signed_off_at && <>（{fmtDeadline(signoff.signed_off_at)}）</>}。 署名内容は暗号署名 +
            ブロックチェーンで改ざん不能に保全されます。
          </div>
        )}

        {/* お会計 (顧客区分 × サイクルで自動判定) */}
        {state.steps.payment.state === "blocked" && customer.id && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-danger-text">法人の支払いサイクルが未設定です:</span>
            <Link href={`/admin/customers/${customer.id}`} className="btn-secondary text-xs px-3 py-1.5">
              👤 顧客管理で設定
            </Link>
          </div>
        )}
        {state.steps.payment.state === "deferred" && (
          <div className="rounded-lg border border-border-default bg-inset px-3 py-2 text-xs text-muted">
            ⏭ 合算 (締め払い) 契約のため、この案件でのお会計はスキップし後日まとめて請求します。
          </div>
        )}
        {state.steps.payment.state === "current" && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted">お会計:</span>
            <Link href={`/admin/pos?reservation_id=${reservationId}`} className="btn-secondary text-xs px-3 py-1.5">
              💰 その場会計 (POS)
            </Link>
            <Link
              href={`/admin/invoices/new?reservation_id=${reservationId}`}
              className="btn-secondary text-xs px-3 py-1.5"
            >
              🧾 後日請求 (請求書)
            </Link>
          </div>
        )}

        {err && (
          <div className="rounded-lg border border-danger/20 bg-danger-dim px-3 py-2 text-xs text-danger-text">
            {err}
          </div>
        )}
      </div>
    </Card>
  );
}
