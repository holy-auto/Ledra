"use client";

import { useState, useEffect, useCallback } from "react";

type Phase =
  | "loading"
  | "form"
  | "submitting"
  | "complete"
  | "expired"
  | "already_signed"
  | "not_found"
  | "error";

type ContractInfo = {
  request_id: string;
  template_type: string;
  template_label: string;
  title: string;
  signer_name: string | null;
  expires_at: string | null;
};

type CompleteData = {
  signed_at: string;
  session_id: string;
  signature_preview: string;
};

export default function AgentSignClient({ token }: { token: string }) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [contract, setContract] = useState<ContractInfo | null>(null);
  const [complete, setComplete] = useState<CompleteData | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [signerEmail, setSignerEmail] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [timeLeft, setTimeLeft] = useState("");

  const fetchContract = useCallback(async () => {
    try {
      const res = await fetch(`/api/agent-sign/${token}`);
      const json = await res.json();

      if (!res.ok || json.status === "not_found") {
        setPhase("not_found");
        return;
      }

      switch (json.status) {
        case "pending":
          setContract(json);
          setSignerEmail(json.signer_name ? "" : "");
          setPhase("form");
          break;
        case "expired":
          setPhase("expired");
          break;
        case "already_signed":
          setPhase("already_signed");
          break;
        default:
          setPhase("not_found");
      }
    } catch {
      setErrorMsg("通信エラーが発生しました。");
      setPhase("error");
    }
  }, [token]);

  useEffect(() => {
    fetchContract();
  }, [fetchContract]);

  // 残り時間カウントダウン
  useEffect(() => {
    if (phase !== "form" || !contract?.expires_at) return;

    const update = () => {
      const diff = new Date(contract.expires_at!).getTime() - Date.now();
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
  }, [phase, contract?.expires_at]);

  const handleSign = async () => {
    if (!agreed || !signerEmail.includes("@")) return;
    setPhase("submitting");
    setErrorMsg("");

    try {
      const res = await fetch(`/api/agent-sign/${token}`, {
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

      setComplete(json);
      setPhase("complete");
    } catch {
      setErrorMsg("通信エラーが発生しました。もう一度お試しください。");
      setPhase("form");
    }
  };

  if (phase === "loading") {
    return (
      <Shell>
        <div className="flex flex-col items-center justify-center py-24">
          <div className="w-10 h-10 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mb-4" />
          <p className="text-gray-400 text-sm">読み込み中...</p>
        </div>
      </Shell>
    );
  }

  if (phase === "not_found" || phase === "error") {
    return (
      <Shell>
        <StatusCard
          icon="❌"
          title="リンクが見つかりません"
          message={errorMsg || "この署名リンクは無効です。本部にお問い合わせください。"}
        />
      </Shell>
    );
  }

  if (phase === "expired") {
    return (
      <Shell>
        <StatusCard
          icon="⏰"
          title="有効期限切れ"
          message="この署名リンクの有効期限が切れています。本部に再送を依頼してください。"
        />
      </Shell>
    );
  }

  if (phase === "already_signed") {
    return (
      <Shell>
        <StatusCard
          icon="✅"
          title="署名済み"
          message="この契約書はすでに署名されています。"
        />
      </Shell>
    );
  }

  if (phase === "complete" && complete) {
    return (
      <Shell>
        <div className="space-y-4">
          <div className="text-center py-4">
            <div className="text-5xl mb-3">✅</div>
            <h2 className="text-white text-2xl font-bold mb-2">署名が完了しました</h2>
            <p className="text-gray-400 text-sm">
              電子署名法に基づく電子署名が正常に記録されました
            </p>
          </div>

          <div className="bg-gray-900 rounded-2xl border border-gray-800 p-5">
            <h3 className="text-gray-300 text-sm font-medium mb-3">署名情報</h3>
            <dl className="space-y-2">
              <InfoRow
                label="契約書"
                value={contract?.title ?? ""}
              />
              <InfoRow
                label="署名日時"
                value={new Date(complete.signed_at).toLocaleString("ja-JP")}
              />
              <InfoRow
                label="署名値（省略）"
                value={complete.signature_preview}
                mono
              />
              <InfoRow
                label="セッション ID"
                value={complete.session_id}
                mono
              />
            </dl>
          </div>

          <p className="text-center text-gray-600 text-xs leading-relaxed">
            本署名は電子署名法（平成12年法律第102号）第2条に基づく電子署名です。
            <br />
            署名証跡は Ledra のサーバーに安全に保管されます。
          </p>
        </div>
      </Shell>
    );
  }

  // 署名フォーム
  return (
    <Shell>
      <div className="space-y-4">
        {/* 契約書情報カード */}
        <div className="bg-gray-900 rounded-2xl border border-gray-800 p-5">
          <div className="flex items-center gap-2 mb-4">
            <span className="w-2 h-2 rounded-full bg-blue-500 inline-block" />
            <span className="text-gray-300 text-sm font-medium">契約書の詳細</span>
          </div>
          <dl className="space-y-3">
            <InfoRow label="種別" value={contract?.template_label ?? ""} />
            <InfoRow label="タイトル" value={contract?.title ?? ""} />
            {contract?.signer_name && (
              <InfoRow label="署名者" value={contract.signer_name} />
            )}
          </dl>
        </div>

        {/* 署名フォーム */}
        <div className="bg-gray-900 rounded-2xl border border-gray-800 p-5">
          <h2 className="text-white font-semibold mb-4">署名情報の入力</h2>

          <label className="block mb-4">
            <span className="text-gray-400 text-sm mb-1 block">
              メールアドレス
              <span className="text-red-400 ml-1">*</span>
            </span>
            <input
              type="email"
              value={signerEmail}
              onChange={(e) => setSignerEmail(e.target.value)}
              placeholder="example@email.com"
              autoComplete="email"
              disabled={phase === "submitting"}
              className="w-full bg-gray-800 text-white border border-gray-700 rounded-lg px-4 py-3
                         focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500
                         placeholder-gray-600 text-base disabled:opacity-50"
            />
            <p className="text-gray-500 text-xs mt-1">署名の証跡として記録されます</p>
          </label>

          <label className="flex items-start gap-3 cursor-pointer mb-6">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              disabled={phase === "submitting"}
              className="mt-0.5 w-5 h-5 rounded border-gray-600 bg-gray-800 text-blue-500
                         focus:ring-blue-500 focus:ring-2 cursor-pointer shrink-0"
            />
            <span className="text-gray-300 text-sm leading-relaxed">
              上記の契約書の内容を確認しました。
              <br />
              本内容に同意の上、電子署名を行います。
            </span>
          </label>

          {errorMsg && (
            <div className="mb-4 p-3 bg-red-950 border border-red-800 rounded-lg text-red-300 text-sm">
              {errorMsg}
            </div>
          )}

          <button
            onClick={handleSign}
            disabled={!agreed || !signerEmail.includes("@") || phase === "submitting"}
            className="w-full py-4 rounded-xl font-bold text-base transition-all
                       bg-blue-600 hover:bg-blue-500 text-white
                       disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed
                       focus:outline-none focus:ring-2 focus:ring-blue-500"
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

          {timeLeft && (
            <p className="text-center text-gray-500 text-xs mt-3">{timeLeft}</p>
          )}
        </div>

        <p className="text-center text-gray-600 text-xs leading-relaxed px-2">
          本署名は電子署名法（平成12年法律第102号）第2条に基づく電子署名です。
          <br />
          署名後は内容の変更ができません。
        </p>
      </div>
    </Shell>
  );
}

// ── サブコンポーネント ──────────────────────────────────────

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-start py-8 px-4">
      <div className="w-full max-w-md">
        <div className="mb-6">
          <span className="text-blue-400 font-bold text-xl tracking-wide">Ledra</span>
          <h1 className="text-white text-2xl font-bold mt-1">代理店契約書 電子署名</h1>
          <p className="text-gray-400 text-sm mt-1">
            契約書の内容を確認し、電子署名を行ってください
          </p>
        </div>
        {children}
      </div>
    </div>
  );
}

function StatusCard({
  icon, title, message,
}: {
  icon: string; title: string; message: string;
}) {
  return (
    <div className="text-center py-16">
      <div className="text-5xl mb-4">{icon}</div>
      <h2 className="text-white text-2xl font-bold mb-3">{title}</h2>
      <p className="text-gray-400 text-base leading-relaxed">{message}</p>
      <p className="mt-8 text-gray-600 text-sm">
        <span className="text-blue-400 font-semibold">Ledra</span> 電子署名システム
      </p>
    </div>
  );
}

function InfoRow({
  label, value, mono,
}: {
  label: string; value: string; mono?: boolean;
}) {
  return (
    <div className="flex justify-between items-start gap-3">
      <dt className="text-gray-500 text-sm shrink-0">{label}</dt>
      <dd className={`text-gray-200 text-sm text-right ${mono ? "font-mono text-xs" : ""}`}>
        {value}
      </dd>
    </div>
  );
}
