"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import Badge from "@/components/ui/Badge";
import { formatDateTime } from "@/lib/format";

type ReferralLink = {
  id: string;
  code: string;
  label: string | null;
  url: string;
  click_count: number;
  is_active: boolean;
  created_at: string;
};

export default function AgentReferralLinksPage() {
  const supabase = useMemo(() => createClient(), []);
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [links, setLinks] = useState<ReferralLink[]>([]);
  const [creating, setCreating] = useState(false);
  const [label, setLabel] = useState("");
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u?.user) { window.location.href = "/agent/login"; return; }
      setReady(true);
      fetchData();
    })();
  }, [supabase]);

  const fetchData = async () => {
    setLoading(true);
    const res = await fetch("/api/agent/referral-links");
    if (res.ok) setLinks((await res.json()).links ?? []);
    setLoading(false);
  };

  const createLink = async () => {
    setCreating(true);
    const res = await fetch("/api/agent/referral-links", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ label: label || null }),
    });
    if (res.ok) {
      setLabel("");
      fetchData();
    }
    setCreating(false);
  };

  const copyToClipboard = async (url: string, id: string) => {
    await navigator.clipboard.writeText(url);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  if (!ready) return null;

  return (
    <div className="space-y-6">
      <div>
        <div className="inline-flex rounded-full border border-neutral-300 bg-white px-3 py-1 text-[11px] font-semibold tracking-[0.22em] text-neutral-600">
          REFERRAL LINKS
        </div>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-neutral-900">紹介リンク・QRコード</h1>
        <p className="mt-1 text-sm text-neutral-500">営業先で使える専用リンクとQRコードを生成します</p>
      </div>

      {/* Create new link */}
      <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1">
            <label className="mb-1 block text-xs font-medium text-neutral-600">リンクのラベル（任意）</label>
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="例: 2026年春キャンペーン用"
              className="w-full rounded-xl border border-neutral-300 bg-neutral-50 px-4 py-2.5 text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-neutral-400"
            />
          </div>
          <button
            onClick={createLink}
            disabled={creating}
            className="rounded-xl bg-neutral-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
          >
            {creating ? "作成中..." : "リンクを作成"}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="animate-pulse space-y-3">
          {[1, 2, 3].map((i) => <div key={i} className="h-28 rounded-2xl bg-neutral-100" />)}
        </div>
      ) : links.length === 0 ? (
        <div className="rounded-2xl border border-neutral-200 bg-white p-8 text-center text-sm text-neutral-500">
          紹介リンクはまだありません。上から作成してください。
        </div>
      ) : (
        <div className="space-y-3">
          {links.map((link) => (
            <div key={link.id} className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-neutral-900">{link.label ?? link.code}</h3>
                    {link.is_active ? (
                      <Badge variant="success">有効</Badge>
                    ) : (
                      <Badge variant="default">無効</Badge>
                    )}
                  </div>
                  <div className="mt-1 flex items-center gap-2">
                    <code className="rounded bg-neutral-100 px-2 py-0.5 text-xs text-neutral-700 break-all">
                      {link.url}
                    </code>
                    <button
                      onClick={() => copyToClipboard(link.url, link.id)}
                      className="shrink-0 rounded-lg border border-neutral-300 px-2 py-1 text-xs font-medium text-neutral-600 hover:bg-neutral-50"
                    >
                      {copied === link.id ? "コピー済み" : "コピー"}
                    </button>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-neutral-400">
                    <span>コード: {link.code}</span>
                    <span>クリック数: {link.click_count}</span>
                    <span>作成: {formatDateTime(link.created_at)}</span>
                  </div>
                </div>

                {/* QR Code (SVG placeholder via data URL) */}
                <div className="shrink-0 text-center">
                  <div className="rounded-xl border border-neutral-200 bg-white p-2">
                    <img
                      src={`https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(link.url)}`}
                      alt="QR Code"
                      width={120}
                      height={120}
                      className="rounded"
                    />
                  </div>
                  <button
                    onClick={() => {
                      const a = document.createElement("a");
                      a.href = `https://api.qrserver.com/v1/create-qr-code/?size=400x400&format=png&data=${encodeURIComponent(link.url)}`;
                      a.download = `qr-${link.code}.png`;
                      a.click();
                    }}
                    className="mt-1 text-[11px] text-neutral-500 hover:text-neutral-700"
                  >
                    QRダウンロード
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
