import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveManufacturerCaller } from "@/lib/auth/manufacturerCaller";
import { createServiceRoleAdmin } from "@/lib/supabase/admin";
import { apiUnauthorized, apiForbidden, apiValidationError, apiNotFound, apiInternalError } from "@/lib/api/response";
import { buildCsv, csvDownloadHeaders } from "@/lib/csv/serialize";
import type {
  FtJobStatus,
  FtEvidenceType,
  FtInspectionResult,
  FtDefectSeverity,
  FtDefectStatus,
} from "@/types/manufacturer";
import {
  FT_JOB_STATUS_LABELS,
  FT_EVIDENCE_TYPE_LABELS,
  FT_INSPECTION_RESULT_LABELS,
  FT_DEFECT_SEVERITY_LABELS,
  FT_DEFECT_STATUS_LABELS,
} from "@/types/manufacturer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type TableName = "jobs" | "inspections" | "defects" | "evidence" | "condition_checks";

const VALID_TABLES = new Set<TableName>(["jobs", "inspections", "defects", "evidence", "condition_checks"]);

/**
 * GET /api/manufacturer/field-test/export/csv?project_id=xxx&table=jobs
 *
 * Export a single FT table as CSV. Admin only.
 * Supported tables: jobs, inspections, defects, evidence, condition_checks
 */
