"use client";

import { useState } from "react";
import useSWR from "swr";
import { fetcher } from "@/lib/swr";
import { formatDate } from "@/lib/format";
import Badge from "@/components/ui/Badge";
import InspectionRecordForm from "@/components/admin/InspectionRecordForm";
import CompletionInspectionForm from "@/components/admin/CompletionInspectionForm";
import { INSPECTION_TYPE_LABEL, type InspectionType } from "@/lib/validations/inspection";
import { canUseFeature } from "@/lib/billing/planFeatures";
import { isRetentionExpired } from "@/lib/retention";
import { hasMinRole, normalizeRole } from "@/lib/auth/roles";
import { parseJsonSafe } from "@/lib/api/safeJson";

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
  inspector_staff_id: string | null;
  record_retention_until: string | null;
  inspected_at: string;
  answers: Record<string, { value?: unknown; note?: string }> | null;
  photo_urls: string[] | null;
  notes: string | null;
  template: { id: string; name: string } | null;
  // 完成検査の測定値件数（inspection_measurements の集約カウント）
  measurements?: { count: number }[] | null;
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
  completion: "default",
};

export default function JobInspectionTab({ reservationId, vehicleId, customerId }: Props) {
  const [starting, setStarting] = useState(false);
  const [startingCompletion, setStartingCompletion] = useState(false);
  // 編集中の完成検査記録（詳細・編集を開いたレコード）。
  const [editingCompletion, setEditingCompletion] = useState<InspectionRecord | null>(null);

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
  const { data: me } = useSWR<{ plan_tier?: string; role?: string | null }>("/api/admin/me", fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 60000,
  });
  const canUseVoiceAi = canUseFeature(me?.plan_tier, "ai_draft");
  // 保持期限後の消去は管理者以上のみ（過去に staff 可視ボタンで保持義務を壊しかけた反省
  // MISTAKE_LEDGER M-20261002）。ボタンは「管理者以上 かつ 保持期限経過」でのみ出す。
  // ロール序列は server(minRole:"admin") と同じ roles.ts を使い、判定源を一本化する。
  const canErase = hasMinRole(normalizeRole(me?.role), "admin");

  async function eraseCompletion(id: string) {
    if (!window.confirm("保持期限を過ぎた指定整備記録簿を消去します。元に戻せません。よろしいですか？")) return;
    const res = await fetch("/api/admin/inspection-records", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id }),
    });
    const j = await parseJsonSafe(res);
    if (!res.ok) {
      alert(j?.message ?? "消去に失敗しました。");
      return;
    }
    await mutate();
  }

  const records = data?.records ?? [];
  const activeTemplates = (tplData?.templates ?? []).filter((t) => t.is_active);
  const defaultTemplate = activeTemplates.find((t) => t.is_default) ?? activeTemplates[0] ?? null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-[11px] font-semibold tracking-[0.18em] text-muted uppercase">
          点検記録 ({records.length})
        </div>
        {!starting && !startingCompletion && !editingCompletion && (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setStarting(true)}
              disabled={!defaultTemplate}
              className="btn-primary text-xs disabled:cursor-not-allowed disabled:opacity-50"
              title={defaultTemplate ? undefined : "先に点検テンプレートを作成してください"}
            >
              入庫点検を開始
            </button>
            <button type="button" onClick={() => setStartingCompletion(true)} className="btn-ghost text-xs">
              完成検査を開始
            </button>
          </div>
        )}
      </div>

      {startingCompletion && (
        <CompletionInspectionForm
          reservationId={reservationId}
          vehicleId={vehicleId ?? undefined}
          customerId={customerId ?? undefined}
          onCancel={() => setStartingCompletion(false)}
          onSaved={async () => {
            setStartingCompletion(false);
            await mutate();
          }}
        />
      )}

      {editingCompletion && (
        <CompletionInspectionForm
          reservationId={reservationId}
          vehicleId={vehicleId ?? undefined}
          customerId={customerId ?? undefined}
          editRecord={editingCompletion}
          onCancel={() => setEditingCompletion(null)}
          onSaved={async () => {
            setEditingCompletion(null);
            await mutate();
          }}
        />
      )}

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
          const measurementCount = r.measurements?.[0]?.count ?? 0;
          const isCompletion = r.inspection_type === "completion";
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
                {isCompletion ? (
                  <>
                    <span>測定 {measurementCount} 項目</span>
                    <button
                      type="button"
                      onClick={() => setEditingCompletion(r)}
                      disabled={!!editingCompletion || startingCompletion || starting}
                      className="text-accent underline disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      詳細・編集
                    </button>
                    <a
                      href={`/api/admin/inspection-records/${r.id}/pdf`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-accent underline"
                    >
                      指定整備記録簿 PDF
                    </a>
                    {/* 保持期限（2年）経過後のみ・管理者以上にだけ消去導線を出す。server 側でも二重に強制。 */}
                    {canErase && isRetentionExpired(r.record_retention_until) && (
                      <button
                        type="button"
                        onClick={() => eraseCompletion(r.id)}
                        className="text-danger-text underline"
                        title={`保持期限（${r.record_retention_until}）を過ぎた記録を消去します`}
                      >
                        保持期限後の消去
                      </button>
                    )}
                  </>
                ) : (
                  <>
                    <span>記入 {answered} 項目</span>
                    <span>写真 {photos} 枚</span>
                  </>
                )}
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
