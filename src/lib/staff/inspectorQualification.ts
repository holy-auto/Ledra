/**
 * 完成検査（指定整備記録簿）の実施者資格ゲート。 [G1/#1・#3 / 第２ ３（１）①]
 *
 * 規制: 自動車検査員に係る権限は **指定整備事業者に限る**。完成検査（inspection_type='completion'）の
 * 実施者は自動車検査員でなければならない。Ledra はこれをテナント opt-in
 * （tenants.require_inspector_qualification）で強制する。既定 false＝非破壊（既存の記録作成を止めない）。
 *
 * **fail-closed**: 強制が有効なのに実施者の資格を確認できない（クエリ失敗）ときはブロックする。
 * 強制が無効のときは一切ブロックせず、実施者が指定されていればスナップショットのみ残す。
 * `db` は tenant-scoped admin（RLS バイパス）を渡す。
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { StaffQualificationKey } from "./qualifications";
import {
  buildQualificationSnapshot,
  isQualificationValid,
  normalizeQualificationDetails,
  type QualificationDetail,
} from "./qualificationStatus";

/** 完成検査の実施者に要求する法定資格。 */
export const INSPECTOR_REQUIRED_QUALIFICATION: StaffQualificationKey = "vehicle_inspector";

export type InspectorGateResult = {
  /** 強制が有効で、実施者が有効な自動車検査員でない（または未指定/確認不能）ならブロック。 */
  blocked: boolean;
  /** ブロック時の利用者向けメッセージ。 */
  message?: string;
  /** 実施時点の資格スナップショット（実施者が指定され読めた場合のみ。無ければ null）。 */
  snapshot: QualificationDetail[] | null;
};

/**
 * テナントが実施者資格の強制を opt-in しているか。
 * **fail-open（既定 false）**: tenants 読取り失敗で既存の記録作成を一斉に止めない（非破壊既定）。
 * 強制が有効と確認できた場合にのみ、下流の資格判定を fail-closed で効かせる。
 */
export async function tenantRequiresInspectorQualification(
  db: Pick<SupabaseClient, "from">,
  tenantId: string,
): Promise<boolean> {
  const { data, error } = await db
    .from("tenants")
    .select("require_inspector_qualification")
    .eq("id", tenantId)
    .maybeSingle();
  if (error || !data) return false;
  return (data as { require_inspector_qualification: boolean | null }).require_inspector_qualification === true;
}

/** 実施者（staff_members）の在籍・保有資格・明細を読む。error=クエリ失敗。 */
async function loadStaffQualifications(
  db: Pick<SupabaseClient, "from">,
  tenantId: string,
  staffId: string,
): Promise<{ found: boolean; active: boolean; held: string[]; details: QualificationDetail[]; error: boolean }> {
  const { data: staff, error: staffErr } = await db
    .from("staff_members")
    .select("qualifications, is_active")
    .eq("tenant_id", tenantId)
    .eq("id", staffId)
    .maybeSingle();
  if (staffErr) return { found: false, active: false, held: [], details: [], error: true };
  if (!staff) return { found: false, active: false, held: [], details: [], error: false };

  const { data: rows, error: detErr } = await db
    .from("staff_qualifications")
    .select("qualification, number, expires_on")
    .eq("tenant_id", tenantId)
    .eq("staff_member_id", staffId);
  if (detErr) return { found: true, active: false, held: [], details: [], error: true };

  const s = staff as { qualifications: unknown; is_active: unknown };
  const held = Array.isArray(s.qualifications) ? (s.qualifications as string[]) : [];
  return {
    found: true,
    active: s.is_active !== false,
    held,
    details: normalizeQualificationDetails(rows),
    error: false,
  };
}

/**
 * 完成検査の実施者ゲートを評価する。テナント強制フラグの読取りから資格判定まで一括。
 * - 強制 OFF: blocked=false。実施者が指定され読めればスナップショットを返す（best-effort）。
 * - 強制 ON:
 *     - 実施者未指定 → blocked（指定を促す）。
 *     - 資格を確認できない（staff 不在/クエリ失敗）→ blocked（fail-closed）。
 *     - 有効な自動車検査員でない → blocked。
 *     - 有効 → blocked=false ＋ スナップショット。
 */
export async function evaluateCompletionInspectorGate(
  db: Pick<SupabaseClient, "from">,
  tenantId: string,
  staffId: string | null | undefined,
): Promise<InspectorGateResult> {
  const required = await tenantRequiresInspectorQualification(db, tenantId);

  if (!staffId) {
    return required
      ? {
          blocked: true,
          message: "完成検査の実施者（自動車検査員）を指定してください。",
          snapshot: null,
        }
      : { blocked: false, snapshot: null };
  }

  const state = await loadStaffQualifications(db, tenantId, staffId);

  if (required) {
    if (state.error || !state.found) {
      return {
        blocked: true,
        message: "実施者の資格を確認できませんでした。時間をおいて再度お試しください。",
        snapshot: null,
      };
    }
    if (!state.active) {
      return {
        blocked: true,
        message: "完成検査の実施者が休止中です。在籍中の自動車検査員を指定してください。",
        snapshot: buildQualificationSnapshot(state.held, state.details),
      };
    }
    if (!isQualificationValid(state.held, state.details, INSPECTOR_REQUIRED_QUALIFICATION)) {
      return {
        blocked: true,
        message: "完成検査の実施者が有効な自動車検査員資格を持ちません。資格の登録・有効期限をご確認ください。",
        snapshot: buildQualificationSnapshot(state.held, state.details),
      };
    }
  }

  // 強制の有無にかかわらず、実施者が読めたらスナップショットを残す（記録簿への実施者資格の紐付け）。
  const snapshot = state.error ? null : buildQualificationSnapshot(state.held, state.details);
  return { blocked: false, snapshot };
}
