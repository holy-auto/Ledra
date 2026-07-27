/**
 * モバイル進捗イベントのラベル解決 (純関数)。
 *
 * 職人が写真を撮って進捗を送るだけでラベルを手入力しなくて済むように、
 * 明示ラベルが無ければ現在のワークフロー工程名を採用する。
 * 優先順位: 明示ラベル → 工程ログの step_label → テンプレートの工程 label → "進捗更新"。
 */

export interface WorkflowTemplateStep {
  order?: number;
  key?: string;
  label?: string;
}

const FALLBACK_LABEL = "進捗更新";

/** テンプレートの steps から現在の工程 (order 一致) の label を取り出す。無ければ null。 */
export function templateStepLabel(steps: unknown, currentStepOrder: number | null | undefined): string | null {
  if (currentStepOrder == null || !Array.isArray(steps)) return null;
  for (const s of steps as WorkflowTemplateStep[]) {
    if (s && typeof s === "object" && s.order === currentStepOrder) {
      const label = typeof s.label === "string" ? s.label.trim() : "";
      return label || null;
    }
  }
  return null;
}

/**
 * 進捗ラベルを決定する。明示 > 工程ログ > テンプレート工程 > "進捗更新"。
 * 空白のみは未指定として扱う。
 */
export function resolveProgressLabel(opts: {
  explicit?: string | null;
  stepLogLabel?: string | null;
  templateStepLabel?: string | null;
}): string {
  const explicit = opts.explicit?.trim();
  if (explicit) return explicit;
  const fromLog = opts.stepLogLabel?.trim();
  if (fromLog) return fromLog;
  const fromTemplate = opts.templateStepLabel?.trim();
  if (fromTemplate) return fromTemplate;
  return FALLBACK_LABEL;
}
