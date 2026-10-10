import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { hasMinRole } from "@/lib/auth/roles";
import LessonForm, { EMPTY_VALUES } from "../LessonForm";

export const dynamic = "force-dynamic";

export default async function NewLessonPage() {
  const supabase = await createSupabaseServerClient();
  const caller = await resolveCallerWithRole(supabase);
  if (!caller) redirect("/login");
  if (!hasMinRole(caller.role, "admin")) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-12 text-center">
        <p className="text-sm text-warning">レッスン投稿は管理者権限が必要です</p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="mb-6">
        <Link href="/admin/academy/learn" className="text-sm text-accent hover:underline">
          ← オンライン学習
        </Link>
        <h1 className="text-xl font-bold text-primary mt-2 flex items-center gap-2">レッスンを投稿</h1>
        <p className="text-sm text-muted mt-1">
          先輩加盟店として知識を共有しましょう。良いレッスンには評価が集まり、投稿者の還元につながります。
        </p>
      </div>
      <LessonForm initial={EMPTY_VALUES} mode="create" canPublishAsPlatform={caller.role === "super_admin"} />
    </div>
  );
}
