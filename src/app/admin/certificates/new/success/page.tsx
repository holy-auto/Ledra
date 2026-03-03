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
    <main className="p-6 max-w-xl space-y-4">
      <h1 className="text-2xl font-bold">発行完了</h1>

      {pid ? (
        <div className="border rounded p-4 space-y-3">
          <div className="text-sm">public_id</div>
          <div className="font-mono">{pid}</div>

          <div className="text-sm pt-2">公開URL</div>
          <Link className="underline" href={rel} target="_blank">{fullUrl}</Link>

          <div className="pt-2">
            <img src={qr} alt="QR" className="h-32 w-32 border rounded" />
            <div className="text-[10px] text-gray-500 mt-1">QRで即表示</div>
          </div>
        </div>
      ) : (
        <p className="text-sm text-red-600">pid がありません</p>
      )}

      <div className="flex gap-4 text-sm">
        <Link className="underline" href="/admin/certificates/new">続けて発行</Link>
        <Link className="underline" href="/admin/certificates">一覧へ</Link>
      </div>
    </main>
  );
}