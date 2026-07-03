import { describe, it, expect } from "vitest";
import { computeSignoffState, computeSignoffDeadline, type SignoffStateInput } from "../state";

const NOW = "2026-07-03T00:00:00.000Z";

function base(overrides: Partial<SignoffStateInput> = {}): SignoffStateInput {
  return {
    status: "in_progress",
    workCompletedAt: null,
    certificate: null,
    signoffStatus: "not_requested",
    signoffDeadline: null,
    signedOffAt: null,
    paymentStatus: null,
    customerType: "individual",
    billingCycle: null,
    anchored: false,
    now: NOW,
    ...overrides,
  };
}

const activeCert = { id: "c1", status: "active", hasBeforePhoto: true, hasAfterPhoto: true };

describe("computeSignoffState — 順序ゲート", () => {
  it("作業未完了なら completion=current, 以降は pending", () => {
    const s = computeSignoffState(base());
    expect(s.steps.completion.state).toBe("current");
    expect(s.steps.certificate.state).toBe("pending");
    expect(s.steps.signature.state).toBe("pending");
    expect(s.currentStep).toBe("completion");
    expect(s.canRequestSignature).toBe(false);
  });

  it("完了済み・証明書なし → certificate=current", () => {
    const s = computeSignoffState(base({ status: "completed" }));
    expect(s.steps.completion.state).toBe("done");
    expect(s.steps.certificate.state).toBe("current");
    expect(s.currentStep).toBe("certificate");
  });

  it("施工前後写真が欠けている active 証明書は blocked (依頼不可)", () => {
    const s = computeSignoffState(
      base({
        status: "completed",
        certificate: { id: "c1", status: "active", hasBeforePhoto: true, hasAfterPhoto: false },
      }),
    );
    expect(s.steps.certificate.state).toBe("blocked");
    expect(s.steps.certificate.detail).toContain("施工後");
    expect(s.canRequestSignature).toBe(false);
    // 写真ゲートで止まっているのでサインには進めない
    expect(s.steps.signature.state).toBe("pending");
  });

  it("draft 証明書で施工前が欠ける → blocked かつ理由に施工前", () => {
    const s = computeSignoffState(
      base({
        status: "completed",
        certificate: { id: "c1", status: "draft", hasBeforePhoto: false, hasAfterPhoto: true },
      }),
    );
    expect(s.steps.certificate.state).toBe("blocked");
    expect(s.steps.certificate.detail).toContain("施工前");
  });

  it("施工前後写真が揃った有効証明書 → certificate=done, signature=current, 依頼可能", () => {
    const s = computeSignoffState(base({ status: "completed", certificate: activeCert }));
    expect(s.steps.certificate.state).toBe("done");
    expect(s.steps.signature.state).toBe("current");
    expect(s.canRequestSignature).toBe(true);
    expect(s.currentStep).toBe("signature");
  });
});

describe("computeSignoffState — サイン状態と SLA", () => {
  it("署名待ち・期限内は overdue=false", () => {
    const s = computeSignoffState(
      base({
        status: "completed",
        certificate: activeCert,
        signoffStatus: "awaiting",
        signoffDeadline: "2026-07-03T12:00:00.000Z",
      }),
    );
    expect(s.overdue).toBe(false);
    expect(s.steps.signature.state).toBe("current");
    expect(s.steps.signature.detail).toContain("署名待ち");
  });

  it("署名待ち・期限超過は overdue=true と警告", () => {
    const s = computeSignoffState(
      base({
        status: "completed",
        certificate: activeCert,
        signoffStatus: "awaiting",
        signoffDeadline: "2026-07-02T00:00:00.000Z", // NOW より前
      }),
    );
    expect(s.overdue).toBe(true);
    expect(s.steps.signature.detail).toContain("超過");
  });

  it("署名済み → signature=done, anchor=current(未アンカー)", () => {
    const s = computeSignoffState(
      base({
        status: "completed",
        certificate: activeCert,
        signoffStatus: "signed",
        signedOffAt: NOW,
      }),
    );
    expect(s.steps.signature.state).toBe("done");
    expect(s.steps.anchor.state).toBe("current");
    expect(s.currentStep).toBe("anchor");
  });

  it("署名済み + アンカー済み → 必須ラインは全 done (currentStep=null)", () => {
    const s = computeSignoffState(
      base({
        status: "completed",
        certificate: activeCert,
        signoffStatus: "signed",
        signedOffAt: NOW,
        anchored: true,
      }),
    );
    expect(s.currentStep).toBeNull();
    expect(s.steps.anchor.state).toBe("done");
  });
});

describe("computeSignoffState — お会計 (顧客区分 × サイクル)", () => {
  it("個人・支払い済み(事前決済) → payment=done", () => {
    const s = computeSignoffState(base({ customerType: "individual", paymentStatus: "paid" }));
    expect(s.steps.payment.state).toBe("done");
  });

  it("個人・未払い(その場)・証明書完了 → payment=current", () => {
    const s = computeSignoffState(
      base({ status: "completed", certificate: activeCert, customerType: "individual", paymentStatus: "unpaid" }),
    );
    expect(s.steps.payment.state).toBe("current");
    expect(s.steps.payment.detail).toContain("その場決済");
  });

  it("法人・合算(consolidated) → payment=deferred (会計不要)", () => {
    const s = computeSignoffState(
      base({ status: "completed", certificate: activeCert, customerType: "corporate", billingCycle: "consolidated" }),
    );
    expect(s.steps.payment.state).toBe("deferred");
    expect(s.steps.payment.detail).toContain("合算");
  });

  it("法人・都度払い(per_job)・証明書完了 → payment=current (会計を挟む)", () => {
    const s = computeSignoffState(
      base({ status: "completed", certificate: activeCert, customerType: "corporate", billingCycle: "per_job" }),
    );
    expect(s.steps.payment.state).toBe("current");
    expect(s.steps.payment.detail).toContain("都度払い");
  });

  it("法人・サイクル未設定 → payment=blocked (設定を促す)", () => {
    const s = computeSignoffState(
      base({ status: "completed", certificate: activeCert, customerType: "corporate", billingCycle: null }),
    );
    expect(s.steps.payment.state).toBe("blocked");
    expect(s.steps.payment.detail).toContain("支払いサイクル");
  });

  it("会計は必須ライン(currentStep)をゲートしない (オンチェーンはサイン時自動)", () => {
    // 法人・都度払いで会計 current でも、サイン済み+アンカー済みなら currentStep は null
    const s = computeSignoffState(
      base({
        status: "completed",
        certificate: activeCert,
        signoffStatus: "signed",
        anchored: true,
        customerType: "corporate",
        billingCycle: "per_job",
        paymentStatus: "unpaid",
      }),
    );
    expect(s.steps.payment.state).toBe("current");
    expect(s.currentStep).toBeNull();
  });
});

describe("computeSignoffDeadline", () => {
  it("依頼時刻 + 24h", () => {
    expect(computeSignoffDeadline("2026-07-03T00:00:00.000Z")).toBe("2026-07-04T00:00:00.000Z");
  });
});
