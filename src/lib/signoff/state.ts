/**
 * 案件サインオフ・ワークフロー — 状態計算 (純関数)
 *
 * 「完了報告 → 証明書発行(施工前後写真) → お客様サイン → お会計 → オンチェーン」
 * の 5 ステップを、予約・証明書・受領サインの現在値から導出する。全業種共通。
 *
 * IO を持たない純関数なので単体テストしやすい。`now` は呼び出し側から注入する
 * (テスト容易性・再現性のため)。
 */

/** 予約側サインオフ状態 (reservations.signoff_status)。 */
export type SignoffStatus = "not_requested" | "awaiting" | "signed";

/** ワークフローの 5 ステップ。 */
export type SignoffStepKey = "completion" | "certificate" | "signature" | "payment" | "anchor";

/**
 * 各ステップの表示状態。
 * - done      : 完了
 * - current   : 現在の実行対象 (次にやること)
 * - blocked   : 前提未達で進めない (理由あり)
 * - pending   : まだ順番が来ていない
 * - optional  : 任意ステップで未実施
 * - deferred  : この案件では実施不要 (会計を合算請求へ回す等)。解決済み扱い。
 */
export type StepState = "done" | "current" | "blocked" | "pending" | "optional" | "deferred";

/** 顧客区分。individual=個人(BtoC) / corporate=法人(BtoB)。 */
export type CustomerType = "individual" | "corporate";

/** 法人の支払いサイクル。per_job=都度払い / consolidated=合算(締め払い)。 */
export type BillingCycle = "per_job" | "consolidated";

export interface SignoffStep {
  key: SignoffStepKey;
  state: StepState;
  /** 進行を妨げている理由 / 補足 (UI 表示用)。 */
  detail?: string;
}

export interface SignoffStateInput {
  /** reservations.status */
  status: string;
  /** reservations.work_completed_at */
  workCompletedAt: string | null;
  /** 案件に紐づく証明書 (無ければ null)。 */
  certificate: {
    id: string;
    /** certificates.status (draft / active / void / expired) */
    status: string;
    hasBeforePhoto: boolean;
    hasAfterPhoto: boolean;
  } | null;
  /** reservations.signoff_status */
  signoffStatus: SignoffStatus;
  /** reservations.signoff_deadline (ISO) */
  signoffDeadline: string | null;
  /** reservations.signed_off_at (ISO) */
  signedOffAt: string | null;
  /** reservations.payment_status (unpaid / paid / partial / refunded / null) */
  paymentStatus: string | null;
  /** 顧客区分 (customers.customer_type)。未取得時は individual 扱い。 */
  customerType: CustomerType;
  /** 法人の支払いサイクル (customers.billing_cycle)。個人・未設定は null。 */
  billingCycle: BillingCycle | null;
  /** 受領サイン or 証明書がオンチェーンにアンカー済みか。 */
  anchored: boolean;
  /** 現在時刻 (ISO)。overdue 判定に使う。 */
  now: string;
}

export interface SignoffState {
  steps: Record<SignoffStepKey, SignoffStep>;
  /** 現在フォーカスすべきステップ。全完了なら null。 */
  currentStep: SignoffStepKey | null;
  /** 署名待ちが SLA(24h) を超過しているか。 */
  overdue: boolean;
  /** 施工前後写真が揃い、受領サイン依頼を発行できる状態か。 */
  canRequestSignature: boolean;
}

/** 完了報告済みか (作業完了)。 */
function isCompleted(input: SignoffStateInput): boolean {
  return input.status === "completed" || !!input.workCompletedAt;
}

/** 証明書が発行済み(有効)かつ施工前後写真が揃っているか。 */
function isCertificateDone(input: SignoffStateInput): boolean {
  const c = input.certificate;
  return !!c && c.status === "active" && c.hasBeforePhoto && c.hasAfterPhoto;
}

/**
 * サインオフ状態を計算する。ステップ間の順序ゲートをここで一元的に定義し、
 * サーバ(依頼ルート)・UI の双方がこの結果を信頼できるようにする。
 */
