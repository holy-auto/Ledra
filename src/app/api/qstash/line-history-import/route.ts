/**
 * POST /api/qstash/line-history-import  (QStash 署名必須)
 *
 * 顧客に LINE (line_user_id) が紐づいた直後に enqueue される非同期ジョブ。
 * 未紐づけのまま溜まっていた過去の inbound LINE メッセージをまとめて AI 解析し、
 * 予約候補 (`customer_messages.ai_extracted`) を一括で用意する。
 *
 * 設計上の安全策:
 *   - opt-in (`inbound_message.auto_import_history_on_link`) のテナントのみ実体が動く
 *   - Standard プラン以上 + AI 有効 + 月次コストキャップを尊重
 *   - **予約 (reservations) の自動作成は一切しない** — 候補 (ai_extracted) を保存するだけ
 *   - 1 回の実行で処理する件数に上限を設ける (env `LINE_HISTORY_IMPORT_MAX`, 既定 80)
 *
 * webhook / qstash には auth セッションが無いため service-role で読み書きする。
 * tenant_id は enqueue 元 (linkLineUserToCustomer) から厳密に渡される値のみを使う。
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { withQstashSignature } from "@/lib/qstash/verifySignature";
import { apiJson } from "@/lib/api/response";
import { createServiceRoleAdmin } from "@/lib/supabase/admin";
import { canUseFeature, normalizePlanTier } from "@/lib/billing/planFeatures";
import { loadAiAutomationSettings } from "@/lib/ai/automation/policy";
import { shouldAutoImportHistoryOnLink } from "@/lib/ai/automation/orchestrator";
import { extractInboundReservation } from "@/lib/ai/inboundReservationExtract";
import { fastModelForPlanTier } from "@/lib/ai/client";
import { startAiRouteUsage } from "@/lib/ai/recordRouteUsage";
import { getCapturedUsage } from "@/lib/ai/usageContext";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const maxDuration = 300;

const ENDPOINT = "/api/qstash/line-history-import";

const payloadSchema = z.object({
  tenant_id: z.string().uuid(),
  customer_id: z.string().uuid(),
  line_user_id: z.string().min(1),
});

/**
 * 1 回の実行で処理する件数の上限。**費用と実行時間の両方をこれが守っている。**
 *
 * ## 費用
 *
 * ループ内の月次コストキャップ判定 (`baseSpentJpy + inJobJpy >= capJpy`) は
 * 2026-09-04 に既定が入って**設定が無くても働くようになった**
 * (`DEFAULT_MONTHLY_COST_CAP_JPY` = テナント1件あたり月1万円)。
 * ただし Redis 不在・失敗時は fail-open するので、**キャップだけに頼らない**。
 * この件数上限は、キャップが効かない場合の 1 回あたりのコストの天井でもある。
 *
 * ## 実行時間
 *
 * 下の for ループは 1 件 1 AI 呼び出しの直列処理で、関数の予算は
 * `maxDuration = 300` 秒。モデルは `fastModelForPlanTier(planTier)` なので
 * **starter は Haiku、standard/pro は Sonnet** (`client.ts`)。
 * Sonnet 側が支配的で、1 件 3 秒なら 80 件で約 240 秒。300 秒に対して余裕は薄い。
 *
 * **`LINE_HISTORY_IMPORT_MAX` を上げるときは `maxDuration` も一緒に上げること。**
 * `Math.min(n, 500)` は env に極端な値が入ったときの歯止めだが、
 * **500 件はこの見積もりでは 300 秒に収まらない** (1500 秒相当)。
 * 500 まで使うなら fan-out (1 リクエスト 1 件) への作り替えが要る。
 *
 * ## 切り捨て
 *
 * 取得は `created_at` の降順（新しい順）なので、溢れるのは**最も古いメッセージ**
 * ＝いま生きている予約意図を含む可能性が最も低い分。
 * ただし溢れた分は再 enqueue されず、次に同じ顧客で紐づけイベントが起きるまで
 * `ai_extracted` は null のまま残る（`truncated` を log に出すだけ）。
 */
function maxMessages(): number {
  const n = Number(process.env.LINE_HISTORY_IMPORT_MAX);
  return Number.isFinite(n) && n > 0 ? Math.min(n, 500) : 80;
}

