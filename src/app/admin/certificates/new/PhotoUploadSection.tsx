"use client";

import Image from "next/image";
import dynamic from "next/dynamic";
import { useRef, useState, useCallback, forwardRef, useImperativeHandle, useEffect } from "react";
import type { AnnotationDocument } from "@/components/imageMarkup/types";

// SSR 不可なので動的読み込み。
const ImageMarkupModal = dynamic(() => import("@/components/imageMarkup/ImageMarkupModal"), { ssr: false });

export type PhotoAnnotationEntry = {
  /** PhotoUploadSection の Preview と同じ id (= 配列内の通し番号)。 */
  previewId: number;
  /**
   * getFiles() で返した配列内の位置 = upload API へ multipart で送る順序。
   * file.name が重複してもサーバ側 response の index と突き合わせ可能にする。
   */
  uploadIndex: number;
  /** 元ファイル名 (api 側でも file.name として保存される)。診断用 */
  fileName: string;
  /** 注釈ドキュメント。空なら null。 */
  doc: AnnotationDocument;
};

export type PhotoUploadHandle = {
  getFiles: () => File[];
  /** ファイル名と紐付いた注釈ドキュメントの配列。注釈なしのファイルは含まれない。 */
  getAnnotations: () => PhotoAnnotationEntry[];
};

type Props = {
  maxPhotos: number;
  planLabel: string;
  /** 親フォームへ枚数変化を通知 (発行前ゲート用) */
  onCountChange?: (count: number) => void;
};

type Preview = {
  id: number;
  file: File;
  objectUrl: string;
  annotations: AnnotationDocument | null;
};

let nextPId = 1;

