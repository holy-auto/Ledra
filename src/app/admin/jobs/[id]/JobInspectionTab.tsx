"use client";

import { useState } from "react";
import useSWR from "swr";
import { fetcher } from "@/lib/swr";
import { formatDate } from "@/lib/format";
import Badge from "@/components/ui/Badge";
import InspectionRecordForm from "@/components/admin/InspectionRecordForm";
import { INSPECTION_TYPE_LABEL, type InspectionType } from "@/lib/validations/inspection";
import { canUseFeature } from "@/lib/billing/planFeatures";

/**
 * 案件ワークフローの「点検」タブ。
 *
 * この案件 (予約) に紐付く点検記録を一覧表示し、デフォルト点検テンプレートで
 * 入庫点検を開始できる。テンプレートは別画面「点検テンプレート」で管理する。
 */

type TemplateItem = { id: string; label: string; type: string };
type Template = { id: string; name: string; items: TemplateItem[]; is_default: boolean; is_active: boolean };
type TemplateResponse = { templates: Template[] };

type InspectionRecord = {
  id: string;
  inspection_type: InspectionType;
  template_name: string | null;
  inspector_name: string | null;
  inspected_at: string;
  answers: Record<string, { value?: unknown; note?: string }> | null;
  photo_urls: string[] | null;
  notes: string | null;
  template: { id: string; name: string } | null;
};
type RecordsResponse = { records: InspectionRecord[] };

interface Props {
  reservationId: string;
  vehicleId?: string | null;
  customerId?: string | null;
}

const TYPE_BADGE: Record<InspectionType, "info" | "success" | "default"> = {
  intake: "info",
  delivery: "success",
  periodic: "default",
};

export default function JobInspectionTab({ reservationId, vehicleId, customerId }: Props) {
  const [starting, setStarting] = useState(false);

  const recordsKey = `/api/admin/inspection-records?reservation_id=${reservationId}`;
  const { data, isLoading, mutate } = useSWR<RecordsResponse>(recordsKey, fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 3000,
  });
  const { data: tplData } = useSWR<TemplateResponse>("/api/admin/inspection-templates", fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 5000,
  });
  // 音声メモ(AI整形)はプラン依存。ai_draft 非対応プラン(Free)では 403 になるためパネルを出さない。
  // 未取得のうちは false 側 (= 非表示) に倒し、対応が確認できてから出す。
  const { data: me } = useSWR<{ plan_tier?: string }>("/api/admin/me", fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 60000,
  });
  const canUseVoiceAi = canUseFeature(me?.plan_tier, "ai_draft");

  const records = data?.records ?? [];
  const activeTemplates = (tplData?.templates ?? []).filter((t) => t.is_active);
  const defaultTemplate = activeTemplates.find((t) => t.is_default) ?? activeTemplates[0] ?? null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-[11px] font-semibold tracking-[0.18em] text-muted uppercase">
          点検記録 ({records.length})
        </div>
        {!starting && (
          <button
            type="button"
            onClick={() => setStarting(true)}
            disabled={!defaultTemplate}
            className="btn-primary text-xs disabled:cursor-not-allowed disabled:opacity-50"
            title={defaultTemplate ? undefined : "先に点検テンプレートを作成してください"}
          >
            入庫点検を開始
          </button>
        )}
      </div>

      {!defaultTemplate && (
        <div className="glass-card border-l-4 border-warning p-3 text-xs text-warning-text">
          有効な点検テンプレートがありません。「点検テンプレート」画面で作成してください。
        </div>
      )}

      {starting && defaultTemplate && (
        <InspectionRecordForm
          templateId={defaultTemplate.id}
          template={defaultTemplate}
          canUseVoiceAi={canUseVoiceAi}
          reservationId={reservationId}
          vehicleId={vehicleId ?? undefined}
          customerId={customerId ?? undefined}
          defaultType="intake"
          onCancel={() => setStarting(false)}
          onSaved={async () => {
            setStarting(false);
            await mutate();
          }}
        />
      )}

      {isLoading && <div className="text-sm text-muted">読み込み中…</div>}

      {!isLoading && records.length === 0 && !starting && (
        <div className="glass-card p-8 text-center text-sm text-muted">この案件の点検記録はまだありません。</div>
      )}

      <div className="space-y-2">
        {records.map((r) => {
          const answered = r.answers ? Object.keys(r.answers).length : 0;
          const photos = Array.isArray(r.photo_urls) ? r.photo_urls.length : 0;
          return (
            <div key={r.id} className="glass-card p-4">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Badge variant={TYPE_BADGE[r.inspection_type]}>{INSPECTION_TYPE_LABEL[r.inspection_type]}</Badge>
                  <span className="text-sm font-medium text-primary">
                    {r.template_name ?? r.template?.name ?? "点検"}
                  </span>
                </div>
                <span className="text-[11px] text-muted">{formatDate(r.inspected_at)}</span>
              </div>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-secondary">
                <span>記入 {answered} 項目</span>
                <span>写真 {photos} 枚</span>
                {r.inspector_name && <span>担当 {r.inspector_name}</span>}
              </div>
              {r.notes && (
                <div className="mt-2 whitespace-pre-wrap rounded-lg bg-surface-hover p-2 text-[12px] text-secondary">
                  {r.notes}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
