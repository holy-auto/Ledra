import { NextRequest, after } from "next/server";
import { createServiceRoleAdmin } from "@/lib/supabase/admin";
import { apiOk, apiInternalError, apiError } from "@/lib/api/response";
import { verifySignature, handleWebhookEvents } from "@/lib/line/client";
import { claimWebhookEvent } from "@/lib/webhooks/idempotency";
import { readSecret } from "@/lib/crypto/tenantSecrets";

export const dynamic = "force-dynamic";
// after() 内で AI 抽出→自動返信 (ナレッジ/概算)→会話フロー→見積ドラフトという LLM 呼び出しの
// 逐次チェーンを実行する。抽出が遅い回だと合計が 60 秒を超え、最後発の顧客向け概算返信が
// 打ち切られて「認識はできているのに返信が来ない」事象になっていた。応答は after() 前に返して
// いるため背景予算を延ばすのは安全。プラン上限を超える値は Vercel 側で自動クランプされる。
export const maxDuration = 300;

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

    // テナントの LINE 設定を取得 (encrypted column only)
    const admin = createServiceRoleAdmin("LINE webhook — resolves tenant from LINE channel id, pre-resolution");
    const { data: tenant } = await admin
      .from("tenants")
      .select("line_channel_secret_ciphertext, line_enabled")
      .eq("id", tenantId)
      .single();

    if (!tenant?.line_enabled) {
      return apiError({ code: "forbidden", message: "LINE integration not enabled", status: 403 });
    }

    const channelSecret = await readSecret(tenant.line_channel_secret_ciphertext, "tenants.line_channel_secret");
    if (!channelSecret) {
      return apiError({ code: "forbidden", message: "LINE integration not enabled", status: 403 });
    }

    // 署名検証
    const signature = req.headers.get("x-line-signature");
    const bodyText = await req.text();

    if (!signature || !(await verifySignature(bodyText, signature, channelSecret))) {
      return apiError({ code: "unauthorized", message: "Invalid signature", status: 401 });
    }

    const body = JSON.parse(bodyText);
    const events: unknown[] = body.events ?? [];

    // G13: event 単位の冪等性 — LINE は失敗時に再配信するため
    // (webhookEventId は LINE spec で一意保証)。
    // duplicate は handleWebhookEvents 渡しから除外、claim 失敗は安全側で透過。
    const eventsToProcess: unknown[] = [];
    if (events.length > 0) {
      const idemSupabase = createServiceRoleAdmin("line-webhook idempotency claim");
      for (const ev of events) {
        const evRecord = ev as { webhookEventId?: string; type?: string };
        if (!evRecord.webhookEventId) {
          eventsToProcess.push(ev);
          continue;
        }
        const claim = await claimWebhookEvent(idemSupabase, "line", evRecord.webhookEventId, evRecord.type ?? null);
        if (claim === "claimed" || claim === "error") {
          // error は claim 自体の失敗 (DB 障害等)。LINE 側 retry を待たず処理を試みる
          eventsToProcess.push(ev);
        }
        // duplicate は skip
      }
    }

    if (eventsToProcess.length > 0) {
      // 非同期で処理（LINE は 200 を即返す必要がある）。
      // after() でレスポンス確定後もサーバーレス実行環境が処理完了まで生かす
      // （素の fire-and-forget だとレスポンス送信直後に打ち切られうる）。
      const eventsForHandler = eventsToProcess as Parameters<typeof handleWebhookEvents>[1];
      after(async () => {
        try {
          await handleWebhookEvents(tenantId, eventsForHandler);
        } catch (e) {
          console.error("[LINE webhook] event handling error:", e);
        }
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
