import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import LessonForm, { type LessonFormValues } from "../../LessonForm";

export const dynamic = "force-dynamic";

export default async function EditLessonPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const caller = await resolveCallerWithRole(supabase);
  if (!caller) redirect("/login");

  const { data } = await supabase
    .from("academy_lessons")
    .select(
      "id, tenant_id, author_user_id, title, summary, body, category, level, difficulty, video_url, cover_image_url, tags, status",
    )
    .eq("id", id)
    .maybeSingle();

  if (!data) notFound();

  const isAuthor = data.author_user_id === caller.userId;
  const isSuperAdmin = caller.role === "super_admin";
  if (!isAuthor && !isSuperAdmin) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-12 text-center">
        <p className="text-sm text-warning">このレッスンを編集する権限がありません</p>
      </div>
    );
  }

  const initial: LessonFormValues = {
    id: data.id,
    title: data.title ?? "",
    summary: data.summary ?? "",
    body: data.body ?? "",
    category: data.category ?? "general",
    level: (data.level ?? "basic") as LessonFormValues["level"],
    difficulty: data.difficulty ?? 3,
    video_url: data.video_url ?? "",
    cover_image_url: data.cover_image_url ?? "",
    tags: data.tags ?? [],
    status: (data.status === "archived" ? "draft" : (data.status ?? "draft")) as LessonFormValues["status"],
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="mb-6">
        <Link href={`/admin/academy/learn/${id}`} className="text-sm text-accent hover:underline">
          ← レッスン詳細
        </Link>
        <h1 className="text-xl font-bold text-primary mt-2 flex items-center gap-2">レッスンを編集</h1>
      </div>
      <LessonForm initial={initial} mode="edit" canPublishAsPlatform={false} />
    </div>
  );
}
