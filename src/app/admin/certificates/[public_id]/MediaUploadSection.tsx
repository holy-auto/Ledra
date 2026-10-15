"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { CERTIFICATE_MEDIA_BUCKET } from "@/lib/certificateMedia";

type MediaTypeOption = "video" | "before_after";

type ExistingMedia = {
  id: string;
  media_type: "video" | "before_after" | "panorama360";
  caption: string | null;
  url: string | null;
  before_url: string | null;
  poster_url: string | null;
  sort_order: number;
};

type Props = {
  publicId: string;
  existing: ExistingMedia[];
};

const MAX_VIDEO_BYTES = 100 * 1024 * 1024; // 100 MB
const MAX_IMAGE_BYTES = 20 * 1024 * 1024; // 20 MB
// 動画と一緒に multipart で送るポスター画像は、Vercel の関数の本文上限（約 4.5MB）に収める
const MAX_MULTIPART_POSTER_BYTES = 4 * 1024 * 1024;

/** ブラウザが MIME を出さない・別名で出す動画（.m4v など）は拡張子で決める。中身はサーバーが実物で確かめる */
function videoContentType(file: File): "video/mp4" | "video/quicktime" {
  if (file.type === "video/mp4" || file.type === "video/quicktime") return file.type;
  return /\.mov$/i.test(file.name) ? "video/quicktime" : "video/mp4";
}

const VIDEO_ACCEPT = "video/mp4,video/quicktime";
const IMAGE_ACCEPT = "image/jpeg,image/png";

/**
 * Phase 3: 管理画面で動画 / Before-After を追加するためのフォーム。
 * 既存の写真用 PhotoUploadSection / CertImageUpload と同居させるため、
 * 別コンポーネントとして新設 (リネームしない)。
 */
