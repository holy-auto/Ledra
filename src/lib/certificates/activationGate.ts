/**
 * IMP-028: Certificate Gate の実データ配線（draft→active の発行経路から呼ぶ）。
 *
 * `gateEvaluator.ts` の `evaluateCertificateGate()` は純関数（IOなし）で、
 * 呼び出し側が条件ごとの実データを組み立てて渡す設計（ADR-0005）。
 * この関数はその組み立てを1箇所にまとめ、証明書を active にする経路
 * （`activationGates.test.ts` が数える発行経路）が同じチェックを重複実装せずに
 * 済むようにする。
 *
 * 配線済みの条件:
 * - required_evidence_present（既存 photoRequirement.ts）
 * - no_unresolved_alerts（IMP-026 customer_concerns）
 * - parts_integrity（IMP-040 part_integrity_findings、reservation_id 経由）
 *
 * まだ配線していない条件（gateEvaluator.ts のスタブのまま。理由は個別に検証済み）:
 * - workflow_completed: `reservations.status`/`work_completed_at` から機械的には
 *   出せるが、現場が実際にこの完了報告を確実に行ってから証明書を発行しているか
 *   （逆に「証明書発行」自体を完了の代わりにしている運用がないか）を確認できて
 *   いない。誤って配線すると本番の発行を広く止めかねないため、運用実態の確認を
 *   要確認として OPEN_QUESTIONS.md に記録し見送った。
 * - customer_confirmation_current: `src/lib/signoff/state.ts` の署名ステップは
 *   証明書が active であることを条件に依頼可能になる設計（`canRequestSignature`）。
 *   ここに「署名済み」を要求すると、発行→署名→発行 が要求される循環になり
 *   証明書を永久に発行できなくなる。意図的にスタブのまま。
 * - payment_policy_met: 合算払い(consolidated)の CANCELED 扱いや paymentState の
 *   導出元が未決（docs/context/OPEN_QUESTIONS.md 参照）のため配線を見送る。
 * - no_pending_corrections: `correction.ts` は型定義のみで対応する DB テーブルが
 *   存在しない（IMP-030、DBマイグレーション未実施）。
 * - evidence_synced / in_store_review / approvals_complete: 未設計
 *   （gateEvaluator.ts 自身のコメント参照）。
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { CertificateGateResult } from "@/lib/domain/certificateGate";
import { evaluateCertificateGate } from "./gateEvaluator";
import {
  certificateHasRequiredPhotos,
  certificateHasRequiredBeforeAfterMedia,
  MIN_CERTIFICATE_PHOTOS,
} from "./photoRequirement";
import { hasUnresolvedConcerns } from "@/lib/concerns/blockCheck";
import { derivePartsIntegrityOk, getPartsIntegrityFindings } from "@/lib/parts/partsIntegrity";

export interface CertificateActivationContext {
  certificateId: string;
  tenantId: string;
  serviceType: string | null;
  /** 部品整合性 findings を引き当てるための予約ID（無ければ部品なし扱い）。 */
  reservationId: string | null;
}

/**
 * draft→active（および void→active の再発行）の直前に呼ぶ。
 * 呼び出し側は `gate.ready` が false なら `gate.conditions` から最初の不足条件の
 * `detail` を使って API エラーを返すこと（`firstGateFailureMessage()` 参照）。
 */
export async function evaluateCertificateActivationGate(
  admin: SupabaseClient,
  ctx: CertificateActivationContext,
): Promise<CertificateGateResult> {
  const [hasPhotos, hasBeforeAfter, hasUnresolved, findings] = await Promise.all([
    certificateHasRequiredPhotos(admin, ctx.certificateId),
    certificateHasRequiredBeforeAfterMedia(admin, ctx.certificateId, ctx.serviceType),
    // customer_concerns.job_id は reservations(id) 参照。部品確認(parts_confirmation)・
    // 板金進捗(body_repair_tracking)経由の懸念は certificate_id が null で job_id のみ
    // 持つため、reservationId も渡さないと hasUnresolvedConcerns() の OR 条件に一致せず
    // 見逃す(src/app/api/customer/concerns/route.ts の resolveSourceContext 参照)。
    hasUnresolvedConcerns(admin, ctx.tenantId, {
      certificateId: ctx.certificateId,
      jobId: ctx.reservationId ?? undefined,
    }),
    getPartsIntegrityFindings(admin, ctx.tenantId, ctx.reservationId),
  ]);

  return evaluateCertificateGate({
    // gateEvaluator は枚数(photoCount < MIN_CERTIFICATE_PHOTOS)で判定するため、
    // 既存の boolean ヘルパーの結果をそのまま枚数相当に変換する（新規クエリ不要）。
    photoCount: hasPhotos ? MIN_CERTIFICATE_PHOTOS : 0,
    hasBeforeAfterMedia: hasBeforeAfter,
    serviceType: ctx.serviceType,
    paymentPolicyResult: null,
    hasUnresolvedConcerns: hasUnresolved,
    partsIntegrityOk: derivePartsIntegrityOk(findings),
  });
}

/** Gate が ready でないとき、最初の不足条件の detail（無ければ汎用メッセージ）を返す。 */
export function firstGateFailureMessage(gate: CertificateGateResult): string {
  const failing = gate.conditions.find((c) => !c.met);
  return failing?.detail ?? "証明書の発行条件を満たしていません。";
}
