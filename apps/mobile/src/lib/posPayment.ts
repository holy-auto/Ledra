/**
 * POS の支払方法まわりの決まりごと。**会計画面（予約）とウォークインの両方**が使う。
 *
 * なぜ切り出したか: 2画面に同じ判定が丸ごと重複していた。実際、
 * Tap to Pay の二重計上は片方の画面にだけあり、QR をカードとして記録する
 * 不具合も片方だけだった。**片方だけ直る事故**を構造で止める。
 */
export type PaymentMethod = "cash" | "card" | "qr" | "bank_transfer";

export interface DeviceKind {
  isIPhone: boolean;
  isIPad: boolean;
  isAndroid: boolean;
}

/**
 * 支払方法の選択肢。端末で出せる決済手段が違う。
 * - iPhone: Tap to Pay が使えるので「カード」と「QR」を分ける
 * - iPad / Android: カード決済は QR（Stripe Checkout）経由なので「QR決済」1本
 */
export function paymentSegments(device: DeviceKind): { value: PaymentMethod; label: string }[] {
  if (device.isIPhone) {
    return [
      { value: "cash", label: "現金" },
      { value: "card", label: "カード" },
      { value: "qr", label: "QR" },
      { value: "bank_transfer", label: "振込" },
    ];
  }
  return [
    { value: "cash", label: "現金" },
    { value: "card", label: "QR決済" },
    { value: "bank_transfer", label: "振込" },
  ];
}

/**
 * QR（Stripe Checkout のリンクを読ませる）経路か。
 * iPad / Android の「カード」は実体が QR 決済で、iPhone の「QR」も QR。
 * iPhone の「カード」だけが Tap to Pay。
 */
export function isQrFlow(device: DeviceKind, method: PaymentMethod): boolean {
  if (device.isIPhone) return method === "qr";
  return method === "card";
}

/** iPhone の Tap to Pay 経路か */
export function isTapToPayFlow(device: DeviceKind, method: PaymentMethod): boolean {
  return device.isIPhone && method === "card";
}

/** Stripe Terminal が動作中（画面のボタンを止める条件） */
export function isTerminalBusy(paymentStatus: string | null | undefined): boolean {
  return (
    paymentStatus === "creating" ||
    paymentStatus === "collecting" ||
    paymentStatus === "processing" ||
    paymentStatus === "capturing"
  );
}
