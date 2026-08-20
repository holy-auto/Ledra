"use client";

import React, { useState, useEffect, useCallback } from "react";
import ReceiptOnboardingTour from "./ReceiptOnboardingTour";
import RaiseConcernButton from "@/components/customer/RaiseConcernButton";

type Phase = "loading" | "error" | "expired" | "already_signed" | "cancelled" | "form" | "submitting" | "complete";

interface SessionData {
  status: "pending";
  session_id: string;
  signer_name: string | null;
  expires_at: string;
  secondary_factor_required: boolean;
  secondary_factor_attempts_left: number;
  pdf_url: string | null;
  certificate: {
    id: string;
    public_id: string;
    cert_type: string | null;
    service_type: string | null;
    created_at: string;
    customer_name: string | null;
    vehicles: { car_number: string | null; car_name: string | null } | null;
    stores: { name: string } | null;
  } | null;
  consent: {
    version: string;
    text: string;
  };
}

interface CompleteData {
  signed_at: string;
  verify_url: string;
  session_id: string;
  signature_preview: string;
  consent_version: string;
}

export default function DeliveryReceiptClient({ token }: { token: string }) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [session, setSession] = useState<SessionData | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [signerEmail, setSignerEmail] = useState("");
  const [phoneLast4, setPhoneLast4] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [completeData, setCompleteData] = useState<CompleteData | null>(null);
  const [timeLeft, setTimeLeft] = useState("");
  const [attemptsLeft, setAttemptsLeft] = useState<number | null>(null);

  const fetchSession = useCallback(async () => {
    try {
      const res = await fetch(`/api/signature/delivery-receipt/session/${token}`);
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

  // 残り時間カウントダウン
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
      const res = await fetch(`/api/signature/delivery-receipt/sign/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signer_email: signerEmail, phone_last4: phoneLast4, agreed }),
      });
      const json = await res.json();

      if (!res.ok) {
        setErrorMsg(json.message ?? "署名に失敗しました");
        // 試行回数失敗の場合は残数を更新するためセッションを再取得
        if (res.status === 403) {
          await fetchSession();
        } else {
          setPhase("form");
        }
        return;
      }

      setCompleteData(json);
      setPhase("complete");
    } catch {
      setErrorMsg("通信エラーが発生しました。もう一度お試しください。");
      setPhase("form");
    }
  };

  if (phase === "loading") return <LoadingScreen />;
  if (phase === "error") return <StatusScreen icon="❌" title="エラー" message={errorMsg} />;
  if (phase === "expired")
    return (
      <StatusScreen
        icon="⏰"
        title="有効期限切れ"
        message="この受領サインリンクの有効期限が切れています。施工店に再送を依頼してください。"
      />
    );
  if (phase === "already_signed")
    return <StatusScreen icon="✅" title="受領サイン済み" message="この受領サインはすでに完了しています。" />;
  if (phase === "cancelled")
    return (
      <StatusScreen
        icon="🚫"
        title="無効なリンク"
        message="このリンクは無効化されています。施工店にリンクの再発行を依頼してください。"
      />
    );
  if (phase === "complete" && completeData) return <CompleteScreen data={completeData} />;

  const cert = session?.certificate;

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-start py-8 px-4">
      {/* 初回アクセス時のみ表示されるオンボーディングツアー (form フェーズに入ったら起動) */}
      <ReceiptOnboardingTour enabled={phase === "form"} />

      <div className="w-full max-w-md mb-6">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-blue-400 font-bold text-xl tracking-wide">Ledra</span>
        </div>
        <h1 className="text-white text-2xl font-bold">受領サイン</h1>
        <p className="text-gray-200 text-sm mt-1">作業完了の内容をご確認の上、受領サインをお願いします</p>
      </div>

      {/* 受領内容カード */}
      <div
        data-tour="receipt-content"
        className="w-full max-w-md bg-gray-900 rounded-2xl border border-gray-800 p-5 mb-4"
      >
        <div className="flex items-center gap-2 mb-4">
          <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />
          <span className="text-gray-300 text-sm font-medium">作業完了内容</span>
        </div>
        <dl className="space-y-3">
          {cert?.stores?.name && <InfoRow label="施工店" value={cert.stores.name} />}
          {cert?.customer_name && <InfoRow label="お客様" value={cert.customer_name} />}
          {cert?.vehicles?.car_name && <InfoRow label="車種" value={cert.vehicles.car_name} />}
          {cert?.vehicles?.car_number && <InfoRow label="車両番号" value={cert.vehicles.car_number} />}
          {cert?.cert_type && <InfoRow label="施工種別" value={cert.cert_type} />}
          {cert?.service_type && <InfoRow label="サービス" value={cert.service_type} />}
          {cert?.created_at && (
            <InfoRow label="証明書発行日" value={new Date(cert.created_at).toLocaleDateString("ja-JP")} />
          )}
        </dl>

        {session?.pdf_url && (
          <a
            href={session.pdf_url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 flex items-center gap-2 text-blue-400 text-sm hover:underline"
          >
            <span>📄</span>
            <span>施工内容 PDF を確認する (別タブで開く)</span>
          </a>
        )}
      </div>

      {/* 署名フォーム */}
      <div className="w-full max-w-md bg-gray-900 rounded-2xl border border-gray-800 p-5 mb-4">
        <h2 className="text-white font-semibold mb-4">受領サイン情報</h2>

        {/* メール */}
        <label data-tour="receipt-email" className="block mb-4">
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
          <p className="text-gray-300 text-xs mt-1">受領サインの証跡として記録されます</p>
        </label>

        {/* 電話番号下4桁 (本人確認) */}
        <label data-tour="receipt-phone" className="block mb-4">
          <span className="text-gray-200 text-sm mb-1 block">
            ご登録の電話番号 下4桁
            <span className="text-red-400 ml-1">*</span>
          </span>
          <input
            type="tel"
            inputMode="numeric"
            pattern="\d{4}"
            maxLength={4}
            value={phoneLast4}
            onChange={(e) => setPhoneLast4(e.target.value.replace(/[^\d]/g, "").slice(0, 4))}
            placeholder="1234"
            autoComplete="off"
            className="w-full bg-gray-800 text-white border border-gray-700 rounded-lg px-4 py-3
                       focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500
                       placeholder-gray-600 text-base tracking-widest font-mono"
          />
          <p className="text-gray-300 text-xs mt-1">
            ご本人確認のため、施工依頼時にご登録いただいた電話番号の下4桁を入力してください。
            {attemptsLeft !== null && attemptsLeft < 3 && (
              <span className="text-amber-400 block mt-1">残り入力可能回数: {attemptsLeft} 回</span>
            )}
          </p>
        </label>

        {/* 同意文言ボックス + 同意チェックボックスを 1 つのツアー対象でまとめる */}
        <div data-tour="receipt-consent">
          {session?.consent?.text && (
            <div className="mb-4 p-3 bg-gray-950 border border-gray-800 rounded-lg">
              <p className="text-gray-200 text-xs leading-relaxed whitespace-pre-line">{session.consent.text}</p>
            </div>
          )}

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
              上記内容を確認し、同意の上で受領サイン (電子署名) を行います。
            </span>
          </label>
        </div>

        {errorMsg && (
          <div className="mb-4 p-3 bg-red-950 border border-red-800 rounded-lg text-red-300 text-sm">{errorMsg}</div>
        )}

        <button
          data-tour="receipt-submit"
          onClick={handleSign}
          disabled={!canSubmit}
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
            "✍️ 受領サインを行う"
          )}
        </button>

        {timeLeft && <p className="text-center text-gray-300 text-xs mt-3">{timeLeft}</p>}
      </div>

      {/* IMP-026: 気になる点を伝える */}
      <div className="w-full max-w-md mb-4">
        <RaiseConcernButton sourceType="delivery_receipt" sourceToken={token} variant="dark" />
      </div>

      <div className="w-full max-w-md text-center text-gray-600 text-xs leading-relaxed px-2">
        本受領サインは電子署名法 (平成12年法律第102号) 第2条に基づく電子署名です。
        <br />
        署名後は内容の変更ができません。
      </div>
    </div>
  );
}

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
          <span className="text-blue-400 font-semibold">Ledra</span> 受領サインシステム
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
        <div className="text-center mb-6">
          <div className="text-5xl mb-3">✅</div>
          <h1 className="text-white text-2xl font-bold mb-2">受領サインが完了しました</h1>
          <p className="text-gray-200 text-sm">電子署名法に基づく受領サインが正常に記録されました</p>
        </div>

        <div className="bg-gray-900 rounded-2xl border border-gray-800 p-5 mb-4">
          <h2 className="text-gray-300 text-sm font-medium mb-3">受領サイン情報</h2>
          <dl className="space-y-2">
            <InfoRow label="サイン日時" value={new Date(data.signed_at).toLocaleString("ja-JP")} />
            <InfoRow label="同意文言バージョン" value={data.consent_version} mono />
            <InfoRow label="署名値 (省略)" value={data.signature_preview} mono />
          </dl>
        </div>

        <div className="bg-gray-900 rounded-2xl border border-gray-800 p-5 mb-4">
          <h2 className="text-gray-300 text-sm font-medium mb-3">受領サインの検証</h2>
          <p className="text-gray-300 text-xs mb-3">以下の URL から第三者がいつでも有効性を確認できます</p>
          <div className="bg-gray-800 rounded-lg p-3 mb-3">
            <p className="text-blue-300 text-xs break-all font-mono">{data.verify_url}</p>
          </div>
          <button
            onClick={copyVerifyUrl}
            className="w-full py-2.5 rounded-lg border border-gray-700 text-gray-300 text-sm
                       hover:bg-gray-800 transition-colors"
          >
            {copied ? "✅ コピーしました" : "🔗 検証 URL をコピー"}
          </button>
        </div>

        <p className="text-center text-gray-600 text-xs leading-relaxed">
          本受領サインは電子署名法 (平成12年法律第102号) 第2条に基づく電子署名です。
          <br />
          署名証跡は Ledra のサーバー及び Polygon ブロックチェーンに保管されます。
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
