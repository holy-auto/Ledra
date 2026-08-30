"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const CATEGORIES = [
  { value: "general", label: "全般" },
  { value: "ppf", label: "PPF" },
  { value: "coating", label: "コーティング" },
  { value: "body_repair", label: "ボディリペア" },
  { value: "maintenance", label: "メンテナンス" },
];

const LEVELS = [
  { value: "intro", label: "入門 (Free公開)" },
  { value: "basic", label: "基礎" },
  { value: "standard", label: "標準" },
  { value: "pro", label: "応用" },
];

export interface LessonFormValues {
  id?: string;
  title: string;
  summary: string;
  body: string;
  category: string;
  level: "intro" | "basic" | "standard" | "pro";
  difficulty: number;
  video_url: string;
  cover_image_url: string;
  tags: string[];
  status: "draft" | "published";
}

export const EMPTY_VALUES: LessonFormValues = {
  title: "",
  summary: "",
  body: "",
  category: "general",
  level: "basic",
  difficulty: 3,
  video_url: "",
  cover_image_url: "",
  tags: [],
  status: "draft",
};

export default function LessonForm({
  initial,
  mode,
  canPublishAsPlatform,
}: {
  initial: LessonFormValues;
  mode: "create" | "edit";
  canPublishAsPlatform: boolean;
}) {
  const router = useRouter();
  const [v, setV] = useState<LessonFormValues>(initial);
  const [tagsInput, setTagsInput] = useState(initial.tags.join(", "));
  const [publishAsPlatform, setPublishAsPlatform] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const tags = tagsInput
        .split(",")
        .map((t) => t.trim())
        .filter((t) => t.length > 0)
        .slice(0, 10);

      const payload = {
        title: v.title,
        summary: v.summary || undefined,
        body: v.body,
        category: v.category,
        level: v.level,
        difficulty: v.difficulty,
        video_url: v.video_url,
        cover_image_url: v.cover_image_url,
        tags,
        status: v.status,
        publish_as_platform: publishAsPlatform,
      };

      const url = mode === "create" ? "/api/admin/academy/lessons" : `/api/admin/academy/lessons/${initial.id}`;
      const method = mode === "create" ? "POST" : "PATCH";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message ?? "保存に失敗しました");
        return;
      }

      const id = mode === "create" ? data.id : initial.id;
      router.push(`/admin/academy/learn/${id}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-5">
      {error && (
        <div className="p-3 bg-warning-dim border border-warning/30 rounded-lg text-sm text-warning">{error}</div>
      )}

      <Field label="タイトル" required>
        <input
          type="text"
          value={v.title}
          onChange={(e) => setV({ ...v, title: e.target.value })}
          maxLength={200}
          className="w-full text-sm bg-inset border border-border-subtle rounded-lg px-3 py-2 text-primary focus:outline-none focus:ring-2 focus:ring-accent/40"
          placeholder="例: PPF施工で気をつけるべき5つのポイント"
        />
      </Field>

      <Field label="サマリー" hint="一覧で表示される短い説明 (任意, 500文字まで)">
        <textarea
          value={v.summary}
          onChange={(e) => setV({ ...v, summary: e.target.value })}
          maxLength={500}
          rows={2}
          className="w-full text-sm bg-inset border border-border-subtle rounded-lg px-3 py-2 text-primary focus:outline-none focus:ring-2 focus:ring-accent/40"
        />
      </Field>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Field label="カテゴリ" required>
          <select
            value={v.category}
            onChange={(e) => setV({ ...v, category: e.target.value })}
            className="w-full text-sm bg-inset border border-border-subtle rounded-lg px-3 py-2 text-primary focus:outline-none focus:ring-2 focus:ring-accent/40"
          >
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="レベル" required>
          <select
            value={v.level}
            onChange={(e) => setV({ ...v, level: e.target.value as LessonFormValues["level"] })}
            className="w-full text-sm bg-inset border border-border-subtle rounded-lg px-3 py-2 text-primary focus:outline-none focus:ring-2 focus:ring-accent/40"
          >
            {LEVELS.map((l) => (
              <option key={l.value} value={l.value}>
                {l.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="難易度">
          <select
            value={v.difficulty}
            onChange={(e) => setV({ ...v, difficulty: Number(e.target.value) })}
            className="w-full text-sm bg-inset border border-border-subtle rounded-lg px-3 py-2 text-primary focus:outline-none focus:ring-2 focus:ring-accent/40"
          >
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>
                {"★".repeat(n)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="ステータス">
          <select
            value={v.status}
            onChange={(e) => setV({ ...v, status: e.target.value as LessonFormValues["status"] })}
            className="w-full text-sm bg-inset border border-border-subtle rounded-lg px-3 py-2 text-primary focus:outline-none focus:ring-2 focus:ring-accent/40"
          >
            <option value="draft">下書き</option>
            <option value="published">公開</option>
          </select>
        </Field>
      </div>

      <Field label="本文" required hint="Markdown 風の改行を保持して表示します">
        <textarea
          value={v.body}
          onChange={(e) => setV({ ...v, body: e.target.value })}
          maxLength={50000}
          rows={14}
          className="w-full text-sm bg-inset border border-border-subtle rounded-lg px-3 py-2 text-primary focus:outline-none focus:ring-2 focus:ring-accent/40 font-mono"
          placeholder="施工手順や注意点を具体的に書いてください..."
        />
      </Field>

      <Field label="動画URL" hint="任意 (YouTube/Vimeo 等)">
        <input
          type="url"
          value={v.video_url}
          onChange={(e) => setV({ ...v, video_url: e.target.value })}
          maxLength={1000}
          className="w-full text-sm bg-inset border border-border-subtle rounded-lg px-3 py-2 text-primary focus:outline-none focus:ring-2 focus:ring-accent/40"
          placeholder="https://..."
        />
      </Field>

      <Field label="カバー画像URL" hint="任意">
        <input
          type="url"
          value={v.cover_image_url}
          onChange={(e) => setV({ ...v, cover_image_url: e.target.value })}
          maxLength={1000}
          className="w-full text-sm bg-inset border border-border-subtle rounded-lg px-3 py-2 text-primary focus:outline-none focus:ring-2 focus:ring-accent/40"
          placeholder="https://..."
        />
      </Field>

      <Field label="タグ" hint="カンマ区切り (10個まで)">
        <input
          type="text"
          value={tagsInput}
          onChange={(e) => setTagsInput(e.target.value)}
          className="w-full text-sm bg-inset border border-border-subtle rounded-lg px-3 py-2 text-primary focus:outline-none focus:ring-2 focus:ring-accent/40"
          placeholder="例: ppf, 入門, トラブル対策"
        />
      </Field>

      {canPublishAsPlatform && mode === "create" && (
        <label className="flex items-center gap-2 text-sm text-secondary">
          <input type="checkbox" checked={publishAsPlatform} onChange={(e) => setPublishAsPlatform(e.target.checked)} />
          運営公式コンテンツとして投稿 (tenant_id を持たない)
        </label>
      )}

      <div className="flex items-center gap-3 pt-2">
        <button
          onClick={submit}
          disabled={submitting || v.title.length < 3 || v.body.length < 10}
          className="text-sm px-5 py-2 bg-accent text-white rounded-lg hover:bg-accent/90 disabled:opacity-50 transition-colors"
        >
          {submitting ? "保存中..." : mode === "create" ? "作成" : "更新"}
        </button>
        <button
          onClick={() => router.back()}
          className="text-sm px-4 py-2 bg-inset border border-border-subtle rounded-lg text-secondary hover:bg-surface transition-colors"
        >
          キャンセル
        </button>
      </div>
    </div>
  );
}

function Field({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-secondary mb-1">
        {label}
        {required && <span className="text-warning ml-1">*</span>}
        {hint && <span className="text-muted font-normal ml-2">{hint}</span>}
      </label>
      {children}
    </div>
  );
}
