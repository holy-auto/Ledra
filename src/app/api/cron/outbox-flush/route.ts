/**
 * GET /api/cron/outbox-flush
 *
 * outbox_events に積まれた pending row を `processOutboxBatch` で配送する。
 * 現状の dispatcher は webhook (tenant_webhooks 宛 HMAC POST) のみ。
 * 1 回の cron で最大 BATCH_SIZE 行を処理し、残りは次回に持ち越す。
 *
 * Vercel Cron で 1 分間隔 (`* * * * *`) で叩かれることを想定。
 * 60s の lock で同時起動を防止し、Sentry + Resend で失敗通知。
 */

import type { NextRequest } from "next/server";
import { createServiceRoleAdmin } from "@/lib/supabase/admin";
import { apiOk, apiUnauthorized, apiInternalError } from "@/lib/api/response";
import { verifyCronRequest } from "@/lib/cronAuth";
import { sendCronFailureAlert } from "@/lib/cronAlert";
import { withCronLock } from "@/lib/cron/lock";
import { processOutboxBatch } from "@/lib/outbox";
import { buildWebhookDispatcher } from "@/lib/outbound-webhooks";
import { buildInventoryDeductionDispatcher } from "@/lib/pos/inventoryDeduction";
import { buildEmailDispatcher } from "@/lib/email/sendWithFallback";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BATCH_SIZE = 200;
const MAX_ATTEMPTS = 8;
const CONCURRENCY = 8;

export async function GET(req: NextRequest) {
  const { authorized, error: authErr } = verifyCronRequest(req);
  if (!authorized) return apiUnauthorized(authErr);

  try {
    const admin = createServiceRoleAdmin("cron:outbox-flush — drains pending outbox events");

    const result = await withCronLock(admin, "outbox-flush", 55, async () => {
      const dispatchers = {
        webhook: buildWebhookDispatcher(admin),
        "pos.inventory_deduction": buildInventoryDeductionDispatcher(admin),
        "email.send": buildEmailDispatcher(),
      };
      return processOutboxBatch(admin, dispatchers, {
        batchSize: BATCH_SIZE,
        maxAttempts: MAX_ATTEMPTS,
        concurrency: CONCURRENCY,
      });
    });

    if (!result.acquired) return apiOk({ skipped: "lock_held" });

    const stats = result.value;
    if (stats.dead > 0) {
      logger.error("outbox-flush: events moved to dead_letter", { dead: stats.dead });
    } else if (stats.processed > 0) {
      logger.info("outbox-flush complete", stats);
    }

    return apiOk({ ok: true, ...stats });
  } catch (e) {
    await sendCronFailureAlert("outbox-flush", e instanceof Error ? e.message : String(e));
    return apiInternalError(e, "cron/outbox-flush");
  }
}
