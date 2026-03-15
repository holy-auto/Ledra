import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function AdminNewInsuranceCasePage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/admin/insurance-cases/new");

  const { data: membership } = await supabase
    .from("tenant_memberships")
    .select("tenant_id")
    .eq("user_id", user.id)
    .limit(1)
    .single();

  if (!membership?.tenant_id) {
    return (
      <main className="p-6">
        <p className="text-sm text-neutral-600">tenant_memberships が見つかりません。</p>
      </main>
    );
  }

  const tenantId = membership.tenant_id;

  // 車両一覧を取得
  const { data: vehicles } = await supabase
    .from("vehicles")
    .select("id, maker, model, plate_display, customer_name")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(200);

  // 保険会社一覧を取得
  const { data: insurers } = await supabase
    .from("insurers")
    .select("id, name")
    .eq("is_active", true)
    .order("name");

  async function createCase(formData: FormData) {
    "use server";

    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) redirect("/login");

    const { data: membership } = await supabase
      .from("tenant_memberships")
      .select("tenant_id")
      .eq("user_id", user.id)
      .limit(1)
      .single();

    if (!membership?.tenant_id) redirect("/admin/insurance-cases/new?e=no_tenant");

    const vehicleId = String(formData.get("vehicle_id") ?? "").trim();
    const insurerId = String(formData.get("insurer_id") ?? "").trim();
    const caseType = String(formData.get("case_type") ?? "").trim();
    const title = String(formData.get("title") ?? "").trim();
    const description = String(formData.get("description") ?? "").trim();
    const damageSummary = String(formData.get("damage_summary") ?? "").trim();
    const admittedAt = String(formData.get("admitted_at") ?? "").trim();
    const submitNow = formData.get("submit_now") === "1";

    if (!vehicleId || !insurerId || !caseType || !title) {
      redirect("/admin/insurance-cases/new?e=missing_fields");
    }

    // 案件作成
    const { data: caseData, error: caseErr } = await supabase
      .from("insurance_cases")
      .insert({
        tenant_id: membership.tenant_id,
        vehicle_id: vehicleId,
        insurer_id: insurerId,
        case_type: caseType,
        title,
        description: description || null,
        damage_summary: damageSummary || null,
        admitted_at: admittedAt || null,
        status: submitNow ? "submitted" : "draft",
        submitted_at: submitNow ? new Date().toISOString() : null,
        created_by: user.id,
      })
      .select()
      .single();

    if (caseErr) {
      redirect(`/admin/insurance-cases/new?e=${encodeURIComponent(caseErr.message)}`);
    }

    // 起票者を参加者として登録
    await supabase.from("insurance_case_participants").insert({
      case_id: caseData.id,
      user_id: user.id,
      role: "shop_owner",
      added_by: user.id,
    });

    // イベントログ
    await supabase.from("insurance_case_events").insert({
      case_id: caseData.id,
      actor_id: user.id,
      event_type: "created",
      detail: { case_type: caseType, title },
    });

    if (submitNow) {
      await supabase.from("insurance_case_events").insert({
        case_id: caseData.id,
        actor_id: user.id,
        event_type: "submitted",
        detail: {},
      });
    }

    redirect(`/admin/insurance-cases/${caseData.id}?created=1`);
  }

  return (
    <main className="min-h-screen bg-neutral-50 p-6">
      <div className="mx-auto max-w-3xl space-y-6">
        <header className="space-y-3">
          <div className="inline-flex rounded-full border border-neutral-300 bg-white px-3 py-1 text-[11px] font-semibold tracking-[0.22em] text-neutral-600">
            NEW CASE
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-neutral-900">
              保険案件を起票
            </h1>
            <p className="mt-2 text-sm text-neutral-600">
              保険会社に送信する案件を作成します。
            </p>
          </div>
        </header>

        <form action={createCase} className="space-y-6">
          <section className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm space-y-5">
            <h2 className="text-sm font-semibold text-neutral-900">基本情報</h2>

            {/* 車両選択 */}
            <div>
              <label htmlFor="vehicle_id" className="block text-sm font-medium text-neutral-700 mb-1">
                車両 <span className="text-red-500">*</span>
              </label>
              <select
                id="vehicle_id"
                name="vehicle_id"
                required
                className="w-full rounded-xl border border-neutral-300 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-400"
              >
                <option value="">車両を選択...</option>
                {(vehicles ?? []).map((v: any) => (
                  <option key={v.id} value={v.id}>
                    {[v.maker, v.model, v.plate_display, v.customer_name ? `(${v.customer_name})` : ""]
                      .filter(Boolean)
                      .join(" ")}
                  </option>
                ))}
              </select>
            </div>

            {/* 保険会社選択 */}
            <div>
              <label htmlFor="insurer_id" className="block text-sm font-medium text-neutral-700 mb-1">
                保険会社 <span className="text-red-500">*</span>
              </label>
              <select
                id="insurer_id"
                name="insurer_id"
                required
                className="w-full rounded-xl border border-neutral-300 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-400"
              >
                <option value="">保険会社を選択...</option>
                {(insurers ?? []).map((ins: any) => (
                  <option key={ins.id} value={ins.id}>
                    {ins.name}
                  </option>
                ))}
              </select>
              {(!insurers || insurers.length === 0) && (
                <p className="mt-1 text-xs text-amber-600">
                  保険会社が登録されていません。先に保険会社を登録してください。
                </p>
              )}
            </div>

            {/* 案件種別 */}
            <div>
              <label htmlFor="case_type" className="block text-sm font-medium text-neutral-700 mb-1">
                案件種別 <span className="text-red-500">*</span>
              </label>
              <select
                id="case_type"
                name="case_type"
                required
                className="w-full rounded-xl border border-neutral-300 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-400"
              >
                <option value="">種別を選択...</option>
                <option value="accident">事故入庫</option>
                <option value="vehicle_insurance">車両保険利用希望</option>
                <option value="rework_check">再施工確認</option>
                <option value="damage_check">損傷確認</option>
                <option value="other">その他確認依頼</option>
              </select>
            </div>

            {/* タイトル */}
            <div>
              <label htmlFor="title" className="block text-sm font-medium text-neutral-700 mb-1">
                タイトル <span className="text-red-500">*</span>
              </label>
              <input
                id="title"
                name="title"
                type="text"
                required
                placeholder="例: 右フロントドア 板金修理"
                className="w-full rounded-xl border border-neutral-300 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-400"
              />
            </div>

            {/* 入庫日 */}
            <div>
              <label htmlFor="admitted_at" className="block text-sm font-medium text-neutral-700 mb-1">
                入庫日
              </label>
              <input
                id="admitted_at"
                name="admitted_at"
                type="date"
                className="w-full rounded-xl border border-neutral-300 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-400"
              />
            </div>
          </section>

          <section className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm space-y-5">
            <h2 className="text-sm font-semibold text-neutral-900">詳細情報</h2>

            {/* 損傷概要 */}
            <div>
              <label htmlFor="damage_summary" className="block text-sm font-medium text-neutral-700 mb-1">
                損傷概要
              </label>
              <textarea
                id="damage_summary"
                name="damage_summary"
                rows={3}
                placeholder="損傷箇所・程度を入力..."
                className="w-full rounded-xl border border-neutral-300 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-400 resize-none"
              />
            </div>

            {/* 説明 */}
            <div>
              <label htmlFor="description" className="block text-sm font-medium text-neutral-700 mb-1">
                備考
              </label>
              <textarea
                id="description"
                name="description"
                rows={3}
                placeholder="保険会社に伝えたい補足情報..."
                className="w-full rounded-xl border border-neutral-300 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-400 resize-none"
              />
            </div>
          </section>

          {/* Submit */}
          <div className="flex flex-wrap gap-3">
            <button
              type="submit"
              name="submit_now"
              value="0"
              className="rounded-xl border border-neutral-300 bg-white px-5 py-2.5 text-sm font-medium text-neutral-700 hover:bg-neutral-100"
            >
              下書き保存
            </button>
            <button
              type="submit"
              name="submit_now"
              value="1"
              className="btn-primary px-5 py-2.5 text-sm"
            >
              保険会社に送信
            </button>
            <Link
              href="/admin/insurance-cases"
              className="rounded-xl border border-neutral-300 bg-white px-5 py-2.5 text-sm font-medium text-neutral-500 hover:bg-neutral-100"
            >
              キャンセル
            </Link>
          </div>
        </form>
      </div>
    </main>
  );
}
