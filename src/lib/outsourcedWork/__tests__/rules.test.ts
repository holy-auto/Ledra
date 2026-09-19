import { describe, expect, it } from "vitest";
import { OUTSOURCED_WORK_STATES } from "@/lib/domain/states";
import { OUTSOURCED_WORK_TRANSITIONS, isValidTransition } from "@/lib/domain/transitions";
import {
  EXCEPTION_ORIGIN_STATES,
  actorsForTransition,
  allowedReturnTargets,
  canOperate,
  checkHumanTransition,
  isCancelable,
  rejectionReturnTarget,
  resolveActor,
  type OutsourcedActor,
} from "../rules";

const REQ = {
  client_tenant_id: "client",
  contractor_tenant_id: "contractor",
  designated_reviewer_user_ids: ["rev-1"],
  designated_approver_user_ids: ["rev-1", "c-admin-designated"],
};

const actor = (role: OutsourcedActor["role"], designatedApprover = false): OutsourcedActor => ({
  role,
  designatedApprover,
  side: role.startsWith("client") || role === "reviewer" ? "client" : "contractor",
});

describe("resolveActor（テナント×ロール → 仕様の6ロール）", () => {
  it("発注元 admin → client_admin、staff → client_store_staff、viewer → viewer", () => {
    expect(resolveActor({ userId: "u", tenantId: "client", role: "admin", request: REQ })?.role).toBe("client_admin");
    expect(resolveActor({ userId: "u", tenantId: "client", role: "owner", request: REQ })?.role).toBe("client_admin");
    expect(resolveActor({ userId: "u", tenantId: "client", role: "staff", request: REQ })?.role).toBe(
      "client_store_staff",
    );
    expect(resolveActor({ userId: "u", tenantId: "client", role: "viewer", request: REQ })?.role).toBe("viewer");
  });

  it("施工事業者 admin → contractor_admin、staff → contractor_worker", () => {
    expect(resolveActor({ userId: "u", tenantId: "contractor", role: "admin", request: REQ })?.role).toBe(
      "contractor_admin",
    );
    expect(resolveActor({ userId: "u", tenantId: "contractor", role: "staff", request: REQ })?.role).toBe(
      "contractor_worker",
    );
  });

  it("指名された発注元ユーザーは reviewer（確認者）。管理者は管理者のまま", () => {
    expect(resolveActor({ userId: "rev-1", tenantId: "client", role: "viewer", request: REQ })?.role).toBe("reviewer");
    expect(resolveActor({ userId: "rev-1", tenantId: "client", role: "admin", request: REQ })?.role).toBe(
      "client_admin",
    );
  });

  it("PER-028: どちらのテナントでもなければ null", () => {
    expect(resolveActor({ userId: "u", tenantId: "other", role: "owner", request: REQ })).toBeNull();
  });

  it("designatedApprover は施工会社側でも判定される（PER-015 設定時のみ）", () => {
    const a = resolveActor({ userId: "c-admin-designated", tenantId: "contractor", role: "admin", request: REQ });
    expect(a).toEqual({ role: "contractor_admin", designatedApprover: true, side: "contractor" });
  });
});

describe("権限マトリクス（遷移を伴わない操作）", () => {
  it("PER-001/002: 作業依頼作成・支給部品登録は発注元だけ", () => {
    expect(canOperate(actor("client_store_staff"), "request:create")).toBe(true);
    expect(canOperate(actor("client_admin"), "parts:register")).toBe(true);
    expect(canOperate(actor("contractor_admin"), "request:create")).toBe(false);
    expect(canOperate(actor("viewer"), "request:create")).toBe(false);
  });

  it("PER-009: 施工担当者割当は施工会社管理者だけ", () => {
    expect(canOperate(actor("contractor_admin"), "worker:assign")).toBe(true);
    expect(canOperate(actor("contractor_worker"), "worker:assign")).toBe(false);
    expect(canOperate(actor("client_admin"), "worker:assign")).toBe(false);
  });

  it("PER-023: 証跡閲覧は全ロール", () => {
    for (const r of [
      "client_store_staff",
      "client_admin",
      "contractor_worker",
      "contractor_admin",
      "reviewer",
      "viewer",
    ] as const) {
      expect(canOperate(actor(r), "history:view")).toBe(true);
    }
  });
});

