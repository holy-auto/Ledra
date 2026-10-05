/**
 * 帳票メールの失敗理由（document_share_log.error_message に残るプロバイダの生エラー）を
 * 画面・通知向けの日本語にする。生の理由は診断用に DB へそのまま残し、表示だけ言い換える。
 *
 * ponytail: 実際に本番で出た/出うる理由だけを拾う。それ以外は汎用文言に落ちる。
 */
export function describeEmailError(raw: string | null | undefined): string {
  const s = raw ?? "";
  // 2026-09-13 本番: resend(403):{"message":"The ledra.co.jp domain is not verified. ..."}
  if (/domain is not verified/i.test(s)) {
    return "送信元ドメインがメール配信サービスで未認証のため送れませんでした（運営側の設定が必要です）";
  }
  if (/RESEND_API_KEY|RESEND_FROM/.test(s)) {
    return "メール送信の設定が未完了のため送れませんでした（運営側の設定が必要です）";
  }
  if (/\((401|403)\)/.test(s)) {
    return "メール配信サービスの認証に失敗したため送れませんでした（運営側の設定が必要です）";
  }
  return "メールを送信できませんでした";
}
