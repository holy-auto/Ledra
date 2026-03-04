import { NextResponse } from "next/server";

// 既存の単票PDFエンドポイントへ委譲（bodyもそのままPOSTで流れる）
export { POST } from "../../certificate/pdf/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ブラウザで開いた時(=GET)に 405 を出さないための案内
export async function GET() {
  return NextResponse.json({
    ok: true,
    note: "Use POST",
    endpoint: "/api/certificates/pdf-one",
    expects: { certificate_id: "..." }
  });
}