export default function MediaUploadSection({ publicId, existing }: Props) {
  const router = useRouter();
  const [type, setType] = useState<MediaTypeOption>("video");
  const [primary, setPrimary] = useState<File | null>(null);
  const [before, setBefore] = useState<File | null>(null);
  const [poster, setPoster] = useState<File | null>(null);
  const [caption, setCaption] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const primaryRef = useRef<HTMLInputElement>(null);
  const beforeRef = useRef<HTMLInputElement>(null);
  const posterRef = useRef<HTMLInputElement>(null);

  // 直接アップロードは済んだが登録が一時的に失敗した動画。同じファイルで再試行するときは送り直さない（取り残しを増やさない）
  const directUpload = useRef<{ file: File; path: string } | null>(null);

  const reset = () => {
    directUpload.current = null;
    setPrimary(null);
    setBefore(null);
    setPoster(null);
    setCaption("");
    if (primaryRef.current) primaryRef.current.value = "";
    if (beforeRef.current) beforeRef.current.value = "";
    if (posterRef.current) posterRef.current.value = "";
  };

  const submit = () => {
    setError(null);

    if (!primary) {
      setError(type === "video" ? "動画ファイルを選択してください。" : "After 画像を選択してください。");
      return;
    }
    const primaryCap = type === "video" ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
    if (primary.size > primaryCap) {
      setError(`ファイルサイズが大きすぎます (上限 ${Math.round(primaryCap / 1024 / 1024)}MB)。`);
      return;
    }
    if (type === "before_after") {
      if (!before) {
        setError("Before 画像を選択してください。");
        return;
      }
      if (before.size > MAX_IMAGE_BYTES) {
        setError(`Before のファイルサイズが大きすぎます (上限 ${Math.round(MAX_IMAGE_BYTES / 1024 / 1024)}MB)。`);
        return;
      }
    }
    if (type === "video" && poster && poster.size > MAX_MULTIPART_POSTER_BYTES) {
      setError(
        `ポスター画像のサイズが大きすぎます (動画と一緒に送るときは ${Math.round(MAX_MULTIPART_POSTER_BYTES / 1024 / 1024)}MB まで)。`,
      );
      return;
    }
    if (poster && poster.size > MAX_IMAGE_BYTES) {
      setError(`ポスター画像のサイズが大きすぎます (上限 ${Math.round(MAX_IMAGE_BYTES / 1024 / 1024)}MB)。`);
      return;
    }

    const form = new FormData();
    form.append("media_type", type);
    if (type !== "video") form.append("file", primary);
    if (before) form.append("before", before);
    if (poster) form.append("poster", poster);
    if (caption.trim()) form.append("caption", caption.trim());

    setMessage("アップロード中…");

    startTransition(async () => {
      try {
        // 動画は Vercel の関数の本文上限（約 4.5MB）を超えるので、Storage へ直接送ってから保存パスだけを登録する
        if (type === "video") {
          if (directUpload.current?.file !== primary) {
            const contentType = videoContentType(primary);
            const urlRes = await fetch(`/api/certificates/${encodeURIComponent(publicId)}/media/upload-url`, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ content_type: contentType, size: primary.size }),
            });
            const urlJson = (await urlRes.json().catch(() => ({}))) as Record<string, unknown>;
            if (!urlRes.ok || typeof urlJson.path !== "string" || typeof urlJson.token !== "string") {
              setMessage(null);
              setError((urlJson?.message as string) ?? `アップロードの準備に失敗しました (HTTP ${urlRes.status})。`);
              return;
            }
            const { error: upErr } = await createClient()
              .storage.from(CERTIFICATE_MEDIA_BUCKET)
              .uploadToSignedUrl(urlJson.path, urlJson.token, primary, { contentType });
            if (upErr) {
              setMessage(null);
              setError(`動画のアップロードに失敗しました。（${upErr.message}）`);
              return;
            }
            directUpload.current = { file: primary, path: urlJson.path };
          }
          form.append("primary_path", directUpload.current!.path);
        }
        const res = await fetch(`/api/certificates/${encodeURIComponent(publicId)}/media`, {
          method: "POST",
          body: form,
        });
        let json: Record<string, unknown> = {};
        try {
          json = await res.json();
        } catch {
          // ignore body parse errors — handled below by status code
        }
        if (!res.ok) {
          setMessage(null);
          setError(
            (json?.message as string) ?? (json?.error as string) ?? `アップロードに失敗しました (HTTP ${res.status})。`,
          );
          return;
        }
        setMessage(`${type === "video" ? "動画" : "Before / After"} を追加しました。`);
        reset();
        router.refresh();
      } catch (e) {
        setMessage(null);
        const detail = e instanceof Error ? `（${e.message}）` : "";
        setError(`アップロードに失敗しました。${detail}`);
      } finally {
        setTimeout(() => setMessage(null), 3000);
      }
    });
  };

  const remove = (id: string) => {
    if (!confirm("このメディアを削除しますか？元に戻せません。")) return;
    startTransition(async () => {
      try {
        const res = await fetch(`/api/certificates/media/${encodeURIComponent(id)}`, {
          method: "DELETE",
        });
        if (!res.ok) {
          const j = (await res.json().catch(() => ({}))) as Record<string, unknown>;
          setError((j?.message as string) ?? `削除に失敗しました (HTTP ${res.status})。`);
          return;
        }
        router.refresh();
      } catch (e) {
        const detail = e instanceof Error ? `（${e.message}）` : "";
        setError(`削除に失敗しました。${detail}`);
      }
    });
  };

  return (
    <section className="glass-card space-y-4 p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-xs font-semibold tracking-[0.18em] text-muted">INTERACTIVE MEDIA</div>
          <div className="mt-1 text-lg font-semibold text-primary">動画 / Before-After</div>
        </div>
        <span className="rounded-full bg-surface-hover px-2.5 py-1 text-xs text-muted">登録済 {existing.length}</span>
      </div>

      <div className="rounded-xl border border-border-subtle bg-inset p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <label className="text-sm text-secondary">
            メディア種別:
            <select
              value={type}
              onChange={(e) => {
                setType(e.target.value as MediaTypeOption);
                reset();
              }}
              className="ml-2 rounded-md border border-border-default bg-surface px-2 py-1 text-sm"
            >
              <option value="video">動画</option>
              <option value="before_after">Before / After</option>
            </select>
          </label>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="text-sm text-secondary">
            <span className="block mb-1">
              {type === "video" ? "動画ファイル (MP4 / MOV)" : "After 画像 (JPEG / PNG)"}
            </span>
            <input
              ref={primaryRef}
              type="file"
              accept={type === "video" ? VIDEO_ACCEPT : IMAGE_ACCEPT}
              onChange={(e) => setPrimary(e.target.files?.[0] ?? null)}
              className="block w-full text-xs"
            />
            {primary ? <span className="mt-1 block text-xs text-muted">{primary.name}</span> : null}
          </label>

          {type === "before_after" ? (
            <label className="text-sm text-secondary">
              <span className="block mb-1">Before 画像 (JPEG / PNG)</span>
              <input
                ref={beforeRef}
                type="file"
                accept={IMAGE_ACCEPT}
                onChange={(e) => setBefore(e.target.files?.[0] ?? null)}
                className="block w-full text-xs"
              />
              {before ? <span className="mt-1 block text-xs text-muted">{before.name}</span> : null}
            </label>
          ) : (
            <label className="text-sm text-secondary">
              <span className="block mb-1">ポスター画像 (任意・JPEG / PNG)</span>
              <input
                ref={posterRef}
                type="file"
                accept={IMAGE_ACCEPT}
                onChange={(e) => setPoster(e.target.files?.[0] ?? null)}
                className="block w-full text-xs"
              />
              {poster ? <span className="mt-1 block text-xs text-muted">{poster.name}</span> : null}
            </label>
          )}
        </div>

        <label className="block text-sm text-secondary">
          <span className="block mb-1">キャプション (任意)</span>
          <input
            type="text"
            value={caption}
            maxLength={500}
            onChange={(e) => setCaption(e.target.value)}
            placeholder={type === "video" ? "例: 施工タイムラプス" : "例: ボンネット施工 Before / After"}
            className="block w-full rounded-md border border-border-default bg-surface px-2 py-1 text-sm"
          />
        </label>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={submit}
            disabled={isPending}
            className="inline-flex items-center justify-center rounded-lg border border-border-default bg-surface px-4 py-2 text-sm font-medium text-primary shadow-sm hover:bg-surface-hover disabled:opacity-50"
          >
            {isPending ? "送信中…" : "メディアを追加"}
          </button>
          {message ? <span className="text-xs text-accent">{message}</span> : null}
          {error ? <span className="text-xs text-danger">{error}</span> : null}
        </div>
      </div>

      {existing.length > 0 ? (
        <div className="grid gap-3 md:grid-cols-2">
          {existing.map((m) => (
            <div key={m.id} className="rounded-xl border border-border-default bg-base p-3 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="text-xs font-medium text-muted">
                  {m.media_type === "video"
                    ? "動画"
                    : m.media_type === "before_after"
                      ? "Before / After"
                      : "360°パノラマ"}
                  {" · 順序 "}
                  {m.sort_order}
                </div>
                <button
                  type="button"
                  onClick={() => remove(m.id)}
                  disabled={isPending}
                  className="text-xs text-danger hover:underline disabled:opacity-50"
                >
                  削除
                </button>
              </div>
              {m.media_type === "video" && m.url ? (
                m.poster_url ? (
                  <img
                    src={m.poster_url}
                    alt={m.caption ?? "動画ポスター"}
                    className="h-40 w-full rounded-lg border border-border-default bg-surface object-cover"
                  />
                ) : (
                  <div className="flex h-40 items-center justify-center rounded-lg border border-border-default bg-surface text-xs text-muted">
                    動画 (ポスター画像なし)
                  </div>
                )
              ) : null}
              {m.media_type === "before_after" && m.url && m.before_url ? (
                <div className="grid grid-cols-2 gap-1.5">
                  <img
                    src={m.before_url}
                    alt={`${m.caption ?? "Before/After"} (Before)`}
                    className="h-32 w-full rounded-md border border-border-default bg-surface object-cover"
                  />
                  <img
                    src={m.url}
                    alt={`${m.caption ?? "Before/After"} (After)`}
                    className="h-32 w-full rounded-md border border-border-default bg-surface object-cover"
                  />
                </div>
              ) : null}
              {m.caption ? <div className="text-xs text-secondary">{m.caption}</div> : null}
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-xl bg-base p-4 text-sm text-muted">登録された動画 / Before-After はありません。</div>
      )}
    </section>
  );
}
