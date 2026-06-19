"use client";

import { useState } from "react";

/**
 * パスワードを使わないログイン導線。
 *
 *   stage 1 — collapsed: 「メールリンクでログイン」ボタン1つ。
 *   stage 2 — expanded:  メール入力 + 送信。
 *
 * 送信は `/api/auth/magic-link` 経由。サーバー側で SSO 必須ドメインを弾いて
 * から `signInWithOtp` を実行するため、SAML 必須テナントのユーザーが
 * マジックリンクで SSO を回避することを防ぐ。リンクは /auth/callback に
 * 着地し、ユーザーのコンテキストに応じて遷移先が決まる。
 */
export function MagicLinkSignIn({ next }: { next?: string }) {
  const [expanded, setExpanded] = useState(false);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function sendLink() {
    const trimmed = email.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(trimmed)) {
      setError("メールアドレスの形式が正しくありません。");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/magic-link", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: trimmed, next }),
      });
      const data = await res.json().catch(() => ({}));

      if (res.status === 403 && data?.error === "sso_required") {
        setError("このメールアドレスは SSO ログインが必須です。下の「会社の SSO でログイン」をご利用ください。");
        return;
      }
      if (!res.ok) {
        setError("ログインリンクを送信できませんでした。時間をおいて再度お試しください。");
        return;
      }
      setSent(true);
    } catch {
      setError("ネットワークエラーが発生しました。");
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <div className="rounded-lg border border-success/30 bg-success-dim/40 p-3 text-sm text-secondary text-center">
        <span className="font-medium text-primary">{email.trim()}</span> 宛にログインリンクを送信しました。
        メール内のボタンからログインしてください。
      </div>
    );
  }

  if (!expanded) {
    return (
      <button type="button" onClick={() => setExpanded(true)} className="btn-secondary w-full">
        メールリンクでログイン（パスワード不要）
      </button>
    );
  }

  return (
    <div className="space-y-2">
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            void sendLink();
          }
        }}
        placeholder="Email"
        autoComplete="email"
        className="input-field w-full"
      />
      {error && <p className="text-xs text-red-400">{error}</p>}
      <div className="flex gap-2">
        <button type="button" onClick={sendLink} disabled={busy} className="btn-primary flex-1 disabled:opacity-50">
          {busy ? "送信中..." : "ログインリンクを送る"}
        </button>
        <button
          type="button"
          onClick={() => {
            setExpanded(false);
            setError(null);
          }}
          className="btn-ghost px-4"
        >
          戻る
        </button>
      </div>
    </div>
  );
}
