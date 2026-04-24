import Link from "next/link";
import { redirect } from "next/navigation";
import PageHeader from "@/components/ui/PageHeader";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import SiteContentForm, { type SiteContentFormInitial } from "../SiteContentForm";
import type { SiteContentType } from "@/lib/validations/site-content-post";

export const dynamic = "force-dynamic";

const DEFAULT_INITIAL: SiteContentFormInitial = {
  type: "blog",
  status: "draft",
  slug: "",
  title: "",
  excerpt: "",
  body: "",
  hero_image_url: "",
  tags: [],
  author: "",
  published_at: null,
  event_start_at: null,
  event_end_at: null,
  location: "",
  online_url: "",
  capacity: null,
  registration_url: "",
};

export default async function SiteContentNewPage(props: { searchParams?: Promise<{ type?: string }> }) {
  const searchParams = (await props.searchParams) ?? {};
  const supabase = await createSupabaseServerClient();
  const { data: userRes } = await supabase.auth.getUser();
  if (!userRes?.user) redirect("/login?next=/admin/site-content/new");

  const initialType =
    searchParams.type === "event" || searchParams.type === "webinar" || searchParams.type === "blog"
      ? (searchParams.type as SiteContentType)
      : "blog";

  const initial: SiteContentFormInitial = { ...DEFAULT_INITIAL, type: initialType };

  return (
    <div className="space-y-6">
      <PageHeader
        tag="SITE CONTENT"
        title="新規作成"
        description="ブログ・イベント・ウェビナーを新規作成します。"
        actions={
          <Link href="/admin/site-content" className="btn-secondary">
            一覧へ戻る
          </Link>
        }
      />
      <SiteContentForm initial={initial} />
    </div>
  );
}
