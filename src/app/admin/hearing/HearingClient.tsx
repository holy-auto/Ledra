"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import PageHeader from "@/components/ui/PageHeader";
import Badge from "@/components/ui/Badge";
import { formatDate } from "@/lib/format";

/* ---------- types ---------- */
type Hearing = {
  id: string;
  status: string;
  customer_name: string;
  customer_phone: string;
  customer_email: string;
  vehicle_maker: string;
  vehicle_model: string;
  vehicle_year: number | null;
  vehicle_plate: string;
  vehicle_color: string;
  vehicle_vin: string;
  service_type: string;
  vehicle_size: string;
  coating_history: string;
  desired_menu: string;
  budget_range: string;
  concern_areas: string;
  scratches_dents: string;
  parking_environment: string;
  usage_frequency: string;
  additional_requests: string;
  customer_id: string | null;
  vehicle_id: string | null;
  created_at: string;
};

const SERVICE_TYPES = [
  { value: "coating", label: "コーティング" },
  { value: "ppf", label: "PPF" },
  { value: "maintenance", label: "メンテナンス" },
  { value: "body_repair", label: "鈑金塗装" },
  { value: "wrapping", label: "ラッピング" },
  { value: "window_film", label: "ウィンドウフィルム" },
  { value: "other", label: "その他" },
];

const SIZE_OPTIONS = ["SS", "S", "M", "L", "LL", "XL"];

const BUDGET_OPTIONS = ["〜5万円", "5〜10万円", "10〜20万円", "20〜30万円", "30〜50万円", "50万円〜", "相談して決めたい"];

const PARKING_OPTIONS = ["屋内ガレージ", "屋根付き駐車場", "屋外青空駐車", "マンション地下", "その他"];

const statusLabel = (s: string) => {
  switch (s) {
    case "draft": return "下書き";
    case "completed": return "完了";
    case "linked": return "連携済み";
    default: return s;
  }
};
const statusVariant = (s: string) => {
  switch (s) {
    case "draft": return "default" as const;
    case "completed": return "warning" as const;
    case "linked": return "success" as const;
    default: return "default" as const;
  }
};

