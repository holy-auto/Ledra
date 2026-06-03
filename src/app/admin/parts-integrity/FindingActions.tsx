"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

/**
 * 検知(finding)の対応操作ボタン。状態に応じて「対応済み/却下/未対応に戻す」を出す。
 * 設計: docs/parts-installation-integrity-design.md §4 L7
 */

type Status = "open" | "acknowledged" | "resolved" | "dismissed";

export default function FindingActions({ id, status }: { id: string; status: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState(false);

  async function update(next: Status) {
    setError(false);
    try {
      const res = await fetch(`/api/parts/findings/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      if (!res.ok) {
        setError(true);
        return;
      }
      startTransition(() => router.refresh());
    } catch {
      setError(true);
    }
  }

  const btn = "rounded border px-2 py-0.5 text-xs disabled:opacity-40";

  return (
    <div className="flex items-center gap-1">
      {status !== "resolved" && (
        <button
          className={`${btn} border-green-300 text-green-700 hover:bg-green-50`}
          disabled={pending}
          onClick={() => update("resolved")}
        >
          対応済み
        </button>
      )}
      {status !== "dismissed" && (
        <button
          className={`${btn} border-gray-300 text-gray-600 hover:bg-gray-50`}
          disabled={pending}
          onClick={() => update("dismissed")}
        >
          却下
        </button>
      )}
      {status !== "open" && (
        <button
          className={`${btn} border-blue-300 text-blue-700 hover:bg-blue-50`}
          disabled={pending}
          onClick={() => update("open")}
        >
          未対応に戻す
        </button>
      )}
      {error && <span className="text-xs text-red-600">失敗</span>}
    </div>
  );
}
