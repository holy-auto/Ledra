"use client";

/**
 * JobHandoffPanel
 * ------------------------------------------------------------
 * 案件 (予約) の担当者間 申し送りメモ。
 * reservations.handoff_notes (JSONB 配列) を一覧表示し、追加 / 削除を行う。
 *
 * - 一覧は新しい順 (created_at 降順)
 * - priority に応じて左 border / バッジ色を変える (urgent=赤 / important=琥珀 / normal=灰)
 * - 自分が投稿したメモのみ削除ボタンを表示
 *
 * サーバ (POST/DELETE /api/admin/reservations/[id]/handoff) は更新後の
 * handoff_notes 全体を返すため、それで state を置き換える (楽観更新の整合)。
 */

import { useMemo, useState } from "react";
import { parseJsonSafe } from "@/lib/api/safeJson";
import { formatDateTime } from "@/lib/format";

export type HandoffPriority = "normal" | "important" | "urgent";

export type HandoffNote = {
  id: string;
  author_id: string;
  author_name: string;
  content: string;
  created_at: string;
  priority: HandoffPriority;
};

interface Props {
  reservationId: string;
  initialNotes?: HandoffNote[];
  /** 現在のログインユーザ id。自分の投稿にのみ削除ボタンを出すために使用。 */
  currentUserId?: string | null;
}

const PRIORITY_LABEL: Record<HandoffPriority, string> = {
  normal: "通常",
  important: "重要",
  urgent: "緊急",
};

/** バッジの色 (背景・文字)。CSS 変数トークンを使用。 */
const PRIORITY_BADGE: Record<HandoffPriority, { bg: string; fg: string }> = {
  normal: { bg: "var(--bg-inset)", fg: "var(--text-secondary)" },
  important: { bg: "var(--accent-amber-dim)", fg: "var(--accent-amber-text)" },
  urgent: { bg: "var(--accent-red-dim)", fg: "var(--accent-red-text)" },
};

/** 左 border の色。normal は控えめ、important/urgent は強調。 */
const PRIORITY_BORDER: Record<HandoffPriority, string> = {
  normal: "var(--border-default, rgba(0,0,0,0.12))",
  important: "var(--accent-amber)",
  urgent: "var(--accent-red)",
};

const PRIORITY_OPTIONS: HandoffPriority[] = ["normal", "important", "urgent"];

function sortNewestFirst(notes: HandoffNote[]): HandoffNote[] {
  return [...notes].sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0));
}

export default function JobHandoffPanel({ reservationId, initialNotes = [], currentUserId = null }: Props) {
  const [notes, setNotes] = useState<HandoffNote[]>(() => sortNewestFirst(initialNotes));
  const [content, setContent] = useState("");
  const [priority, setPriority] = useState<HandoffPriority>("normal");
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const sorted = useMemo(() => sortNewestFirst(notes), [notes]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = content.trim();
    if (!trimmed || submitting) return;

    setSubmitting(true);
    setErr(null);
    try {
      const res = await fetch(`/api/admin/reservations/${reservationId}/handoff`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: trimmed, priority }),
      });
      const json = await parseJsonSafe<{ handoff_notes?: HandoffNote[]; message?: string }>(res);
      if (!res.ok) throw new Error(json?.message ?? `HTTP ${res.status}`);
      if (json?.handoff_notes) setNotes(json.handoff_notes);
      setContent("");
      setPriority("normal");
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e));
    }
    setSubmitting(false);
  }

  async function handleDelete(noteId: string) {
    if (deletingId) return;
    setDeletingId(noteId);
    setErr(null);
    try {
      const res = await fetch(
        `/api/admin/reservations/${reservationId}/handoff?note_id=${encodeURIComponent(noteId)}`,
        { method: "DELETE" },
      );
      const json = await parseJsonSafe<{ handoff_notes?: HandoffNote[]; message?: string }>(res);
      if (!res.ok) throw new Error(json?.message ?? `HTTP ${res.status}`);
      if (json?.handoff_notes) setNotes(json.handoff_notes);
      else setNotes((prev) => prev.filter((n) => n.id !== noteId));
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e));
    }
    setDeletingId(null);
  }

  return (
    <div className="space-y-4">
      {/* 入力フォーム */}
      <form onSubmit={handleSubmit} className="glass-card p-4 space-y-3">
        <div className="text-[11px] font-semibold tracking-[0.18em] text-muted uppercase">申し送りを追加</div>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="次の担当者への引き継ぎ事項を入力 (例: 左ドアの再塗装は乾燥待ち、明日午後に研磨予定)"
          rows={3}
          maxLength={2000}
          className="w-full resize-y rounded-lg border border-border-default bg-surface px-3 py-2 text-[14px] text-primary outline-none focus:border-accent"
        />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1.5">
            {PRIORITY_OPTIONS.map((p) => {
              const active = priority === p;
              const tone = PRIORITY_BADGE[p];
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPriority(p)}
                  className="rounded-full px-3 py-1 text-[12px] font-medium transition-opacity"
                  style={
                    active
                      ? { backgroundColor: tone.bg, color: tone.fg, opacity: 1 }
                      : { backgroundColor: "transparent", color: "var(--text-secondary)", opacity: 0.6 }
                  }
                  aria-pressed={active}
                >
                  {PRIORITY_LABEL[p]}
                </button>
              );
            })}
          </div>
          <button
            type="submit"
            disabled={submitting || content.trim().length === 0}
            className="rounded-lg bg-accent px-4 py-2 text-[13px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {submitting ? "送信中…" : "申し送りを追加"}
          </button>
        </div>
        {err && <p className="text-[12px] text-danger">{err}</p>}
      </form>

      {/* 一覧 (新しい順) */}
      {sorted.length === 0 ? (
        <div className="glass-card p-8 text-center text-sm text-muted">申し送りメモはまだありません。</div>
      ) : (
        <ul className="space-y-3">
          {sorted.map((note) => {
            const badge = PRIORITY_BADGE[note.priority] ?? PRIORITY_BADGE.normal;
            const isMine = !!currentUserId && note.author_id === currentUserId;
            return (
              <li
                key={note.id}
                className="glass-card p-4"
                style={{ borderLeft: `3px solid ${PRIORITY_BORDER[note.priority] ?? PRIORITY_BORDER.normal}` }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className="rounded-full px-2 py-0.5 text-[11px] font-semibold"
                      style={{ backgroundColor: badge.bg, color: badge.fg }}
                    >
                      {PRIORITY_LABEL[note.priority] ?? note.priority}
                    </span>
                    <span className="text-[13px] font-medium text-primary">{note.author_name}</span>
                    <span className="text-[11px] text-muted">{formatDateTime(note.created_at)}</span>
                  </div>
                  {isMine && (
                    <button
                      type="button"
                      onClick={() => handleDelete(note.id)}
                      disabled={deletingId === note.id}
                      className="shrink-0 text-[12px] font-medium text-muted transition-colors hover:text-danger disabled:opacity-50"
                      aria-label="この申し送りを削除"
                    >
                      {deletingId === note.id ? "削除中…" : "削除"}
                    </button>
                  )}
                </div>
                <p className="mt-2 whitespace-pre-wrap text-[14px] text-secondary">{note.content}</p>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