describe("遷移の実行主体（遷移表の実行主体列）", () => {
  it("遷移表の全エントリに実行主体が定義されている（漏れなし）", () => {
    for (const from of OUTSOURCED_WORK_STATES) {
      for (const to of OUTSOURCED_WORK_TRANSITIONS[from]) {
        expect(actorsForTransition(from, to).length, `${from} → ${to}`).toBeGreaterThan(0);
      }
    }
  });

  it("遷移表に無い組み合わせは実行主体なし", () => {
    expect(actorsForTransition("COMPLETED", "REQUEST_CREATED")).toEqual([]);
    expect(actorsForTransition("EXCEPTION_APPROVED", "WORK_IN_PROGRESS")).toEqual([]);
  });

  it("TR-001: 依頼承認は発注元管理者だけ（店舗担当者は不可）", () => {
    expect(checkHumanTransition(actor("client_admin"), "REQUEST_CREATED", "PARTS_PREPARED").ok).toBe(true);
    expect(checkHumanTransition(actor("client_store_staff"), "REQUEST_CREATED", "PARTS_PREPARED").ok).toBe(false);
  });

  it("TR-015 / PER-014: 受領拒否は施工会社管理者だけ", () => {
    expect(checkHumanTransition(actor("contractor_admin"), "RECEIPT_IN_REVIEW", "RECEIPT_REJECTED").ok).toBe(true);
    expect(checkHumanTransition(actor("contractor_worker"), "RECEIPT_IN_REVIEW", "RECEIPT_REJECTED").ok).toBe(false);
  });

  it("TR-021〜031: 承認・却下後の復帰はシステム制御で、人からは起こせない", () => {
    const r = checkHumanTransition(actor("client_admin"), "EXCEPTION_APPROVED", "READY_FOR_WORK");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("システム制御");
    expect(actorsForTransition("EXCEPTION_REJECTED", "RETURNED")).toEqual(["system"]);
  });

  it("PER-015/016: 例外承認は発注元管理者、または指名された施工会社管理者・確認者", () => {
    expect(checkHumanTransition(actor("client_admin"), "EXCEPTION_APPROVAL_PENDING", "EXCEPTION_APPROVED").ok).toBe(
      true,
    );
    expect(checkHumanTransition(actor("contractor_admin"), "EXCEPTION_APPROVAL_PENDING", "EXCEPTION_APPROVED").ok).toBe(
      false,
    );
    expect(
      checkHumanTransition(actor("contractor_admin", true), "EXCEPTION_APPROVAL_PENDING", "EXCEPTION_APPROVED").ok,
    ).toBe(true);
    expect(checkHumanTransition(actor("reviewer", true), "EXCEPTION_APPROVAL_PENDING", "EXCEPTION_REJECTED").ok).toBe(
      true,
    );
    expect(
      checkHumanTransition(actor("contractor_worker", true), "EXCEPTION_APPROVAL_PENDING", "EXCEPTION_APPROVED").ok,
    ).toBe(false);
  });

  it("PER-017/018: 完了確認・差戻しは発注元管理者と確認者。施工側は不可", () => {
    expect(checkHumanTransition(actor("reviewer"), "AWAITING_CLIENT_CONFIRMATION", "COMPLETED").ok).toBe(true);
    expect(checkHumanTransition(actor("client_admin"), "AWAITING_CLIENT_CONFIRMATION", "RETURNED").ok).toBe(true);
    expect(checkHumanTransition(actor("contractor_admin"), "AWAITING_CLIENT_CONFIRMATION", "COMPLETED").ok).toBe(false);
  });

  it("TR-039: 差戻し後の記録修正は施工担当者が発注元確認待ちへ戻す（発注元は不可）", () => {
    expect(checkHumanTransition(actor("contractor_worker"), "RETURNED", "AWAITING_CLIENT_CONFIRMATION").ok).toBe(true);
    expect(checkHumanTransition(actor("client_admin"), "RETURNED", "AWAITING_CLIENT_CONFIRMATION").ok).toBe(false);
  });

  it("PER-021/022: 保留は両社の担当者・管理者、取消は発注元管理者だけ", () => {
    expect(checkHumanTransition(actor("contractor_admin"), "WORK_INTERRUPTED", "ON_HOLD").ok).toBe(true);
    expect(checkHumanTransition(actor("client_store_staff"), "DAMAGE_REVIEW", "ON_HOLD").ok).toBe(true);
    expect(checkHumanTransition(actor("contractor_worker"), "DAMAGE_REVIEW", "ON_HOLD").ok).toBe(false);
    expect(checkHumanTransition(actor("client_admin"), "ON_HOLD", "CANCELED").ok).toBe(true);
    expect(checkHumanTransition(actor("contractor_admin"), "ON_HOLD", "CANCELED").ok).toBe(false);
    expect(checkHumanTransition(actor("contractor_admin"), "ON_HOLD", "READY_FOR_WORK").ok).toBe(true);
  });

  it("TR-048: 完了後はどのロールでも動かせない（拒否理由は終端）", () => {
    for (const r of ["client_admin", "contractor_admin", "reviewer"] as const) {
      const res = checkHumanTransition(actor(r, true), "COMPLETED", "CANCELED");
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.reason).toContain("終端");
    }
  });

  it("viewer はどの遷移も起こせない（PER の閲覧者列は全て ×）", () => {
    for (const from of OUTSOURCED_WORK_STATES) {
      for (const to of OUTSOURCED_WORK_TRANSITIONS[from]) {
        expect(checkHumanTransition(actor("viewer"), from, to).ok, `${from} → ${to}`).toBe(false);
      }
    }
  });
});

