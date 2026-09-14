/**
 * AI 生成（下書き・説明文・フィードバック・事例要約）に渡す証明書の項目。
 *
 * なぜこのモジュールが要るか:
 * 5 つの呼び出し元がそろって `service_name / description / material_info /
 * warranty_period / work_areas / category / photo_count` を SELECT していたが、
 * **certificates にこれらの列は1つも存在しない**。PostgREST はクエリごと 400 を
 * 返すので、AI 下書き・AI 説明・アカデミーのフィードバックと事例要約は
 * すべて「証明書が見つかりません」か空入力で動いていた。
 *
 * 実列との対応をここ1箇所に閉じて、呼び出し元ごとにずれないようにする。
 */

/** AI 用に読む実在の列。SELECT にそのまま渡す */
export const CERT_AI_COLUMNS =
  "service_type, content_free_text, coating_products_json, expiry_value, content_preset_json";

/** AI 側が受け取る形。以前の列名をそのまま使う（消費側の型を変えないため） */
export interface CertAiFields {
  service_name: string;
  description?: string;
  material_info?: string;
  warranty_period?: string;
  /** 施工箇所。専用の列は無いが `content_preset_json.work_areas` に入っている */
  work_areas?: string;
}

interface CertAiRow {
  service_type?: unknown;
  content_free_text?: unknown;
  coating_products_json?: unknown;
  expiry_value?: unknown;
  content_preset_json?: unknown;
}

const text = (v: unknown): string | undefined => (typeof v === "string" && v.trim() ? v : undefined);

/**
 * 使用資材は `coating_products_json`（配列/オブジェクト）にある。
 * AI プロンプトへ渡すだけなので、名前が取れれば名前を並べ、
 * 取れなければ JSON のまま渡す（欠落させるより情報量が多い）。
 */
function materialText(v: unknown): string | undefined {
  if (!v) return undefined;
  if (typeof v === "string") return text(v);
  if (Array.isArray(v)) {
    const names = v
      .map((e) => (e && typeof e === "object" ? text((e as { name?: unknown }).name) : text(e)))
      .filter(Boolean);
    if (names.length) return names.join(", ");
  }
  try {
    return JSON.stringify(v);
  } catch {
    return undefined;
  }
}

/**
 * 施工箇所は専用の列を持たず、`content_preset_json.work_areas`（文字列の配列）に
 * 入っている。AI の下書き経路がそこへ書いているのに、読む側が拾っていなかったので
 * 「施工箇所: なし」で生成され続けていた。
 */
function workAreasText(v: unknown): string | undefined {
  if (!v || typeof v !== "object") return undefined;
  const areas = (v as { work_areas?: unknown }).work_areas;
  if (typeof areas === "string") return text(areas);
  if (!Array.isArray(areas)) return undefined;
  const names = areas.map((a) => text(a)).filter(Boolean);
  return names.length ? names.join("、") : undefined;
}

export function certAiFields(row: CertAiRow | null | undefined): CertAiFields {
  return {
    service_name: text(row?.service_type) ?? "",
    description: text(row?.content_free_text),
    material_info: materialText(row?.coating_products_json),
    // 保証期間は `expiry_value`（"3年" などの期間）。`warranty_period_end` は
    // 終了日なので別物 —— 期間を求めている消費側にはこちらを渡す
    warranty_period: text(row?.expiry_value),
    work_areas: workAreasText(row?.content_preset_json),
  };
}

/**
 * 写真の枚数は `certificate_images` を数えて出す。
 *
 * `category` には専用の列も jsonb の保存先も無い。いちばん近いのは
 * `service_type`（施工名）で、それは `service_name` として既に渡しているので、
 * 同じ値を `category` として重ねて渡すことはしない。
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- supabase-js の型を展開すると TS2589 になる
export async function certPhotoCount(db: any, certificateId: string): Promise<number> {
  const { count } = await db
    .from("certificate_images")
    .select("id", { count: "exact", head: true })
    .eq("certificate_id", certificateId);
  return (count as number | null) ?? 0;
}