const PhotoUploadSection = forwardRef<PhotoUploadHandle, Props>(function PhotoUploadSection(
  { maxPhotos, planLabel, onCountChange },
  ref,
) {
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [previews, setPreviews] = useState<Preview[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);

  useImperativeHandle(ref, () => ({
    getFiles: () => previews.map((p) => p.file),
    getAnnotations: () =>
      previews
        .map((p, idx) => ({ p, idx }))
        .filter(({ p }) => p.annotations && p.annotations.annotations.length > 0)
        .map(({ p, idx }) => ({
          previewId: p.id,
          uploadIndex: idx,
          fileName: p.file.name,
          doc: p.annotations as AnnotationDocument,
        })),
  }));

  useEffect(() => {
    onCountChange?.(previews.length);
  }, [previews.length, onCountChange]);

  const addFiles = useCallback(
    (fileList: FileList | null) => {
      if (!fileList) return;
      const remaining = maxPhotos - previews.length;
      if (remaining <= 0) return;
      const toAdd = Array.from(fileList).slice(0, remaining);
      const newPreviews: Preview[] = toAdd.map((file) => ({
        id: nextPId++,
        file,
        objectUrl: URL.createObjectURL(file),
        annotations: null,
      }));
      setPreviews((prev) => [...prev, ...newPreviews]);
    },
    [previews.length, maxPhotos],
  );

  const removePreview = (id: number) => {
    setPreviews((prev) => {
      const p = prev.find((p) => p.id === id);
      if (p) URL.revokeObjectURL(p.objectUrl);
      return prev.filter((p) => p.id !== id);
    });
  };

  const count = previews.length;
  const full = count >= maxPhotos;

  return (
    <div className="border-t border-border-subtle pt-6 space-y-4">
      <div>
        <div className="text-xs font-semibold tracking-[0.18em] text-muted">PHOTOS</div>
        <div className="mt-0.5 flex items-baseline gap-2">
          <span className="text-base font-semibold text-primary">施工写真</span>
          <span className="text-xs text-muted">
            <span className="font-semibold text-danger">必須</span>（発行には1枚以上）· 最大 {maxPhotos} 枚（
            {planLabel} プラン）
          </span>
        </div>
      </div>

      {/* Capture area — camera only. Album/file-picker & drag-drop were removed so
          Ledra signs only on-site captures: the C2PA manifest asserts
          digitalSourceType=digitalCapture, which would be false for arbitrary
          uploaded files (screenshots / edited / generated images). See
          src/lib/anchoring/providers/c2pa.ts (CREATED_ACTION). */}
      {!full && (
        <div className="rounded-xl border-2 border-dashed border-border-default bg-inset px-4 py-6 text-center hover:border-border-strong hover:bg-surface-hover transition-colors">
          <div className="text-2xl text-muted">📷</div>
          <div className="mt-2 text-sm font-medium text-secondary">写真を撮影</div>
          <div className="mt-1 text-xs text-muted">
            JPG / PNG / WebP / HEIC · 最大 20MB/枚 · あと {maxPhotos - count} 枚
          </div>

          {/* Action buttons */}
          <div className="mt-4 flex flex-wrap justify-center gap-3">
            <button
              type="button"
              onClick={() => cameraInputRef.current?.click()}
              className="inline-flex items-center gap-2 rounded-lg border border-border-default bg-surface px-4 py-2 text-sm font-medium text-primary shadow-sm hover:bg-surface-hover hover:border-border-strong transition-colors"
            >
              <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M6.827 6.175A2.31 2.31 0 0 1 5.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 0 0-1.134-.175 2.31 2.31 0 0 1-1.64-1.055l-.822-1.316a2.192 2.192 0 0 0-1.736-1.039 48.774 48.774 0 0 0-5.232 0 2.192 2.192 0 0 0-1.736 1.039l-.821 1.316Z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M16.5 12.75a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0Z"
                />
              </svg>
              カメラで撮影
            </button>
          </div>
        </div>
      )}

      {/* Camera input (capture=environment launches rear camera on mobile). No
          album/file-picker input: signing is limited to captures — see note above. */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
        capture="environment"
        className="hidden"
        onChange={(e) => addFiles(e.target.files)}
        onClick={(e) => {
          (e.target as HTMLInputElement).value = "";
        }}
      />

      {/* Previews */}
      {count > 0 && (
        <div>
          <div className="mb-2 text-xs text-muted">
            {count} / {maxPhotos} 枚
          </div>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
            {previews.map((p) => {
              const annotationCount = p.annotations?.annotations.length ?? 0;
              return (
                <div key={p.id} className="group relative">
                  <div className="relative aspect-square overflow-hidden rounded-xl border border-border-default bg-inset">
                    <Image
                      src={p.objectUrl}
                      alt={p.file.name}
                      fill
                      sizes="(max-width: 640px) 33vw, (max-width: 768px) 25vw, 20vw"
                      unoptimized
                      className="object-cover"
                    />
                    {annotationCount > 0 ? (
                      <span className="absolute left-1 top-1 rounded-full bg-accent px-1.5 py-0.5 text-[9px] font-semibold text-white shadow-sm">
                        注釈 {annotationCount}
                      </span>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    onClick={() => setEditingId(p.id)}
                    className="absolute -left-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full border border-border-default bg-surface text-[10px] text-muted shadow-sm hover:bg-accent-dim hover:text-accent-text hover:border-accent"
                    aria-label="注釈を追加"
                    title="注釈を追加"
                  >
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path
                        d="M16.862 4.487l1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L6.832 19.82a4.5 4.5 0 0 1-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 0 1 1.13-1.897l11.682-11.682Z"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>
                  <button
                    type="button"
                    onClick={() => removePreview(p.id)}
                    className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full border border-border-default bg-surface text-[10px] text-muted shadow-sm hover:bg-red-50 hover:text-red-600 hover:border-red-300"
                    aria-label="削除"
                  >
                    ✕
                  </button>
                  <div className="mt-1 truncate text-[10px] text-muted px-0.5">{p.file.name}</div>
                </div>
              );
            })}

            {/* Add-more tile — camera only (no album picker; see note above) */}
            {!full && (
              <button
                type="button"
                onClick={() => cameraInputRef.current?.click()}
                className="aspect-square flex flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-border-default bg-inset text-muted hover:border-border-strong hover:text-secondary"
                title="カメラで撮影"
              >
                <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M6.827 6.175A2.31 2.31 0 0 1 5.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 0 0-1.134-.175 2.31 2.31 0 0 1-1.64-1.055l-.822-1.316a2.192 2.192 0 0 0-1.736-1.039 48.774 48.774 0 0 0-5.232 0 2.192 2.192 0 0 0-1.736 1.039l-.821 1.316Z"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M16.5 12.75a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0Z"
                  />
                </svg>
                <span className="text-[9px]">撮影</span>
              </button>
            )}
          </div>
        </div>
      )}

      {full && (
        <div className="rounded-xl border border-warning/30 bg-warning-dim px-3 py-2 text-xs text-warning-text">
          {planLabel} プランの上限（{maxPhotos} 枚）に達しました。
        </div>
      )}

      {(() => {
        const editing = editingId !== null ? previews.find((p) => p.id === editingId) : null;
        if (!editing) return null;
        return (
          <ImageMarkupModal
            open={true}
            imageUrl={editing.objectUrl}
            initial={editing.annotations}
            title={editing.file.name}
            onSave={(doc) => {
              setPreviews((prev) =>
                prev.map((p) =>
                  p.id === editing.id ? { ...p, annotations: doc.annotations.length > 0 ? doc : null } : p,
                ),
              );
            }}
            onClose={() => setEditingId(null)}
          />
        );
      })()}
    </div>
  );
});

export default PhotoUploadSection;
