/**
 * お客様確認（サインオフ）の進捗を1つの表示状態にまとめる。
 *
 * なぜ要るか: 画面には「未確認」がベタ書きされていて、**依頼していないのか・
 * 依頼したのに確認されていないのか**が区別できなかった。この2つは現場の
 * 次の行動が違う（送る／催促する）ので、分けて出す。
 *
 * 元にするのは `reservations.signoff_*`。**Web と同じ列を見る。**
 * `signature_sessions.expires_at` はリンクの寿命（72時間）で、
 * `signoff_deadline` は依頼のSLA（24時間）—— 別物なので、こちらを使わないと
 * 「Web では超過、タブレットでは未超過」がすれ違う。
 *
 * ponytail: 上限。ここで分かるのは「依頼した」までで、**お客様が開いたか**は
 * 分からない（開封を記録していない）。開封まで見たいなら列を足す必要がある。
 */
export interface SignoffRow {
  /** not_requested | awaiting | signed */
  signoff_status?: string | null;
  signoff_requested_at?: string | null;
  signoff_deadline?: string | null;
  signed_off_at?: string | null;
}

export type ConfirmationTone = "none" | "waiting" | "done" | "problem";

export interface ConfirmationState {
  label: string;
  tone: ConfirmationTone;
  /** 詳細ダイアログに出す一行説明。次にすべきことが分かる文にする */
  detail: string;
}

export function confirmationState(row: SignoffRow | null | undefined, now = new Date()): ConfirmationState {
  if (!row || !row.signoff_status || row.signoff_status === "not_requested") {
    return { label: "未依頼", tone: "none", detail: "お客様への確認依頼はまだ送っていません。" };
  }
  if (row.signoff_status === "signed" || row.signed_off_at) {
    return { label: "確認済み", tone: "done", detail: "お客様が確認しました。" };
  }
  // 期限超過は「待っていても来ない」。Web の computeSignoffState と同じ基準
  if (row.signoff_deadline && new Date(row.signoff_deadline).getTime() < now.getTime()) {
    return { label: "期限超過", tone: "problem", detail: "確認の期限を過ぎています。催促するか、依頼し直してください。" };
  }
  return { label: "依頼済み・未確認", tone: "waiting", detail: "依頼は届いていますが、まだ確認されていません。" };
}
