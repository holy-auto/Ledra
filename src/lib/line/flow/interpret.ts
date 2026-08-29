/**
 * 受信内容 (LINE ボタン postback / テキスト) → フローイベントの判定 — 純粋ロジック。
 *
 * 設計方針: UI は LINE ボタン (postback) を主にする。postback の data は
 * `flow:<event>[:<arg>]` 形式に固定し、確実に分岐する。ボタンを使わず自由文で
 * 返してくる顧客に備え、YES/NO 状態ではキーワードでフォールバック判定する。
 *
 * ここでは AI 分類は使わない (ボタン + 決定的キーワードで十分・安全・テスト可能)。
 * 判定できない自由文は null を返し、engine 側でスタッフ引き継ぎ or 聞き返しにする。
 */
import type { FlowEvent, FlowState } from "./states";

/** postback data の接頭辞。リッチメニュー等の別 postback と会話フローを区別する。 */
export const FLOW_POSTBACK_PREFIX = "flow:";

const YES_PATTERN = /^(はい|ok|okです|お願い|おねがい|大丈夫|だいじょうぶ|よろしく|承知|進めて|了解|うん|yes|👍)/i;
const NO_PATTERN = /(いいえ|やめ|キャンセル|不要|結構です|遠慮|見送|やっぱり|no|❌)/i;

/** postback data を `flow:<event>[:<arg>]` として解析する。会話フロー用でなければ null。 */
export function parseFlowPostback(data: string | null | undefined): { event: string; arg?: string } | null {
  if (!data || !data.startsWith(FLOW_POSTBACK_PREFIX)) return null;
  const rest = data.slice(FLOW_POSTBACK_PREFIX.length);
  const [event, ...argParts] = rest.split(":");
  if (!event) return null;
  return { event, arg: argParts.length ? argParts.join(":") : undefined };
}

/**
 * postback の arg を提示済み候補配列への添字として解釈する。数値でなければ null
 * (想定外の postback としてフロー処理をスキップさせる)。
 * `Number("") === 0` になる罠があるため、空文字は先に弾く。
 */
function parseCandidateIndex(arg: string | undefined): number | null {
  if (!arg) return null;
  const index = Number(arg);
  if (!Number.isInteger(index) || index < 0) return null;
  return index;
}

/**
 * 現在状態と受信内容 (postback 優先、無ければテキスト) からフローイベントを判定する。
 * 判定不能なら null。
 */
export function interpretReply(
  state: FlowState,
  input: { postbackData?: string | null; text?: string | null },
): FlowEvent | null {
  // 1) ボタン (postback) を最優先。
  const pb = parseFlowPostback(input.postbackData);
  if (pb) {
    switch (pb.event) {
      case "yes":
        return { type: "yes" };
      case "no":
        return { type: "no" };
      case "registered":
        return { type: "registered" };
      case "option": {
        // `flow:option:<index>` — index は提示したオプション候補配列への添字。
        const index = parseCandidateIndex(pb.arg);
        return index === null ? null : { type: "option_selected", index };
      }
      case "options_none":
        return { type: "options_none" };
      case "slot": {
        // `flow:slot:<index>` — index は提示した候補配列への添字。
        const index = parseCandidateIndex(pb.arg);
        return index === null ? null : { type: "slot_selected", index };
      }
      case "cancel":
        return { type: "handoff" };
      case "cancel_pick": {
        // `flow:cancel_pick:<index>` — index はキャンセル対象予約配列への添字。
        const index = parseCandidateIndex(pb.arg);
        return index === null ? null : { type: "cancel_pick_selected", index };
      }
      case "cancel_confirm":
        return { type: "cancel_confirmed" };
      case "cancel_abort":
        return { type: "cancel_aborted" };
      case "reschedule_pick": {
        // `flow:reschedule_pick:<index>` — index は変更対象予約配列への添字。
        const index = parseCandidateIndex(pb.arg);
        return index === null ? null : { type: "reschedule_pick_selected", index };
      }
      case "reschedule_slot": {
        // `flow:reschedule_slot:<index>` — index は新日程候補配列への添字。
        const index = parseCandidateIndex(pb.arg);
        return index === null ? null : { type: "reschedule_slot_selected", index };
      }
      default:
        return null;
    }
  }

  // 2) テキストのフォールバック — YES/NO を待っている状態でのみキーワード判定する。
  const text = (input.text ?? "").trim();
  if (!text) return null;
  const yesNoStates: FlowState[] = ["awaiting_quote_ok", "awaiting_final_ok"];
  if (yesNoStates.includes(state)) {
    // NO を先に見る (「はい、でもキャンセルで」のような打ち消しを NG 優先で拾う)。
    if (NO_PATTERN.test(text)) return { type: "no" };
    if (YES_PATTERN.test(text)) return { type: "yes" };
  }
  return null;
}
