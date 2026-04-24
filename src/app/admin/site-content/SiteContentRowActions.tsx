"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { deleteSiteContentAction, setSiteContentStatusAction } from "./actions";
import type { SiteContentStatus } from "@/lib/validations/site-content-post";

export default function SiteContentRowActions({ id, status }: { id: string; status: SiteContentStatus }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const togglePublish = () => {
    const next: SiteContentStatus = status === "published" ? "draft" : "published";
    startTransition(async () => {
      const res = await setSiteContentStatusAction(id, next);
      if (!res.ok) {
        const errCode = "error" in res ? res.error : "unknown";
        alert(`更新に失敗しました: ${errCode}`);
        return;
      }
      router.refresh();
    });
  };

  const remove = () => {
    if (!confirm("この投稿を削除します。よろしいですか？")) return;
    startTransition(async () => {
      const res = await deleteSiteContentAction(id);
      if (!res.ok) {
        const errCode = "error" in res ? res.error : "unknown";
        alert(`削除に失敗しました: ${errCode}`);
        return;
      }
      router.refresh();
    });
  };

  return (
    <div className="inline-flex items-center gap-2">
      <Link href={`/admin/site-content/${id}`} className="text-xs font-medium text-accent-text hover:underline">
        編集
      </Link>
      <button
        type="button"
        onClick={togglePublish}
        disabled={pending}
        className="text-xs font-medium text-secondary hover:text-primary disabled:opacity-50"
      >
        {status === "published" ? "下書きへ" : "公開"}
      </button>
      <button
        type="button"
        onClick={remove}
        disabled={pending}
        className="text-xs font-medium text-danger-text hover:underline disabled:opacity-50"
      >
        削除
      </button>
    </div>
  );
}
