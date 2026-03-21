"use client";

import { useTransition, useState } from "react";
import { useRouter } from "next/navigation";
import { activateCertAction, voidCertAction } from "./actions";

type Props = {
  publicId: string;
  status: string;
};

export default function CertStatusActions({ publicId, status }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const isDraft = status === "draft";
  const isVoid = status === "void";

  const handleActivate = () => {
    setError(null);
    startTransition(async () => {
      const res = await activateCertAction(publicId);
      if (!res.ok) {
        setError(`公開失敗: ${res.error}`);
      } else {
        router.refresh();
      }
    });
  };

  const handleVoid = () => {
    if (!confirm("この証明書を無効化しますか？この操作は取り消せません。")) return;
    setError(null);
    startTransition(async () => {
      const res = await voidCertAction(publicId);
      if (!res.ok) {
        setError(`無効化失敗: ${res.error}`);
      } else {
        router.refresh();
      }
    });
  };

  if (isVoid) return null;

  return (
    <div className="flex flex-col gap-2">
      {isDraft && (
        <button
          onClick={handleActivate}
          disabled={isPending}
          className="rounded-xl border border-success bg-success px-4 py-2 text-sm font-medium text-inverse hover:bg-success/90 disabled:opacity-50"
        >
          {isPending ? "処理中…" : "✓ 公開する"}
        </button>
      )}
      <button
        onClick={handleVoid}
        disabled={isPending}
        className="rounded-xl border border-danger/40 bg-surface px-4 py-2 text-sm font-medium text-danger hover:bg-danger/5 disabled:opacity-50"
      >
        無効化する
      </button>
      {error && (
        <p className="text-xs text-danger">{error}</p>
      )}
    </div>
  );
}
