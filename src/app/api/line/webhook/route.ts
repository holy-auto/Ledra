import { NextRequest } from "next/server";
import { createServiceRoleAdmin } from "@/lib/supabase/admin";
import { apiOk, apiInternalError, apiError } from "@/lib/api/response";
import { verifySignature, handleWebhookEvents } from "@/lib/line/client";

export const dynamic = "force-dynamic";

/**
 * POST /api/line/webhook?tenant_id=xxx
 *
 * LINE Platform からの Webhook エンドポイント。
 * テナントごとに LINE Bot を設定し、Webhook URL にテナントIDをクエリパラメータで渡す。
 * 例: https://app.ledra.co.jp/api/line/webhook?tenant_id=xxxx
 */
export async function POST(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const tenantId = url.searchParams.get("tenant_id");
    if (!tenantId) {
      return apiError({ code: "validation_error", message: "tenant_id is required", status: 400 });
    }

    // テナントの LINE 設定を取得
    const admin = createServiceRoleAdmin("LINE webhook — resolves tenant from LINE channel id, pre-resolution");
    const { data: tenant } = await admin
      .from("tenants")
      .select("line_channel_secret, line_enabled")
      .eq("id", tenantId)
      .single();

    if (!tenant?.line_enabled || !tenant.line_channel_secret) {
      return apiError({ code: "forbidden", message: "LINE integration not enabled", status: 403 });
    }

    // 署名検証
    const signature = req.headers.get("x-line-signature");
    const bodyText = await req.text();

    if (!signature || !(await verifySignature(bodyText, signature, tenant.line_channel_secret))) {
      return apiError({ code: "unauthorized", message: "Invalid signature", status: 401 });
    }

    const body = JSON.parse(bodyText);
    const events = body.events ?? [];

    if (events.length > 0) {
      // 非同期で処理（LINE は 200 を即返す必要がある）
      handleWebhookEvents(tenantId, events).catch((e) => {
        console.error("[LINE webhook] event handling error:", e);
      });
    }

    return apiOk({ status: "ok" });
  } catch (e) {
    return apiInternalError(e, "LINE webhook");
  }
}

/**
 * GET /api/line/webhook
 * LINE Platform の Webhook URL 検証用（設定画面から verify 時に使用）
 */
export async function GET() {
  return apiOk({ status: "ok" });
}
