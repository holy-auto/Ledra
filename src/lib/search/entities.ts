import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { escapeIlike, escapePostgrestValue } from "@/lib/sanitize";

/**
 * テナント横断のエンティティ検索（顧客・車両・証明書・請求書）。
 *
 * 元は `GET /api/admin/search` にインラインだった検索本体を切り出し、
 * グローバル検索バーと AI アシスタントの両方から再利用する（検索SQLを二重管理しない）。
 * すべてのクエリに `.eq("tenant_id", tenantId)` を付与してテナント境界を担保する
 * （service-role クライアントは RLS をバイパスするため、この明示フィルタが必須）。
 *
 * 検索軸: 顧客=名前/かな/メール/電話、車両=メーカー/車種/ナンバー/車体番号(VIN)、
 * 証明書=公開ID/顧客名、請求書=帳票番号。
 */
export interface EntitySearchResults {
  certificates: { public_id: string; customer_name: string | null; status: string | null }[];
  customers: { id: string; name: string | null; email: string | null }[];
  vehicles: {
    id: string;
    maker: string | null;
    model: string | null;
    plate_number: string | null;
    vin: string | null;
  }[];
  invoices: { id: string; invoice_number: string | null; customer_name: string | null; status: string | null }[];
}

export async function searchEntities(tenantId: string, rawQuery: string, limit = 5): Promise<EntitySearchResults> {
  const q = rawQuery.trim();
  const clampedLimit = Math.min(20, Math.max(1, limit));
  const empty: EntitySearchResults = { certificates: [], customers: [], vehicles: [], invoices: [] };
  if (q.length < 2) return empty;

  const escaped = escapeIlike(q);
  const escapedPgrest = escapePostgrestValue(escaped);
  const { admin } = createTenantScopedAdmin(tenantId);

  // 証明書: public_id or 顧客名
  const certsPromise = (async () => {
    try {
      const { data } = await admin
        .from("certificates")
        .select("public_id, customer_name, status")
        .eq("tenant_id", tenantId)
        .or(`public_id.ilike.%${escapedPgrest}%,customer_name.ilike.%${escapedPgrest}%`)
        .order("created_at", { ascending: false })
        .limit(clampedLimit);
      return data ?? [];
    } catch {
      return [];
    }
  })();

  // 顧客: 名前/かな/メール/電話
  const customersPromise = (async () => {
    try {
      const { data } = await admin
        .from("customers")
        .select("id, name, email")
        .eq("tenant_id", tenantId)
        .or(
          `name.ilike.%${escapedPgrest}%,name_kana.ilike.%${escapedPgrest}%,email.ilike.%${escapedPgrest}%,phone.ilike.%${escapedPgrest}%`,
        )
        .order("created_at", { ascending: false })
        .limit(clampedLimit);
      return data ?? [];
    } catch {
      return [];
    }
  })();

  // 車両: メーカー/車種/ナンバー表示/車体番号(VIN)
  const vehiclesPromise = (async () => {
    try {
      const { data } = await admin
        .from("vehicles")
        .select("id, maker, model, plate_display, vin_code")
        .eq("tenant_id", tenantId)
        .or(
          `maker.ilike.%${escapedPgrest}%,model.ilike.%${escapedPgrest}%,plate_display.ilike.%${escapedPgrest}%,vin_code.ilike.%${escapedPgrest}%`,
        )
        .order("created_at", { ascending: false })
        .limit(clampedLimit);
      return (data ?? []).map((v) => ({
        id: v.id,
        maker: v.maker,
        model: v.model,
        plate_number: v.plate_display,
        vin: v.vin_code,
      }));
    } catch {
      return [];
    }
  })();

  // 請求書: 帳票番号（doc_number）
  const invoicesPromise = (async () => {
    try {
      const { data } = await admin
        .from("documents")
        .select("id, doc_number, customer_id, status")
        .eq("tenant_id", tenantId)
        .eq("doc_type", "invoice")
        .ilike("doc_number", `%${escaped}%`)
        .order("created_at", { ascending: false })
        .limit(clampedLimit);

      if (!data || data.length === 0) return [];

      const customerIds = [...new Set(data.filter((d) => d.customer_id).map((d) => d.customer_id as string))];
      const customerNames: Record<string, string> = {};
      if (customerIds.length > 0) {
        const { data: customers } = await admin.from("customers").select("id, name").in("id", customerIds);
        for (const c of customers ?? []) {
          customerNames[c.id] = c.name;
        }
      }

      return data.map((inv) => ({
        id: inv.id,
        invoice_number: inv.doc_number,
        customer_name: inv.customer_id ? (customerNames[inv.customer_id] ?? null) : null,
        status: inv.status,
      }));
    } catch {
      return [];
    }
  })();

  const [certificates, customers, vehicles, invoices] = await Promise.all([
    certsPromise,
    customersPromise,
    vehiclesPromise,
    invoicesPromise,
  ]);

  return { certificates, customers, vehicles, invoices };
}

/** チップ（AI アシスタントの候補表示 / 遷移先）。 */
export interface EntityChip {
  href: string;
  label: string;
}

/**
 * 検索結果を「候補チップ（詳細URL + ラベル）」の一覧に変換する純関数。
 *
 * 重要: 証明書の詳細は `public_id` で開く（`id` ではない）。この分岐が本タスクの
 * 非自明ロジックのため runnable check の対象。テナント境界済みの結果のみ渡すこと。
 */
export function entityResultsToChips(results: EntitySearchResults): EntityChip[] {
  const chips: EntityChip[] = [];

  for (const c of results.customers) {
    chips.push({ href: `/admin/customers/${c.id}`, label: `${c.name ?? "（無名）"}（顧客）` });
  }
  for (const v of results.vehicles) {
    const bits = [v.maker, v.model].filter(Boolean).join(" ");
    const ident = v.plate_number || v.vin || "";
    const label = `${bits || "車両"}${ident ? ` ${ident}` : ""}（車両）`;
    chips.push({ href: `/admin/vehicles/${v.id}`, label });
  }
  for (const cert of results.certificates) {
    chips.push({
      href: `/admin/certificates/${cert.public_id}`,
      label: `証明書 ${cert.public_id}${cert.customer_name ? `・${cert.customer_name}` : ""}`,
    });
  }
  for (const inv of results.invoices) {
    chips.push({
      href: `/admin/invoices/${inv.id}`,
      label: `請求書 ${inv.invoice_number ?? ""}${inv.customer_name ? `・${inv.customer_name}` : ""}`.trim(),
    });
  }

  return chips;
}
