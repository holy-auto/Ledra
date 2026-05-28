/**
 * 事前カルテ送信内容の自動検証.
 *
 * パイプライン:
 *   1. ルール検証 (postal/birth_date/email/phone/address) — 純関数、即時
 *   2. AI 検証 (Sonnet 4.6) — 本物の顧客情報か / 異常パターン検知
 *
 * いずれかでフラグが立ったら手動レビューへ. 両方 pass なら自動承認可.
 *
 * Sonnet 4.6 を採用する理由: Haiku 4.5 は明確なテスト/ダミー検出は得意だが、
 * 住所と郵便番号の地域整合性 / 微妙な偽情報 / 多言語名の判断で精度が落ちる.
 * 1 件あたり ~$0.005 (約 0.75 円) のコスト増で誤検知/見逃しを大きく削減できる.
 */
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { withRetry } from "@/lib/http/withRetry";
import { getAnthropicClient, AI_MODEL } from "@/lib/ai/client";
import { containsMyNumber } from "@/lib/identity/ocrFilter";

// ─────────────────────────────────────────────
// 型
// ─────────────────────────────────────────────

export interface IntakeFields {
  name: string;
  name_kana?: string | null;
  email?: string | null;
  phone?: string | null;
  postal_code?: string | null;
  address?: string | null;
  birth_date?: string | null;
  note?: string | null;
}

export type IssueSeverity = "error" | "warning";

export interface ValidationIssue {
  field: string;
  severity: IssueSeverity;
  message: string;
  source: "rule" | "ai";
}

export interface IntakeValidationResult {
  /** error 級の issue が 1 件もなければ true. warning だけなら true. */
  ok: boolean;
  issues: ValidationIssue[];
  ai: {
    /** 0-1. AI が「本物っぽい」と判断する確度. */
    confidence: number;
    /** AI の判断根拠 (1 文). 監査ログ用. */
    assessment: string;
    /** AI 呼び出しに失敗した場合は false. */
    available: boolean;
  };
}

// ─────────────────────────────────────────────
// ルール検証 (純関数)
// ─────────────────────────────────────────────

const POSTAL_RE = /^\d{3}-?\d{4}$/;
const BIRTH_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PREFECTURE_RE = /[都道府県]/;
const MUNICIPALITY_RE = /[市区町村郡]/;

/**
 * 文字列フィールドが「テスト/ダミーっぽい」典型パターンか.
 * 過剰反応しないよう、明らかにキー入力のテストっぽい表現のみ対象.
 */
// 同じ文字の繰り返し / キー入力の典型パターンのみ. 短い名前は AI 判定に任せる.
const OBVIOUS_DUMMY_RE = /^(test|テスト|(asdf)+|(qwer)+|(abc)+|\d{4,}|(.)\4{2,})$/i;

export function ruleValidate(fields: IntakeFields): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // 必須
  if (!fields.name || !fields.name.trim()) {
    issues.push({ field: "name", severity: "error", message: "氏名が空です", source: "rule" });
  } else if (OBVIOUS_DUMMY_RE.test(fields.name.trim())) {
    issues.push({ field: "name", severity: "warning", message: "氏名がテスト入力のように見えます", source: "rule" });
  } else if (fields.name.trim().length > 100) {
    issues.push({ field: "name", severity: "error", message: "氏名が長すぎます", source: "rule" });
  }

  // 個人番号 trip wire (送信フェーズで弾いているが、念のため)
  for (const [key, val] of Object.entries(fields)) {
    if (typeof val === "string" && containsMyNumber(val)) {
      issues.push({
        field: key,
        severity: "error",
        message: "個人番号 (12 桁) は取り扱えません",
        source: "rule",
      });
    }
  }

  if (fields.postal_code && !POSTAL_RE.test(fields.postal_code)) {
    issues.push({
      field: "postal_code",
      severity: "warning",
      message: "郵便番号の形式が不正です (123-4567)",
      source: "rule",
    });
  }

  if (fields.birth_date) {
    if (!BIRTH_DATE_RE.test(fields.birth_date)) {
      issues.push({
        field: "birth_date",
        severity: "warning",
        message: "生年月日の形式が不正です (YYYY-MM-DD)",
        source: "rule",
      });
    } else {
      const d = new Date(fields.birth_date + "T00:00:00Z");
      const year = d.getUTCFullYear();
      const now = new Date();
      if (Number.isNaN(d.getTime()) || year < 1900 || d.getTime() > now.getTime()) {
        issues.push({
          field: "birth_date",
          severity: "warning",
          message: "生年月日が現実的でない値です",
          source: "rule",
        });
      }
    }
  }

  if (fields.email && !EMAIL_RE.test(fields.email)) {
    issues.push({
      field: "email",
      severity: "warning",
      message: "メールアドレスの形式が不正です",
      source: "rule",
    });
  }

  if (fields.phone) {
    const digits = fields.phone.replace(/\D/g, "");
    if (digits.length < 10 || digits.length > 11) {
      issues.push({
        field: "phone",
        severity: "warning",
        message: "電話番号の桁数が不正です",
        source: "rule",
      });
    }
  }

  if (fields.address) {
    if (!PREFECTURE_RE.test(fields.address) || !MUNICIPALITY_RE.test(fields.address)) {
      issues.push({
        field: "address",
        severity: "warning",
        message: "住所に都道府県/市区町村が含まれていません",
        source: "rule",
      });
    }
  }

  return issues;
}

// ─────────────────────────────────────────────
// AI 検証 (Haiku 4.5)
// ─────────────────────────────────────────────

