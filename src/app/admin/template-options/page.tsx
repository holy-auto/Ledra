"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import PageHeader from "@/components/ui/PageHeader";
import {
  OPTION_TYPE_LABELS,
  SUBSCRIPTION_STATUS_LABELS,
  ORDER_STATUS_LABELS,
  type PlatformTemplateRow,
  type TenantTemplateConfigRow,
  type TenantOptionSubscriptionRow,
} from "@/types/templateOption";

export default function TemplateOptionsPage() {
  const supabase = useMemo(() => createClient(), []);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [templates, setTemplates] = useState<PlatformTemplateRow[]>([]);
  const [configs, setConfigs] = useState<TenantTemplateConfigRow[]>([]);
  const [subs, setSubs] = useState<TenantOptionSubscriptionRow[]>([]);

  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    try {
      const qs = new URLSearchParams(window.location.search);
      setStatus(qs.get("status"));
    } catch {}
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/template-options/gallery");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const j = await res.json();
      setTemplates(j.templates ?? []);
      setConfigs(j.configs ?? []);
      setSubs(j.subscriptions ?? []);
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const activeSub = subs.find((s) => s.status === "active" || s.status === "past_due");
  const activeConfig = configs.find((c) => c.is_active);

  return (
    <div className="space-y-6">
      <PageHeader
        tag="テンプレートオプション"
        title="ブランド証明書"
        actions={
          <div className="flex gap-3 text-sm">
            <Link className="btn-secondary" href="/admin/template-options/gallery">
              テンプレートギャラリー
            </Link>
          </div>
        }
      />

      {status === "success" && (
        <div className="glass-card p-4 text-sm text-emerald-400 glow-cyan">
          お申し込みが完了しました。テンプレートの設定を開始できます。
        </div>
      )}
      {status === "cancel" && (
        <div className="glass-card p-4 text-sm text-amber-400 glow-amber">
          お申し込みがキャンセルされました。
        </div>
      )}

      {loading && <div className="text-sm text-muted">読み込み中...</div>}
      {error && <div className="glass-card p-4 text-sm text-red-500">{error}</div>}

      {/* 契約状況 */}
      {!loading && (
        <div className="glass-card p-5 space-y-4">
          <div className="text-xs font-semibold tracking-[0.18em] text-muted">契約状況</div>
          {activeSub ? (
            <div className="space-y-2">
              <div className="text-sm text-secondary">
                プラン: <b className="text-primary">{OPTION_TYPE_LABELS[activeSub.option_type as keyof typeof OPTION_TYPE_LABELS] ?? activeSub.option_type}</b>
              </div>
              <div className="text-sm text-secondary">
                ステータス: <b className="text-primary">{SUBSCRIPTION_STATUS_LABELS[activeSub.status as keyof typeof SUBSCRIPTION_STATUS_LABELS] ?? activeSub.status}</b>
              </div>
              {activeSub.current_period_end && (
                <div className="text-sm text-secondary">
                  次回請求日: <b className="text-primary">{new Date(activeSub.current_period_end).toLocaleDateString("ja-JP")}</b>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="text-sm text-muted">テンプレートオプション未契約</div>
              <div className="text-xs text-muted">
                自社ロゴ・ブランドカラーを反映した施工証明書を発行できるオプションです。
              </div>
              <div className="flex gap-3">
                <SubscribeButton optionType="preset" label="ライトを申込（¥16,500 + ¥3,300/月）" />
                <SubscribeButton optionType="custom" label="プレミアムを申込（¥88,000 + ¥4,400/月）" />
              </div>
            </div>
          )}
        </div>
      )}

      {/* 利用中テンプレート */}
      {!loading && activeSub && (
        <div className="glass-card p-5 space-y-4">
          <div className="text-xs font-semibold tracking-[0.18em] text-muted">利用中テンプレート</div>
          {activeConfig ? (
            <div className="space-y-2">
              <div className="text-sm text-primary font-semibold">{activeConfig.name}</div>
              <div className="text-xs text-muted">
                種別: {activeConfig.option_type === "preset" ? "既製テンプレート" : "オリジナル"} /
                公開: {activeConfig.is_active ? "公開中" : "非公開"}
              </div>
              <div className="flex gap-3 pt-2">
                <Link
                  className="btn-primary text-xs"
                  href={`/admin/template-options/configure?id=${activeConfig.id}`}
                >
                  設定を編集
                </Link>
                <Link
                  className="btn-secondary text-xs"
                  href="/admin/template-options/maintenance-url"
                >
                  メンテナンスURL設定
                </Link>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="text-sm text-muted">テンプレートが未設定です</div>
              {activeSub.option_type === "preset" ? (
                <Link className="btn-primary text-xs" href="/admin/template-options/gallery">
                  テンプレートを選択する
                </Link>
              ) : (
                <Link className="btn-primary text-xs" href="/admin/template-options/order">
                  制作を依頼する
                </Link>
              )}
            </div>
          )}
        </div>
      )}

      {/* クイックリンク */}
      {!loading && activeSub && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Link href="/admin/template-options/gallery" className="glass-card p-4 hover:bg-surface-hover transition-colors">
            <div className="text-sm font-semibold text-primary">テンプレートギャラリー</div>
            <div className="text-xs text-muted mt-1">既製テンプレートを閲覧・選択</div>
          </Link>
          <Link href="/admin/template-options/order" className="glass-card p-4 hover:bg-surface-hover transition-colors">
            <div className="text-sm font-semibold text-primary">制作依頼・修正依頼</div>
            <div className="text-xs text-muted mt-1">オーダーの作成・進捗確認</div>
          </Link>
          <Link href="/admin/template-options/maintenance-url" className="glass-card p-4 hover:bg-surface-hover transition-colors">
            <div className="text-sm font-semibold text-primary">メンテナンスURL</div>
            <div className="text-xs text-muted mt-1">URL・QRコード設定</div>
          </Link>
        </div>
      )}

      {/* 未契約時の案内 */}
      {!loading && !activeSub && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* A: ライト */}
          <div className="glass-card p-6 space-y-4">
            <div className="text-lg font-bold text-primary">ブランド証明書 ライト</div>
            <div className="text-2xl font-bold text-primary">
              ¥3,300<span className="text-sm font-normal text-muted">/月</span>
            </div>
            <div className="text-xs text-muted">初期費用 ¥16,500</div>
            <ul className="space-y-1.5 text-sm text-secondary">
              {[
                "既製テンプレートから選択",
                "ロゴ・社名の反映",
                "ブランドカラー設定",
                "保証文言の軽微な調整",
                "メンテナンスURL / QRコード",
                "テスト発行（月3回）",
              ].map((f) => (
                <li key={f} className="flex items-start gap-2">
                  <span className="text-accent mt-0.5">&#10003;</span>
                  <span>{f}</span>
                </li>
              ))}
            </ul>
            <SubscribeButton optionType="preset" label="ライトを申込" className="w-full btn-secondary" />
          </div>

          {/* B: プレミアム */}
          <div className="glass-card p-6 space-y-4 ring-2 ring-accent relative">
            <div className="absolute -top-2.5 left-4 px-2 py-0.5 bg-accent text-inverse text-[10px] font-semibold rounded-full">
              おすすめ
            </div>
            <div className="text-lg font-bold text-primary">ブランド証明書 プレミアム</div>
            <div className="text-2xl font-bold text-primary">
              ¥4,400<span className="text-sm font-normal text-muted">/月</span>
            </div>
            <div className="text-xs text-muted">初期費用 ¥88,000（制作代行込み）</div>
            <ul className="space-y-1.5 text-sm text-secondary">
              {[
                "専任担当によるヒアリング",
                "オリジナルデザイン制作",
                "ロゴ・ブランドカラー反映",
                "保証文言・注意文言カスタム",
                "レイアウト調整",
                "メンテナンスURL / QRコード",
                "テスト発行（月5回）",
                "初回修正対応込み",
              ].map((f) => (
                <li key={f} className="flex items-start gap-2">
                  <span className="text-accent mt-0.5">&#10003;</span>
                  <span>{f}</span>
                </li>
              ))}
            </ul>
            <SubscribeButton optionType="custom" label="プレミアムを申込" className="w-full btn-primary" />
          </div>
        </div>
      )}
    </div>
  );
}

function SubscribeButton({
  optionType,
  label,
  className = "btn-primary text-xs",
}: {
  optionType: "preset" | "custom";
  label: string;
  className?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubscribe() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/template-options/subscribe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ option_type: optionType }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.message ?? `HTTP ${res.status}`);
      if (j?.url) window.location.href = j.url;
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        className={className}
        disabled={busy}
        onClick={handleSubscribe}
      >
        {busy ? "処理中..." : label}
      </button>
      {error && <div className="text-xs text-red-500 mt-1">{error}</div>}
    </div>
  );
}
