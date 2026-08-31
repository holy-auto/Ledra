import { NextRequest } from "next/server";
import { z } from "zod";
import { createServiceRoleAdmin } from "@/lib/supabase/admin";
import { apiJson, apiValidationError, apiInternalError, apiNotFound } from "@/lib/api/response";
import { checkRateLimit } from "@/lib/api/rateLimit";
import { notifySlack } from "@/lib/slack";
import { CONCERN_SOURCES, CONCERN_CATEGORIES, CONCERN_CATEGORY_LABELS } from "@/lib/concerns/types";

const concernSchema = z.object({
  source_type: z.enum(CONCERN_SOURCES),
  source_token: z.string().trim().min(1).max(200),
  customer_name: z.string().trim().max(100).optional(),
  customer_email: z.string().email().max(254).optional(),
  concern_text: z.string().trim().min(1, "内容を入力してください").max(2000, "2000文字以内で入力してください"),
  category: z.enum(CONCERN_CATEGORIES).optional(),
});

/**
 * POST /api/customer/concerns — 顧客が確認ページから懸念を送信
 *
 * 未認証。source_token で対象テナント・ジョブを解決する。
 * ponytail: 各フローのトークン検証テーブルを参照して tenant_id を解決。
 */
export async function POST(req: NextRequest) {
  const limited = await checkRateLimit(req, "auth");
  if (limited) return limited;

  try {
    const parsed = concernSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "入力内容に誤りがあります");
    }

    const { source_type, source_token, customer_name, customer_email, concern_text, category } = parsed.data;

    const supabase = createServiceRoleAdmin("customer concern submission — opaque token lookup (no login)");

    // トークンからテナント・ジョブ・証明書を解決
    const resolved = await resolveSourceContext(supabase, source_type, source_token);
    if (!resolved) {
      return apiNotFound("この確認リンクが見つかりません。URL をご確認ください。");
    }

    const { data, error } = await supabase
      .from("customer_concerns")
      .insert({
        tenant_id: resolved.tenantId,
        source_type,
        source_token,
        job_id: resolved.jobId ?? null,
        certificate_id: resolved.certificateId ?? null,
        customer_name: customer_name ?? null,
        customer_email: customer_email ?? null,
        concern_text,
        category: category ?? null,
        status: "open",
      })
      .select("id")
      .single();

    if (error) return apiInternalError(error, "customer/concerns POST");

    // Slack 通知(fire-and-forget)
    try {
      // customer_inquiries(一般問い合わせ)とは別系統のため専用 webhook を使う。
      // 未設定の間は無言でスキップ(notifySlack の仕様) — 誤って一般問い合わせ
      // チャンネルに混ぜない。
      await notifySlack(process.env.SLACK_CUSTOMER_CONCERN_WEBHOOK_URL, {
        text: `:warning: 顧客懸念: *${categoryLabel(category)}*`,
        fields: [
          { title: "発生源", value: sourceLabel(source_type), short: true },
          { title: "カテゴリ", value: categoryLabel(category), short: true },
          ...(customer_name ? [{ title: "お客様", value: customer_name, short: true }] : []),
          { title: "内容", value: concern_text.slice(0, 500) },
        ],
      });
    } catch (err) {
      console.error("[customer/concerns] slack notify failed:", err);
    }

    return apiJson({ ok: true, id: data.id }, { status: 201 });
  } catch (e) {
    return apiInternalError(e, "customer/concerns POST");
  }
}

/** トークンからテナント・ジョブ・証明書を解決 */
async function resolveSourceContext(
  supabase: ReturnType<typeof createServiceRoleAdmin>,
  sourceType: string,
  token: string,
): Promise<{ tenantId: string; jobId?: string; certificateId?: string } | null> {
  switch (sourceType) {
    case "delivery_receipt": {
      // signature_sessions テーブルから解決。purpose で他フロー(body_repair_consent 等)
      // のトークンとの混同を防ぐ(src/app/api/signature/delivery-receipt/*.ts と同じ規約)。
      const { data } = await supabase
        .from("signature_sessions")
        .select("tenant_id, certificate_id")
        .eq("token", token)
        .eq("purpose", "delivery_receipt")
        .maybeSingle();
      if (!data) return null;
      // certificate_id からジョブを逆引き(certificates.reservation_id)
      let jobId: string | undefined;
      if (data.certificate_id) {
        const { data: cert } = await supabase
          .from("certificates")
          .select("reservation_id")
          .eq("id", data.certificate_id)
          .maybeSingle();
        jobId = cert?.reservation_id ?? undefined;
      }
      return {
        tenantId: data.tenant_id,
        certificateId: data.certificate_id ?? undefined,
        jobId,
      };
    }
    case "parts_confirmation": {
      const { data } = await supabase
        .from("part_confirmation_signatures")
        .select("tenant_id, installation_id")
        .eq("token", token)
        .maybeSingle();
      if (!data) return null;
      // installation_id → reservation_id
      let jobId: string | undefined;
      if (data.installation_id) {
        const { data: pi } = await supabase
          .from("part_installations")
          .select("reservation_id")
          .eq("id", data.installation_id)
          .maybeSingle();
        jobId = pi?.reservation_id ?? undefined;
      }
      return { tenantId: data.tenant_id, jobId };
    }
    case "body_repair_consent": {
      // purpose で delivery_receipt トークンとの混同を防ぐ
      // (src/app/api/admin/body-repair-jobs/[id]/consent-request/route.ts と同じ値)。
      const { data } = await supabase
        .from("signature_sessions")
        .select("tenant_id, certificate_id")
        .eq("token", token)
        .in("purpose", ["estimate_consent", "change_consent"])
        .maybeSingle();
      if (!data) return null;
      return {
        tenantId: data.tenant_id,
        certificateId: data.certificate_id ?? undefined,
      };
    }
    case "body_repair_tracking": {
      // customer_concerns.job_id は reservations(id) への外部キー。body_repair_jobs.id
      // は独立採番の別テーブルの主キーで reservations.id とは無関係のため、そのまま
      // job_id に渡すと外部キー違反で INSERT が失敗する（reservation_id が無い板金
      // ジョブでは懸念を job に紐づけられない = jobId なしで保存される）。
      // certificate_id は reservation_id と独立に設定され得る（bodyRepairJobCreateSchema
      // は両方任意）。証明書が直接紐づく板金ジョブでは、reservation_id が無くても
      // certificate_id 経由で Certificate Gate の懸念チェックに引っかかるようにする。
      const { data } = await supabase
        .from("body_repair_jobs")
        .select("tenant_id, reservation_id, certificate_id")
        .eq("track_token", token)
        .maybeSingle();
      if (!data) return null;
      return {
        tenantId: data.tenant_id,
        jobId: data.reservation_id ?? undefined,
        certificateId: data.certificate_id ?? undefined,
      };
    }
    default:
      return null;
  }
}

const SOURCE_LABELS: Record<string, string> = {
  delivery_receipt: "受領サイン",
  parts_confirmation: "部品確認",
  body_repair_consent: "板金同意",
  body_repair_tracking: "板金進捗",
};

function sourceLabel(s: string): string {
  return SOURCE_LABELS[s] ?? s;
}

function categoryLabel(c?: string): string {
  return c ? (CONCERN_CATEGORY_LABELS[c as keyof typeof CONCERN_CATEGORY_LABELS] ?? c) : "未分類";
}
