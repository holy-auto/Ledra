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
  | "awaiting_vehicle_photo" // 未登録車両の入庫日、車検証撮影待ち (商談フローとは別の後続フロー)
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
  | { type: "option_selected"; index: number } // オプション選択 (提示した候補配列の index)
  | { type: "options_none" } // オプション不要 (提示された候補をどれも選ばない)
  | { type: "slot_selected"; index: number } // 日程スロット選択 (提示した候補配列の index)
  | { type: "photo_received" } // 車検証などの画像を受領 (postback/text とは別経路で IO 層が検知)
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
      // 「はい」でオプション確認 [D] へ。おすすめオプションが 1 件も無い場合は
      // エンジン側が [D] を素通りして直接 [F] 日程候補提示へ進める
      // (ponytail: 候補ゼロ件の判定はここでは分からない実行時情報のため、エンジンの
      // 責務にする。天井: 状態機械上は必ず [D] を経由する体で定義している)。
      if (event.type === "yes") return "awaiting_option_confirm";
      if (event.type === "no") return "human_takeover";
      return null;
    case "awaiting_option_confirm":
      // ponytail: オプション選択 → 見積書を更新していったん [B] (quote_drafted) に
      // 戻す (再送はスタッフの draft→sent 操作を経る。壁3 維持)。その後 [B] からは
      // 通常どおり quote_sent イベントで進むが、実装 (IO 層) は context の
      // selected_options が非空なら [C] ではなく [E] (最終確認) へ進める —
      // この分岐は state+event だけでなく context (実行時情報) に依存するため、
      // 純粋な本関数では表現できない。天井: quote_drafted の遷移を context 引数
      // 込みにしない限りここは実装との対応が完全には取れない (詳細は
      // conversationFlowPostback.ts の maybeAdvanceFlowOnQuoteSent を参照)。
      // オプション不要 → 内容は変わらないため再確認を挟まず直接 [F] へ
      // (「はい」の直後にまた「はい」を聞く冗長さを避ける、意図的な近道)。
      if (event.type === "option_selected") return "quote_drafted";
      if (event.type === "options_none") return "awaiting_schedule_pick";
      return null;
    case "awaiting_final_ok":
      if (event.type === "yes") return "awaiting_schedule_pick";
      if (event.type === "no") return "human_takeover";
      return null;
    case "awaiting_schedule_pick":
      return event.type === "slot_selected" ? "scheduled" : null;
    case "scheduled":
      return null; // engine が closed に落とす
    case "awaiting_vehicle_photo":
      // 画像は postback/text とは別経路 (IO 層が画像メッセージを直接検知) で届くため、
      // interpretReply からはこのイベントは発行されない。OCR 成功時にクローズする
      // 遷移だけを純関数側の記録として残す。
      return event.type === "photo_received" ? "closed" : null;
    default:
      return null;
  }
}
