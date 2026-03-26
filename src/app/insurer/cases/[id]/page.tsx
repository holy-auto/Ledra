"use client";

import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { formatDateTime } from "@/lib/format";

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  open: { label: "対応待ち", color: "blue" },
  in_progress: { label: "対応中", color: "amber" },
  pending_tenant: { label: "施工店確認中", color: "purple" },
  resolved: { label: "解決済み", color: "emerald" },
  closed: { label: "クローズ", color: "neutral" },
};

const PRIORITY_MAP: Record<string, { label: string; color: string }> = {
  low: { label: "低", color: "neutral" },
  normal: { label: "通常", color: "blue" },
  high: { label: "高", color: "amber" },
  urgent: { label: "緊急", color: "red" },
};

const TRANSITIONS: Record<string, string[]> = {
  open: ["in_progress", "pending_tenant"],
  in_progress: ["pending_tenant", "resolved"],
  pending_tenant: ["in_progress", "resolved"],
  resolved: ["closed"],
  closed: [],
};

function statusClasses(status: string) {
  const c = STATUS_MAP[status]?.color ?? "neutral";
  const map: Record<string, string> = {
    blue: "bg-blue-100 text-blue-800",
    amber: "bg-amber-100 text-amber-800",
    purple: "bg-purple-100 text-purple-800",
    emerald: "bg-emerald-100 text-emerald-800",
    neutral: "bg-neutral-100 text-neutral-600",
  };
  return map[c] ?? map.neutral;
}