/* ---------- component ---------- */
export default function HearingClient() {
  const router = useRouter();
  const [hearings, setHearings] = useState<Hearing[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [linking, setLinking] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // Form state
  const [form, setForm] = useState({
    customer_name: "", customer_phone: "", customer_email: "",
    vehicle_maker: "", vehicle_model: "", vehicle_year: "",
    vehicle_plate: "", vehicle_color: "", vehicle_vin: "",
    service_type: "", vehicle_size: "",
    coating_history: "", desired_menu: "", budget_range: "",
    concern_areas: "", scratches_dents: "",
    parking_environment: "", usage_frequency: "",
    additional_requests: "",
  });

  const setField = (k: string, v: string) => setForm((p) => ({ ...p, [k]: v }));

  const fetchHearings = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/hearings", { cache: "no-store" });
      const j = await res.json().catch(() => null);
      setHearings(j?.hearings ?? []);
    } catch { setHearings([]); }
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await fetchHearings();
      setLoading(false);
    })();
  }, [fetchHearings]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.customer_name.trim()) { alert("お客様名は必須です"); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/admin/hearings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, vehicle_year: form.vehicle_year ? Number(form.vehicle_year) : null }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.error ?? "保存に失敗しました");
      setShowForm(false);
      setForm({
        customer_name: "", customer_phone: "", customer_email: "",
        vehicle_maker: "", vehicle_model: "", vehicle_year: "",
        vehicle_plate: "", vehicle_color: "", vehicle_vin: "",
        service_type: "", vehicle_size: "",
        coating_history: "", desired_menu: "", budget_range: "",
        concern_areas: "", scratches_dents: "",
        parking_environment: "", usage_frequency: "",
        additional_requests: "",
      });
      await fetchHearings();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "保存に失敗しました");
    } finally { setSaving(false); }
  };

  const handleLink = async (hearingId: string) => {
    if (!confirm("顧客登録・車両登録を行いますか？")) return;
    setLinking(hearingId);
    try {
      const res = await fetch("/api/admin/hearings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: hearingId, action: "link_customer" }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.error ?? "連携に失敗しました");
      await fetchHearings();
      // 連携後、証明書作成に遷移するかリロード
      if (j.vehicle_id) {
        router.push(`/admin/certificates/new?vehicle_id=${j.vehicle_id}`);
      }
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "連携に失敗しました");
    } finally { setLinking(null); }
  };

  const inputCls = "w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-sm text-primary focus:outline-none focus:ring-2 focus:ring-accent/40";
  const labelCls = "text-xs font-medium text-muted";
  const sectionCls = "space-y-4";

  return (
    <div className="space-y-6">
      {/* Actions */}
      <div className="flex items-center justify-between">
        <Link href="/admin/hearing/branding" className="text-xs text-accent hover:underline">
          導入ヒアリング（ブランディング）&rarr;
        </Link>
        <button onClick={() => setShowForm(!showForm)} className="btn-primary">
          {showForm ? "閉じる" : "+ 新規ヒアリング"}
        </button>
      </div>

      {/* Form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="glass-card p-6 space-y-8">
          <h3 className="text-base font-bold text-primary">ヒアリングチェックシート</h3>

          {/* お客様情報 */}
          <fieldset className={sectionCls}>
            <legend className="text-sm font-semibold text-primary border-b border-border pb-2 mb-3 w-full">👤 お客様情報</legend>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1">
                <label className={labelCls}>お名前 *</label>
                <input className={inputCls} value={form.customer_name} onChange={(e) => setField("customer_name", e.target.value)} required placeholder="山田 太郎" />
              </div>
              <div className="space-y-1">
                <label className={labelCls}>電話番号</label>
                <input className={inputCls} type="tel" value={form.customer_phone} onChange={(e) => setField("customer_phone", e.target.value)} placeholder="090-1234-5678" />
              </div>
              <div className="space-y-1">
                <label className={labelCls}>メールアドレス</label>
                <input className={inputCls} type="email" value={form.customer_email} onChange={(e) => setField("customer_email", e.target.value)} placeholder="example@email.com" />
              </div>
            </div>
          </fieldset>

          {/* 車両情報 */}
          <fieldset className={sectionCls}>
            <legend className="text-sm font-semibold text-primary border-b border-border pb-2 mb-3 w-full">🚗 車両情報</legend>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1">
                <label className={labelCls}>メーカー</label>
                <input className={inputCls} value={form.vehicle_maker} onChange={(e) => setField("vehicle_maker", e.target.value)} placeholder="トヨタ" />
              </div>
              <div className="space-y-1">
                <label className={labelCls}>車種</label>
                <input className={inputCls} value={form.vehicle_model} onChange={(e) => setField("vehicle_model", e.target.value)} placeholder="アルファード" />
              </div>
              <div className="space-y-1">
                <label className={labelCls}>年式</label>
                <input className={inputCls} type="number" value={form.vehicle_year} onChange={(e) => setField("vehicle_year", e.target.value)} placeholder="2024" />
              </div>
              <div className="space-y-1">
                <label className={labelCls}>ナンバー</label>
                <input className={inputCls} value={form.vehicle_plate} onChange={(e) => setField("vehicle_plate", e.target.value)} placeholder="品川 300 あ 12-34" />
              </div>
              <div className="space-y-1">
                <label className={labelCls}>ボディカラー</label>
                <input className={inputCls} value={form.vehicle_color} onChange={(e) => setField("vehicle_color", e.target.value)} placeholder="パールホワイト" />
              </div>
              <div className="space-y-1">
                <label className={labelCls}>車台番号</label>
                <input className={inputCls} value={form.vehicle_vin} onChange={(e) => setField("vehicle_vin", e.target.value)} placeholder="JTEBH9FJ..." />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1">
                <label className={labelCls}>サイズ分類</label>
                <select className={inputCls} value={form.vehicle_size} onChange={(e) => setField("vehicle_size", e.target.value)}>
                  <option value="">選択してください</option>
                  {SIZE_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>
          </fieldset>

          {/* 施工内容 */}
          <fieldset className={sectionCls}>
            <legend className="text-sm font-semibold text-primary border-b border-border pb-2 mb-3 w-full">🔧 施工内容</legend>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1">
                <label className={labelCls}>施工タイプ</label>
                <select className={inputCls} value={form.service_type} onChange={(e) => setField("service_type", e.target.value)}>
                  <option value="">選択してください</option>
                  {SERVICE_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <label className={labelCls}>ご予算</label>
                <select className={inputCls} value={form.budget_range} onChange={(e) => setField("budget_range", e.target.value)}>
                  <option value="">選択してください</option>
                  {BUDGET_OPTIONS.map((b) => <option key={b} value={b}>{b}</option>)}
                </select>
              </div>
            </div>
            <div className="space-y-1">
              <label className={labelCls}>希望メニュー・施工内容</label>
              <textarea className={inputCls + " min-h-[80px]"} value={form.desired_menu} onChange={(e) => setField("desired_menu", e.target.value)} placeholder="ガラスコーティング、ホイールコーティングなど" />
            </div>
            <div className="space-y-1">
              <label className={labelCls}>過去の施工歴</label>
              <textarea className={inputCls + " min-h-[60px]"} value={form.coating_history} onChange={(e) => setField("coating_history", e.target.value)} placeholder="例: 新車購入時にディーラーコーティング済み" />
            </div>
          </fieldset>

          {/* 車両状態 */}
          <fieldset className={sectionCls}>
            <legend className="text-sm font-semibold text-primary border-b border-border pb-2 mb-3 w-full">🔍 車両状態</legend>
            <div className="space-y-1">
              <label className={labelCls}>気になる箇所</label>
              <textarea className={inputCls + " min-h-[60px]"} value={form.concern_areas} onChange={(e) => setField("concern_areas", e.target.value)} placeholder="ボンネットの水垢、ドアの飛び石傷など" />
            </div>
            <div className="space-y-1">
              <label className={labelCls}>傷・凹み</label>
              <textarea className={inputCls + " min-h-[60px]"} value={form.scratches_dents} onChange={(e) => setField("scratches_dents", e.target.value)} placeholder="右フロントフェンダーに小さな飛び石傷あり" />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1">
                <label className={labelCls}>駐車環境</label>
                <select className={inputCls} value={form.parking_environment} onChange={(e) => setField("parking_environment", e.target.value)}>
                  <option value="">選択してください</option>
                  {PARKING_OPTIONS.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <label className={labelCls}>使用頻度</label>
                <input className={inputCls} value={form.usage_frequency} onChange={(e) => setField("usage_frequency", e.target.value)} placeholder="通勤で毎日 / 週末のみ" />
              </div>
            </div>
          </fieldset>

          {/* その他 */}
          <fieldset className={sectionCls}>
            <legend className="text-sm font-semibold text-primary border-b border-border pb-2 mb-3 w-full">💬 その他</legend>
            <div className="space-y-1">
              <label className={labelCls}>その他のご要望</label>
              <textarea className={inputCls + " min-h-[80px]"} value={form.additional_requests} onChange={(e) => setField("additional_requests", e.target.value)} placeholder="納車予定日、仕上がりの希望など自由にご記入ください" />
            </div>
          </fieldset>

          <div className="flex gap-3 justify-end pt-4 border-t border-border">
            <button type="button" onClick={() => setShowForm(false)} className="btn-ghost">キャンセル</button>
            <button type="submit" disabled={saving} className="btn-primary">
              {saving ? "保存中..." : "チェックシートを保存"}
            </button>
          </div>
        </form>
      )}

      {/* List */}
      {loading ? (
        <div className="glass-card p-8 text-center text-sm text-muted">読み込み中...</div>
      ) : hearings.length === 0 && !showForm ? (
        <div className="glass-card p-8 text-center space-y-3">
          <p className="text-sm text-secondary">ヒアリングデータがありません。</p>
          <p className="text-xs text-muted">「+ 新規ヒアリング」からお客様の要望を記録しましょう。</p>
        </div>
      ) : (
        <section className="space-y-3">
          {hearings.map((h) => (
            <div key={h.id} className="glass-card p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-primary">{h.customer_name || "未入力"}</span>
                    <Badge variant={statusVariant(h.status)}>{statusLabel(h.status)}</Badge>
                    {h.service_type && (
                      <span className="text-[11px] text-muted bg-surface-hover px-2 py-0.5 rounded">
                        {SERVICE_TYPES.find((t) => t.value === h.service_type)?.label ?? h.service_type}
                      </span>
                    )}
                    {h.vehicle_size && (
                      <span className="text-[11px] font-mono text-muted bg-surface-hover px-2 py-0.5 rounded">{h.vehicle_size}</span>
                    )}
                  </div>
                  <div className="text-xs text-muted flex gap-3 flex-wrap">
                    {h.vehicle_maker && <span>{h.vehicle_maker} {h.vehicle_model}</span>}
                    {h.vehicle_plate && <span>{h.vehicle_plate}</span>}
                    <span>{formatDate(h.created_at)}</span>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-2 flex-wrap">
                {h.status !== "linked" ? (
                  <button
                    onClick={() => handleLink(h.id)}
                    disabled={linking === h.id}
                    className="btn-primary text-xs py-1.5 px-4"
                  >
                    {linking === h.id ? "処理中..." : "顧客・車両登録 → 証明書発行へ"}
                  </button>
                ) : (
                  <>
                    {h.customer_id && (
                      <Link href={`/admin/customers/${h.customer_id}`} className="btn-secondary text-xs py-1.5 px-4">
                        顧客詳細
                      </Link>
                    )}
                    {h.vehicle_id && (
                      <Link href={`/admin/vehicles/${h.vehicle_id}`} className="btn-secondary text-xs py-1.5 px-4">
                        車両詳細
                      </Link>
                    )}
                    {h.vehicle_id && (
                      <Link href={`/admin/certificates/new?vehicle_id=${h.vehicle_id}`} className="btn-primary text-xs py-1.5 px-4">
                        証明書発行
                      </Link>
                    )}
                  </>
                )}
              </div>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
