/**
 * LINE 会話フローの送信メッセージ組み立て — 純粋ロジック。
 */
import type { FlowScheduleCandidate } from "./scheduleCandidates";
import type { RecommendedOption } from "@/lib/ai/optionRecommend";

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
 * ナレッジ自動返信の末尾に添える「次の行動」誘導ボタン。会話フロー opt-in 済み
 * テナントのみ添付する (postback を handleFlowPostback が状態非依存で捌けるため)。
 *   - `flow:start_quote` … 見積りフロー (awaiting_quote_detail) を開始
 *   - `flow:consult`     … スタッフ引き継ぎ (human_takeover) + 通知
 * どちらも interpret.ts の状態遷移ではなく、conversationFlowPostback が直接処理する。
 */
export function buildFollowupButtons(): FlowButton[] {
  return [
    { label: "お見積りをお願いしたい", data: "flow:start_quote" },
    { label: "スタッフに相談したい", data: "flow:consult" },
  ];
}

/**
 * 施工内容が不明な入口 (FAQ後の「お見積り」ボタン等) で、施工内容 **と** 車両を
 * まとめて依頼する文面。buildQuoteDetailAsk は車両しか聞かないため、元問い合わせに
 * 施工内容が無いフローでこれを使わないと、車両だけ返ってきて正式見積りに進めない
 * (maybeAdvanceQuoteFlowOnDetail は service と vehicle の両方を要求する)。
 *
 * 車検証の「写真」は求めない: awaiting_quote_detail 中の画像は OCR フロー
 * (handleVehiclePhotoMessage は awaiting_vehicle_photo 専用) に配線されておらず、
 * 送られてもスタッフ記録止まりでフローが進まないため。テキストで受け取れる項目のみ聞く。
 */
