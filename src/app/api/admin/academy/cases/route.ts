/**
 * GET/POST /api/admin/academy/cases
 * Academy事例一覧取得 & 事例公開（C-1）
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole, requireMinRole } from "@/lib/auth/checkRole";
import { checkRateLimit } from "@/lib/api/rateLimit";
import {
  apiOk,
  apiUnauthorized,
  apiInternalError,
  apiValidationError,
  apiNotFound,
  apiForbidden,
} from "@/lib/api/response";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { presentAcademyCases, academyCaseToken, type AcademyCaseRow } from "@/lib/academy/casePresentation";
import { generateAcademyCaseSummary } from "@/lib/ai/academyFeedback";
import { fastModelForPlanTier } from "@/lib/ai/client";
import { canUseFeature } from "@/lib/billing/planFeatures";
import { CERT_AI_COLUMNS, certAiFields, certPhotoCount } from "@/lib/certificates/aiFields";

const academyCaseActionSchema = z.object({
  case_id: z.string().uuid("case_id が必要です"),
  action: z.enum(["preview", "publish", "unpublish"], {
    message: "action は preview / publish / unpublish のいずれかです",
  }),
  /**
   * publish のときだけ必須。preview が返した**中身のハッシュ**。
   * 「要約が入っている」だけでは、**その人が今の中身を見た**ことにならない
   * （別の人が後から再生成した／一度公開して戻した行にも要約は残る）。
   * 見た版そのものを指させる。
   */
  preview_token: z.string().min(1).optional(),
});

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

/** 公開済みAcademy事例一覧 */
export async function GET(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

    const { searchParams } = new URL(req.url);
    const category = searchParams.get("category");
    const type = searchParams.get("type"); // "published" | "candidates"

    const { admin } = createTenantScopedAdmin(caller.tenantId);

    let query = admin
      .from("academy_cases")
      // tenant_id は「自店の事例か」を出すために取るだけで、応答には載せない
      // （presentAcademyCases が落とす）。公開事例は匿名化済みなので、
      // どの店のものかをクライアントに渡してはいけない。
      .select(
        "id, tenant_id, category, difficulty, quality_score, tags, ai_summary, good_points, caution_points, vehicle_info, is_candidate, is_published, view_count, helpful_count, created_at",
      );

    if (type === "candidates") {
      // 自テナントの候補事例
      query = query.eq("tenant_id", caller.tenantId).eq("is_candidate", true).eq("is_published", false);
    } else {
      // 公開済み全件
      query = query.eq("is_published", true);
    }

    if (category) query = query.eq("category", category);

    const { data: cases, error } = await query.order("quality_score", { ascending: false }).limit(50);

    if (error) return apiInternalError(error);

    // ノウハウ詳細(AI要約・良点・注意点・車両情報)は有料プラン限定。
    // 候補事例は自テナント所有データのため対象外。
    const knowHowAllowed = canUseFeature(caller.planTier, "academy_know_how");
    const shouldMask = type !== "candidates" && !knowHowAllowed;
    const presented = presentAcademyCases((cases ?? []) as AcademyCaseRow[], {
      tenantId: caller.tenantId,
      maskKnowHow: shouldMask,
    });

    return apiOk({ cases: presented, know_how_locked: shouldMask });
  } catch (e: unknown) {
    return apiInternalError(e);
  }
}

