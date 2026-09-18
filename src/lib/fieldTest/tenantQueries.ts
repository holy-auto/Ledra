/**
 * Field Test: 施工店側の共通クエリ関数。
 *
 * Web API (withCaller) と Mobile API (resolveMobileCaller) の両方から
 * 呼ばれる。認証・認可はルート側で行う。
 */

import type { SupabaseClient } from "@supabase/supabase-js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Supa = SupabaseClient<any, any, any>;

// ── Projects ──

export async function listTenantFtProjects(supabase: Supa, tenantId: string) {
  // テナントに案件が割り当てられているプロジェクトを返す
  const { data: jobRows, error: jErr } = await supabase
    .from("ft_jobs")
    .select("project_id")
    .eq("tenant_id", tenantId);
  if (jErr) throw jErr;

  const projectIds = [...new Set((jobRows ?? []).map((j) => j.project_id as string))];
  if (projectIds.length === 0) return [];

  const { data, error } = await supabase
    .from("ft_projects")
    .select("id, name, description, product_name, status, starts_at, ends_at")
    .in("id", projectIds)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

// ── Jobs ──

export async function listTenantFtJobs(
  supabase: Supa,
  tenantId: string,
  projectId: string,
) {
  const { data, error } = await supabase
    .from("ft_jobs")
    .select("id, job_code, title, description, status, assigned_at, completed_at, created_at, project_id")
    .eq("tenant_id", tenantId)
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function getTenantFtJobDetail(
  supabase: Supa,
  tenantId: string,
  jobId: string,
) {
  const { data: job, error: jobErr } = await supabase
    .from("ft_jobs")
    .select("id, job_code, title, description, status, conditions_snapshot, assigned_at, completed_at, created_at, project_id, manufacturer_id")
    .eq("id", jobId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (jobErr) throw jobErr;
  if (!job) return null;

  // 並列取得: 条件チェック、証拠数、検査結果、不具合
  const [checksRes, evidenceRes, inspRes, defectsRes] = await Promise.all([
    supabase
      .from("ft_condition_checks")
      .select("id, condition_id, value_boolean, value_numeric, value_text, value_photo_path, checked_at")
      .eq("job_id", jobId)
      .order("checked_at", { ascending: true }),
    supabase
      .from("ft_evidence")
      .select("id, evidence_type, file_name, caption, captured_at, created_at")
      .eq("job_id", jobId)
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false }),
    supabase
      .from("ft_inspections")
      .select("id, result, score, notes, inspected_at, created_at")
      .eq("job_id", jobId)
      .order("created_at", { ascending: false }),
    supabase
      .from("ft_defects")
      .select("id, defect_code, title, severity, status, description, resolution, created_at")
      .eq("tenant_id", tenantId)
      .eq("job_id", jobId)
      .order("created_at", { ascending: false }),
  ]);

  // 条件定義も取得
  const { data: conditions } = await supabase
    .from("ft_conditions")
    .select("id, label, description, check_type, numeric_min, numeric_max, unit, is_required, sort_order")
    .eq("project_id", job.project_id as string)
    .order("sort_order", { ascending: true });

  return {
    ...job,
    conditions: conditions ?? [],
    condition_checks: checksRes.data ?? [],
    evidence: evidenceRes.data ?? [],
    inspections: inspRes.data ?? [],
    defects: defectsRes.data ?? [],
  };
}

/** 施工店が変更できるステータス遷移 */
const TENANT_STATUS_TRANSITIONS: Record<string, string[]> = {
  assigned: ["in_progress"],
  in_progress: ["evidence_submitted"],
};

export function validateTenantStatusTransition(
  current: string,
  next: string,
): string | null {
  const allowed = TENANT_STATUS_TRANSITIONS[current];
  if (!allowed || !allowed.includes(next)) {
    return `ステータス "${current}" から "${next}" への変更はできません。`;
  }
  return null;
}

export async function updateTenantFtJobStatus(
  supabase: Supa,
  tenantId: string,
  jobId: string,
  newStatus: string,
) {
  const updatePayload: Record<string, unknown> = { status: newStatus };
  if (newStatus === "evidence_submitted") {
    // ponytail: completed_at はメーカーが completed にしたとき設定。ここでは不要。
  }

  const { data, error } = await supabase
    .from("ft_jobs")
    .update(updatePayload)
    .eq("id", jobId)
    .eq("tenant_id", tenantId)
    .select("id, status, updated_at")
    .single();
  if (error) throw error;
  return data;
}

// ── Condition Checks ──

export async function listConditionChecks(
  supabase: Supa,
  jobId: string,
) {
  const { data, error } = await supabase
    .from("ft_condition_checks")
    .select("id, condition_id, value_boolean, value_numeric, value_text, value_photo_path, checked_at")
    .eq("job_id", jobId)
    .order("checked_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function upsertConditionCheck(
  supabase: Supa,
  jobId: string,
  conditionId: string,
  value: {
    value_boolean?: boolean | null;
    value_numeric?: number | null;
    value_text?: string | null;
    value_photo_path?: string | null;
  },
  checkedBy: string,
) {
  const { data, error } = await supabase
    .from("ft_condition_checks")
    .upsert(
      {
        job_id: jobId,
        condition_id: conditionId,
        ...value,
        checked_by: checkedBy,
        checked_at: new Date().toISOString(),
      },
      { onConflict: "job_id,condition_id" },
    )
    .select("id, condition_id, value_boolean, value_numeric, value_text, value_photo_path, checked_at")
    .single();
  if (error) throw error;
  return data;
}

// ── Evidence ──

export async function listEvidence(
  supabase: Supa,
  tenantId: string,
  jobId: string,
) {
  const { data, error } = await supabase
    .from("ft_evidence")
    .select("id, evidence_type, file_path, file_name, content_type, caption, metadata, captured_at, created_at")
    .eq("job_id", jobId)
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function insertEvidence(
  supabase: Supa,
  row: {
    job_id: string;
    project_id: string;
    manufacturer_id: string;
    tenant_id: string;
    evidence_type: string;
    file_path: string;
    file_name: string;
    content_type: string;
    caption?: string;
    captured_by: string;
  },
) {
  const { data, error } = await supabase
    .from("ft_evidence")
    .insert({
      ...row,
      captured_at: new Date().toISOString(),
    })
    .select("id, evidence_type, file_name, caption, created_at")
    .single();
  if (error) throw error;
  return data;
}

// ── Recruitments ──

export async function listOpenRecruitments(supabase: Supa) {
  const { data, error } = await supabase
    .from("ft_recruitments")
    .select(`
      id, title, description, required_certifications, max_participants, deadline, is_open, created_at,
      project_id, manufacturer_id
    `)
    .eq("is_open", true)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function getRecruitmentDetail(
  supabase: Supa,
  recruitmentId: string,
) {
  const { data: rec, error: recErr } = await supabase
    .from("ft_recruitments")
    .select(`
      id, title, description, required_certifications, max_participants, deadline, is_open, created_at,
      project_id, manufacturer_id
    `)
    .eq("id", recruitmentId)
    .maybeSingle();
  if (recErr) throw recErr;
  if (!rec) return null;

  const { data: project } = await supabase
    .from("ft_projects")
    .select("id, name, description, product_name, status, starts_at, ends_at")
    .eq("id", rec.project_id as string)
    .maybeSingle();

  return { ...rec, project };
}

// ── Applications ──

export async function listTenantApplications(
  supabase: Supa,
  tenantId: string,
) {
  const { data, error } = await supabase
    .from("ft_applications")
    .select(`
      id, status, notes, review_notes, reviewed_at, created_at, updated_at,
      recruitment_id, project_id, manufacturer_id
    `)
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function createApplication(
  supabase: Supa,
  row: {
    recruitment_id: string;
    project_id: string;
    manufacturer_id: string;
    tenant_id: string;
    applied_by: string;
    notes?: string;
  },
) {
  const { data, error } = await supabase
    .from("ft_applications")
    .insert(row)
    .select("id, status, notes, created_at, recruitment_id, project_id")
    .single();
  if (error) throw error;
  return data;
}

export async function withdrawApplication(
  supabase: Supa,
  tenantId: string,
  applicationId: string,
) {
  const { data, error } = await supabase
    .from("ft_applications")
    .update({ status: "withdrawn" })
    .eq("id", applicationId)
    .eq("tenant_id", tenantId)
    .in("status", ["pending"])
    .select("id, status, updated_at")
    .single();
  if (error) throw error;
  return data;
}

// ── Training ──

export async function listTrainingWithCompletions(
  supabase: Supa,
  tenantId: string,
  projectId: string,
) {
  const [modulesRes, completionsRes] = await Promise.all([
    supabase
      .from("ft_training_modules")
      .select("id, title, description, content_url, sort_order, is_required, created_at")
      .eq("project_id", projectId)
      .order("sort_order", { ascending: true }),
    supabase
      .from("ft_training_completions")
      .select("id, module_id, completed_by, completed_at")
      .eq("tenant_id", tenantId),
  ]);
  if (modulesRes.error) throw modulesRes.error;
  if (completionsRes.error) throw completionsRes.error;

  const completionMap = new Map(
    (completionsRes.data ?? []).map((c) => [c.module_id as string, c]),
  );

  return (modulesRes.data ?? []).map((m) => ({
    ...m,
    completion: completionMap.get(m.id as string) ?? null,
  }));
}

export async function completeTrainingModule(
  supabase: Supa,
  tenantId: string,
  moduleId: string,
  completedBy: string,
) {
  const { data, error } = await supabase
    .from("ft_training_completions")
    .upsert(
      {
        module_id: moduleId,
        tenant_id: tenantId,
        completed_by: completedBy,
        completed_at: new Date().toISOString(),
      },
      { onConflict: "module_id,tenant_id" },
    )
    .select("id, module_id, completed_by, completed_at")
    .single();
  if (error) throw error;
  return data;
}

// ── Agreements ──

export async function listTenantAgreements(
  supabase: Supa,
  tenantId: string,
  projectId: string,
) {
  const { data, error } = await supabase
    .from("ft_agreements")
    .select("id, agreement_type, document_url, document_text, accepted, accepted_by, accepted_at, created_at")
    .eq("tenant_id", tenantId)
    .eq("project_id", projectId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function acceptAgreement(
  supabase: Supa,
  tenantId: string,
  agreementId: string,
  acceptedBy: string,
) {
  const { data, error } = await supabase
    .from("ft_agreements")
    .update({
      accepted: true,
      accepted_by: acceptedBy,
      accepted_at: new Date().toISOString(),
    })
    .eq("id", agreementId)
    .eq("tenant_id", tenantId)
    .eq("accepted", false)
    .select("id, agreement_type, accepted, accepted_at")
    .single();
  if (error) throw error;
  return data;
}

// ── Workshop Capability Profile ──

export async function getWorkshopProfile(supabase: Supa, tenantId: string) {
  const { data, error } = await supabase
    .from("workshop_capability_profiles")
    .select("*")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function upsertWorkshopProfile(
  supabase: Supa,
  tenantId: string,
  fields: Record<string, unknown>,
) {
  const { data, error } = await supabase
    .from("workshop_capability_profiles")
    .upsert(
      {
        tenant_id: tenantId,
        ...fields,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "tenant_id" },
    )
    .select("*")
    .single();
  if (error) throw error;
  return data;
}
