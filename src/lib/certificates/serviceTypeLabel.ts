/**
 * 施工種別の表示ラベル。
 *
 * 元は getPassportData.ts に同居していたが、そこはサーバ専用（read replica を
 * 掴む）なのでクライアントコンポーネントから import できない。ラベルだけを
 * ここへ出して、受発注画面など client 側からも同じ表記を使えるようにする。
 * getPassportData は互換のためこれを再 export している。
 */
export function getServiceTypeLabel(serviceType: string | null): string {
  switch (serviceType) {
    case "ppf":
      return "PPF施工";
    case "coating":
      return "コーティング";
    case "body_repair":
      return "鈑金塗装";
    case "maintenance":
      return "車両整備";
    case "wrapping":
      return "ラッピング";
    default:
      return serviceType ?? "施工";
  }
}
