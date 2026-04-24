"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import Input from "@/components/ui/Input";
import Textarea from "@/components/ui/Textarea";
import Select from "@/components/ui/Select";
import FormField from "@/components/ui/FormField";
import Button from "@/components/ui/Button";
import {
  SITE_CONTENT_TYPES,
  SITE_CONTENT_STATUSES,
  SITE_CONTENT_TYPE_LABELS,
  SITE_CONTENT_STATUS_LABELS,
  type SiteContentStatus,
  type SiteContentType,
} from "@/lib/validations/site-content-post";
import { createSiteContentAction, updateSiteContentAction } from "./actions";

export type SiteContentFormInitial = {
  id?: string;
  type: SiteContentType;
  status: SiteContentStatus;
  slug: string;
  title: string;
  excerpt: string | null;
  body: string;
  hero_image_url: string | null;
  tags: string[];
  author: string | null;
  published_at: string | null;
  event_start_at: string | null;
  event_end_at: string | null;
  location: string | null;
  online_url: string | null;
  capacity: number | null;
  registration_url: string | null;
};

function toInputDateTime(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

export default function SiteContentForm({ initial }: { initial: SiteContentFormInitial }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  const [type, setType] = useState<SiteContentType>(initial.type);
  const [status, setStatus] = useState<SiteContentStatus>(initial.status);
  const [title, setTitle] = useState(initial.title);
  const [slug, setSlug] = useState(initial.slug);
  const [slugTouched, setSlugTouched] = useState(Boolean(initial.slug));
  const [excerpt, setExcerpt] = useState(initial.excerpt ?? "");
  const [body, setBody] = useState(initial.body ?? "");
  const [heroImageUrl, setHeroImageUrl] = useState(initial.hero_image_url ?? "");
  const [tags, setTags] = useState(initial.tags.join(", "));
  const [author, setAuthor] = useState(initial.author ?? "");
  const [publishedAt, setPublishedAt] = useState(toInputDateTime(initial.published_at));
  const [eventStartAt, setEventStartAt] = useState(toInputDateTime(initial.event_start_at));
  const [eventEndAt, setEventEndAt] = useState(toInputDateTime(initial.event_end_at));
  const [location, setLocation] = useState(initial.location ?? "");
  const [onlineUrl, setOnlineUrl] = useState(initial.online_url ?? "");
  const [capacity, setCapacity] = useState(initial.capacity != null ? String(initial.capacity) : "");
  const [registrationUrl, setRegistrationUrl] = useState(initial.registration_url ?? "");

  const isEvent = type === "event" || type === "webinar";
  const isEdit = Boolean(initial.id);

  const handleTitleChange = (v: string) => {
    setTitle(v);
    if (!slugTouched) setSlug(slugify(v));
  };

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErrors({});
    setFormError(null);

    const fd = new FormData();
    fd.set("type", type);
    fd.set("status", status);
    fd.set("slug", slug);
    fd.set("title", title);
    fd.set("excerpt", excerpt);
    fd.set("body", body);
    fd.set("hero_image_url", heroImageUrl);
    fd.set("tags", tags);
    fd.set("author", author);
    fd.set("published_at", publishedAt);
    fd.set("event_start_at", isEvent ? eventStartAt : "");
    fd.set("event_end_at", isEvent ? eventEndAt : "");
    fd.set("location", isEvent ? location : "");
    fd.set("online_url", isEvent ? onlineUrl : "");
    fd.set("capacity", isEvent ? capacity : "");
    fd.set("registration_url", isEvent ? registrationUrl : "");

    startTransition(async () => {
      const res =
        isEdit && initial.id ? await updateSiteContentAction(initial.id, fd) : await createSiteContentAction(fd);

      if (!res.ok) {
        const fieldErrors = "fieldErrors" in res ? res.fieldErrors : undefined;
        const errCode = "error" in res ? res.error : "unknown";
        if (fieldErrors) setErrors(fieldErrors);
        setFormError(errCode === "validation_error" ? "入力内容をご確認ください。" : `保存に失敗しました: ${errCode}`);
        return;
      }
      router.push("/admin/site-content");
      router.refresh();
    });
  };

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      {formError && (
        <div className="rounded-xl border border-danger/20 bg-danger-dim px-4 py-3 text-sm text-danger-text">
          {formError}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <FormField label="種別" required error={errors.type}>
          <Select
            value={type}
            onChange={(e) => setType(e.target.value as SiteContentType)}
            options={SITE_CONTENT_TYPES.map((t) => ({ value: t, label: SITE_CONTENT_TYPE_LABELS[t] }))}
          />
        </FormField>
        <FormField label="ステータス" required error={errors.status}>
          <Select
            value={status}
            onChange={(e) => setStatus(e.target.value as SiteContentStatus)}
            options={SITE_CONTENT_STATUSES.map((s) => ({ value: s, label: SITE_CONTENT_STATUS_LABELS[s] }))}
          />
        </FormField>
      </div>

      <FormField label="タイトル" required error={errors.title}>
        <Input
          value={title}
          onChange={(e) => handleTitleChange(e.target.value)}
          placeholder="例: Ledraの新機能をリリースしました"
          error={Boolean(errors.title)}
        />
      </FormField>

      <FormField
        label="スラッグ"
        required
        hint="URLの一部になります。半角英小文字・数字・ハイフンのみ使用可能です。"
        error={errors.slug}
      >
        <Input
          value={slug}
          onChange={(e) => {
            setSlug(e.target.value);
            setSlugTouched(true);
          }}
          placeholder="example-post-slug"
          error={Boolean(errors.slug)}
        />
      </FormField>

      <FormField label="抜粋" hint="一覧ページに表示される要約（任意）" error={errors.excerpt}>
        <Textarea
          value={excerpt}
          onChange={(e) => setExcerpt(e.target.value)}
          rows={3}
          placeholder="記事の要約を入力してください。"
          error={Boolean(errors.excerpt)}
        />
      </FormField>

      <FormField label="本文（Markdown）" error={errors.body}>
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={14}
          placeholder="# 見出し&#10;&#10;本文を Markdown で記述できます。"
          error={Boolean(errors.body)}
          className="font-mono text-sm"
        />
      </FormField>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <FormField label="ヒーロー画像URL" error={errors.hero_image_url}>
          <Input
            type="url"
            value={heroImageUrl}
            onChange={(e) => setHeroImageUrl(e.target.value)}
            placeholder="https://..."
            error={Boolean(errors.hero_image_url)}
          />
        </FormField>
        <FormField label="著者" error={errors.author}>
          <Input
            value={author}
            onChange={(e) => setAuthor(e.target.value)}
            placeholder="Ledra 編集部"
            error={Boolean(errors.author)}
          />
        </FormField>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <FormField label="タグ（カンマ区切り）" hint="例: プロダクト, アップデート" error={errors.tags}>
          <Input
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="プロダクト, 事例"
            error={Boolean(errors.tags)}
          />
        </FormField>
        <FormField label="公開日時" hint="未指定の場合、公開時に現在時刻が設定されます。" error={errors.published_at}>
          <Input
            type="datetime-local"
            value={publishedAt}
            onChange={(e) => setPublishedAt(e.target.value)}
            error={Boolean(errors.published_at)}
          />
        </FormField>
      </div>

      {isEvent && (
        <div className="rounded-2xl border border-border-default bg-surface-hover/40 p-5 space-y-4">
          <div className="text-xs font-medium tracking-wider text-secondary uppercase">
            {SITE_CONTENT_TYPE_LABELS[type]}情報
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <FormField label="開催開始日時" required error={errors.event_start_at}>
              <Input
                type="datetime-local"
                value={eventStartAt}
                onChange={(e) => setEventStartAt(e.target.value)}
                error={Boolean(errors.event_start_at)}
              />
            </FormField>
            <FormField label="開催終了日時" error={errors.event_end_at}>
              <Input
                type="datetime-local"
                value={eventEndAt}
                onChange={(e) => setEventEndAt(e.target.value)}
                error={Boolean(errors.event_end_at)}
              />
            </FormField>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <FormField label="開催場所" hint="会場名や住所" error={errors.location}>
              <Input
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder={type === "webinar" ? "オンライン" : "東京都渋谷区..."}
                error={Boolean(errors.location)}
              />
            </FormField>
            <FormField label="オンライン配信URL" hint="Zoom / Meet / YouTube など" error={errors.online_url}>
              <Input
                type="url"
                value={onlineUrl}
                onChange={(e) => setOnlineUrl(e.target.value)}
                placeholder="https://..."
                error={Boolean(errors.online_url)}
              />
            </FormField>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <FormField label="定員" hint="空欄で無制限" error={errors.capacity}>
              <Input
                type="number"
                min={0}
                value={capacity}
                onChange={(e) => setCapacity(e.target.value)}
                placeholder="50"
                error={Boolean(errors.capacity)}
              />
            </FormField>
            <FormField label="参加申込URL" error={errors.registration_url}>
              <Input
                type="url"
                value={registrationUrl}
                onChange={(e) => setRegistrationUrl(e.target.value)}
                placeholder="https://..."
                error={Boolean(errors.registration_url)}
              />
            </FormField>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 pt-4">
        <Button type="submit" loading={pending}>
          {isEdit ? "更新する" : "作成する"}
        </Button>
        <Button type="button" variant="secondary" onClick={() => router.push("/admin/site-content")} disabled={pending}>
          キャンセル
        </Button>
      </div>
    </form>
  );
}
