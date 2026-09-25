"use client";

import { useMemo, useState } from "react";
import {
  measurementFieldsForForm,
  measurementGroup,
  type IndicatedInspectionForm,
  type MeasurementInput,
} from "@/lib/validations/indicated-inspection";

/**
 * 完成検査（指定整備記録簿・第三号/四号様式）の測定値 手入力フォーム。 [G5 / Phase 1b]
 *
 * inspection_type='completion' の点検記録を作成し、様式の「検査機器等による検査」測定値を
 * inspection_measurements へ保存する。様式(四輪=第三号 / 二輪=第四号)で測定セルが変わる。
 * 目視等による検査（構造・装置）と車両情報の照合は後続で拡張する。
 */

interface Props {
  reservationId: string;
  vehicleId?: string | null;
  customerId?: string | null;
  onCancel: () => void;
  onSaved: () => void | Promise<void>;
}

type Cell = { num: string; text: string; unit: string; judgment: string };

const FORM_LABEL: Record<IndicatedInspectionForm, string> = {
  sanago: "第三号様式（四輪）",
  yonago: "第四号様式（二輪）",
};

const JUDGMENTS: { value: string; label: string }[] = [
  { value: "", label: "—" },
  { value: "pass", label: "良" },
  { value: "fail", label: "否" },
  { value: "na", label: "該当なし" },
];

