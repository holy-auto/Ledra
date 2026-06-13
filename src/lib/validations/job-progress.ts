import { z } from "zod";

/**
 * 作業進捗ボードの 6 ステージ。
 *
 * 注意: これは請求書 (documents.doc_type='invoice') の進捗専用列
 * `job_status` を表す。請求書ライフサイクルの `status`
 * ('draft','sent','accepted','paid','rejected','cancelled') とは別軸。
 */
export const JOB_STATUSES = ["draft", "booked", "in_progress", "qc", "ready", "delivered"] as const;

export type JobStatus = (typeof JOB_STATUSES)[number];

/** 進捗ボードのステージ順 (「次のステップ」ボタンの遷移順)。 */
export const JOB_STATUS_ORDER: readonly JobStatus[] = JOB_STATUSES;

/** ステージの日本語ラベル。 */
export const JOB_STATUS_LABELS: Record<JobStatus, string> = {
  draft: "下書き",
  booked: "予約済み",
  in_progress: "施工中",
  qc: "検品",
  ready: "引渡待ち",
  delivered: "引渡済み",
};

export function isJobStatus(v: unknown): v is JobStatus {
  return typeof v === "string" && (JOB_STATUSES as readonly string[]).includes(v);
}

/** 現ステージの次のステージを返す (最終ステージならそのまま)。 */
export function nextJobStatus(current: JobStatus): JobStatus {
  const idx = JOB_STATUS_ORDER.indexOf(current);
  if (idx < 0 || idx >= JOB_STATUS_ORDER.length - 1) return current;
  return JOB_STATUS_ORDER[idx + 1];
}

/** PATCH /api/admin/job-progress/[id] のボディスキーマ。 */
export const jobStatusUpdateSchema = z.object({
  status: z.enum(JOB_STATUSES),
});

export type JobStatusUpdateInput = z.infer<typeof jobStatusUpdateSchema>;
