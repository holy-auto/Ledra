/**
 * LINE 会話フローの送信メッセージ組み立て — 純粋ロジック。
 *
 * Phase 1a は「概算見積り後に詳細を聞いて会話を継続する」ための詳細依頼文のみ。
 * 以降のフェーズ (OK/NG 確認・日程提示・支払方法) の文面とボタンはフェーズ実装時に
 * ここへ足す。UI は LINE ボタン (quickReply) を主にする方針。
 */

/** LINE quickReply の 1 ボタン (postback アクション)。data は interpret.ts が解釈する。 */
export interface FlowQuickReplyButton {
  label: string;
  /** `flow:<event>[:<arg>]` 形式。 */
  data: string;
}

export interface FlowMessage {
  text: string;
  buttons?: FlowQuickReplyButton[];
}

/**
 * 正式見積りのための詳細情報 (車検証写真 or 車種+年式) を依頼する。
 * 概算見積りを送った後の「続き」として送る。
 */
export function buildQuoteDetailAsk(): FlowMessage {
  return {
    text: [
      "【正式なお見積りについて】",
      "より正確なお見積りをお出しするために、下記のいずれかを教えていただけますか？",
      "",
      "◯ 車検証のお写真（このトークに送信してください）",
      "◯ または「車種・年式」（例: アルファード 2022年式）",
      "",
      "いただいた情報をもとに担当が正式なお見積りをお作りしてお送りします。",
    ].join("\n"),
  };
}
