"use client";

import { useEffect, useState } from "react";

type Inquiry = {
  id: string;
  public_id?: string | null;
  sender_name: string;
  sender_email?: string | null;
  sender_phone?: string | null;
  body: string;
  status: string;
  admin_notes?: string | null;
  created_at: string;
  replied_at?: string | null;
  closed_at?: string | null;
};

const STATUS_LABELS: Record<string, string> = {
  pending: "未対応",
  replied: "対応済",
  closed: "完了",
};

const STATUS_BADGE_CLASS: Record<string, string> = {
  pending: "bg-amber-50 text-amber-700 border-amber-200",
  replied: "bg-blue-50 text-blue-700 border-blue-200",
  closed: "bg-neutral-100 text-neutral-500 border-neutral-200",
};

function formatDateTime(v?: string | null) {
  if (!v) return "-";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleString("ja-JP");
}

export default function InquiriesClient() {
  const [inquiries, setInquiries] = useState<Inquiry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchInquiries = async (status?: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (status) params.set("status", status);
      const res = await fetch(`/api/admin/inquiries?${params}`, { cache: "no-store" });
      if (!res.ok) return;
      const j = await res.json();
      setInquiries(j.inquiries ?? []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInquiries(filter || undefined);
  }, [filter]);

  const updateStatus = async (id: string, newStatus: string) => {
    try {
      const res = await fetch(`/api/admin/inquiries/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        fetchInquiries(filter || undefined);
      }
    } catch {
      // ignore
    }
  };

  const tabs = [
    { label: "全て", value: "" },
    { label: "未対応", value: "pending" },
    { label: "対応済", value: "replied" },
    { label: "完了", value: "closed" },
  ];

  return (
    <div className="space-y-4">
      {/* Tabs */}
      <div className="flex gap-1 rounded-xl bg-neutral-100 p-1">
        {tabs.map((tab) => (
          <button
            key={tab.value}
            type="button"
            onClick={() => setFilter(tab.value)}
            className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              filter === tab.value
                ? "bg-white text-neutral-900 shadow-sm"
                : "text-neutral-500 hover:text-neutral-700"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* List */}
      {loading ? (
        <div className="text-center text-sm text-neutral-400 py-8">読み込み中...</div>
      ) : inquiries.length === 0 ? (
        <div className="text-center text-sm text-neutral-400 py-8">お問い合わせはありません</div>
      ) : (
        <div className="space-y-3">
          {inquiries.map((inq) => (
            <div
              key={inq.id}
              className={`rounded-2xl border bg-white p-4 shadow-sm transition-colors ${
                inq.status === "pending" ? "border-amber-200" : "border-neutral-200"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-neutral-900">{inq.sender_name}</span>
                    <span
                      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-bold ${
                        STATUS_BADGE_CLASS[inq.status] ?? STATUS_BADGE_CLASS.closed
                      }`}
                    >
                      {STATUS_LABELS[inq.status] ?? inq.status}
                    </span>
                    {inq.public_id && (
                      <span className="font-mono text-[11px] text-neutral-400">{inq.public_id}</span>
                    )}
                  </div>

                  {inq.sender_email && (
                    <div className="mt-0.5 text-xs text-neutral-400">{inq.sender_email}</div>
                  )}

                  <button
                    type="button"
                    onClick={() => setExpandedId(expandedId === inq.id ? null : inq.id)}
                    className="mt-2 text-sm text-neutral-700 text-left w-full"
                  >
                    {expandedId === inq.id ? (
                      <div className="whitespace-pre-wrap">{inq.body}</div>
                    ) : (
                      <div className="line-clamp-2">{inq.body}</div>
                    )}
                  </button>

                  <div className="mt-2 text-[11px] text-neutral-400">{formatDateTime(inq.created_at)}</div>
                </div>
              </div>

              {/* Actions */}
              <div className="mt-3 flex gap-2 flex-wrap">
                {inq.status === "pending" && (
                  <button
                    type="button"
                    onClick={() => updateStatus(inq.id, "replied")}
                    className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100 transition-colors"
                  >
                    対応済みにする
                  </button>
                )}
                {inq.status !== "closed" && (
                  <button
                    type="button"
                    onClick={() => updateStatus(inq.id, "closed")}
                    className="rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-1.5 text-xs font-medium text-neutral-600 hover:bg-neutral-100 transition-colors"
                  >
                    完了にする
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
