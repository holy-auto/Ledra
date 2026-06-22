"use client";

// ════════════════════════════════════════════════════════════
// Ledra Admin Prototype — clickable design reference
//
// A faithful port of the standalone HTML/JSX prototype
// (HANDOFF.md + "Ledra Admin Prototype.html") into a first-class
// Next.js client route so it can be reviewed on the production /
// preview deployment. No CDN scripts (CSP-safe), no Supabase data —
// all figures are fictional preview seed data. Styling lives in the
// scoped `./ledra-prototype.css` and maps 1:1 to the production
// design tokens in src/app/globals.css.
// ════════════════════════════════════════════════════════════

import { useEffect, useState, type CSSProperties, type ReactNode, Fragment } from "react";
import "./ledra-prototype.css";

type Go = (route: string) => void;
type Tone = "success" | "info" | "warn" | "danger" | "muted";

// ════════════════════════════════════════════════════════════
// Seed data (fictional 施工店 tenant) — ported from ledra-data.js
// ════════════════════════════════════════════════════════════
interface Customer {
  id: string;
  name: string;
  kana: string;
  type: "個人" | "法人";
  phone: string;
  email: string;
  since: string;
  vehicles: number;
  certs: number;
  ltv: number;
  repeat: boolean;
  tags: string[];
}
interface Vehicle {
  id: string;
  customer: string;
  maker: string;
  model: string;
  grade: string;
  plate: string;
  year: number;
  color: string;
  vin: string;
  size: string;
  nfc: boolean;
  certs: number;
}
interface Cert {
  id: string;
  customer: string;
  vehicle: string;
  service: string;
  date: string;
  status: string;
  amount: number;
  warranty: string;
  staff: string;
}
interface Reservation {
  id: string;
  customer: string;
  vehicle: string;
  service: string;
  time: string;
  status: string;
  staff: string;
  amount: number;
}
interface Invoice {
  id: string;
  customer: string;
  issued: string;
  due: string;
  amount: number;
  status: string;
}
interface InventoryItem {
  sku: string;
  name: string;
  cat: string;
  qty: number;
  min: number;
  value: number;
  low: boolean;
}
interface NavItem {
  id: string;
  label: string;
  emoji: string;
  badge?: number;
  count?: string;
}
interface NavSection {
  group: string | null;
  items: NavItem[];
}
interface RouteMeta {
  title: string;
  eyebrow: string;
  desc: string;
}

const shop = {
  name: "プレミアムオートサロン名古屋",
  short: "PAS名古屋",
  rank: "ゴールド",
  rankNext: "プラチナ",
  rankRemaining: 24,
  plan: "Standard",
  address: "愛知県名古屋市中村区名駅4-12-8",
  staff: 6,
  initials: "PN",
};

const kpi = {
  certsTotal: 1284,
  certsValid: 1196,
  certsVoid: 88,
  certsThisMonth: 128,
  customers: 842,
  repeatRate: 38,
  members: 6,
  invoicesOpen: 48,
  uncollected: 284000,
  overdue: 3,
  reservationsToday: 3,
  jobsActive: 7,
  btobActive: 4,
};

const trend30 = [
  12, 9, 14, 11, 8, 16, 13, 7, 15, 18, 10, 9, 14, 21, 17, 12, 8, 11, 19, 23, 15, 13, 9, 16, 20, 18, 11, 14, 22, 19,
];
const weekTrend = [40, 58, 46, 72, 64, 88, 76];

const customers: Customer[] = [
  {
    id: "cus_8Kd2",
    name: "田中 健一",
    kana: "タナカ ケンイチ",
    type: "個人",
    phone: "090-1234-5678",
    email: "tanaka.k@example.com",
    since: "2023-06",
    vehicles: 2,
    certs: 5,
    ltv: 412000,
    repeat: true,
    tags: ["VIP", "コーティング"],
  },
  {
    id: "cus_7Ja1",
    name: "佐藤 真由",
    kana: "サトウ マユ",
    type: "個人",
    phone: "080-2345-6789",
    email: "sato.m@example.com",
    since: "2024-01",
    vehicles: 1,
    certs: 2,
    ltv: 198000,
    repeat: true,
    tags: ["フィルム"],
  },
  {
    id: "cus_9Lm5",
    name: "株式会社モビリ",
    kana: "モビリ",
    type: "法人",
    phone: "052-555-0102",
    email: "fleet@mobili.co.jp",
    since: "2022-11",
    vehicles: 8,
    certs: 14,
    ltv: 1840000,
    repeat: true,
    tags: ["法人", "フリート", "ラッピング"],
  },
  {
    id: "cus_4Bv3",
    name: "鈴木 拓也",
    kana: "スズキ タクヤ",
    type: "個人",
    phone: "090-3456-7890",
    email: "suzuki.t@example.com",
    since: "2024-09",
    vehicles: 1,
    certs: 1,
    ltv: 24000,
    repeat: false,
    tags: [],
  },
  {
    id: "cus_2Qe8",
    name: "山本 美咲",
    kana: "ヤマモト ミサキ",
    type: "個人",
    phone: "070-4567-8901",
    email: "yamamoto.m@example.com",
    since: "2025-02",
    vehicles: 1,
    certs: 1,
    ltv: 36000,
    repeat: false,
    tags: ["新規"],
  },
  {
    id: "cus_6Tg7",
    name: "高橋 誠",
    kana: "タカハシ マコト",
    type: "個人",
    phone: "090-5678-9012",
    email: "takahashi@example.com",
    since: "2023-03",
    vehicles: 1,
    certs: 4,
    ltv: 356000,
    repeat: true,
    tags: ["VIP"],
  },
  {
    id: "cus_3Wn0",
    name: "中村オートサービス",
    kana: "ナカムラオート",
    type: "法人",
    phone: "052-555-0188",
    email: "info@nakamura-auto.jp",
    since: "2021-08",
    vehicles: 12,
    certs: 22,
    ltv: 2640000,
    repeat: true,
    tags: ["法人", "BtoB"],
  },
  {
    id: "cus_5Xr4",
    name: "伊藤 さくら",
    kana: "イトウ サクラ",
    type: "個人",
    phone: "080-6789-0123",
    email: "ito.s@example.com",
    since: "2025-04",
    vehicles: 1,
    certs: 0,
    ltv: 0,
    repeat: false,
    tags: ["チャーンリスク"],
  },
];

const vehicles: Vehicle[] = [
  {
    id: "veh_A1",
    customer: "田中 健一",
    maker: "トヨタ",
    model: "アルファード",
    grade: "Executive Lounge",
    plate: "名古屋 300 あ 12-34",
    year: 2023,
    color: "ブラック",
    vin: "AGH40-0012345",
    size: "L",
    nfc: true,
    certs: 3,
  },
  {
    id: "veh_A2",
    customer: "田中 健一",
    maker: "レクサス",
    model: "RX450h",
    grade: "version L",
    plate: "名古屋 301 さ 56-78",
    year: 2022,
    color: "ホワイトパール",
    vin: "GYL25-0098765",
    size: "L",
    nfc: false,
    certs: 2,
  },
  {
    id: "veh_B1",
    customer: "佐藤 真由",
    maker: "ホンダ",
    model: "ヴェゼル",
    grade: "e:HEV Z",
    plate: "名古屋 500 う 90-12",
    year: 2024,
    color: "プレミアムサンライトホワイト",
    vin: "RV5-1023456",
    size: "M",
    nfc: true,
    certs: 2,
  },
  {
    id: "veh_C1",
    customer: "株式会社モビリ",
    maker: "メルセデス・ベンツ",
    model: "Vクラス",
    grade: "V220d",
    plate: "名古屋 800 か 11-22",
    year: 2023,
    color: "オブシディアンブラック",
    vin: "W447-0567890",
    size: "XL",
    nfc: true,
    certs: 4,
  },
  {
    id: "veh_D1",
    customer: "鈴木 拓也",
    maker: "マツダ",
    model: "CX-5",
    grade: "XD L Package",
    plate: "三河 330 て 33-44",
    year: 2021,
    color: "ソウルレッド",
    vin: "KF2P-0234567",
    size: "M",
    nfc: false,
    certs: 1,
  },
  {
    id: "veh_E1",
    customer: "山本 美咲",
    maker: "日産",
    model: "ノート",
    grade: "e-POWER X",
    plate: "名古屋 580 ぬ 55-66",
    year: 2024,
    color: "ガンメタ",
    vin: "E13-0345678",
    size: "S",
    nfc: false,
    certs: 1,
  },
  {
    id: "veh_F1",
    customer: "高橋 誠",
    maker: "BMW",
    model: "M3",
    grade: "Competition",
    plate: "尾張小牧 300 む 77-88",
    year: 2023,
    color: "イザベリアブルー",
    vin: "G80-0456789",
    size: "M",
    nfc: true,
    certs: 4,
  },
];

const certs: Cert[] = [
  {
    id: "cert_01HXYZ7A",
    customer: "田中 健一",
    vehicle: "アルファード",
    service: "ボディコーティング（ガラス系9H）",
    date: "2026-06-18 14:22",
    status: "valid",
    amount: 88000,
    warranty: "5年",
    staff: "山田",
  },
  {
    id: "cert_01HXYZ68",
    customer: "佐藤 真由",
    vehicle: "ヴェゼル",
    service: "プロテクションフィルム（フルボディ）",
    date: "2026-06-18 11:05",
    status: "confirmed",
    amount: 142000,
    warranty: "3年",
    staff: "中島",
  },
  {
    id: "cert_01HXYZ5F",
    customer: "株式会社モビリ",
    vehicle: "Vクラス",
    service: "ラッピング（全面・マットPPF）",
    date: "2026-06-17 17:40",
    status: "overdue",
    amount: 320000,
    warranty: "—",
    staff: "山田",
  },
  {
    id: "cert_01HXYZ4C",
    customer: "鈴木 拓也",
    vehicle: "CX-5",
    service: "ヘッドライトコーティング",
    date: "2026-06-17 09:15",
    status: "valid",
    amount: 24000,
    warranty: "1年",
    staff: "佐々木",
  },
  {
    id: "cert_01HXYZ39",
    customer: "山本 美咲",
    vehicle: "ノート",
    service: "内装クリーニング・抗菌コート",
    date: "2026-06-16 15:48",
    status: "draft",
    amount: 36000,
    warranty: "—",
    staff: "中島",
  },
  {
    id: "cert_01HXYY2D",
    customer: "高橋 誠",
    vehicle: "M3",
    service: "セラミックコーティング（プロ施工）",
    date: "2026-06-15 13:30",
    status: "valid",
    amount: 165000,
    warranty: "5年",
    staff: "山田",
  },
  {
    id: "cert_01HXYY18",
    customer: "中村オートサービス",
    vehicle: "ハイエース",
    service: "フリート一括コーティング(3台)",
    date: "2026-06-14 10:00",
    status: "valid",
    amount: 264000,
    warranty: "3年",
    staff: "佐々木",
  },
  {
    id: "cert_01HXYX9K",
    customer: "田中 健一",
    vehicle: "RX450h",
    service: "ホイールコーティング",
    date: "2026-06-12 16:10",
    status: "void",
    amount: 18000,
    warranty: "—",
    staff: "中島",
  },
];

