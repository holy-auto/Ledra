/**
 * IMP-029 `certificate_gate_ready`: 写真/証拠アップロード時の Certificate Gate 再評価
 * （DECISION_LOG 2026-09-27「写真アップロード時に再評価」）。
 *
 * Gate の評価そのものは `evaluateCertificateActivationGate()` を再利用する（新規実装しない）。
 * ここは「アップロード前は未 READY → アップロード後に READY」という**遷移**の検知だけを持つ。
 * 毎回「READY なら通知」だと写真を足すたびに連打になるため（dispatch.ts は重複抑止を持たない）。
 *
 * 使い方: アップロード（INSERT）前に `watchGateReadyTransition()` を await し、返ってきた関数を
 * INSERT 成功後に呼ぶ。draft 以外・既に READY・評価失敗のときは何もしない関数が返る。
 * 失敗してもアップロードは止めない（評価失敗は warn のみ、dispatch は throw しない）。
 *
 * ponytail: 同じ証明書への同時アップロード（オフライン同期の並列リクエスト等）が両方とも
 * 「前=未READY」を読むと、通知が2通になりうる。DB 側のフラグを持たない分の上限で、
 * 問題になったら certificates に「gate_ready_notified_at」を置いて条件付き UPDATE で1回に絞る。
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { evaluateCertificateActivationGate } from "./activationGate";
import { dispatchNotification } from "@/lib/notifications/dispatch";
import { logger } from "@/lib/logger";

export interface GateWatchCert {
  id: string;
  public_id: string;
  status: string | null;
  service_type: string | null;
  reservation_id: string | null;
}

async function gateReady(admin: SupabaseClient, tenantId: string, cert: GateWatchCert): Promise<boolean | null> {
  try {
    const gate = await evaluateCertificateActivationGate(admin, {
      certificateId: cert.id,
      tenantId,
      serviceType: cert.service_type,
      reservationId: cert.reservation_id,
    });
    return gate.ready;
  } catch (e) {
    logger.warn("[gate-ready] gate evaluation failed", {
      tenantId,
      certificateId: cert.id,
      err: e instanceof Error ? e.message : String(e),
    });
    return null; // 判定不能 = 遷移を断定できないので通知しない
  }
}

const noop = async () => {};

export async function watchGateReadyTransition(
  admin: SupabaseClient,
  tenantId: string,
  cert: GateWatchCert,
): Promise<() => Promise<void>> {
  // 発行済み（active / void）は Gate を見る意味がない。未発行の draft だけが対象。
  if (cert.status !== "draft") return noop;
  // 既に READY（遷移ではない）か判定不能なら、アップロード後に何もしない。
  if ((await gateReady(admin, tenantId, cert)) !== false) return noop;

  return async () => {
    // アップロード処理中に別経路で発行(draft→active)された可能性があるため、
    // 通知直前に現在のステータスを取り直す（TOCTOU: 既に発行済みの証明書に
    // 「発行できます」通知を送らないため）。
    const { data: current } = await admin.from("certificates").select("status").eq("id", cert.id).maybeSingle();
    if (current?.status !== "draft") return;
    if ((await gateReady(admin, tenantId, cert)) !== true) return;
    await dispatchNotification({
      tenantId,
      type: "certificate_gate_ready",
      title: "【発行可能】証明書の発行条件が揃いました",
      body: "写真の追加により、下書きの施工証明書が発行できる状態になりました。内容を確認して発行してください。",
      linkPath: `/admin/certificates/${cert.public_id}`,
    });
  };
}
