import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { loadAiAutomationSettings } from "@/lib/ai/automation/policy";
import PageHeader from "@/components/ui/PageHeader";
import AiAutomationSettingsClient from "./AiAutomationSettingsClient";
import AiSandboxPanels from "./AiSandboxPanels";

/**
 * `/admin/settings/ai-automation`
 * ----------------------------------------------------------------
 * テナント単位で「どのフィールドを AI に入力させ、どれを人が手入力するか」
 * を細かく設定するページ。
 *
 * - 認証は他の admin 配下と同じく `resolveCallerWithRole`
 * - 表示は全ユーザーが可能、編集は admin 以上 (API 側 PUT で再チェック)
 * - 未マイグレーション環境ではデフォルト値にフォールバックして画面を壊さない
 */

export const dynamic = "force-dynamic";

export default async function AiAutomationSettingsPage() {
  const supabase = await createSupabaseServerClient();
  const caller = await resolveCallerWithRole(supabase);
  if (!caller) redirect("/login?next=/admin/settings/ai-automation");

  const settings = await loadAiAutomationSettings(caller.tenantId);

  return (
    <div className="space-y-6">
      <PageHeader
        tag="AI AUTOMATION"
        title="AI 自動入力の設定"
        description="施工証明書・車両登録・顧客 intake・案件ワークフローの各フィールドを AI に任せるかどうかを切り替えます。"
        actions={
          <Link href="/admin/settings" className="btn-secondary">
            店舗設定へ戻る
          </Link>
        }
      />

      <AiAutomationSettingsClient
        role={caller.role}
        initialSettings={{
          enabled: settings.enabled,
          fieldPolicies: settings.fieldPolicies,
          confidenceThreshold: settings.confidenceThreshold,
          sourcePolicies: settings.sourcePolicies,
          autoActions: settings.autoActions,
        }}
        loadedFromDb={settings.loadedFromDb}
      />

      <AiSandboxPanels />
    </div>
  );
}
