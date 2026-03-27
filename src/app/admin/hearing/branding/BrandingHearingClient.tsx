"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Badge from "@/components/ui/Badge";
import { formatDate } from "@/lib/format";

/* ---------- types ---------- */
type BrandingHearing = {
  id: string;
  status: string;
  customer_name: string;
  customer_phone: string;
  customer_email: string;
  hearing_json: BrandingData;
  created_at: string;
};

type BrandingData = {
  hearing_type?: "branding";
  /* --- 企業・店舗情報 --- */
  company_name?: string;
  store_count?: string;
  store_locations?: string;
  business_type?: string;
  staff_count?: string;
  /* --- 証明書ブランディング --- */
  brand_color_main?: string;
  brand_color_sub?: string;
  logo_variants?: string;
  tagline?: string;
  guarantee_content?: string;
  grade_system?: string;
  aftercare_info?: string;
  partner_brand_logos?: string;
  cert_approval_flow?: string;
  paper_cert_併用?: string;
  cert_delivery_method?: string;
  /* --- 大型店舗導入 --- */
  hq_branch_structure?: string;
  staff_roles?: string;
  multi_brand_usage?: string;
  cert_design_unified?: string;
  menu_price_unified?: string;
  brand_guidelines?: string;
  store_logo_variation?: string;
  existing_systems?: string;
  custom_hearing_fields?: string;
  hq_reporting?: string;
  busy_season?: string;
  data_migration?: string;
  rollout_plan?: string;
  training_scale?: string;
  trial_period?: string;
  /* --- その他 --- */
  additional_notes?: string;
};

/* ---------- constants ---------- */
const BUSINESS_TYPES = [
  "コーティング専門店",
  "カーディテイリング店",
  "鈑金塗装工場",
  "カーディーラー",
  "カー用品店",
  "ガソリンスタンド",
  "その他",
];

const CERT_DELIVERY_OPTIONS = ["LINE", "メール", "QRコード", "紙のみ", "複数併用"];

const ROLLOUT_OPTIONS = ["一斉導入", "段階的導入（1店舗ずつ）", "パイロット店舗で検証後"];

const CERT_DESIGN_OPTIONS = ["全店統一", "店舗ごとにカスタム", "本部テンプレ＋店舗微調整"];

const MENU_PRICE_OPTIONS = ["全店統一", "店舗ごとに異なる", "基本統一＋店舗別オプション"];

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

const INITIAL_BRANDING: BrandingData = { hearing_type: "branding" };

