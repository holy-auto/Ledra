import { redirect } from "next/navigation";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole, requireMinRole } from "@/lib/auth/checkRole";
import PageHeader from "@/components/ui/PageHeader";
import FieldKnowledgeClient from "./FieldKnowledgeClient";

/**
 * `/admin/field-knowledge`
 * ----------------------------------------------------------------
 * 現場スタッフ向けの施工ナレッジ (車種別注意点・配線ルート・クレーム事例) を
 * 登録し、AI に質問して引き出すページ。AI はここに登録した内容だけを根拠に
 * 答え、登録が無い内容は「確認が必要」と返す (ベテランの知見を資産化)。
 *
 * - 認証は他の admin 配下と同じく resolveCallerWithRole
 * - 表示は全メンバー、登録・削除は staff 以上 (API 側で再チェック)
 * - 質問 (ask) はプラン機能 ai_academy_qa (Standard 以上・API 側でチェック)
 */
export const dynamic = "force-dynamic";

export default async function FieldKnowledgePage() {
  const supabase = await createSupabaseServerClient();
  const caller = await resolveCallerWithRole(supabase);
  if (!caller) redirect("/login?next=/admin/field-knowledge");

  const canEdit = requireMinRole(caller, "staff");

  return (
    <div className="space-y-6">
      <PageHeader
        tag="FIELD KNOWLEDGE"
        title="施工ナレッジ (現場の勘所)"
        description="車種別の注意点・配線ルート・クレーム事例など、ベテランの知見を登録しておくと、スタッフが AI に質問して引き出せます。AI は登録した内容だけを根拠に答え、記録に無い内容は「確認が必要」と返します。"
      />
      <FieldKnowledgeClient canEdit={canEdit} />
    </div>
  );
}
