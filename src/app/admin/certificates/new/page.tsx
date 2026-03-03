import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { makePublicId } from "@/lib/publicId";

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

  if (!mem) return <main className="p-6">tenant_memberships が見つかりません。</main>;
  const tenantId = mem.tenant_id as string;

  const { data: tenantRow } = await supabase
    .from("tenants")
    .select("logo_asset_path")
    .eq("id", tenantId)
    .single();
  const tenantLogoPath = (tenantRow?.logo_asset_path as string | null) ?? null;

  const { data: templates, error: tplErr } = await supabase
    .from("templates")
    .select("id,name,schema_json,created_at")
    .eq("scope", "tenant")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false });

  if (tplErr) return <main className="p-6">テンプレ読み込みエラー: {tplErr.message}</main>;

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

    // ✅ snapshot 用にテンプレの schema_json を server action 側で必ず取得
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

    const customer_name = String(formData.get("customer_name") || "").trim();
    const model = String(formData.get("model") || "").trim();
    const plate = String(formData.get("plate") || "").trim();
    const content_free_text = String(formData.get("content_free_text") || "").trim();
    const expiry_value = String(formData.get("expiry_value") || "").trim();

    if (!customer_name) redirect(`/admin/certificates/new?tid=${encodeURIComponent(template_id)}&e=1`);

    // preset values（multiselectは配列化）
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
      customer_name,
      vehicle_info_json: { model, plate },
      content_free_text,
      content_preset_json: { template_id, template_name, schema_snapshot, values },
      expiry_type: "text",
      expiry_value,
      footer_variant: "holy",
      logo_asset_path: tenantLogoPath,
      created_by: userId,
    });

    if (error) redirect(`/admin/certificates/new?tid=${encodeURIComponent(template_id)}&e=2`);

    redirect(`/admin/certificates/new/success?pid=${encodeURIComponent(public_id)}`);
  }

  return (
    <main className="p-6 max-w-2xl space-y-4">
      <header className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">新規発行（テンプレ）</h1>
          <div className="text-sm text-gray-500">tenant: <span className="font-mono">{tenantId}</span></div>
          <div className="text-xs text-gray-500">ロゴ: {tenantLogoPath ? tenantLogoPath : "未設定（/admin/logo）"}</div>
        </div>
        <div className="flex gap-3 items-center">
          <Link className="underline text-sm" href="/admin/certificates">一覧へ</Link>
          <Link className="underline text-sm" href="/admin/templates">テンプレ</Link>
        </div>
      </header>

      <form action="/admin/certificates/new" method="get" className="border rounded p-4 space-y-2">
        <div className="text-xs text-gray-500">テンプレ</div>
        <div className="flex gap-2 items-center">
          <select name="tid" defaultValue={tid} className="border rounded px-3 py-2 text-sm w-full">
            {list.map((t) => (<option key={t.id} value={t.id}>{t.name}</option>))}
          </select>
          <button className="border rounded px-3 py-2 text-sm whitespace-nowrap">選択</button>
        </div>
      </form>

      <form action={createCert} className="border rounded p-4 space-y-4">
        <input type="hidden" name="template_id" value={selected?.id ?? ""} />
        <input type="hidden" name="template_name" value={selected?.name ?? ""} />

        <section className="space-y-3">
          <div className="text-sm font-semibold">基本情報</div>

          <div className="space-y-1">
            <div className="text-xs text-gray-500">お客様名（必須）</div>
            <input name="customer_name" className="border rounded px-3 py-2 w-full text-sm" required />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <div className="text-xs text-gray-500">車種</div>
              <input name="model" className="border rounded px-3 py-2 w-full text-sm" />
            </div>
            <div className="space-y-1">
              <div className="text-xs text-gray-500">ナンバー</div>
              <input name="plate" className="border rounded px-3 py-2 w-full text-sm" />
            </div>
          </div>
        </section>

        {schema ? (
          <section className="space-y-4">
            <div className="text-sm font-semibold">テンプレ項目</div>

            {schema.sections.map((sec) => (
              <div key={sec.title} className="border rounded p-3 space-y-3">
                <div className="font-semibold text-sm">{sec.title}</div>

                <div className="grid grid-cols-2 gap-3">
                  {sec.fields.map((f) => {
                    const name = `f__${f.key}`;

                    if (f.type === "checkbox") {
                      return (
                        <label key={f.key} className="flex items-center gap-2 text-sm">
                          <input type="checkbox" name={name} className="h-4 w-4" />
                          <span>{f.label}</span>
                        </label>
                      );
                    }

                    if (f.type === "select") {
                      return (
                        <div key={f.key} className="space-y-1">
                          <div className="text-xs text-gray-500">{f.label}{f.required ? "（必須）" : ""}</div>
                          <select name={name} className="border rounded px-3 py-2 w-full text-sm" required={!!f.required}>
                            <option value="">選択</option>
                            {(f.options ?? []).map((opt) => (<option key={opt} value={opt}>{opt}</option>))}
                          </select>
                        </div>
                      );
                    }

                    if (f.type === "multiselect") {
                      return (
                        <div key={f.key} className="space-y-1 col-span-2">
                          <div className="text-xs text-gray-500">{f.label}{f.required ? "（必須）" : ""}</div>
                          <select name={name} multiple className="border rounded px-3 py-2 w-full text-sm h-28" required={!!f.required}>
                            {(f.options ?? []).map((opt) => (<option key={opt} value={opt}>{opt}</option>))}
                          </select>
                          <div className="text-[10px] text-gray-500">Ctrl/Shiftで複数選択</div>
                        </div>
                      );
                    }

                    if (f.type === "textarea") {
                      return (
                        <div key={f.key} className="space-y-1 col-span-2">
                          <div className="text-xs text-gray-500">{f.label}{f.required ? "（必須）" : ""}</div>
                          <textarea name={name} className="border rounded px-3 py-2 w-full text-sm" rows={3} required={!!f.required} />
                        </div>
                      );
                    }

                    if (f.type === "number") {
                      return (
                        <div key={f.key} className="space-y-1">
                          <div className="text-xs text-gray-500">{f.label}{f.required ? "（必須）" : ""}</div>
                          <input type="number" name={name} className="border rounded px-3 py-2 w-full text-sm" required={!!f.required} />
                        </div>
                      );
                    }

                    if (f.type === "date") {
                      return (
                        <div key={f.key} className="space-y-1">
                          <div className="text-xs text-gray-500">{f.label}{f.required ? "（必須）" : ""}</div>
                          <input type="date" name={name} className="border rounded px-3 py-2 w-full text-sm" required={!!f.required} />
                        </div>
                      );
                    }

                    return (
                      <div key={f.key} className="space-y-1">
                        <div className="text-xs text-gray-500">{f.label}{f.required ? "（必須）" : ""}</div>
                        <input name={name} className="border rounded px-3 py-2 w-full text-sm" required={!!f.required} />
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </section>
        ) : null}

        <section className="space-y-3">
          <div className="text-sm font-semibold">自由記述・条件</div>
          <div className="space-y-1">
            <div className="text-xs text-gray-500">施工内容（自由記述）</div>
            <textarea name="content_free_text" className="border rounded px-3 py-2 w-full text-sm" rows={4} />
          </div>
          <div className="space-y-1">
            <div className="text-xs text-gray-500">有効条件（テキスト）</div>
            <input name="expiry_value" className="border rounded px-3 py-2 w-full text-sm" placeholder="半年ごとにメンテ推奨 など" />
          </div>
        </section>

        <button className="border rounded px-3 py-2 text-sm w-full">発行</button>
      </form>
    </main>
  );
}