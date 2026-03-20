import Link from "next/link";
import { headers } from "next/headers";
import { qrSvgDataUrl } from "@/lib/qr";

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
        <div className="glass-card p-4 space-y-3">
          <div className="text-sm text-secondary">public_id</div>
          <div className="font-mono text-primary">{pid}</div>

          <div className="text-sm pt-2 text-secondary">公開URL</div>
          <Link className="underline text-accent hover:text-accent/80" href={rel} target="_blank">{fullUrl}</Link>

          <div className="pt-2">
            <img src={qr} alt="QR" className="h-32 w-32 border border-border-default rounded-xl" />
            <div className="text-[10px] text-muted mt-1">QRで即表示</div>
          </div>
        </div>
      ) : (
        <p className="text-sm text-danger">pid がありません</p>
      )}

      <div className="flex gap-4 text-sm">
        <Link className="underline text-accent hover:text-accent/80" href="/admin/certificates/new">続けて発行</Link>
        <Link className="underline text-accent hover:text-accent/80" href="/admin/certificates">一覧へ</Link>
      </div>
    </div>
  );
}
