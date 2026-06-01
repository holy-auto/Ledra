/**
 * ワークフロー工程 → AI 自動化のレジストリ。
 *
 * 「設定済みワークフローを汲み取って自動化」の中核。各工程に到達した時点で、
 * その工程の意味（stepSemantics）に対応する AI の先回り作業（下書き生成など）を
 * 起動する。作るのは下書きまで、確定・送付・発行は人（壁3）。
 *
 * 新しい工程アシストはこの STEP_AUTOMATIONS に 1 行足すだけで増やせる。
 */

import { classifyWorkflowStep, type WorkflowStepSemantic } from "./stepSemantics";
import { maybeAutoCreateDraftCertificateForReservation } from "@/lib/ai/automation/certificateRecordAuto";
import { maybeAutoCreateDraftInvoiceForReservation } from "@/lib/ai/automation/invoiceRecordAuto";

export interface StepAutomationContext {
  tenantId: string;
  reservationId: string;
}

/** semantic → その工程到達時に走らせる AI 自動化（各自が opt-in / 冪等 / 壁3 を担保）。 */
const STEP_AUTOMATIONS: Partial<Record<WorkflowStepSemantic, (ctx: StepAutomationContext) => Promise<void>>> = {
  certificate: (ctx) => maybeAutoCreateDraftCertificateForReservation(ctx),
  billing: (ctx) => maybeAutoCreateDraftInvoiceForReservation(ctx),
};

/** 自動化が登録済みの工程 semantic（テスト/可視化用）。 */
export function stepAutomationSemantics(): WorkflowStepSemantic[] {
  return Object.keys(STEP_AUTOMATIONS) as WorkflowStepSemantic[];
}

/**
 * 到達した工程に対応する AI 自動化を起動する。
 * 対応が無ければ何もしない。実行した semantic を返す（ログ/可視化用）。
 */
export async function runStepAutomationOnReach(
  step: { key?: string | null; label?: string | null } | null,
  ctx: StepAutomationContext,
): Promise<WorkflowStepSemantic | null> {
  if (!step) return null;
  const semantic = classifyWorkflowStep(step);
  if (!semantic) return null;
  const fn = STEP_AUTOMATIONS[semantic];
  if (!fn) return null;
  await fn(ctx);
  return semantic;
}
