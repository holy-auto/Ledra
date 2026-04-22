"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type Props = {
  imageId: string;
};

export default function CertImageDeleteButton({ imageId }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDelete = () => {
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch(`/api/certificates/images/${imageId}`, { method: "DELETE" });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(json?.message ?? json?.error ?? "削除に失敗しました。");
          setConfirming(false);
          return;
        }
        router.refresh();
      } catch {
        setError("削除に失敗しました。");
        setConfirming(false);
      }
    });
  };

  if (confirming) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-xs text-danger">本当に削除しますか？この操作は元に戻せません。</p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleDelete}
            disabled={isPending}
            className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-1 text-xs font-medium text-danger hover:bg-red-500/20 disabled:opacity-50"
          >
            {isPending ? "削除中…" : "削除する"}
          </button>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            disabled={isPending}
            className="rounded-lg border border-border-default bg-surface px-3 py-1 text-xs font-medium text-secondary hover:bg-surface-hover disabled:opacity-50"
          >
            キャンセル
          </button>
        </div>
        {error && <p className="text-xs text-danger">{error}</p>}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="w-full rounded-lg border border-red-500/30 px-3 py-1.5 text-xs font-medium text-danger hover:bg-red-500/10"
      >
        削除
      </button>
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}
