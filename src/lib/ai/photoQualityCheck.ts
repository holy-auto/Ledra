/**
 * B-3: 撮影ガイドと抜け漏れ検知
 *
 * 写真の内容をClaude Visionで解析し、Ledra Standard基準に照らして
 * 不足・品質問題を検出する。証明書作成画面でリアルタイムに動作する。
 */
import { getAnthropicClient, AI_MODEL_VISION, parseJsonResponse } from "@/lib/ai/client";

// ─────────────────────────────────────────────
// 型定義
// ─────────────────────────────────────────────

export interface StandardRulePhoto {
  id: string;
  label: string;
  required: boolean;
  count_min?: number;
  validation?: string;
  angle_hint?: string;
  standard_level?: string;
}

export interface StandardRuleField {
  key: string;
  label: string;
  required: boolean;
  standard_level?: string;
}

export interface StandardWarningRule {
  condition: string;
  level: "error" | "warning" | "info";
  message: string;
}

export interface StandardRule {
  id: string;
  category: string;
  category_label: string;
  required_photos: StandardRulePhoto[];
  required_fields: StandardRuleField[];
  warning_rules: StandardWarningRule[];
  standard_level: "basic" | "standard" | "pro";
}

export interface PhotoCheckInput {
  photoUrl: string;
  expectedType: string; // "before_full", "after_detail" など
  category: string; // "ppf", "coating" など
  index: number;
}

export interface PhotoIssue {
  type: "quality" | "angle" | "unclear" | "wrong_subject" | "too_dark" | "too_blurry";
  message: string;
  suggestion: string;
}

export interface PhotoCheckResult {
  photoUrl: string;
  expectedType: string;
  isValid: boolean;
  detectedContent: string;
  issues: PhotoIssue[];
  confidence: number;
}

export interface CertificatePhotoAudit {
  certificateId: string;
  category: string;
  overallStatus: "pass" | "warning" | "fail";
  standardLevel: "none" | "basic" | "standard" | "pro";
  score: number;
  photoResults: PhotoCheckResult[];
  missingPhotos: string[];
  missingFields: string[];
  warningMessages: Array<{ level: "error" | "warning" | "info"; message: string }>;
}

// ─────────────────────────────────────────────
// 写真1枚の内容チェック（Claude Vision）
// ─────────────────────────────────────────────

export async function checkPhotoContent(input: PhotoCheckInput): Promise<PhotoCheckResult> {
  const client = getAnthropicClient();

  const systemPrompt = `あなたは自動車施工記録の写真品質を審査する専門家です。
提供された写真が施工証明書の「${input.expectedType}」（施工カテゴリ: ${input.category}）として
適切かどうかをJSONで回答してください。

回答形式（JSONのみ）:
{
  "isValid": true/false,
  "detectedContent": "写真に映っているものの説明（20文字以内）",
  "issues": [
    {
      "type": "quality|angle|unclear|wrong_subject|too_dark|too_blurry",
      "message": "問題の説明",
      "suggestion": "改善提案"
    }
  ],
  "confidence": 0.0〜1.0
}`;

  try {
    // URLからBase64に変換
    const response = await fetch(input.photoUrl);
    const buffer = await response.arrayBuffer();
    const base64 = Buffer.from(buffer).toString("base64");
    const contentType = response.headers.get("content-type") || "image/jpeg";

    const msg = await client.messages.create({
      model: AI_MODEL_VISION,
      max_tokens: 512,
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: contentType as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
                data: base64,
              },
            },
            {
              type: "text",
              text: `この写真は「${input.expectedType}」として適切ですか？JSON形式で回答してください。`,
            },
          ],
        },
      ],
    });

    const text = msg.content[0].type === "text" ? msg.content[0].text : "{}";
    const result = parseJsonResponse<{
      isValid: boolean;
      detectedContent: string;
      issues: PhotoIssue[];
      confidence: number;
    }>(text);

    return {
      photoUrl: input.photoUrl,
      expectedType: input.expectedType,
      isValid: result.isValid ?? true,
      detectedContent: result.detectedContent ?? "不明",
      issues: result.issues ?? [],
      confidence: result.confidence ?? 0.8,
    };
  } catch (err) {
    console.error("[photoQualityCheck] vision error:", err);
    // エラー時はデフォルトで通過させる（UIをブロックしない）
    return {
      photoUrl: input.photoUrl,
      expectedType: input.expectedType,
      isValid: true,
      detectedContent: "チェック不可",
      issues: [],
      confidence: 0.5,
    };
  }
}

// ─────────────────────────────────────────────
// 証明書全体の品質監査
// ─────────────────────────────────────────────