/** 抽出済みの行は customer_id が付いている前提で、未抽出の inbound を新しい順に取る。 */
async function handler(req: NextRequest) {
  const parsed = payloadSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return apiJson({ error: "invalid payload" }, { status: 400 });
  const { tenant_id: tenantId, customer_id: customerId } = parsed.data;

  // 1) テナント設定 / プラン / opt-in / コストキャップを確認。
  const settings = await loadAiAutomationSettings(tenantId);
  if (!settings.enabled || !shouldAutoImportHistoryOnLink(settings)) {
    return apiJson({ skipped: "not_enabled" });
  }
  if (settings.costCap?.exceeded) {
    return apiJson({ skipped: "cost_cap_exceeded" });
  }

  const admin = createServiceRoleAdmin("LINE 履歴一括取り込み — qstash には auth セッション無し");
  const { data: tenant } = await admin.from("tenants").select("plan_tier, is_active").eq("id", tenantId).single();
  if (!tenant || tenant.is_active === false) return apiJson({ skipped: "tenant_inactive" });
  const planTier = normalizePlanTier(tenant.plan_tier);
  if (!canUseFeature(planTier, "ai_inbound_extract")) return apiJson({ skipped: "plan_limit" });

  // 2) 未抽出の inbound LINE メッセージを新しい順に取得 (件数上限)。
  const limit = maxMessages();
  const { data: rows, error } = await admin
    .from("customer_messages")
    .select("id, body, created_at")
    .eq("tenant_id", tenantId)
    .eq("customer_id", customerId)
    .eq("channel", "line")
    .eq("direction", "inbound")
    .is("ai_extracted", null)
    .order("created_at", { ascending: false })
    .limit(limit + 1);
  if (error) {
    logger.warn("[line-history-import] load failed", { tenantId, customerId, err: error.message });
    return apiJson({ error: "load failed" }, { status: 500 });
  }

  const all = rows ?? [];
  const truncated = all.length > limit;
  const targets = truncated ? all.slice(0, limit) : all;
  if (targets.length === 0) return apiJson({ processed: 0 });
  if (truncated) {
    logger.info("[line-history-import] truncated to limit", { tenantId, customerId, limit });
  }

  const model = fastModelForPlanTier(planTier);
  let processed = 0;
  let candidates = 0;
  let stoppedByCap = false;

  // コストキャップはジョブ内で累積を自前で追う。
  // (usage.record() の addMonthlyCostJpy は after() で応答後に遅延実行されるため、
  //  ループ中に Redis を読み直しても今回の消費は反映されない。captured.costJpy で同期計上する)
  const capJpy = settings.costCap?.capJpy ?? 0;
  const baseSpentJpy = settings.costCap?.spentJpy ?? 0;
  let inJobJpy = 0;

  // 3) 各メッセージを順に抽出して ai_extracted に保存。
  for (let i = 0; i < targets.length; i++) {
    if (capJpy > 0 && baseSpentJpy + inJobJpy >= capJpy) {
      stoppedByCap = true;
      break;
    }

    const m = targets[i];
    const text = (m.body as string | null) ?? "";
    if (!text.trim()) continue;

    const usage = startAiRouteUsage(ENDPOINT);
    const receivedDate = typeof m.created_at === "string" ? (m.created_at as string).slice(0, 10) : undefined;
    const result = await extractInboundReservation({ text, channel: "line", receivedDate }, { model });
    // この 1 呼び出しの実コストを同期的に積む (キャップを跨いだら次ループで停止)。
    inJobJpy += getCapturedUsage()?.costJpy ?? 0;

    const snapshot = { ...result, auto: true, source: "history_import", extracted_at: new Date().toISOString() };
    const { error: upErr } = await admin
      .from("customer_messages")
      .update({ ai_extracted: snapshot })
      .eq("id", m.id)
      .eq("tenant_id", tenantId);
    if (upErr) {
      logger.warn("[line-history-import] ai_extracted update failed", { tenantId, err: upErr.message });
    }

    processed += 1;
    if (result.intent === "new_reservation" || result.intent === "change_reservation") candidates += 1;

    usage.record({
      tenantId,
      outcome: result.ai ? "ok" : "error",
      confidence: typeof result.confidence === "number" ? result.confidence : null,
      meta: { source: "history_import", intent: result.intent, channel: "line" },
    });
  }

  logger.info("[line-history-import] done", { tenantId, customerId, processed, candidates, stoppedByCap, truncated });
  return apiJson({ processed, candidates, stopped_by_cap: stoppedByCap, truncated });
}

export const POST = withQstashSignature(handler);
