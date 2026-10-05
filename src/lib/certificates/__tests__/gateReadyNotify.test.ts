/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * certificate_gate_ready の遷移検知（gateReadyNotify.ts）。
 * Gate 評価と dispatch はモックし、「未READY→READY のときだけ1回通知」を検証する。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const m = vi.hoisted(() => ({ evaluate: vi.fn(), dispatch: vi.fn() }));
vi.mock("../activationGate", () => ({ evaluateCertificateActivationGate: (...a: any[]) => m.evaluate(...a) }));
vi.mock("@/lib/notifications/dispatch", () => ({ dispatchNotification: (...a: any[]) => m.dispatch(...a) }));
vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn() } }));

import { watchGateReadyTransition, type GateWatchCert } from "../gateReadyNotify";

/** `admin.from("certificates").select("status").eq("id", ...).maybeSingle()` の最小スタブ。 */
function adminWithStatus(status: string | null) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: status === null ? null : { status } }),
        }),
      }),
    }),
  } as any;
}
const admin = adminWithStatus("draft");
const cert = (status: string): GateWatchCert => ({
  id: "c1",
  public_id: "pub1",
  status,
  service_type: "coating",
  reservation_id: "r1",
});
const gate = (...readies: (boolean | Error)[]) => {
  for (const r of readies) {
    if (r instanceof Error) m.evaluate.mockRejectedValueOnce(r);
    else m.evaluate.mockResolvedValueOnce({ ready: r, conditions: [] });
  }
};

describe("watchGateReadyTransition", () => {
  beforeEach(() => vi.resetAllMocks());

  it("draft で 未READY→READY に変わったら admin 宛に1回だけ通知する", async () => {
    gate(false, true);
    const after = await watchGateReadyTransition(admin, "t1", cert("draft"));
    await after();
    expect(m.dispatch).toHaveBeenCalledTimes(1);
    expect(m.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "t1",
        type: "certificate_gate_ready",
        linkPath: "/admin/certificates/pub1",
      }),
    );
    expect(m.evaluate).toHaveBeenCalledWith(admin, {
      certificateId: "c1",
      tenantId: "t1",
      serviceType: "coating",
      reservationId: "r1",
    });
  });

  it("アップロード前から READY なら（遷移ではないので）通知せず、再評価もしない", async () => {
    gate(true);
    await (
      await watchGateReadyTransition(admin, "t1", cert("draft"))
    )();
    expect(m.evaluate).toHaveBeenCalledTimes(1);
    expect(m.dispatch).not.toHaveBeenCalled();
  });

  it("アップロード後も未 READY なら通知しない", async () => {
    gate(false, false);
    await (
      await watchGateReadyTransition(admin, "t1", cert("draft"))
    )();
    expect(m.dispatch).not.toHaveBeenCalled();
  });

  it.each(["active", "void"])("%s（発行済み）は Gate を評価しない", async (status) => {
    await (
      await watchGateReadyTransition(admin, "t1", cert(status))
    )();
    expect(m.evaluate).not.toHaveBeenCalled();
    expect(m.dispatch).not.toHaveBeenCalled();
  });

  it("アップロード処理中に別経路で発行(draft→active)されていたら、READYでも通知しない", async () => {
    gate(false, true);
    // 通知直前の再チェックで status を読むと既に active になっている想定。
    const after = await watchGateReadyTransition(adminWithStatus("active"), "t1", cert("draft"));
    await after();
    expect(m.dispatch).not.toHaveBeenCalled();
  });

  it("評価が失敗しても throw せず、通知もしない（アップロードを止めない）", async () => {
    gate(new Error("db down"));
    await expect((await watchGateReadyTransition(admin, "t1", cert("draft")))()).resolves.toBeUndefined();
    gate(false, new Error("db down"));
    await expect((await watchGateReadyTransition(admin, "t1", cert("draft")))()).resolves.toBeUndefined();
    expect(m.dispatch).not.toHaveBeenCalled();
  });
});
