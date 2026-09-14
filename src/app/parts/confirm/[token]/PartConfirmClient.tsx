"use client";

import React, { useState, useEffect, useCallback } from "react";
import RaiseConcernButton from "@/components/customer/RaiseConcernButton";

/**
 * 納車時の顧客確認画面（公開・未認証）。
 *  pending        → OTP 入力（電話所持証明）
 *  otp_verified   → 内容確認 → 電子署名で確定
 *  signed         → 確定済み
 *
 * 確定後は DB の完全凍結により誰も内容を変更できない旨を明示する。
 * 設計: docs/parts-installation-integrity-design.md §6.4
 */

type Phase = "loading" | "not_found" | "error" | "otp" | "review" | "submitting" | "complete" | "already";

interface PartSummary {
  part_name: string;
  quantity: number;
  unit: string;
  amount_jpy: number | null;
}

interface SessionData {
  status: string;
  channel: string | null;
  expires_at: string | null;
  part: PartSummary | null;
}

function yen(n: number | null): string {
  if (n == null) return "—";
  return `¥${n.toLocaleString("ja-JP")}`;
}

export default function PartConfirmClient({ token }: { token: string }) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [session, setSession] = useState<SessionData | null>(null);
  const [code, setCode] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const applyStatus = useCallback((data: SessionData) => {
    setSession(data);
    switch (data.status) {
      case "pending":
        setPhase("otp");
        break;
      case "otp_verified":
        setPhase("review");
        break;
      case "signed":
        setPhase("already");
        break;
      default:
        setErrorMsg("この確認は無効か、期限切れです。");
        setPhase("error");
    }
  }, []);

  const fetchSession = useCallback(async () => {
    try {
      const res = await fetch(`/api/parts/confirmations/${token}`);
      if (res.status === 404) {
        setPhase("not_found");
        return;
      }
      const json = (await res.json()) as SessionData;
      if (!res.ok) {
        setErrorMsg("エラーが発生しました。");
        setPhase("error");
        return;
      }
      applyStatus(json);
    } catch {
      setErrorMsg("通信エラーが発生しました。もう一度お試しください。");
      setPhase("error");
    }
  }, [token, applyStatus]);

  useEffect(() => {
    fetchSession();
  }, [fetchSession]);

  const submitOtp = async () => {
    if (!/^\d{6}$/.test(code)) {
      setErrorMsg("OTP は数字6桁で入力してください。");
      return;
    }
    setErrorMsg("");
    setPhase("submitting");
    try {
      const res = await fetch(`/api/parts/confirmations/${token}/verify-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const json = await res.json();
      if (!res.ok || json.ok === false) {
        setErrorMsg(json.reason ?? "OTP が一致しません。");
        setPhase("otp");
        return;
      }
      setPhase("review");
    } catch {
      setErrorMsg("通信エラーが発生しました。");
      setPhase("otp");
    }
  };

  const submitSign = async () => {
    if (!agreed) return;
    setErrorMsg("");
    setPhase("submitting");
    try {
      const res = await fetch(`/api/parts/confirmations/${token}/sign`, { method: "POST" });
      const json = await res.json();
      if (!res.ok || json.ok === false) {
        setErrorMsg(json.reason ?? "確定に失敗しました。");
        setPhase("review");
        return;
      }
      setPhase("complete");
    } catch {
      setErrorMsg("通信エラーが発生しました。");
      setPhase("review");
    }
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-6 px-5 py-10">
      <header className="text-center">
        <h1 className="text-xl font-bold text-gray-900">部品交換の確認</h1>
        <p className="mt-1 text-sm text-gray-500">交換した部品の内容をご確認のうえ、電子署名で確定してください。</p>
      </header>

      {phase === "loading" && <p className="text-center text-gray-500">読み込み中…</p>}

      {phase === "not_found" && (
        <Card tone="error">
          <p className="font-medium">確認リンクが見つかりません。</p>
          <p className="mt-1 text-sm">URL をご確認いただくか、店舗へお問い合わせください。</p>
        </Card>
      )}

      {phase === "error" && (
        <Card tone="error">
          <p>{errorMsg || "エラーが発生しました。"}</p>
        </Card>
      )}

      {phase === "already" && (
        <Card tone="ok">
          <p className="font-medium">この部品交換は既に確定済みです。</p>
          <p className="mt-1 text-sm">確定後の内容は変更できません。</p>
        </Card>
      )}

      {(phase === "otp" || phase === "review" || phase === "submitting") && session?.part && (
        <PartCard part={session.part} />
      )}

      {phase === "otp" && (
        <section className="flex flex-col gap-3">
          <p className="text-sm text-gray-600">
            ご本人確認のため、{session?.channel === "line" ? "LINE" : "SMS"}に届いた6桁の確認コードを入力してください。
          </p>
          <input
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder="123456"
            className="w-full rounded-lg border border-gray-300 px-4 py-3 text-center text-2xl tracking-[0.4em] focus:border-blue-500 focus:outline-none"
          />
          {errorMsg && <p className="text-sm text-red-600">{errorMsg}</p>}
          <button
            onClick={submitOtp}
            disabled={code.length !== 6}
            className="rounded-lg bg-blue-600 px-4 py-3 font-medium text-white disabled:opacity-40"
          >
            確認コードを認証
          </button>
        </section>
      )}

      {phase === "review" && (
        <section className="flex flex-col gap-3">
          <label className="flex items-start gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-1" />
            <span>上記の部品が実際に交換・装着されたことを確認しました。電子署名で確定します。</span>
          </label>
          <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
            確定すると内容は記録として固定され、店舗・運営を含め誰も変更できなくなります。
          </p>
          {errorMsg && <p className="text-sm text-red-600">{errorMsg}</p>}
          <button
            onClick={submitSign}
            disabled={!agreed}
            className="rounded-lg bg-blue-600 px-4 py-3 font-medium text-white disabled:opacity-40"
          >
            電子署名で確定する
          </button>
        </section>
      )}

      {phase === "submitting" && <p className="text-center text-gray-500">処理中…</p>}

      {phase === "complete" && (
        <Card tone="ok">
          <p className="font-medium">確定が完了しました。</p>
          <p className="mt-1 text-sm">ご確認ありがとうございました。内容は改ざん不能な記録として保存されました。</p>
        </Card>
      )}

      {/* IMP-026: 気になる点を伝える */}
      {(phase === "otp" || phase === "review" || phase === "complete" || phase === "already") && (
        <RaiseConcernButton sourceType="parts_confirmation" sourceToken={token} variant="light" />
      )}
    </main>
  );
}

function PartCard({ part }: { part: PartSummary }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-medium text-gray-400">交換部品</p>
      <p className="mt-1 text-lg font-bold text-gray-900">{part.part_name}</p>
      <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
        <div>
          <dt className="text-gray-400">数量</dt>
          <dd className="font-medium text-gray-900">
            {part.quantity} {part.unit}
          </dd>
        </div>
        <div>
          <dt className="text-gray-400">金額（税込）</dt>
          <dd className="font-medium text-gray-900">{yen(part.amount_jpy)}</dd>
        </div>
      </dl>
    </div>
  );
}

function Card({ tone, children }: { tone: "ok" | "error"; children: React.ReactNode }) {
  const cls = tone === "ok" ? "border-green-200 bg-green-50 text-green-800" : "border-red-200 bg-red-50 text-red-800";
  return <div className={`rounded-xl border px-4 py-4 ${cls}`}>{children}</div>;
}