const reservations: Reservation[] = [
  {
    id: "job_5521",
    customer: "田中 健一",
    vehicle: "アルファード",
    service: "メンテナンスコート再施工",
    time: "2026-06-22 10:00",
    status: "confirmed",
    staff: "山田",
    amount: 28000,
  },
  {
    id: "job_5522",
    customer: "高橋 誠",
    vehicle: "M3",
    service: "PPF部分補修",
    time: "2026-06-22 13:00",
    status: "arrived",
    staff: "中島",
    amount: 45000,
  },
  {
    id: "job_5523",
    customer: "株式会社モビリ",
    vehicle: "Vクラス",
    service: "ラッピング剥がし＋再施工",
    time: "2026-06-22 09:30",
    status: "in_progress",
    staff: "佐々木",
    amount: 180000,
  },
  {
    id: "job_5524",
    customer: "佐藤 真由",
    vehicle: "ヴェゼル",
    service: "フィルム貼り直し",
    time: "2026-06-21 15:00",
    status: "completed",
    staff: "山田",
    amount: 32000,
  },
  {
    id: "job_5525",
    customer: "飛び込み",
    vehicle: "—",
    service: "ヘッドライト磨き",
    time: "2026-06-22 11:20",
    status: "in_progress",
    staff: "中島",
    amount: 12000,
  },
];

const jobMenu = [
  { name: "下地処理・鉄粉除去", min: 60, show: true },
  { name: "ポリッシング（2段階）", min: 120, show: true },
  { name: "ガラスコーティング塗布", min: 90, show: true },
  { name: "硬化・最終チェック", min: 60, show: false },
];

const invoices: Invoice[] = [
  { id: "inv_A3F2", customer: "佐藤 真由", issued: "2026-06-18", due: "2026-06-30", amount: 142000, status: "paid" },
  { id: "inv_A3F1", customer: "田中 健一", issued: "2026-06-18", due: "2026-07-02", amount: 88000, status: "sent" },
  {
    id: "inv_A3E9",
    customer: "株式会社モビリ",
    issued: "2026-06-05",
    due: "2026-06-15",
    amount: 320000,
    status: "overdue",
  },
  { id: "inv_A3E7", customer: "高橋 誠", issued: "2026-06-15", due: "2026-06-29", amount: 165000, status: "sent" },
  {
    id: "inv_A3E2",
    customer: "中村オートサービス",
    issued: "2026-06-14",
    due: "2026-06-28",
    amount: 264000,
    status: "paid",
  },
  { id: "inv_A3D8", customer: "山本 美咲", issued: "2026-06-16", due: "2026-06-30", amount: 36000, status: "draft" },
];

const activity = [
  { icon: "🪪", title: "証明書 cert_01HXYZ7A を発行", meta: "田中 健一 · 2分前" },
  { icon: "💰", title: "請求書 inv_A3F2 を入金確認", meta: "¥142,000 · 14分前" },
  { icon: "🏃", title: "飛び込み案件を受付", meta: "ヘッドライト磨き · 48分前" },
  { icon: "🤝", title: "代理店「オートワン」から新規紹介", meta: "3件 · 2時間前" },
  { icon: "🔧", title: "案件 job_5523 を作業開始", meta: "株式会社モビリ · 3時間前" },
];

const todayTasks: { tone: Tone; label: string; count: number; hint: string }[] = [
  { tone: "info", label: "本日来店予約", count: 3, hint: "10:00 田中 / 13:00 高橋 / 09:30 モビリ" },
  { tone: "warn", label: "進行中の作業", count: 2, hint: "Vクラス・ヘッドライト磨き" },
  { tone: "danger", label: "期限切れ請求", count: 1, hint: "inv_A3E9 ¥320,000 · 7日経過" },
  { tone: "danger", label: "未回収請求", count: 3, hint: "合計 ¥284,000" },
  { tone: "warn", label: "有効期限切れ証明書", count: 5, hint: "メンテナンス案内の好機" },
  { tone: "info", label: "チャーンリスク顧客", count: 2, hint: "180日以上来店なし" },
];

const setupSteps = [
  { label: "店舗情報の入力", done: true },
  { label: "ロゴのアップロード", done: true },
  { label: "車両・顧客の登録", done: true },
  { label: "初回証明書の発行", done: true },
  { label: "スタッフ招待", done: false },
];

const inventory: InventoryItem[] = [
  {
    sku: "SKU-COAT-9H",
    name: "ガラスコーティング剤 9H",
    cat: "コーティング剤",
    qty: 8,
    min: 5,
    value: 96000,
    low: false,
  },
  { sku: "SKU-PPF-152", name: "PPFフィルム 152cm幅", cat: "フィルム", qty: 3, min: 4, value: 210000, low: true },
  {
    sku: "SKU-WRAP-MT",
    name: "ラッピングフィルム マット",
    cat: "フィルム",
    qty: 12,
    min: 6,
    value: 168000,
    low: false,
  },
  { sku: "SKU-NFC-T1", name: "NFCタグ Type1", cat: "NFCタグ", qty: 2, min: 20, value: 4000, low: true },
  { sku: "SKU-MASK-50", name: "養生マスキング 50mm", cat: "養生材", qty: 40, min: 15, value: 12000, low: false },
];

const nav: NavSection[] = [
  { group: null, items: [{ id: "dashboard", label: "ダッシュボード", emoji: "📊" }] },
  {
    group: "業務",
    items: [
      { id: "reservations", label: "予約管理", emoji: "🚪", badge: 3 },
      { id: "jobs", label: "案件ワークフロー", emoji: "🧭", badge: 7 },
      { id: "certificates", label: "証明書", emoji: "🪪", count: "1,284" },
      { id: "vehicles", label: "車両管理", emoji: "🚗" },
      { id: "booking-settings", label: "予約受付設定", emoji: "🗓️" },
      { id: "workflow-templates", label: "ワークフローテンプレ", emoji: "🧩" },
      { id: "document-templates", label: "帳票テンプレ", emoji: "📄" },
      { id: "menu-items", label: "品目マスタ", emoji: "📋" },
      { id: "inventory", label: "在庫管理", emoji: "📦" },
      { id: "nfc", label: "NFC管理", emoji: "🪧" },
      { id: "thickness", label: "塗膜厚レポート", emoji: "📐" },
    ],
  },
  {
    group: "顧客",
    items: [
      { id: "customers", label: "顧客管理", emoji: "👥" },
      { id: "hearing", label: "ヒアリング", emoji: "🗣️" },
      { id: "inquiries", label: "問い合わせ", emoji: "📨" },
      { id: "customer-inquiries", label: "顧客問い合わせ", emoji: "💬" },
    ],
  },
  {
    group: "売上・経営",
    items: [
      { id: "invoices", label: "請求・帳票", emoji: "💰", count: "48" },
      { id: "square", label: "Square売上", emoji: "🟦" },
      { id: "accounting", label: "会計連携", emoji: "🧾" },
      { id: "management", label: "経営分析", emoji: "📈" },
      { id: "pos", label: "POS会計", emoji: "🏪" },
      { id: "price-stats", label: "施工価格相場", emoji: "💹" },
    ],
  },
  {
    group: "取引ハブ",
    items: [
      { id: "trades", label: "取引ダッシュボード", emoji: "🔁" },
      { id: "btob", label: "BtoBプラットフォーム", emoji: "🤝", badge: 4 },
      { id: "orders", label: "案件受発注", emoji: "📑" },
      { id: "market-vehicles", label: "マーケット車両", emoji: "🚙" },
      { id: "deals", label: "商談管理", emoji: "💼" },
      { id: "insurers", label: "保険会社管理", emoji: "🏢" },
      { id: "agents", label: "代理店管理", emoji: "🧑‍💼" },
    ],
  },
  {
    group: "情報・学習",
    items: [
      { id: "announcements", label: "お知らせ", emoji: "📢" },
      { id: "news", label: "業界ニュース", emoji: "📰" },
      { id: "academy", label: "Ledra Academy", emoji: "🎓" },
      { id: "support", label: "ヘルプ・サポート", emoji: "🆘" },
    ],
  },
  {
    group: "設定",
    items: [
      { id: "settings", label: "店舗設定", emoji: "⚙️" },
      { id: "security", label: "セキュリティ", emoji: "🔐" },
      { id: "stores", label: "店舗管理", emoji: "🏬" },
      { id: "members", label: "メンバー", emoji: "👤" },
      { id: "billing", label: "請求・プラン", emoji: "💳" },
      { id: "audit", label: "操作履歴", emoji: "🗂️" },
    ],
  },
];

