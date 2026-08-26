/**
 * お客様確認（signature_sessions）の進捗を1つの表示状態にまとめる。
 *
 * なぜ要るか: 画面には「未確認」がベタ書きされていて、**送っていないのか・
 * 届いたのに確認されていないのか**が区別できなかった。この2つは現場の
 * 次の行動が違う（送る／催促する）ので、分けて出す。
 *
 * ponytail: 上限。ここで分かるのは「送った」までで、**お客様が開いたか**は
 * 分からない（開封を記録していない）。開封まで見たいなら列を足す必要がある。
 */
export interface ConfirmationRow {
  status?: string | null;
  notification_sent_at?: string | null;
  signed_at?: string | null;
  expires_at?: string | null;
}

export type ConfirmationTone = "none" | "waiting" | "done" | "problem";

export interface ConfirmationState {
  label: string;
  tone: ConfirmationTone;
  /** 詳細ダイアログに出す一行説明。次にすべきことが分かる文にする */
  detail: string;
}

export function confirmationState(row: ConfirmationRow | null | undefined, now = new Date()): ConfirmationState {
  if (!row) {
    return { label: "未送信", tone: "none", detail: "お客様への確認依頼はまだ送っていません。" };
  }
  if (row.signed_at) {
    return { label: "確認済み", tone: "done", detail: "お客様が確認しました。" };
  }
  if (row.status === "cancelled") {
    return { label: "取消", tone: "problem", detail: "確認依頼は取り消されています。送り直してください。" };
  }
  // 期限切れは「待っていても来ない」。催促ではなく送り直しが要る
  if (row.expires_at && new Date(row.expires_at).getTime() < now.getTime()) {
    return { label: "期限切れ", tone: "problem", detail: "確認の期限が切れています。送り直してください。" };
  }
  if (row.notification_sent_at) {
    return { label: "送信済み・未確認", tone: "waiting", detail: "届いていますが、まだ確認されていません。" };
  }
  return { label: "未送信", tone: "none", detail: "確認依頼は作成済みですが、まだ送っていません。" };
}
