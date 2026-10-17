import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { escapeIlike } from "@/lib/sanitize";
import MarketClient from "./MarketClient";
import { signAssetPaths } from "@/lib/signedUrl";
import { createServiceRoleAdmin } from "@/lib/supabase/admin";
import { MARKET_LISTING_COLUMNS } from "@/lib/market/listingColumns";

export const dynamic = "force-dynamic";

type SearchParams = { q?: string };

export default async function MarketPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();

  const supabase = await createSupabaseServerClient();
  const caller = await resolveCallerWithRole(supabase);
  if (!caller) redirect("/login?next=/market");

  // 他テナントの出品中の車両は RLS では読めない（自テナントの行だけ。20261017103611）。
  // service role で、出品中の行と他テナントに見せてよい列だけを読む。
  const admin = createServiceRoleAdmin("market list — listed vehicles of all tenants, public columns only");
  let query = admin
    .from("market_vehicles")
    .select(MARKET_LISTING_COLUMNS)
    .eq("status", "listed")
    .order("listed_at", { ascending: false });

  if (q) {
    const sq = escapeIlike(q);
    query = query.or(`maker.ilike.%${sq}%,model.ilike.%${sq}%`);
  }

  const { data: vehicles, error } = await query;
  // 列を指定して読むので、列の改名・削除は照会エラーになる。空の一覧に見せずエラーにする
  if (error) throw new Error(`market list query failed: ${error.message}`);

  // Fetch images for all vehicles
  const vehicleIds = (vehicles ?? []).map((v: any) => v.id);
  const imagesMap: Record<string, any[]> = {};

  if (vehicleIds.length > 0) {
    // 画像も RLS では他テナントの分を読めないので service role で読む。vehicleIds は上で読んだ出品中の車両だけ
    const { data: images } = await admin
      .from("market_vehicle_images")
      .select("*")
      .in("vehicle_id", vehicleIds)
      .order("sort_order", { ascending: true });

    (images ?? []).forEach((img: any) => {
      if (!imagesMap[img.vehicle_id]) imagesMap[img.vehicle_id] = [];
      imagesMap[img.vehicle_id].push(img);
    });
    // 一覧は 1 枚目しか出さないので、1 枚目だけ署名 URL にする。
    // market の objects には読み取りポリシーが無い（20260616000003 で外した）ので、署名は service-role で行う
    // （署名するのは、出品中の車両の画像だけ）。
    const firsts = Object.values(imagesMap).map((imgs) => imgs[0]);
    const urls = await signAssetPaths(
      admin,
      firsts.map((img) => img.storage_path),
      "market",
    );
    for (const img of firsts) img.url = urls.get(img.storage_path) ?? null;
  }

  const enriched = (vehicles ?? []).map((v: any) => ({
    ...v,
    images: imagesMap[v.id] ?? [],
  }));

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <header className="mb-8 flex items-end justify-between gap-4 flex-wrap">
        <div>
          <div className="inline-flex rounded-full border border-border-default bg-surface px-3 py-1 text-[11px] font-semibold tracking-[0.22em] text-secondary mb-3">
            MARKET
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-primary">BtoB中古車在庫共有</h1>
          <p className="mt-2 text-sm text-secondary">
            全テナントの出品中車両を横断検索できます
            {q && <span className="ml-2">/ 検索: &quot;{q}&quot;</span>}
          </p>
        </div>
        <Link href="/admin" className="btn-ghost">
          管理画面へ戻る
        </Link>
      </header>

      <MarketClient vehicles={enriched} />
    </main>
  );
}
