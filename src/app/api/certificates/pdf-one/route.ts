import { NextRequest, NextResponse } from "next/server";
import { enforceBilling } from "@/lib/billing/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function baseUrl(req: NextRequest) {
  const origin = req.nextUrl?.origin ?? "";
  const app = process.env.APP_URL ?? origin;
  return (app || origin).replace(/\/+$/, "");
}

function pickId(body: any): string | null {
  return (
    body?.certificate_id ??
    body?.certificateId ??
    body?.id ??
    body?.cid ??
    body?.public_id ??
    body?.publicId ??
    null
  );
}

async function proxyToCertificatePdf(req: NextRequest, id: string) {
  const base = baseUrl(req);

  // 既存実装がどのクエリ名を期待しているか不明なので候補を順に試す
  const candidates = [
    `${base}/api/certificate/pdf?certificate_id=${encodeURIComponent(id)}`,
    `${base}/api/certificate/pdf?certificateId=${encodeURIComponent(id)}`,
    `${base}/api/certificate/pdf?id=${encodeURIComponent(id)}`,
    `${base}/api/certificate/pdf?cid=${encodeURIComponent(id)}`,
    `${base}/api/certificate/pdf?public_id=${encodeURIComponent(id)}`,
    `${base}/api/certificate/pdf?publicId=${encodeURIComponent(id)}`,
  ];

  // 認証が必要な場合に備えて cookie / authorization を引き継ぐ
  const headers: Record<string, string> = {};
  const cookie = req.headers.get("cookie");
  if (cookie) headers["cookie"] = cookie;
  const auth = req.headers.get("authorization");
  if (auth) headers["authorization"] = auth;

  let last: Response | null = null;

  for (const url of candidates) {
    const res = await fetch(url, { method: "GET", headers, cache: "no-store" });
    last = res;
    if (res.ok) {
      const buf = await res.arrayBuffer();
      const ct = res.headers.get("content-type") ?? "application/pdf";
      const cd = res.headers.get("content-disposition") ?? 'inline; filename="certificate.pdf"';

      return new NextResponse(buf, {
        status: 200,
        headers: {
          "content-type": ct,
          "content-disposition": cd,
          "cache-control": "no-store",
        },
      });
    }
  }

  const status = last?.status ?? 502;
  const text = last ? await last.text().catch(() => "") : "";
  return NextResponse.json(
    { error: "Failed to proxy to /api/certificate/pdf", status, detail: text.slice(0, 500) },
    { status }
  );
}

export async function POST(req: NextRequest) {
  // mini 以上 + is_active 必須（certificate_id から tenant を逆引きできる）
  const deny = await enforceBilling(req, { minPlan: "mini", action: "pdf_one" });
  if (deny) return deny as any;

  const body = await req.json().catch(() => null);
  const id = pickId(body);

  if (!id) {
    return NextResponse.json({ error: "Missing certificate_id" }, { status: 400 });
  }

  return proxyToCertificatePdf(req, id);
}

// ブラウザで開いた時（GET）用の案内
export async function GET() {
  return NextResponse.json({ error: "Method Not Allowed" }, { status: 405 });
}
,
  });
}

