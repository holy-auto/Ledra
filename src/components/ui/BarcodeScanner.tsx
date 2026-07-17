"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader, type IScannerControls } from "@zxing/browser";
import { BarcodeFormat, DecodeHintType } from "@zxing/library";
import { isTopOverlay, registerOverlay, unregisterOverlay } from "./overlayStack";

interface Props {
  open: boolean;
  /** スキャン成功時に、デコード済みの生テキストを親へ渡す。 */
  onResult: (rawText: string) => void;
  onClose: () => void;
  /** 見出し (既定: 商品バーコード)。 */
  title?: string;
  /** 補足説明。 */
  description?: string;
}

/**
 * 汎用 バーコード / QR カメラスキャナ モーダル。
 *
 * `@zxing/browser` の `BrowserMultiFormatReader` でライブ映像から
 * 1 次元バーコード (JAN/EAN-13, UPC, Code128/39, ITF) と QR を継続的に
 * 読み取り、検出した最初の 1 件で `onResult(rawText)` を呼ぶ。
 *
 * 車検証 QR 専用の `ShakenshoScanner` と同じ作法 (srcObject にストリームを
 * 流すため CSP `media-src` の影響を受けない / Permissions-Policy は
 * camera=(self) で許可済み) だが、在庫品目の照合用に小売バーコード形式を
 * 既定で有効化している。
 */
const INVENTORY_FORMATS = [
  BarcodeFormat.EAN_13,
  BarcodeFormat.EAN_8,
  BarcodeFormat.UPC_A,
  BarcodeFormat.UPC_E,
  BarcodeFormat.CODE_128,
  BarcodeFormat.CODE_39,
  BarcodeFormat.ITF,
  BarcodeFormat.QR_CODE,
];

export default function BarcodeScanner({ open, onResult, onClose, title, description }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const calledRef = useRef(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Register with the shared overlay registry so an ancestor Modal/Drawer
  // this scanner is opened from within correctly stands down its own
  // Escape/focus-trap handling while the (visually topmost, z-[60])
  // scanner is open — see overlayStack.ts. Registering it alone would
  // silence the ancestor's Escape/Tab handling with nothing standing in
  // for it, so this scanner owns that same handling itself below.
  useEffect(() => {
    if (!open || !rootRef.current) return;
    const el = rootRef.current;
    registerOverlay(el);
    return () => unregisterOverlay(el);
  }, [open]);

  const getFocusableElements = useCallback(() => {
    if (!rootRef.current) return [];
    return Array.from(
      rootRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    );
  }, []);

  // Close on Escape & focus trap — same pattern as Modal/Drawer.
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (!isTopOverlay(rootRef.current)) return;
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key === "Tab") {
        const focusable = getFocusableElements();
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose, getFocusableElements]);

  // Focus first focusable element on open — same pattern (and same
  // same-commit-race guard) as Modal/Drawer.
  useEffect(() => {
    if (!open) return;
    requestAnimationFrame(() => {
      if (!isTopOverlay(rootRef.current)) return;
      const focusable = getFocusableElements();
      if (focusable.length > 0) focusable[0].focus();
    });
  }, [open, getFocusableElements]);

  useEffect(() => {
    if (!open) return;

    calledRef.current = false;
    setReady(false);
    setError(null);

    const hints = new Map<DecodeHintType, unknown>();
    hints.set(DecodeHintType.POSSIBLE_FORMATS, INVENTORY_FORMATS);
    hints.set(DecodeHintType.TRY_HARDER, true);

    const reader = new BrowserMultiFormatReader(hints);

    const videoEl = videoRef.current;
    if (!videoEl) return;

    let cancelled = false;
    let controls: IScannerControls | null = null;

    // 在庫スキャンは背面 (環境向き) カメラを優先する。ideal なので背面が無い
    // 端末 (PC・前面のみ) では自動でフォールバックし OverconstrainedError にしない。
    const constraints: MediaStreamConstraints = {
      audio: false,
      video: { facingMode: { ideal: "environment" } },
    };

    reader
      .decodeFromConstraints(constraints, videoEl, (result) => {
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
      ref={rootRef}
      className="fixed inset-0 z-[60] flex flex-col bg-black/95"
      role="dialog"
      aria-modal="true"
      aria-label={title ?? "商品バーコードのスキャナ"}
    >
      <div className="flex items-start justify-between gap-3 p-4 text-white">
        <div>
          <div className="text-lg font-semibold">{title ?? "商品バーコードをスキャン"}</div>
          <div className="mt-0.5 text-xs text-white/80">
            {description ?? "商品のバーコードにカメラをかざしてください"}
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
        <video ref={videoRef} playsInline muted className="max-h-full max-w-full" />

        {!ready && !error && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-white">
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
            className="pointer-events-none absolute inset-x-8 inset-y-1/3 rounded-2xl border-2 border-white/40"
          />
        )}
      </div>

      <div className="p-4 text-center text-xs text-white/70">
        読み取れない場合は「閉じる」→ 一覧から品目を選択してください
      </div>
    </div>
  );
}
