"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type Props = {
  publicId: string;
  remaining: number;
  maxPhotos: number;
};

// Vercel serverless function request body limit is 4.5 MB.
// iPhone HEIC photos are typically 3–8 MB, so we compress large files
// to JPEG before uploading. iOS Safari can render HEIC on Canvas natively.
const COMPRESS_THRESHOLD_BYTES = 3.5 * 1024 * 1024; // 3.5 MB

async function compressToJpeg(file: File): Promise<File> {
  if (file.size <= COMPRESS_THRESHOLD_BYTES) return file;
  return new Promise((resolve) => {
    const objectUrl = URL.createObjectURL(file);
    const img = document.createElement("img");
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      try {
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext("2d");
        if (!ctx) { resolve(file); return; }
        ctx.drawImage(img, 0, 0);
        canvas.toBlob(
          (blob) => {
            if (!blob || blob.size >= file.size) { resolve(file); return; }
            const newName = file.name.replace(/\.[^.]+$/, ".jpg");
            resolve(new File([blob], newName, { type: "image/jpeg" }));
          },
          "image/jpeg",
          0.85,
        );
      } catch {
        resolve(file);
      }
    };
    img.onerror = () => { URL.revokeObjectURL(objectUrl); resolve(file); };
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
    const toUpload = Array.from(files).slice(0, remaining);
    if (toUpload.length === 0) {
      setError("写真の上限に達しています。");
      return;
    }

    setError(null);
    setMessage(`アップロード中 (0/${toUpload.length})…`);

    startTransition(async () => {
      try {
        let totalUploaded = 0;

        // Upload one file at a time to stay within Vercel's 4.5 MB request limit.
        for (let idx = 0; idx < toUpload.length; idx++) {
          setMessage(`アップロード中 (${idx + 1}/${toUpload.length})…`);

          const compressed = await compressToJpeg(toUpload[idx]);

          const form = new FormData();
          form.append("public_id", publicId);
          form.append("photos", compressed);

          const res = await fetch("/api/certificates/images/upload", {
            method: "POST",
            body: form,
          });
          const json = await res.json();
          if (!res.ok) {
            setMessage(null);
            setError(json?.message ?? json?.error ?? "アップロードに失敗しました。");
            return;
          }
          totalUploaded += json?.uploaded ?? 0;
        }

        setMessage(`${totalUploaded} 枚の写真を追加しました。`);
        router.refresh();
      } catch (e) {
        console.warn("upload error", e);
        setMessage(null);
        setError("アップロードに失敗しました。");
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
