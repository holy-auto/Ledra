/**
 * LINE 会話フローの送信メッセージ組み立て — 純粋ロジック。
 */

/** LINE quickReply の 1 ボタン (postback アクション)。data は interpret.ts が解釈する。 */
export interface FlowButton {
  label: string;
  /** `flow:<event>[:<arg>]` 形式。 */
  data: string;
}

export interface FlowButtonMessage {
  text: string;
  buttons: FlowButton[];
}

/**
 * 正式見積りのための詳細情報 (車検証写真 or 車種+年式) を依頼する文面。
 *
 * 概算見積りを送らなかった (rough-estimate opt-in OFF の) ケースの入口メッセージ。
 * 概算を送った直後は文面が矛盾する (概算は「詳細はご来店で」/ こちらは「送れば
 * 見積り送付」) ため、呼び出し側で概算送信済みなら本フロー開始をスキップする。
 */
export function buildQuoteDetailAsk(): string {
  return [
    "【正式なお見積りについて】",
    "より正確なお見積りをお出しするために、下記のいずれかを教えていただけますか？",
    "",
    "◯ 車検証のお写真（このトークに送信してください）",
    "◯ または「車種・年式」（例: アルファード 2022年式）",
    "",
    "いただいた情報をもとに担当が正式なお見積りをお作りしてお送りします。",
  ].join("\n");
}

/**
 * 詳細を受領し正式見積書の下書きを用意したことの顧客向けお礼・案内。
 * 送付そのものはスタッフが内容確認のうえ行う (壁3) ため「担当より」と明示する。
 */
export function buildFormalQuoteComingAck(): string {
  return [
    "ありがとうございます。いただいた内容で正式なお見積りをお作りしています。",
    "担当が確認のうえ、こちらのトークにお見積りをお送りしますので少々お待ちください。",
  ].join("\n");
}

/**
 * 正式見積書を送付した直後に、内容でよいか (可否) をボタンで尋ねる。
 * スタッフが draft→sent に確定した時点で送る。
 */
export function buildQuoteApprovalAsk(): FlowButtonMessage {
  return {
    text: [
      "お見積りをお送りしました。内容はいかがでしょうか？",
      "このお見積りで進めてよろしければ「はい」、ご相談されたい場合は「相談する」をお選びください。",
    ].join("\n"),
    buttons: [
      { label: "はい、お願いします", data: "flow:yes" },
      { label: "相談する", data: "flow:no" },
    ],
  };
}

/** 可否で OK をもらい、次段 (日程調整) へ進むことを伝える案内。 */
export function buildScheduleHandoff(): string {
  return [
    "ありがとうございます。それでは作業日程のご相談に進みます。",
    "代車の空き状況とあわせて、担当より日程の候補をご連絡いたします。少々お待ちください。",
  ].join("\n");
}

/** 「相談する」(NG) を受けてスタッフ対応に切り替える案内。 */
export function buildQuoteConsultHandoff(): string {
  return [
    "承知いたしました。内容について担当よりご連絡し、ご相談させていただきます。",
    "ご不明な点やご希望があれば、このトークにお書きくださいませ。",
  ].join("\n");
}
