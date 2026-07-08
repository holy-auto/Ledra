/**
 * B-1: 施工証明の自動下書き生成
 *
 * 車両情報・ヒアリングデータ・過去類似証明書・写真から
 * 証明書の各項目を自動入力する。
 */
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { withRetry } from "@/lib/http/withRetry";
import { getAnthropicClient, AI_MODEL, cacheableSystem } from "@/lib/ai/client";

const DraftMaterialSchema = z.object({
  name: z.string(),
  maker: z.string().optional(),
  spec: z.string().optional(),
  note: z.string().optional(),
});

const FieldConfidenceSchema = z
  .object({
    title: z.number().optional(),
    description: z.number().optional(),
    materials: z.number().optional(),
    warranty: z.number().optional(),
    workAreas: z.number().optional(),
    cautions: z.number().optional(),
  })
  .optional();

const DraftCertificateSchema = z.object({
  title: z.string(),
  description: z.string(),
  materials: z.array(DraftMaterialSchema),
  warrantyCandidates: z.array(z.string()),
  workAreas: z.array(z.string()),
  cautions: z.string(),
  confidence: z.number(),
  /** フィールド別の自己評価 (0.0〜1.0)。policy 層が "auto" 判定の精度を上げるのに使う。 */
  fieldConfidence: FieldConfidenceSchema,
  missingInfo: z.array(z.string()),
});

const EMPTY_DRAFT: DraftCertificateResult = {
  title: "",
  description: "",
  materials: [],
  warrantyCandidates: ["1年", "3年"],
  workAreas: [],
  cautions: "",
  confidence: 0,
  missingInfo: ["AI 下書き生成に失敗しました。手動で入力してください。"],
};

// ─────────────────────────────────────────────
// 型定義
// ─────────────────────────────────────────────

export interface DraftCertificateInput {
  vehicle: {
    maker?: string;
    model?: string;
    year?: number;
    color?: string;
    vin?: string;
    size_class?: string;
  };
  hearing?: {
    service_types?: string[];
    budget_range?: string;
    parking_type?: string;
    customer_requests?: string;
  };
  similarCertificates: Array<{
    service_name: string;
    description?: string;
    material_info?: string;
    warranty_period?: string;
  }>;
  photoDescriptions?: string[]; // Vision解析済みの写真説明
  templateCategory?: string;
}

export interface DraftMaterial {
  name: string;
  maker?: string;
  spec?: string;
  note?: string;
}

export interface DraftCertificateResult {
  title: string; // 施工タイトル
  description: string; // 施工内容説明
  materials: DraftMaterial[]; // 使用材料リスト
  warrantyCandidates: string[]; // 保証期間候補 ["3年", "5年"]
  workAreas: string[]; // 施工箇所リスト
  cautions: string; // 注意事項
  confidence: number; // 0.0〜1.0 (draft 全体の自己評価)
  /** フィールド別の自己評価 (任意)。policy 層が per-field でデモート判定する。 */
  fieldConfidence?: {
    title?: number;
    description?: number;
    materials?: number;
    warranty?: number;
    workAreas?: number;
    cautions?: number;
  };
  missingInfo: string[]; // 不足情報リスト
}

// ─────────────────────────────────────────────
// 自動下書き生成
// ─────────────────────────────────────────────

// ─────────────────────────────────────────────
// 大カテゴリー (テンプレート category と整合)
// ─────────────────────────────────────────────

/**
 * 証明書テンプレートの大カテゴリー。
 * templates.category / service_packages.category と揃える (+ wrapping / window_film)。
 * 予約に複数種類の作業依頼がある場合、これ単位で証明書下書きを 1 枚ずつ作る。
 */
export const CERTIFICATE_CATEGORIES = [
  "coating",
  "ppf",
  "wrapping",
  "window_film",
  "detailing",
  "maintenance",
  "body_repair",
  "general",
] as const;

export type CertificateCategory = (typeof CERTIFICATE_CATEGORIES)[number];

const CERTIFICATE_CATEGORY_LABELS: Record<CertificateCategory, string> = {
  coating: "コーティング",
  ppf: "PPF",
  wrapping: "ラッピング",
  window_film: "ウィンドウフィルム",
  detailing: "ディテーリング",
  maintenance: "整備",
  body_repair: "鈑金塗装",
  general: "その他",
};

/** 大カテゴリーの日本語ラベル。未知カテゴリーはそのまま返す。 */
export function certificateCategoryLabel(category: string): string {
  return CERTIFICATE_CATEGORY_LABELS[category as CertificateCategory] ?? category;
}

