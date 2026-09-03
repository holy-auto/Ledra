/**
 * ワークフローテンプレート版管理（IMP-042）。
 *
 * 現状: テンプレート編集は in-place 上書き。実行中ジョブの版凍結なし。
 * テンプレートを編集すると、進行中のすべてのジョブが新しい steps を参照してしまう。
 *
 * 本モジュールは版管理の型定義と純関数を提供する。
 * - WorkflowSnapshot: ジョブ開始時にテンプレートを凍結するスナップショット
 * - diffTemplateSteps: 2つの steps 配列を比較
 * - isSnapshotStale: 凍結スナップショットが現行テンプレートと乖離しているか
 *
 * DB マイグレーション（`reservations.workflow_snapshot` jsonb 列追加等）は
 * 消費タスクで実施。ここでは型基盤のみ（IMP-041, IMP-040 と同じパターン）。
 */

// ── 型 ──

/** DB の workflow_templates.steps[] の 1 要素（JSONB 格納形式）。 */
export interface TemplateStep {
  order: number;
  key: string;
  label: string;
  is_customer_visible: boolean;
  estimated_min: number;
  required_photos?: string[];
  checklist?: string[];
}

/**
 * ジョブ開始時にテンプレートを凍結した不変スナップショット。
 *
 * reservations テーブルに jsonb として格納する想定（マイグレーションは別タスク）。
 * 進行中のジョブはこのスナップショットを参照し、テンプレートが編集されても影響を受けない。
 */
export interface WorkflowSnapshot {
  /** 元テンプレートの ID（参照用。テンプレート削除後も残る）。 */
  templateId: string;
  /** スナップショット時点のテンプレート名。 */
  templateName: string;
  serviceType: string;
  /** 凍結した steps（不変 — 呼び出し側で変更しないこと）。 */
  steps: readonly TemplateStep[];
  /** スナップショット取得時刻（ISO 8601）。 */
  frozenAt: string;
  /** テンプレートの updated_at（同一性チェック用）。 */
  templateUpdatedAt: string;
}

/** steps の変更差分の 1 件。 */
export interface StepDiffEntry {
  kind: "added" | "removed" | "modified";
  key: string;
  label: string;
  /** modified のとき、変更されたフィールド名。 */
  changedFields?: string[];
}

/** テンプレート steps の差分結果。 */
export interface TemplateStepsDiff {
  added: StepDiffEntry[];
  removed: StepDiffEntry[];
  modified: StepDiffEntry[];
  /** 順序のみ変更された step の key リスト。 */
  reordered: string[];
  /** 変更があったか。 */
  hasChanges: boolean;
}

// ── 純関数 ──

/**
 * key をインデックスにした Map を作る。key 重複時は最初の出現を採用する
 * （`resolveStepFromSnapshot` の Array.find と挙動を揃えるため。key はテンプレート
 * エディタ側で一意性を強制していない — 重複自体は本モジュールの関知しない業務不変条件）。
 */
function keyByFirstOccurrence(steps: readonly TemplateStep[]): Map<string, TemplateStep> {
  const map = new Map<string, TemplateStep>();
  for (const s of steps) {
    if (!map.has(s.key)) map.set(s.key, s);
  }
  return map;
}

/**
 * テンプレートの現在の状態からスナップショットを作成する。
 *
 * ジョブにワークフローを適用する（start-workflow）時点で呼び、
 * 結果を reservations.workflow_snapshot に保存する想定。
 */
export function createWorkflowSnapshot(template: {
  id: string;
  name: string;
  service_type: string;
  steps: TemplateStep[];
  updated_at: string;
}): WorkflowSnapshot {
  return {
    templateId: template.id,
    templateName: template.name,
    serviceType: template.service_type,
    // deep copy — 凍結後にテンプレート側の参照を経由した変更を防止
    steps: template.steps.map((s) => ({
      ...s,
      ...(s.required_photos && { required_photos: [...s.required_photos] }),
      ...(s.checklist && { checklist: [...s.checklist] }),
    })),
    frozenAt: new Date().toISOString(),
    templateUpdatedAt: template.updated_at,
  };
}

