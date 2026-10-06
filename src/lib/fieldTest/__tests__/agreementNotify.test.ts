import { describe, it, expect, vi, beforeEach } from "vitest";

const { dispatch } = vi.hoisted(() => ({ dispatch: vi.fn() }));
vi.mock("@/lib/notifications/dispatch", () => ({ dispatchNotification: dispatch }));

import { notifyAgreementAccepted } from "../agreementNotify";
import { getTypeConfig } from "@/lib/notifications/types";

describe("notifyAgreementAccepted", () => {
  beforeEach(() => dispatch.mockReset());

  it("ft_agreement_accepted で、施工店自身（宛先指定なし）に控えを出す", async () => {
    await notifyAgreementAccepted("t1", "nda");
    expect(dispatch).toHaveBeenCalledWith({
      tenantId: "t1",
      type: "ft_agreement_accepted",
      title: "契約に同意しました",
      body: "秘密保持契約に同意しました。",
      linkPath: "/admin/field-test",
    });
  });

  it("未知の契約種別は「契約書」と書く", async () => {
    await notifyAgreementAccepted("t1", "unknown");
    expect(dispatch.mock.calls[0][0].body).toBe("契約書に同意しました。");
  });

  it("控えの種類は in_app のみ（案件割当のような管理者宛メールは出さない）", () => {
    const c = getTypeConfig("ft_agreement_accepted");
    expect(c.defaultChannels).toEqual(["in_app"]);
    expect("targetRole" in c ? c.targetRole : undefined).toBeUndefined();
  });
});