const routeMeta: Record<string, RouteMeta> = {
  "booking-settings": {
    title: "予約受付設定",
    eyebrow: "admin · 業務",
    desc: "外部予約フォームの曜日別スロット・定休日を一括管理します。",
  },
  "workflow-templates": {
    title: "ワークフローテンプレ",
    eyebrow: "admin · 業務",
    desc: "施工種別ごとの標準工程を設計し、案件に即適用します。",
  },
  "document-templates": {
    title: "帳票テンプレ",
    eyebrow: "admin · 業務",
    desc: "証明書・請求書・領収書のレイアウトを帳票種別ごとに編集します。",
  },
  "menu-items": { title: "品目マスタ", eyebrow: "admin · 業務", desc: "施工メニューと価格・カテゴリを管理します。" },
  nfc: { title: "NFC管理", eyebrow: "admin · 業務", desc: "NFCタグの登録・車両紐付け・書き込みを行います。" },
  thickness: {
    title: "塗膜厚レポート",
    eyebrow: "admin · 業務",
    desc: "膜厚計の測定データをVINで車両に紐付けて保管します。",
  },
  hearing: { title: "ヒアリング", eyebrow: "admin · 顧客", desc: "顧客ヒアリングフォームの回答を管理します。" },
  inquiries: { title: "問い合わせ", eyebrow: "admin · 顧客", desc: "外部からの問い合わせを管理します。" },
  "customer-inquiries": {
    title: "顧客問い合わせ",
    eyebrow: "admin · 顧客",
    desc: "自店顧客からのサポート問い合わせを3段階で管理します。",
  },
  square: {
    title: "Square売上連携",
    eyebrow: "admin · 売上・経営",
    desc: "Squareの注文データを取り込み、顧客と紐付けます。",
  },
  accounting: {
    title: "会計連携",
    eyebrow: "admin · 売上・経営",
    desc: "freee / マネーフォワード と連携し、入金済請求書を自動仕訳化します。",
  },
  "price-stats": { title: "施工価格相場", eyebrow: "admin · 売上・経営", desc: "施工種類別の価格統計を確認します。" },
  trades: {
    title: "取引ダッシュボード",
    eyebrow: "admin · 取引ハブ",
    desc: "BtoB・受発注・商談・マーケット車両を集約します。",
  },
  btob: {
    title: "BtoBプラットフォーム",
    eyebrow: "admin · 取引ハブ",
    desc: "施工店間のマーケットプレイス。在庫・商談を横断管理します。",
  },
  orders: {
    title: "案件受発注",
    eyebrow: "admin · 取引ハブ",
    desc: "受注・発注を管理し、メッセージ・レビューを行います。",
  },
  "market-vehicles": { title: "マーケット車両", eyebrow: "admin · 取引ハブ", desc: "車両を掲載・販売します。" },
  deals: { title: "商談管理", eyebrow: "admin · 取引ハブ", desc: "BtoB商談の進捗を管理します。" },
  insurers: {
    title: "保険会社管理",
    eyebrow: "admin · 取引ハブ",
    desc: "保険会社のテナントアクセス権・契約を管理します。",
  },
  agents: { title: "代理店管理", eyebrow: "admin · 取引ハブ", desc: "代理店の申請承認・営業資料を管理します。" },
  announcements: { title: "お知らせ", eyebrow: "admin · 情報・学習", desc: "店舗スタッフ向けのお知らせを配信します。" },
  news: { title: "業界ニュース", eyebrow: "admin · 情報・学習", desc: "自動取得した業界ニュースを配信します。" },
  academy: {
    title: "Ledra Academy",
    eyebrow: "admin · 情報・学習",
    desc: "施工技能の学習・施工事例・QAアシスタントを提供します。",
  },
  support: { title: "ヘルプ・サポート", eyebrow: "admin · 情報・学習", desc: "内蔵FAQとサポート問い合わせフォーム。" },
  settings: { title: "店舗設定", eyebrow: "admin · 設定", desc: "店舗基本情報・デフォルト設定を管理します。" },
  security: { title: "セキュリティ", eyebrow: "admin · 設定", desc: "2要素認証(TOTP)の有効化・解除を行います。" },
  stores: { title: "店舗管理", eyebrow: "admin · 設定", desc: "マルチ店舗を管理します。" },
  members: { title: "メンバー管理", eyebrow: "admin · 設定", desc: "スタッフ招待・権限を管理します。" },
  billing: { title: "請求・プラン", eyebrow: "admin · 設定", desc: "Stripeサブスクリプションを管理します。" },
  audit: { title: "操作履歴", eyebrow: "admin · 設定", desc: "200+ イベント種別の操作ログを閲覧します。" },
};

const yen = (n: number): string => "¥" + n.toLocaleString("ja-JP");

// ════════════════════════════════════════════════════════════
// Shared UI primitives — ported from ledra-ui.jsx
// ════════════════════════════════════════════════════════════
const ICON_PATHS: Record<string, string> = {
  search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.35-4.35"/>',
  bell: '<path d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6 6 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  chevR: '<path d="M9 5l7 7-7 7"/>',
  chevD: '<path d="M6 9l6 6 6-6"/>',
  arrowR: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  filter: '<path d="M3 4h18M6 12h12M10 20h4"/>',
  download: '<path d="M12 3v12m0 0l-4-4m4 4l4-4M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2"/>',
  dots: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
  check: '<path d="M5 13l4 4L19 7"/>',
  car: '<path d="M5 11l1.5-4.5A2 2 0 018.4 5h7.2a2 2 0 011.9 1.5L19 11m-14 0h14m-14 0v6m14-6v6M7 17h0m10 0h0M5 17h14"/>',
  doc: '<path d="M9 12h6m-6 4h6m-7 5h8a2 2 0 002-2V7l-5-4H7a2 2 0 00-2 2v14a2 2 0 002 2z"/>',
  user: '<path d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM4 21v-1a6 6 0 0112 0v1"/>',
  yen: '<path d="M12 4l-4 7h8l-4-7zm0 7v9m-4-5h8m-8 3h8"/>',
  cal: '<rect x="4" y="5" width="16" height="16" rx="2"/><path d="M16 3v4M8 3v4M4 11h16"/>',
  box: '<path d="M21 8l-9-5-9 5 9 5 9-5zM3 8v8l9 5 9-5V8M12 13v8"/>',
  cog: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/>',
  shield: '<path d="M12 3l8 3v6c0 4.5-3 7.5-8 9-5-1.5-8-4.5-8-9V6l8-3z"/>',
  edit: '<path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7M18.5 2.5a2.12 2.12 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>',
  qr: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3m4 0v4m-7 0h3"/>',
  print: '<path d="M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2M6 14h12v8H6z"/>',
  copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  link: '<path d="M10 13a5 5 0 007 0l3-3a5 5 0 00-7-7l-1 1m-2 9a5 5 0 01-7 0l-3-3a5 5 0 017-7l1 1"/>',
  trend: '<path d="M3 17l6-6 4 4 8-8M21 7h-5m5 0v5"/>',
};

function Icon({
  name,
  size = 18,
  sw = 1.5,
  style,
}: {
  name: string;
  size?: number;
  sw?: number;
  style?: CSSProperties;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={sw}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={style}
      dangerouslySetInnerHTML={{ __html: ICON_PATHS[name] || "" }}
    />
  );
}

// Status badge — single source of truth (never fork variants)
const STATUS_MAP: Record<string, { tone: Tone; label: string }> = {
  valid: { tone: "success", label: "有効" },
  confirmed: { tone: "info", label: "確認済み" },
  arrived: { tone: "info", label: "来店" },
  in_progress: { tone: "warn", label: "作業中" },
  completed: { tone: "success", label: "完了" },
  overdue: { tone: "warn", label: "期限超過" },
  void: { tone: "danger", label: "無効" },
  draft: { tone: "muted", label: "下書き" },
  paid: { tone: "success", label: "支払済" },
  sent: { tone: "info", label: "送信済" },
};

