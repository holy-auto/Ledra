import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import PageHeader from "@/components/ui/PageHeader";
import LineKnowledgeClient from "./LineKnowledgeClient";

/**
 * `/admin/settings/line-knowledge`
 * ----------------------------------------------------------------
 * LINE 公式アカウントの AI 自動返信に「学習」させる店舗ナレッジを
 * 管理するページ。ここに登録した内容だけを根拠に AI が返信する。
 *
 * - 認証は他の admin 配下と同じく `resolveCallerWithRole`
 * - 表示は全ユーザーが可能、編集は admin 以上 (API 側で再チェック)
 * - 自動返信の ON/OFF は AI 自動入力設定 (auto_reply_knowledge) 側で行う
 */

export const dynamic = "force-dynamic";

export default async function LineKnowledgeSettingsPage() {
  const supabase = await createSupabaseServerClient();
  const caller = await resolveCallerWithRole(supabase);
  if (!caller) redirect("/login?next=/admin/settings/line-knowledge");

  return (
    <div className="space-y-6">
      <PageHeader
        tag="LINE KNOWLEDGE"
        title="LINEナレッジ (自動返信の学習)"
        description="営業時間・駐車場・対応可否・支払い方法など、LINE 公式アカウントの AI 自動返信に答えさせたい内容を登録します。AI はここに登録した内容だけを根拠に返信し、登録が無い質問はスタッフ対応に残します。"
        actions={
          <Link href="/admin/settings" className="btn-secondary">
            店舗設定へ戻る
          </Link>
        }
      />
      <LineKnowledgeClient role={caller.role} />
    </div>
  );
}
