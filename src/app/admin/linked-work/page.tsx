import { redirect } from "next/navigation";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { listLinkedWork } from "@/lib/staff/tenantLink";
import LinkedWorkClient from "./LinkedWorkClient";

/**
 * 外注側の画面: 元請けから連携コードで繋がったあと、**自分が作業した記録だけ**が出る。
 *
 * 外注職人もアカウントを持つ前提なので（代表判断 2026-09-03、利用は必須）、
 * 認証は通常のログイン。トークン URL の経路は持たない。
 *
 * 顧客名は出さない。開示列は src/lib/staff/portfolioDisclosure.ts の許可リスト。
 */
export const dynamic = "force-dynamic";

export default async function LinkedWorkPage() {
  const supabase = await createSupabaseServerClient();
  const caller = await resolveCallerWithRole(supabase);
  if (!caller) redirect("/login?next=/admin/linked-work");

  const work = await listLinkedWork(caller.tenantId);
  return <LinkedWorkClient initial={work} />;
}
