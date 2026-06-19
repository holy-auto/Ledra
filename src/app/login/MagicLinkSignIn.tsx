"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * パスワードを使わないログイン導線。
 *
 *   stage 1 — collapsed: 「メールリンクでログイン」ボタン1つ。
 *   stage 2 — expanded:  メール入力 + 送信。
 *
 * `signInWithOtp({ shouldCreateUser: false })` でログイン用リンクを送る。
 * 新規ユーザーは作成しない（登録は /signup に誘導）。リンクは
 * /auth/callback?next=... に着地し、セッション確立後にリダイレクトする。
 */
export function MagicLinkSignIn({ next }: { next?: string }) {
  const [expanded, setExpanded] = useState(false);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const dest = next && next.startsWith("/") ? next : "/admin";

  async function sendLink() {
    const trimmed = email.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(trimmed)) {
      setError("メールアドレスの形式が正しくありません。");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const supabase = createClient();
      const { error: otpError } = await supabase.auth.signInWithOtp({
        email: trimmed,
        options: {
          shouldCreateUser: false,
          emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(dest)}`,
        },
      });
      if (otpError) {
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
