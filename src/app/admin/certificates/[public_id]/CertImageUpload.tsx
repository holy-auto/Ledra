"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { enqueueOrFetchMultipart } from "@/lib/outbox/enqueueOrFetchMultipart";
import { compressToJpeg, TARGET_BYTES } from "@/lib/media/compressToJpeg";

type Props = {
  publicId: string;
  remaining: number;
  maxPhotos: number;
};

// 4 MB hard cap — reject if can't compress below this
const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

export default function CertImageUpload({ publicId, remaining, maxPhotos }: Props) {
  const router = useRouter();
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const upload = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const rawFiles = Array.from(files).slice(0, remaining);
    if (rawFiles.length === 0) {
      setError("写真の上限に達しています。");
      return;
    }

    setError(null);
    setMessage(`アップロード中 (0/${rawFiles.length})…`);

    startTransition(async () => {
      try {
        // ── Eagerly read all file bytes into memory before any other async work.
        // iOS Safari invalidates File handles after the first await in a handler
        // (a known WebKit limitation), so materializing here ensures the data
        // stays accessible through compression and upload.
        const toUpload = await Promise.all(
          rawFiles.map(async (f) => {
            const ab = await f.arrayBuffer();
            return new File([ab], f.name || "photo.jpg", { type: f.type || "image/jpeg" });
          }),
        );

        let totalUploaded = 0;

        for (let idx = 0; idx < toUpload.length; idx++) {
          const file = toUpload[idx];
          setMessage(`アップロード中 (${idx + 1}/${toUpload.length})…`);

          let toSend: File;
          if (file.size > TARGET_BYTES) {
            const compressed = await compressToJpeg(file);
            toSend = compressed ?? file;
          } else {
            toSend = file;
          }

          if (toSend.size > MAX_UPLOAD_BYTES) {
            setMessage(null);
            setError(
              `「${file.name}」のファイルサイズが大きすぎます（圧縮後 ${Math.round(toSend.size / 1024 / 1024)}MB）。別の写真を選んでください。`,
            );
            return;
          }

          // オンライン: 通常 fetch / オフライン: outbox にキューして復帰後に自動アップロード
          const r = await enqueueOrFetchMultipart({
            url: "/api/certificates/images/upload",
            fields: { public_id: publicId },
            files: [{ fieldName: "photos", file: toSend }],
            label: `証明書写真: ${file.name}`,
            kind: "certificate_image_upload",
          });

          if (r.queued) {
            setMessage(null);
            setError("📡 オフラインのため写真をキューに保存しました。通信復帰後に自動でアップロードされます。");
            // queued=true でループは継続せず終了 (残りの写真もオフラインのはず)
            return;
          }

          const res = r.response;
          if (!res) {
            setError("アップロードに失敗しました (応答なし)。");
            return;
          }
          // Vercel returns HTML on 413; parse JSON safely.
          let json: Record<string, unknown> = {};
          try {
            json = await res.json();
          } catch {}

          if (!res.ok) {
            setMessage(null);
            let msg: string;
            if (res.status === 413) {
              msg = "ファイルが大きすぎます。写真を選び直してください。";
            } else if (res.status === 504) {
              msg = "サーバーの処理に時間がかかっています。しばらく経ってから再度お試しください。";
            } else {
              msg =
                (json?.message as string) ??
                (json?.error as string) ??
                `アップロードに失敗しました（HTTP ${res.status}）。`;
            }
            setError(msg);
            return;
          }

          totalUploaded += (json?.uploaded as number) ?? 0;
        }

        setMessage(`${totalUploaded} 枚の写真を追加しました。`);
        router.refresh();
      } catch (e) {
        console.warn("upload error", e);
        setMessage(null);
        // Include the actual exception message to help diagnose unexpected errors.
        const detail = e instanceof Error ? `（${e.message}）` : "";
        setError(`アップロードに失敗しました。${detail}`);
      } finally {
        setTimeout(() => setMessage(null), 3000);
      }
    });
  };

  const full = remaining <= 0;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        {/* Camera only. The album/file-picker path was removed so photos added
            after certificate creation are also captures — the C2PA manifest
            asserts digitalSourceType=digitalCapture (see
            src/lib/anchoring/providers/c2pa.ts). Both this and PhotoUploadSection
            (creation flow) post to /api/certificates/images/upload. */}
        <button
          type="button"
          onClick={() => cameraInputRef.current?.click()}
          disabled={isPending || full}
          className="inline-flex items-center gap-2 rounded-lg border border-border-default bg-surface px-4 py-2 text-sm font-medium text-primary shadow-sm hover:bg-surface-hover hover:border-border-strong disabled:opacity-50"
        >
          {isPending ? "アップロード中…" : "カメラで撮影"}
        </button>
        <span className="text-xs text-muted">
          残り {Math.max(remaining, 0)} / {maxPhotos} 枚
        </span>
      </div>

      <input
        ref={cameraInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
        capture="environment"
        className="hidden"
        onChange={(e) => upload(e.target.files)}
        onClick={(e) => {
          (e.target as HTMLInputElement).value = "";
        }}
      />

      {message && (
        <div className="rounded-xl border border-accent/20 bg-accent-dim px-3 py-2 text-xs text-accent">{message}</div>
      )}
      {error && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-danger">{error}</div>
      )}
    </div>
  );
}
