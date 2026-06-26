/**
 * 案件 (予約) ワークフローの提案。
 *
 * 予約内容 (タイトル / メニュー / 車両) と、その顧客・車両の過去案件で使われた
 * service_type の履歴から、「どのワークフローテンプレートで進めるのが妥当か」を
 * 1 つ提案する。`jobNextAction` 同様、まず deterministic に候補を決め、AI には
 * 理由文の生成と確信度の微調整だけを任せる (ハルシネーション抑制)。
 *
 * これは「提案」であって自動適用ではない。スタッフが提案を承認 (start-workflow) する
 * か、別テンプレートに変更してから進行する (人が判断 = 壁3 と整合)。
 */
import { withRetry } from "@/lib/http/withRetry";
import { getAnthropicClient, AI_MODEL_FAST } from "@/lib/ai/client";
import { clipText } from "@/lib/ai/utils";

export type WorkflowServiceType = "coating" | "ppf" | "wrapping" | "body_repair" | "other";

export interface WorkflowTemplateLite {
  id: string;
  name: string;
  service_type: string;
  is_default: boolean;
  is_platform: boolean;
}

export interface WorkflowProposalInput {
  title: string | null;
  menuItemNames: string[];
  vehicleLabel?: string | null;
  /** この顧客 / 車両の過去案件で使われた service_type (新しい順)。 */
  pastServiceTypes: string[];
  /** 選択肢になりうるテンプレート (テナント所有 + プラットフォーム共通)。 */
  templates: WorkflowTemplateLite[];
}

export interface WorkflowProposalResult {
  /** 推奨テンプレート (無ければ null)。 */
  suggestedTemplateId: string | null;
  suggestedTemplateName: string | null;
  serviceType: WorkflowServiceType | null;
  /** スタッフ向けの 1 文 (60 字以内)。 */
  reason: string;
  confidence: number;
  ai: boolean;
}

/** service_type 推定用のキーワード辞書 (部分一致・小文字)。 */
const SERVICE_TYPE_KEYWORDS: Record<WorkflowServiceType, string[]> = {
  coating: ["コーティング", "ガラスコート", "ポリマー", "セラミック", "ceramic", "coating", "ガラス被膜"],
  ppf: ["ppf", "プロテクション", "protection", "フィルム", "film", "プロテクトフィルム"],
  wrapping: ["ラッピング", "wrap", "wrapping", "カーラッピング", "カラーチェンジ"],
  body_repair: ["板金", "鈑金", "修理", "repair", "塗装", "へこみ", "キズ", "事故", "バンパー"],
  other: [],
};

/** タイトル + メニューから service_type を推定する。 */
export function inferServiceType(title: string | null, menuItemNames: string[]): WorkflowServiceType | null {
  const hay = [title ?? "", ...menuItemNames].join(" ").toLowerCase();
  if (!hay.trim()) return null;
  // body_repair / ppf / wrapping / coating の順で具体性の高いものから判定。
  const order: WorkflowServiceType[] = ["ppf", "wrapping", "body_repair", "coating"];
  for (const st of order) {
    if (SERVICE_TYPE_KEYWORDS[st].some((k) => hay.includes(k.toLowerCase()))) return st;
  }
  return null;
}

/** 過去 service_type の最頻値 (同数なら最新優先)。 */
function dominantPastServiceType(past: string[]): WorkflowServiceType | null {
  if (past.length === 0) return null;
  const counts = new Map<string, number>();
  for (const s of past) counts.set(s, (counts.get(s) ?? 0) + 1);
  let best: string | null = null;
  let bestN = 0;
  for (const s of past) {
    const n = counts.get(s) ?? 0;
    if (n > bestN) {
      bestN = n;
      best = s;
    }
  }
  return (best as WorkflowServiceType) ?? null;
}

