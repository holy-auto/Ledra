"use client";

/**
 * メッセージバブルの本文表示。添付 (LINE 受信/送信メディア) があれば
 * 種別に応じて画像・動画・音声プレイヤー・ダウンロードリンクを描画する。
 * 受信箱 (MessagesInboxClient) と顧客メッセージタブで共用。
 */
export default function MessageBubbleBody({
  body,
  attachmentUrl,
  attachmentContentType,
}: {
  body: string;
  attachmentUrl?: string | null;
  attachmentContentType?: string | null;
}) {
  if (attachmentUrl && attachmentContentType?.startsWith("image/")) {
    return (
      <a href={attachmentUrl} target="_blank" rel="noopener noreferrer" title="クリックで原寸表示">
        {/* eslint-disable-next-line @next/next/no-img-element -- 署名付きURL (短命) のため next/image の最適化対象外 */}
        <img src={attachmentUrl} alt={body || "画像"} loading="lazy" className="max-h-64 max-w-full rounded-lg" />
      </a>
    );
  }
  if (attachmentUrl && attachmentContentType?.startsWith("video/")) {
    return <video controls preload="metadata" src={attachmentUrl} className="max-h-64 max-w-full rounded-lg" />;
  }
  if (attachmentUrl && attachmentContentType?.startsWith("audio/")) {
    return <audio controls preload="metadata" src={attachmentUrl} className="max-w-full" />;
  }
  if (attachmentUrl) {
    return (
      <div>
        <div>{body}</div>
        <a href={attachmentUrl} target="_blank" rel="noopener noreferrer" className="underline">
          添付を開く
        </a>
      </div>
    );
  }
  return <div>{body}</div>;
}
