/**
 * IMP-040: Certificate Gate 部品整合性条件の導出（純関数）。
 *
 * gate evaluator の `partsIntegrityOk` パラメータを、実際の findings データから
 * 導出する。未解決(open/acknowledged)の critical findings が 1 件でもあればブロック。
 *
 * 使い方:
 *   const ok = derivePartsIntegrityOk(findings);
 *   evaluateCertificateGate({ ...input, partsIntegrityOk: ok });
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { FindingSeverity } from "./integrityChecks";

/** findings テーブルから取得した行の最小インターフェース。 */
export interface PartFindingSummary {
  severity: FindingSeverity;
  status: string; // open | acknowledged | resolved | dismissed
}

/**
 * 未解決の critical findings が存在するかを判定する。
 *
 * - resolved / dismissed は無視（解消済み）。
 * - warning / info は Certificate Gate をブロックしない（運用監査の情報）。
 * - critical + open/acknowledged → ブロック。
 *
 * 部品装着レコードが 0 件の場合は findings も 0 件 → true（部品なし = 通過）。
 */
export function derivePartsIntegrityOk(findings: readonly PartFindingSummary[]): boolean {
  return !findings.some((f) => f.severity === "critical" && f.status !== "resolved" && f.status !== "dismissed");
}

/**
 * 指定予約(reservation_id)に紐づく部品装着の findings を取得する（IMP-028 配線用）。
 *
 * findings は certificate ではなく `part_installations`（reservation_id 経由）に
 * 紐づくため、`part_installations` → `part_integrity_findings` の2段引きになる。
 * reservationId が無い（予約に紐づかない証明書）場合や、紐づく装着が無い場合は
 * 空配列（= derivePartsIntegrityOk が true を返す。装着なし = 問題なし）。
 */
export async function getPartsIntegrityFindings(
  admin: SupabaseClient,
  tenantId: string,
  reservationId: string | null,
): Promise<PartFindingSummary[]> {
  if (!reservationId) return [];

  const { data: installations, error: instErr } = await admin
    .from("part_installations")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("reservation_id", reservationId);
  if (instErr) throw instErr;

  const installationIds = (installations ?? []).map((r) => r.id as string);
  if (installationIds.length === 0) return [];

  const { data: findings, error: findErr } = await admin
    .from("part_integrity_findings")
    .select("severity, status")
    .eq("tenant_id", tenantId)
    .in("installation_id", installationIds);
  if (findErr) throw findErr;

  return (findings ?? []) as PartFindingSummary[];
}