export default function CompletionInspectionForm({ reservationId, vehicleId, customerId, onCancel, onSaved }: Props) {
  const [form, setForm] = useState<IndicatedInspectionForm>("sanago");
  const [inspectorName, setInspectorName] = useState("");
  const [notes, setNotes] = useState("");
  const [cells, setCells] = useState<Record<string, Cell>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 作成済みレコード ID。測定値保存だけ失敗した際、再保存で新レコードを重複作成しないよう保持する。
  const [recordId, setRecordId] = useState<string | null>(null);

  const fields = useMemo(() => measurementFieldsForForm(form), [form]);
  const groups = useMemo(() => {
    const map = new Map<string, typeof fields>();
    for (const f of fields) {
      const g = measurementGroup(f.code);
      const arr = map.get(g) ?? [];
      arr.push(f);
      map.set(g, arr);
    }
    return Array.from(map.entries());
  }, [fields]);

  function cell(code: string): Cell {
    return cells[code] ?? { num: "", text: "", unit: "", judgment: "" };
  }
  function setCell(code: string, patch: Partial<Cell>) {
    setCells((prev) => ({ ...prev, [code]: { ...cell(code), ...patch } }));
  }

  /** 入力済みセルから PUT 用の測定値配列を組み立てる（空セルは送らない） */
  function buildMeasurements(): MeasurementInput[] {
    const out: MeasurementInput[] = [];
    for (const f of fields) {
      const c = cells[f.code];
      if (!c) continue;
      if (f.valueKind === "numeric") {
        if (c.num.trim() === "") continue;
        const n = Number(c.num);
        if (!Number.isFinite(n)) continue;
        out.push({ field_code: f.code, num_value: n, unit: c.unit || (f.units?.[0] ?? null), source: "manual" });
      } else if (f.valueKind === "judgment") {
        if (!c.judgment) continue;
        out.push({ field_code: f.code, judgment: c.judgment as "pass" | "fail" | "na", source: "manual" });
      } else {
        if (c.text.trim() === "") continue;
        out.push({
          field_code: f.code,
          text_value: c.text.trim(),
          unit: c.unit || (f.units?.[0] ?? null),
          source: "manual",
        });
      }
    }
    return out;
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      // 1) 完成検査レコードを作成（既に作成済みなら再利用し、重複作成を避ける）
      let id = recordId;
      if (!id) {
        const createRes = await fetch("/api/admin/inspection-records", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            reservation_id: reservationId,
            vehicle_id: vehicleId ?? null,
            customer_id: customerId ?? null,
            inspection_type: "completion",
            inspector_name: inspectorName || null,
            notes: notes || null,
          }),
        });
        const createJson = await createRes.json().catch(() => ({}));
        if (!createRes.ok) throw new Error(createJson?.message ?? "完成検査記録の作成に失敗しました。");
        id = createJson?.record?.id;
        if (!id) throw new Error("作成した記録の ID を取得できませんでした。");
        setRecordId(id);
      }

      // 2) 測定値を保存
      const measurements = buildMeasurements();
      const putRes = await fetch(`/api/admin/inspection-records/${id}/measurements`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ measurements }),
      });
      const putJson = await putRes.json().catch(() => ({}));
      if (!putRes.ok) throw new Error(putJson?.message ?? "測定値の保存に失敗しました。");

      await onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存に失敗しました。");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="glass-card space-y-4 p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-semibold text-primary">完成検査（指定整備記録簿）</div>
        <div className="flex gap-1">
          {(Object.keys(FORM_LABEL) as IndicatedInspectionForm[]).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setForm(f)}
              className={`rounded-lg px-2 py-1 text-xs ${
                form === f ? "bg-accent text-white" : "bg-surface-hover text-secondary"
              }`}
            >
              {FORM_LABEL[f]}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <label className="text-xs text-secondary">
          自動車検査員の氏名
          <input
            value={inspectorName}
            onChange={(e) => setInspectorName(e.target.value)}
            className="input mt-1 w-full text-sm"
            maxLength={80}
          />
        </label>
      </div>

      {groups.map(([groupName, groupFields]) => (
        <div key={groupName} className="space-y-2">
          <div className="text-[11px] font-semibold tracking-[0.14em] text-muted uppercase">{groupName}</div>
          <div className="space-y-1">
            {groupFields.map((f) => {
              const c = cell(f.code);
              return (
                <div key={f.code} className="flex items-center gap-2">
                  <span className="w-40 shrink-0 text-[12px] text-secondary">{f.label}</span>
                  {f.valueKind === "numeric" && (
                    <>
                      <input
                        type="number"
                        inputMode="decimal"
                        value={c.num}
                        onChange={(e) => setCell(f.code, { num: e.target.value })}
                        className="input w-28 text-sm"
                      />
                      {f.units && f.units.length > 1 ? (
                        <select
                          value={c.unit || f.units[0]}
                          onChange={(e) => setCell(f.code, { unit: e.target.value })}
                          className="input w-20 text-sm"
                        >
                          {f.units.map((u) => (
                            <option key={u} value={u}>
                              {u}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="w-20 text-[12px] text-muted">{f.units?.[0] ?? ""}</span>
                      )}
                    </>
                  )}
                  {f.valueKind === "judgment" && (
                    <select
                      value={c.judgment}
                      onChange={(e) => setCell(f.code, { judgment: e.target.value })}
                      className="input w-28 text-sm"
                    >
                      {JUDGMENTS.map((j) => (
                        <option key={j.value} value={j.value}>
                          {j.label}
                        </option>
                      ))}
                    </select>
                  )}
                  {f.valueKind === "text" && (
                    <input
                      value={c.text}
                      onChange={(e) => setCell(f.code, { text: e.target.value })}
                      className="input w-40 text-sm"
                      maxLength={200}
                      placeholder={f.units?.[0] ? `例: ${f.units[0]}` : undefined}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}

      <label className="block text-xs text-secondary">
        点検及び整備の概要 / 備考
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          className="input mt-1 w-full text-sm"
          maxLength={2000}
        />
      </label>

      {error && (
        <div className="rounded-lg border-l-4 border-danger bg-danger/10 p-2 text-xs text-danger-text">{error}</div>
      )}

      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} disabled={saving} className="btn-ghost text-xs">
          キャンセル
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="btn-primary text-xs disabled:opacity-50"
        >
          {saving ? "保存中…" : "完成検査を保存"}
        </button>
      </div>
    </div>
  );
}
