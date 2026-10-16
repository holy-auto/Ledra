/**
 * POST /api/admin/certificates/ai-draft
 * 施工証明書の自動下書き生成（B-1）
 * minPlan: standard
 */

import { checkRateLimit } from "@/lib/api/rateLimit";
import { z } from "zod";

import { apiOk, apiInternalError, apiValidationError } from "@/lib/api/response";
import { canUseFeature } from "@/lib/billing/planFeatures";
import { generateCertificateDraft } from "@/lib/ai/draftCertificate";
import { modelForPlanTier, visionModelForPlanTier } from "@/lib/ai/client";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { loadAiAutomationSettings, filterDraftByPolicy, isSourceAllowed } from "@/lib/ai/automation/policy";
import { CERT_AI_COLUMNS, certAiFields } from "@/lib/certificates/aiFields";
import { draftPhotoContent, type ImageMediaType } from "@/lib/ai/photoContentDraft";

import { withCaller } from "@/lib/api/withCaller";
const aiDraftSchema = z
  .object({
    vehicle_id: z.string().uuid().optional(),
    hearing_id: z.string().uuid().optional(),
    template_category: z.string().trim().max(100).optional(),
  })
  .refine((v) => !!v.vehicle_id || !!v.hearing_id, {
    message: "vehicle_id または hearing_id が必要です",
  });

/** 作成中フォームの写真 (まだ未アップロード) を multipart で受ける上限。コストと 4.5MB body 上限のため 2 枚。 */
const MAX_DRAFT_PHOTOS = 2;
const MAX_DRAFT_PHOTO_BYTES = 2 * 1024 * 1024;
const VISION_MIME = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

/** JSON か multipart (写真付き) を読み、検証前の値と写真ファイルを返す。 */
async function readDraftRequest(req: Request): Promise<{ body: unknown; photos: File[] }> {
  if (!(req.headers.get("content-type") ?? "").includes("multipart/form-data")) {
    return { body: await req.json().catch(() => ({})), photos: [] };
  }
  const fd = await req.formData().catch(() => null);
  if (!fd) return { body: {}, photos: [] };
  const str = (k: string) => {
    const v = fd.get(k);
    return typeof v === "string" && v ? v : undefined;
  };
  const photos = fd
    .getAll("photos")
    .filter((f): f is File => f instanceof File && VISION_MIME.has(f.type) && f.size <= MAX_DRAFT_PHOTO_BYTES)
    .slice(0, MAX_DRAFT_PHOTOS);
  return {
    body: { vehicle_id: str("vehicle_id"), hearing_id: str("hearing_id"), template_category: str("template_category") },
    photos,
  };
}

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

