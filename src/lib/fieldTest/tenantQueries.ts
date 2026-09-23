/**
 * Field Test: 施工店側の共通クエリ関数。
 *
 * Web API (withCaller) と Mobile API (resolveMobileCaller) の両方から
 * 呼ばれる。認証・認可はルート側で行う。
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Supa = SupabaseClient<any, any, any>;

// ── Projects ──

export async function listTenantFtProjects(supabase: Supa, tenantId: string) {
  // テナントに案件が割り当てられているプロジェクトを返す
  const { data: jobRows, error: jErr } = await supabase.from("ft_jobs").select("project_id").eq("tenant_id", tenantId);
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

export async function listTenantFtJobs(supabase: Supa, tenantId: string, projectId: string) {
  const { data, error } = await supabase
    .from("ft_jobs")
    .select("id, job_code, title, description, status, assigned_at, completed_at, created_at, project_id")
    .eq("tenant_id", tenantId)
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function getTenantFtJobDetail(supabase: Supa, tenantId: string, jobId: string) {
  const { data: job, error: jobErr } = await supabase
    .from("ft_jobs")
    .select(
      "id, job_code, title, description, status, conditions_snapshot, assigned_at, completed_at, created_at, project_id, manufacturer_id",
    )
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

export function validateTenantStatusTransition(current: string, next: string): string | null {
  const allowed = TENANT_STATUS_TRANSITIONS[current];
  if (!allowed || !allowed.includes(next)) {
    return `ステータス "${current}" から "${next}" への変更はできません。`;
  }
  return null;
}

/**
 * 状態ガード付き UPDATE が0行だったとき（既に対象状態・競合・不存在）に投げる型付きエラー。
 * ルート側は FT_STATE_CONFLICT を 4xx にマップする。
 *
 * なぜ要るか: 状態を絞った UPDATE（`.in("status",[...])` 等）に `.single()` を掛けると、
 * 0行のとき PostgREST が PGRST116 を返し、`if (error) throw error` が不透明な 500 を出す。
 * 二重操作や競合で普通に起きる経路なので、`.maybeSingle()`＋明示的な 4xx に寄せる。
 */
function ftStateConflict(message: string): Error & { code: string } {
  const e = new Error(message) as Error & { code: string };
  e.code = "FT_STATE_CONFLICT";
  return e;
}

export async function updateTenantFtJobStatus(
  supabase: Supa,
  tenantId: string,
  jobId: string,
  expectedStatus: string,
  newStatus: string,
) {
  // `.eq("status", expectedStatus)` で楽観ロックする。呼び出し元は現在の status を読んで
  // 遷移を検証してからここに来るが、その間に別操作が status を変えていたら 0 行になり、
  // 検証済みでない遷移を上書きしない（競合 → FT_STATE_CONFLICT）。ガードが無いと
  // 2つの PATCH が同じ旧状態を前提に両方書き込めてしまう（/code-review #1126）。
  const { data, error } = await supabase
    .from("ft_jobs")
    .update({ status: newStatus })
    .eq("id", jobId)
    .eq("tenant_id", tenantId)
    .eq("status", expectedStatus)
    .select("id, status, updated_at")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw ftStateConflict("案件の状態が変化しました。最新の状態を再読み込みしてください。");
  return data;
}

// ── Condition Checks ──

