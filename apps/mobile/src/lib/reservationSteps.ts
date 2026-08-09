// 予約作成フローの「入力進捗」を状態から導出する純ロジック。
// UI 非依存（react-native を import しない）なので単体で検証できる。

export type ReservationMode = "scheduled" | "walk_in";

export interface ReservationStepInput {
  mode: ReservationMode;
  hasCustomer: boolean;
  hasVehicle: boolean;
  hasMenu: boolean;
}

export interface StepDef {
  key: "customer" | "vehicle" | "menu" | "confirm";
  label: string;
}

// モード別のステップ定義。
// - 予約(scheduled): 顧客 → 車両 → メニュー → 確認
// - 飛び込み(walk_in): 顧客・車両は任意なのでステップから外し、メニュー → 確認 の2段。
// ponytail: 日時はデフォルト値(現在時刻)が常に入っており「常に完了」表示になって
//   進捗の意味を成さないため、あえてステップに含めない。必須化するならここに追加する。
export function reservationSteps(mode: ReservationMode): StepDef[] {
  if (mode === "walk_in") {
    return [
      { key: "menu", label: "メニュー" },
      { key: "confirm", label: "確認" },
    ];
  }
  return [
    { key: "customer", label: "顧客" },
    { key: "vehicle", label: "車両" },
    { key: "menu", label: "メニュー" },
    { key: "confirm", label: "確認" },
  ];
}

// 現在のステップ(0始まり) = 先頭から見て最初に未完了のステップ。
// すべて完了していれば最後の「確認」ステップを指す。
export function reservationCurrentStep(input: ReservationStepInput): number {
  const steps = reservationSteps(input.mode);
  const done: Record<StepDef["key"], boolean> = {
    customer: input.hasCustomer,
    vehicle: input.hasVehicle,
    menu: input.hasMenu,
    // 確認ステップは自動完了しない。手前がすべて済んだときにだけ「現在」になる。
    confirm: false,
  };
  for (let i = 0; i < steps.length; i++) {
    if (!done[steps[i].key]) return i;
  }
  return steps.length - 1;
}