export function buildQuoteDetailAskWithService(): string {
  return [
    "【お見積りについて】",
    "正式なお見積りをお作りするために、下記をこのトークにご返信ください。",
    "",
    "① ご希望の施工内容（例: ボディコーティング、キズ・へこみ修理 など）",
    "② お車の「車種・年式」（例: アルファード 2022年式）",
    "",
    "いただいた内容をもとに担当が正式なお見積りをお作りしてお送りします。",
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

/**
 * 可否で OK をもらったが、空き日程候補が 1 件も見つからなかったときの案内
 * (スタッフに引き継ぐ)。
 */
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

/** YYYY-MM-DD → "7/20(月)" 形式。曜日はローカル正午基準で算出 (日付跨ぎの TZ 揺れ回避)。 */
function formatDateJa(date: string): string {
  const [, mStr, dStr] = date.split("-");
  const w = ["日", "月", "火", "水", "木", "金", "土"][new Date(`${date}T12:00:00`).getDay()];
  return `${Number(mStr)}/${Number(dStr)}(${w})`;
}

/** "HH:MM:SS" / "HH:MM" → "HH:MM"。 */
function formatTimeShort(t: string): string {
  return t.slice(0, 5);
}

/**
 * 見積りOKの直後に、おすすめオプションをボタンで提示する (Phase 2)。
 * 「オプションなしで進める」で内容を変えずに日程調整へ進める。
 */
export function buildOptionRecommendAsk(options: RecommendedOption[]): FlowButtonMessage {
  return {
    text: [
      "ありがとうございます！あわせて、こちらのオプションはいかがでしょうか？",
      ...options.map((o) => `◯ ${o.name}（+¥${o.price.toLocaleString("ja-JP")}）— ${o.reason}`),
      "",
      "追加をご希望の場合はボタンからお選びください（不要な場合はそのまま進められます）。",
    ].join("\n"),
    buttons: [
      ...options.map((o, i) => ({
        label: `追加する: ${o.name.slice(0, 16)}`,
        data: `flow:option:${i}`,
      })),
      { label: "オプションなしで進める", data: "flow:options_none" },
    ],
  };
}

/**
 * オプション追加を受け付けたことの案内。見積り更新→スタッフ再送→最終OKへ続く。
 * 見積書の再送そのものはスタッフが行う (壁3) ため「担当より」と明示する。
 */
export function buildOptionAddedAck(option: RecommendedOption): string {
  return [
    `「${option.name}」を追加したお見積りをお作りしています。`,
    "担当が確認のうえ、更新後のお見積りをこちらのトークにお送りしますので少々お待ちください。",
  ].join("\n");
}

/**
 * オプション追加後の更新見積りを送付した直後に、最終OKをボタンで尋ねる。
 * `buildQuoteApprovalAsk` と同じ postback (yes/no) を使うため文面のみ差し替える。
 */
export function buildFinalQuoteApprovalAsk(): FlowButtonMessage {
  return {
    text: [
      "オプションを反映したお見積りをお送りしました。この内容でよろしいでしょうか？",
      "このお見積りで進めてよろしければ「はい」、ご相談されたい場合は「相談する」をお選びください。",
    ].join("\n"),
    buttons: [
      { label: "はい、お願いします", data: "flow:yes" },
      { label: "相談する", data: "flow:no" },
    ],
  };
}

/**
 * 可否 OK かつ空き日程候補が見つかったときに、候補をボタンで提示する。
 * 「その他の日程を相談する」は既存の cancel postback (→ handoff) を再利用する。
 */
export function buildScheduleCandidatesAsk(candidates: FlowScheduleCandidate[]): FlowButtonMessage {
  return {
    text: [
      "ありがとうございます！作業日程の候補をご案内します。",
      "ご都合の良い日時をお選びください（合わなければ「その他の日程を相談する」からどうぞ）。",
    ].join("\n"),
    buttons: [
      ...candidates.map((c, i) => ({
        label: `${formatDateJa(c.date)} ${formatTimeShort(c.start_time)}〜`,
        data: `flow:slot:${i}`,
      })),
      { label: "その他の日程を相談する", data: "flow:cancel" },
    ],
  };
}

/** 選択した日程が (別のお客様と重なる等で) 直前に埋まってしまったときの案内。 */
export function buildScheduleConflictHandoff(): string {
  return [
    "申し訳ございません、ご選択いただいた日時はちょうど埋まってしまったようです。",
    "担当より改めて日程のご相談をさせていただきますので、少々お待ちください。",
  ].join("\n");
}

/** 予約確定 (お礼) の案内。フローのクローズ文面。 */
export function buildReservationConfirmed(candidate: FlowScheduleCandidate): string {
  return [
    "ご予約が確定いたしました。",
    `📅 ${formatDateJa(candidate.date)} ${formatTimeShort(candidate.start_time)}〜${formatTimeShort(candidate.end_time)}`,
    "",
    "ご来店を心よりお待ちしております。ありがとうございました！",
  ].join("\n");
}

/**
 * 入庫日の朝、未登録車両の車検証撮影を依頼する文面 (Phase 3)。
 * `awaiting_vehicle_photo` の入口メッセージ。
 */
export function buildVehiclePhotoRequest(): string {
  return [
    "本日はご来店ありがとうございます。",
    "施工証明書の発行のため、お車の車検証のお写真をこのトークに送信してください。",
    "",
    "（撮影が難しい場合は、そのままご来店いただいても大丈夫です。受付でご案内いたします。）",
  ].join("\n");
}

/** 車検証写真を受け取り車両登録できたときの案内。フローのクローズ文面。 */
export function buildVehiclePhotoRegistered(vehicleLabel: string): string {
  return [
    `車検証を確認し、${vehicleLabel} を登録いたしました。`,
    "ご来店を心よりお待ちしております。ありがとうございました！",
  ].join("\n");
}

/** 車検証写真の読み取りに失敗した/情報が不足していたときのスタッフ引き継ぎ案内。 */
export function buildVehiclePhotoFailedHandoff(): string {
  return [
    "申し訳ございません、お写真から車両情報をうまく読み取れませんでした。",
    "受付にて改めて確認させていただきますので、ご来店の際は車検証をお持ちください。",
  ].join("\n");
}
