/**
 * 証明書「記録」アンカー (メタデータ) バッジの状態導出 (純関数)。
 *
 * `/api/cert-verify/[public_id]` のレスポンスから、公開証明書ページに出す
 * バッジ状態を決める。画像バイト列アンカーの AuthenticityBadge とは別レイヤー
 * (こちらは証明書レコードそのものの存在証明)。
 *
 * データが無い (present:false / current 無し) 場合は "none" を返し、UI は何も
 * 描画しない — 既存証明書を視覚的に劣化させないため (AuthenticityBadge と同方針)。
 */

import type { CertVerifyResponse } from "./certVerifyResponse";

export type RecordAnchorBadgeState =
  | { kind: "none" }
  | { kind: "anchored"; label: string; href: string | null; tooltip: string; verified: boolean | null }
  | { kind: "pending"; label: string; tooltip: string };

export function deriveRecordAnchorBadge(res: CertVerifyResponse | null | undefined): RecordAnchorBadgeState {
  const anchoring = res?.record_anchoring;
  if (!anchoring?.present) return { kind: "none" };
  const cur = anchoring.current;
  if (!cur) return { kind: "none" };

  if (cur.status === "anchored") {
    const verified = anchoring.on_chain_verified;
    return {
      kind: "anchored",
      href: cur.polygonscan_url,
      verified,
      label: "証明書記録 ブロックチェーン検証済み",
      tooltip:
        "証明書の内容（発行日・施工内容・有効期限）が改ざん検知可能な形で Polygon に記録されています。" +
        (verified === true ? "\nオンチェーンでアンカーを確認済みです。" : ""),
    };
  }

  if (cur.status === "queued" || cur.status === "batched") {
    return {
      kind: "pending",
      label: "ブロックチェーン刻印待機中",
      tooltip: "証明書記録のブロックチェーン刻印を順次処理しています（通常は日次バッチ）。",
    };
  }

  // failed / 未知ステータスは公開ページでは出さない。
  return { kind: "none" };
}
