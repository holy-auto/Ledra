import Link from "next/link";
import type { AiCertificateDraft, AiCertificateDraftBody } from "./types";

/**
 * 案件完了時に certificate.auto_draft が生成した証明書ドラフトを表示するカード。
 *
 * 表示のみ。発行は人が確認して行う (壁3)。「証明書を発行」へ進むと
 * 新規証明書フォーム (/admin/certificates/new) が開く。フォーム側にも
 * オンデマンドの AI 下書きパネルがあるため、この事前生成は「もう用意できている」
 * ことをスタッフに知らせ、確認の心理的ハードルを下げるのが目的。
 *
 * 予約に複数種類の作業依頼がある場合は大カテゴリーごとに 1 枚ずつ下書きを持つ
 * (snapshot.drafts)。その場合はカテゴリー別に発行導線を分けて表示する。
 */
export default function JobCertificateDraftPanel({
  draft,
  vehicleId,
  customerId,
}: {
  draft: AiCertificateDraft;
  vehicleId: string | null;
  customerId: string | null;
}) {
  // 複数カテゴリーがあればそれを、無ければ単一 draft を 1 件として扱う。
  const items =
    draft?.drafts && draft.drafts.length > 0
      ? draft.drafts
      : draft?.draft?.title
        ? [{ category: "", categoryLabel: "", workItems: [] as string[], draft: draft.draft }]
        : [];

  if (items.length === 0) return null;

  const certNewUrl = (category?: string) => {
    const params = new URLSearchParams();
    if (vehicleId) params.set("vehicle_id", vehicleId);
    if (customerId) params.set("customer_id", customerId);
    if (category) params.set("category", category);
    const qs = params.toString();
    return `/admin/certificates/new${qs ? `?${qs}` : ""}`;
  };

  const generatedAt = draft.generated_at ? new Date(draft.generated_at).toLocaleString("ja-JP") : null;
  const multi = items.length > 1;

  return (
    <section className="glass-card p-5 space-y-4" aria-label="AI 証明書ドラフト">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xs font-semibold tracking-[0.18em] text-muted">AI CERTIFICATE DRAFT</div>
          <div className="mt-1 text-base font-semibold text-primary">
            {multi ? `AI が証明書ドラフトを ${items.length} 件用意しました` : "AI が証明書ドラフトを用意しました"}
          </div>
          <p className="mt-1 text-xs text-muted">
            {multi
              ? "複数種類の作業依頼を大カテゴリーごとに分けて下書きしました。カテゴリー単位で確認・修正のうえ発行してください（発行は必ず人が行います）。"
              : "案件完了時に自動生成された下書きです。内容を確認・修正のうえ発行してください（発行は必ず人が行います）。"}
          </p>
        </div>
        {generatedAt && <span className="text-[11px] text-muted">生成: {generatedAt}</span>}
      </div>

      <div className="space-y-4">
        {items.map((item, i) => (
          <DraftCard
            key={item.category || i}
            body={item.draft}
            categoryLabel={item.categoryLabel}
            workItems={item.workItems}
            href={certNewUrl(item.category || undefined)}
            showDivider={multi && i > 0}
          />
        ))}
      </div>
    </section>
  );
}

function DraftCard({
  body,
  categoryLabel,
  workItems,
  href,
  showDivider,
}: {
  body: AiCertificateDraftBody;
  categoryLabel: string;
  workItems: string[];
  href: string;
  showDivider: boolean;
}) {
  const d = body;
  if (!d || !d.title) return null;
  const confidencePct = Math.round((d.confidence ?? 0) * 100);

  return (
    <div className={showDivider ? "border-t border-white/10 pt-4" : undefined}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {categoryLabel && (
            <span className="rounded-full border border-white/15 bg-white/5 px-2.5 py-1 text-[11px] font-semibold text-primary">
              {categoryLabel}
            </span>
          )}
          {workItems.length > 0 && <span className="text-[11px] text-muted">{workItems.join(" / ")}</span>}
        </div>
        <span className="rounded-full border border-accent/30 bg-accent/10 px-2.5 py-1 text-[11px] font-medium text-accent">
          確信度 {confidencePct}%
        </span>
      </div>

      <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
        <div className="sm:col-span-2">
          <dt className="text-[11px] font-semibold text-muted">施工タイトル</dt>
          <dd className="mt-0.5 text-primary">{d.title}</dd>
        </div>
        {d.description && (
          <div className="sm:col-span-2">
            <dt className="text-[11px] font-semibold text-muted">施工内容</dt>
            <dd className="mt-0.5 whitespace-pre-wrap text-secondary">{d.description}</dd>
          </div>
        )}
        {d.workAreas?.length > 0 && (
          <div>
            <dt className="text-[11px] font-semibold text-muted">施工箇所</dt>
            <dd className="mt-0.5 text-secondary">{d.workAreas.join(" / ")}</dd>
          </div>
        )}
        {d.warrantyCandidates?.length > 0 && (
          <div>
            <dt className="text-[11px] font-semibold text-muted">保証期間候補</dt>
            <dd className="mt-0.5 text-secondary">{d.warrantyCandidates.join(" / ")}</dd>
          </div>
        )}
        {d.materials?.length > 0 && (
          <div className="sm:col-span-2">
            <dt className="text-[11px] font-semibold text-muted">使用材料</dt>
            <dd className="mt-0.5 text-secondary">
              {d.materials
                .map((m) => [m.name, m.maker, m.spec].filter(Boolean).join(" "))
                .filter(Boolean)
                .join(" / ")}
            </dd>
          </div>
        )}
      </dl>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Link href={href} className="btn-primary text-sm">
          🪪 {categoryLabel ? `${categoryLabel}の証明書を発行` : "この内容で証明書を発行"}
        </Link>
      </div>
    </div>
  );
}
