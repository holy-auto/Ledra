"use client";

import { useMemo, useState } from "react";
import type { Role } from "@/lib/auth/roles";
import { hasMinRole } from "@/lib/auth/roles";
import {
  AUTOMATION_FIELDS,
  AUTOMATION_SOURCES,
  AUTOMATION_WORKFLOWS,
  type AutomationFieldDef,
  type AutomationSourceKey,
  type AutomationWorkflowKey,
  type FieldPolicy,
} from "@/lib/ai/automation/fieldCatalog";
import { AUTOMATION_ACTIONS, RECOMMENDED_AUTOMATION_ACTION_KEYS } from "@/lib/ai/automation/actionCatalog";

interface InitialSettings {
  enabled: boolean;
  fieldPolicies: Record<string, FieldPolicy>;
  confidenceThreshold: number;
  sourcePolicies: Partial<Record<AutomationSourceKey, boolean>>;
  autoActions: Record<string, boolean>;
  monthlyCostCapJpy: number | null;
}

interface CostCapStatus {
  capJpy: number;
  spentJpy: number;
  exceeded: boolean;
}

interface Props {
  role: Role;
  initialSettings: InitialSettings;
  costCap: CostCapStatus | null;
  loadedFromDb: boolean;
}

const POLICY_LABELS: Record<FieldPolicy, { label: string; hint: string; tone: string }> = {
  auto: {
    label: "AI 自動入力",
    hint: "AI 出力をそのままフォームに反映 (確認なし)",
    tone: "border-success/40 bg-success-dim text-success-text",
  },
  suggest: {
    label: "AI 提案 → 人が確認",
    hint: "AI が下書きを生成し、ユーザが承認して反映",
    tone: "border-accent/40 bg-accent/10 text-accent",
  },
  manual: {
    label: "手動入力",
    hint: "AI を呼ばない (該当フィールドは空のまま)",
    tone: "border-border-default bg-surface text-secondary",
  },
};

const POLICY_OPTIONS: FieldPolicy[] = ["auto", "suggest", "manual"];

