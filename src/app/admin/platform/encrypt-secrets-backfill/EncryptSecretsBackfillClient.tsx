"use client";

import { useState } from "react";

type SectionResult = {
  table: string;
  scanned: number;
  updated: number;
  skipped_already_encrypted: number;
  errors: number;
};

type RunResult = {
  ok?: boolean;
  elapsed_ms?: number;
  tenants?: SectionResult;
  square?: SectionResult;
  skipped?: boolean;
  reason?: string;
  error?: string;
  message?: string;
};

export default function EncryptSecretsBackfillClient() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<RunResult | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function run() {
    if (busy) return;
    setBusy(true);
    setErr(null);
    setResult(null);
    try {
      const res = await fetch("/api/admin/platform/encrypt-secrets-backfill", { method: "POST" });
      const j = (await res.json()) as RunResult;
      if (!res.ok) {
        setErr(j.message ?? j.error ?? `HTTP ${res.status}`);
        return;
      }
      setResult(j);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const allDone =
    result?.tenants &&
    result.square &&
    result.tenants.updated === 0 &&
    result.square.updated === 0 &&
    result.tenants.errors === 0 &&
    result.square.errors === 0;

  return (
    <div className="glass-card p-6 space-y-4">
      <div className="space-y-2 text-sm text-secondary">
        <p>
          ボタンを押すと、平文列に値があり暗号化列が空の行を 1 行ずつ AES-256-GCM
          で暗号化して書き戻します。何度押しても安全です。
        </p>
        <p>
          全行が <code>updated: 0</code> になれば、PR3 の DROP マイグレーションを実行できます。
        </p>
      </div>

      <button type="button" className="btn-primary" disabled={busy} onClick={run}>
        {busy ? "実行中..." : "バックフィルを実行"}
      </button>

      {err && (
        <div className="rounded-xl border border-red-500/30 bg-[rgba(239,68,68,0.1)] p-3 text-sm text-red-500">
          エラー: {err}
        </div>
      )}

      {result && !err && (
        <div className="space-y-3">
          {result.skipped ? (
            <div className="rounded-xl border border-amber-500/30 bg-[rgba(245,158,11,0.1)] p-3 text-sm">
              スキップされました: <code>{result.reason}</code>
            </div>
          ) : (
            <>
              {allDone && (
                <div className="rounded-xl border border-emerald-500/30 bg-[rgba(16,185,129,0.1)] p-3 text-sm">
                  ✅ すべて暗号化済みです。PR3 のマイグレーションを実行できます。
                </div>
              )}
              <div className="overflow-x-auto rounded-xl border border-border-default">
                <table className="w-full text-sm">
                  <thead className="bg-surface-hover text-xs uppercase text-muted">
                    <tr>
                      <th className="px-3 py-2 text-left">table</th>
                      <th className="px-3 py-2 text-right">scanned</th>
                      <th className="px-3 py-2 text-right">updated</th>
                      <th className="px-3 py-2 text-right">already encrypted</th>
                      <th className="px-3 py-2 text-right">errors</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[result.tenants, result.square].filter(Boolean).map((row) => (
                      <tr key={row!.table} className="border-t border-border-subtle">
                        <td className="px-3 py-2 font-mono">{row!.table}</td>
                        <td className="px-3 py-2 text-right">{row!.scanned}</td>
                        <td className="px-3 py-2 text-right font-semibold">{row!.updated}</td>
                        <td className="px-3 py-2 text-right text-muted">{row!.skipped_already_encrypted}</td>
                        <td
                          className={`px-3 py-2 text-right ${
                            row!.errors > 0 ? "text-red-500 font-semibold" : "text-muted"
                          }`}
                        >
                          {row!.errors}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {typeof result.elapsed_ms === "number" && (
                <p className="text-xs text-muted">経過時間: {result.elapsed_ms} ms</p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
