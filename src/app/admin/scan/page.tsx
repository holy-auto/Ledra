"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import BarcodeScanner from "@/components/ui/BarcodeScanner";

/**
 * スタッフ用 車両タグスキャン入口。車両に貼られた QR (/s/v/<publicId>) を
 * カメラで読み取り、その解決ルートへ遷移する。解決ルート側でログイン確認と
 * テナントスコープの車両解決を行い、車両詳細の作業開始パネルへ転送する。
 *
 * ponytail: Web NFC (NDEFReader) は Chrome-Android 限定のため Web では扱わず、
 * 全ブラウザで動く QR カメラ (BarcodeScanner/@zxing) を主導線にする。NFC 読取は
 * モバイルアプリ (apps/mobile) 側で提供する。
 */
const TAG_PATH_RE = /^\/s\/v\/[^/]+$/;

export default function AdminScanPage() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleResult = useCallback(
    (raw: string) => {
      setOpen(false);
      // QR は絶対 URL を焼くが、相対パスや別オリジンでも自オリジンの
      // /s/v/<publicId> だけを受理する (他所への誘導を踏まない)。
      let path: string | null = null;
      try {
        const u = new URL(raw, window.location.origin);
        if (u.origin === window.location.origin && TAG_PATH_RE.test(u.pathname)) {
          path = u.pathname;
        }
      } catch {
        if (TAG_PATH_RE.test(raw)) path = raw;
      }
      if (!path) {
        setError("Ledra の車両タグではありません。読み取った内容を確認してください。");
        return;
      }
      router.push(path);
    },
    [router],
  );

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-primary">車両タグをスキャン</h1>
        <p className="mt-1 text-sm text-muted">
          車両に貼られた QR コードをカメラで読み取り、その車両の作業をすぐ開始できます。
        </p>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-500/30 bg-[rgba(239,68,68,0.1)] p-3 text-sm text-red-500">
          {error}
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
        className="btn-primary"
      >
        カメラを起動してスキャン
      </button>

      <BarcodeScanner
        open={open}
        onResult={handleResult}
        onClose={() => setOpen(false)}
        title="車両タグをスキャン"
        description="車両の QR コードにカメラをかざしてください"
      />
    </div>
  );
}