export default function AiAutomationSettingsClient({ role, initialSettings, costCap, loadedFromDb }: Props) {
  const canEdit = hasMinRole(role, "admin");

  const [enabled, setEnabled] = useState(initialSettings.enabled);
  const [fieldPolicies, setFieldPolicies] = useState<Record<string, FieldPolicy>>(initialSettings.fieldPolicies);
  const [threshold, setThreshold] = useState(initialSettings.confidenceThreshold);
  // 月次コスト上限 (円)。0 / 空 = テナント個別上限なし (全社既定 env に従う)。
  const [costCapJpy, setCostCapJpy] = useState<number>(initialSettings.monthlyCostCapJpy ?? 0);
  const [sourcePolicies, setSourcePolicies] = useState<Partial<Record<AutomationSourceKey, boolean>>>(
    initialSettings.sourcePolicies,
  );
  const [autoActions, setAutoActions] = useState<Record<string, boolean>>(initialSettings.autoActions ?? {});

  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const workflows = useMemo(() => {
    const byWorkflow = new Map<AutomationWorkflowKey, AutomationFieldDef[]>();
    for (const f of AUTOMATION_FIELDS) {
      const arr = byWorkflow.get(f.workflow) ?? [];
      arr.push(f);
      byWorkflow.set(f.workflow, arr);
    }
    return AUTOMATION_WORKFLOWS.map((w) => ({ ...w, fields: byWorkflow.get(w.key) ?? [] }));
  }, []);

  function effectivePolicy(field: AutomationFieldDef): FieldPolicy {
    if (!enabled) return "manual";
    return fieldPolicies[field.key] ?? field.defaultPolicy;
  }

  function setPolicy(fieldKey: string, policy: FieldPolicy, defaultPolicy: FieldPolicy) {
    setFieldPolicies((prev) => {
      const next = { ...prev };
      if (policy === defaultPolicy) delete next[fieldKey];
      else next[fieldKey] = policy;
      return next;
    });
  }

  function setWorkflowBulk(workflow: AutomationWorkflowKey, policy: FieldPolicy) {
    setFieldPolicies((prev) => {
      const next = { ...prev };
      for (const f of AUTOMATION_FIELDS) {
        if (f.workflow !== workflow) continue;
        if (policy === f.defaultPolicy) delete next[f.key];
        else next[f.key] = policy;
      }
      return next;
    });
  }

  function toggleAutoAction(key: string) {
    setAutoActions((prev) => {
      const out = { ...prev };
      if (out[key]) delete out[key];
      else out[key] = true;
      return out;
    });
  }

  /** 「おまかせ運用」: 推奨アクション（下書き/提案/注釈のみ）を一括 ON。保存は別途。 */
  function enableRecommendedAutoActions() {
    setAutoActions((prev) => {
      const out = { ...prev };
      for (const key of RECOMMENDED_AUTOMATION_ACTION_KEYS) out[key] = true;
      return out;
    });
  }

  function effectiveSource(key: AutomationSourceKey, defaultEnabled: boolean): boolean {
    const v = sourcePolicies[key];
    if (typeof v === "boolean") return v;
    return defaultEnabled;
  }

  function toggleSource(key: AutomationSourceKey, defaultEnabled: boolean) {
    setSourcePolicies((prev) => {
      const current = typeof prev[key] === "boolean" ? prev[key] : defaultEnabled;
      const next = !current;
      const out = { ...prev };
      if (next === defaultEnabled) delete out[key];
      else out[key] = next;
      return out;
    });
  }

  async function save() {
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/settings/ai-automation", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled,
          fieldPolicies,
          confidenceThreshold: threshold,
          sourcePolicies,
          autoActions,
          monthlyCostCapJpy: costCapJpy > 0 ? Math.round(costCapJpy) : null,
        }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok || !j?.ok) {
        setMsg({ ok: false, text: j?.message ?? "保存に失敗しました。" });
        return;
      }
      if (j?.costCapWarning) {
        // 他の設定は保存できたが、コスト上限だけ保存できなかった (部分マイグレーション)。
        setMsg({ ok: false, text: `設定は保存しましたが、コスト上限は保存できませんでした: ${j.costCapWarning}` });
      } else if (j?.persisted === false) {
        setMsg({ ok: true, text: j.warning ?? "保存しました (一時保存)" });
      } else {
        setMsg({ ok: true, text: "保存しました。" });
      }
    } catch {
      setMsg({ ok: false, text: "通信エラーが発生しました。" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      {!loadedFromDb && (
        <div className="rounded-xl border border-warning/30 bg-warning-dim px-4 py-3 text-xs text-warning">
          ⚠ AI 自動入力設定テーブルがまだ未作成です。デフォルト値で表示しています。 マイグレーション (
          <code>20260528000003_ai_automation_settings.sql</code>) を適用すると保存できるようになります。
        </div>
      )}

      {!canEdit && (
        <div className="rounded-xl border border-border-default bg-surface px-4 py-3 text-xs text-muted">
          現在の役割では閲覧のみ可能です。設定の保存は管理者 (admin) 以上で実行してください。
        </div>
      )}

      {/* ── マスタースイッチ ─────────────────────────────── */}
      <section className="glass-card p-5 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-xs font-semibold tracking-[0.18em] text-muted">MASTER SWITCH</div>
            <div className="mt-1 text-base font-semibold text-primary">AI 自動入力の総合 ON/OFF</div>
            <p className="mt-1 text-xs text-muted">
              OFF にすると、フィールド単位の設定にかかわらず、すべての AI 自動入力 (証明書 / 車両 OCR / 顧客 intake /
              案件) を停止します。
            </p>
          </div>
          <label className="inline-flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              className="h-5 w-5 accent-[var(--accent)]"
              checked={enabled}
              disabled={!canEdit || saving}
              onChange={(e) => setEnabled(e.target.checked)}
            />
            <span className={`text-sm font-medium ${enabled ? "text-success-text" : "text-muted"}`}>
              {enabled ? "AI 自動入力 ON" : "AI 自動入力 OFF"}
            </span>
          </label>
        </div>
      </section>

      {/* ── 信頼度しきい値 ─────────────────────────────── */}
      <section className="glass-card p-5 space-y-4">
        <div>
          <div className="text-xs font-semibold tracking-[0.18em] text-muted">CONFIDENCE</div>
          <div className="mt-1 text-base font-semibold text-primary">信頼度しきい値</div>
          <p className="mt-1 text-xs text-muted">
            AI の自己評価値 (0.0〜1.0) がこの値を下回ったフィールドは、自動入力 (auto)
            に設定されていても「提案」に降格されます。
          </p>
        </div>
        <div className="flex items-center gap-4">
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={threshold}
            disabled={!canEdit || saving}
            onChange={(e) => setThreshold(Number(e.target.value))}
            className="flex-1 accent-[var(--accent)]"
          />
          <span className="font-mono text-sm text-primary w-16 text-right">{Math.round(threshold * 100)}%</span>
        </div>
        <div className="text-[11px] text-muted">
          推奨: 0.50 (デフォルト)。0.80 以上にすると確実な抽出のみ採用、0.30 以下にすると AI
          出力を積極的に流し込みます。
        </div>
      </section>

      {/* ── 月次コスト上限 (コストキャップ) ───────────────── */}
      <section className="glass-card p-5 space-y-4">
        <div>
          <div className="text-xs font-semibold tracking-[0.18em] text-muted">COST CAP</div>
          <div className="mt-1 text-base font-semibold text-primary">AI 月次コスト上限</div>
          <p className="mt-1 text-xs text-muted">
            当月の AI 概算コストがこの上限を超えると、AI 自動入力を自動的に一時停止します (翌月リセット)。
            暴走課金の安全ブレーキです。0 (空) にするとテナント個別上限なし (全社の既定値に従います)。
          </p>
        </div>

        {/* 現況: 今月の概算 / 適用中の上限 */}
        {costCap ? (
          <div
            className={`rounded-lg border px-3 py-2.5 text-xs ${
              costCap.exceeded
                ? "border-danger/30 bg-danger-dim text-danger-text"
                : "border-border-subtle bg-surface text-secondary"
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span>
                今月の概算コスト: <b>¥{Math.round(costCap.spentJpy).toLocaleString("ja-JP")}</b> / 適用中の上限{" "}
                <b>¥{Math.round(costCap.capJpy).toLocaleString("ja-JP")}</b>
              </span>
              {costCap.exceeded ? (
                <span className="rounded-full bg-danger/15 px-2 py-0.5 text-[11px] font-medium">
                  上限超過 — AI 一時停止中
                </span>
              ) : (
                <span className="text-muted">
                  使用率 {Math.min(999, Math.round((costCap.spentJpy / Math.max(1, costCap.capJpy)) * 100))}%
                </span>
              )}
            </div>
            <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-border-subtle">
              <div
                className={costCap.exceeded ? "h-full bg-danger" : "h-full bg-accent"}
                style={{
                  width: `${Math.min(100, Math.round((costCap.spentJpy / Math.max(1, costCap.capJpy)) * 100))}%`,
                }}
              />
            </div>
          </div>
        ) : (
          <div className="rounded-lg border border-border-subtle bg-surface px-3 py-2 text-[11px] text-muted">
            {/* 2026-09-04 以降、上限はコード側の既定 (テナント1件あたり月1万円) が常に効くので、
                ここは「上限なし」ではなく「現況を取得できなかった」を意味する。 */}
            コスト上限の現況を取得できませんでした。全社の既定（テナント1件あたり月1万円）は有効です。
          </div>
        )}

        <div className="flex items-center gap-3">
          <label className="text-xs text-secondary whitespace-nowrap">月次コスト上限</label>
          <div className="inline-flex items-center gap-1">
            <span className="text-sm text-muted">¥</span>
            <input
              type="number"
              min={0}
              step={1000}
              inputMode="numeric"
              value={costCapJpy || ""}
              placeholder="0 (全社既定に従う)"
              disabled={!canEdit || saving}
              onChange={(e) => setCostCapJpy(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
              className="w-40 rounded-lg border border-border-default bg-surface px-3 py-1.5 text-sm text-primary"
            />
            <span className="text-xs text-muted">/ 月</span>
          </div>
        </div>
        <div className="text-[11px] text-muted">
          目安: 標準的なアクティブ店は月 ¥2,000〜3,000。例えば ¥10,000 に設定すると、想定外の急増時に
          自動で止まります。コストは概算 (トークン実績ベース) で、超過後は人手運用にフォールバックします。
        </div>
      </section>

      {/* ── データソース ─────────────────────────────── */}
      <section className="glass-card p-5 space-y-4">
        <div>
          <div className="text-xs font-semibold tracking-[0.18em] text-muted">SOURCES</div>
          <div className="mt-1 text-base font-semibold text-primary">参照を許可する情報ソース</div>
          <p className="mt-1 text-xs text-muted">
            AI が下書き生成のために読みに行く情報源です。プライバシー /
            コンプライアンス上の理由で参照させたくないソースを OFF にできます。
          </p>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {AUTOMATION_SOURCES.map((s) => {
            const on = effectiveSource(s.key, s.defaultEnabled);
            return (
              <label
                key={s.key}
                className={`flex items-start gap-3 rounded-lg border px-3 py-2.5 ${
                  on ? "border-accent/30 bg-accent/5" : "border-border-subtle bg-surface"
                }`}
              >
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 accent-[var(--accent)]"
                  checked={on}
                  disabled={!canEdit || saving}
                  onChange={() => toggleSource(s.key, s.defaultEnabled)}
                />
                <div className="space-y-0.5">
                  <div className="text-sm font-medium text-primary">{s.label}</div>
                  <div className="text-[11px] text-muted">{s.description}</div>
                </div>
              </label>
            );
          })}
        </div>
      </section>

      {/* ── 自動実行 (auto-actions) ─────────────────────── */}
      <section className="glass-card p-5 space-y-4">
        <div>
          <div className="text-xs font-semibold tracking-[0.18em] text-muted">AUTO-ACTIONS</div>
          <div className="mt-1 text-base font-semibold text-primary">人の操作なしで自動実行する処理</div>
          <p className="mt-1 text-xs text-muted">
            「フォームを開いてボタンを押す」を待たずに、受信や状態遷移をきっかけに AI を自動実行します。 すべて既定 OFF
            (opt-in)。Standard プラン以上で有効化できます。
          </p>
        </div>

        <div className="rounded-lg border border-warning/30 bg-warning-dim px-3 py-2 text-[11px] text-warning">
          🔒 壁3: <b>証明書の発行・請求/見積の送付・課金・新規顧客(本人)の自動作成</b>は、設定に関わらず
          自動化されません。必ず人の確認を挟みます。
        </div>

        {/* おまかせ運用プリセット: 推奨アクションを 1 クリックでまとめて ON */}
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-accent/30 bg-accent/5 px-3 py-2.5">
          <div className="text-xs text-muted">
            <span className="font-semibold text-primary">おまかせ運用</span> — どれを ON にすればいいか迷ったら、
            安全な推奨セット（下書き・提案・注釈のみ。送付や自動作成は含みません）をまとめて有効化します。
          </div>
          <button
            type="button"
            onClick={enableRecommendedAutoActions}
            disabled={!canEdit || saving || !enabled}
            className="shrink-0 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
          >
            推奨をまとめてON
          </button>
        </div>

        <div className="grid gap-2">
          {AUTOMATION_ACTIONS.map((a) => {
            const on = autoActions[a.key] === true;
            const recommended = RECOMMENDED_AUTOMATION_ACTION_KEYS.has(a.key);
            return (
              <label
                key={a.key}
                className={`flex items-start gap-3 rounded-lg border px-3 py-2.5 ${
                  on && enabled ? "border-success/30 bg-success-dim" : "border-border-subtle bg-surface"
                } ${!enabled ? "opacity-50" : ""}`}
              >
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 accent-[var(--accent)]"
                  checked={on}
                  disabled={!canEdit || saving || !enabled}
                  onChange={() => toggleAutoAction(a.key)}
                />
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-primary">{a.label}</span>
                    {recommended && (
                      <span className="rounded-full bg-accent/15 px-1.5 py-0.5 text-[10px] font-medium text-accent">
                        推奨
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-muted">{a.description}</div>
                  {a.guard && <div className="text-[10px] text-muted opacity-70 mt-0.5">条件: {a.guard}</div>}
                </div>
              </label>
            );
          })}
        </div>
      </section>

      {/* ── ワークフロー × フィールド ─────────────────────── */}
      {workflows.map((w) => (
        <section key={w.key} className="glass-card p-5 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-xs font-semibold tracking-[0.18em] text-muted">{w.key.toUpperCase()}</div>
              <div className="mt-1 text-base font-semibold text-primary">{w.label}</div>
              <p className="mt-1 text-xs text-muted">{w.description}</p>
            </div>
            <div className="flex gap-1.5 flex-wrap justify-end">
              {POLICY_OPTIONS.map((p) => (
                <button
                  key={p}
                  type="button"
                  className="btn-ghost text-[11px] py-1 px-2"
                  disabled={!canEdit || saving}
                  onClick={() => setWorkflowBulk(w.key, p)}
                  title={`このワークフローのすべてのフィールドを「${POLICY_LABELS[p].label}」に設定`}
                >
                  全部 {POLICY_LABELS[p].label.replace("AI ", "").replace(" → 人が確認", "")}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            {w.fields.map((f) => {
              const policy = effectivePolicy(f);
              return (
                <div key={f.key} className="rounded-xl border border-border-subtle bg-surface px-4 py-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-[200px] flex-1">
                      <div className="text-sm font-medium text-primary">{f.label}</div>
                      {f.hint && <div className="text-[11px] text-muted mt-0.5">{f.hint}</div>}
                      <div className="text-[10px] text-muted mt-1 font-mono opacity-60">{f.key}</div>
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <div className="inline-flex rounded-lg border border-border-default overflow-hidden">
                        {POLICY_OPTIONS.map((p) => {
                          const selected = policy === p;
                          return (
                            <button
                              key={p}
                              type="button"
                              disabled={!canEdit || saving || !enabled}
                              onClick={() => setPolicy(f.key, p, f.defaultPolicy)}
                              className={`px-3 py-1.5 text-xs font-medium border-r border-border-default last:border-r-0 transition-colors ${
                                selected ? POLICY_LABELS[p].tone : "bg-surface text-muted hover:bg-surface-hover"
                              } ${!enabled ? "opacity-40 cursor-not-allowed" : ""}`}
                            >
                              {POLICY_LABELS[p].label}
                            </button>
                          );
                        })}
                      </div>
                      <div className="text-[10px] text-muted text-right">
                        {POLICY_LABELS[policy].hint}
                        {fieldPolicies[f.key] && fieldPolicies[f.key] !== f.defaultPolicy && (
                          <span className="ml-1 text-accent">(上書き中)</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ))}

      {/* ── 保存ボタン ─────────────────────────────── */}
      {msg && (
        <div
          className={`rounded-lg border px-3 py-2 text-xs ${
            msg.ok
              ? "border-success/20 bg-success-dim text-success-text"
              : "border-danger/20 bg-danger-dim text-danger-text"
          }`}
        >
          {msg.text}
        </div>
      )}

      <div className="flex gap-3">
        <button type="button" className="btn-primary text-sm" disabled={!canEdit || saving} onClick={save}>
          {saving ? "保存中..." : "AI 自動入力の設定を保存"}
        </button>
      </div>
    </div>
  );
}
