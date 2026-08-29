"use client";

import { useState } from "react";

const STATUS_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  submitted: { label: "申請済み", color: "text-secondary", bg: "bg-inset" },
  under_review: { label: "審査中", color: "text-accent", bg: "bg-blue-50" },
  approved: { label: "承認済み", color: "text-emerald-700", bg: "bg-emerald-50" },
  rejected: { label: "却下", color: "text-red-600", bg: "bg-red-50" },
};

type StatusResult = {
  status: string;
  created_at: string;
  updated_at: string;
  rejection_reason: string | null;
};

export default function AgentApplyStatusPage() {
  const [applicationNumber, setApplicationNumber] = useState("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<StatusResult | null>(null);

  const handleCheck = async () => {
    setError(null);
    setResult(null);

    if (!applicationNumber.trim() || !email.trim()) {
      setError("申請番号とメールアドレスを入力してください");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/agent/apply/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          application_number: applicationNumber.trim(),
          email: email.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || "照会に失敗しました");
        return;
      }
      setResult(data);
    } catch {
      setError("照会に失敗しました");
    } finally {
      setLoading(false);
    }
  };

  const statusInfo = result ? STATUS_LABELS[result.status] : null;

  return (
    <main className="min-h-screen flex items-center justify-center bg-base p-6">
      <div className="glass-card w-full max-w-md space-y-6 p-8">
        {/* Branding */}
        <div className="flex items-center justify-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-accent flex items-center justify-center text-white font-bold text-lg">
            C
          </div>
          <span className="text-xl font-bold text-primary tracking-wide">Ledra</span>
        </div>

        <div className="text-center">
          <h1 className="text-xl font-bold text-primary">申請状況の確認</h1>
          <p className="text-sm text-muted mt-1">申請番号とメールアドレスで申請状況を確認できます。</p>
        </div>

        <div className="grid gap-4">
          <label>
            <div className="text-sm text-secondary mb-1">申請番号</div>
            <input
              value={applicationNumber}
              onChange={(e) => setApplicationNumber(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCheck()}
              className="input-field w-full font-mono"
              placeholder="AGT-20260327-A1B2"
            />
          </label>

          <label>
            <div className="text-sm text-secondary mb-1">メールアドレス</div>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCheck()}
              className="input-field w-full"
              placeholder="email@example.com"
            />
          </label>

          {error && <p className="text-sm text-red-500">{error}</p>}

          <button onClick={handleCheck} disabled={loading} className="btn-primary w-full">
            {loading ? "照会中..." : "照会する"}
          </button>
        </div>

        {result && statusInfo && (
          <div className="space-y-4">
            <div className={`rounded-xl p-4 ${statusInfo.bg}`}>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted">ステータス</span>
                <span className={`font-bold ${statusInfo.color}`}>{statusInfo.label}</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-muted">申請日</p>
                <p className="text-primary font-medium">{new Date(result.created_at).toLocaleDateString("ja-JP")}</p>
              </div>
              <div>
                <p className="text-muted">最終更新</p>
                <p className="text-primary font-medium">{new Date(result.updated_at).toLocaleDateString("ja-JP")}</p>
              </div>
            </div>

            {result.status === "rejected" && result.rejection_reason && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <p className="text-sm text-muted mb-1">却下理由</p>
                <p className="text-sm text-red-700 whitespace-pre-wrap">{result.rejection_reason}</p>
                <a href="/agent/apply" className="inline-block mt-3 text-sm text-accent hover:underline">
                  再申請はこちら
                </a>
              </div>
            )}

            {result.status === "approved" && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
                <p className="text-sm text-emerald-700">
                  申請が承認されました。ログイン情報をメールでお送りしています。
                </p>
                <a href="/agent/login" className="inline-block mt-2 text-sm text-accent hover:underline">
                  ログインはこちら
                </a>
              </div>
            )}
          </div>
        )}

        <p className="text-center text-sm text-muted">
          <a href="/agent/apply" className="text-accent hover:underline">
            新規申請
          </a>
          {" | "}
          <a href="/agent/login" className="text-accent hover:underline">
            ログイン
          </a>
        </p>
      </div>
    </main>
  );
}