/** service_type に対して最適な 1 テンプレートを選ぶ。 */
function pickTemplateForServiceType(
  templates: WorkflowTemplateLite[],
  serviceType: WorkflowServiceType | null,
): WorkflowTemplateLite | null {
  if (!serviceType) return null;
  const ofType = templates.filter((t) => t.service_type === serviceType);
  if (ofType.length === 0) return null;
  // テナント独自の default → テナント独自の任意 → プラットフォーム default → プラットフォーム任意。
  return (
    ofType.find((t) => !t.is_platform && t.is_default) ??
    ofType.find((t) => !t.is_platform) ??
    ofType.find((t) => t.is_platform && t.is_default) ??
    ofType[0] ??
    null
  );
}

/**
 * deterministic に提案候補を決める。
 *
 * 現在のメニュー/タイトルから推定した service_type を主とし、推定不能なときだけ
 * 過去履歴の最頻 service_type にフォールバックする。
 */
export function pickWorkflowProposalCandidate(input: WorkflowProposalInput): WorkflowProposalResult {
  const inferred = inferServiceType(input.title, input.menuItemNames);
  const past = dominantPastServiceType(input.pastServiceTypes);
  const serviceType = inferred ?? past;

  const template = pickTemplateForServiceType(input.templates, serviceType);

  let confidence = 0;
  let reason: string;
  if (!serviceType) {
    reason = "施工種別を判定できませんでした。テンプレートを選んで開始してください。";
  } else if (!template) {
    confidence = 0.3;
    reason = `施工種別は「${serviceType}」と推定。対応テンプレートが未登録です。`;
  } else {
    // 現メニューで推定でき、過去も同種なら高確信。推定のみ/履歴のみは中程度。
    confidence = inferred && past && inferred === past ? 0.9 : inferred ? 0.7 : 0.55;
    reason = `「${template.name}」で進めるのが妥当です。`;
  }

  return {
    suggestedTemplateId: template?.id ?? null,
    suggestedTemplateName: template?.name ?? null,
    serviceType: serviceType ?? null,
    reason,
    confidence,
    ai: false,
  };
}

/**
 * AI で理由文を 1 文に整える。失敗時は deterministic な結果をそのまま返す。
 * テンプレートの選択自体は deterministic 側を尊重する (AI に勝手に変えさせない)。
 */
export async function proposeWorkflow(
  input: WorkflowProposalInput,
  opts?: { model?: string },
): Promise<WorkflowProposalResult> {
  const base = pickWorkflowProposalCandidate(input);
  if (!process.env.ANTHROPIC_API_KEY || !base.suggestedTemplateId) return base;

  const client = getAnthropicClient();
  const facts = [
    `案件: ${input.title ?? "(無題)"}`,
    input.menuItemNames.length > 0 ? `メニュー: ${input.menuItemNames.join(", ")}` : null,
    input.vehicleLabel ? `車両: ${input.vehicleLabel}` : null,
    input.pastServiceTypes.length > 0 ? `過去施工種別: ${input.pastServiceTypes.join(", ")}` : null,
    `推奨テンプレート: ${base.suggestedTemplateName}`,
  ].filter(Boolean);

  try {
    const msg = await withRetry("anthropic", () =>
      client.messages.create({
        model: opts?.model ?? AI_MODEL_FAST,
        max_tokens: 192,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: facts.map((f) => `- ${f}`).join("\n") }],
      }),
    );
    const text = msg.content[0]?.type === "text" ? msg.content[0].text.trim() : "";
    if (!text) return base;
    return { ...base, reason: clipText(text, 60), ai: true };
  } catch (err) {
    console.error("[workflowProposal] generation failed:", err);
    return base;
  }
}

const SYSTEM_PROMPT = `あなたは自動車施工店スタッフ向けのアシスタントです。
案件内容と推奨ワークフローを受け取り、なぜそのワークフローで進めるのが妥当かを
1 文 (60 字以内、句点で終わる) で説明してください。
事実に基づき、推測表現は使わない。改行・絵文字禁止。テンプレート名は変更しない。`.trim();