/* ---------- component ---------- */
export default function BrandingHearingClient() {
  const [hearings, setHearings] = useState<BrandingHearing[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form state
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [bd, setBd] = useState<BrandingData>(INITIAL_BRANDING);

  const setBdField = (k: keyof BrandingData, v: string) => setBd((p) => ({ ...p, [k]: v }));

  const fetchHearings = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/hearings", { cache: "no-store" });
      const j = await res.json().catch(() => null);
      const all: BrandingHearing[] = j?.hearings ?? [];
      // ブランディングヒアリングのみ表示
      setHearings(all.filter((h) => h.hearing_json?.hearing_type === "branding"));
    } catch { setHearings([]); }
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await fetchHearings();
      setLoading(false);
    })();
  }, [fetchHearings]);

  const resetForm = () => {
    setName(""); setPhone(""); setEmail("");
    setBd(INITIAL_BRANDING);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { alert("企業名・担当者名は必須です"); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/admin/hearings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer_name: name,
          customer_phone: phone,
          customer_email: email,
          hearing_json: bd,
        }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.error ?? "保存に失敗しました");
      setShowForm(false);
      resetForm();
      await fetchHearings();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "保存に失敗しました");
    } finally { setSaving(false); }
  };

  const handleComplete = async (id: string) => {
    try {
      const res = await fetch("/api/admin/hearings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status: "completed" }),
      });
      if (!res.ok) throw new Error("更新に失敗しました");
      await fetchHearings();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "更新に失敗しました");
    }
  };

  const inputCls = "w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-sm text-primary focus:outline-none focus:ring-2 focus:ring-accent/40";
  const labelCls = "text-xs font-medium text-muted";
  const sectionCls = "space-y-4";

  return (
    <div className="space-y-6">
      {/* Back link + New button */}
      <div className="flex items-center justify-between">
        <Link href="/admin/hearing" className="text-xs text-accent hover:underline">&larr; 通常ヒアリングに戻る</Link>
        <button onClick={() => setShowForm(!showForm)} className="btn-primary">
          {showForm ? "閉じる" : "+ 新規ブランディングヒアリング"}
        </button>
      </div>

      {/* Form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="glass-card p-6 space-y-8">
          <h3 className="text-base font-bold text-primary">ブランディング導入ヒアリングシート</h3>

          {/* 企業・担当者情報 */}
          <fieldset className={sectionCls}>
            <legend className="text-sm font-semibold text-primary border-b border-border pb-2 mb-3 w-full">企業・担当者情報</legend>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1">
                <label className={labelCls}>企業名・担当者名 *</label>
                <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} required placeholder="株式会社○○ / 山田太郎" />
              </div>
              <div className="space-y-1">
                <label className={labelCls}>電話番号</label>
                <input className={inputCls} type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="090-1234-5678" />
              </div>
              <div className="space-y-1">
                <label className={labelCls}>メールアドレス</label>
                <input className={inputCls} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="example@company.com" />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1">
                <label className={labelCls}>企業名</label>
                <input className={inputCls} value={bd.company_name ?? ""} onChange={(e) => setBdField("company_name", e.target.value)} placeholder="株式会社○○" />
              </div>
              <div className="space-y-1">
                <label className={labelCls}>業態</label>
                <select className={inputCls} value={bd.business_type ?? ""} onChange={(e) => setBdField("business_type", e.target.value)}>
                  <option value="">選択してください</option>
                  {BUSINESS_TYPES.map((b) => <option key={b} value={b}>{b}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <label className={labelCls}>店舗数</label>
                <input className={inputCls} type="number" min="1" value={bd.store_count ?? ""} onChange={(e) => setBdField("store_count", e.target.value)} placeholder="5" />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1">
                <label className={labelCls}>店舗所在地（主要エリア）</label>
                <input className={inputCls} value={bd.store_locations ?? ""} onChange={(e) => setBdField("store_locations", e.target.value)} placeholder="東京都・神奈川県・埼玉県" />
              </div>
              <div className="space-y-1">
                <label className={labelCls}>スタッフ数（全体）</label>
                <input className={inputCls} value={bd.staff_count ?? ""} onChange={(e) => setBdField("staff_count", e.target.value)} placeholder="約30名" />
              </div>
            </div>
          </fieldset>

          {/* オリジナル施工証明書 */}
          <fieldset className={sectionCls}>
            <legend className="text-sm font-semibold text-primary border-b border-border pb-2 mb-3 w-full">オリジナル施工証明書のカスタマイズ</legend>

            <p className="text-xs text-muted">証明書のデザイン・ブランディングに関する要望をお聞きします。</p>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1">
                <label className={labelCls}>ブランドカラー（メイン）</label>
                <div className="flex gap-2">
                  <input type="color" className="h-10 w-10 rounded border border-border cursor-pointer" value={bd.brand_color_main || "#000000"} onChange={(e) => setBdField("brand_color_main", e.target.value)} />
                  <input className={inputCls} value={bd.brand_color_main ?? ""} onChange={(e) => setBdField("brand_color_main", e.target.value)} placeholder="#FF0000 / 赤系" />
                </div>
              </div>
              <div className="space-y-1">
                <label className={labelCls}>ブランドカラー（サブ）</label>
                <div className="flex gap-2">
                  <input type="color" className="h-10 w-10 rounded border border-border cursor-pointer" value={bd.brand_color_sub || "#000000"} onChange={(e) => setBdField("brand_color_sub", e.target.value)} />
                  <input className={inputCls} value={bd.brand_color_sub ?? ""} onChange={(e) => setBdField("brand_color_sub", e.target.value)} placeholder="#0000FF / 紺系" />
                </div>
              </div>
            </div>

            <div className="space-y-1">
              <label className={labelCls}>ロゴのバリエーション</label>
              <textarea className={inputCls + " min-h-[60px]"} value={bd.logo_variants ?? ""} onChange={(e) => setBdField("logo_variants", e.target.value)} placeholder="横長ロゴ・正方形アイコン・白黒版など、お持ちのロゴバリエーションをご記入ください" />
            </div>

            <div className="space-y-1">
              <label className={labelCls}>キャッチコピー・タグライン</label>
              <input className={inputCls} value={bd.tagline ?? ""} onChange={(e) => setBdField("tagline", e.target.value)} placeholder="例: 「信頼の施工品質を証明する」" />
            </div>

            <div className="space-y-1">
              <label className={labelCls}>独自の保証内容・保証条件</label>
              <textarea className={inputCls + " min-h-[80px]"} value={bd.guarantee_content ?? ""} onChange={(e) => setBdField("guarantee_content", e.target.value)} placeholder="例: 施工後3年間のツヤ保証、年1回の無料メンテナンス付き など" />
            </div>

            <div className="space-y-1">
              <label className={labelCls}>独自の施工ランク・グレード体系</label>
              <textarea className={inputCls + " min-h-[60px]"} value={bd.grade_system ?? ""} onChange={(e) => setBdField("grade_system", e.target.value)} placeholder="例: スタンダード / プレミアム / プラチナ の3段階" />
            </div>

            <div className="space-y-1">
              <label className={labelCls}>アフターケア情報の記載</label>
              <textarea className={inputCls + " min-h-[60px]"} value={bd.aftercare_info ?? ""} onChange={(e) => setBdField("aftercare_info", e.target.value)} placeholder="証明書に記載したいアフターケア案内（洗車方法、メンテナンス時期など）" />
            </div>

            <div className="space-y-1">
              <label className={labelCls}>取り扱いブランドのロゴ併記</label>
              <textarea className={inputCls + " min-h-[60px]"} value={bd.partner_brand_logos ?? ""} onChange={(e) => setBdField("partner_brand_logos", e.target.value)} placeholder="例: GYEON, Ceramic Pro などのロゴを証明書に載せたい" />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1">
                <label className={labelCls}>発行時の承認プロセス</label>
                <select className={inputCls} value={bd.cert_approval_flow ?? ""} onChange={(e) => setBdField("cert_approval_flow", e.target.value)}>
                  <option value="">選択してください</option>
                  <option value="不要（施工者が直接発行）">不要（施工者が直接発行）</option>
                  <option value="店長承認が必要">店長承認が必要</option>
                  <option value="本部承認が必要">本部承認が必要</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className={labelCls}>紙の証明書との併用</label>
                <select className={inputCls} value={bd.paper_cert_併用 ?? ""} onChange={(e) => setBdField("paper_cert_併用", e.target.value)}>
                  <option value="">選択してください</option>
                  <option value="デジタルのみ">デジタルのみ</option>
                  <option value="紙も併用したい">紙も併用したい</option>
                  <option value="移行期間中は併用">移行期間中は併用</option>
                </select>
              </div>
            </div>

            <div className="space-y-1">
              <label className={labelCls}>顧客への証明書共有方法</label>
              <div className="flex flex-wrap gap-3 mt-1">
                {CERT_DELIVERY_OPTIONS.map((opt) => (
                  <label key={opt} className="flex items-center gap-1.5 text-sm text-secondary cursor-pointer">
                    <input
                      type="checkbox"
                      className="rounded border-border accent-accent"
                      checked={(bd.cert_delivery_method ?? "").includes(opt)}
                      onChange={(e) => {
                        const current = (bd.cert_delivery_method ?? "").split(",").map((s) => s.trim()).filter(Boolean);
                        const next = e.target.checked ? [...current, opt] : current.filter((c) => c !== opt);
                        setBdField("cert_delivery_method", next.join(", "));
                      }}
                    />
                    {opt}
                  </label>
                ))}
              </div>
            </div>
          </fieldset>

          {/* 大型店舗導入 */}
          <fieldset className={sectionCls}>
            <legend className="text-sm font-semibold text-primary border-b border-border pb-2 mb-3 w-full">大型店舗・マルチ店舗導入</legend>

            <p className="text-xs text-muted">複数店舗での導入や組織体制に関する要件をお聞きします。</p>

            <div className="space-y-1">
              <label className={labelCls}>本部-支店の権限構造</label>
              <textarea className={inputCls + " min-h-[60px]"} value={bd.hq_branch_structure ?? ""} onChange={(e) => setBdField("hq_branch_structure", e.target.value)} placeholder="例: 本部で一括管理 / 店舗ごとに自由度を持たせたい" />
            </div>

            <div className="space-y-1">
              <label className={labelCls}>スタッフの役割分担</label>
              <textarea className={inputCls + " min-h-[60px]"} value={bd.staff_roles ?? ""} onChange={(e) => setBdField("staff_roles", e.target.value)} placeholder="例: 施工担当・受付スタッフ・店長・本部管理者 など" />
            </div>

            <div className="space-y-1">
              <label className={labelCls}>複数ブランド・屋号の使い分け</label>
              <textarea className={inputCls + " min-h-[60px]"} value={bd.multi_brand_usage ?? ""} onChange={(e) => setBdField("multi_brand_usage", e.target.value)} placeholder="例: A店は「○○コーティング」、B店は「△△ディテイリング」など屋号が異なる" />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1">
                <label className={labelCls}>証明書デザインの統一方針</label>
                <select className={inputCls} value={bd.cert_design_unified ?? ""} onChange={(e) => setBdField("cert_design_unified", e.target.value)}>
                  <option value="">選択してください</option>
                  {CERT_DESIGN_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <label className={labelCls}>メニュー・価格の統一方針</label>
                <select className={inputCls} value={bd.menu_price_unified ?? ""} onChange={(e) => setBdField("menu_price_unified", e.target.value)}>
                  <option value="">選択してください</option>
                  {MENU_PRICE_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
            </div>

            <div className="space-y-1">
              <label className={labelCls}>ブランドガイドライン（CI）の有無</label>
              <textarea className={inputCls + " min-h-[60px]"} value={bd.brand_guidelines ?? ""} onChange={(e) => setBdField("brand_guidelines", e.target.value)} placeholder="CIマニュアルやブランドガイドラインがあればご記入ください" />
            </div>

            <div className="space-y-1">
              <label className={labelCls}>店舗ごとに異なるロゴ・カラーの有無</label>
              <textarea className={inputCls + " min-h-[60px]"} value={bd.store_logo_variation ?? ""} onChange={(e) => setBdField("store_logo_variation", e.target.value)} placeholder="例: 基本ロゴは同じだがカラーが店舗ごとに違う" />
            </div>
          </fieldset>

          {/* 既存システム・移行 */}
          <fieldset className={sectionCls}>
            <legend className="text-sm font-semibold text-primary border-b border-border pb-2 mb-3 w-full">既存システム・導入計画</legend>

            <div className="space-y-1">
              <label className={labelCls}>既存の業務システム</label>
              <textarea className={inputCls + " min-h-[60px]"} value={bd.existing_systems ?? ""} onChange={(e) => setBdField("existing_systems", e.target.value)} placeholder="例: POSシステム（○○）、予約管理（Googleカレンダー）、顧客管理（Excel）など" />
            </div>

            <div className="space-y-1">
              <label className={labelCls}>ヒアリングシートの店舗独自カスタマイズ</label>
              <textarea className={inputCls + " min-h-[60px]"} value={bd.custom_hearing_fields ?? ""} onChange={(e) => setBdField("custom_hearing_fields", e.target.value)} placeholder="例: 特定のチェック項目を追加したい、店舗独自の質問項目がある" />
            </div>

            <div className="space-y-1">
              <label className={labelCls}>本部での集計・レポート要件</label>
              <textarea className={inputCls + " min-h-[60px]"} value={bd.hq_reporting ?? ""} onChange={(e) => setBdField("hq_reporting", e.target.value)} placeholder="例: 全店横断の月次施工実績、店舗別売上レポートなど" />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1">
                <label className={labelCls}>繁忙期・閑散期</label>
                <input className={inputCls} value={bd.busy_season ?? ""} onChange={(e) => setBdField("busy_season", e.target.value)} placeholder="例: 3〜5月が繁忙期" />
              </div>
              <div className="space-y-1">
                <label className={labelCls}>既存データの移行</label>
                <select className={inputCls} value={bd.data_migration ?? ""} onChange={(e) => setBdField("data_migration", e.target.value)}>
                  <option value="">選択してください</option>
                  <option value="不要">不要（新規スタート）</option>
                  <option value="一部移行">一部移行したい</option>
                  <option value="全データ移行">全データ移行が必要</option>
                </select>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1">
                <label className={labelCls}>導入計画</label>
                <select className={inputCls} value={bd.rollout_plan ?? ""} onChange={(e) => setBdField("rollout_plan", e.target.value)}>
                  <option value="">選択してください</option>
                  {ROLLOUT_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <label className={labelCls}>スタッフ研修の規模感</label>
                <input className={inputCls} value={bd.training_scale ?? ""} onChange={(e) => setBdField("training_scale", e.target.value)} placeholder="例: 各店2名ずつ、合計10名程度" />
              </div>
            </div>

            <div className="space-y-1">
              <label className={labelCls}>トライアル期間の希望</label>
              <input className={inputCls} value={bd.trial_period ?? ""} onChange={(e) => setBdField("trial_period", e.target.value)} placeholder="例: 1ヶ月間の無料トライアル希望" />
            </div>
          </fieldset>

          {/* その他 */}
          <fieldset className={sectionCls}>
            <legend className="text-sm font-semibold text-primary border-b border-border pb-2 mb-3 w-full">その他</legend>
            <div className="space-y-1">
              <label className={labelCls}>その他のご要望・備考</label>
              <textarea className={inputCls + " min-h-[80px]"} value={bd.additional_notes ?? ""} onChange={(e) => setBdField("additional_notes", e.target.value)} placeholder="導入にあたって気になる点や、その他のご要望を自由にご記入ください" />
            </div>
          </fieldset>

          <div className="flex gap-3 justify-end pt-4 border-t border-border">
            <button type="button" onClick={() => { setShowForm(false); resetForm(); }} className="btn-ghost">キャンセル</button>
            <button type="submit" disabled={saving} className="btn-primary">
              {saving ? "保存中..." : "ヒアリングシートを保存"}
            </button>
          </div>
        </form>
      )}

      {/* List */}
      {loading ? (
        <div className="glass-card p-8 text-center text-sm text-muted">読み込み中...</div>
      ) : hearings.length === 0 && !showForm ? (
        <div className="glass-card p-8 text-center space-y-3">
          <p className="text-sm text-secondary">ブランディングヒアリングデータがありません。</p>
          <p className="text-xs text-muted">「+ 新規ブランディングヒアリング」からヒアリングを開始しましょう。</p>
        </div>
      ) : (
        <section className="space-y-3">
          {hearings.map((h) => {
            const bd = h.hearing_json ?? {};
            return (
              <div key={h.id} className="glass-card p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-primary">{h.customer_name || "未入力"}</span>
                      <Badge variant={statusVariant(h.status)}>{statusLabel(h.status)}</Badge>
                      {bd.business_type && (
                        <span className="text-[11px] text-muted bg-surface-hover px-2 py-0.5 rounded">{bd.business_type}</span>
                      )}
                      {bd.store_count && (
                        <span className="text-[11px] font-mono text-muted bg-surface-hover px-2 py-0.5 rounded">{bd.store_count}店舗</span>
                      )}
                    </div>
                    <div className="text-xs text-muted flex gap-3 flex-wrap">
                      {bd.company_name && <span>{bd.company_name}</span>}
                      {bd.store_locations && <span>{bd.store_locations}</span>}
                      <span>{formatDate(h.created_at)}</span>
                    </div>
                    {/* Summary tags */}
                    <div className="flex gap-2 flex-wrap mt-1">
                      {bd.brand_color_main && (
                        <span className="inline-flex items-center gap-1 text-[11px] text-muted">
                          <span className="inline-block w-3 h-3 rounded-full border border-border" style={{ backgroundColor: bd.brand_color_main }} />
                          カラー設定あり
                        </span>
                      )}
                      {bd.guarantee_content && <span className="text-[11px] text-muted bg-surface-hover px-2 py-0.5 rounded">保証内容あり</span>}
                      {bd.grade_system && <span className="text-[11px] text-muted bg-surface-hover px-2 py-0.5 rounded">グレード体系あり</span>}
                      {bd.cert_design_unified && <span className="text-[11px] text-muted bg-surface-hover px-2 py-0.5 rounded">{bd.cert_design_unified}</span>}
                      {bd.rollout_plan && <span className="text-[11px] text-muted bg-surface-hover px-2 py-0.5 rounded">{bd.rollout_plan}</span>}
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-2 flex-wrap">
                  {h.status === "draft" && (
                    <button
                      onClick={() => handleComplete(h.id)}
                      className="btn-primary text-xs py-1.5 px-4"
                    >
                      ヒアリング完了にする
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </section>
      )}
    </div>
  );
}
