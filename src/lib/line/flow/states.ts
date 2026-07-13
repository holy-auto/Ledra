/**
 * LINE 会話フローの状態機械 — 純粋ロジック (DB / LINE / AI 非依存)。
 *
 * 設計書: docs/internal/line-conversational-flow-design-2026-07.md §3。
 * 状態と遷移だけをここに定義し、副作用 (見積り下書き作成・日程提示・予約作成・
 * LINE 送信) は呼び出し側 (engine.ts) が状態に応じて実行する。
 *
 * DB (line_conversation_flows.state) には下の文字列がそのまま入る。値の rename は
 * 移行を伴うので不可。追加は自由。
 */

export type FlowState =
  | "awaiting_registration" // [A0] 未登録の新規客に登録を促し中
  | "awaiting_quote_detail" // [A]  車検証写真 or 車種+年式 を依頼中
  | "quote_drafted" // [B]  正式見積書 draft 作成済 (スタッフが送付)
  | "awaiting_quote_ok" // [C]  見積り送付済、OK/NG 待ち
  | "awaiting_option_confirm" // [D]  基本OK、オプション確認中
  | "awaiting_final_ok" // [E]  最終見積り送付済、最終OK待ち
  | "awaiting_schedule_pick" // [F]  代車空き+作業日候補を提示、選択待ち
  | "scheduled" // [G]  予約確定 (商談クローズ)
  | "human_takeover" // スタッフ引き継ぎ (自動進行停止)
  | "closed" // 正常終了
  | "expired"; // 放置失効

/** フロー中に起こりうるイベント (interpret.ts が受信内容から判定する)。 */
export type FlowEvent =
  | { type: "registered" } // 顧客登録 (本人確認) 完了
  | { type: "detail_provided" } // 車検証/車種+年式 を受領
  | { type: "quote_sent" } // スタッフが正式見積書を送付 (draft→sent)
  | { type: "yes" } // 肯定 (OK)
  | { type: "no" } // 否定 (NG)
  | { type: "option_selected" } // オプション選択
  | { type: "slot_selected"; index: number } // 日程スロット選択 (提示した候補配列の index)
  | { type: "handoff" }; // 想定外/NG → スタッフ引き継ぎ

/** 終端状態か (これ以上自動では進めない)。 */
export function isTerminal(state: FlowState): boolean {
  return state === "closed" || state === "expired" || state === "human_takeover";
}

/**
 * 現在状態 + イベント → 次状態。定義の無い遷移は null (何もしない)。
 *
 * `handoff` はどの非終端状態からでも human_takeover へ落とす (NG・想定外の共通口)。
 * scheduled は engine が即 closed にする (お礼文送信の後) が、状態としては分けて
 * 「予約確定済み」を可視化する。
 */
export function nextFlowState(state: FlowState, event: FlowEvent): FlowState | null {
  if (isTerminal(state)) return null;
  if (event.type === "handoff") return "human_takeover";

  switch (state) {
    case "awaiting_registration":
      return event.type === "registered" ? "awaiting_quote_detail" : null;
    case "awaiting_quote_detail":
      return event.type === "detail_provided" ? "quote_drafted" : null;
    case "quote_drafted":
      return event.type === "quote_sent" ? "awaiting_quote_ok" : null;
    case "awaiting_quote_ok":
      // ponytail: Phase 2 (オプション提案) 未実装のため、確認ステップを飛ばして直接
      // [F] 日程候補提示へ進む (エンジンは候補ゼロ件なら human_takeover にフォール
      // バックする)。天井: awaiting_option_confirm には遷移しない。Phase 2 実装時は
      // ここを "awaiting_option_confirm" に差し替える。
      if (event.type === "yes") return "awaiting_schedule_pick";
      if (event.type === "no") return "human_takeover";
      return null;
    case "awaiting_option_confirm":
      return event.type === "option_selected" ? "awaiting_final_ok" : null;
    case "awaiting_final_ok":
      if (event.type === "yes") return "awaiting_schedule_pick";
      if (event.type === "no") return "human_takeover";
      return null;
    case "awaiting_schedule_pick":
      return event.type === "slot_selected" ? "scheduled" : null;
    case "scheduled":
      return null; // engine が closed に落とす
    default:
      return null;
  }
}
