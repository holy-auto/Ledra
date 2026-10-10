"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type SampleStatus = {
  sample_count: number;
  customer_count: number;
  vehicle_count: number;
};

/**
 * SetupChecklist 内の「さっそく試してみる」ボタン群。
 *
 * - サンプルデータが無い人: 「サンプルデータで試す」
 * - サンプルデータがある人: 「サンプルデータをクリア」
 *
 * クリックで API を呼び、成功後 router.refresh() でセットアップ状況を再描画する。
 * 親 (SetupChecklist) は必須未完了の人にだけ表示されるため、サンプル作成の動線が
 * 真に必要な人にだけ届く。
 */
export default function SampleDataActions() {
  const router = useRouter();
  const [status, setStatus] = useState<SampleStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const refresh = async () => {
    try {
      const res = await fetch("/api/admin/setup/sample-data", { cache: "no-store" });
      if (!res.ok) return;
      const json = (await res.json()) as SampleStatus;
      setStatus(json);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const create = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/setup/sample-data", { method: "POST" });
      if (!res.ok) throw new Error(await res.text());
      setMsg("サンプル顧客・車両を作成しました。各画面で動作を確認してください。");
      await refresh();
      router.refresh();
    } catch {
      setMsg("作成に失敗しました。時間をおいて再度お試しください。");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!confirm("サンプルデータを削除します。よろしいですか？")) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/setup/sample-data", { method: "DELETE" });
      if (!res.ok) throw new Error(await res.text());
      setMsg("サンプルデータを削除しました。");
      await refresh();
      router.refresh();
    } catch {
      setMsg("削除に失敗しました。時間をおいて再度お試しください。");
    } finally {
      setBusy(false);
    }
  };

  const hasSample = (status?.sample_count ?? 0) > 0;

  return (
    <div className="mt-4 pt-4 border-t border-border-subtle">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="text-xs font-semibold text-primary flex items-center gap-1.5">
            {hasSample ? "サンプルデータが入っています" : "まずは触って試してみる"}
          </div>
          <p className="mt-0.5 text-[11px] text-muted leading-relaxed">
            {hasSample
              ? `現在 ${status?.customer_count ?? 0} 名の顧客 / ${status?.vehicle_count ?? 0} 台の車両がサンプルとして登録されています。`
              : "サンプル顧客・車両を 1 セット自動生成します。本番データに混ざらないよう [SAMPLE] のマークが付き、いつでもまとめて削除できます。"}
          </p>
        </div>
        <div className="shrink-0">
          {hasSample ? (
            <button type="button" onClick={remove} disabled={busy} className="btn-ghost text-xs px-3 py-1.5">
              {busy ? "削除中…" : "サンプルをクリア"}
            </button>
          ) : (
            <button type="button" onClick={create} disabled={busy} className="btn-secondary text-xs px-3 py-1.5">
              {busy ? "作成中…" : "サンプルデータで試す"}
            </button>
          )}
        </div>
      </div>
      {msg && <p className="mt-2 text-xs text-success">{msg}</p>}
    </div>
  );
}