describe("復帰先のシステム制御（PER-029 / AC-017 / AC-018）", () => {
  it("復帰先は遷移表の EXCEPTION_APPROVED 行の部分集合", () => {
    for (const origin of EXCEPTION_ORIGIN_STATES) {
      for (const target of allowedReturnTargets(origin)) {
        expect(
          isValidTransition(OUTSOURCED_WORK_TRANSITIONS, "EXCEPTION_APPROVED", target),
          `${origin} → ${target}`,
        ).toBe(true);
        expect(isValidTransition(OUTSOURCED_WORK_TRANSITIONS, "ON_HOLD", target), `hold ${origin} → ${target}`).toBe(
          true,
        );
      }
    }
  });

  it("受領時の例外は施工待ちまで、施工中断は施工待ちか再施工、差戻しは完了確認か再施工", () => {
    expect(allowedReturnTargets("QUANTITY_SHORTAGE")).toEqual(["RECEIPT_IN_REVIEW", "RECEIVED", "READY_FOR_WORK"]);
    expect(allowedReturnTargets("WORK_INTERRUPTED")).toEqual(["READY_FOR_WORK", "REWORK_PENDING"]);
    expect(allowedReturnTargets("RETURNED")).toEqual(["AWAITING_CLIENT_CONFIRMATION", "REWORK_PENDING"]);
    // 数量不足の承認で、いきなり発注元確認待ちへは行けない
    expect(allowedReturnTargets("QUANTITY_SHORTAGE")).not.toContain("AWAITING_CLIENT_CONFIRMATION");
  });

  it("却下は原因の例外ステータスへ戻り、それは遷移表の EXCEPTION_REJECTED 行にある", () => {
    for (const origin of EXCEPTION_ORIGIN_STATES) {
      expect(rejectionReturnTarget(origin)).toBe(origin);
      expect(isValidTransition(OUTSOURCED_WORK_TRANSITIONS, "EXCEPTION_REJECTED", origin)).toBe(true);
    }
  });

  it("TR-047: 取消可能なのは終端と承認直後を除く全状態", () => {
    const notCancelable = OUTSOURCED_WORK_STATES.filter((s) => !isCancelable(s));
    expect(notCancelable.sort()).toEqual(["CANCELED", "COMPLETED", "EXCEPTION_APPROVED", "EXCEPTION_REJECTED"]);
  });
});
