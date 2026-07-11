"use client";

/**
 * 車両タグ (NFC/QR) 印刷用の QR 表示。dataUrl は親 (server component) が
 * qrSvgDataUrl で生成して渡す。QR には /s/v/<public_id> の絶対 URL を焼く。
 */
export default function VehicleTagQr({ dataUrl, tagUrl }: { dataUrl: string; tagUrl: string }) {
  return (
    <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
      {/* eslint-disable-next-line @next/next/no-img-element -- data: URL の SVG。next/image は不要 */}
      <img
        src={dataUrl}
        alt="車両タグ QR"
        width={160}
        height={160}
        className="rounded-lg border border-border-default bg-white p-2"
      />
      <div className="space-y-2 text-sm">
        <p className="text-secondary">
          この QR を車両 (ドア内側など) に貼ると、スタッフがスキャンしてこの車両の作業をすぐ開始できます。
        </p>
        <p className="break-all font-mono text-xs text-muted">{tagUrl}</p>
        <button type="button" onClick={() => window.print()} className="btn-secondary text-xs">
          印刷
        </button>
      </div>
    </div>
  );
}