export async function GET(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const caller = await resolveManufacturerCaller(supabase);
  if (!caller) return apiUnauthorized();
  if (caller.role !== "admin") return apiForbidden("CSVエクスポートは admin ロールのみ実行できます。");

  const url = new URL(req.url);
  const projectId = url.searchParams.get("project_id");
  const table = url.searchParams.get("table") as TableName | null;

  if (!projectId) return apiValidationError("project_id は必須です。");
  if (!table || !VALID_TABLES.has(table))
    return apiValidationError(`table は ${[...VALID_TABLES].join(" / ")} のいずれかを指定してください。`);

  try {
    const admin = createServiceRoleAdmin("ft csv export");
    const mfId = caller.manufacturerId;

    // Verify project ownership
    const { data: project, error: pErr } = await admin
      .from("ft_projects")
      .select("id, name")
      .eq("id", projectId)
      .eq("manufacturer_id", mfId)
      .maybeSingle();
    if (pErr) return apiInternalError(pErr, "ft csv project lookup");
    if (!project) return apiNotFound("プロジェクトが見つかりません。");

    const scope = { project_id: projectId, manufacturer_id: mfId };
    let csv: string;
    let filename: string;

    switch (table) {
      case "jobs": {
        const { data, error } = await admin
          .from("ft_jobs")
          .select("job_code, title, status, tenant_id, assigned_at, completed_at, created_at")
          .match(scope)
          .order("created_at", { ascending: true });
        if (error) return apiInternalError(error, "ft csv jobs");
        // Resolve tenant names
        const tenantIds = [...new Set((data ?? []).map((r) => r.tenant_id as string))];
        const tenantMap = await resolveTenantNames(admin, tenantIds);
        const header = ["案件コード", "タイトル", "ステータス", "施工店", "割当日", "完了日", "作成日"];
        const rows = (data ?? []).map((r) => [
          r.job_code,
          r.title,
          FT_JOB_STATUS_LABELS[r.status as FtJobStatus] ?? r.status,
          tenantMap.get(r.tenant_id as string) ?? r.tenant_id,
          r.assigned_at,
          r.completed_at,
          r.created_at,
        ]);
        csv = buildCsv(header, rows);
        filename = `ft_jobs_${project.name}.csv`;
        break;
      }

      case "inspections": {
        const { data, error } = await admin
          .from("ft_inspections")
          .select("job_id, result, score, notes, inspected_at, created_at")
          .match(scope)
          .order("created_at", { ascending: true });
        if (error) return apiInternalError(error, "ft csv inspections");
        // Resolve job codes
        const jobIds = [...new Set((data ?? []).map((r) => r.job_id as string))];
        const jobMap = await resolveJobCodes(admin, jobIds);
        const header = ["案件コード", "結果", "スコア", "メモ", "検査日", "作成日"];
        const rows = (data ?? []).map((r) => [
          jobMap.get(r.job_id as string) ?? r.job_id,
          FT_INSPECTION_RESULT_LABELS[r.result as FtInspectionResult] ?? r.result,
          r.score,
          r.notes,
          r.inspected_at,
          r.created_at,
        ]);
        csv = buildCsv(header, rows);
        filename = `ft_inspections_${project.name}.csv`;
        break;
      }

      case "defects": {
        const { data, error } = await admin
          .from("ft_defects")
          .select("defect_code, title, description, severity, status, resolution, tenant_id, resolved_at, created_at")
          .match(scope)
          .order("created_at", { ascending: true });
        if (error) return apiInternalError(error, "ft csv defects");
        const tenantIds = [...new Set((data ?? []).filter((r) => r.tenant_id).map((r) => r.tenant_id as string))];
        const tenantMap = await resolveTenantNames(admin, tenantIds);
        const header = [
          "不具合コード",
          "タイトル",
          "詳細",
          "重大度",
          "ステータス",
          "解決内容",
          "施工店",
          "解決日",
          "報告日",
        ];
        const rows = (data ?? []).map((r) => [
          r.defect_code,
          r.title,
          r.description,
          FT_DEFECT_SEVERITY_LABELS[r.severity as FtDefectSeverity] ?? r.severity,
          FT_DEFECT_STATUS_LABELS[r.status as FtDefectStatus] ?? r.status,
          r.resolution,
          r.tenant_id ? (tenantMap.get(r.tenant_id as string) ?? r.tenant_id) : "",
          r.resolved_at,
          r.created_at,
        ]);
        csv = buildCsv(header, rows);
        filename = `ft_defects_${project.name}.csv`;
        break;
      }

      case "evidence": {
        const { data, error } = await admin
          .from("ft_evidence")
          .select("evidence_type, file_name, caption, tenant_id, captured_at, created_at")
          .match(scope)
          .order("created_at", { ascending: true });
        if (error) return apiInternalError(error, "ft csv evidence");
        const tenantIds = [...new Set((data ?? []).map((r) => r.tenant_id as string))];
        const tenantMap = await resolveTenantNames(admin, tenantIds);
        const header = ["種別", "ファイル名", "キャプション", "施工店", "撮影日", "登録日"];
        const rows = (data ?? []).map((r) => [
          FT_EVIDENCE_TYPE_LABELS[r.evidence_type as FtEvidenceType] ?? r.evidence_type,
          r.file_name,
          r.caption,
          tenantMap.get(r.tenant_id as string) ?? r.tenant_id,
          r.captured_at,
          r.created_at,
        ]);
        csv = buildCsv(header, rows);
        filename = `ft_evidence_${project.name}.csv`;
        break;
      }

      case "condition_checks": {
        // condition_checks has no manufacturer_id, scope via job_ids
        const { data: jobRows, error: jErr } = await admin.from("ft_jobs").select("id, job_code").match(scope);
        if (jErr) return apiInternalError(jErr, "ft csv cc jobs");
        const jobIds = (jobRows ?? []).map((j) => (j as { id: string }).id);
        if (jobIds.length === 0) {
          csv = buildCsv(["案件コード", "条件", "値", "チェック日"], []);
          filename = `ft_condition_checks_${project.name}.csv`;
          break;
        }
        const jobCodeMap = new Map(
          (jobRows ?? []).map((j) => [
            (j as { id: string }).id,
            (j as { job_code: string | null }).job_code ?? (j as { id: string }).id,
          ]),
        );

        const { data: checks, error: ccErr } = await admin
          .from("ft_condition_checks")
          .select("job_id, condition_id, value_boolean, value_numeric, value_text, value_photo_path, checked_at")
          .in("job_id", jobIds)
          .order("checked_at", { ascending: true });
        if (ccErr) return apiInternalError(ccErr, "ft csv condition_checks");

        // Resolve condition labels
        const condIds = [...new Set((checks ?? []).map((c) => c.condition_id as string))];
        const condMap = await resolveConditionLabels(admin, condIds);

        const header = ["案件コード", "条件", "値", "チェック日"];
        const rows = (checks ?? []).map((c) => {
          const val =
            c.value_boolean != null
              ? c.value_boolean
                ? "OK"
                : "NG"
              : c.value_numeric != null
                ? String(c.value_numeric)
                : (c.value_text ?? c.value_photo_path ?? "");
          return [
            jobCodeMap.get(c.job_id as string) ?? c.job_id,
            condMap.get(c.condition_id as string) ?? c.condition_id,
            val,
            c.checked_at,
          ];
        });
        csv = buildCsv(header, rows);
        filename = `ft_condition_checks_${project.name}.csv`;
        break;
      }

      default:
        return apiValidationError("不明なテーブルです。");
    }

    return new NextResponse(csv, {
      status: 200,
      headers: csvDownloadHeaders(filename),
    });
  } catch (e) {
    return apiInternalError(e, "ft csv export GET");
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function resolveTenantNames(
  admin: ReturnType<typeof createServiceRoleAdmin>,
  ids: string[],
): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const { data } = await admin.from("tenants").select("id, name").in("id", ids);
  return new Map((data ?? []).map((t) => [t.id as string, (t.name as string) ?? ""]));
}

async function resolveJobCodes(
  admin: ReturnType<typeof createServiceRoleAdmin>,
  ids: string[],
): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const { data } = await admin.from("ft_jobs").select("id, job_code, title").in("id", ids);
  return new Map(
    (data ?? []).map((j) => [j.id as string, (j.job_code as string | null) ?? (j.title as string) ?? (j.id as string)]),
  );
}

async function resolveConditionLabels(
  admin: ReturnType<typeof createServiceRoleAdmin>,
  ids: string[],
): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const { data } = await admin.from("ft_conditions").select("id, label").in("id", ids);
  return new Map((data ?? []).map((c) => [c.id as string, (c.label as string) ?? ""]));
}
