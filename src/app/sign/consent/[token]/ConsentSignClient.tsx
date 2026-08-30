"use client";

import React, { useState, useEffect, useCallback } from "react";
import RaiseConcernButton from "@/components/customer/RaiseConcernButton";

type Phase = "loading" | "error" | "expired" | "already_signed" | "cancelled" | "form" | "submitting" | "complete";

interface WorkObj {
  methods?: string;
  parts?: string;
  paint?: string;
  [k: string]: unknown;
}

interface Explanation {
  kind: "pre_work" | "change";
  shop: { name: string | null };
  vehicle: { maker: string | null; model: string | null; plate: string | null } | null;
  work: { planned: WorkObj | null; actual: WorkObj | null; deviation_reason: string | null };
  fees: { estimate_amount: number | null; actual_amount: number | null };
}

interface SessionData {
  status: "pending";
  session_id: string;
  signer_name: string | null;
  expires_at: string;
  secondary_factor_attempts_left: number;
  kind: "pre_work" | "change";
  kind_label: string;
  explanation: Explanation;
  consent: { version: string; text: string };
}

function yen(n: number | null | undefined): string | null {
  if (n == null) return null;
  return `¥${n.toLocaleString("ja-JP")}`;
}

export default function ConsentSignClient({ token }: { token: string }) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [session, setSession] = useState<SessionData | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [signerEmail, setSignerEmail] = useState("");
  const [phoneLast4, setPhoneLast4] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [timeLeft, setTimeLeft] = useState("");
  const [attemptsLeft, setAttemptsLeft] = useState<number | null>(null);
  const [signedAt, setSignedAt] = useState<string>("");

  const fetchSession = useCallback(async () => {
    try {
      const res = await fetch(`/api/signature/body-repair-consent/session/${token}`);
      const json = await res.json();
      if (!res.ok) {
        setErrorMsg(json.message ?? "エラーが発生しました");
        setPhase("error");
        return;
      }
      switch (json.status) {
        case "pending":
          setSession(json as SessionData);
          setAttemptsLeft(json.secondary_factor_attempts_left ?? null);
          setPhase("form");
          break;
        case "signed":
          setPhase("already_signed");
          break;
        case "expired":
          setPhase("expired");
          break;
        case "cancelled":
          setPhase("cancelled");
          break;
        default:
          setErrorMsg(json.message ?? "不明なステータスです");
          setPhase("error");
      }
    } catch {
      setErrorMsg("通信エラーが発生しました。もう一度お試しください。");
      setPhase("error");
    }
  }, [token]);

  useEffect(() => {
    fetchSession();
  }, [fetchSession]);

  useEffect(() => {
    if (phase !== "form" || !session?.expires_at) return;
    const update = () => {
      const diff = new Date(session.expires_at).getTime() - Date.now();
      if (diff <= 0) {
        setTimeLeft("期限切れ");
        setPhase("expired");
        return;
      }
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      setTimeLeft(h > 0 ? `残り ${h}時間${m}分` : `残り ${m}分`);
    };
    update();
    const t = setInterval(update, 30_000);
    return () => clearInterval(t);
  }, [phase, session?.expires_at]);

  const canSubmit = agreed && signerEmail.includes("@") && /^\d{4}$/.test(phoneLast4) && phase !== "submitting";

  const handleSign = async () => {
    if (!canSubmit) return;
    setPhase("submitting");
    setErrorMsg("");
    try {
      const res = await fetch(`/api/signature/body-repair-consent/sign/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signer_email: signerEmail, phone_last4: phoneLast4, agreed }),
      });
      const json = await res.json();
      if (!res.ok) {
        setErrorMsg(json.message ?? "署名に失敗しました");
        // 403 (本人確認失敗/ロック) はセッションを再取得し、phase は fetchSession に委ねる。
        // 上限到達でセッションが cancelled になった場合に form へ戻してしまわないようにする。
        if (res.status === 403) {
          await fetchSession();
          return;
        }
        setPhase("form");
        return;
      }
      setSignedAt(json.signed_at ?? new Date().toISOString());
      setPhase("complete");
    } catch {
      setErrorMsg("通信エラーが発生しました。もう一度お試しください。");
      setPhase("form");
    }
  };

  return (
    <div style={{ maxWidth: 560, margin: "0 auto", padding: "24px 16px", fontFamily: "system-ui, sans-serif" }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>車体整備 同意サイン</h1>

      {phase === "loading" && <p>読み込み中…</p>}
      {phase === "error" && <Notice tone="error" title="エラー" body={errorMsg} />}
      {phase === "expired" && (
        <Notice
          tone="error"
          title="期限切れ"
          body="このリンクの有効期限が切れています。施工店に再送を依頼してください。"
        />
      )}
      {phase === "already_signed" && (
        <Notice tone="ok" title="署名済み" body="この同意はすでに署名されています。ありがとうございました。" />
      )}
      {phase === "cancelled" && (
        <Notice tone="error" title="無効" body="このリンクは無効化されています。施工店にお問い合わせください。" />
      )}

      {phase === "complete" && (
        <Notice
          tone="ok"
          title="同意が完了しました"
          body={`${new Date(signedAt).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })} に電子署名を受け付けました。`}
        />
      )}

      {(phase === "form" || phase === "submitting") && session && (
        <>
          <p style={{ color: "#666", fontSize: 13, marginBottom: 16 }}>
            {session.kind_label}
            {timeLeft && <span style={{ marginLeft: 8 }}>（{timeLeft}）</span>}
          </p>

          {/* 説明内容 */}
          <div style={{ border: "1px solid #e5e5e5", borderRadius: 10, padding: 14, marginBottom: 16, fontSize: 14 }}>
            {session.explanation.shop.name && <Row label="施工店" value={session.explanation.shop.name} />}
            {session.explanation.vehicle && (
              <Row
                label="車両"
                value={
                  [
                    session.explanation.vehicle.maker,
                    session.explanation.vehicle.model,
                    session.explanation.vehicle.plate,
                  ]
                    .filter(Boolean)
                    .join(" ") || "—"
                }
              />
            )}
            <WorkBlock title="作業内容・方法（予定）" work={session.explanation.work.planned} />
            {session.kind === "change" && (
              <WorkBlock title="作業内容・方法（実績）" work={session.explanation.work.actual} />
            )}
            {session.explanation.work.deviation_reason && (
              <Row label="変更理由" value={session.explanation.work.deviation_reason} />
            )}
            {yen(session.explanation.fees.estimate_amount) && (
              <Row label="概算見積" value={yen(session.explanation.fees.estimate_amount)!} />
            )}
            {session.kind === "change" && yen(session.explanation.fees.actual_amount) && (
              <Row label="実績金額" value={yen(session.explanation.fees.actual_amount)!} />
            )}
          </div>

          {/* 同意文言 */}
          <div
            style={{
              background: "#f7f7f8",
              borderRadius: 10,
              padding: 14,
              marginBottom: 16,
              fontSize: 13,
              color: "#333",
            }}
          >
            {session.consent.text}
          </div>

          <label style={{ display: "block", fontSize: 13, marginBottom: 6 }}>メールアドレス</label>
          <input
            type="email"
            value={signerEmail}
            onChange={(e) => setSignerEmail(e.target.value)}
            placeholder="you@example.com"
            style={inputStyle}
          />

          <label style={{ display: "block", fontSize: 13, margin: "12px 0 6px" }}>
            ご登録の電話番号 下4桁（本人確認）
          </label>
          <input
            inputMode="numeric"
            maxLength={4}
            value={phoneLast4}
            onChange={(e) => setPhoneLast4(e.target.value.replace(/\D/g, "").slice(0, 4))}
            placeholder="1234"
            style={inputStyle}
          />
          {attemptsLeft != null && attemptsLeft < 3 && (
            <p style={{ color: "#c00", fontSize: 12, marginTop: 4 }}>残り試行回数: {attemptsLeft} 回</p>
          )}

          <label style={{ display: "flex", alignItems: "center", gap: 8, margin: "14px 0", fontSize: 14 }}>
            <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
            上記の内容に同意します
          </label>

          {errorMsg && <p style={{ color: "#c00", fontSize: 13, marginBottom: 10 }}>{errorMsg}</p>}

          <button
            onClick={handleSign}
            disabled={!canSubmit}
            style={{
              width: "100%",
              padding: "12px 0",
              borderRadius: 8,
              border: "none",
              background: canSubmit ? "#0071e3" : "#aaa",
              color: "#fff",
              fontSize: 15,
              fontWeight: 600,
              cursor: canSubmit ? "pointer" : "not-allowed",
            }}
          >
            {phase === "submitting" ? "送信中…" : "同意してサインする"}
          </button>
          <p style={{ fontSize: 11, color: "#999", marginTop: 10 }}>
            電子署名法（平成12年法律第102号）に基づく電子署名として記録されます。
          </p>

          {/* IMP-026: 気になる点を伝える */}
          <div style={{ marginTop: 16 }}>
            <RaiseConcernButton sourceType="body_repair_consent" sourceToken={token} variant="light" />
          </div>
        </>
      )}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 8,
  border: "1px solid #ccc",
  fontSize: 15,
  boxSizing: "border-box",
};

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", gap: 8, padding: "3px 0" }}>
      <span style={{ color: "#888", minWidth: 96 }}>{label}</span>
      <span style={{ color: "#222" }}>{value}</span>
    </div>
  );
}

function WorkBlock({ title, work }: { title: string; work: WorkObj | null }) {
  if (!work || (!work.methods && !work.parts && !work.paint)) return null;
  return (
    <div style={{ padding: "3px 0" }}>
      <div style={{ color: "#888" }}>{title}</div>
      {work.methods && <div style={{ color: "#222" }}>・内容: {work.methods}</div>}
      {work.parts && <div style={{ color: "#222" }}>・部品: {work.parts}</div>}
      {work.paint && <div style={{ color: "#222" }}>・塗料: {work.paint}</div>}
    </div>
  );
}

function Notice({ tone, title, body }: { tone: "ok" | "error"; title: string; body: string }) {
  return (
    <div
      style={{
        border: `1px solid ${tone === "ok" ? "#9ad" : "#e9a"}`,
        background: tone === "ok" ? "#eef6ff" : "#fff0f0",
        borderRadius: 10,
        padding: 16,
        marginTop: 12,
      }}
    >
      <div style={{ fontWeight: 700, marginBottom: 4 }}>{title}</div>
      <div style={{ fontSize: 14, color: "#333" }}>{body}</div>
    </div>
  );
}
