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

interface InitialSettings {
  enabled: boolean;
  fieldPolicies: Record<string, FieldPolicy>;
  confidenceThreshold: number;
  sourcePolicies: Partial<Record<AutomationSourceKey, boolean>>;
}

interface Props {
  role: Role;
  initialSettings: InitialSettings;
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

export default function AiAutomationSettingsClient({ role, initialSettings, loadedFromDb }: Props) {
  const canEdit = hasMinRole(role, "admin");

  const [enabled, setEnabled] = useState(initialSettings.enabled);
  const [fieldPolicies, setFieldPolicies] = useState<Record<string, FieldPolicy>>(initialSettings.fieldPolicies);
  const [threshold, setThreshold] = useState(initialSettings.confidenceThreshold);
  const [sourcePolicies, setSourcePolicies] = useState<Partial<Record<AutomationSourceKey, boolean>>>(
    initialSettings.sourcePolicies,
  );

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
        }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok || !j?.ok) {
        setMsg({ ok: false, text: j?.message ?? "保存に失敗しました。" });
        return;
      }
      if (j?.persisted === false) {
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
          ⚠ AI 自動入力設定テーブルがまだ未作成です。デフォルト値で表示しています。
          マイグレーション (<code>20260528000003_ai_automation_settings.sql</code>) を適用すると保存できるようになります。
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
              OFF にすると、フィールド単位の設定にかかわらず、すべての AI 自動入力 (証明書 / 車両 OCR / 顧客 intake / 案件) を停止します。
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
            AI の自己評価値 (0.0〜1.0) がこの値を下回ったフィールドは、自動入力 (auto) に設定されていても「提案」に降格されます。
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
          <span className="font-mono text-sm text-primary w-16 text-right">
            {Math.round(threshold * 100)}%
          </span>
        </div>
        <div className="text-[11px] text-muted">
          推奨: 0.50 (デフォルト)。0.80 以上にすると確実な抽出のみ採用、0.30 以下にすると AI 出力を積極的に流し込みます。
        </div>
      </section>

      {/* ── データソース ─────────────────────────────── */}
      <section className="glass-card p-5 space-y-4">
        <div>
          <div className="text-xs font-semibold tracking-[0.18em] text-muted">SOURCES</div>
          <div className="mt-1 text-base font-semibold text-primary">参照を許可する情報ソース</div>
          <p className="mt-1 text-xs text-muted">
            AI が下書き生成のために読みに行く情報源です。プライバシー / コンプライアンス上の理由で参照させたくないソースを OFF にできます。
          </p>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {AUTOMATION_SOURCES.map((s) => {
            const on = effectiveSource(s.key, s.defaultEnabled);
            return (
              <label
                key={s.key}
                className={`flex items-start gap-3 rounded-lg border px-3 py-2.5 ${
                  on
                    ? "border-accent/30 bg-accent/5"
                    : "border-border-subtle bg-surface"
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
                <div
                  key={f.key}
                  className="rounded-xl border border-border-subtle bg-surface px-4 py-3"
                >
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
                                selected
                                  ? POLICY_LABELS[p].tone
                                  : "bg-surface text-muted hover:bg-surface-hover"
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
        <button
          type="button"
          className="btn-primary text-sm"
          disabled={!canEdit || saving}
          onClick={save}
        >
          {saving ? "保存中..." : "AI 自動入力の設定を保存"}
        </button>
      </div>
    </div>
  );
}