export function computeSignoffState(input: SignoffStateInput): SignoffState {
  const completed = isCompleted(input);
  const certDone = isCertificateDone(input);
  const cert = input.certificate;

  const overdue =
    input.signoffStatus === "awaiting" &&
    !!input.signoffDeadline &&
    new Date(input.now).getTime() > new Date(input.signoffDeadline).getTime();

  // 施工前後写真が揃い、かつ証明書が有効なら依頼可能。
  const canRequestSignature = !!cert && cert.status === "active" && cert.hasBeforePhoto && cert.hasAfterPhoto;

  // ── ① 完了報告 ──────────────────────────────
  const completion: SignoffStep = {
    key: "completion",
    state: completed ? "done" : "current",
  };

  // ── ② 証明書発行 (施工前後写真) ──────────────
  let certificate: SignoffStep;
  if (!completed) {
    certificate = { key: "certificate", state: "pending" };
  } else if (certDone) {
    certificate = { key: "certificate", state: "done" };
  } else if (!cert) {
    certificate = { key: "certificate", state: "current", detail: "証明書が未発行です。" };
  } else if (cert.status !== "active") {
    // 施工前後写真が欠けていると発行(active)できないケースを含む。
    const missing: string[] = [];
    if (!cert.hasBeforePhoto) missing.push("施工前(入庫時)");
    if (!cert.hasAfterPhoto) missing.push("施工後");
    certificate = {
      key: "certificate",
      state: missing.length ? "blocked" : "current",
      detail: missing.length ? `${missing.join(" と ")}の写真が未添付です。` : "証明書を発行してください。",
    };
  } else {
    // active だが施工前後写真が欠けている → 依頼前に追加を促す。
    const missing: string[] = [];
    if (!cert.hasBeforePhoto) missing.push("施工前(入庫時)");
    if (!cert.hasAfterPhoto) missing.push("施工後");
    certificate = {
      key: "certificate",
      state: "blocked",
      detail: `${missing.join(" と ")}の写真が未添付です。追加すると次へ進めます。`,
    };
  }

  // ── ③ お客様サイン (必須 / 不在時 24h) ────────
  let signature: SignoffStep;
  if (input.signoffStatus === "signed") {
    signature = { key: "signature", state: "done" };
  } else if (input.signoffStatus === "awaiting") {
    signature = {
      key: "signature",
      state: "current",
      detail: overdue ? "サイン期限(24h)を超過しています。お客様へ再度ご連絡ください。" : "お客様の署名待ちです。",
    };
  } else if (certDone) {
    signature = { key: "signature", state: "current", detail: "受領サインを依頼してください。" };
  } else {
    signature = { key: "signature", state: "pending" };
  }

  // ── ④ お会計 (顧客区分 × 支払いサイクルで自動判定) ──
  //   個人(事前決済=paid) / 法人合算 → 会計不要
  //   個人その場 / 法人都度 → 会計を挟む
  //   法人でサイクル未設定 → ブロック (顧客管理で設定を促す)
  // オンチェーンはサイン時に自動発火するため、会計はここをゲートしない
  // (会計判定は締め作業として並行)。
  const paid = input.paymentStatus === "paid";
  const isCorporate = input.customerType === "corporate";
  let payment: SignoffStep;
  if (paid) {
    payment = { key: "payment", state: "done", detail: "入金済み。" };
  } else if (isCorporate && !input.billingCycle) {
    payment = {
      key: "payment",
      state: "blocked",
      detail: "この法人顧客の支払いサイクルが未設定です。顧客管理で設定してください。",
    };
  } else if (isCorporate && input.billingCycle === "consolidated") {
    payment = {
      key: "payment",
      state: "deferred",
      detail: "合算(締め払い)契約のため、この案件では会計不要です。後日まとめて請求します。",
    };
  } else {
    // 法人 都度払い or 個人 その場決済 → 会計を実施
    payment = {
      key: "payment",
      state: certDone ? "current" : "pending",
      detail: isCorporate
        ? "都度払い契約です。お会計 (POS) を実施してください。"
        : "その場決済 または 事前決済を確認してください。",
    };
  }

  // ── ⑤ オンチェーン (自動) ─────────────────────
  const anchor: SignoffStep = {
    key: "anchor",
    state: input.anchored ? "done" : input.signoffStatus === "signed" ? "current" : "pending",
    detail: input.anchored ? undefined : "署名後に自動でブロックチェーンへ記録されます。",
  };

  const steps: Record<SignoffStepKey, SignoffStep> = {
    completion,
    certificate,
    signature,
    payment,
    anchor,
  };

  // 現在フォーカス: 会計(任意)は current 判定から除外し、必須ラインで最初に
  // done でないステップを選ぶ。全部片付いていれば null。
  const order: SignoffStepKey[] = ["completion", "certificate", "signature", "anchor"];
  const currentStep = order.find((k) => steps[k].state !== "done") ?? null;

  return { steps, currentStep, overdue, canRequestSignature };
}

/** 依頼時刻から SLA 期限 (24h) を計算する。 */
export const SIGNOFF_DEADLINE_HOURS = 24;

export function computeSignoffDeadline(requestedAtIso: string): string {
  return new Date(new Date(requestedAtIso).getTime() + SIGNOFF_DEADLINE_HOURS * 60 * 60 * 1000).toISOString();
}
