import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/webhooks/cloudsign
 *
 * CloudSign は使用していません。
 * 代理店契約書の電子署名は Ledra 自前の ECDSA P-256 実装（/agent-sign/[token]）に移行済みです。
 * このエンドポイントは既存 webhook 設定との後方互換性のためのスタブとして残しています。
 */
export async function POST() {
  return NextResponse.json({ ok: true, message: "CloudSign integration is no longer active." });
}