function Badge({ tone = "muted", children, dot = true }: { tone?: Tone; children: ReactNode; dot?: boolean }) {
  return (
    <span className={"badge " + tone}>
      {dot && <span className="dot" />}
      {children}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const m = STATUS_MAP[status] || { tone: "muted" as Tone, label: status };
  return <Badge tone={m.tone}>{m.label}</Badge>;
}

function Btn({
  variant = "secondary",
  icon,
  children,
  onClick,
  style,
}: {
  variant?: "primary" | "secondary" | "ghost";
  icon?: string;
  children: ReactNode;
  onClick?: () => void;
  style?: CSSProperties;
}) {
  return (
    <button className={"btn " + variant} onClick={onClick} style={style}>
      {icon && <Icon name={icon} size={15} sw={variant === "primary" ? 2 : 1.5} />}
      {children}
    </button>
  );
}

function Card({
  eyebrow,
  title,
  action,
  children,
  style,
}: {
  eyebrow?: string;
  title?: string;
  action?: ReactNode;
  children: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <div className="card" style={style}>
      {(title || action) && (
        <div className="card-head">
          <div>
            {eyebrow && <span className="section-tag">{eyebrow}</span>}
            {title && <h3 style={{ marginTop: eyebrow ? 4 : 0 }}>{title}</h3>}
          </div>
          {action}
        </div>
      )}
      {children}
    </div>
  );
}

function PageHeader({
  eyebrow,
  title,
  desc,
  actions,
}: {
  eyebrow?: string;
  title: string;
  desc?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="page-head">
      <div>
        {eyebrow && <span className="section-tag">{eyebrow}</span>}
        <h1>{title}</h1>
        {desc && <p>{desc}</p>}
      </div>
      {actions && <div className="ph-actions">{actions}</div>}
    </div>
  );
}

function Avatar({ initials, size = 32 }: { initials: string; size?: number }) {
  return (
    <div className="avatar" style={{ width: size, height: size, fontSize: size * 0.38 }}>
      {initials}
    </div>
  );
}

function EmptyState({
  icon = "doc",
  title,
  desc,
  action,
}: {
  icon?: string;
  title: string;
  desc?: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <div className="empty-ico">
        <Icon name={icon} size={26} />
      </div>
      <div className="empty-title">{title}</div>
      {desc && <div className="empty-desc">{desc}</div>}
      {action && <div style={{ marginTop: 14 }}>{action}</div>}
    </div>
  );
}

function Sparkbars({ data, height = 100, labels }: { data: number[]; height?: number; labels?: string[] }) {
  const max = Math.max(...data);
  return (
    <div>
      <div className="chart" style={{ height }}>
        {data.map((v, i) => (
          <div key={i} className="bar" style={{ height: (v / max) * 100 + "%" }} />
        ))}
      </div>
      {labels && (
        <div className="chart-labels">
          {labels.map((l, i) => (
            <span key={i}>{l}</span>
          ))}
        </div>
      )}
    </div>
  );
}

function Donut({ segments, size = 120 }: { segments: { value: number; color: string }[]; size?: number }) {
  const total = segments.reduce((a, s) => a + s.value, 0);
  const r = 54;
  const c = 2 * Math.PI * r;
  // Pre-compute each arc length + its cumulative offset so the render pass
  // stays free of mutated closure state.
  const arcLen = (value: number) => (value / total) * c;
  const arcs = segments.map((s, idx) => ({
    color: s.color,
    len: arcLen(s.value),
    off: segments.slice(0, idx).reduce((a, x) => a + arcLen(x.value), 0),
  }));
  return (
    <svg width={size} height={size} viewBox="0 0 120 120">
      <circle cx="60" cy="60" r={r} fill="none" stroke="var(--bg-inset)" strokeWidth="12" />
      {arcs.map((s, i) => {
        const len = s.len;
        const off = s.off;
        return (
          <circle
            key={i}
            cx="60"
            cy="60"
            r={r}
            fill="none"
            stroke={s.color}
            strokeWidth="12"
            strokeDasharray={`${len} ${c - len}`}
            strokeDashoffset={-off}
            transform="rotate(-90 60 60)"
            strokeLinecap="butt"
          />
        );
      })}
      <text
        x="60"
        y="56"
        textAnchor="middle"
        fontSize="22"
        fontWeight="600"
        fill="var(--text-primary)"
        fontFamily="var(--font-mono)"
      >
        {total}
      </text>
      <text x="60" y="74" textAnchor="middle" fontSize="10" fill="var(--text-muted)">
        合計
      </text>
    </svg>
  );
}

interface TabItem {
  id: string;
  label: string;
  count?: number;
}
function Tabs({ tabs, active, onChange }: { tabs: TabItem[]; active: string; onChange: (id: string) => void }) {
  return (
    <div className="tabs">
      {tabs.map((t) => (
        <button key={t.id} className={"tab" + (active === t.id ? " active" : "")} onClick={() => onChange(t.id)}>
          {t.label}
          {t.count != null && <span className="tab-count">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

// ════════════════════════════════════════════════════════════
// Shell — sidebar, topbar, mobile nav, Cmd+K (ledra-shell.jsx)
// ════════════════════════════════════════════════════════════
function Sidebar({ route, go, onClose }: { route: string; go: Go; onClose: () => void }) {
  return (
    <aside className="sidebar">
      <div className="sb-top">
        <div className="sb-brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand-logo.png" alt="" onError={(e) => ((e.target as HTMLImageElement).style.display = "none")} />
          <div>
            <div className="name">LEDRA</div>
            <div className="sub">admin</div>
          </div>
        </div>
        <button className="sb-close" onClick={onClose}>
          <Icon name="x" size={20} />
        </button>
      </div>

      <div className="sb-store">
        <Avatar initials={shop.initials} size={30} />
        <div className="sb-store-info">
          <div className="sb-store-name">{shop.short}</div>
          <div className="sb-store-rank">
            {shop.rank}ランク · {shop.plan}
          </div>
        </div>
        <Icon name="chevD" size={15} />
      </div>

      <nav className="sb-nav">
        {nav.map((sec, i) => (
          <div className="sb-sec" key={i}>
            {sec.group && <div className="sb-label">{sec.group}</div>}
            {sec.items.map((it) => (
              <button key={it.id} className={"sb-item" + (route === it.id ? " active" : "")} onClick={() => go(it.id)}>
                <span className="emoji">{it.emoji}</span>
                <span className="sb-item-label">{it.label}</span>
                {it.badge != null && <span className="sb-badge">{it.badge}</span>}
                {it.count != null && <span className="count">{it.count}</span>}
              </button>
            ))}
          </div>
        ))}
      </nav>
    </aside>
  );
}

function Topbar({
  onMenu,
  onSearch,
  dark,
  setDark,
}: {
  onMenu: () => void;
  onSearch: () => void;
  dark: boolean;
  setDark: (v: boolean) => void;
}) {
  return (
    <header className="topbar">
      <button className="icon-btn only-mobile" onClick={onMenu}>
        <Icon name="menu" size={22} />
      </button>
      <button className="search" onClick={onSearch}>
        <Icon name="search" size={16} />
        <span>証明書・顧客・案件を検索</span>
        <span className="kbd">⌘K</span>
      </button>
      <div className="spacer" />
      <button className="icon-btn" onClick={() => setDark(!dark)} title="テーマ切替">
        <Icon name={dark ? "trend" : "shield"} size={17} />
      </button>
      <button className="icon-btn bell" title="通知">
        <Icon name="bell" size={17} />
        <span className="bell-dot" />
      </button>
      <Btn variant="primary" icon="plus">
        証明書を発行
      </Btn>
      <Avatar initials="YT" />
    </header>
  );
}

function CommandPalette({ open, onClose, go }: { open: boolean; onClose: () => void; go: Go }) {
  const [q, setQ] = useState("");
  if (!open) return null;
  const items: { type: string; label: string; emoji: string; action: () => void }[] = [];
  nav.forEach((s) =>
    s.items.forEach((it) => items.push({ type: "ページ", label: it.label, emoji: it.emoji, action: () => go(it.id) })),
  );
  certs
    .slice(0, 4)
    .forEach((c) =>
      items.push({ type: "証明書", label: c.id + " · " + c.customer, emoji: "🪪", action: () => go("certificates") }),
    );
  customers
    .slice(0, 4)
    .forEach((c) => items.push({ type: "顧客", label: c.name, emoji: "👤", action: () => go("customers") }));
  const filtered = q ? items.filter((i) => i.label.toLowerCase().includes(q.toLowerCase())) : items.slice(0, 8);
  return (
    <div className="cmdk-overlay" onClick={onClose}>
      <div className="cmdk" onClick={(e) => e.stopPropagation()}>
        <div className="cmdk-input">
          <Icon name="search" size={18} />
          <input autoFocus placeholder="ページ・証明書・顧客を検索…" value={q} onChange={(e) => setQ(e.target.value)} />
          <span className="kbd">esc</span>
        </div>
        <div className="cmdk-list">
          {filtered.length === 0 && <div className="cmdk-empty">該当なし</div>}
          {filtered.map((it, i) => (
            <button
              key={i}
              className="cmdk-item"
              onClick={() => {
                it.action();
                onClose();
              }}
            >
              <span className="cmdk-emoji">{it.emoji}</span>
              <span className="cmdk-label">{it.label}</span>
              <span className="cmdk-type">{it.type}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function Shell({ route, go, children }: { route: string; go: Go; children: ReactNode }) {
  const [navOpen, setNavOpen] = useState(false);
  const [cmdk, setCmdk] = useState(false);
  const [dark, setDark] = useState(false);

  // Drive the prototype theme via <html data-theme> (matches the rest of the
  // app), restoring the previous value when leaving the preview.
  useEffect(() => {
    const root = document.documentElement;
    const prev = root.getAttribute("data-theme");
    root.setAttribute("data-theme", dark ? "dark" : "light");
    return () => {
      if (prev) root.setAttribute("data-theme", prev);
      else root.removeAttribute("data-theme");
    };
  }, [dark]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCmdk((v) => !v);
      }
      if (e.key === "Escape") setCmdk(false);
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  // close mobile nav on route change
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: dismiss the mobile drawer after navigating
    setNavOpen(false);
  }, [route]);

  return (
    <div className="lp">
      <div className={"shell" + (navOpen ? " nav-open" : "")}>
        <div className="nav-scrim" onClick={() => setNavOpen(false)} />
        <Sidebar route={route} go={go} onClose={() => setNavOpen(false)} />
        <div className="content">
          <Topbar onMenu={() => setNavOpen(true)} onSearch={() => setCmdk(true)} dark={dark} setDark={setDark} />
          <main className="main">{children}</main>
        </div>
        <CommandPalette open={cmdk} onClose={() => setCmdk(false)} go={go} />
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// Core screens — ledra-screens-core.jsx
// ════════════════════════════════════════════════════════════
function Dashboard({ go }: { go: Go }) {
  const [mode, setMode] = useState<"admin" | "store">("admin");
  const doneSteps = setupSteps.filter((s) => s.done).length;
  const pct = Math.round((doneSteps / setupSteps.length) * 100);

  return (
    <div className="screen">
      <PageHeader
        eyebrow="admin · overview"
        title="ダッシュボード"
        desc={`本日の予約 ${kpi.reservationsToday}件 · 進行中の案件 ${kpi.jobsActive}件 · 未入金 ${kpi.overdue}件`}
        actions={
          <div className="mode-switch">
            <button className={mode === "admin" ? "active" : ""} onClick={() => setMode("admin")}>
              Admin
            </button>
            <button className={mode === "store" ? "active" : ""} onClick={() => setMode("store")}>
              Storefront
            </button>
          </div>
        }
      />

      {pct < 100 && (
        <div className="setup-card">
          <div className="setup-head">
            <div>
              <span className="section-tag">getting started</span>
              <h3>セットアップを完了しましょう</h3>
            </div>
            <div className="setup-pct">{pct}%</div>
          </div>
          <div className="setup-bar">
            <div style={{ width: pct + "%" }} />
          </div>
          <div className="setup-steps">
            {setupSteps.map((s, i) => (
              <div key={i} className={"setup-step" + (s.done ? " done" : "")}>
                <span className="setup-check">{s.done ? <Icon name="check" size={13} sw={2.5} /> : i + 1}</span>
                {s.label}
              </div>
            ))}
          </div>
        </div>
      )}

      {mode === "store" ? <Storefront go={go} /> : <AdminDash go={go} />}
    </div>
  );
}

function AdminDash({ go }: { go: Go }) {
  return (
    <Fragment>
      <div className="today-grid">
        {todayTasks.map((t, i) => (
          <div key={i} className={"task-chip " + t.tone}>
            <div className="task-count">{t.count}</div>
            <div className="task-label">{t.label}</div>
            <div className="task-hint">{t.hint}</div>
          </div>
        ))}
      </div>

      <div className="stats">
        <div className="stat">
          <div className="lbl">certificates</div>
          <div className="num">{kpi.certsTotal.toLocaleString()}</div>
          <div className="trend">
            <Icon name="trend" size={12} sw={2} /> 今月 +{kpi.certsThisMonth}
          </div>
        </div>
        <div className="stat">
          <div className="lbl">customers</div>
          <div className="num">{kpi.customers}</div>
          <div className="sub">リピート率 {kpi.repeatRate}%</div>
        </div>
        <div className="stat">
          <div className="lbl">uncollected</div>
          <div className="num danger">{yen(kpi.uncollected)}</div>
          <div className="sub">期限超過 {kpi.overdue}件</div>
        </div>
        <div className="stat">
          <div className="lbl">shop rank</div>
          <div className="num">{shop.rank}</div>
          <div className="sub">次まで {shop.rankRemaining}件</div>
        </div>
      </div>

      <div className="two-col">
        <Card
          eyebrow="recent"
          title="最近発行した証明書"
          action={
            <Btn variant="ghost" onClick={() => go("certificates")}>
              すべて表示 →
            </Btn>
          }
        >
          <table>
            <thead>
              <tr>
                <th>顧客</th>
                <th>施工内容</th>
                <th>ID</th>
                <th>発行日</th>
                <th>ステータス</th>
                <th className="r">金額</th>
              </tr>
            </thead>
            <tbody>
              {certs.slice(0, 6).map((c) => (
                <tr key={c.id} onClick={() => go("cert:" + c.id)} className="row-link">
                  <td>{c.customer}</td>
                  <td className="truncate">{c.service}</td>
                  <td className="mono">{c.id}</td>
                  <td className="mono">{c.date.slice(5)}</td>
                  <td>
                    <StatusBadge status={c.status} />
                  </td>
                  <td className="num">{yen(c.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <div className="rail">
          <Card eyebrow="this month" title="発行推移" action={<Badge tone="info">+12.4%</Badge>}>
            <Sparkbars data={weekTrend} labels={["月", "火", "水", "木", "金", "土", "日"]} />
          </Card>
          <Card eyebrow="status" title="証明書ステータス">
            <div className="donut-row">
              <Donut
                segments={[
                  { value: kpi.certsValid, color: "var(--accent-emerald)" },
                  { value: kpi.certsVoid, color: "var(--accent-red)" },
                ]}
              />
              <div className="legend">
                <div>
                  <span className="dot" style={{ background: "var(--accent-emerald)" }} />
                  有効 <b>{kpi.certsValid}</b>
                </div>
                <div>
                  <span className="dot" style={{ background: "var(--accent-red)" }} />
                  無効 <b>{kpi.certsVoid}</b>
                </div>
              </div>
            </div>
          </Card>
          <Card eyebrow="activity" title="最近のアクション">
            {activity.map((a, i) => (
              <div className="act" key={i}>
                <div className="bullet">{a.icon}</div>
                <div className="act-body">
                  <div className="act-title">{a.title}</div>
                  <div className="act-meta">{a.meta}</div>
                </div>
              </div>
            ))}
          </Card>
        </div>
      </div>
    </Fragment>
  );
}

function Storefront({ go }: { go: Go }) {
  const cols: { key: string; label: string; tone: Tone }[] = [
    { key: "arrived", label: "受付", tone: "info" },
    { key: "in_progress", label: "作業中", tone: "warn" },
    { key: "completed", label: "会計待ち", tone: "success" },
  ];
  return (
    <Fragment>
      <div className="pos-actions">
        <button className="pos-btn" onClick={() => go("jobs")}>
          <span>🏃</span>飛び込み案件
        </button>
        <button className="pos-btn" onClick={() => go("reservations")}>
          <span>🚪</span>来店チェックイン
        </button>
        <button className="pos-btn" onClick={() => go("pos")}>
          <span>💳</span>会計（POS）
        </button>
        <button className="pos-btn" onClick={() => go("certificates")}>
          <span>🪪</span>証明書発行
        </button>
      </div>
      <div className="kanban">
        {cols.map((col) => {
          const items = reservations.filter((r) => r.status === col.key);
          return (
            <div className="kanban-col" key={col.key}>
              <div className="kanban-head">
                <Badge tone={col.tone}>{col.label}</Badge>
              </div>
              {items.map((r) => (
                <div className="kanban-card" key={r.id} onClick={() => go("job:" + r.id)}>
                  <div className="kc-cust">{r.customer}</div>
                  <div className="kc-svc">{r.service}</div>
                  <div className="kc-meta">
                    <span className="mono">{r.time.slice(11)}</span> · {r.staff}
                  </div>
                </div>
              ))}
              {items.length === 0 && <div className="kanban-empty">なし</div>}
            </div>
          );
        })}
      </div>
    </Fragment>
  );
}

function Certificates({ go }: { go: Go }) {
  const [filter, setFilter] = useState("all");
  const tabs: TabItem[] = [
    { id: "all", label: "すべて", count: certs.length },
    { id: "valid", label: "有効", count: certs.filter((c) => c.status === "valid").length },
    { id: "draft", label: "下書き", count: certs.filter((c) => c.status === "draft").length },
    { id: "void", label: "無効", count: certs.filter((c) => c.status === "void").length },
  ];
  const rows = filter === "all" ? certs : certs.filter((c) => c.status === filter);
  return (
    <div className="screen">
      <PageHeader
        eyebrow="admin · 業務"
        title="証明書"
        desc={`${kpi.certsTotal.toLocaleString()}件の発行済証明書`}
        actions={
          <Fragment>
            <Btn icon="download">バッチPDF</Btn>
            <Btn variant="primary" icon="plus">
              新規発行
            </Btn>
          </Fragment>
        }
      />
      <div className="toolbar">
        <Tabs tabs={tabs} active={filter} onChange={setFilter} />
        <div className="toolbar-right">
          <button className="search inline">
            <Icon name="search" size={15} />
            <span>絞り込み検索</span>
          </button>
          <Btn icon="filter">フィルタ</Btn>
        </div>
      </div>
      <Card>
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>顧客</th>
              <th>車両</th>
              <th>施工内容</th>
              <th>保証</th>
              <th>発行日</th>
              <th>担当</th>
              <th>ステータス</th>
              <th className="r">金額</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id} className="row-link" onClick={() => go("cert:" + c.id)}>
                <td className="mono">{c.id}</td>
                <td>{c.customer}</td>
                <td>{c.vehicle}</td>
                <td className="truncate">{c.service}</td>
                <td>{c.warranty}</td>
                <td className="mono">{c.date.slice(0, 10)}</td>
                <td>{c.staff}</td>
                <td>
                  <StatusBadge status={c.status} />
                </td>
                <td className="num">{yen(c.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function CertDetail({ id, go }: { id?: string; go: Go }) {
  const c = certs.find((x) => x.id === id) || certs[0];
  const veh = vehicles.find((v) => v.model === c.vehicle);
  return (
    <div className="screen">
      <button className="back" onClick={() => go("certificates")}>
        ← 証明書一覧
      </button>
      <PageHeader
        eyebrow={"admin · 証明書 · " + c.id}
        title={c.service}
        actions={
          <Fragment>
            <Btn icon="copy">複製</Btn>
            <Btn icon="print">PDF出力</Btn>
            <Btn variant="primary" icon="qr">
              QR共有
            </Btn>
          </Fragment>
        }
      />
      <div className="detail-grid">
        <div className="detail-main">
          <div className="cert-paper">
            <div className="cert-seal">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/brand-logo.png"
                alt=""
                onError={(e) => ((e.target as HTMLImageElement).style.display = "none")}
              />
            </div>
            <div className="cert-eyebrow">CERTIFICATE OF CONSTRUCTION</div>
            <div className="cert-title">施工証明書</div>
            <div className="cert-id mono">{c.id}</div>
            <div className="cert-body">
              <div>
                <span>顧客</span>
                <b>{c.customer}</b>
              </div>
              <div>
                <span>車両</span>
                <b>
                  {c.vehicle}
                  {veh ? "（" + veh.plate + "）" : ""}
                </b>
              </div>
              <div>
                <span>施工内容</span>
                <b>{c.service}</b>
              </div>
              <div>
                <span>保証期間</span>
                <b>{c.warranty}</b>
              </div>
              <div>
                <span>施工日</span>
                <b>{c.date}</b>
              </div>
              <div>
                <span>担当者</span>
                <b>{c.staff}</b>
              </div>
              <div>
                <span>施工料金</span>
                <b>{yen(c.amount)}</b>
              </div>
            </div>
            <div className="cert-foot">
              <div className="cert-shop">
                {shop.name}
                <br />
                <span>{shop.address}</span>
              </div>
              <div className="cert-qr">
                <Icon name="qr" size={56} />
              </div>
            </div>
          </div>
        </div>
        <div className="detail-rail">
          <Card title="ステータス">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <StatusBadge status={c.status} />
              <Btn variant="ghost">無効化</Btn>
            </div>
          </Card>
          <Card title="ブロックチェーン記録">
            <div className="chain-row">
              <Icon name="shield" size={16} />
              <div>
                <div className="chain-t">Polygon アンカリング済</div>
                <div className="chain-m mono">0x7a3f…e92b · 2026-06-18</div>
              </div>
            </div>
          </Card>
          <Card title="施工写真">
            <div className="photo-grid">
              {[1, 2, 3, 4].map((i) => (
                <div className="photo" key={i}>
                  📷
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Jobs({ go }: { go: Go }) {
  return (
    <div className="screen">
      <PageHeader
        eyebrow="admin · 業務"
        title="案件ワークフロー"
        desc={`進行中 ${kpi.jobsActive}件 — 予約→来店→作業→証明書→請求→入金を1画面で`}
        actions={
          <Btn variant="primary" icon="plus">
            🏃 飛び込み案件
          </Btn>
        }
      />
      <Card>
        <table>
          <thead>
            <tr>
              <th>案件ID</th>
              <th>顧客</th>
              <th>車両</th>
              <th>内容</th>
              <th>予定</th>
              <th>担当</th>
              <th>ステータス</th>
              <th className="r">概算</th>
            </tr>
          </thead>
          <tbody>
            {reservations.map((r) => (
              <tr key={r.id} className="row-link" onClick={() => go("job:" + r.id)}>
                <td className="mono">{r.id}</td>
                <td>{r.customer}</td>
                <td>{r.vehicle}</td>
                <td className="truncate">{r.service}</td>
                <td className="mono">{r.time.slice(5)}</td>
                <td>{r.staff}</td>
                <td>
                  <StatusBadge status={r.status} />
                </td>
                <td className="num">{yen(r.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function JobWorkflow({ id, go }: { id?: string; go: Go }) {
  const r = reservations.find((x) => x.id === id) || reservations[0];
  const [tab, setTab] = useState("summary");
  const steps = [
    { k: "confirmed", l: "予約確定" },
    { k: "arrived", l: "来店" },
    { k: "in_progress", l: "作業中" },
    { k: "completed", l: "完了" },
  ];
  const curIdx = steps.findIndex((s) => s.k === r.status);
  const tabs: TabItem[] = [
    { id: "summary", label: "サマリ" },
    { id: "cv", label: "顧客・車両" },
    { id: "cert", label: "証明書" },
    { id: "bill", label: "請求・見積" },
  ];
  return (
    <div className="screen">
      <button className="back" onClick={() => go("jobs")}>
        ← 案件一覧
      </button>
      <PageHeader
        eyebrow={"admin · 案件 · " + r.id}
        title={r.service}
        desc={`${r.customer} · ${r.vehicle} · ${r.time}`}
      />

      <div className="stepper">
        {steps.map((s, i) => (
          <div key={s.k} className={"step" + (i < curIdx ? " done" : "") + (i === curIdx ? " current" : "")}>
            <div className="step-dot">{i < curIdx ? <Icon name="check" size={13} sw={2.5} /> : i + 1}</div>
            <div className="step-label">{s.l}</div>
            {i < steps.length - 1 && <div className="step-line" />}
          </div>
        ))}
        {curIdx < steps.length - 1 && (
          <Btn variant="primary" style={{ marginLeft: "auto" }}>
            {steps[curIdx + 1].l}へ進める →
          </Btn>
        )}
      </div>

      <div className="next-actions">
        <button className="na" onClick={() => go("certificates")}>
          <span>🪪</span>証明書を発行
        </button>
        <button className="na" onClick={() => go("invoices")}>
          <span>💰</span>請求書を作成
        </button>
        <button className="na" onClick={() => go("customers")}>
          <span>👤</span>顧客詳細
        </button>
        <button className="na" onClick={() => go("vehicles")}>
          <span>🚗</span>車両詳細
        </button>
      </div>

      <Tabs tabs={tabs} active={tab} onChange={setTab} />
      <Card>
        {tab === "summary" && (
          <div className="kv-grid">
            <div>
              <span>予約日時</span>
              <b className="mono">{r.time}</b>
            </div>
            <div>
              <span>概算金額</span>
              <b>{yen(r.amount)}</b>
            </div>
            <div>
              <span>担当</span>
              <b>{r.staff}</b>
            </div>
            <div>
              <span>ステータス</span>
              <b>
                <StatusBadge status={r.status} />
              </b>
            </div>
            <div className="kv-full">
              <span>作業メニュー</span>
              <ul className="menu-list">
                {jobMenu.map((m, i) => (
                  <li key={i}>
                    <Icon name="check" size={14} />
                    {m.name}
                    <em>{m.min}分</em>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
        {tab === "cv" && (
          <div className="two-col-even">
            <div className="info-card">
              <div className="ic-h">顧客</div>
              <b>{r.customer}</b>
              <div className="ic-sub">過去施工 5件 · LTV ¥412,000</div>
            </div>
            <div className="info-card">
              <div className="ic-h">車両</div>
              <b>{r.vehicle}</b>
              <div className="ic-sub mono">名古屋 300 あ 12-34</div>
            </div>
          </div>
        )}
        {tab === "cert" && (
          <EmptyState
            icon="doc"
            title="この車両の証明書"
            desc="紐付く証明書が3件あります"
            action={
              <Btn variant="primary" onClick={() => go("certificates")}>
                証明書を表示
              </Btn>
            }
          />
        )}
        {tab === "bill" && (
          <EmptyState
            icon="yen"
            title="請求・見積"
            desc="まだ請求書がありません"
            action={<Btn variant="primary">請求書を作成</Btn>}
          />
        )}
      </Card>
    </div>
  );
}

function Customers({ go }: { go: Go }) {
  return (
    <div className="screen">
      <PageHeader
        eyebrow="admin · 顧客"
        title="顧客管理"
        desc={`${kpi.customers}名の顧客 · リピート率 ${kpi.repeatRate}%`}
        actions={
          <Btn variant="primary" icon="plus">
            顧客を追加
          </Btn>
        }
      />
      <Card>
        <table>
          <thead>
            <tr>
              <th>顧客</th>
              <th>区分</th>
              <th>連絡先</th>
              <th>車両</th>
              <th>証明書</th>
              <th className="r">LTV</th>
              <th>タグ</th>
            </tr>
          </thead>
          <tbody>
            {customers.map((c) => (
              <tr key={c.id} className="row-link" onClick={() => go("customer:" + c.id)}>
                <td>
                  <b>{c.name}</b>
                  <div className="cell-sub">{c.kana}</div>
                </td>
                <td>
                  <Badge tone={c.type === "法人" ? "info" : "muted"}>{c.type}</Badge>
                </td>
                <td className="mono cell-sub">{c.phone}</td>
                <td className="num">{c.vehicles}</td>
                <td className="num">{c.certs}</td>
                <td className="num">{yen(c.ltv)}</td>
                <td>
                  <div className="tags">
                    {c.tags.map((t, i) => (
                      <span key={i} className={"tag" + (t === "チャーンリスク" ? " risk" : t === "VIP" ? " vip" : "")}>
                        {t}
                      </span>
                    ))}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function Customer360({ id, go }: { id?: string; go: Go }) {
  const c = customers.find((x) => x.id === id) || customers[0];
  const [tab, setTab] = useState("vehicles");
  const myVehicles = vehicles.filter((v) => v.customer === c.name);
  const myCerts = certs.filter((x) => x.customer === c.name);
  const myRes = reservations.filter((x) => x.customer === c.name);
  const myInv = invoices.filter((x) => x.customer === c.name);
  const tabs: TabItem[] = [
    { id: "vehicles", label: "車両", count: myVehicles.length },
    { id: "certs", label: "証明書", count: myCerts.length },
    { id: "res", label: "予約・案件", count: myRes.length },
    { id: "inv", label: "請求", count: myInv.length },
  ];
  return (
    <div className="screen">
      <button className="back" onClick={() => go("customers")}>
        ← 顧客一覧
      </button>
      <div className="cust-head">
        <Avatar initials={c.name.slice(0, 1)} size={52} />
        <div className="cust-head-info">
          <h1>{c.name}</h1>
          <div className="cust-meta">
            <Badge tone={c.type === "法人" ? "info" : "muted"}>{c.type}</Badge>
            <span className="mono">{c.phone}</span>
            <span>{c.email}</span>
            <span>登録 {c.since}</span>
          </div>
        </div>
        <div className="cust-stats">
          <div>
            <div className="cs-num">{yen(c.ltv)}</div>
            <div className="cs-lbl">LTV</div>
          </div>
          <div>
            <div className="cs-num">{c.certs}</div>
            <div className="cs-lbl">証明書</div>
          </div>
        </div>
      </div>
      <div className="cust-tabbar">
        <Tabs tabs={tabs} active={tab} onChange={setTab} />
        <div className="cust-quick">
          <Btn icon="plus">車両登録</Btn>
          <Btn>🪪 証明書発行</Btn>
          <Btn>🏃 飛び込み</Btn>
          <Btn variant="primary">💰 請求書作成</Btn>
        </div>
      </div>
      <Card>
        {tab === "vehicles" &&
          (myVehicles.length ? (
            <table>
              <thead>
                <tr>
                  <th>車両</th>
                  <th>グレード</th>
                  <th>ナンバー</th>
                  <th>年式</th>
                  <th>VIN</th>
                  <th>NFC</th>
                </tr>
              </thead>
              <tbody>
                {myVehicles.map((v) => (
                  <tr key={v.id} className="row-link" onClick={() => go("vehicle:" + v.id)}>
                    <td>
                      <b>
                        {v.maker} {v.model}
                      </b>
                    </td>
                    <td>{v.grade}</td>
                    <td className="mono">{v.plate}</td>
                    <td>{v.year}</td>
                    <td className="mono cell-sub">{v.vin}</td>
                    <td>{v.nfc ? <Badge tone="success">登録</Badge> : <span className="cell-sub">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <EmptyState icon="car" title="車両がありません" action={<Btn variant="primary">車両を登録</Btn>} />
          ))}
        {tab === "certs" &&
          (myCerts.length ? (
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>施工内容</th>
                  <th>発行日</th>
                  <th>ステータス</th>
                  <th className="r">金額</th>
                </tr>
              </thead>
              <tbody>
                {myCerts.map((x) => (
                  <tr key={x.id} className="row-link" onClick={() => go("cert:" + x.id)}>
                    <td className="mono">{x.id}</td>
                    <td className="truncate">{x.service}</td>
                    <td className="mono">{x.date.slice(0, 10)}</td>
                    <td>
                      <StatusBadge status={x.status} />
                    </td>
                    <td className="num">{yen(x.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <EmptyState icon="doc" title="証明書がありません" />
          ))}
        {tab === "res" &&
          (myRes.length ? (
            <table>
              <thead>
                <tr>
                  <th>案件ID</th>
                  <th>内容</th>
                  <th>予定</th>
                  <th>ステータス</th>
                </tr>
              </thead>
              <tbody>
                {myRes.map((x) => (
                  <tr key={x.id} className="row-link" onClick={() => go("job:" + x.id)}>
                    <td className="mono">{x.id}</td>
                    <td>{x.service}</td>
                    <td className="mono">{x.time.slice(5)}</td>
                    <td>
                      <StatusBadge status={x.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <EmptyState icon="cal" title="予約・案件がありません" />
          ))}
        {tab === "inv" &&
          (myInv.length ? (
            <table>
              <thead>
                <tr>
                  <th>請求ID</th>
                  <th>発行</th>
                  <th>期限</th>
                  <th>ステータス</th>
                  <th className="r">金額</th>
                </tr>
              </thead>
              <tbody>
                {myInv.map((x) => (
                  <tr key={x.id} className="row-link" onClick={() => go("invoices")}>
                    <td className="mono">{x.id}</td>
                    <td className="mono">{x.issued}</td>
                    <td className="mono">{x.due}</td>
                    <td>
                      <StatusBadge status={x.status} />
                    </td>
                    <td className="num">{yen(x.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <EmptyState icon="yen" title="請求がありません" />
          ))}
      </Card>
    </div>
  );
}

function Vehicles({ go }: { go: Go }) {
  return (
    <div className="screen">
      <PageHeader
        eyebrow="admin · 業務"
        title="車両管理"
        desc={`${vehicles.length}台登録 · 車検証OCR対応`}
        actions={
          <Fragment>
            <Btn icon="download">CSVインポート</Btn>
            <Btn variant="primary" icon="plus">
              車両を登録
            </Btn>
          </Fragment>
        }
      />
      <Card>
        <table>
          <thead>
            <tr>
              <th>車両</th>
              <th>所有者</th>
              <th>ナンバー</th>
              <th>年式</th>
              <th>サイズ</th>
              <th>VIN</th>
              <th>証明書</th>
              <th>NFC</th>
            </tr>
          </thead>
          <tbody>
            {vehicles.map((v) => (
              <tr key={v.id} className="row-link" onClick={() => go("vehicle:" + v.id)}>
                <td>
                  <b>
                    {v.maker} {v.model}
                  </b>
                  <div className="cell-sub">{v.color}</div>
                </td>
                <td>{v.customer}</td>
                <td className="mono">{v.plate}</td>
                <td>{v.year}</td>
                <td>
                  <Badge tone="muted">{v.size}</Badge>
                </td>
                <td className="mono cell-sub">{v.vin}</td>
                <td className="num">{v.certs}</td>
                <td>{v.nfc ? <Badge tone="success">登録</Badge> : <span className="cell-sub">—</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function VehicleTimeline({ id, go }: { id?: string; go: Go }) {
  const v = vehicles.find((x) => x.id === id) || vehicles[0];
  const events: { type: string; icon: string; color: string; title: string; meta: string; to?: string }[] = [
    {
      type: "cert",
      icon: "🪪",
      color: "var(--accent-blue)",
      title: "ボディコーティング 証明書発行",
      meta: "cert_01HXYZ7A · 2026-06-18",
      to: "cert:cert_01HXYZ7A",
    },
    { type: "job", icon: "🔧", color: "var(--accent-amber)", title: "作業完了", meta: "山田 · 2026-06-18 13:40" },
    { type: "job", icon: "🚪", color: "var(--accent-emerald)", title: "来店・受付", meta: "2026-06-18 10:00" },
    {
      type: "nfc",
      icon: "🪧",
      color: "var(--accent-violet)",
      title: "NFCタグ書き込み",
      meta: "SKU-NFC-T1 · 2026-05-02",
    },
    {
      type: "cert",
      icon: "🪪",
      color: "var(--accent-blue)",
      title: "ホイールコーティング 証明書発行",
      meta: "cert_01HXYX9K · 2026-03-12",
      to: "cert:cert_01HXYX9K",
    },
  ];
  return (
    <div className="screen">
      <button className="back" onClick={() => go("vehicles")}>
        ← 車両一覧
      </button>
      <PageHeader
        eyebrow={"admin · 車両 · " + v.id}
        title={`${v.maker} ${v.model}`}
        desc={`${v.grade} · ${v.plate} · ${v.year}年 · ${v.color}`}
        actions={
          <Fragment>
            <Btn icon="edit">編集</Btn>
            <Btn variant="primary">🪪 証明書発行</Btn>
          </Fragment>
        }
      />
      <div className="detail-grid">
        <div className="detail-main">
          <Card eyebrow="service history" title="統合サービス履歴タイムライン">
            <div className="timeline">
              {events.map((e, i) => (
                <div className={"tl-item" + (e.to ? " clickable" : "")} key={i} onClick={() => e.to && go(e.to)}>
                  <div className="tl-dot" style={{ background: e.color }}>
                    {e.icon}
                  </div>
                  <div className="tl-body">
                    <div className="tl-title">{e.title}</div>
                    <div className="tl-meta mono">{e.meta}</div>
                  </div>
                  {e.to && <Icon name="chevR" size={16} style={{ color: "var(--text-muted)" }} />}
                </div>
              ))}
            </div>
          </Card>
        </div>
        <div className="detail-rail">
          <Card title="車両情報">
            <div className="kv-list">
              <div>
                <span>メーカー</span>
                <b>{v.maker}</b>
              </div>
              <div>
                <span>車台番号</span>
                <b className="mono">{v.vin}</b>
              </div>
              <div>
                <span>サイズ区分</span>
                <b>{v.size}</b>
              </div>
              <div>
                <span>証明書</span>
                <b>{v.certs}件</b>
              </div>
            </div>
          </Card>
          <Card title="NFCタグ">
            {v.nfc ? (
              <div className="chain-row">
                <Icon name="link" size={16} />
                <div>
                  <div className="chain-t">SKU-NFC-T1 紐付け済</div>
                  <div className="chain-m mono">書込日 2026-05-02</div>
                </div>
              </div>
            ) : (
              <EmptyState icon="link" title="NFC未登録" action={<Btn>タグを紐付け</Btn>} />
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// Secondary screens + scaffold — ledra-screens-more.jsx
// ════════════════════════════════════════════════════════════
function Invoices() {
  const total = invoices.reduce((a, i) => a + i.amount, 0);
  const open = invoices.filter((i) => i.status === "sent" || i.status === "overdue").reduce((a, i) => a + i.amount, 0);
  return (
    <div className="screen">
      <PageHeader
        eyebrow="admin · 売上・経営"
        title="請求・帳票"
        desc="請求書・見積書・領収書・納品書を管理"
        actions={
          <Fragment>
            <Btn icon="download">エクスポート</Btn>
            <Btn variant="primary" icon="plus">
              請求書を作成
            </Btn>
          </Fragment>
        }
      />
      <div className="stats">
        <div className="stat">
          <div className="lbl">total billed</div>
          <div className="num">{yen(total)}</div>
        </div>
        <div className="stat">
          <div className="lbl">outstanding</div>
          <div className="num danger">{yen(open)}</div>
          <div className="sub">未回収・期限超過</div>
        </div>
        <div className="stat">
          <div className="lbl">paid (month)</div>
          <div className="num">
            {yen(invoices.filter((i) => i.status === "paid").reduce((a, i) => a + i.amount, 0))}
          </div>
        </div>
        <div className="stat">
          <div className="lbl">drafts</div>
          <div className="num">{invoices.filter((i) => i.status === "draft").length}</div>
        </div>
      </div>
      <Card>
        <table>
          <thead>
            <tr>
              <th>請求ID</th>
              <th>顧客</th>
              <th>発行日</th>
              <th>支払期限</th>
              <th>ステータス</th>
              <th className="r">金額</th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((i) => (
              <tr key={i.id} className="row-link">
                <td className="mono">{i.id}</td>
                <td>{i.customer}</td>
                <td className="mono">{i.issued}</td>
                <td className="mono">{i.due}</td>
                <td>
                  <StatusBadge status={i.status} />
                </td>
                <td className="num">{yen(i.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function ReservationsScreen({ go }: { go: Go }) {
  return (
    <div className="screen">
      <PageHeader
        eyebrow="admin · 業務"
        title="予約管理"
        desc="確認済 → 来店 → 作業中 → 完了"
        actions={
          <Fragment>
            <Btn icon="cal">Google Calendar</Btn>
            <Btn variant="primary" icon="plus">
              🏃 飛び込み案件
            </Btn>
          </Fragment>
        }
      />
      <Card>
        <table>
          <thead>
            <tr>
              <th>予約ID</th>
              <th>顧客</th>
              <th>車両</th>
              <th>内容</th>
              <th>予定日時</th>
              <th>担当</th>
              <th>ステータス</th>
            </tr>
          </thead>
          <tbody>
            {reservations.map((r) => (
              <tr key={r.id} className="row-link" onClick={() => go("job:" + r.id)}>
                <td className="mono">{r.id}</td>
                <td>{r.customer}</td>
                <td>{r.vehicle}</td>
                <td className="truncate">{r.service}</td>
                <td className="mono">{r.time}</td>
                <td>{r.staff}</td>
                <td>
                  <StatusBadge status={r.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function POS() {
  return (
    <div className="screen">
      <PageHeader
        eyebrow="admin · 売上・経営"
        title="POS会計"
        desc="レジセッション · Stripe Terminal · Apple Tap to Pay · QR決済"
      />
      <div className="pos-layout">
        <Card title="会計（チェックアウト）">
          <div className="pos-cart">
            <div className="pos-line">
              <span>セラミックコーティング（プロ施工）</span>
              <b>{yen(165000)}</b>
            </div>
            <div className="pos-line">
              <span>ホイールコーティング</span>
              <b>{yen(18000)}</b>
            </div>
            <div className="pos-line sub">
              <span>小計</span>
              <b>{yen(183000)}</b>
            </div>
            <div className="pos-line sub">
              <span>消費税 (10%)</span>
              <b>{yen(18300)}</b>
            </div>
            <div className="pos-line total">
              <span>合計</span>
              <b>{yen(201300)}</b>
            </div>
          </div>
          <div className="pos-pay">
            <button className="pay-btn">
              <span>💳</span>カード
            </button>
            <button className="pay-btn">
              <span>📱</span>Tap to Pay
            </button>
            <button className="pay-btn">
              <span>🔳</span>QR決済
            </button>
            <button className="pay-btn">
              <span>💴</span>現金
            </button>
          </div>
        </Card>
        <div className="rail">
          <Card title="レジセッション">
            <div className="kv-list">
              <div>
                <span>状態</span>
                <b>
                  <Badge tone="success">開局中</Badge>
                </b>
              </div>
              <div>
                <span>開局時刻</span>
                <b className="mono">09:00</b>
              </div>
              <div>
                <span>本日売上</span>
                <b>{yen(428600)}</b>
              </div>
              <div>
                <span>取引数</span>
                <b>12件</b>
              </div>
            </div>
          </Card>
          <Card title="日次レポート">
            <Sparkbars data={[3, 5, 2, 6, 4, 8, 5]} height={70} labels={["10", "11", "12", "13", "14", "15", "16"]} />
          </Card>
        </div>
      </div>
    </div>
  );
}

function Inventory() {
  const lowCount = inventory.filter((i) => i.low).length;
  return (
    <div className="screen">
      <PageHeader
        eyebrow="admin · 業務"
        title="在庫管理"
        desc={`SKU ${inventory.length}件 · 低在庫 ${lowCount}件`}
        actions={
          <Fragment>
            <Btn icon="filter">低在庫のみ</Btn>
            <Btn variant="primary" icon="plus">
              入出庫を記録
            </Btn>
          </Fragment>
        }
      />
      <Card>
        <table>
          <thead>
            <tr>
              <th>SKU</th>
              <th>名称</th>
              <th>カテゴリ</th>
              <th className="r">現在庫</th>
              <th className="r">最小</th>
              <th className="r">在庫価値</th>
              <th>状態</th>
            </tr>
          </thead>
          <tbody>
            {inventory.map((it) => (
              <tr key={it.sku} className="row-link">
                <td className="mono">{it.sku}</td>
                <td>{it.name}</td>
                <td>
                  <Badge tone="muted">{it.cat}</Badge>
                </td>
                <td className="num">{it.qty}</td>
                <td className="num cell-sub">{it.min}</td>
                <td className="num">{yen(it.value)}</td>
                <td>{it.low ? <Badge tone="warn">低在庫</Badge> : <Badge tone="success">十分</Badge>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function Management() {
  return (
    <div className="screen">
      <PageHeader eyebrow="admin · 売上・経営" title="経営分析" desc="売上推移・証明書発行数・顧客単価・リピート率" />
      <div className="stats">
        <div className="stat">
          <div className="lbl">monthly revenue</div>
          <div className="num">{yen(3840000)}</div>
          <div className="trend">
            <Icon name="trend" size={12} sw={2} /> +8.2%
          </div>
        </div>
        <div className="stat">
          <div className="lbl">avg ticket</div>
          <div className="num">{yen(64200)}</div>
        </div>
        <div className="stat">
          <div className="lbl">repeat rate</div>
          <div className="num">{kpi.repeatRate}%</div>
        </div>
        <div className="stat">
          <div className="lbl">LTV (avg)</div>
          <div className="num">{yen(212000)}</div>
        </div>
      </div>
      <div className="two-col">
        <Card eyebrow="last 30 days" title="証明書発行推移">
          <Sparkbars data={trend30} height={160} />
        </Card>
        <Card eyebrow="mix" title="施工種別構成">
          <div className="donut-row">
            <Donut
              segments={[
                { value: 42, color: "var(--accent-blue)" },
                { value: 28, color: "var(--accent-emerald)" },
                { value: 18, color: "var(--accent-violet)" },
                { value: 12, color: "var(--accent-amber)" },
              ]}
            />
            <div className="legend">
              <div>
                <span className="dot" style={{ background: "var(--accent-blue)" }} />
                コーティング <b>42%</b>
              </div>
              <div>
                <span className="dot" style={{ background: "var(--accent-emerald)" }} />
                フィルム <b>28%</b>
              </div>
              <div>
                <span className="dot" style={{ background: "var(--accent-violet)" }} />
                ラッピング <b>18%</b>
              </div>
              <div>
                <span className="dot" style={{ background: "var(--accent-amber)" }} />
                その他 <b>12%</b>
              </div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

function Accounting() {
  return (
    <div className="screen">
      <PageHeader
        eyebrow="admin · 売上・経営"
        title="会計連携"
        desc="freee / マネーフォワード と連携し、入金済請求書を自動仕訳化"
      />
      <div className="two-col-even">
        <div className="connect-card">
          <div className="cc-logo">freee</div>
          <div className="cc-status">
            <Badge tone="success">連携中</Badge>
          </div>
          <div className="cc-desc">入金済請求書を売上仕訳として日次3回 自動連携</div>
          <Btn>設定を編集</Btn>
        </div>
        <div className="connect-card">
          <div className="cc-logo">マネーフォワード</div>
          <div className="cc-status">
            <Badge tone="muted">未連携</Badge>
          </div>
          <div className="cc-desc">OAuth でアカウントを接続すると自動同期できます</div>
          <Btn variant="primary">接続する</Btn>
        </div>
      </div>
      <Card eyebrow="last 30 days" title="同期統計">
        <div className="stats" style={{ marginBottom: 0 }}>
          <div className="stat">
            <div className="lbl">success</div>
            <div className="num">142</div>
          </div>
          <div className="stat">
            <div className="lbl">failed</div>
            <div className="num danger">3</div>
          </div>
          <div className="stat">
            <div className="lbl">default account</div>
            <div className="num" style={{ fontSize: 18 }}>
              売上高
            </div>
          </div>
          <div className="stat">
            <div className="lbl">tax rate</div>
            <div className="num" style={{ fontSize: 18 }}>
              10%
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}

function Security() {
  const [enabled, setEnabled] = useState(false);
  return (
    <div className="screen">
      <PageHeader eyebrow="admin · 設定" title="セキュリティ" desc="2要素認証 (TOTP) でアカウントを保護します" />
      <div className="detail-grid">
        <div className="detail-main">
          <Card title="2要素認証 (TOTP)">
            <div className="twofa">
              <div className="twofa-state">
                <Icon name="shield" size={20} />
                <div>
                  <b>{enabled ? "2要素認証は有効です" : "2要素認証は無効です"}</b>
                  <div className="cell-sub">Google Authenticator / 1Password / Authy などで6桁コードを生成</div>
                </div>
                <Btn variant={enabled ? "secondary" : "primary"} onClick={() => setEnabled(!enabled)}>
                  {enabled ? "解除" : "有効化"}
                </Btn>
              </div>
              {!enabled && (
                <div className="twofa-setup">
                  <div className="qr-box">
                    <Icon name="qr" size={88} />
                  </div>
                  <div className="twofa-steps">
                    <div>1. 認証アプリで左のQRを読み取る</div>
                    <div>2. 表示された6桁コードを入力</div>
                    <Field label="検証コード">
                      <input className="input" placeholder="000 000" />
                    </Field>
                  </div>
                </div>
              )}
            </div>
          </Card>
        </div>
        <div className="detail-rail">
          <Card title="ログインセッション">
            <div className="kv-list">
              <div>
                <span>現在の端末</span>
                <b>Mac · 名古屋</b>
              </div>
              <div>
                <span>最終ログイン</span>
                <b className="mono">今</b>
              </div>
            </div>
          </Card>
          <Card title="自動ログアウト">
            <div className="kv-list">
              <div>
                <span>アイドル時間</span>
                <b>30分</b>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

// Generic scaffold for the long tail (no dead ends)
function Scaffold({ route }: { route: string }) {
  const meta = routeMeta[route] || { title: route, eyebrow: "admin", desc: "" };
  return (
    <div className="screen">
      <PageHeader
        eyebrow={meta.eyebrow}
        title={meta.title}
        desc={meta.desc}
        actions={
          <Btn variant="primary" icon="plus">
            新規作成
          </Btn>
        }
      />
      <div className="toolbar">
        <div className="seg">
          <button className="active">一覧</button>
          <button>分析</button>
          <button>設定</button>
        </div>
        <div className="toolbar-right">
          <button className="search inline">
            <Icon name="search" size={15} />
            <span>検索</span>
          </button>
          <Btn icon="filter">フィルタ</Btn>
        </div>
      </div>
      <div className="scaffold-grid">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div className="scaffold-card" key={i}>
            <div className="sc-row">
              <div className="sc-ico">
                <Icon name="doc" size={18} />
              </div>
              <Badge tone={(["info", "success", "warn", "muted"] as Tone[])[i % 4]}>
                {["処理中", "完了", "保留", "下書き"][i % 4]}
              </Badge>
            </div>
            <div className="sc-title">
              {meta.title} 項目 {i + 1}
            </div>
            <div className="sc-meta mono">
              ID · {route}_{1000 + i * 7}
            </div>
            <div className="sc-foot">
              <span className="cell-sub">2026-06-{String(20 - i).padStart(2, "0")}</span>
              <Btn variant="ghost">詳細 →</Btn>
            </div>
          </div>
        ))}
      </div>
      <div className="scaffold-note">
        <Icon name="trend" size={15} />
        この画面はプロトタイプのスカフォルドです。実装では <b>{meta.title}</b> 専用のUI（{meta.desc}）が入ります。
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// App — hash router (matches the original prototype routing)
// ════════════════════════════════════════════════════════════
function parseHash(): string {
  if (typeof window === "undefined") return "dashboard";
  const h = (window.location.hash || "#dashboard").slice(1);
  return h || "dashboard";
}

export default function LedraPrototype() {
  // Start on "dashboard" for SSR + first client render to avoid hydration
  // mismatch; sync to the real hash after mount.
  const [route, setRoute] = useState("dashboard");

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: sync route to window.location.hash after mount (SSR-safe)
    setRoute(parseHash());
    const onHash = () => {
      setRoute(parseHash());
      window.scrollTo(0, 0);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const go: Go = (r) => {
    window.location.hash = r;
  };

  const [base, arg] = route.split(":");
  let screen: ReactNode;
  switch (base) {
    case "dashboard":
      screen = <Dashboard go={go} />;
      break;
    case "certificates":
      screen = <Certificates go={go} />;
      break;
    case "cert":
      screen = <CertDetail id={arg} go={go} />;
      break;
    case "jobs":
      screen = <Jobs go={go} />;
      break;
    case "job":
      screen = <JobWorkflow id={arg} go={go} />;
      break;
    case "customers":
      screen = <Customers go={go} />;
      break;
    case "customer":
      screen = <Customer360 id={arg} go={go} />;
      break;
    case "vehicles":
      screen = <Vehicles go={go} />;
      break;
    case "vehicle":
      screen = <VehicleTimeline id={arg} go={go} />;
      break;
    case "invoices":
      screen = <Invoices />;
      break;
    case "reservations":
      screen = <ReservationsScreen go={go} />;
      break;
    case "pos":
      screen = <POS />;
      break;
    case "inventory":
      screen = <Inventory />;
      break;
    case "management":
      screen = <Management />;
      break;
    case "accounting":
      screen = <Accounting />;
      break;
    case "security":
      screen = <Security />;
      break;
    default:
      screen = <Scaffold route={base} />;
  }

  // active sidebar item: map detail routes back to their list
  const activeMap: Record<string, string> = {
    cert: "certificates",
    job: "jobs",
    customer: "customers",
    vehicle: "vehicles",
  };
  const activeRoute = activeMap[base] || base;

  return (
    <Shell route={activeRoute} go={go}>
      {screen}
    </Shell>
  );
}