/**
 * 2 つの steps 配列を比較し、差分を返す。
 *
 * key で同一 step を識別する。key が一致すれば同じ step とみなし、
 * フィールドの差異を検出する。
 */
export function diffTemplateSteps(before: readonly TemplateStep[], after: readonly TemplateStep[]): TemplateStepsDiff {
  // key 重複時は最初の出現を採用（resolveStepFromSnapshot の Array.find と挙動を揃える）
  const beforeMap = keyByFirstOccurrence(before);
  const afterMap = keyByFirstOccurrence(after);

  const added: StepDiffEntry[] = [];
  const removed: StepDiffEntry[] = [];
  const modified: StepDiffEntry[] = [];
  const reordered: string[] = [];

  // removed: before にあって after にないもの
  for (const [key, s] of beforeMap) {
    if (!afterMap.has(key)) {
      removed.push({ kind: "removed", key, label: s.label });
    }
  }

  // added / modified: after にあるもの
  for (const [key, a] of afterMap) {
    const b = beforeMap.get(key);
    if (!b) {
      added.push({ kind: "added", key, label: a.label });
      continue;
    }

    // 差異検出（order 以外のフィールド）
    const changedFields: string[] = [];
    if (b.label !== a.label) changedFields.push("label");
    if (b.is_customer_visible !== a.is_customer_visible) changedFields.push("is_customer_visible");
    if (b.estimated_min !== a.estimated_min) changedFields.push("estimated_min");
    if (JSON.stringify(b.required_photos ?? []) !== JSON.stringify(a.required_photos ?? []))
      changedFields.push("required_photos");
    if (JSON.stringify(b.checklist ?? []) !== JSON.stringify(a.checklist ?? [])) changedFields.push("checklist");

    if (changedFields.length > 0) {
      modified.push({ kind: "modified", key, label: a.label, changedFields });
    }

    // 順序変更
    if (b.order !== a.order) {
      reordered.push(key);
    }
  }

  return {
    added,
    removed,
    modified,
    reordered,
    hasChanges: added.length > 0 || removed.length > 0 || modified.length > 0 || reordered.length > 0,
  };
}

/**
 * 凍結スナップショットが現行テンプレートと乖離しているか判定。
 *
 * テンプレートの updated_at で高速パスチェック後、steps の内容を比較。
 * 管理画面で「このジョブのテンプレートが更新されています」等の警告表示に使う。
 */
export function isSnapshotStale(
  snapshot: WorkflowSnapshot,
  currentTemplate: { updated_at: string; steps: readonly TemplateStep[] },
): boolean {
  // 高速パス: updated_at が一致 → 変更なし
  if (snapshot.templateUpdatedAt === currentTemplate.updated_at) return false;
  // updated_at が異なっても steps が同一なら stale ではない（名前だけ変えた等）
  // ponytail: steps の変更が業務影響するので steps のみ比較。名前変更は無視。
  const diff = diffTemplateSteps(snapshot.steps, [...currentTemplate.steps]);
  return diff.hasChanges;
}

/**
 * スナップショットから現在のステップ情報を取得。
 *
 * 進行中ジョブが「凍結された」ステップ情報を参照するためのヘルパー。
 * スナップショットがなければ null（レガシーデータ — スナップショット導入前のジョブ）。
 */
export function resolveStepFromSnapshot(
  snapshot: WorkflowSnapshot | null | undefined,
  stepKey: string,
): TemplateStep | null {
  if (!snapshot) return null;
  return snapshot.steps.find((s) => s.key === stepKey) ?? null;
}

/**
 * ジョブの進捗を凍結スナップショットから計算。
 *
 * completedStepKeys: 完了済みのステップ key のセット。
 * 戻り値: 0–100 の進捗率。
 */
export function computeSnapshotProgress(snapshot: WorkflowSnapshot, completedStepKeys: ReadonlySet<string>): number {
  if (snapshot.steps.length === 0) return 100;
  const completed = snapshot.steps.filter((s) => completedStepKeys.has(s.key)).length;
  return Math.round((completed / snapshot.steps.length) * 100);
}
