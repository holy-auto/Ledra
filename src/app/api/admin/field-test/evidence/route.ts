import { NextRequest } from "next/server";
import { withCaller } from "@/lib/api/withCaller";
import { apiJson, apiValidationError } from "@/lib/api/response";
import { listEvidence, insertEvidence } from "@/lib/fieldTest/tenantQueries";
import { uploadFtEvidence, signFtEvidenceUrl } from "@/lib/storage/ftEvidence";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_FILE_BYTES = 20 * 1024 * 1024; // 20 MB
const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "video/mp4",
  "video/quicktime",
  "application/pdf",
]);
const VALID_EVIDENCE_TYPES = new Set([
  "photo_before",
  "photo_during",
  "photo_after",
  "measurement",
  "env_data",
  "video",
  "document",
  "other",
]);

/** GET /api/admin/field-test/evidence?job_id=xxx */
export const GET = withCaller(
  async (req: NextRequest, { caller, supabase }) => {
    const jobId = req.nextUrl.searchParams.get("job_id");
    if (!jobId) return apiValidationError("job_id は必須です。");

    // 自社案件確認
    const { data: job } = await supabase
      .from("ft_jobs")
      .select("id")
      .eq("id", jobId)
      .eq("tenant_id", caller.tenantId)
      .maybeSingle();
    if (!job) return apiValidationError("案件が見つかりません。");

    const evidence = await listEvidence(supabase, caller.tenantId, jobId);

    const withUrls = await Promise.all(
      evidence.map(async (e) => {
        const fp = (e as Record<string, unknown>).file_path as string | null;
        if (!fp) return { ...e, signed_url: null };
        try {
          const url = await signFtEvidenceUrl(fp);
          return { ...e, signed_url: url };
        } catch {
          return { ...e, signed_url: null };
        }
      }),
    );

    return apiJson({ evidence: withUrls });
  },
  { routeName: "ft tenant evidence GET" },
);

/**
 * POST /api/admin/field-test/evidence
 * Body: multipart/form-data
 *   - file: File
 *   - job_id: string
 *   - evidence_type: string
 *   - caption?: string
 */
export const POST = withCaller(
  async (req: NextRequest, { caller, supabase }) => {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const jobId = formData.get("job_id") as string | null;
    const evidenceType = formData.get("evidence_type") as string | null;
    const caption = (formData.get("caption") as string | null) ?? undefined;

    if (!file || !jobId || !evidenceType) {
      return apiValidationError("file, job_id, evidence_type は必須です。");
    }
    if (!VALID_EVIDENCE_TYPES.has(evidenceType)) {
      return apiValidationError(`無効な evidence_type: ${evidenceType}`);
    }
    if (!ALLOWED_TYPES.has(file.type)) {
      return apiValidationError(`非対応のファイル形式: ${file.type}`);
    }
    if (file.size > MAX_FILE_BYTES) {
      return apiValidationError("ファイルサイズが上限 (20MB) を超えています。");
    }

    // 自社案件確認 + プロジェクト・メーカー情報取得
    const { data: job } = await supabase
      .from("ft_jobs")
      .select("id, project_id, manufacturer_id")
      .eq("id", jobId)
      .eq("tenant_id", caller.tenantId)
      .maybeSingle();
    if (!job) return apiValidationError("案件が見つかりません。");

    // Storage にアップロード
    const buffer = Buffer.from(await file.arrayBuffer());
    const { path } = await uploadFtEvidence(buffer, {
      manufacturerId: job.manufacturer_id as string,
      projectId: job.project_id as string,
      jobId: jobId,
      fileName: file.name,
      contentType: file.type,
    });

    // DB に記録
    const record = await insertEvidence(supabase, {
      job_id: jobId,
      project_id: job.project_id as string,
      manufacturer_id: job.manufacturer_id as string,
      tenant_id: caller.tenantId,
      evidence_type: evidenceType,
      file_path: path,
      file_name: file.name,
      content_type: file.type,
      caption,
      captured_by: caller.userId,
    });

    return apiJson(record);
  },
  { routeName: "ft tenant evidence POST" },
);
