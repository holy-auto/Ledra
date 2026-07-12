"use client";

import { useCallback, useEffect, useState } from "react";
import { parseJsonSafe } from "@/lib/api/safeJson";

interface FieldEntry {
  id: string;
  title: string;
  content: string;
  vehicle_model: string | null;
  tags: string[];
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

interface AskResult {
  can_answer: boolean;
  answer?: string;
  confidence: number;
  ai: boolean;
}

const API = "/api/admin/field-knowledge";

/**
 * 現場スタッフ向け施工ナレッジの管理 + 質問 UI。
 * 上部の質問ボックスは登録ナレッジのみを根拠に AI が回答する
 * (ナレッジ外は「確認が必要」)。staff 以上は登録・削除できる。
 */
export default function FieldKnowledgeClient({ canEdit }: { canEdit: boolean }) {
  const [entries, setEntries] = useState<FieldEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [warning, setWarning] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  // 質問ボックス
  const [question, setQuestion] = useState("");
  const [asking, setAsking] = useState(false);
  const [answer, setAnswer] = useState<AskResult | null>(null);
  const [askError, setAskError] = useState<string | null>(null);

  // 追加フォーム
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [vehicleModel, setVehicleModel] = useState("");
  const [saving, setSaving] = useState(false);

  const fetchEntries = useCallback(async () => {
    try {
      const res = await fetch(API, { cache: "no-store" });
      const j = await parseJsonSafe(res);
      if (res.ok && Array.isArray(j?.entries)) {
        setEntries(j.entries as FieldEntry[]);
        setWarning(typeof j?.warning === "string" ? j.warning : null);
      } else {
        setWarning("ナレッジの読み込みに失敗しました。再読み込みしてください。");
      }
    } catch {
      setWarning("ナレッジの読み込みに失敗しました。再読み込みしてください。");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchEntries();
  }, [fetchEntries]);

  function flash(text: string, ok: boolean) {
    setMsg({ text, ok });
    setTimeout(() => setMsg(null), 4000);
  }

  async function handleAsk() {
    const q = question.trim();
    if (q.length < 3) return;
    setAsking(true);
    setAnswer(null);
    setAskError(null);
    try {
      const res = await fetch(`${API}/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q }),
      });
      const j = await parseJsonSafe(res);
      if (res.ok && j?.result) {
        setAnswer(j.result as AskResult);
      } else {
        setAskError((j?.message as string) || "回答の取得に失敗しました。");
      }
    } catch {
      setAskError("回答の取得に失敗しました。");
    } finally {
      setAsking(false);
    }
  }

  async function handleAdd() {
    if (!title.trim() || !content.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          content: content.trim(),
          vehicle_model: vehicleModel.trim() || undefined,
        }),
      });
      const j = await parseJsonSafe(res);
      if (res.ok && j?.entry) {
        setEntries((prev) => [...prev, j.entry as FieldEntry]);
        setTitle("");
        setContent("");
        setVehicleModel("");
        flash("ナレッジを追加しました。", true);
      } else {
        flash((j?.message as string) || "追加に失敗しました。", false);
      }
    } catch {
      flash("追加に失敗しました。", false);
    } finally {
      setSaving(false);
    }
  }

  async function handleToggle(id: string, enabled: boolean) {
    try {
      const res = await fetch(`${API}/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      });
      const j = await parseJsonSafe(res);
      if (res.ok && j?.entry) {
        setEntries((prev) => prev.map((e) => (e.id === id ? (j.entry as FieldEntry) : e)));
      } else {
        flash((j?.message as string) || "更新に失敗しました。", false);
      }
    } catch {
      flash("更新に失敗しました。", false);
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm("このナレッジを削除しますか？ AI はこの内容で回答しなくなります。")) return;
    try {
      const res = await fetch(`${API}/${id}`, { method: "DELETE" });
      if (res.ok) {
        setEntries((prev) => prev.filter((e) => e.id !== id));
        flash("削除しました。", true);
      } else {
        const j = await parseJsonSafe(res);
        flash((j?.message as string) || "削除に失敗しました。", false);
      }
    } catch {
      flash("削除に失敗しました。", false);
    }
  }

  return (
    <div className="space-y-6">
      {msg && (
        <div
          className={`rounded-lg border px-4 py-2 text-sm ${
            msg.ok ? "border-emerald-300 text-emerald-700" : "border-red-300 text-red-700"
          }`}
        >
          {msg.text}
        </div>
      )}
      {warning && <div className="rounded-lg border border-amber-300 px-4 py-2 text-sm text-amber-700">{warning}</div>}

      {/* 質問ボックス */}
      <section className="glass-card p-5 space-y-3">
        <div className="text-base font-semibold text-primary">ナレッジに質問</div>
        <p className="text-xs text-muted">
          登録された施工ナレッジだけを根拠に AI が答えます。登録に無い内容は「確認が必要」と返します。
        </p>
        <textarea
          className="input-field w-full"
          rows={2}
          value={question}
          maxLength={2000}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="例: 30アルファードの前後ドラレコ取付で注意するところは？"
        />
        <button
          type="button"
          className="btn-primary"
          disabled={asking || question.trim().length < 3}
          onClick={handleAsk}
        >
          {asking ? "回答中…" : "質問する"}
        </button>

        {askError && <div className="rounded-lg border border-red-300 px-4 py-2 text-sm text-red-700">{askError}</div>}

        {answer &&
          (answer.can_answer && answer.answer ? (
            <div className="rounded-lg border border-subtle bg-base p-4">
              <p className="whitespace-pre-wrap text-sm text-primary">{answer.answer}</p>
              <p className="mt-2 text-[11px] text-muted">
                登録ナレッジに基づく回答{answer.ai ? "" : "（AI 利用不可のため回答なし）"}
              </p>
            </div>
          ) : (
            <div className="rounded-lg border border-amber-300 bg-base p-4 text-sm text-amber-700">
              登録された施工ナレッジからは回答できませんでした。関連する知見を下に登録すると次回から答えられます。
            </div>
          ))}
      </section>

      {/* 追加フォーム */}
      {canEdit && (
        <section className="glass-card p-5 space-y-3">
          <div className="text-base font-semibold text-primary">ナレッジを追加</div>
          <div>
            <label className="block text-xs text-muted mb-1">トピック (例: 30アルファードの前後ドラレコ取付)</label>
            <input
              className="input-field w-full"
              value={title}
              maxLength={200}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="30アルファードの前後ドラレコ取付"
            />
          </div>
          <div>
            <label className="block text-xs text-muted mb-1">対象車種 (任意)</label>
            <input
              className="input-field w-full"
              value={vehicleModel}
              maxLength={100}
              onChange={(e) => setVehicleModel(e.target.value)}
              placeholder="アルファード 30系"
            />
          </div>
          <div>
            <label className="block text-xs text-muted mb-1">ナレッジ本文 (AI はこの内容のとおりに答えます)</label>
            <textarea
              className="input-field w-full"
              rows={4}
              value={content}
              maxLength={2000}
              onChange={(e) => setContent(e.target.value)}
              placeholder="左Aピラー内の配線でクリップ破損に注意。リアゲートの蛇腹通しに時間がかかる。平均作業時間 約2.5時間。"
            />
          </div>
          <button
            type="button"
            className="btn-primary"
            disabled={saving || !title.trim() || !content.trim()}
            onClick={handleAdd}
          >
            {saving ? "追加中…" : "追加する"}
          </button>
        </section>
      )}

      {/* 一覧 */}
      <section className="glass-card p-5">
        <div className="mb-3 text-base font-semibold text-primary">
          登録済みナレッジ {loading ? "" : `(${entries.length}件)`}
        </div>
        {loading ? (
          <p className="text-sm text-muted">読み込み中…</p>
        ) : entries.length === 0 ? (
          <p className="text-sm text-muted">
            まだナレッジがありません。車種別の注意点・配線ルート・クレーム事例などを登録すると、 スタッフが AI
            に質問して引き出せるようになります。
          </p>
        ) : (
          <ul className="space-y-3">
            {entries.map((e) => (
              <li key={e.id} className="rounded-lg border border-subtle p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className={`text-sm font-semibold ${e.enabled ? "text-primary" : "text-muted"}`}>
                      {e.title}
                      {e.vehicle_model && (
                        <span className="ml-2 text-xs font-normal text-accent">{e.vehicle_model}</span>
                      )}
                      {!e.enabled && <span className="ml-2 text-xs font-normal text-muted">(停止中)</span>}
                    </div>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-secondary">{e.content}</p>
                  </div>
                  {canEdit && (
                    <div className="flex shrink-0 flex-col items-end gap-1 text-xs">
                      <label className="inline-flex cursor-pointer items-center gap-1.5">
                        <input
                          type="checkbox"
                          checked={e.enabled}
                          onChange={() => void handleToggle(e.id, !e.enabled)}
                        />
                        回答に使う
                      </label>
                      <button type="button" className="text-red-600 underline" onClick={() => void handleDelete(e.id)}>
                        削除
                      </button>
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