const AiAssessmentSchema = z.object({
  is_likely_real_customer: z.boolean(),
  confidence: z.number().min(0).max(1),
  reasoning: z.string(),
  flags: z.array(
    z.object({
      field: z.string(),
      severity: z.enum(["error", "warning"]),
      message: z.string(),
    }),
  ),
});

const AI_SYSTEM_PROMPT = `あなたは日本の自動車整備店の顧客カルテ事前入力データを審査するアシスタントです。
受け取ったフォーム内容が「本物の顧客が本気で記入したもの」か「テスト/いたずら/明らかな入力ミス」かを判定します。

【判断基準】
- 氏名: 実在しそうな日本人名 / 自然な漢字・カナ表記か。"テスト 太郎"・"ああああ"・"asdf"・企業名のみは怪しい。
- 氏名カナ: 漢字氏名と整合するか (例: 名前=山田太郎、カナ=ヤマダタロウ は整合)
- 住所: 日本の住所体系として自然か。"〇〇県〇〇市..." の形式が崩れていないか。
- 郵便番号⇄住所の地域整合性: 番号上位 3 桁から推定される地域 (例: 060=北海道札幌、150=東京都渋谷、530=大阪市北区) が住所の都道府県・市区と矛盾していないか。微妙な隣接市町村レベルの差異は warning、明確に違う都道府県なら error。
- 電話番号: 日本の市外局番として有効か (03/06/045/092 等、または 070/080/090 携帯)。
- メールアドレス: フリーメールでもよいが、文字列として明らかに人為的な悪意 (例: a@a.aa) でないか。
- 生年月日: 現実的な範囲か (1900-2010 程度)。未来日や 200 歳超は error。
- 備考: 業務無関係な暴言・スパム・他人を装う記述がないか。

【絶対しないこと】
- 個人番号 (マイナンバー 12 桁) を出力に含めない
- 個別の顧客を識別する追加情報の推測 (検索や生成)
- 不確実なフィールドを error にしない (warning に留める)

【出力形式】
- is_likely_real_customer: 全体として「本物」と判断すれば true
- confidence: 0.0〜1.0 (判定への自信度)
- reasoning: 判断根拠を 1〜2 文 (100 文字以内)
- flags: 個別フィールドの問題リスト (空配列でも可)
  - severity="error": 明確に矛盾・偽情報・無効。手動レビュー必須。
  - severity="warning": 怪しいが断定できない。`;

async function aiValidate(fields: IntakeFields): Promise<{
  ok: boolean;
  confidence: number;
  reasoning: string;
  flags: ValidationIssue[];
  available: boolean;
}> {
  try {
    const client = getAnthropicClient();
    // 送信する fields は明示的に列挙. 余計な metadata を漏らさない.
    const payload = {
      name: fields.name,
      name_kana: fields.name_kana ?? null,
      email: fields.email ?? null,
      phone: fields.phone ?? null,
      postal_code: fields.postal_code ?? null,
      address: fields.address ?? null,
      birth_date: fields.birth_date ?? null,
      note: fields.note ?? null,
    };

    const msg = await withRetry("anthropic", () =>
      client.messages.parse({
        model: AI_MODEL,
        max_tokens: 768,
        system: AI_SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `次の事前カルテを審査してください:\n\n${JSON.stringify(payload, null, 2)}`,
              },
            ],
          },
        ],
        output_config: { format: zodOutputFormat(AiAssessmentSchema) },
      }),
    );

    const parsed = msg.parsed_output;
    if (!parsed) {
      return { ok: true, confidence: 0, reasoning: "AI 応答が解析できませんでした", flags: [], available: false };
    }
    const flags: ValidationIssue[] = parsed.flags.map((f) => ({
      field: f.field,
      severity: f.severity,
      message: f.message,
      source: "ai",
    }));
    return {
      ok: parsed.is_likely_real_customer,
      confidence: parsed.confidence,
      reasoning: parsed.reasoning,
      flags,
      available: true,
    };
  } catch {
    // AI 失敗時は fail-open: ルール検証だけで判断する
    return { ok: true, confidence: 0, reasoning: "AI 検証は利用できませんでした", flags: [], available: false };
  }
}

// ─────────────────────────────────────────────
// 公開エントリポイント
// ─────────────────────────────────────────────

/**
 * intake 提出内容をルール + AI で検証する.
 *
 * 戻り値 `ok`:
 *   - error 級 issue が 1 件もなく
 *   - かつ AI が "likely_real_customer = true" (or AI 利用不可で fail-open)
 *   の場合に true.
 */
export async function validateIntakeSubmission(fields: IntakeFields): Promise<IntakeValidationResult> {
  const ruleIssues = ruleValidate(fields);
  const hasRuleError = ruleIssues.some((i) => i.severity === "error");

  // ルール error があれば AI を呼ぶ必要なし (どうせ手動レビュー)
  if (hasRuleError) {
    return {
      ok: false,
      issues: ruleIssues,
      ai: { confidence: 0, assessment: "ルール検証で error 級の問題があるため AI 検証はスキップ", available: false },
    };
  }

  const aiResult = await aiValidate(fields);
  const allIssues = [...ruleIssues, ...aiResult.flags];
  const hasAnyError = allIssues.some((i) => i.severity === "error");

  // AI が "not likely real" を返した、または error 級 flag があれば NG
  const ok = aiResult.ok && !hasAnyError;

  return {
    ok,
    issues: allIssues,
    ai: {
      confidence: aiResult.confidence,
      assessment: aiResult.reasoning,
      available: aiResult.available,
    },
  };
}
