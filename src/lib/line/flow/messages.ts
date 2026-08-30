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
 * 入口は2つ: (1) 概算を送らなかったケースで inboundAuto が直接フロー開始する経路、
 * (2) 概算返信に添えた「お見積りをお願いしたい」ボタン (flow:start_quote) を顧客が
 * タップする経路。概算返信は誘導ボタン添付時に締めの文面を「正式はLINEで承ります
 * （車検証でより正確に）」に揃える (buildRoughEstimateMessage の canContinueOnLine) ため、
 * このメッセージ（車検証等で精度を上げる案内）と矛盾しない。概算送信直後の**自動**
 * フロー開始は従来どおりスキップし (二重送信回避)、続きはボタンのタップに委ねる。
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
 * 見積り詳細待ち (awaiting_quote_detail) のまま一定時間ご返信が無いお客様への、
 * 失効前の「再促し (nudge)」。1会話につき1回だけ送る (cron・flowNudges.ts)。
 * 催促にならないやわらかい文面で、車検証写真 or 車種+年式のどちらでも返せる旨を再掲する。
 */
export function buildQuoteDetailNudge(): string {
  return [
    "その後、お見積りのご検討はいかがでしょうか？",
    "正式なお見積りをお作りできますので、下記のいずれかをこのトークにお送りください。",
    "",
    "◯ 車検証のお写真",
    "◯ または「車種・年式」（例: アルファード 2022年式）",
    "",
    "ご不明な点があれば、このままご返信ください。",
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
 * 車検証写真から車両は読み取れたが、施工内容がまだ分からない (FAQ ボタン起点等) ときに、
 * 車両を確認済みと伝えたうえで施工内容だけを尋ねる文面。写真から得た車両は context に保持する。
 */
export function buildQuoteServiceAskAfterPhoto(vehicleText: string): string {
  return [
    `車検証を確認しました（${vehicleText}）。ありがとうございます。`,
    "お見積りのため、ご希望の施工内容をこのトークにご返信ください（例: ボディコーティング、キズ・へこみ修理 など）。",
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

/** キャンセル対象予約の表示に必要な最小形。listReservationsForCustomer の行から作れる。 */
export interface CancelTargetReservation {
  id: string;
  scheduled_date: string;
  start_time: string | null;
  title: string | null;
  /** 実所要時間(分)。日程変更で変更先候補を絞り、元予約の長さを保つために使う。不明なら null/未設定。 */
  duration_minutes?: number | null;
  /** 元予約が代車を使っているか。日程変更で空き代車のある日だけ候補にするために使う。 */
  needs_loaner?: boolean;
}

/** 予約1件を「7/20(月) 10:00〜 内容」の1行に整形する (start_time 無しは終日扱い)。 */
function formatReservationLine(r: CancelTargetReservation): string {
  const when = r.start_time
    ? `${formatDateJa(r.scheduled_date)} ${formatTimeShort(r.start_time)}〜`
    : `${formatDateJa(r.scheduled_date)}（終日）`;
  return r.title?.trim() ? `${when} ${r.title.trim()}` : when;
}

/**
 * キャンセル対象の予約が複数あるとき、どれをキャンセルするかボタンで選ばせる。
 * 「スタッフに相談」は既存の consult (→ human_takeover + 通知) を再利用する。
 */
export function buildCancelPickAsk(reservations: CancelTargetReservation[]): FlowButtonMessage {
  return {
    text: ["ご予約のキャンセルですね。どのご予約をキャンセルしますか？", "対象を下のボタンからお選びください。"].join(
      "\n",
    ),
    buttons: [
      ...reservations.map((r, i) => ({
        // ラベルは送信時に 20 文字へ丸められる (sendCustomerLineButtons)。
        label: formatReservationLine(r),
        data: `flow:cancel_pick:${i}`,
      })),
      { label: "スタッフに相談したい", data: "flow:consult" },
    ],
  };
}

/** キャンセル実行前の最終確認 (破壊的操作なので必ず挟む)。 */
export function buildCancelConfirmAsk(reservation: CancelTargetReservation): FlowButtonMessage {
  return {
    text: [
      "下記のご予約をキャンセルします。よろしいですか？",
      "",
      `📅 ${formatReservationLine(reservation)}`,
      "",
      "キャンセルする場合は「はい、キャンセルします」を、やめる場合は「やめる」をお選びください。",
    ].join("\n"),
    buttons: [
      { label: "はい、キャンセルします", data: "flow:cancel_confirm" },
      { label: "やめる", data: "flow:cancel_abort" },
    ],
  };
}

/** キャンセル完了の案内 (フローのクローズ文面)。 */
export function buildCancelDone(reservation: CancelTargetReservation): string {
  return [
    "ご予約をキャンセルしました。",
    `📅 ${formatReservationLine(reservation)}`,
    "",
    "またのご利用をお待ちしております。",
  ].join("\n");
}

/** キャンセルを取りやめたときの案内 (予約は維持)。 */
export function buildCancelAborted(): string {
  return "キャンセルを取りやめました。ご予約はそのままお承りしております。";
}

/**
 * セルフキャンセルできない場合 (当日/直前・対象予約なし・未紐付け等) にスタッフへ
 * 引き継ぐ案内。当日以降の変更は電話等での調整が要るため人手に回す。
 */
export function buildCancelHandoff(): string {
  return [
    "ご予約の変更・キャンセルについて、担当より確認のうえご連絡いたします。",
    "お急ぎの場合はお電話でもお問い合わせいただけます。",
  ].join("\n");
}

/**
 * 日程変更の対象予約が複数あるとき、どれを変更するかボタンで選ばせる。
 * 「スタッフに相談」は既存の consult (→ human_takeover + 通知) を再利用する。
 * 対象予約の表示は CancelTargetReservation と同形 (予約サマリ) を共用する。
 */
export function buildReschedulePickAsk(reservations: CancelTargetReservation[]): FlowButtonMessage {
  return {
    text: ["ご予約の日程変更ですね。どのご予約を変更しますか？", "対象を下のボタンからお選びください。"].join("\n"),
    buttons: [
      ...reservations.map((r, i) => ({
        label: formatReservationLine(r),
        data: `flow:reschedule_pick:${i}`,
      })),
      { label: "スタッフに相談したい", data: "flow:consult" },
    ],
  };
}

/**
 * 日程変更する予約を確定したうえで、新しい日程候補をボタンで提示する。
 * 現在の予約日時を明示し、候補ボタン (flow:reschedule_slot:<i>) と
 * 「その他の日程を相談する」(既存 flow:cancel → handoff) を並べる。
 */
export function buildRescheduleSlotAsk(
  target: CancelTargetReservation,
  candidates: FlowScheduleCandidate[],
): FlowButtonMessage {
  return {
    text: [
      "下記のご予約の新しい日程をお選びください。",
      "",
      `現在: ${formatReservationLine(target)}`,
      "",
      "変更後の日時を下の候補からお選びください（合わなければ「その他の日程を相談する」からどうぞ）。",
    ].join("\n"),
    buttons: [
      ...candidates.map((c, i) => ({
        label: `${formatDateJa(c.date)} ${formatTimeShort(c.start_time)}〜`,
        data: `flow:reschedule_slot:${i}`,
      })),
      { label: "その他の日程を相談する", data: "flow:cancel" },
    ],
  };
}

/** 作業状況の問い合わせに返す対象予約の最小形 (+ 進捗)。 */
export interface WorkStatusReservation {
  status: string;
  scheduled_date: string;
  start_time: string | null;
  title: string | null;
  progress_pct?: number | null;
}

/**
 * 予約・作業の状況問い合わせへの返信文 (顧客向け)。稼働中の reservations.status 5 値
 * (confirmed/arrived/in_progress/completed) に対する顧客向け文言。正準 JobState への
 * マッピングは持たない (ADR-0002 / IMP-015 まで)。未知値は無難なフォールバック。
 */
export function buildWorkStatusReply(r: WorkStatusReservation): string {
  const line = formatReservationLine({
    id: "",
    scheduled_date: r.scheduled_date,
    start_time: r.start_time,
    title: r.title,
  });
  switch (r.status) {
    case "confirmed":
      return [`ご予約を承っております。`, `📅 ${line}`, "当日お待ちしております。"].join("\n");
    case "arrived":
      return [
        "お車をお預かりしております。順番に作業を進めておりますので、いましばらくお待ちください。",
        `📅 ${line}`,
      ].join("\n");
    case "in_progress":
      return [
        "ただいま作業を進めております。",
        `📅 ${line}`,
        // progress_pct は DB 既定が 0 (未設定と 0% が区別できない) ため、0 は「未設定」とみなし出さない。
        typeof r.progress_pct === "number" && r.progress_pct > 0 ? `進捗の目安: ${Math.round(r.progress_pct)}%` : null,
        "完了しましたらご連絡いたします。",
      ]
        .filter(Boolean)
        .join("\n");
    case "completed":
      return ["作業は完了しております。", `📅 ${line}`, "ありがとうございました。ご確認をお願いいたします。"].join(
        "\n",
      );
    default:
      // 想定外の status。状況を断定せず、担当確認に寄せる無難な文面。
      return ["ご予約を承っております。", `📅 ${line}`, "詳しい進捗は担当より確認のうえご連絡いたします。"].join("\n");
  }
}

/**
 * 作業状況を自動で答えられない場合 (本人の予約が見つからない・未紐付け等) のスタッフ引き継ぎ案内。
 */
export function buildWorkStatusHandoff(): string {
  return [
    "ご予約状況について、担当より確認のうえご連絡いたします。",
    "お急ぎの場合はお電話でもお問い合わせいただけます。",
  ].join("\n");
}

/**
 * 予約前日リマインダー。明日のご予約を知らせ、opt-in に応じてキャンセル/日程変更ボタンを添える。
 * ボタン (flow:start_cancel / flow:start_reschedule) は状態非依存で handleFlowPostback が捌く。
 * どちらのボタンも出ない (両 opt-in OFF) 場合は text だけ返す。
 */
export function buildReservationReminder(
  reservation: CancelTargetReservation,
  opts: { withCancel: boolean; withReschedule: boolean },
): { text: string; buttons: FlowButton[] } {
  const buttons: FlowButton[] = [];
  if (opts.withReschedule) buttons.push({ label: "日程を変更する", data: "flow:start_reschedule" });
  if (opts.withCancel) buttons.push({ label: "予約をキャンセルする", data: "flow:start_cancel" });
  const canSelf = buttons.length > 0;
  return {
    text: [
      "【ご予約のリマインダー】",
      "明日、下記のご予約をお承りしております。",
      "",
      `📅 ${formatReservationLine(reservation)}`,
      "",
      canSelf
        ? "ご来店をお待ちしております。ご変更・キャンセルは下のボタンからどうぞ。"
        : "ご来店を心よりお待ちしております。",
    ].join("\n"),
    buttons,
  };
}

/** 日程変更の完了案内 (フローのクローズ文面)。 */
export function buildRescheduleDone(candidate: FlowScheduleCandidate): string {
  return [
    "ご予約の日程を変更しました。",
    `📅 ${formatDateJa(candidate.date)} ${formatTimeShort(candidate.start_time)}〜${formatTimeShort(candidate.end_time)}`,
    "",
    "ご来店を心よりお待ちしております。",
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
