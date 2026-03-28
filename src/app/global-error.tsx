"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function GlobalError({
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
    <html lang="ja">
      <body style={{ margin: 0, fontFamily: "'Noto Sans JP', sans-serif", backgroundColor: "#f5f5f7" }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100vh", padding: "2rem", textAlign: "center" }}>
          <div style={{ width: 64, height: 64, borderRadius: 16, backgroundColor: "#fee2e2", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 24 }}>
            <svg width="32" height="32" fill="none" viewBox="0 0 24 24" stroke="#ef4444" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
            </svg>
          </div>
          <h2 style={{ fontSize: "1.25rem", fontWeight: 600, color: "#1d1d1f", margin: "0 0 8px" }}>
            予期しないエラーが発生しました
          </h2>
          <p style={{ fontSize: "0.875rem", color: "#6e6e73", margin: "0 0 8px", maxWidth: 400 }}>
            システムに問題が発生しました。しばらくしてからもう一度お試しください。
          </p>
          {error.digest && (
            <p style={{ fontSize: "0.75rem", color: "#a1a1a6", fontFamily: "monospace", margin: "0 0 24px" }}>
              エラーID: {error.digest}
            </p>
          )}
          <div style={{ display: "flex", gap: 12 }}>
            <button
              onClick={() => reset()}
              style={{
                padding: "10px 24px",
                borderRadius: 10,
                border: "none",
                backgroundColor: "#0071e3",
                color: "#fff",
                fontSize: "0.875rem",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              再読み込み
            </button>
            <a
              href="/"
              style={{
                padding: "10px 24px",
                borderRadius: 10,
                border: "1px solid #d2d2d7",
                backgroundColor: "#fff",
                color: "#1d1d1f",
                fontSize: "0.875rem",
                fontWeight: 600,
                textDecoration: "none",
                cursor: "pointer",
              }}
            >
              トップへ戻る
            </a>
          </div>
        </div>
      </body>
    </html>
  );
}
