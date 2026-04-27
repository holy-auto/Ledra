"use client";

import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader, type IScannerControls } from "@zxing/browser";
import { BarcodeFormat, DecodeHintType } from "@zxing/library";

interface Props {
  open: boolean;
  /** スキャン成功時に、デコード済みの生テキストを親へ渡す。 */
  onResult: (rawText: string) => void;
  onClose: () => void;
}

/**
 * 車検証 二次元コード 用カメラスキャナ モーダル。
 *
 * `@zxing/browser` の `BrowserMultiFormatReader` でライブビデオから
 * QR コード（必要に応じて DataMatrix）を継続的に読み取り、
 * 検出した最初の 1 件で `onResult` を呼ぶ。
 *
 * 呼び出し側は得られた生テキストを `/api/vehicles/parse-shakken-qr` に
 * POST して構造化データに変換する。
 */
export default function ShakenshoScanner({ open, onResult, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const calledRef = useRef(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;

    calledRef.current = false;
    setReady(false);
    setError(null);

    const hints = new Map<DecodeHintType, unknown>();
    hints.set(DecodeHintType.POSSIBLE_FORMATS, [
      BarcodeFormat.QR_CODE,
      BarcodeFormat.DATA_MATRIX,
    ]);
    hints.set(DecodeHintType.TRY_HARDER, true);

    const reader = new BrowserMultiFormatReader(hints);

    const videoEl = videoRef.current;
    if (!videoEl) return;

    let cancelled = false;
    let controls: IScannerControls | null = null;

    reader
      .decodeFromVideoDevice(undefined, videoEl, (result) => {
        if (cancelled || calledRef.current) return;
        if (result) {
          calledRef.current = true;
          // stop the stream immediately to free the camera
          controls?.stop();
          onResult(result.getText());
        }
      })
      .then((c) => {
        if (cancelled) {
          c.stop();
          return;
        }
        controls = c;
        setReady(true);
      })
      .catch((e: Error & { name?: string }) => {
        if (cancelled) return;
        if (e.name === "NotAllowedError") {
          setError("カメラの使用が許可されていません。ブラウザの設定から許可してください。");
        } else if (e.name === "NotFoundError" || e.name === "OverconstrainedError") {
          setError("利用可能なカメラが見つかりませんでした。");
        } else if (e.name === "NotReadableError") {
          setError("カメラが他のアプリで使用されている可能性があります。");
        } else {
          setError("カメラを起動できませんでした。");
        }
      });

    return () => {
      cancelled = true;
      controls?.stop();
      controls = null;
    };
  }, [open, onResult]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-black/95"
      role="dialog"
      aria-modal="true"
      aria-label="車検証の二次元コードスキャナ"
    >
      <div className="flex items-start justify-between gap-3 p-4 text-white">
        <div>
          <div className="text-lg font-semibold">車検証の二次元コードをスキャン</div>
          <div className="mt-0.5 text-xs text-white/80">
            電子車検証の印字 QR にカメラをかざしてください
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border border-white/20 px-4 py-2 text-sm text-white hover:bg-white/10"
        >
          閉じる
        </button>
      </div>

      <div className="relative flex flex-1 items-center justify-center overflow-hidden">
        <video
          ref={videoRef}
          playsInline
          muted
          className="max-h-full max-w-full"
        />

        {!ready && !error && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-white/80">
            カメラを起動しています...
          </div>
        )}

        {error && (
          <div className="absolute inset-0 flex items-center justify-center p-6">
            <div className="max-w-md rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-200">
              {error}
            </div>
          </div>
        )}

        {ready && !error && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-8 inset-y-16 rounded-2xl border-2 border-white/40"
          />
        )}
      </div>

      <div className="p-4 text-center text-xs text-white/80">
        スキャンできない場合は「閉じる」→「車検証から読み取る」で画像アップロードをお試しください
      </div>
    </div>
  );
}
