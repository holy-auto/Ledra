"use client";

import Link from "next/link";
import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function LoginError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <main className="min-h-screen flex items-center justify-center bg-base p-6">
      <div className="glass-card w-full max-w-sm space-y-6 p-8 text-center">
        <div className="mx-auto w-14 h-14 rounded-2xl bg-red-50 dark:bg-red-500/10 flex items-center justify-center">
          <svg
            width="28"
            height="28"
            fill="none"
            viewBox="0 0 24 24"
            stroke="#ef4444"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
            />
          </svg>
        </div>

        <h1 className="text-xl font-bold text-primary">
          ログインページの読み込みに失敗しました
        </h1>

        <p className="text-sm text-secondary">
          しばらくしてからもう一度お試しください。
        </p>

        {error.digest && (
          <p className="text-xs text-muted font-mono">
            エラーID: {error.digest}
          </p>
        )}

        <div className="flex gap-3 justify-center">
          <button onClick={() => reset()} className="btn-primary">
            再読み込み
          </button>
          <Link href="/" className="btn-secondary">
            トップへ戻る
          </Link>
        </div>
      </div>
    </main>
  );
}
