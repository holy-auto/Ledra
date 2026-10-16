import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeVin } from "@/lib/passport/normalizeVin";
import { logger } from "@/lib/logger";

/**
 * 既にある車両を「同じ車」として引き当てる。見つからなければ null。
 *
 * ## 代表判断（2026-10-15）: ナンバーも VIN も無い車両は「顧客 + メーカー + 車種」で同一と見なす
 *
 * 発行の重複排除は**ナンバーの一致だけ**だった（`src/lib/certificates/create.ts`）。
 * ナンバーが無いと照合そのものを行わず、同じ車に2回発行すると `vehicles` に2行できる。
 * `maker` / `model` の NOT NULL を外して**片方だけの発行が通るようになった**（2026-10-02）ので、
 * 「ナンバーも車種も曖昧な車両」で当たる範囲が広がった。OPEN_QUESTIONS で4択にして出し、
 * 代表判断は **(b) `maker` + `model` + 顧客で照合する** —— 同じ顧客の同車種は1台に統合される。
 *
 * **別の車かもしれないことは承知の上の判断である**（同じ顧客が同車種を2台持っていれば統合される）。
 * 走行距離・車両パスポートの時系列が車両ごとに分かれるより、1台に寄せる方を採った。
 *
 * ## 順番（上から順に、当たったところで止まる）
 *
 *   1. **ナンバー** —— テナント内でほぼ一意。ただし **VIN が食い違う行には寄せない**
 *      （ナンバーは希望番号の再割当・再交付で別の車に回ることがあり、VIN の方が車に近い）
 *   2. **VIN** —— 正規化キー（`vehicles.vin_code_normalized`、トリガが `vin_code` から維持）で引く。
 *      従来は VIN を保存しているのに**照合に使っていなかった**ので、VIN 入りでも重複していた
 *   3. **顧客 + メーカー + 車種** —— ナンバーも VIN も**どちらも無い**ときだけ。代表判断 (b)
 *
 * 3 を「ナンバーか VIN があるとき」にも効かせてはいけない。ナンバーで引けなかったのは
 * 「そのナンバーの車がまだ無い」ことを意味するので、別の行に寄せると**違う車に発行が付く**。
 *
 * メーカー・車種は**値の一致**で見る（片方が未入力なら「未入力同士」で一致）。
 * メーカーだけで寄せると「トヨタ・ハイエース」に「トヨタ・（不明）」が吸われる。
 *
 * ## SQL 側の双子
 *
 * ヒアリング→顧客連携は DB 関数 `public.link_hearing_customer` が同じ規則を持つ
 * （`supabase/migrations/20261016131500_link_hearing_customer_reuse_vehicle.sql`）。
 * **どちらかを変えたら両方変える。** `normalizeVin()` と `vin_normalize()` の関係と同じ約束で、
 * 片方だけ直すと経路によって同一性の判定が変わる。
 */
export async function resolveExistingVehicleId(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  tenantId: string,
  input: {
    plate?: string | null;
    vinCode?: string | null;
    maker?: string | null;
    model?: string | null;
    customerId?: string | null;
  },
): Promise<string | null> {
  const plate = input.plate?.trim() || null;
  const vinCode = input.vinCode?.trim() || null;
  const maker = input.maker?.trim() || null;
  const model = input.model?.trim() || null;
  const customerId = input.customerId || null;
  const normalizedVin = vinCode ? normalizeVin(vinCode) || null : null;

  // 照合そのものが落ちたら「見つからなかった」と区別できない（呼び出し元は新規行を作る）。
  // Supabase は throw せず `{ error }` で返すので、捨てると無音で重複が増える。
  const logFailure = (where: string, error: unknown) => {
    if (error) logger.error(`[resolveExistingVehicleId] ${where} の照合に失敗`, error, { tenantId });
  };

  // 1) ナンバー（VIN が食い違う行には寄せない）
  if (plate) {
    const { data, error } = await supabase
      .from("vehicles")
      .select("id, vin_code_normalized")
      .eq("tenant_id", tenantId)
      .eq("plate_display", plate)
      .order("created_at", { ascending: false })
      .limit(5);
    logFailure("ナンバー", error);
    // ponytail: 同じテナントに同じナンバーの行が5台を超えるのは既に異常な状態。
    // 上限を上げるのではなく、既存の重複行の統合（未決）で直す問題。
    const rows = (data ?? []) as { id: string; vin_code_normalized: string | null }[];
    const hit = rows.find((r) => !normalizedVin || !r.vin_code_normalized || r.vin_code_normalized === normalizedVin);
    if (hit?.id) return hit.id;
  }

  // 2) VIN（正規化キー）
  if (normalizedVin) {
    const { data, error } = await supabase
      .from("vehicles")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("vin_code_normalized", normalizedVin)
      .limit(1)
      .maybeSingle();
    logFailure("VIN", error);
    if (data?.id) return data.id as string;
  }

  // 3) 顧客 + メーカー + 車種（ナンバーも VIN も無いときだけ）
  if (!plate && !vinCode && customerId && (maker || model)) {
    let q = supabase.from("vehicles").select("id").eq("tenant_id", tenantId).eq("customer_id", customerId);
    q = maker === null ? q.is("maker", null) : q.eq("maker", maker);
    q = model === null ? q.is("model", null) : q.eq("model", model);
    const { data, error } = await q.order("created_at", { ascending: false }).limit(1).maybeSingle();
    logFailure("顧客+メーカー+車種", error);
    if (data?.id) return data.id as string;
  }

  return null;
}
