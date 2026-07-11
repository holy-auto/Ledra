/**
 * LINE ナレッジ初回学習 (オンボーディング) の固定質問。
 *
 * メッセージ受信箱を最初に開いたとき、ナレッジ未登録のテナントに対して
 * この質問リストを提示し、回答をそのまま tenant_line_knowledge に登録する
 * (title=質問, content=回答)。よくある顧客質問 + 店舗固有情報をカバーする
 * 「最低限の学習」で、以降の追加学習は 店舗設定 > LINEナレッジ で行う。
 *
 * key は UI の状態管理用 (永続化しない)。質問文 (title) がそのまま
 * ナレッジのタイトルになるため、変更すると既存登録と重複し得る点に注意。
 */

export interface OnboardingQuestion {
  key: string;
  /** ナレッジの title としてそのまま保存される質問文。 */
  title: string;
  placeholder: string;
}

export const ONBOARDING_QUESTIONS: readonly OnboardingQuestion[] = [
  { key: "hours", title: "営業時間・定休日", placeholder: "例: 平日 9:00〜18:00 / 日曜・祝日は定休です。" },
  { key: "address", title: "店舗住所・アクセス", placeholder: "例: 東京都◯◯区◯◯ 1-2-3。◯◯ICから車で5分です。" },
  { key: "phone", title: "電話番号", placeholder: "例: お電話は 03-1234-5678 までお願いします。" },
  { key: "loaner", title: "代車の有無", placeholder: "例: 代車を2台ご用意しています (無料・要予約)。" },
  { key: "parking", title: "駐車場", placeholder: "例: 店舗前に3台分の駐車場がございます。" },
  { key: "payment", title: "支払い方法", placeholder: "例: 現金・クレジットカード・PayPay がご利用いただけます。" },
];

/**
 * 回答フォームの入力値をナレッジ登録ペイロードに変換する。
 * 空欄・空白のみの回答は登録しない (スキップ)。
 */
export function buildKnowledgeEntries(answers: Record<string, string>): Array<{ title: string; content: string }> {
  return ONBOARDING_QUESTIONS.flatMap((q) => {
    const content = (answers[q.key] ?? "").trim();
    return content ? [{ title: q.title, content }] : [];
  });
}
