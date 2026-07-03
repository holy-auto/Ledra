import { z } from "zod";
import type { TamperingFlag } from "@/lib/ai/photoTamperingCheck";

/**
 * ステージ時 (evidence-upload) に検出しうる EXIF 改ざん疑い flag。
 * 値域は photoTamperingCheck の TamperingFlag と一致させる（型は import type で実体は持ち込まない）。
 */
const TAMPERING_FLAGS = [
  "software_edited",
  "timestamp_future",
  "timestamp_mismatch",
  "duplicate_hash",
  "gps_extreme",
  "exif_stripped",
  "vision_suspicious",
] as const satisfies readonly TamperingFlag[];

/** 装着エビデンス1件（写真/伝票/旧品など）。アップロード済みのメタを受け取る。 */
export const partEvidenceSchema = z.object({
  kind: z.enum([
    "install_photo",
    "context_photo",
    "old_part_photo",
    "delivery_note",
    "removed_part",
    "seal",
    "marking",
  ]),
  storage_path: z.string().trim().min(1).nullable().optional(),
  sha256: z
    .string()
    .trim()
    .regex(/^[0-9a-f]{64}$/i, "sha256 は16進64文字")
    .nullable()
    .optional(),
  perceptual_hash: z.string().trim().max(128).nullable().optional(),
  c2pa_verified: z.boolean().optional(),
  device_attestation_verified: z.boolean().optional(),
  authenticity_grade: z.enum(["unverified", "basic", "verified", "premium"]).optional(),
  exif_captured_at: z.string().datetime().nullable().optional(),
  capture_nonce: z.string().trim().max(128).nullable().optional(),
  ocr_extracted: z.any().nullable().optional(),
  /** ステージ時に検出した改ざん疑い flag。作成時に finding 化される。 */
  integrity_flags: z.array(z.enum(TAMPERING_FLAGS)).max(20).optional(),
});

/** 装着レコード作成リクエスト。 */
export const partInstallationCreateSchema = z.object({
  job_order_id: z.string().uuid().nullable().optional(),
  reservation_id: z.string().uuid().nullable().optional(),
  certificate_id: z.string().uuid().nullable().optional(),
  vehicle_id: z.string().uuid().nullable().optional(),
  customer_id: z.string().uuid().nullable().optional(),
  inventory_item_id: z.string().uuid().nullable().optional(),

  part_name: z.string().trim().min(1, "部品名は必須です。").max(200),
  gtin: z.string().trim().max(64).nullable().optional(),
  lot_code: z.string().trim().max(128).nullable().optional(),
  /** 生シリアル。サーバ側で HMAC フィンガープリントに変換し、生値は保存しない。 */
  serial_no: z.string().trim().max(128).nullable().optional(),
  part_kind: z.enum(["serialized", "lot_only", "consumable", "high_value"]).default("consumable"),
  quantity: z.number().positive().default(1),
  unit: z.string().trim().max(16).default("個"),
  amount_jpy: z.number().int().nonnegative().nullable().optional(),

  evidence: z.array(partEvidenceSchema).max(50).default([]),
});

export type PartInstallationCreateInput = z.infer<typeof partInstallationCreateSchema>;
export type PartEvidenceInput = z.infer<typeof partEvidenceSchema>;
