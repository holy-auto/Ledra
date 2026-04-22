"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type Props = {
  publicId: string;
  remaining: number;
  maxPhotos: number;
};

// Stay well under Vercel's 4.5 MB serverless body limit.
const TARGET_BYTES = 3.5 * 1024 * 1024; // 3.5 MB target after compression
const MAX_UPLOAD_BYTES = 4 * 1024 * 1024; // 4 MB hard cap — reject if can't compress below this
const MAX_DIMENSION = 2048; // scale long side down to 2048 px before compressing

// Compress a File (already fully read into memory) to JPEG via Canvas.
// Scales dimensions then tries quality 0.85 → 0.70 → 0.55 until under TARGET_BYTES.
// iOS Safari natively decodes HEIC in Canvas (iOS 11+).
async function compressToJpeg(file: File): Promise<File | null> {
  if (file.size <= TARGET_BYTES) return file;

  return new Promise((resolve) => {
    const objectUrl = URL.createObjectURL(file);
    const img = document.createElement("img");

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      try {
        let w = img.naturalWidth;
        let h = img.naturalHeight;
        if (!w || !h) { resolve(null); return; }

        if (w > MAX_DIMENSION || h > MAX_DIMENSION) {
          if (w >= h) { h = Math.round((h * MAX_DIMENSION) / w); w = MAX_DIMENSION; }
          else { w = Math.round((w * MAX_DIMENSION) / h); h = MAX_DIMENSION; }
        }

        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) { resolve(null); return; }
        ctx.drawImage(img, 0, 0, w, h);

        const newName = file.name.replace(/\.[^.]+$/, ".jpg") || "photo.jpg";
        const qualities = [0.85, 0.70, 0.55];
        let qi = 0;

        const tryNext = () => {
          canvas.toBlob(
            (blob) => {
              if (!blob) { resolve(null); return; }
              if (blob.size <= TARGET_BYTES || qi >= qualities.length - 1) {
                resolve(new File([blob], newName, { type: "image/jpeg" }));
              } else {
                qi++;
                tryNext();
              }
            },
            "image/jpeg",
            qualities[qi],
          );
        };

        tryNext();
      } catch {
        resolve(null);
      }
    };

    img.onerror = () => { URL.revokeObjectURL(objectUrl); resolve(null); };
    img.src = objectUrl;
  });
}

export default function CertImageUpload({ publicId, remaining, maxPhotos }: Props) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
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

          const form = new FormData();
          form.append("public_id", publicId);
          form.append("photos", toSend);

          // Fetch may throw (network error, connection drop on mobile).
          // Catch it separately so we can show a meaningful message.
          let res: Response;
          try {
            res = await fetch("/api/certificates/images/upload", {
              method: "POST",
              body: form,
            });
          } catch (fetchErr) {
            setMessage(null);
            const detail = fetchErr instanceof Error ? `（${fetchErr.message}）` : "";
            setError(`ネットワークエラーが発生しました。通信状態を確認してから再試行してください。${detail}`);
            return;
          }

          // Vercel returns HTML on 413; parse JSON safely.
          let json: Record<string, unknown> = {};
          try { json = await res.json(); } catch {}

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
        <button
          type="button"
          onClick={() => cameraInputRef.current?.click()}
          disabled={isPending || full}
          className="inline-flex items-center gap-2 rounded-lg border border-border-default bg-surface px-4 py-2 text-sm font-medium text-primary shadow-sm hover:bg-surface-hover hover:border-border-strong disabled:opacity-50"
        >
          カメラで撮影
        </button>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={isPending || full}
          className="inline-flex items-center gap-2 rounded-lg border border-border-default bg-surface px-4 py-2 text-sm font-medium text-primary shadow-sm hover:bg-surface-hover hover:border-border-strong disabled:opacity-50"
        >
          {isPending ? "アップロード中…" : "写真を追加"}
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
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
        multiple
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
