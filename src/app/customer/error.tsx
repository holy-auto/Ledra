"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";
import Link from "next/link";

export default function CustomerError({
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
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-danger/10">
        <svg width="32" height="32" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} className="text-danger">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
        </svg>
      </div>
      <div className="text-center space-y-2">
        <h2 className="text-lg font-semibold text-primary">エラーが発生しました</h2>
        <p className="text-sm text-muted max-w-md">
          ページの読み込みに失敗しました。もう一度お試しください。
          問題が続く場合はサポートまでお問い合わせください。
        </p>
        {error.digest && (
          <p className="text-xs text-muted font-mono">エラーID: {error.digest}</p>
        )}
      </div>
      <div className="flex gap-3">
        <button onClick={reset} className="btn-primary px-4 py-2 text-sm">
          再読み込み
        </button>
        <Link href="/customer" className="btn-secondary px-4 py-2 text-sm">
          ダッシュボードに戻る
        </Link>
      </div>
    </div>
  );
}
