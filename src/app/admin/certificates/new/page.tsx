import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { makePublicId } from "@/lib/publicId";
import { checkAdminFeature } from "@/lib/billing/adminFeatureGate";
import PageHeader from "@/components/ui/PageHeader";

type FieldType = "text" | "textarea" | "number" | "date" | "select" | "multiselect" | "checkbox";

type TemplateSchema = {
  version: number;
  sections: Array<{
    title: string;
    fields: Array<{
      key: string;
      label: string;
      type: FieldType;
      options?: string[];
      required?: boolean;
    }>;
  }>;
};

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ tid?: string }>;
}) {
  const sp = await searchParams;
  const selectedTemplateId = sp.tid ?? "";

  const supabase = await createSupabaseServerClient();
  const { data: userRes } = await supabase.auth.getUser();
  if (!userRes.user) redirect("/login?next=/admin/certificates/new");

  const { data: mem } = await supabase
    .from("tenant_memberships")
    .select("tenant_id")
    .limit(1)
    .single();

  if (!mem) return <div className="text-sm text-muted">tenant_memberships が見つかりません。</div>;
  const tenantId = mem.tenant_id as string;

  const { data: tenantRow } = await supabase
    .from("tenants")
    .select("logo_asset_path")
    .eq("id", tenantId)
    .single();
  const tenantLogoPath = (tenantRow?.logo_asset_path as string | null) ?? null;

  // ブランドテンプレート確認
  let hasBrandedTemplate = false;
  try {
    const { data: tos } = await supabase
      .from("tenant_option_subscriptions")
      .select("status")
      .eq("tenant_id", tenantId)
      .in("status", ["active", "past_due"])
      .limit(1)
      .maybeSingle();
    const { data: ttc } = await supabase
      .from("tenant_template_configs")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();
    hasBrandedTemplate = !!tos && !!ttc;
  } catch { /* tables may not exist */ }

  const { data: templates, error: tplErr } = await supabase
    .from("templates")
    .select("id,name,schema_json,created_at")
    .eq("scope", "tenant")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false });

  if (tplErr) return <div className="text-sm text-red-500">テンプレ読み込みエラー: {tplErr.message}</div>;

  // 顧客一覧を取得
  const { data: customers } = await supabase
    .from("customers")
    .select("id, name")
    .eq("tenant_id", tenantId)
    .order("name", { ascending: true });

  const customerList = customers ?? [];

  const list = templates ?? [];
  const fallbackId = list[0]?.id ?? "";
  const tid = selectedTemplateId || fallbackId;

  const selected = list.find((t) => t.id === tid) ?? list[0];
  const schema = (selected?.schema_json as unknown as TemplateSchema) ?? null;

  async function createCert(formData: FormData) {
    "use server";
    const supabase = await createSupabaseServerClient();

    const { data: userRes } = await supabase.auth.getUser();
    const userId = userRes.user?.id ?? null;

    const { data: mem } = await supabase
      .from("tenant_memberships")
      .select("tenant_id")
      .limit(1)
      .single();
    const tenantId = mem?.tenant_id as string | undefined;
    if (!tenantId) redirect("/admin/certificates/new?e=tenant");

    const { data: tenantRow } = await supabase
      .from("tenants")
      .select("logo_asset_path")
      .eq("id", tenantId)
      .single();
    const tenantLogoPath = (tenantRow?.logo_asset_path as string | null) ?? null;

    const template_id = String(formData.get("template_id") || "");
    const template_name = String(formData.get("template_name") || "");

    let schema_snapshot: any = null;
    if (template_id) {
      const { data: tpl } = await supabase
        .from("templates")
        .select("schema_json")
        .eq("id", template_id)
        .eq("tenant_id", tenantId)
        .single();
      schema_snapshot = tpl?.schema_json ?? null;
    }

    const customer_id = String(formData.get("customer_id") || "").trim() || null;
    const customer_name = String(formData.get("customer_name") || "").trim();
    const model = String(formData.get("model") || "").trim();
    const plate = String(formData.get("plate") || "").trim();
    const content_free_text = String(formData.get("content_free_text") || "").trim();
    const expiry_value = String(formData.get("expiry_value") || "").trim();
    const servicePriceRaw = formData.get("service_price");
    const service_price = servicePriceRaw ? parseInt(String(servicePriceRaw), 10) : null;

    if (!customer_name) redirect(`/admin/certificates/new?tid=${encodeURIComponent(template_id)}&e=1`);

    const values: Record<string, any> = {};
    for (const [k, v] of formData.entries()) {
      const key = String(k);
      if (!key.startsWith("f__")) continue;
      const fkey = key.slice(3);

      if (v === "on") {
        values[fkey] = true;
        continue;
      }

      const sv = String(v);

      if (values[fkey] === undefined) values[fkey] = sv;
      else if (Array.isArray(values[fkey])) values[fkey].push(sv);
      else values[fkey] = [values[fkey], sv];
    }

    const public_id = makePublicId();

    const { error } = await supabase.from("certificates").insert({
      tenant_id: tenantId,
      public_id,
      status: "active",
      customer_id,
      customer_name,
      vehicle_info_json: { model, plate },
      content_free_text,
      content_preset_json: { template_id, template_name, schema_snapshot, values },
      expiry_type: "text",
      expiry_value,
      footer_variant: "holy",
      logo_asset_path: tenantLogoPath,
      created_by: userId,
      service_price: service_price !== null && !isNaN(service_price) ? service_price : null,
    });

    if (error) redirect(`/admin/certificates/new?tid=${encodeURIComponent(template_id)}&e=2`);

    redirect(`/admin/certificates/new/success?pid=${encodeURIComponent(public_id)}`);
  }

  return (
    <div className="space-y-4">
      <PageHeader
        tag="証明書発行"
        title="新規発行"
        description={tenantLogoPath ? undefined : "ロゴ未設定（設定 → ロゴ管理）"}
        actions={
          <div className="flex gap-3 items-center">
            <Link className="btn-ghost" href="/admin/certificates">一覧へ</Link>
            <Link className="btn-secondary" href="/admin/templates">テンプレート</Link>
          </div>
        }
      />

      {hasBrandedTemplate && (
        <div className="glass-card p-3 text-sm text-[#0071e3] glow-cyan flex items-center justify-between">
          <span>ブランドテンプレートが適用中です。発行される証明書PDFに自動で反映されます。</span>
          <Link href="/admin/template-options" className="text-xs underline">設定を確認</Link>
        </div>
      )}

      <form action="/admin/certificates/new" method="get" className="glass-card p-4 space-y-2">
        <div className="text-xs text-muted">テンプレ</div>
        <div className="flex gap-2 items-center">
          <select name="tid" defaultValue={tid} className="select-field w-full">
            {list.map((t) => (<option key={t.id} value={t.id}>{t.name}</option>))}
          </select>
          <button className="btn-secondary whitespace-nowrap">選択</button>
        </div>
      </form>

      <form action={createCert} className="glass-card p-4 space-y-4">
        <input type="hidden" name="template_id" value={selected?.id ?? ""} />
        <input type="hidden" name="template_name" value={selected?.name ?? ""} />

        <section className="space-y-3">
          <div className="text-sm font-semibold text-primary">基本情報</div>

          <div className="space-y-1">
            <div className="text-xs text-muted">顧客（任意）</div>
            <select name="customer_id" className="select-field w-full">
              <option value="">顧客を選択（紐付けなし）</option>
              {customerList.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <div className="text-[10px] text-muted">顧客マスタから選択すると、請求書や履歴と紐付けできます</div>
          </div>

          <div className="space-y-1">
            <div className="text-xs text-muted">お客様名（必須）</div>
            <input name="customer_name" className="input-field w-full" required />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <div className="text-xs text-muted">車種</div>
              <input name="model" className="input-field w-full" />
            </div>
            <div className="space-y-1">
              <div className="text-xs text-muted">ナンバー</div>
              <input name="plate" className="input-field w-full" />
            </div>
          </div>
        </section>

        {schema ? (
          <section className="space-y-4">
            <div className="text-sm font-semibold text-primary">テンプレ項目</div>

            {schema.sections.map((sec) => (
              <div key={sec.title} className="glass-card p-3 space-y-3">
                <div className="font-semibold text-sm text-primary">{sec.title}</div>

                <div className="grid grid-cols-2 gap-3">
                  {sec.fields.map((f) => {
                    const name = `f__${f.key}`;

                    if (f.type === "checkbox") {
                      return (
                        <label key={f.key} className="flex items-center gap-2 text-sm text-primary">
                          <input type="checkbox" name={name} className="h-4 w-4 accent-[#0071e3]" />
                          <span>{f.label}</span>
                        </label>
                      );
                    }

                    if (f.type === "select") {
                      return (
                        <div key={f.key} className="space-y-1">
                          <div className="text-xs text-muted">{f.label}{f.required ? "（必須）" : ""}</div>
                          <select name={name} className="select-field w-full" required={!!f.required}>
                            <option value="">選択</option>
                            {(f.options ?? []).map((opt) => (<option key={opt} value={opt}>{opt}</option>))}
                          </select>
                        </div>
                      );
                    }

                    if (f.type === "multiselect") {
                      return (
                        <div key={f.key} className="space-y-1 col-span-2">
                          <div className="text-xs text-muted">{f.label}{f.required ? "（必須）" : ""}</div>
                          <select name={name} multiple className="select-field w-full h-28" required={!!f.required}>
                            {(f.options ?? []).map((opt) => (<option key={opt} value={opt}>{opt}</option>))}
                          </select>
                          <div className="text-[10px] text-muted">Ctrl/Shiftで複数選択</div>
                        </div>
                      );
                    }

                    if (f.type === "textarea") {
                      return (
                        <div key={f.key} className="space-y-1 col-span-2">
                          <div className="text-xs text-muted">{f.label}{f.required ? "（必須）" : ""}</div>
                          <textarea name={name} className="input-field w-full" rows={3} required={!!f.required} />
                        </div>
                      );
                    }

                    if (f.type === "number") {
                      return (
                        <div key={f.key} className="space-y-1">
                          <div className="text-xs text-muted">{f.label}{f.required ? "（必須）" : ""}</div>
                          <input type="number" name={name} className="input-field w-full" required={!!f.required} />
                        </div>
                      );
                    }

                    if (f.type === "date") {
                      return (
                        <div key={f.key} className="space-y-1">
                          <div className="text-xs text-muted">{f.label}{f.required ? "（必須）" : ""}</div>
                          <input type="date" name={name} className="input-field w-full" required={!!f.required} />
                        </div>
                      );
                    }

                    return (
                      <div key={f.key} className="space-y-1">
                        <div className="text-xs text-muted">{f.label}{f.required ? "（必須）" : ""}</div>
                        <input name={name} className="input-field w-full" required={!!f.required} />
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </section>
        ) : null}

        <section className="space-y-3">
          <div className="text-sm font-semibold text-primary">自由記述・条件</div>
          <div className="space-y-1">
            <div className="text-xs text-muted">施工内容（自由記述）</div>
            <textarea name="content_free_text" className="input-field w-full" rows={4} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <div className="text-xs text-muted">施工料金（円）</div>
              <input type="number" name="service_price" min="0" className="input-field w-full" placeholder="50000" />
            </div>
            <div className="space-y-1">
              <div className="text-xs text-muted">有効条件（テキスト）</div>
              <input name="expiry_value" className="input-field w-full" placeholder="半年ごとにメンテ推奨 など" />
            </div>
          </div>
          <div className="text-[10px] text-muted">※ 施工料金は当事者（施工店・車両所有者・保険会社）のみ閲覧可能です</div>
        </section>

        <button className="btn-primary w-full">発行</button>
      </form>
    </div>
  );
}
