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
    <div className="border-t border-neutral-100 pt-6 space-y-4">
      <div>
        <div className="text-xs font-semibold tracking-[0.18em] text-neutral-500">PHOTOS</div>
        <div className="mt-0.5 flex items-baseline gap-2">
          <span className="text-base font-semibold text-neutral-900">施工写真</span>
          <span className="text-xs text-neutral-400">任意 · 最大 {maxPhotos} 枚（{planLabel} プラン）</span>
        </div>
      </div>

      {/* Drop zone */}
      {!full && (
        <div
          onDrop={onDrop}
          onDragOver={(e) => e.preventDefault()}
          onClick={() => inputRef.current?.click()}
          className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-neutral-300 bg-neutral-50 px-4 py-6 text-center hover:border-neutral-400 hover:bg-white transition-colors"
        >
          <div className="text-2xl text-neutral-300">📷</div>
          <div className="mt-2 text-sm font-medium text-neutral-600">
            クリックまたはドラッグ&ドロップで追加
          </div>
          <div className="mt-1 text-xs text-neutral-400">
            JPG / PNG / WebP / HEIC · 最大 20MB/枚 · あと {maxPhotos - count} 枚
          </div>
        </div>
      )}

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
          <div className="mb-2 text-xs text-neutral-500">
            {count} / {maxPhotos} 枚
          </div>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
            {previews.map((p) => (
              <div key={p.id} className="group relative">
                <div className="aspect-square overflow-hidden rounded-xl border border-neutral-200 bg-neutral-100">
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
                  className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full border border-neutral-300 bg-white text-[10px] text-neutral-500 shadow-sm hover:bg-red-50 hover:text-red-600 hover:border-red-300"
                  aria-label="削除"
                >
                  ✕
                </button>
                <div className="mt-1 truncate text-[10px] text-neutral-400 px-0.5">
                  {p.file.name}
                </div>
              </div>
            ))}

            {/* Add more tile */}
            {!full && (
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="aspect-square flex items-center justify-center rounded-xl border-2 border-dashed border-neutral-200 bg-neutral-50 text-2xl text-neutral-300 hover:border-neutral-400"
              >
                +
              </button>
            )}
          </div>
        </div>
      )}

      {full && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
          {planLabel} プランの上限（{maxPhotos} 枚）に達しました。
        </div>
      )}
    </div>
  );
});

export default PhotoUploadSection;