export async function listConditionChecks(supabase: Supa, jobId: string) {
  const { data, error } = await supabase
    .from("ft_condition_checks")
    .select("id, condition_id, value_boolean, value_numeric, value_text, value_photo_path, checked_at")
    .eq("job_id", jobId)
    .order("checked_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

/**
 * POST /field-test/condition-checks の入力検証（admin / mobile 共通）。
 *
 * 生の body 値をそのまま upsert に渡すと、`value_numeric: "abc"` のような
 * 型不一致が Postgres まで届いて不透明な 500 になる。信頼境界で弾く。
 * 1つの規則を admin/mobile で別々に書かないよう、ここを唯一の定義源にする。
 */
export const conditionCheckInputSchema = z.object({
  job_id: z.string().uuid(),
  condition_id: z.string().uuid(),
  value_boolean: z.boolean().nullish(),
  value_numeric: z.number().finite().nullish(),
  value_text: z.string().max(2000).nullish(),
  value_photo_path: z.string().max(1024).nullish(),
});

export async function upsertConditionCheck(
  supabase: Supa,
  jobId: string,
  projectId: string,
  conditionId: string,
  value: {
    value_boolean?: boolean | null;
    value_numeric?: number | null;
    value_text?: string | null;
    value_photo_path?: string | null;
  },
  checkedBy: string,
) {
  // condition_id が対象案件のプロジェクトに属する実在の条件かを検証する。
  // zod は形（UUID）しか見ないので、これが無いと (a) 実在しない condition_id は
  // FK(23503) で不透明な 500 になり（schema が閉じたと謳う経路そのもの）、
  // (b) 別プロジェクトの実在条件は FK を通って案件に越境記録され、per-condition
  // 集計を汚す（/code-review #1123）。テナントの ft_conditions SELECT は自社案件の
  // プロジェクトにスコープ済み。呼び出し元が確認した job の project に絞って1回で確かめる。
  const { data: cond, error: condErr } = await supabase
    .from("ft_conditions")
    .select("id")
    .eq("id", conditionId)
    .eq("project_id", projectId)
    .maybeSingle();
  if (condErr) throw condErr;
  if (!cond) {
    const err = new Error("指定された施工条件が案件のプロジェクトに存在しません。") as Error & { code?: string };
    err.code = "FT_INVALID_CONDITION";
    throw err;
  }

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

export async function listEvidence(supabase: Supa, tenantId: string, jobId: string) {
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
    .select(
      `
      id, title, description, required_certifications, max_participants, deadline, is_open, created_at,
      project_id, manufacturer_id
    `,
    )
    .eq("is_open", true)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function getRecruitmentDetail(supabase: Supa, recruitmentId: string) {
  const { data: rec, error: recErr } = await supabase
    .from("ft_recruitments")
    .select(
      `
      id, title, description, required_certifications, max_participants, deadline, is_open, created_at,
      project_id, manufacturer_id
    `,
    )
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

export async function listTenantApplications(supabase: Supa, tenantId: string) {
  const { data, error } = await supabase
    .from("ft_applications")
    .select(
      `
      id, status, notes, review_notes, reviewed_at, created_at, updated_at,
      recruitment_id, project_id, manufacturer_id
    `,
    )
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

/**
 * POST /field-test/applications の入力検証（admin / mobile 共通・唯一の定義源）。
 * `notes` を生値のまま DB へ渡さない（型不一致で不透明な 500・過大行を防ぐ）。
 */
export const applicationInputSchema = z.object({
  recruitment_id: z.string().uuid(),
  // nullish: 旧実装は `notes: null` をそのまま INSERT できた。conditionCheckInputSchema と揃える。
  notes: z.string().max(2000).nullish(),
});

/**
 * 募集が締切を過ぎているか。`is_open=true` のままでも deadline を過ぎたら応募不可にする
 * （運用が締切後に is_open を戻し忘れても新規応募を受けないため）。deadline 未設定は無期限。
 */
export function isRecruitmentExpired(deadline: string | null | undefined, now: Date = new Date()): boolean {
  if (!deadline) return false;
  const d = new Date(deadline);
  return !Number.isNaN(d.getTime()) && d.getTime() < now.getTime();
}

export async function createApplication(
  supabase: Supa,
  row: {
    recruitment_id: string;
    project_id: string;
    manufacturer_id: string;
    tenant_id: string;
    applied_by: string;
    notes?: string | null;
  },
) {
  const sel = "id, status, notes, created_at, recruitment_id, project_id";
  const { data, error } = await supabase.from("ft_applications").insert(row).select(sel).single();
  if (!error) return data;
  if ((error as { code?: string }).code !== "23505") throw error;

  // UNIQUE(recruitment_id, tenant_id) 違反。既存行が withdrawn / rejected なら「再応募」
  // として復活させる（取り下げ・不採用の後に再度応募できるべき）。pending / approved
  // （＝有効な応募中）のときだけ本当の二重応募として弾く。
  const { data: revived, error: reviveErr } = await supabase
    .from("ft_applications")
    .update({
      status: "pending",
      applied_by: row.applied_by,
      notes: row.notes ?? null,
      review_notes: null,
      reviewed_by: null,
      reviewed_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("recruitment_id", row.recruitment_id)
    .eq("tenant_id", row.tenant_id)
    .in("status", ["withdrawn", "rejected"])
    .select(sel)
    .maybeSingle();
  if (reviveErr) throw reviveErr;
  if (revived) return revived;

  const dup = new Error("この募集にはすでに応募済みです。") as Error & { code?: string };
  dup.code = "FT_DUPLICATE_APPLICATION";
  throw dup;
}

export async function withdrawApplication(supabase: Supa, tenantId: string, applicationId: string) {
  const { data, error } = await supabase
    .from("ft_applications")
    .update({ status: "withdrawn" })
    .eq("id", applicationId)
    .eq("tenant_id", tenantId)
    .in("status", ["pending"])
    .select("id, status, updated_at")
    .maybeSingle();
  if (error) throw error;
  if (!data)
    throw ftStateConflict("この応募は取り下げできません（既に取り下げ済み・審査済み、または対象が見つかりません）。");
  return data;
}

// ── Training ──

export async function listTrainingWithCompletions(supabase: Supa, tenantId: string, projectId: string) {
  const modulesRes = await supabase
    .from("ft_training_modules")
    .select("id, title, description, content_url, sort_order, is_required, created_at")
    .eq("project_id", projectId)
    .order("sort_order", { ascending: true });
  if (modulesRes.error) throw modulesRes.error;

  const moduleIds = (modulesRes.data ?? []).map((m) => m.id as string);
  // このプロジェクトのモジュールに絞る。テナント全完了行を引くと、参加プロジェクト
  // が増えるほど payload が無制限に膨らむため（表示に使うのは projectId 分だけ）。
  const completionsRes = moduleIds.length
    ? await supabase
        .from("ft_training_completions")
        .select("id, module_id, completed_by, completed_at")
        .eq("tenant_id", tenantId)
        .in("module_id", moduleIds)
    : { data: [], error: null };
  if (completionsRes.error) throw completionsRes.error;

  const completionMap = new Map((completionsRes.data ?? []).map((c) => [c.module_id as string, c]));

  return (modulesRes.data ?? []).map((m) => ({
    ...m,
    completion: completionMap.get(m.id as string) ?? null,
  }));
}

export async function completeTrainingModule(supabase: Supa, tenantId: string, moduleId: string, completedBy: string) {
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

export async function listTenantAgreements(supabase: Supa, tenantId: string, projectId: string) {
  const { data, error } = await supabase
    .from("ft_agreements")
    .select("id, agreement_type, document_url, document_text, accepted, accepted_by, accepted_at, created_at")
    .eq("tenant_id", tenantId)
    .eq("project_id", projectId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function acceptAgreement(supabase: Supa, tenantId: string, agreementId: string, acceptedBy: string) {
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
    .maybeSingle();
  if (error) throw error;
  if (!data) throw ftStateConflict("この契約は同意できません（既に同意済み、または対象が見つかりません）。");
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

export async function upsertWorkshopProfile(supabase: Supa, tenantId: string, fields: Record<string, unknown>) {
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
