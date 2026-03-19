import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { escapeIlike } from "@/lib/sanitize";
import MarketClient from "./MarketClient";

export const dynamic = "force-dynamic";

type SearchParams = { q?: string };

export default async function MarketPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();

  const supabase = await createSupabaseServerClient();
  const caller = await resolveCallerWithRole(supabase);
  if (!caller) redirect("/login?next=/market");

  let query = supabase
    .from("market_vehicles")
    .select("*")
    .eq("status", "listed")
    .order("listed_at", { ascending: false });

  if (q) {
    const sq = escapeIlike(q);
    query = query.or(`maker.ilike.%${sq}%,model.ilike.%${sq}%`);
  }

  const { data: vehicles } = await query;

  // Fetch images for all vehicles
  const vehicleIds = (vehicles ?? []).map((v: any) => v.id);
  let imagesMap: Record<string, any[]> = {};

  if (vehicleIds.length > 0) {
    const { data: images } = await supabase
      .from("market_vehicle_images")
      .select("*")
      .in("vehicle_id", vehicleIds)
      .order("sort_order", { ascending: true });

    (images ?? []).forEach((img: any) => {
      if (!imagesMap[img.vehicle_id]) imagesMap[img.vehicle_id] = [];
      imagesMap[img.vehicle_id].push(img);
    });
  }

  const enriched = (vehicles ?? []).map((v: any) => ({
    ...v,
    images: imagesMap[v.id] ?? [],
  }));

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <header className="mb-8 flex items-end justify-between gap-4 flex-wrap">
        <div>
          <div className="inline-flex rounded-full border border-neutral-300 bg-white px-3 py-1 text-[11px] font-semibold tracking-[0.22em] text-neutral-600 mb-3">
            MARKET
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-primary">BtoB中古車在庫共有</h1>
          <p className="mt-2 text-sm text-secondary">
            全テナントの出品中車両を横断検索できます
            {q && <span className="ml-2">/ 検索: &quot;{q}&quot;</span>}
          </p>
        </div>
        <Link href="/admin" className="btn-ghost">管理画面へ戻る</Link>
      </header>

      <MarketClient vehicles={enriched} />
    </main>
  );
}