export async function auditCertificatePhotos(params: {
  certificateId: string;
  category: string;
  photoUrls: string[];
  fieldValues: Record<string, string | undefined>;
  standardRule: StandardRule;
  checkPhotosWithAI?: boolean; // Vision APIを使うか（デフォルトtrue）
}): Promise<CertificatePhotoAudit> {
  const { category, photoUrls, fieldValues, standardRule, checkPhotosWithAI = true } = params;

  const warningMessages: Array<{ level: "error" | "warning" | "info"; message: string }> = [];
  const missingPhotos: string[] = [];
  const missingFields: string[] = [];

  // ── 必須フィールドチェック ──
  for (const field of standardRule.required_fields) {
    if (field.required && !fieldValues[field.key]) {
      missingFields.push(field.label);
    }
  }

  // ── 写真枚数チェック ──
  const requiredPhotos = standardRule.required_photos.filter((p) => p.required);
  const totalRequired = requiredPhotos.reduce((sum, p) => sum + (p.count_min ?? 1), 0);

  if (photoUrls.length < totalRequired) {
    missingPhotos.push(...requiredPhotos.map((p) => p.label));
  }

  // ── warningルール評価 ──
  for (const rule of standardRule.warning_rules) {
    const triggered = evaluateWarningCondition(rule.condition, {
      photoCount: photoUrls.length,
      fieldValues,
      requiredTotal: totalRequired,
    });
    if (triggered) {
      warningMessages.push({ level: rule.level, message: rule.message });
    }
  }

  // ── Vision AIによる写真内容チェック（オプション）──
  let photoResults: PhotoCheckResult[] = [];
  if (checkPhotosWithAI && photoUrls.length > 0) {
    const checks = photoUrls.slice(0, 5).map((url, i) =>
      checkPhotoContent({
        photoUrl: url,
        expectedType: standardRule.required_photos[i]?.id ?? "photo",
        category,
        index: i,
      }),
    );
    photoResults = await Promise.all(checks);

    for (const result of photoResults) {
      if (!result.isValid) {
        for (const issue of result.issues) {
          warningMessages.push({ level: "warning", message: issue.message });
        }
      }
    }
  }

  // ── スコア計算 ──
  const score = calcQualityScore({
    photoCount: photoUrls.length,
    requiredPhotoCount: totalRequired,
    missingFieldCount: missingFields.length,
    errorCount: warningMessages.filter((w) => w.level === "error").length,
    warningCount: warningMessages.filter((w) => w.level === "warning").length,
    photoResults,
  });

  // ── 総合ステータス ──
  const hasErrors = warningMessages.some((w) => w.level === "error");
  const hasWarnings = warningMessages.some((w) => w.level === "warning");
  const overallStatus = hasErrors ? "fail" : hasWarnings ? "warning" : "pass";

  // ── Ledra Standard レベル判定 ──
  const standardLevel = determineStandardLevel(score, overallStatus);

  return {
    certificateId: params.certificateId,
    category,
    overallStatus,
    standardLevel,
    score,
    photoResults,
    missingPhotos,
    missingFields,
    warningMessages,
  };
}

// ─────────────────────────────────────────────
// ヘルパー関数
// ─────────────────────────────────────────────

function evaluateWarningCondition(
  condition: string,
  ctx: { photoCount: number; fieldValues: Record<string, string | undefined>; requiredTotal: number },
): boolean {
  switch (condition) {
    case "photo_count_lt_4":
      return ctx.photoCount < 4;
    case "photo_count_lt_3":
      return ctx.photoCount < 3;
    case "photo_count_lt_2":
      return ctx.photoCount < 2;
    case "no_before_photo":
      return ctx.photoCount === 0;
    case "material_name_missing":
      return !ctx.fieldValues["material_name"] && !ctx.fieldValues["coating_product"];
    case "material_name_ambiguous": {
      const name = ctx.fieldValues["material_name"] || ctx.fieldValues["coating_product"] || "";
      return name.length > 0 && name.length < 5;
    }
    case "warranty_missing":
      return !ctx.fieldValues["warranty_period"];
    case "color_code_missing":
      return !ctx.fieldValues["color_code"];
    case "coating_product_missing":
      return !ctx.fieldValues["coating_product"];
    default:
      return false;
  }
}

function calcQualityScore(params: {
  photoCount: number;
  requiredPhotoCount: number;
  missingFieldCount: number;
  errorCount: number;
  warningCount: number;
  photoResults: PhotoCheckResult[];
}): number {
  let score = 100;

  // 写真不足でマイナス
  const photoRatio = Math.min(params.photoCount / Math.max(params.requiredPhotoCount, 1), 1);
  score -= Math.round((1 - photoRatio) * 30);

  // 必須フィールド不足でマイナス
  score -= params.missingFieldCount * 10;

  // エラー・警告でマイナス
  score -= params.errorCount * 15;
  score -= params.warningCount * 5;

  // AI写真チェックの問題でマイナス
  const badPhotos = params.photoResults.filter((r) => !r.isValid).length;
  score -= badPhotos * 8;

  return Math.max(0, Math.min(100, score));
}

function determineStandardLevel(score: number, status: string): "none" | "basic" | "standard" | "pro" {
  if (status === "fail") return "none";
  if (score >= 90) return "pro";
  if (score >= 75) return "standard";
  if (score >= 50) return "basic";
  return "none";
}
