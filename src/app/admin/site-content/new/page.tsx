import Link from "next/link";
import PageHeader from "@/components/ui/PageHeader";
import { requireSiteContentAdmin } from "../guard";
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
  cta_title: null,
  cta_subtitle: null,
  cta_primary_label: null,
  cta_primary_href: null,
  cta_secondary_label: null,
  cta_secondary_href: null,
  og_title: null,
  og_subtitle: null,
};

export default async function SiteContentNewPage(props: { searchParams?: Promise<{ type?: string }> }) {
  const searchParams = (await props.searchParams) ?? {};
  const supabase = await requireSiteContentAdmin("/admin/site-content/new");

  const initialType =
    searchParams.type === "event" ||
    searchParams.type === "webinar" ||
    searchParams.type === "blog" ||
    searchParams.type === "news"
      ? (searchParams.type as SiteContentType)
      : "blog";

  const initial: SiteContentFormInitial = { ...DEFAULT_INITIAL, type: initialType };

  return (
    <div className="space-y-6">
      <PageHeader
        tag="SITE CONTENT"
        title="新規作成"
        description="お知らせ・ブログ・イベント・ウェビナーを新規作成します。"
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