export async function generateCertificateDraft(
  input: DraftCertificateInput,
  opts?: { model?: string },
): Promise<DraftCertificateResult> {
  const client = getAnthropicClient();

  const vehicleDesc = [
    input.vehicle.maker,
    input.vehicle.model,
    input.vehicle.year ? `${input.vehicle.year}年式` : null,
    input.vehicle.color ? `${input.vehicle.color}` : null,
  ]
    .filter(Boolean)
    .join(" ");

  const hearingDesc = input.hearing
    ? [
        input.hearing.service_types?.length ? `希望施工: ${input.hearing.service_types.join(", ")}` : null,
        input.hearing.budget_range ? `予算: ${input.hearing.budget_range}` : null,
        input.hearing.parking_type ? `駐車環境: ${input.hearing.parking_type}` : null,
        input.hearing.customer_requests ? `顧客要望: ${input.hearing.customer_requests}` : null,
      ]
        .filter(Boolean)
        .join("\n")
    : "なし";

  const similarDesc =
    input.similarCertificates.length > 0
      ? input.similarCertificates
          .map((c, i) => `事例${i + 1}: 施工名=${c.service_name}, 保証=${c.warranty_period ?? "不明"}`)
          .join("\n")
      : "なし";

  const systemPrompt = `あなたは自動車施工店の施工証明書作成を支援するAIアシスタントです。
提供された情報を元に、施工証明書の各項目の候補を生成してください。

必ず以下のJSON形式のみで回答してください（余分な説明不要）:
{
  "title": "施工タイトル（簡潔に20文字以内）",
  "description": "施工内容の説明文（100〜200文字、専門的かつ顧客にも分かりやすく）",
  "materials": [
    {"name": "材料名", "maker": "メーカー名（不明なら省略）", "spec": "規格・型番（不明なら省略）", "note": "備考（あれば）"}
  ],
  "warrantyCandidates": ["3年", "5年"],
  "workAreas": ["ボンネット", "ルーフ", "フード"],
  "cautions": "注意事項（車種・施工固有のもの、なければ空文字）",
  "confidence": 0.85,
  "fieldConfidence": {"title": 0.9, "description": 0.85, "materials": 0.6, "warranty": 0.7, "workAreas": 0.8, "cautions": 0.5},
  "missingInfo": ["不足している情報のリスト（あれば）"]
}

fieldConfidence は各項目ごとの自信度 (0.0〜1.0) です。情報が不足している項目は低い値にしてください。`;

  const userMessage = `以下の情報から施工証明書の下書きを作成してください。

【車両情報】
${vehicleDesc || "不明"}

【ヒアリング情報】
${hearingDesc}

【過去の類似施工事例】
${similarDesc}

【写真から検出された内容】
${input.photoDescriptions?.join("\n") || "なし"}

【施工カテゴリ】
${input.templateCategory || "未指定"}`;

  try {
    const msg = await withRetry("anthropic", () =>
      client.messages.parse({
        model: opts?.model ?? AI_MODEL,
        max_tokens: 1024,
        system: cacheableSystem(systemPrompt),
        messages: [{ role: "user", content: userMessage }],
        output_config: { format: zodOutputFormat(DraftCertificateSchema) },
      }),
    );

    const result = msg.parsed_output;
    if (!result) return EMPTY_DRAFT;
    return {
      title: result.title,
      description: result.description,
      materials: result.materials,
      warrantyCandidates: result.warrantyCandidates.length > 0 ? result.warrantyCandidates : ["1年", "3年"],
      workAreas: result.workAreas,
      cautions: result.cautions,
      confidence: result.confidence,
      fieldConfidence: result.fieldConfidence ?? undefined,
      missingInfo: result.missingInfo,
    };
  } catch (err) {
    console.error("[draftCertificate] generation failed:", err);
    return EMPTY_DRAFT;
  }
}

// ─────────────────────────────────────────────
// カテゴリー別下書き (複数種類の作業依頼)
// ─────────────────────────────────────────────

export interface CategorizedDraftInput {
  vehicle: DraftCertificateInput["vehicle"];
  /** 予約の作業依頼 (menu_items_json の名称)。空なら分類しない。 */
  workRequests: string[];
  similarCertificates: DraftCertificateInput["similarCertificates"];
}

export interface CategorizedDraft {
  category: CertificateCategory;
  categoryLabel: string;
  /** このカテゴリーに割り当てられた作業依頼名。 */
  workItems: string[];
  draft: DraftCertificateResult;
}

const WorkGroupSchema = z.object({
  groups: z.array(
    z.object({
      category: z.enum(CERTIFICATE_CATEGORIES),
      workItems: z.array(z.string()),
    }),
  ),
});