export const POST = withCaller(
  async (req, { caller }) => {
    try {
      // AI 呼び出しは staff 以上 (代表判断 2026-09-01。閲覧専用ロールに費用の出る操作をさせない)
      // Standard以上のみ
      if (!canUseFeature(caller.planTier, "ai_draft")) {
        return apiValidationError("この機能はStandardプラン以上でご利用いただけます", {
          code: "plan_limit",
        });
      }

      // 証明書ドラフト生成は呼ぶたびに AI 費用が出る。
      // プラン判定より後に置く。Free のテナントには 429 ではなく案内を返したい。
      const limited = await checkRateLimit(req, "ai", `cert-ai-draft:${caller.tenantId}`);
      if (limited) return limited;

      const { body, photos } = await readDraftRequest(req);
      const parsed = aiDraftSchema.safeParse(body);
      if (!parsed.success) {
        return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
      }
      const { vehicle_id, hearing_id, template_category } = parsed.data;

      const { admin } = createTenantScopedAdmin(caller.tenantId);

      // テナントの AI 自動入力ポリシーをロード。グローバル OFF の場合は
      // モデル呼び出しすら走らせない (コスト・レイテンシ削減)。
      const automation = await loadAiAutomationSettings(caller.tenantId);
      if (!automation.enabled) {
        return apiOk({
          draft: {
            title: "",
            description: "",
            materials: [],
            warrantyCandidates: [],
            workAreas: [],
            cautions: "",
            confidence: 0,
            missingInfo: ["テナント設定で AI 自動入力が OFF になっています。"],
          },
          policies: {},
          source_data: { similar_certs_used: 0, photos_analyzed: 0, hearing_used: false },
          ai_disabled: true,
        });
      }

      // 作成中フォームの写真から施工内容を読み取り、下書きの材料に加える (写真ソース許可時のみ)。
      // DB 参照と無関係なので先に走らせ、下書き生成の直前で待つ。
      const usePhotos =
        photos.length > 0 &&
        isSourceAllowed(automation, "photos") &&
        canUseFeature(caller.planTier, "ai_quality_vision");
      const photoContentPromise = usePhotos
        ? Promise.all(
            photos.map(async (f) => ({
              base64: Buffer.from(await f.arrayBuffer()).toString("base64"),
              mediaType: f.type as ImageMediaType,
            })),
          )
            .then((images) => draftPhotoContent(images, { model: visionModelForPlanTier(caller.planTier) }))
            // 待つ前に DB 参照が throw しても未処理の reject を残さない。
            .catch(() => null)
        : Promise.resolve(null);

      // 車両情報取得
      let vehicle: Record<string, unknown> = {};
      if (vehicle_id) {
        const { data } = await admin
          .from("vehicles")
          .select("maker, model, year, vin_code")
          .eq("id", vehicle_id)
          .eq("tenant_id", caller.tenantId)
          .single();
        vehicle = data ?? {};
      }

      // ヒアリング情報取得 (ソースが許可されている場合のみ)
      let hearing: Record<string, unknown> | undefined;
      if (hearing_id && isSourceAllowed(automation, "hearings")) {
        const { data } = await admin
          .from("hearings")
          .select(
            "service_type, budget_range, parking_environment, additional_requests, vehicle_maker, vehicle_model, vehicle_year, vehicle_color",
          )
          .eq("id", hearing_id)
          .eq("tenant_id", caller.tenantId)
          .single();
        if (data) {
          hearing = data;
          // ヒアリングから車両情報も補完
          if (!vehicle.maker)
            vehicle = {
              maker: data.vehicle_maker,
              model: data.vehicle_model,
              year: data.vehicle_year,
              color: data.vehicle_color,
            };
        }
      }

      // 同テナントの類似施工事例 (ソースが許可されている場合のみ取得)
      const allowSimilar = isSourceAllowed(automation, "similar_certificates");
      const { data: similar } = allowSimilar
        ? await admin
            .from("certificates")
            .select(CERT_AI_COLUMNS)
            .eq("tenant_id", caller.tenantId)
            .not("service_type", "is", null)
            .order("created_at", { ascending: false })
            .limit(5)
        : { data: [] as Array<Record<string, unknown>> };

      const photoContent = await photoContentPromise;
      const photoText = photoContent?.contentDraft || undefined;

      const draft = await generateCertificateDraft(
        {
          vehicle: {
            maker: vehicle.maker as string | undefined,
            model: vehicle.model as string | undefined,
            year: vehicle.year as number | undefined,
            vin: vehicle.vin_code as string | undefined,
          },
          hearing: hearing
            ? {
                // hearings.service_type は単数の text。AI 側は配列を取る
                service_types: hearing.service_type ? [hearing.service_type as string] : undefined,
                budget_range: hearing.budget_range as string | undefined,
                parking_type: hearing.parking_environment as string | undefined,
                customer_requests: hearing.additional_requests as string | undefined,
              }
            : undefined,
          similarCertificates: (similar ?? []).map((s) => ({
            ...certAiFields(s),
          })),
          photoDescriptions: photoText ? [photoText] : undefined,
          templateCategory: template_category,
        },
        { model: modelForPlanTier(caller.planTier) },
      );

      const filtered = filterDraftByPolicy(draft, automation);

      return apiOk({
        draft: filtered.draft,
        policies: filtered.policies,
        source_data: {
          similar_certs_used: similar?.length ?? 0,
          // 読み取れた内容が下書きに入ったときだけ数える (Vision 失敗時は 0)。
          photos_analyzed: photoText ? photos.length : 0,
          hearing_used: !!hearing,
        },
      });
    } catch (e: unknown) {
      return apiInternalError(e);
    }
  },
  { minRole: "staff", routeName: "admin/certificates/ai-draft POST" },
);
