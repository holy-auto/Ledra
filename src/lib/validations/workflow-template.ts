import { z } from "zod";

const SERVICE_TYPES = ["coating", "ppf", "wrapping", "body_repair", "other"] as const;

const stepSchema = z.object({
  order: z.coerce.number().int().min(0),
  key: z.string().trim().min(1).max(100),
  label: z.string().trim().min(1).max(200),
  is_customer_visible: z.boolean(),
  estimated_min: z.coerce.number().int().min(0).default(0),
  // 現場向けガイド（任意・後方互換）。この工程で「撮る写真」と「確認する項目」を
  // ベテランが宣言しておき、作業者へ写真ガイド／チェックリストとして提示する。
  // 思想「現場に記録作業を増やさない／強制停止は最小限」に従い、進行はブロックせず
  // UI 側で警告として提示する（判定は src/lib/workflow/stepChecklist.ts の純関数）。
  // steps は JSONB 保存のため、この追加にマイグレーションは不要。
  required_photos: z.array(z.string().trim().min(1).max(100)).max(20).optional(),
  checklist: z.array(z.string().trim().min(1).max(200)).max(30).optional(),
});

export const workflowTemplateCreateSchema = z.object({
  name: z.string().trim().min(1, "テンプレート名は必須です").max(200),
  service_type: z.enum(SERVICE_TYPES, { message: "無効なサービスタイプです" }).default("other"),
  steps: z.array(stepSchema).min(1, "ステップは1つ以上必要です").max(50),
  is_default: z.boolean().default(false),
});

export const workflowTemplateUpdateSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  service_type: z.enum(SERVICE_TYPES).optional(),
  steps: z.array(stepSchema).min(1).max(50).optional(),
  is_default: z.boolean().optional(),
});
