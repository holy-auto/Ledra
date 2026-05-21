"use client";

import Link from "next/link";
import useSWR from "swr";
import Image from "next/image";
import { fetcher } from "@/lib/swr";
import { formatDate } from "@/lib/format";
import AnnotateExistingImageButton from "@/components/imageMarkup/AnnotateExistingImageButton";
import type { AnnotationDocument } from "@/components/imageMarkup/types";

/**
 * 案件ワークフローの 📸 写真タブ。
 *
 * この案件 (予約) に紐付く車両 / 顧客の証明書写真をワンビューで表示し、
 * 既存の AnnotateExistingImageButton を使って各写真にその場で注釈を追加・編集できる。
 *
 * 新しい storage や schema は導入せず、既存の certificate_images をそのまま使う。
 * 「作業中に証明書発行画面に遷移して写真確認 → 編集」という移動を省く目的。
 */

type Photo = {
  id: string;
  certificate_id: string;
  certificate_public_id: string | null;
  certificate_status: string | null;
  file_name: string | null;
  content_type: string | null;
  file_size: number | null;
  signed_url: string | null;
  annotations: AnnotationDocument | null;
  annotation_count: number;
  created_at: string;
};

type Response = {
  certificates: { public_id: string; status: string; created_at: string }[];
  photos: Photo[];
};

export default function JobPhotosTab({
  reservationId,
  certificateNewUrl,
}: {
  reservationId: string;
  certificateNewUrl: string;
}) {
  const swrKey = `/api/admin/jobs/${reservationId}/photos`;
  const { data, error, isLoading } = useSWR<Response>(swrKey, fetcher, {
    revalidateOnFocus: true,
    dedupingInterval: 3000,
  });

  if (isLoading) {
    return (
      <section className="glass-card p-5">
        <div className="text-xs text-muted">写真を読み込み中…</div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="glass-card p-5">
        <div className="text-sm text-danger">
          写真の読み込みに失敗しました: {error instanceof Error ? error.message : String(error)}
        </div>
      </section>
    );
  }

  const photos = data?.photos ?? [];
  const certCount = data?.certificates.length ?? 0;

  return (
    <section className="glass-card overflow-hidden">
      <div className="border-b border-border-subtle p-5 flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="text-xs font-semibold tracking-[0.18em] text-muted">PHOTOS</div>
          <div className="mt-1 text-base font-semibold text-primary">
            この案件の写真 ({photos.length} 枚 / {certCount} 件の証明書)
          </div>
          <p className="mt-1 text-xs text-muted leading-relaxed">
            車両に紐付く全証明書の写真をここに集約。各写真の「🖊️
            注釈」ボタンから矢印・図形・テキストでマーキングできます。
          </p>
        </div>
        <Link href={certificateNewUrl} className="btn-primary text-xs px-3 py-1.5">
          🪪 新規証明書を発行
        </Link>
      </div>

      {photos.length === 0 ? (
        <div className="px-5 py-10 text-center text-muted text-sm">
          {certCount === 0
            ? "この案件にはまだ証明書が紐付いていません。証明書を発行すると、撮影した写真がここに集約されます。"
            : "証明書はあるものの、写真がまだアップロードされていません。証明書の詳細画面から写真を追加できます。"}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 p-5">
          {photos.map((p) => (
            <div key={p.id} className="rounded-xl border border-border-subtle bg-surface overflow-hidden flex flex-col">
              <div className="relative aspect-square bg-inset overflow-hidden">
                {p.signed_url ? (
                  <Image
                    src={p.signed_url}
                    alt={p.file_name ?? p.id}
                    fill
                    sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                    unoptimized
                    className="object-cover"
                  />
                ) : (
                  <div className="flex items-center justify-center h-full text-xs text-muted">画像を読み込めません</div>
                )}
                {p.annotation_count > 0 && (
                  <span className="absolute left-1.5 top-1.5 rounded-full bg-accent px-2 py-0.5 text-[10px] font-semibold text-white shadow-sm">
                    注釈 {p.annotation_count}
                  </span>
                )}
              </div>
              <div className="p-2.5 space-y-2 text-[11px]">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted truncate">{formatDate(p.created_at)}</span>
                  {p.certificate_public_id && (
                    <Link
                      href={`/admin/certificates/${p.certificate_public_id}`}
                      className="text-accent hover:underline font-mono text-[10px]"
                      title={`証明書 ${p.certificate_public_id}`}
                    >
                      {p.certificate_public_id.slice(0, 8)}…
                    </Link>
                  )}
                </div>
                {p.signed_url && (
                  <AnnotateExistingImageButton
                    imageId={p.id}
                    imageUrl={p.signed_url}
                    initial={p.annotations}
                    fileName={p.file_name ?? undefined}
                  />
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
