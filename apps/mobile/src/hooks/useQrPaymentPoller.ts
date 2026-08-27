import { useEffect } from "react";

import { mobileApi } from "@/lib/api";

/**
 * QR 決済の完了をポーリングで待つ。**会計画面とウォークインの両方**が使う。
 *
 * `sessionId` が null の間は何もしない。呼び出し側は
 * `useQrPaymentPoller(polling ? sessionId : null, onPaid)` の形で止める。
 *
 * ponytail: 3秒ごとの素朴なポーリング。上限は「アプリを閉じている間は進まない」こと。
 * webhook からのプッシュに変えるなら、この関数を差し替えれば両画面に効く。
 */
export function useQrPaymentPoller(sessionId: string | null, onPaid: () => void) {
  useEffect(() => {
    if (!sessionId) return;
    let active = true;
    const poll = async () => {
      while (active) {
        await new Promise((r) => setTimeout(r, 3000));
        try {
          const res = await mobileApi<{ status: string }>(`/pos/checkout/qr-status?session_id=${sessionId}`);
          if (res.status === "paid" && active) {
            active = false;
            // 重複防止の鍵はサーバがセッションから引く。ここでは渡さない
            onPaid();
          }
        } catch {
          // ポーリング失敗は無視して継続（電波が切れただけのことが多い）
        }
      }
    };
    poll();
    return () => {
      active = false;
    };
  }, [sessionId, onPaid]);
}