function priorityClasses(priority: string) {
  const c = PRIORITY_MAP[priority]?.color ?? "neutral";
  const map: Record<string, string> = {
    neutral: "bg-neutral-100 text-neutral-600",
    blue: "bg-blue-100 text-blue-800",
    amber: "bg-amber-100 text-amber-800",
    red: "bg-red-100 text-red-800",
  };
  return map[c] ?? map.neutral;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

type CaseDetail = {
  id: string;
  case_number: string;
  title: string;
  status: string;
  priority: string;
  category: string | null;
  description: string | null;
  created_at: string;
};

type Message = {
  id: string;
  sender_type: "insurer" | "tenant" | "system";
  content: string;
  created_at: string;
};

type Attachment = {
  id: string;
  file_name: string;
  file_size: number;
  created_at: string;
  url?: string;
};

export default function InsurerCaseDetailPage() {
  const params = useParams();
  const caseId = params.id as string;
  const supabase = useMemo(() => createClient(), []);

  const [ready, setReady] = useState(false);
  const [caseData, setCaseData] = useState<CaseDetail | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msgText, setMsgText] = useState("");
  const [sending, setSending] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) { window.location.href = "/insurer/login"; return; }
      setReady(true);
    });
  }, [supabase]);

  const fetchCase = useCallback(async () => {
    setBusy(true); setErr(null);
    try {
      const res = await fetch(`/api/insurer/cases/${caseId}`);
      if (!res.ok) throw new Error("案件の取得に失敗しました");
      const json = await res.json();
      setCaseData(json.case ?? json);
      setMessages(json.messages ?? []);
      setAttachments(json.attachments ?? []);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "エラーが発生しました");
    } finally { setBusy(false); }
  }, [caseId]);

  const fetchMessages = useCallback(async () => {
    try {
      const res = await fetch(`/api/insurer/cases/${caseId}`);
      if (!res.ok) return;
      const json = await res.json();
      setMessages(json.messages ?? []);
      setAttachments(json.attachments ?? []);
      if (json.case) setCaseData(json.case);
    } catch {}
  }, [caseId]);

  useEffect(() => { if (ready) fetchCase(); }, [ready, fetchCase]);

  useEffect(() => {
    if (!ready) return;
    const interval = setInterval(fetchMessages, 10000);
    return () => clearInterval(interval);
  }, [ready, fetchMessages]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!msgText.trim()) return;
    setSending(true);
    try {
      const res = await fetch(`/api/insurer/cases/${caseId}/messages`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: msgText.trim() }),
      });
      if (!res.ok) throw new Error("メッセージの送信に失敗しました");
      setMsgText(""); fetchMessages();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "エラーが発生しました");
    } finally { setSending(false); }
  }

  async function handleStatusChange(newStatus: string) {
    setUpdatingStatus(true); setErr(null);
    try {
      const res = await fetch(`/api/insurer/cases/${caseId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) throw new Error("ステータスの更新に失敗しました");
      fetchCase();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "エラーが発生しました");
    } finally { setUpdatingStatus(false); }
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true); setErr(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`/api/insurer/cases/${caseId}/attachments`, {
        method: "POST", body: formData,
      });
      if (!res.ok) throw new Error("ファイルのアップロードに失敗しました");
      fetchMessages();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "エラーが発生しました");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  if (!ready || busy) {
    return (<div className="flex min-h-[60vh] items-center justify-center"><p className="text-sm text-neutral-500">読み込み中…</p></div>);
  }

  if (!caseData) {
    return (
      <div className="mx-auto max-w-5xl p-6">
        <Link href="/insurer/cases" className="text-sm text-blue-600 hover:underline">&larr; 案件一覧へ</Link>
        <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">案件が見つかりません</div>
      </div>
    );
  }

  const validTransitions = TRANSITIONS[caseData.status] ?? [];

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <div><Link href="/insurer/cases" className="text-sm text-blue-600 hover:underline">&larr; 案件一覧へ</Link></div>

      <header className="space-y-3">
        <div className="inline-flex rounded-full border border-neutral-300 bg-white px-3 py-1 text-[11px] font-semibold tracking-[0.18em] text-neutral-600">案件詳細</div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-neutral-900">{caseData.case_number} - {caseData.title}</h1>
            <div className="mt-2 flex flex-wrap gap-2">
              <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusClasses(caseData.status)}`}>{STATUS_MAP[caseData.status]?.label ?? caseData.status}</span>
              <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${priorityClasses(caseData.priority)}`}>{PRIORITY_MAP[caseData.priority]?.label ?? caseData.priority}</span>
            </div>
          </div>
          {validTransitions.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {validTransitions.map((s) => (
                <button key={s} onClick={() => handleStatusChange(s)} disabled={updatingStatus}
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold transition disabled:opacity-50 ${statusClasses(s)} hover:opacity-80`}>
                  {STATUS_MAP[s]?.label ?? s} に変更
                </button>
              ))}
            </div>
          )}
        </div>
      </header>

      {err && (<div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{err}</div>)}

      <section className="rounded-2xl border border-neutral-200 bg-white p-6">
        <h2 className="mb-4 text-lg font-bold text-neutral-900">案件情報</h2>
        <dl className="grid gap-4 sm:grid-cols-2">
          <div><dt className="text-xs font-medium text-neutral-500">案件番号</dt><dd className="mt-0.5 font-mono text-sm text-neutral-900">{caseData.case_number}</dd></div>
          <div><dt className="text-xs font-medium text-neutral-500">ステータス</dt><dd className="mt-0.5"><span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusClasses(caseData.status)}`}>{STATUS_MAP[caseData.status]?.label ?? caseData.status}</span></dd></div>
          <div><dt className="text-xs font-medium text-neutral-500">優先度</dt><dd className="mt-0.5"><span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${priorityClasses(caseData.priority)}`}>{PRIORITY_MAP[caseData.priority]?.label ?? caseData.priority}</span></dd></div>
          <div><dt className="text-xs font-medium text-neutral-500">カテゴリ</dt><dd className="mt-0.5 text-sm text-neutral-900">{caseData.category || "-"}</dd></div>
          <div><dt className="text-xs font-medium text-neutral-500">作成日</dt><dd className="mt-0.5 text-sm text-neutral-900">{formatDateTime(caseData.created_at)}</dd></div>
          <div className="sm:col-span-2"><dt className="text-xs font-medium text-neutral-500">説明</dt><dd className="mt-0.5 whitespace-pre-wrap text-sm text-neutral-900">{caseData.description || "-"}</dd></div>
        </dl>
      </section>

      <section className="rounded-2xl border border-neutral-200 bg-white">
        <div className="border-b border-neutral-200 px-6 py-4"><h2 className="text-lg font-bold text-neutral-900">メッセージ</h2></div>
        <div className="h-96 overflow-y-auto p-6 space-y-4">
          {messages.length === 0 ? (<p className="text-center text-sm text-neutral-400">メッセージはまだありません</p>) : (
            messages.map((msg) => {
              const isInsurer = msg.sender_type === "insurer";
              const isSystem = msg.sender_type === "system";
              if (isSystem) {
                return (<div key={msg.id} className="flex justify-center"><div className="max-w-md rounded-xl bg-amber-50 px-4 py-2 text-center"><span className="mr-2 inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">システム</span><p className="mt-1 text-sm text-amber-800">{msg.content}</p><p className="mt-1 text-[10px] text-amber-500">{formatDateTime(msg.created_at)}</p></div></div>);
              }
              return (
                <div key={msg.id} className={`flex ${isInsurer ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[70%] rounded-xl px-4 py-3 ${isInsurer ? "bg-blue-50" : "bg-neutral-50"}`}>
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${isInsurer ? "bg-blue-100 text-blue-700" : "bg-neutral-200 text-neutral-600"}`}>{isInsurer ? "保険会社" : "施工店"}</span>
                    <p className="mt-1.5 text-sm text-neutral-900 whitespace-pre-wrap">{msg.content}</p>
                    <p className="mt-1 text-[10px] text-neutral-400">{formatDateTime(msg.created_at)}</p>
                  </div>
                </div>
              );
            })
          )}
          <div ref={chatEndRef} />
        </div>
        <form onSubmit={handleSend} className="flex gap-2 border-t border-neutral-200 p-4">
          <textarea value={msgText} onChange={(e) => setMsgText(e.target.value)} rows={2} placeholder="メッセージを入力…"
            className="flex-1 resize-none rounded-xl border border-neutral-200 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
            onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); handleSend(e); } }} />
          <button type="submit" disabled={sending || !msgText.trim()} className="btn-primary self-end disabled:opacity-50">{sending ? "送信中…" : "送信"}</button>
        </form>
      </section>

      <section className="rounded-2xl border border-neutral-200 bg-white p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-neutral-900">添付ファイル</h2>
          <label className="btn-primary cursor-pointer text-sm">
            {uploading ? "アップロード中…" : "ファイルを追加"}
            <input ref={fileInputRef} type="file" className="hidden" onChange={handleUpload} disabled={uploading} />
          </label>
        </div>
        {attachments.length === 0 ? (<p className="text-sm text-neutral-400">添付ファイルはありません</p>) : (
          <div className="divide-y divide-neutral-100">
            {attachments.map((att) => (
              <div key={att.id} className="flex items-center justify-between py-3">
                <div>
                  <p className="text-sm font-medium text-neutral-900">{att.file_name}</p>
                  <p className="text-xs text-neutral-500">{formatFileSize(att.file_size)} &middot; {formatDateTime(att.created_at)}</p>
                </div>
                {att.url && (<a href={att.url} target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-blue-600 hover:text-blue-800 hover:underline">ダウンロード</a>)}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
