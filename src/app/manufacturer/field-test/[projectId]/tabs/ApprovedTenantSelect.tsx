"use client";

import { useEffect, useState } from "react";
import { approvedTenants, type ApprovedTenant } from "@/lib/fieldTest/applicationGate";

type State = { kind: "loading" } | { kind: "error" } | { kind: "ready"; tenants: ApprovedTenant[] };

/**
 * そのプロジェクトで応募が承認された施工店を選ぶ欄（name="tenant_id"）。案件割当・契約追加のフォームで使う。
 *
 * フォームを開いたときにマウントされ、そのたびに取り直す（別タブで応募を承認した直後でも選べるように）。
 * 候補は API 側の判定（hasApprovedApplication）と同じ approved 条件。選べる施工店があるかは
 * onAvailableChange で親に伝え、親は送信ボタンの可否に使う。DECISION_LOG 2026-10-06。
 */
export default function ApprovedTenantSelect({
  projectId,
  onAvailableChange,
}: {
  projectId: string;
  onAvailableChange: (available: boolean) => void;
}) {
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    // 閉じた・プロジェクトが変わった後に古い応答が届いても反映しない。
    let active = true;
    fetch(`/api/manufacturer/field-test/applications?project_id=${encodeURIComponent(projectId)}&status=approved`, {
      cache: "no-store",
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((json) => {
        if (!active) return;
        const tenants = approvedTenants(json.applications ?? []);
        setState({ kind: "ready", tenants });
        onAvailableChange(tenants.length > 0);
      })
      .catch(() => {
        if (!active) return;
        setState({ kind: "error" });
        onAvailableChange(false);
      });
    return () => {
      active = false;
    };
  }, [projectId, onAvailableChange]);

  if (state.kind === "loading") return <div className="text-sm text-secondary">施工店を読み込み中...</div>;
  if (state.kind === "error") {
    return (
      <div className="rounded-md border border-danger-border bg-danger-dim p-3 text-sm text-danger-text">
        承認済みの施工店を読み込めませんでした。フォームを閉じて開き直してください。
      </div>
    );
  }
  if (state.tenants.length === 0) {
    return (
      <div className="text-sm text-secondary">
        選べる施工店がありません。応募タブで施工店の応募を承認すると選べるようになります。
      </div>
    );
  }
  return (
    <select
      name="tenant_id"
      required
      defaultValue=""
      className="w-full rounded-lg border border-border-subtle bg-surface px-3 py-2 text-sm"
    >
      <option value="" disabled>
        施工店を選択（応募承認済み）
      </option>
      {state.tenants.map((t) => (
        <option key={t.id} value={t.id}>
          {t.name ?? t.id}
        </option>
      ))}
    </select>
  );
}
