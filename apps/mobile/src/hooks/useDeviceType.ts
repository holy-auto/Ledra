import { Platform } from "react-native";

/**
 * 端末の種別。POS の会計画面とウォークイン画面が支払方法の構成を決めるのに使う。
 *
 * ponytail: ウィンドウ幅ではなく `Platform.isPad`（端末固有の事実）で判定する。
 * 幅で判定すると iPad の Split View 中に isIPad が反転し、選択済みの
 * paymentMethod が構成から消える（例: "qr" のまま iPad 構成になると
 * QR を出さずに p_payment_method: "qr" で記帳される）。
 * さらに幅判定は初回レンダーで必ず isIPhone に倒れるので、iPad で
 * Tap to Pay の初期化が走ってしまう（会計画面の旧実装が実際そうだった）。
 * 見た目の列数が要るときは別途ウィンドウ幅から決めること。
 */
export function useDeviceType() {
  const os = Platform.OS;
  const isIPad = os === "ios" && Platform.isPad;
  return {
    isIPhone: os === "ios" && !isIPad,
    isIPad,
    isAndroid: os === "android",
  };
}
