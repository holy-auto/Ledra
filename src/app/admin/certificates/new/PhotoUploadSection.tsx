"use client";

import {
  useRef,
  useState,
  useCallback,
  forwardRef,
  useImperativeHandle,
} from "react";

export type PhotoUploadHandle = {
  getFiles: () => File[];
};

type Props = {
  maxPhotos: number;
  planLabel: string;
};

type Preview = {
  id: number;
  file: File;
  objectUrl: string;
};

let nextPId = 1;

const PhotoUploadSection = forwardRef<PhotoUploadHandle, Props>(function PhotoUploadSection(
  { maxPhotos, planLabel },
  ref
) {
  const inputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [previews, setPreviews] = useState<Preview[]>([]);

  useImperativeHandle(ref, () => ({
    getFiles: () => previews.map((p) => p.file),
  }));

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
      }));
      setPreviews((prev) => [...prev, ...newPreviews]);
    },
    [previews.length, maxPhotos]
  );

  const removePreview = (id: number) => {
    setPreviews((prev) => {
      const p = prev.find((p) => p.id === id);
      if (p) URL.revokeObjectURL(p.objectUrl);
      return prev.filter((p) => p.id !== id);
    });
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    addFiles(e.dataTransfer.files);
  };

  const count = previews.length;
  const full = count >= maxPhotos;

  return (
    <div className="border-t border-border-subtle pt-6 space-y-4">
      <div>
        <div className="text-xs font-semibold tracking-[0.18em] text-muted">PHOTOS</div>
        <div className="mt-0.5 flex items-baseline gap-2">
          <span className="text-base font-semibold text-primary">施工写真</span>
          <span className="text-xs text-muted">任意 · 最大 {maxPhotos} 枚（{planLabel} プラン）</span>
        </div>
      </div>

      {/* Drop zone */}
      {!full && (
        <div
          onDrop={onDrop}
          onDragOver={(e) => e.preventDefault()}
          className="rounded-xl border-2 border-dashed border-border-default bg-inset px-4 py-6 text-center hover:border-border-strong hover:bg-surface-hover transition-colors"
        >
          <div className="text-2xl text-muted">📷</div>
          <div className="mt-2 text-sm font-medium text-secondary">
            写真を追加
          </div>
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
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 0 1 5.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 0 0-1.134-.175 2.31 2.31 0 0 1-1.64-1.055l-.822-1.316a2.192 2.192 0 0 0-1.736-1.039 48.774 48.774 0 0 0-5.232 0 2.192 2.192 0 0 0-1.736 1.039l-.821 1.316Z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0Z" />
              </svg>
              カメラで撮影
            </button>
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="inline-flex items-center gap-2 rounded-lg border border-border-default bg-surface px-4 py-2 text-sm font-medium text-primary shadow-sm hover:bg-surface-hover hover:border-border-strong transition-colors"
            >
              <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0 0 22.5 18.75V5.25A2.25 2.25 0 0 0 20.25 3H3.75A2.25 2.25 0 0 0 1.5 5.25v13.5A2.25 2.25 0 0 0 3.75 21Z" />
              </svg>
              アルバムから選択
            </button>
          </div>
          <div className="mt-2 text-xs text-muted">
            ドラッグ&ドロップにも対応しています
          </div>
        </div>
      )}

      {/* Camera input (capture=environment launches rear camera on mobile) */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
        capture="environment"
        className="hidden"
        onChange={(e) => addFiles(e.target.files)}
        onClick={(e) => { (e.target as HTMLInputElement).value = ""; }}
      />

      {/* Album/file picker input */}
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
        multiple
        className="hidden"
        onChange={(e) => addFiles(e.target.files)}
        onClick={(e) => { (e.target as HTMLInputElement).value = ""; }}
      />

      {/* Previews */}
      {count > 0 && (
        <div>
          <div className="mb-2 text-xs text-muted">
            {count} / {maxPhotos} 枚
          </div>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
            {previews.map((p) => (
              <div key={p.id} className="group relative">
                <div className="aspect-square overflow-hidden rounded-xl border border-border-default bg-inset">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={p.objectUrl}
                    alt={p.file.name}
                    className="h-full w-full object-cover"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => removePreview(p.id)}
                  className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full border border-border-default bg-surface text-[10px] text-muted shadow-sm hover:bg-red-50 hover:text-red-600 hover:border-red-300"
                  aria-label="削除"
                >
                  ✕
                </button>
                <div className="mt-1 truncate text-[10px] text-muted px-0.5">
                  {p.file.name}
                </div>
              </div>
            ))}

            {/* Add more tiles */}
            {!full && (
              <>
                <button
                  type="button"
                  onClick={() => cameraInputRef.current?.click()}
                  className="aspect-square flex flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-border-default bg-inset text-muted hover:border-border-strong hover:text-secondary"
                  title="カメラで撮影"
                >
                  <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 0 1 5.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 0 0-1.134-.175 2.31 2.31 0 0 1-1.64-1.055l-.822-1.316a2.192 2.192 0 0 0-1.736-1.039 48.774 48.774 0 0 0-5.232 0 2.192 2.192 0 0 0-1.736 1.039l-.821 1.316Z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0Z" />
                  </svg>
                  <span className="text-[9px]">撮影</span>
                </button>
                <button
                  type="button"
                  onClick={() => inputRef.current?.click()}
                  className="aspect-square flex flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-border-default bg-inset text-muted hover:border-border-strong hover:text-secondary"
                  title="アルバムから選択"
                >
                  <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                  </svg>
                  <span className="text-[9px]">追加</span>
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {full && (
        <div className="rounded-xl border border-warning/30 bg-warning-dim px-3 py-2 text-xs text-warning-text">
          {planLabel} プランの上限（{maxPhotos} 枚）に達しました。
        </div>
      )}
    </div>
  );
});

export default PhotoUploadSection;
