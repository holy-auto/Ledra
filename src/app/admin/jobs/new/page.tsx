import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import PageHeader from "@/components/ui/PageHeader";
import FirstUseInlineGuide from "@/components/ui/FirstUseInlineGuide";
import WalkinJobClient from "./WalkinJobClient";

/**
 * 飛び込み案件開始 (Walk-in Job Intake)
 * ------------------------------------------------------------
 * 予約なしで来店したお客様 / その場発注の案件に対して、
 * 即座に reservation を作成 (status = arrived, date = today) し、
 * そのまま /admin/jobs/[id] へ遷移させる軽量フォーム。
 *
 * 「予約が無い業務はワークフローに乗らない」問題への対応。
 */

export default async function WalkinJobPage() {
  const supabase = await createSupabaseServerClient();
  const { data: userRes } = await supabase.auth.getUser();
  if (!userRes.user) redirect("/login?next=/admin/jobs/new");

  return (
    <main className="space-y-6">
      <PageHeader
        tag="JOB"
        title="飛び込み案件を開始"
        description="予約なしで来店された案件を即座にワークフローに乗せます。最小限の情報で開始し、後から編集できます。"
      />
      <FirstUseInlineGuide
        storageKey="jobs_new"
        title="飛び込み案件とは"
        description="予約が無いまま来店した・その場発注になった案件を、数秒でワークフローに乗せるための入口です。"
        steps={[
          {
            title: "タイトルだけ入れて開始",
            description: "デフォルトで日付入りの案件名が入ります。そのままでもOK。",
          },
          {
            title: "開始ステータスを選ぶ",
            description: "「来店・受付」または「作業中」から選択。後から進められます。",
          },
          {
            title: "後から顧客・車両を紐付け",
            description: "開始後の案件画面で既存顧客の検索・新規作成ができます。",
          },
        ]}
      />
      <Suspense fallback={null}>
        <WalkinJobClient />
      </Suspense>
    </main>
  );
}
