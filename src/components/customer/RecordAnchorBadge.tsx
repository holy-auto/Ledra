"use client";

import { useEffect, useState } from "react";
import { deriveRecordAnchorBadge, type RecordAnchorBadgeState } from "@/lib/anchoring/recordAnchorBadge";
import type { CertVerifyResponse } from "@/lib/anchoring/certVerifyResponse";

/**
 * 証明書「記録」アンカー (メタデータ) の状態バッジ。
 *
 * 公開 API `/api/cert-verify/[public_id]` を叩いて anchored / pending を表示する。
 * 画像アンカーの AuthenticityBadge とは別レイヤー (証明書レコードそのものの存在証明)。
 * データが無い / 取得失敗時は何も描画しない (既存証明書を視覚的に劣化させない)。
 */
export default function RecordAnchorBadge({ publicId }: { publicId: string }) {
  const [state, setState] = useState<RecordAnchorBadgeState>({ kind: "none" });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/cert-verify/${encodeURIComponent(publicId)}`, {
          headers: { accept: "application/json" },
        });
        if (!res.ok) return;
        const json = (await res.json()) as CertVerifyResponse;
        if (!cancelled) setState(deriveRecordAnchorBadge(json));
      } catch {
        /* バッジを出さないだけ（致命的でない） */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [publicId]);

  if (state.kind === "none") return null;

  if (state.kind === "pending") {
    return (
      <div className="mb-4">
        <span
          className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-2.5 py-1 text-xs font-bold text-secondary"
          title={state.tooltip}
        >
          <span aria-hidden>⛓</span>
          {state.label}
        </span>
      </div>
    );
  }

  const baseClasses =
    "inline-flex items-center gap-1.5 rounded-full border border-accent/30 bg-accent-dim px-2.5 py-1 text-xs font-bold text-accent-text";
  const content = (
    <>
      <span aria-hidden>⛓</span>
      {state.label}
      {state.href ? (
        <span aria-hidden className="ml-1 opacity-70">
          ↗
        </span>
      ) : null}
    </>
  );

  return (
    <div className="mb-4">
      {state.href ? (
        <a
          href={state.href}
          target="_blank"
          rel="noopener noreferrer"
          className={`${baseClasses} transition-opacity hover:opacity-80`}
          title={`${state.tooltip}\nPolygonscan で取引を確認できます。`}
        >
          {content}
        </a>
      ) : (
        <span className={baseClasses} title={state.tooltip}>
          {content}
        </span>
      )}
    </div>
  );
}
