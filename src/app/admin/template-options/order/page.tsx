"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import PageHeader from "@/components/ui/PageHeader";
import { ORDER_STATUS_LABELS, type TemplateOrderRow } from "@/types/templateOption";

export default function OrderPage() {
  const [orders, setOrders] = useState<TemplateOrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: "ok" | "error"; text: string } | null>(null);

  // ヒアリングフォーム
  const [shopName, setShopName] = useState("");
  const [brandColors, setBrandColors] = useState("");
  const [warrantyText, setWarrantyText] = useState("");
  const [noticeText, setNoticeText] = useState("");
  const [maintenanceUrl, setMaintenanceUrl] = useState("");
  const [certificateItems, setCertificateItems] = useState("");
  const [monthlyIssueCount, setMonthlyIssueCount] = useState("");
  const [additionalRequests, setAdditionalRequests] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/template-options/orders");
        const j = await res.json();
        setOrders(j.orders ?? []);
      } catch {} finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleSubmit = async () => {
    if (!shopName.trim()) {
      setMessage({ type: "error", text: "店舗名は必須です。" });
      return;
    }

    setSubmitting(true);
    setMessage(null);
    try {
      const res = await fetch("/api/template-options/orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          order_type: "custom_production",
          hearing: {
            shop_name: shopName,
            brand_colors: brandColors,
            warranty_text: warrantyText,
            notice_text: noticeText,
            maintenance_url: maintenanceUrl || undefined,
            certificate_items: certificateItems,
            monthly_issue_count: monthlyIssueCount,
            additional_requests: additionalRequests,
          },
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.message ?? `HTTP ${res.status}`);
      setMessage({ type: "ok", text: "制作依頼を送信しました。担当者よりご連絡いたします。" });
      // リロード
      const res2 = await fetch("/api/template-options/orders");
      const j2 = await res2.json();
      setOrders(j2.orders ?? []);
    } catch (e: any) {
      setMessage({ type: "error", text: e?.message ?? String(e) });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        tag="テンプレートオプション"
        title="制作依頼・修正依頼"
        actions={
          <Link className="btn-ghost text-sm" href="/admin/template-options">
            戻る
          </Link>
        }
      />

      {message && (
        <div className={`glass-card p-3 text-sm ${message.type === "ok" ? "text-success" : "text-danger"}`}>
          {message.text}
        </div>
      )}

      {/* オーダー一覧 */}
      {!loading && orders.length > 0 && (
        <div className="glass-card overflow-hidden">
          <div className="p-4">
            <div className="text-xs font-semibold tracking-[0.18em] text-muted">過去のオーダー</div>
          </div>
          <table className="min-w-full text-sm">
            <thead className="bg-surface-hover">
              <tr>
                <th className="text-left p-3 text-xs font-semibold tracking-[0.12em] text-muted">種別</th>
                <th className="text-left p-3 text-xs font-semibold tracking-[0.12em] text-muted">ステータス</th>
                <th className="text-left p-3 text-xs font-semibold tracking-[0.12em] text-muted">金額</th>
                <th className="text-left p-3 text-xs font-semibold tracking-[0.12em] text-muted">作成日</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <tr key={order.id} className="border-t border-border-default hover:bg-surface-hover transition-colors">
                  <td className="p-3 text-primary">
                    {order.order_type === "custom_production" ? "オリジナル制作" :
                     order.order_type === "preset_setup" ? "テンプレ設定" :
                     order.order_type === "modification" ? "修正依頼" : "追加制作"}
                  </td>
                  <td className="p-3">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs ${
                      order.status === "active" ? "bg-success-dim text-success" :
                      order.status === "cancelled" ? "bg-red-900/30 text-red-400" :
                      "bg-accent-dim text-accent"
                    }`}>
                      {ORDER_STATUS_LABELS[order.status] ?? order.status}
                    </span>
                  </td>
                  <td className="p-3 text-primary">¥{order.amount.toLocaleString()}</td>
                  <td className="p-3 text-primary whitespace-nowrap">
                    {new Date(order.created_at).toLocaleDateString("ja-JP")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ヒアリングシートフォーム */}
      <div className="glass-card p-5 space-y-4">
        <div className="text-xs font-semibold tracking-[0.18em] text-muted">新規制作依頼（プレミアム）</div>
        <div className="text-xs text-muted">
          以下のヒアリングシートをご記入ください。内容をもとに専任担当がテンプレートを制作いたします。
        </div>

        <div className="space-y-3">
          <label className="block">
            <span className="text-xs text-muted">店舗名・正式名称 *</span>
            <input
              type="text"
              className="input-field w-full mt-1"
              value={shopName}
              onChange={(e) => setShopName(e.target.value)}
              placeholder="例: 株式会社○○ △△コーティング店"
            />
          </label>

          <label className="block">
            <span className="text-xs text-muted">ブランドカラー（HEXコード or 参考URL）</span>
            <input
              type="text"
              className="input-field w-full mt-1"
              value={brandColors}
              onChange={(e) => setBrandColors(e.target.value)}
              placeholder="例: #1a1a2e, #0071e3 / https://example.com"
            />
          </label>

          <label className="block">
            <span className="text-xs text-muted">保証文言（希望テキスト）</span>
            <textarea
              className="input-field w-full mt-1 min-h-[80px]"
              value={warrantyText}
              onChange={(e) => setWarrantyText(e.target.value)}
              placeholder="証明書に記載したい保証文言があればご記入ください"
            />
          </label>

          <label className="block">
            <span className="text-xs text-muted">注意文言（希望テキスト）</span>
            <textarea
              className="input-field w-full mt-1 min-h-[60px]"
              value={noticeText}
              onChange={(e) => setNoticeText(e.target.value)}
              placeholder="保証の条件や注意事項など"
            />
          </label>

          <label className="block">
            <span className="text-xs text-muted">メンテナンスURL</span>
            <input
              type="url"
              className="input-field w-full mt-1"
              value={maintenanceUrl}
              onChange={(e) => setMaintenanceUrl(e.target.value)}
              placeholder="https://example.com/maintenance"
            />
          </label>

          <label className="block">
            <span className="text-xs text-muted">証明書に載せたい項目</span>
            <textarea
              className="input-field w-full mt-1 min-h-[80px]"
              value={certificateItems}
              onChange={(e) => setCertificateItems(e.target.value)}
              placeholder="例: コーティングブランド名、施工層数、使用液剤、施工面積、施工写真 など"
            />
          </label>

          <label className="block">
            <span className="text-xs text-muted">月間発行頻度の目安</span>
            <input
              type="text"
              className="input-field w-full mt-1"
              value={monthlyIssueCount}
              onChange={(e) => setMonthlyIssueCount(e.target.value)}
              placeholder="例: 月10〜20枚"
            />
          </label>

          <label className="block">
            <span className="text-xs text-muted">その他のご要望</span>
            <textarea
              className="input-field w-full mt-1 min-h-[80px]"
              value={additionalRequests}
              onChange={(e) => setAdditionalRequests(e.target.value)}
              placeholder="参考にしたいデザイン、特別なレイアウト要望など、何でもご記入ください"
            />
          </label>
        </div>

        <div className="pt-2">
          <button
            type="button"
            className="btn-primary"
            disabled={submitting || !shopName.trim()}
            onClick={handleSubmit}
          >
            {submitting ? "送信中..." : "制作依頼を送信"}
          </button>
        </div>

        <div className="text-xs text-muted space-y-1 pt-2">
          <p>※ 制作依頼後、担当者よりヒアリングのご連絡をいたします。</p>
          <p>※ ロゴデータ（PNG/SVG/AI）は別途メールにてお送りください。</p>
          <p>※ 初稿は5営業日程度でお届けします。</p>
          <p>※ 保証文言の法的妥当性は加盟店様にてご確認ください（弁護士レビューは含みません）。</p>
        </div>
      </div>
    </div>
  );
}
