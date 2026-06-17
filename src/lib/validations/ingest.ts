import { z } from "zod";

/**
 * 基幹ソフト → Ledra への Push 取込 (v1 ingest API) バリデーション。
 *
 * 共通方針:
 *   - source_system : 連携元の識別子 (例 'broadleaf')。冪等キーの一部。
 *   - external_ref  : 連携元での一意 ID。(tenant, source_system, external_ref)
 *                     で upsert するため必須。
 *   - records       : 1 リクエストあたり最大 500 件。
 */

const MAX_RECORDS = 500;

const sourceSystem = z
  .string()
  .trim()
  .min(1, "source_system は必須です。")
  .max(64, "source_system は64文字以内で指定してください。");

const externalRef = z
  .string()
  .trim()
  .min(1, "external_ref は必須です。")
  .max(128, "external_ref は128文字以内で指定してください。");

const optStr = (max: number) => z.string().trim().max(max).optional().nullable();

/** 顧客取込 */
export const ingestCustomersSchema = z.object({
  source_system: sourceSystem,
  records: z
    .array(
      z.object({
        external_ref: externalRef,
        name: z.string().trim().min(1, "name は必須です。").max(200),
        name_kana: optStr(200),
        email: z.string().trim().email("email の形式が不正です。").max(254).optional().nullable(),
        phone: optStr(40),
        postal_code: optStr(16),
        address: optStr(500),
        note: optStr(2000),
      }),
    )
    .min(1, "records は1件以上指定してください。")
    .max(MAX_RECORDS, `records は最大${MAX_RECORDS}件です。`),
});
export type IngestCustomersInput = z.infer<typeof ingestCustomersSchema>;

/** 車両取込 */
export const ingestVehiclesSchema = z.object({
  source_system: sourceSystem,
  records: z
    .array(
      z.object({
        external_ref: externalRef,
        maker: optStr(80),
        model: optStr(120),
        year: z.number().int().min(1900).max(2200).optional().nullable(),
        plate_display: optStr(40),
        customer_name: optStr(200),
        customer_email: z.string().trim().email().max(254).optional().nullable(),
        customer_phone_masked: optStr(40),
        notes: optStr(2000),
      }),
    )
    .min(1, "records は1件以上指定してください。")
    .max(MAX_RECORDS, `records は最大${MAX_RECORDS}件です。`),
});
export type IngestVehiclesInput = z.infer<typeof ingestVehiclesSchema>;

/** 作業履歴取込 (vehicle_histories)。vehicle_external_ref で既存車両に紐づける。 */
export const ingestWorkHistorySchema = z.object({
  source_system: sourceSystem,
  records: z
    .array(
      z.object({
        external_ref: externalRef,
        /** 既に取込済みの車両の external_ref。これで vehicle_id を解決する。 */
        vehicle_external_ref: externalRef,
        type: z.string().trim().min(1, "type は必須です。").max(64),
        title: z.string().trim().min(1, "title は必須です。").max(200),
        description: optStr(4000),
        /** 作業実施日時 (ISO8601)。省略時は now()。 */
        performed_at: z.string().datetime({ offset: true }).optional().nullable(),
      }),
    )
    .min(1, "records は1件以上指定してください。")
    .max(MAX_RECORDS, `records は最大${MAX_RECORDS}件です。`),
});
export type IngestWorkHistoryInput = z.infer<typeof ingestWorkHistorySchema>;
