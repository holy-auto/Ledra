/**
 * public_id から公開レシートを引く。**doc_type='receipt' のガードはここ1箇所だけ。**
 *
 * なぜ関数にまとめたか: この照会は認証なしの経路が2つ（`/receipt/[public_id]` と
 * `/api/receipt/pdf`）から呼ぶ。`documents` は領収書だけの表ではなく、請求書・
 * 見積書・発注書が doc_type で同居している。ガードを各ルートに書くと、片方から
 * 消えたときに**その経路だけ請求書が公開される**。実際に共有URLの組み立てを
 * 2箇所に書いたせいで同じ404バグが2つできた（MISTAKE_LEDGER）。同じ形を繰り返さない。
 *
 * 「存在しない public_id」と「領収書ではない」を呼び出し側で区別できないように
 * null 1本で返す。区別できると、どのトークンが実在するかを外から当てられる。
 */
import type { SupabaseClient } from "@supabase/supabase-js";

/** 見つかった領収書の行。見つからない／領収書でないときは null */
export async function findPublicReceipt(
  admin: SupabaseClient,
  publicId: string | null | undefined,
): Promise<Record<string, unknown> | null> {
  const token = (publicId ?? "").trim();
  // トークンが空なら DB を引かない。`public_id IS NULL` の行に当たらないようにする
  if (!token) return null;

  const { data } = await admin
    .from("documents")
    .select("*")
    .eq("public_id", token)
    // 公開するのは領収書だけ。**この1行が消えると請求書・見積書が公開される。**
    .eq("doc_type", "receipt")
    .maybeSingle();

  return (data as Record<string, unknown> | null) ?? null;
}
