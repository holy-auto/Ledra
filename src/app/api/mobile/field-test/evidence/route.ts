import { NextRequest } from "next/server";
import { resolveMobileCaller } from "@/lib/auth/mobileAuth";
import { apiJson, apiUnauthorized, apiValidationError, apiInternalError } from "@/lib/api/response";
import { listEvidence, insertEvidence } from "@/lib/fieldTest/tenantQueries";
import { uploadFtEvidence, signFtEvidenceUrl } from "@/lib/storage/ftEvidence";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_FILE_BYTES = 20 * 1024 * 1024;
const ALLOWED_TYPES = new Set([
  "image/jpeg", "image/png", "image/webp",
  "video/mp4", "video/quicktime",
  "application/pdf",
]);
const VALID_EVIDENCE_TYPES = new Set([
  "photo_before", "photo_during", "photo_after",
  "measurement", "env_data", "video", "document", "other",
]);

/** GET /api/mobile/field-test/evidence?job_id=xxx */
export async function GET(request: NextRequest) {
  try {
    const caller = await resolveMobileCaller(request);
    if (!caller) return apiUnauthorized();

    const jobId = request.nextUrl.searchParams.get("job_id");
    if (!jobId) return apiValidationError("job_id は必須です。");

    const { data: job } = await caller.supabase
      .from("ft_jobs")
      .select("id")
      .eq("id", jobId)
      .eq("tenant_id", caller.tenantId)
      .maybeSingle();
    if (!job) return apiValidationError("案件が見つかりません。");

    const evidence = await listEvidence(caller.supabase, caller.tenantId, jobId);

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
  } catch (e) {
    return apiInternalError(e, "mobile ft evidence GET");
  }
}

/** POST /api/mobile/field-test/evidence (multipart/form-data) */
export async function POST(request: NextRequest) {
  try {
    const caller = await resolveMobileCaller(request);
    if (!caller) return apiUnauthorized();

    const formData = await request.formData();
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

    const { data: job } = await caller.supabase
      .from("ft_jobs")
      .select("id, project_id, manufacturer_id")
      .eq("id", jobId)
      .eq("tenant_id", caller.tenantId)
      .maybeSingle();
    if (!job) return apiValidationError("案件が見つかりません。");

    const buffer = Buffer.from(await file.arrayBuffer());
    const { path } = await uploadFtEvidence(buffer, {
      manufacturerId: job.manufacturer_id as string,
      projectId: job.project_id as string,
      jobId,
      fileName: file.name,
      contentType: file.type,
    });

    const record = await insertEvidence(caller.supabase, {
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
  } catch (e) {
    return apiInternalError(e, "mobile ft evidence POST");
  }
}
