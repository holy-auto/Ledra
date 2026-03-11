"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function InsurerResetPasswordPage() {
  const router = useRouter();
  const supabase = createClient();

  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data?.user) {
        router.replace("/insurer/login?error=session_required");
        return;
      }
      setReady(true);
    })();
  }, [router, supabase]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!password || password.length < 8) {
      setErr("パスワードは8文字以上にしてください。");
      return;
    }
    if (password !== confirm) {
      setErr("確認用パスワードが一致しません。");
      return;
    }

    setLoading(true);
    setErr(null);
    setMsg(null);

    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;

      setMsg("パスワードを更新しました。ログイン画面へ移動します。");
      setTimeout(() => {
        router.replace("/insurer/login?reset=done");
      }, 800);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "failed");
    } finally {
      setLoading(false);
    }
  }

  if (!ready) {
    return (
      <main className="mx-auto max-w-md p-6">
        <div className="rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm">
          セッションを確認しています...
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-md space-y-6 p-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">新しいパスワードを設定</h1>
        <p className="text-sm text-neutral-500">
          初回設定・再設定の両方で使います。
        </p>
      </div>

      <form onSubmit={onSubmit} className="space-y-4 rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm">
        <div className="space-y-2">
          <label className="text-sm font-medium">新しいパスワード</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-2xl border border-neutral-300 px-4 py-3 outline-none transition focus:border-neutral-500"
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">確認用パスワード</label>
          <input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className="w-full rounded-2xl border border-neutral-300 px-4 py-3 outline-none transition focus:border-neutral-500"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-2xl border border-neutral-900 bg-neutral-900 px-5 py-3 font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? "更新中..." : "パスワードを更新"}
        </button>

        {msg ? <p className="text-sm text-emerald-700">{msg}</p> : null}
        {err ? <p className="text-sm text-rose-600">{err}</p> : null}
      </form>
    </main>
  );
}
