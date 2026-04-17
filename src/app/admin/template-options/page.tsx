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

const OPTION_PLANS = [
  {
    optionType: "preset" as const,
    name: "ブランド証明書 ライト",
    price: "¥3,300/月",
    setupFee: "初期費用 ¥16,500",
    features: [
      "既製テンプレートから選択",
      "ロゴ・社名の反映",
      "ブランドカラー設定",
      "保証文言の軽微な調整",
      "メンテナンスURL / QRコード",
      "テスト発行（月3回）",
    ],
  },
  {
    optionType: "custom" as const,
    name: "ブランド証明書 プレミアム",
    price: "¥4,400/月",
    setupFee: "初期費用 ¥88,000（制作代行込み）",
    recommended: true,
    features: [
      "専任担当によるヒアリング",
      "オリジナルデザイン制作",
      "ロゴ・ブランドカラー反映",
      "保証文言・注意文言カスタム",
      "レイアウト調整",
      "メンテナンスURL / QRコード",
      "テスト発行（月5回）",
      "初回修正対応込み",
    ],
  },
];

export default function TemplateOptionsPage() {
  const supabase = useMemo(() => createClient(), []);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [templates, setTemplates] = useState<PlatformTemplateRow[]>([]);
  const [configs, setConfigs] = useState<TenantTemplateConfigRow[]>([]);
  const [subs, setSubs] = useState<TenantOptionSubscriptionRow[]>([]);

  const [status, setStatus] = useState<string | null>(null);
  const [selectedOption, setSelectedOption] = useState<"preset" | "custom" | null>(null);

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
        <div className="glass-card p-4 text-sm text-success glow-cyan">
          お申し込みが完了しました。テンプレートの設定を開始できます。
        </div>
      )}
      {status === "cancel" && (
        <div className="glass-card p-4 text-sm text-warning glow-amber">
          お申し込みがキャンセルされました。
        </div>
      )}

      {loading && <div className="text-sm text-muted">読み込み中...</div>}
      {error && <div className="glass-card p-4 text-sm text-danger">{error}</div>}

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

      {/* 未契約時のプラン選択 */}
      {!loading && !activeSub && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {OPTION_PLANS.map((plan) => {
            const isSelected = selectedOption === plan.optionType;
            return (
              <div
                key={plan.optionType}
                className={`glass-card p-6 space-y-4 relative ${
                  plan.recommended ? "ring-2 ring-accent" : ""
                } ${isSelected ? "ring-2 ring-accent glow-cyan" : ""}`}
              >
                {plan.recommended && (
                  <div className="absolute -top-2.5 left-4 px-2 py-0.5 bg-accent text-inverse text-[10px] font-semibold rounded-full">
                    おすすめ
                  </div>
                )}
                <div className="text-lg font-bold text-primary">{plan.name}</div>
                <div className="text-2xl font-bold text-primary">
                  {plan.price.split("/")[0]}<span className="text-sm font-normal text-muted">/{plan.price.split("/")[1]}</span>
                </div>
                <div className="text-xs text-muted">{plan.setupFee}</div>
                <ul className="space-y-1.5 text-sm text-secondary">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2">
                      <span className="text-accent mt-0.5">&#10003;</span>
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  className={`w-full ${plan.recommended ? "btn-primary" : "btn-secondary"}`}
                  onClick={() => { setSelectedOption(plan.optionType); setError(null); }}
                >
                  {isSelected ? "選択中" : `${plan.name.includes("ライト") ? "ライト" : "プレミアム"}を選択`}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* 確認セクション（ページ内展開） */}
      {selectedOption && !activeSub && (
        <SubscribeConfirmation
          optionType={selectedOption}
          plan={OPTION_PLANS.find((p) => p.optionType === selectedOption)!}
          onCancel={() => setSelectedOption(null)}
        />
      )}
    </div>
  );
}

function SubscribeConfirmation({
  optionType,
  plan,
  onCancel,
}: {
  optionType: "preset" | "custom";
  plan: typeof OPTION_PLANS[number];
  onCancel: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
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
    <div className="glass-card p-5 space-y-4 glow-cyan">
      <div className="text-xs font-semibold tracking-[0.18em] text-accent">申込内容の確認</div>
      <div className="space-y-2 text-sm">
        <div className="flex justify-between text-primary">
          <span>プラン名</span>
          <span className="font-bold">{plan.name}</span>
        </div>
        <div className="flex justify-between text-primary">
          <span>月額料金</span>
          <span className="font-bold">{plan.price}</span>
        </div>
        <div className="flex justify-between text-secondary">
          <span>初期費用</span>
          <span>{plan.setupFee}</span>
        </div>
      </div>
      <div className="border-t border-[var(--border-default)] pt-3 text-xs text-muted">
        「申込に進む」を押すとStripe決済画面に移動します。決済完了後、テンプレートオプションが即時有効になります。
      </div>
      {error && <div className="text-sm text-danger">{error}</div>}
      <div className="flex gap-3">
        <button
          type="button"
          className="btn-primary text-sm"
          disabled={busy}
          onClick={handleConfirm}
        >
          {busy ? "処理中..." : "申込に進む"}
        </button>
        <button
          type="button"
          className="btn-ghost text-sm"
          onClick={onCancel}
        >
          キャンセル
        </button>
      </div>
    </div>
  );
}
