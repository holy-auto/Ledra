"use client";

import React, { useState, useEffect, useCallback } from "react";
import type { SignaturePageData } from "@/lib/signature/types";

// ============================================================
// 型定義
// ============================================================

type PagePhase = "loading" | "error" | "expired" | "already_signed" | "cancelled" | "form" | "submitting" | "complete";

interface CompleteData {
  signed_at: string;
  verify_url: string;
  session_id: string;
  signature_preview: string;
}

// ============================================================
// メインコンポーネント
// ============================================================

export default function SignatureClient({ token }: { token: string }) {
  const [phase, setPhase] = useState<PagePhase>("loading");
  const [sessionData, setSessionData] = useState<SignaturePageData | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [signerEmail, setSignerEmail] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [completeData, setCompleteData] = useState<CompleteData | null>(null);
  const [timeLeft, setTimeLeft] = useState("");

  // ── セッション情報の取得 ────────────────────────────────────
  const fetchSession = useCallback(async () => {
    try {
      const res = await fetch(`/api/signature/session/${token}`);
      const json = await res.json();

      if (!res.ok) {
        setErrorMsg(json.message ?? "エラーが発生しました");
        setPhase("error");
        return;
      }

      switch (json.status) {
        case "pending":
          setSessionData(json);
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

  // ── 残り時間カウントダウン ──────────────────────────────────
  useEffect(() => {
    if (phase !== "form" || !sessionData?.expires_at) return;

    const update = () => {
      const diff = new Date(sessionData.expires_at).getTime() - Date.now();
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
    const timer = setInterval(update, 30_000);
    return () => clearInterval(timer);
  }, [phase, sessionData?.expires_at]);

  // ── 署名実行 ────────────────────────────────────────────────
  const handleSign = async () => {
    if (!agreed || !signerEmail.includes("@")) return;
    setPhase("submitting");

    try {
      const res = await fetch(`/api/signature/sign/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signer_email: signerEmail, agreed }),
      });
      const json = await res.json();

      if (!res.ok) {
        setErrorMsg(json.message ?? "署名に失敗しました");
        setPhase("form");
        return;
      }

      setCompleteData(json);
      setPhase("complete");
    } catch {
      setErrorMsg("通信エラーが発生しました。もう一度お試しください。");
      setPhase("form");
    }
  };

  // ============================================================
  // 各フェーズのレンダリング
  // ============================================================

  if (phase === "loading") return <LoadingScreen />;

  if (phase === "error") return <StatusScreen icon="❌" title="エラー" message={errorMsg} />;
  if (phase === "expired")
    return (
      <StatusScreen
        icon="⏰"
        title="有効期限切れ"
        message="この署名リンクの有効期限が切れています。施工店に再送を依頼してください。"
      />
    );
  if (phase === "already_signed")
    return <StatusScreen icon="✅" title="署名済み" message="この証明書はすでに署名されています。" />;
  if (phase === "cancelled")
    return <StatusScreen icon="🚫" title="無効なリンク" message="このリンクはキャンセルされています。" />;
  if (phase === "complete" && completeData) return <CompleteScreen data={completeData} />;

  // 署名フォーム
  const cert = sessionData?.certificate;

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-start py-8 px-4">
      {/* ヘッダー */}
      <div className="w-full max-w-md mb-6">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-blue-400 font-bold text-xl tracking-wide">Ledra</span>
        </div>
        <h1 className="text-white text-2xl font-bold">電子署名</h1>
        <p className="text-gray-200 text-sm mt-1">施工証明書の内容を確認し、署名してください</p>
      </div>

      {/* 証明書情報カード */}
      <div className="w-full max-w-md bg-gray-900 rounded-2xl border border-gray-800 p-5 mb-4">
        <div className="flex items-center gap-2 mb-4">
          <span className="w-2 h-2 rounded-full bg-blue-500 inline-block" />
          <span className="text-gray-300 text-sm font-medium">施工証明書の詳細</span>
        </div>
        <dl className="space-y-3">
          {cert?.stores?.name && <InfoRow label="施工店" value={cert.stores.name} />}
          {cert?.vehicles?.car_name && <InfoRow label="車種" value={cert.vehicles.car_name} />}
          {cert?.vehicles?.car_number && <InfoRow label="車両番号" value={cert.vehicles.car_number} />}
          {cert?.cert_type && <InfoRow label="施工種別" value={cert.cert_type} />}
          {cert?.created_at && <InfoRow label="発行日" value={new Date(cert.created_at).toLocaleDateString("ja-JP")} />}
        </dl>

        {/* PDF プレビューリンク */}
        {sessionData?.pdf_url && (
          <a
            href={sessionData.pdf_url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 flex items-center gap-2 text-blue-400 text-sm hover:underline"
          >
            <span>📄</span>
            <span>証明書PDFを確認する（別タブで開く）</span>
          </a>
        )}
      </div>

      {/* 署名フォーム */}
      <div className="w-full max-w-md bg-gray-900 rounded-2xl border border-gray-800 p-5 mb-4">
        <h2 className="text-white font-semibold mb-4">署名情報の入力</h2>

        {/* メールアドレス入力 */}
        <label className="block mb-4">
          <span className="text-gray-200 text-sm mb-1 block">
            メールアドレス
            <span className="text-red-400 ml-1">*</span>
          </span>
          <input
            type="email"
            value={signerEmail}
            onChange={(e) => setSignerEmail(e.target.value)}
            placeholder="example@email.com"
            autoComplete="email"
            className="w-full bg-gray-800 text-white border border-gray-700 rounded-lg px-4 py-3
                       focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500
                       placeholder-gray-600 text-base"
          />
          <p className="text-gray-300 text-xs mt-1">署名の証跡として記録されます</p>
        </label>

        {/* 同意チェックボックス */}
        <label className="flex items-start gap-3 cursor-pointer mb-6">
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            className="mt-0.5 w-5 h-5 rounded border-gray-600 bg-gray-800 text-blue-500
                       focus:ring-blue-500 focus:ring-2 cursor-pointer shrink-0"
          />
          <span className="text-gray-300 text-sm leading-relaxed">
            施工証明書の内容を確認しました。
            <br />
            本内容に同意の上、電子署名を行います。
          </span>
        </label>

        {/* エラーメッセージ */}
        {errorMsg && (
          <div className="mb-4 p-3 bg-red-950 border border-red-800 rounded-lg text-red-300 text-sm">{errorMsg}</div>
        )}

        {/* 署名ボタン */}
        <button
          onClick={handleSign}
          disabled={!agreed || !signerEmail.includes("@") || phase === "submitting"}
          className="w-full py-4 rounded-xl font-bold text-base transition-all
                     bg-blue-600 hover:bg-blue-500 text-white
                     disabled:bg-gray-700 disabled:text-gray-300 disabled:cursor-not-allowed
                     focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
                     focus:ring-offset-gray-900"
        >
          {phase === "submitting" ? (
            <span className="flex items-center justify-center gap-2">
              <span className="animate-spin">⟳</span>
              署名処理中...
            </span>
          ) : (
            "✍️ 署名する"
          )}
        </button>

        {/* 残り時間 */}
        {timeLeft && <p className="text-center text-gray-300 text-xs mt-3">{timeLeft}</p>}
      </div>

      {/* 法的注記 */}
      <div className="w-full max-w-md text-center text-gray-600 text-xs leading-relaxed px-2">
        本署名は電子署名法（平成12年法律第102号）第2条に基づく電子署名です。
        <br />
        署名後は内容の変更ができません。
      </div>
    </div>
  );
}

// ============================================================
// サブコンポーネント
// ============================================================

function LoadingScreen() {
  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center">
      <div className="text-center">
        <div className="w-10 h-10 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-gray-200">読み込み中...</p>
      </div>
    </div>
  );
}

function StatusScreen({ icon, title, message }: { icon: string; title: string; message: string }) {
  return (
    <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-md text-center">
        <div className="text-5xl mb-4">{icon}</div>
        <h1 className="text-white text-2xl font-bold mb-3">{title}</h1>
        <p className="text-gray-200 text-base leading-relaxed">{message}</p>
        <div className="mt-8 text-gray-600 text-sm">
          <span className="text-blue-400 font-semibold">Ledra</span> 電子署名システム
        </div>
      </div>
    </div>
  );
}

function CompleteScreen({ data }: { data: CompleteData }) {
  const [copied, setCopied] = useState(false);

  const copyVerifyUrl = async () => {
    await navigator.clipboard.writeText(data.verify_url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-start py-8 px-4">
      <div className="w-full max-w-md">
        {/* 完了ヘッダー */}
        <div className="text-center mb-6">
          <div className="text-5xl mb-3">✅</div>
          <h1 className="text-white text-2xl font-bold mb-2">署名が完了しました</h1>
          <p className="text-gray-200 text-sm">電子署名法に基づく電子署名が正常に記録されました</p>
        </div>

        {/* 署名情報カード */}
        <div className="bg-gray-900 rounded-2xl border border-gray-800 p-5 mb-4">
          <h2 className="text-gray-300 text-sm font-medium mb-3">署名情報</h2>
          <dl className="space-y-2">
            <InfoRow label="署名日時" value={new Date(data.signed_at).toLocaleString("ja-JP")} />
            <InfoRow label="署名値（省略）" value={data.signature_preview} mono />
          </dl>
        </div>

        {/* 検証URL */}
        <div className="bg-gray-900 rounded-2xl border border-gray-800 p-5 mb-4">
          <h2 className="text-gray-300 text-sm font-medium mb-3">署名の検証</h2>
          <p className="text-gray-300 text-xs mb-3">以下のURLから第三者がいつでも署名の有効性を確認できます</p>
          <div className="bg-gray-800 rounded-lg p-3 mb-3">
            <p className="text-blue-300 text-xs break-all font-mono">{data.verify_url}</p>
          </div>
          <button
            onClick={copyVerifyUrl}
            className="w-full py-2.5 rounded-lg border border-gray-700 text-gray-300 text-sm
                       hover:bg-gray-800 transition-colors"
          >
            {copied ? "✅ コピーしました" : "🔗 検証URLをコピー"}
          </button>
        </div>

        {/* 法的注記 */}
        <p className="text-center text-gray-600 text-xs leading-relaxed">
          本署名は電子署名法（平成12年法律第102号）第2条に基づく電子署名です。
          <br />
          署名証跡は Ledra のサーバーに安全に保管されます。
        </p>
      </div>
    </div>
  );
}

function InfoRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between items-start gap-3">
      <dt className="text-gray-300 text-sm shrink-0">{label}</dt>
      <dd className={`text-gray-200 text-sm text-right ${mono ? "font-mono text-xs" : ""}`}>{value}</dd>
    </div>
  );
}
