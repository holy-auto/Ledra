import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import EditorClient from "./EditorClient";

function hasDuplicateKeys(obj: any): boolean {
  const counts = new Map<string, number>();
  for (const sec of obj.sections ?? []) {
    for (const f of sec.fields ?? []) {
      const k = String(f.key ?? "").trim();
      if (!k) continue;
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
  }
  for (const c of counts.values()) if (c >= 2) return true;
  return false;
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ tid?: string; ok?: string; e?: string }>;
}) {
  const sp = await searchParams;
  const tid = sp.tid ?? "";
  if (!tid) return <div className="text-sm text-muted">tid がありません</div>;

  const supabase = await createSupabaseServerClient();
  const { data: userRes } = await supabase.auth.getUser();
  if (!userRes.user) redirect(`/login?next=${encodeURIComponent(`/admin/templates/edit?tid=${tid}`)}`);

  const { data: mem } = await supabase
    .from("tenant_memberships")
    .select("tenant_id")
    .limit(1)
    .single();

  if (!mem) return <div className="text-sm text-muted">tenant_memberships が見つかりません。</div>;
  const tenantId = mem.tenant_id as string;

  const { data: tpl, error } = await supabase
    .from("templates")
    .select("id,name,schema_json,layout_version")
    .eq("id", tid)
    .eq("tenant_id", tenantId)
    .single();

  if (error || !tpl) return <div className="text-sm text-red-500">テンプレが見つかりません。</div>;

  async function save(formData: FormData) {
    "use server";
    const supabase = await createSupabaseServerClient();
    const tid = String(formData.get("tid") || "");
    const tenantId = String(formData.get("tenantId") || "");
    const raw = String(formData.get("schema_json") || "");

    let obj: any;
    try {
      obj = JSON.parse(raw);
    } catch {
      redirect(`/admin/templates/edit?tid=${encodeURIComponent(tid)}&e=json`);
    }

    const allowed = ["text","textarea","number","date","select","multiselect","checkbox"];
    if (typeof obj?.version !== "number" || !Array.isArray(obj?.sections)) {
      redirect(`/admin/templates/edit?tid=${encodeURIComponent(tid)}&e=invalid`);
    }
    for (const sec of obj.sections) {
      if (typeof sec.title !== "string" || !Array.isArray(sec.fields)) {
        redirect(`/admin/templates/edit?tid=${encodeURIComponent(tid)}&e=invalid`);
      }
      for (const f of sec.fields) {
        if (typeof f.key !== "string" || typeof f.label !== "string" || !allowed.includes(f.type)) {
          redirect(`/admin/templates/edit?tid=${encodeURIComponent(tid)}&e=invalid`);
        }
        if ((f.type === "select" || f.type === "multiselect") && !Array.isArray(f.options)) {
          redirect(`/admin/templates/edit?tid=${encodeURIComponent(tid)}&e=invalid`);
        }
      }
    }

    if (hasDuplicateKeys(obj)) {
      redirect(`/admin/templates/edit?tid=${encodeURIComponent(tid)}&e=dupkey`);
    }

    const { error } = await supabase
      .from("templates")
      .update({ schema_json: obj, layout_version: 1 })
      .eq("id", tid)
      .eq("tenant_id", tenantId);

    if (error) redirect(`/admin/templates/edit?tid=${encodeURIComponent(tid)}&e=save`);
    redirect(`/admin/templates/edit?tid=${encodeURIComponent(tid)}&ok=1`);
  }

  const safeSchema = tpl.schema_json ?? { version: 1, sections: [] };
  const initialJson = JSON.stringify(safeSchema, null, 2);

  return (
    <div className="space-y-4">
      <header className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-primary">テンプレ編集（GUI）</h1>
          <div className="text-sm text-muted">{tpl.name}</div>
          <div className="text-xs text-muted">tid: <span className="font-mono">{tpl.id}</span></div>
        </div>
        <div className="flex gap-3 text-sm">
          <Link className="underline text-accent hover:text-accent" href="/admin/templates">一覧へ</Link>
          <Link className="underline text-accent hover:text-accent" href="/admin/certificates/new">発行</Link>
        </div>
      </header>

      {sp.ok ? <div className="glass-card p-3 text-sm text-emerald-400">保存しました</div> : null}
      {sp.e === "dupkey" ? <div className="glass-card p-3 text-sm text-red-500">keyが重複しています（保存できません）</div> : null}
      {sp.e === "json" ? <div className="glass-card p-3 text-sm text-red-500">JSONが不正です</div> : null}
      {sp.e === "invalid" ? <div className="glass-card p-3 text-sm text-red-500">schema_jsonの形式が不正です</div> : null}
      {sp.e === "save" ? <div className="glass-card p-3 text-sm text-red-500">保存に失敗しました</div> : null}

      <form action={save} className="space-y-3">
        <input type="hidden" name="tid" value={tpl.id} />
        <input type="hidden" name="tenantId" value={tenantId} />

        <EditorClient initialJson={initialJson} />

        <button className="btn-primary w-full">保存</button>
      </form>
    </div>
  );
}
