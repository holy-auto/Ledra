/**
 * 実証テスト: 施工店が契約に同意したときの、施工店自身への控え。
 *
 * Web（`/api/admin/field-test/agreements/[id]`）とモバイル（`/api/mobile/...`）の両方から呼ぶ。
 * 種類は `ft_agreement_accepted`（カタログ上 in_app のみ・宛先指定なし = テナント全員宛）で、
 * チャネルはカタログに従って中央 dispatch が決める（DECISION_LOG 2026-10-06）。
 */
import { dispatchNotification } from "@/lib/notifications/dispatch";

const AGREEMENT_TYPE_JA: Record<string, string> = {
  nda: "秘密保持契約",
  terms: "利用規約",
  other: "契約書",
};

export async function notifyAgreementAccepted(tenantId: string, agreementType: unknown): Promise<void> {
  const label = AGREEMENT_TYPE_JA[agreementType as string] ?? "契約書";
  await dispatchNotification({
    tenantId,
    type: "ft_agreement_accepted",
    title: "契約に同意しました",
    body: `${label}に同意しました。`,
    linkPath: "/admin/field-test",
  });
}
