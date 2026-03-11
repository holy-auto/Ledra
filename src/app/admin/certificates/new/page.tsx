import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { makePublicId } from "@/lib/publicId";
import { checkAdminFeature } from "@/lib/billing/adminFeatureGate";

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

  if (!mem) {
    return (
      <main className="min-h-screen bg-neutral-50 p-6">
        <p className="text-sm text-neutral-600">tenant_memberships が見つかりません。</p>
      </main>
    );
  }
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

  if (tplErr) {
    return (
      <main className="min-h-screen bg-neutral-50 p-6">
        <p className="text-sm text-red-700">テンプレ読み込みエラー: {tplErr.message}</p>
      </main>
    );
  }

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

    const customer_name = String(formData.get("customer_name") || "").trim();
    const model = String(formData.get("model") || "").trim();
    const plate = String(formData.get("plate") || "").trim();
    const content_free_text = String(formData.get("content_free_text") || "").trim();
    const expiry_value = String(formData.get("expiry_value") || "").trim();

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

  const inputCls = "w-full rounded-xl border border-neutral-300 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-400";
  const labelCls = "block space-y-1.5";
  const labelTextCls = "text-sm font-medium text-neutral-700";

  return (
    <main className="min-h-screen bg-neutral-50 p-6">
      <div className="mx-auto max-w-3xl space-y-6">

        {/* Header */}
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-3">
            <div className="inline-flex rounded-full border border-neutral-300 bg-white px-3 py-1 text-[11px] font-semibold tracking-[0.22em] text-neutral-600">
              NEW CERTIFICATE
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-neutral-900">
                新規証明書を発行
              </h1>
              <p className="mt-2 text-sm text-neutral-600">
                テンプレートを選択して施工証明書を発行します。
              </p>
            </div>
          </div>

          <div className="flex gap-3 items-center">
            <Link
              href="/admin/certificates"
              className="rounded-xl border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100"
            >
              証明書一覧
            </Link>
            <Link
              href="/admin/templates"
              className="rounded-xl border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100"
            >
              テンプレ管理
            </Link>
          </div>
        </header>

        {/* Template selector */}
        <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
          <div className="mb-3">
            <div className="text-xs font-semibold tracking-[0.18em] text-neutral-500">TEMPLATE</div>
            <div className="mt-1 text-base font-semibold text-neutral-900">テンプレートを選択</div>
          </div>
          <form action="/admin/certificates/new" method="get" className="flex gap-3 items-center">
            <select
              name="tid"
              defaultValue={tid}
              className="flex-1 rounded-xl border border-neutral-300 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-400"
            >
              {list.length === 0 ? (
                <option value="">テンプレートがありません</option>
              ) : (
                list.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))
              )}
            </select>
            <button
              type="submit"
              className="rounded-xl border border-neutral-300 bg-white px-4 py-2.5 text-sm font-medium text-neutral-700 hover:bg-neutral-100 whitespace-nowrap"
            >
              選択
            </button>
          </form>
          {!tenantLogoPath ? (
            <p className="mt-2 text-xs text-amber-600">
              ロゴ未設定 —{" "}
              <Link href="/admin/logo" className="underline">
                ロゴを設定する
              </Link>
            </p>
          ) : null}
        </div>

        {/* Issue form */}
        <form action={createCert} className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm space-y-6">
          <input type="hidden" name="template_id" value={selected?.id ?? ""} />
          <input type="hidden" name="template_name" value={selected?.name ?? ""} />

          {/* Basic info */}
          <div>
            <div className="mb-4">
              <div className="text-xs font-semibold tracking-[0.18em] text-neutral-500">BASIC INFO</div>
              <div className="mt-1 text-base font-semibold text-neutral-900">基本情報</div>
            </div>

            <div className="space-y-4">
              <label className={labelCls}>
                <span className={labelTextCls}>お客様名 <span className="text-red-500">*</span></span>
                <input
                  name="customer_name"
                  className={inputCls}
                  placeholder="山田 太郎"
                  required
                />
              </label>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className={labelCls}>
                  <span className={labelTextCls}>車種</span>
                  <input name="model" className={inputCls} placeholder="Prius" />
                </label>
                <label className={labelCls}>
                  <span className={labelTextCls}>ナンバー</span>
                  <input name="plate" className={inputCls} placeholder="水戸 300 あ 12-34" />
                </label>
              </div>
            </div>
          </div>

          {/* Template fields */}
          {schema ? (
            <div className="border-t border-neutral-100 pt-6 space-y-5">
              <div>
                <div className="text-xs font-semibold tracking-[0.18em] text-neutral-500">TEMPLATE FIELDS</div>
                <div className="mt-1 text-base font-semibold text-neutral-900">テンプレート項目</div>
              </div>

              {schema.sections.map((sec) => (
                <div key={sec.title} className="rounded-xl border border-neutral-200 p-4 space-y-4">
                  <div className="text-sm font-semibold text-neutral-800">{sec.title}</div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    {sec.fields.map((f) => {
                      const name = `f__${f.key}`;

                      if (f.type === "checkbox") {
                        return (
                          <label key={f.key} className="flex items-center gap-2.5 text-sm text-neutral-700">
                            <input type="checkbox" name={name} className="h-4 w-4 rounded border-neutral-300" />
                            <span>{f.label}</span>
                          </label>
                        );
                      }

                      if (f.type === "select") {
                        return (
                          <div key={f.key} className={labelCls}>
                            <span className={labelTextCls}>{f.label}{f.required ? " *" : ""}</span>
                            <select name={name} className={inputCls} required={!!f.required}>
                              <option value="">選択してください</option>
                              {(f.options ?? []).map((opt) => (
                                <option key={opt} value={opt}>
                                  {opt}
                                </option>
                              ))}
                            </select>
                          </div>
                        );
                      }

                      if (f.type === "multiselect") {
                        return (
                          <div key={f.key} className={`${labelCls} sm:col-span-2`}>
                            <span className={labelTextCls}>{f.label}{f.required ? " *" : ""}</span>
                            <select
                              name={name}
                              multiple
                              className="w-full rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm h-28 focus:outline-none focus:ring-2 focus:ring-neutral-400"
                              required={!!f.required}
                            >
                              {(f.options ?? []).map((opt) => (
                                <option key={opt} value={opt}>
                                  {opt}
                                </option>
                              ))}
                            </select>
                            <p className="text-[11px] text-neutral-400">Ctrl / Shift で複数選択</p>
                          </div>
                        );
                      }

                      if (f.type === "textarea") {
                        return (
                          <div key={f.key} className={`${labelCls} sm:col-span-2`}>
                            <span className={labelTextCls}>{f.label}{f.required ? " *" : ""}</span>
                            <textarea
                              name={name}
                              className="w-full rounded-xl border border-neutral-300 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-400"
                              rows={3}
                              required={!!f.required}
                            />
                          </div>
                        );
                      }

                      if (f.type === "number") {
                        return (
                          <div key={f.key} className={labelCls}>
                            <span className={labelTextCls}>{f.label}{f.required ? " *" : ""}</span>
                            <input type="number" name={name} className={inputCls} required={!!f.required} />
                          </div>
                        );
                      }

                      if (f.type === "date") {
                        return (
                          <div key={f.key} className={labelCls}>
                            <span className={labelTextCls}>{f.label}{f.required ? " *" : ""}</span>
                            <input type="date" name={name} className={inputCls} required={!!f.required} />
                          </div>
                        );
                      }

                      return (
                        <div key={f.key} className={labelCls}>
                          <span className={labelTextCls}>{f.label}{f.required ? " *" : ""}</span>
                          <input name={name} className={inputCls} required={!!f.required} />
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          {/* Free text & conditions */}
          <div className="border-t border-neutral-100 pt-6 space-y-4">
            <div>
              <div className="text-xs font-semibold tracking-[0.18em] text-neutral-500">CONTENT</div>
              <div className="mt-1 text-base font-semibold text-neutral-900">自由記述・条件</div>
            </div>

            <label className={`${labelCls} block`}>
              <span className={labelTextCls}>施工内容（自由記述）</span>
              <textarea
                name="content_free_text"
                className="w-full rounded-xl border border-neutral-300 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-400"
                rows={4}
                placeholder="施工内容の詳細を記入してください"
              />
            </label>

            <label className={labelCls}>
              <span className={labelTextCls}>有効条件（テキスト）</span>
              <input
                name="expiry_value"
                className={inputCls}
                placeholder="半年ごとにメンテ推奨 など"
              />
            </label>
          </div>

          {/* Actions */}
          <div className="border-t border-neutral-100 pt-6 flex gap-3">
            <button
              type="submit"
              className="rounded-xl border border-neutral-900 bg-neutral-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-neutral-700"
            >
              証明書を発行する
            </button>
            <Link
              href="/admin/certificates"
              className="rounded-xl border border-neutral-300 bg-white px-5 py-2.5 text-sm font-medium text-neutral-700 hover:bg-neutral-100"
            >
              キャンセル
            </Link>
          </div>
        </form>

      </div>
    </main>
  );
}
