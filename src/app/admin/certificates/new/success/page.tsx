import Link from "next/link";
import Image from "next/image";
import { headers } from "next/headers";
import { qrSvgDataUrl } from "@/lib/qr";
import { getVehicleReportSettings } from "@/lib/vehicleReport/access";
import { formatJpy } from "@/lib/format";

export default async function Page({ searchParams }: { searchParams: Promise<{ pid?: string }> }) {
  const sp = await searchParams;
  const pid = sp.pid || "";
  const rel = pid ? `/c/${pid}` : "";

  const h = await headers();
  const host = h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? "http";
  const baseUrl = `${proto}://${host}`;

  const fullUrl = pid ? `${baseUrl}${rel}` : "";
  const qr = pid ? await qrSvgDataUrl(fullUrl) : "";

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-primary">発行完了</h1>

      {pid ? (
        <ValuePreviewSection pid={pid} rel={rel} fullUrl={fullUrl} qr={qr} />
      ) : (
        <p className="text-sm text-danger">pid がありません</p>
      )}

      <div className="flex gap-4 text-sm">
        <Link className="underline text-accent hover:text-accent/80" href="/admin/certificates/new">
          続けて発行
        </Link>
        <Link className="underline text-accent hover:text-accent/80" href="/admin/certificates">
          一覧へ
        </Link>
      </div>
    </div>
  );
}

/** ponytail: server component — DB call only fires when pid is present. */
async function ValuePreviewSection({
  pid,
  rel,
  fullUrl,
  qr,
}: {
  pid: string;
  rel: string;
  fullUrl: string;
  qr: string;
}) {
  const settings = await getVehicleReportSettings();
  const merchantShareJpy = Math.floor((settings.price_jpy * settings.merchant_share_bps) / 10_000);

  return (
    <>
      <div className="glass-card p-4 space-y-3">
        <div className="text-sm text-secondary">public_id</div>
        <div className="font-mono text-primary">{pid}</div>

        <div className="text-sm pt-2 text-secondary">公開URL</div>
        <Link className="underline text-accent hover:text-accent/80" href={rel} target="_blank">
          {fullUrl}
        </Link>

        <div className="pt-2">
          <Image
            src={qr}
            alt="QR"
            width={128}
            height={128}
            unoptimized
            className="h-32 w-32 border border-border-default rounded-xl"
          />
          <div className="text-[10px] text-muted mt-1">QRで即表示</div>
        </div>
      </div>

      {/* ponytail: value-preview card — Lv.1 で収益還元の存在を体感させる。
           実際の按分は VIN あたりの記録数で割るため表示は上限値。 */}
      <div className="glass-card p-4 space-y-2">
        <div className="text-sm font-bold text-primary">技術が、資産になる。</div>
        <p className="text-xs text-secondary leading-relaxed">
          いま発行した記録はブロックチェーンに刻まれ、この車両の
          <span className="text-accent font-medium">パスポートレポート</span>
          が購入されるたびに収益が還元されます。
        </p>
        <div className="flex items-baseline gap-1 pt-1">
          <span className="text-lg font-bold text-accent">{formatJpy(merchantShareJpy)}</span>
          <span className="text-xs text-muted">/ レポート販売あたり最大</span>
        </div>
        <Link
          className="inline-block text-xs underline text-accent hover:text-accent/80 pt-1"
          href="/admin/report-revenue"
        >
          収益レポートを見る →
        </Link>
      </div>
    </>
  );
}