/**
 * 作業依頼名を大カテゴリーへ AI で分類する。
 * 1 カテゴリーに複数作業がまとまることも、複数カテゴリーに分かれることもある。
 * 失敗時は空配列 (呼び出し側が単一下書きにフォールバック)。
 */
async function categorizeWorkRequests(
  workRequests: string[],
  opts?: { model?: string },
): Promise<Array<{ category: CertificateCategory; workItems: string[] }>> {
  const names = workRequests.map((s) => s.trim()).filter(Boolean);
  if (names.length === 0) return [];

  const client = getAnthropicClient();
  const categoryList = CERTIFICATE_CATEGORIES.map((c) => `${c} (${CERTIFICATE_CATEGORY_LABELS[c]})`).join(", ");

  const systemPrompt = `あなたは自動車施工店の作業内容を分類するアシスタントです。
渡された作業依頼を、次の大カテゴリーのいずれかに分類してください: ${categoryList}。

ルール:
- 同じカテゴリーの作業は 1 グループにまとめる (証明書はカテゴリー単位で 1 枚発行するため)。
- 判断が難しい作業は general に入れる。
- 入力に無い作業を創作しない。全ての作業をいずれかのグループに必ず含める。
- 出力は groups 配列のみ。`;

  const userMessage = `作業依頼一覧:\n${names.map((n, i) => `${i + 1}. ${n}`).join("\n")}`;

  try {
    const msg = await withRetry("anthropic", () =>
      client.messages.parse({
        model: opts?.model ?? AI_MODEL,
        max_tokens: 512,
        system: cacheableSystem(systemPrompt),
        messages: [{ role: "user", content: userMessage }],
        output_config: { format: zodOutputFormat(WorkGroupSchema) },
      }),
    );
    const groups = msg.parsed_output?.groups ?? [];
    // 元の作業依頼名 (正規化キー → 原文)。モデルが返す作業名をこれに正規化する。
    const nameByNorm = new Map(names.map((n) => [n.toLowerCase(), n] as const));

    // 同一カテゴリーはマージ。モデルが返した作業名は元の作業依頼に正規化し、
    // 一致しない (改名/創作された) 作業は除外する。
    const merged = new Map<CertificateCategory, string[]>();
    for (const g of groups) {
      const kept = merged.get(g.category) ?? [];
      for (const raw of g.workItems ?? []) {
        const orig = nameByNorm.get(raw.trim().toLowerCase());
        if (orig && !kept.includes(orig)) kept.push(orig);
      }
      if (kept.length > 0) merged.set(g.category, kept);
    }

    // カバレッジ検証: 元の作業依頼が全てどこかのグループに含まれるようにする。
    // モデルが一部を省略/改名した場合、漏れた作業は general に補完し、無下書きを防ぐ。
    const covered = new Set<string>();
    for (const items of merged.values()) for (const it of items) covered.add(it);
    const missing = names.filter((n) => !covered.has(n));
    if (missing.length > 0) {
      const gen = merged.get("general") ?? [];
      merged.set("general", [...gen, ...missing.filter((m) => !gen.includes(m))]);
    }

    return [...merged.entries()].map(([category, workItems]) => ({ category, workItems }));
  } catch (err) {
    console.error("[draftCertificate] categorize failed:", err);
    return [];
  }
}

/**
 * 予約の複数作業依頼を大カテゴリーごとに分け、カテゴリー単位で証明書下書きを生成する。
 *
 * 流れ:
 *   1. 作業依頼名を AI で大カテゴリーに分類 (categorizeWorkRequests)
 *   2. カテゴリーごとに generateCertificateDraft を並列実行 (該当作業を希望施工として渡す)
 *
 * 分類に失敗 / 作業依頼が無い場合は空配列を返す (呼び出し側で単一下書きにフォールバック)。
 */
export async function generateCategorizedCertificateDrafts(
  input: CategorizedDraftInput,
  opts?: { model?: string },
): Promise<CategorizedDraft[]> {
  const groups = await categorizeWorkRequests(input.workRequests, opts);
  if (groups.length === 0) return [];

  const results = await Promise.all(
    groups.map(async (g) => {
      const draft = await generateCertificateDraft(
        {
          vehicle: input.vehicle,
          hearing: { service_types: g.workItems },
          similarCertificates: input.similarCertificates,
          templateCategory: CERTIFICATE_CATEGORY_LABELS[g.category],
        },
        opts,
      );
      return {
        category: g.category,
        categoryLabel: CERTIFICATE_CATEGORY_LABELS[g.category],
        workItems: g.workItems,
        draft,
      } satisfies CategorizedDraft;
    }),
  );

  // 生成に失敗した (title 空) カテゴリーは除外。
  return results.filter((r) => r.draft.title);
}
