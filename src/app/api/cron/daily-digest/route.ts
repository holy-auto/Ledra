import { NextRequest } from "next/server";
import { apiJson, apiUnauthorized, apiInternalError } from "@/lib/api/response";
import { verifyCronRequest } from "@/lib/cronAuth";
import { createServiceRoleAdmin } from "@/lib/supabase/admin";
import { withCronLock } from "@/lib/cron/lock";
import { loadAiAutomationSettings, resolveAutoAction } from "@/lib/ai/automation/policy";
import { canUseFeature, normalizePlanTier } from "@/lib/billing/planFeatures";
import { fetchTodaySignals, tilesFromSignals, businessDateString } from "@/lib/admin/fetchTodaySignals";
import { generateDailyDigest } from "@/lib/admin/dailyDigest";
import { startAiRouteUsage } from "@/lib/ai/recordRouteUsage";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Daily Digest Cron (店長向け「今日のまとめ」/ AIマネージャー)
 * ---------------------------------------------------------
 * 毎朝、AI 有効テナントごとに deriveTodayTasks のタイル (件数=SQL由来の事実) を
 * AI で自然文ブリーフィングに整形し、tenant_daily_digests に当日 1 行 upsert する。
 * ダッシュボードはこの行を読み、無ければ描画時に決定論版へフォールバックするため
 * 描画のたびに AI を呼ばずに済む (コスト安全)。
 *
 * gating: loadAiAutomationSettings(tenantId).enabled が
 *   「AI マスタースイッチ ON かつ月次コストキャップ未超過」を表す。false のテナントは
 *   スキップ (AI 生成しない = 決定論版のまま)。AI 使用量は startAiRouteUsage 経由で
 *   ai_usage_logs 記録 + コストキャップ加算される。
 *
 * 1 回の実行あたりの AI 呼び出し件数に、このルート自身の上限は無い。**要らない。**
 * 呼び出し数は「opt-in 済みアクティブテナント数 × 最大 1」で頭打ちになり、
 * 伸びる軸はテナント数（＝事業の成長）だけ。1 テナントが繰り返し叩ける経路ではない。
 * 件数の枠を足しても、切り捨てられたテナントがその日ブリーフィングを失うだけで、
 * 呼び出しの総数は変わらない。
 *
 * **月次コストキャップは補助と考えること。** 2026-09-04 に既定が入り
 * （`DEFAULT_MONTHLY_COST_CAP_JPY` = テナント1件あたり月1万円）、設定が無くても
 * `settings.enabled` はキャップ超過で false に倒れるようになった。
 * ただしキャップは Redis 不在・失敗時に fail-open する。
 * ここで費用を抑えている主役は、キャップではなく上の「1 テナント 1 日 1 回」の構造。
 *
 * ponytail: 全 is_active テナントを直列処理する。**天井は費用ではなく実行時間**で、
 *   1 テナントあたり fetchTodaySignals（複数 SQL）+ AI 1 回 + upsert。
 *   maxDuration=300 秒を 1 テナント 3 秒で割ると 100 テナント程度が限界の目安になる
 *   (未実測。返り値の `elapsed_ms` と `tenants` で実測できるようにしてある)。
 *   超えると後ろのテナントが黙って処理されないまま関数が落ちるので、
 *   `elapsed_ms` が 200 秒に近づいたら QStash でテナント分割 fan-out に切り替える。
 */
export async function GET(req: NextRequest) {
  const auth = verifyCronRequest(req);
  if (!auth.authorized) return apiUnauthorized(auth.error ?? "unauthorized");

  try {
    const admin = createServiceRoleAdmin("cron daily-digest — per-tenant morning briefing generation");

    const locked = await withCronLock(admin, "daily-digest", 600, async () => {
      const startedAt = Date.now();
      const now = new Date();
      const digestDate = businessDateString(now);

      const { data: tenants, error: tErr } = await admin
        .from("tenants")
        .select("id, name, plan_tier")
        .eq("is_active", true)
        .returns<{ id: string; name: string | null; plan_tier: string | null }[]>();
      if (tErr) throw new Error(`tenants query failed: ${tErr.message}`);

      let aiGenerated = 0;
      let skippedNoAi = 0;
      let skippedNoTasks = 0;
      let failed = 0;

      for (const tenant of tenants ?? []) {
        try {
          // プラン非対応 (opt-in 後に格下げ等) は保存済みフラグに関わらずスキップ。
          // 設定 UI の auto-action 有効化と同じ feature キーで判定する。
          if (!canUseFeature(normalizePlanTier(tenant.plan_tier), "ai_inbound_extract")) {
            skippedNoAi++;
            continue;
          }
          const settings = await loadAiAutomationSettings(tenant.id);
          // 明示 opt-in (manager.auto_daily_digest=ON) かつ AI 有効・キャップ未超過の
          // テナントのみ生成する。未 opt-in / AI 無効は決定論版のまま (想定外コスト防止)。
          if (!resolveAutoAction(settings, "manager.auto_daily_digest")) {
            skippedNoAi++;
            continue;
          }

          const signals = await fetchTodaySignals(tenant.id, { now });
          const tiles = tilesFromSignals(signals);
          // 急ぎタスクが無い日は保存しない (ダッシュボードは決定論の空メッセージを出す)。
          if (tiles.length === 0) {
            skippedNoTasks++;
            continue;
          }

          const usage = startAiRouteUsage("/api/cron/daily-digest");
          const digest = await generateDailyDigest(tiles, { tenantName: tenant.name });
          // ai=false は AI が実際には走らなかった (キー未設定/失敗) ケース。
          usage.record({ tenantId: tenant.id, outcome: digest.ai ? "ok" : "ai_disabled" });

          const { error: upErr } = await admin.from("tenant_daily_digests").upsert(
            {
              tenant_id: tenant.id,
              digest_date: digestDate,
              text: digest.text,
              ai: digest.ai,
              updated_at: now.toISOString(),
            },
            { onConflict: "tenant_id,digest_date" },
          );
          if (upErr) throw new Error(upErr.message);

          if (digest.ai) aiGenerated++;
        } catch (e) {
          failed++;
          logger.warn("daily digest generation failed", {
            tenantId: tenant.id,
            error: e instanceof Error ? e.message : String(e),
          });
        }
      }

      return {
        date: digestDate,
        tenants: (tenants ?? []).length,
        ai_generated: aiGenerated,
        skipped_no_ai: skippedNoAi,
        skipped_no_tasks: skippedNoTasks,
        failed,
        // 直列処理の天井（maxDuration=300 秒）までの余裕を実測するための値。
        // fan-out へ切り替える判断をここの数字で行う（推測しない）。
        elapsed_ms: Date.now() - startedAt,
      };
    });

    if (!locked.acquired) {
      return apiJson({ ok: true, skipped: "lock_not_acquired" });
    }
    return apiJson({ ok: true, ...locked.value });
  } catch (e) {
    return apiInternalError(e, "cron daily-digest");
  }
}