/** Academy事例を公開する（管理者操作） */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    // 事例の公開は staff 以上。ここは所有者判定ではなくテナント判定しかしておらず、
    // 閲覧専用ロールでも公開できた。公開は AI 要約を呼び（費用が出る）、
    // knowledge_chunks に tenant_id: null で全加盟店共有の行を書くため、
    // 2026-09-01 代表判断「AI は staff 以上」を適用する。
    if (!requireMinRole(caller, "staff")) return apiForbidden();

    const parsed = academyCaseActionSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
    }
    const { case_id, action, preview_token } = parsed.data;

    const { admin } = createTenantScopedAdmin(caller.tenantId);

    const { data: existingCase } = await admin
      .from("academy_cases")
      .select("id, certificate_id, category, quality_score, is_candidate, tenant_id")
      .eq("id", case_id)
      .single();

    if (!existingCase) return apiNotFound("事例が見つかりません");

    // 所有テナントのみ操作可
    if (existingCase.tenant_id !== caller.tenantId) {
      return apiValidationError("この事例への操作権限がありません");
    }

    if (action === "preview") {
      // 公開前に**中身を作って見せる**ための段階。ここでは is_published を触らない。
      //
      // なぜ2段階か: 要約の入力には証明書の `content_free_text`（店が手で書く自由記述）が
      // 入る。顧客名や車両番号が書かれていれば、それが全加盟店に共有される文面に混ざりうる。
      // 以前は**公開の瞬間に生成**していたので、押す人は何が共有されるか見られなかった。
      // 見られないものは確認できない（2026-09-05 代表判断「目視確認を入れる」）。
      const limited = await checkRateLimit(req, "ai", `academy-case:${caller.tenantId}`);
      if (limited) return limited;

      // AI 呼び出しは**レート制限のすぐ隣**に置く。ヘルパーへ出すと、ハンドラ単位で
      // 追う検出器（aiRouteRateLimit.test.ts）から見えなくなり、「制限の無い AI 呼び出し」
      // として扱われる。読みやすさより、呼び出しと制限が並んでいることを優先する。
      let aiSummary: string | undefined;
      let goodPoints: string[] = [];
      let cautionPoints: string[] = [];
      let tags: string[] = [];

      if (existingCase.certificate_id) {
        const { data: cert } = await admin
          .from("certificates")
          .select(CERT_AI_COLUMNS)
          .eq("id", existingCase.certificate_id)
          .single();

        if (cert) {
          try {
            const summary = await generateAcademyCaseSummary(
              {
                serviceName: certAiFields(cert).service_name,
                description: certAiFields(cert).description,
                materialInfo: certAiFields(cert).material_info,
                category: existingCase.category,
                qualityScore: existingCase.quality_score,
                // photo_count 列は無いので certificate_images を数える
                photoCount: await certPhotoCount(admin, existingCase.certificate_id),
              },
              { model: fastModelForPlanTier(caller.planTier) },
            );
            aiSummary = summary.aiSummary;
            goodPoints = summary.goodPoints;
            cautionPoints = summary.cautionPoints;
            tags = summary.tags;
          } catch (err) {
            console.error("[academy/cases] AI summary error:", err);
          }
        }
      }

      // 生成できなかったときは**成功を返さない**。証明書が消えている
      // （FK が ON DELETE SET NULL なので candidate だけ残る）か、取得・生成に失敗した場合。
      // ここで「生成できませんでした」を確認対象として見せると、確認する中身が無いのに
      // チェックが入り、続く publish は必ず弾かれる。既存の文面も消さない。
      if (!aiSummary) {
        return apiValidationError("公開する内容を生成できませんでした。元の証明書が削除されていないか確認してください");
      }

      // 生成した文面を**行に保存する**。公開時に作り直すと、確認した文面と
      // 公開される文面が別物になりうる。保存しておけば publish は反転するだけで済み、
      // AI の費用も二重に出ない。
      const previewedAt = new Date().toISOString();

      // **既に公開済みの行は更新しない。** 2人が同じ候補を触ったとき、
      // 片方が公開した後にもう片方の遅れて返ってきた生成結果が上書きすると、
      // 公開済みの文面が誰も見ていないものに差し替わる（knowledge_chunks は古いまま）。
      const { data: saved, error } = await admin
        .from("academy_cases")
        .update({
          ai_summary: aiSummary,
          good_points: goodPoints,
          caution_points: cautionPoints,
          tags,
          updated_at: previewedAt,
        })
        .eq("id", case_id)
        .eq("is_published", false)
        // **書いた値ではなく、DB が返した行**を使う（印にも、画面に見せる文面にも）。
        // publish 側は行を読み直してハッシュするので、preview がここで手元の値を
        // ハッシュすると、表記が1つでも違えば印が永久に一致しない。実際 updated_at で
        // 起きた: JS の toISOString() は "...Z"、PostgREST は timestamptz を "+00:00"
        // で返すため、**公開が1件も通らなかった**（Codex の指摘、M-033）。
        // 両側を同じ出所から作れば、この形の食い違いはもう起きない。
        .select("ai_summary, good_points, caution_points, tags, updated_at")
        .maybeSingle();

      if (error) return apiInternalError(error);
      if (!saved) {
        return apiValidationError("この事例は既に公開されています。非公開に戻してからやり直してください");
      }

      return apiOk({
        message: "公開される内容を生成しました。内容を確認してください。",
        preview_token: academyCaseToken(saved),
        // 見せるのも保存された値。「見たもの ＝ 公開されるもの」を出所で揃える。
        preview: {
          ai_summary: saved.ai_summary,
          good_points: (saved.good_points as string[] | null) ?? [],
          caution_points: (saved.caution_points as string[] | null) ?? [],
          tags: (saved.tags as string[] | null) ?? [],
        },
      });
    }

    if (action === "publish") {
      // ここでは AI を呼ばない。preview で保存済みの文面をそのまま公開する。
      //
      // **「要約が入っている」は「この人が今の中身を見た」の証明にならない。**
      // 別の人が後から再生成すれば中身は入れ替わるし、一度公開して非公開に戻した行にも
      // 要約は残る。そこで preview が返した版の印を持ってきた場合だけ通し、更新も
      // その版に対してだけ行う。間に誰かが触っていれば 0 行になって弾かれる。
      if (!preview_token) {
        return apiValidationError("先に「内容を確認」で公開される内容を表示し、確認してください");
      }

      const { data: reviewed } = await admin
        .from("academy_cases")
        .select("ai_summary, good_points, caution_points, tags, updated_at")
        .eq("id", case_id)
        .eq("is_published", false)
        .maybeSingle();

      // 保存されている中身が、押した人が見たものと同一か。
      if (!reviewed?.ai_summary || academyCaseToken(reviewed) !== preview_token) {
        return apiValidationError("確認した内容が最新ではありません。「内容を再生成」でもう一度確認してください");
      }

      const goodPoints = (reviewed.good_points as string[] | null) ?? [];
      const cautionPoints = (reviewed.caution_points as string[] | null) ?? [];
      const tags = (reviewed.tags as string[] | null) ?? [];

      const { data: publishedRows, error } = await admin
        .from("academy_cases")
        .update({
          is_published: true,
          anonymized: true,
          published_by: caller.userId,
          published_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", case_id)
        // 読んでから書くまでの間に触られていないこと（compare-and-swap）。
        .eq("updated_at", reviewed.updated_at as string)
        .eq("is_published", false)
        .select("id");

      if (error) return apiInternalError(error);
      // 読んでから更新するまでの間に誰かが触った場合。knowledge_chunks を
      // 二重に入れないよう、ここで止める。
      if (!publishedRows?.length) {
        return apiValidationError("確認した内容が最新ではありません。「内容を再生成」でもう一度確認してください");
      }

      // ナレッジチャンクに追加（QA検索用）
      await admin.from("knowledge_chunks").insert({
        source_type: "case",
        source_id: case_id,
        content: [reviewed.ai_summary, ...goodPoints, ...cautionPoints].join("\n"),
        category: existingCase.category,
        tags,
        tenant_id: null, // 全加盟店共有
      });

      return apiOk({ message: "事例を公開しました" });
    }

    // action === "unpublish"
    await admin
      .from("academy_cases")
      .update({ is_published: false, updated_at: new Date().toISOString() })
      .eq("id", case_id);

    return apiOk({ message: "事例を非公開にしました" });
  } catch (e: unknown) {
    return apiInternalError(e);
  }
}
