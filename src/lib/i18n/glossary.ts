/**
 * 自動車ドメイン翻訳用語集(IMP-011)。
 *
 * AI 翻訳(translateContent.ts)の glossary パラメータや人間翻訳者の参照用。
 * マーケティング用語集(src/lib/marketing/glossary.ts)とは別物 — あちらは
 * SEO コンテンツ(日本語のみ)、こちらは多言語翻訳の一貫性のための用語対応表。
 *
 * vi/id/fil/hi は推定翻訳。正式検証は IMP-051。
 */
import type { Locale } from "./locales";

export type AutoGlossaryEntry = {
  /** 原語(日本語) */
  ja: string;
  en: string;
  vi?: string;
  id?: string;
  fil?: string;
  hi?: string;
};

// ponytail: フラットな配列で十分。カテゴリ分けは呼び出し側の責任。
export const AUTO_GLOSSARY: AutoGlossaryEntry[] = [
  // ── 施工・整備 ──
  {
    ja: "施工証明書",
    en: "Workmanship Certificate",
    vi: "Giấy chứng nhận thi công",
    id: "Sertifikat Pengerjaan",
    fil: "Sertipiko ng Pagkakagawa",
    hi: "कार्य प्रमाणपत्र",
  },
  { ja: "コーティング", en: "Coating", vi: "Phủ", id: "Coating", fil: "Coating", hi: "कोटिंग" },
  {
    ja: "ガラスコーティング",
    en: "Glass Coating",
    vi: "Phủ thủy tinh",
    id: "Glass Coating",
    fil: "Glass Coating",
    hi: "ग्लास कोटिंग",
  },
  {
    ja: "セラミックコーティング",
    en: "Ceramic Coating",
    vi: "Phủ ceramic",
    id: "Ceramic Coating",
    fil: "Ceramic Coating",
    hi: "सिरेमिक कोटिंग",
  },
  {
    ja: "PPF",
    en: "Paint Protection Film",
    vi: "Phim bảo vệ sơn",
    id: "Film Pelindung Cat",
    fil: "Paint Protection Film",
    hi: "पेंट प्रोटेक्शन फ़िल्म",
  },
  {
    ja: "板金塗装",
    en: "Bodywork & Painting",
    vi: "Gò và sơn",
    id: "Perbaikan Bodi & Pengecatan",
    fil: "Bodywork at Pagpipinta",
    hi: "बॉडी मरम्मत और पेंटिंग",
  },
  {
    ja: "膜厚",
    en: "Film Thickness",
    vi: "Độ dày màng",
    id: "Ketebalan Film",
    fil: "Kapal ng Film",
    hi: "फ़िल्म मोटाई",
  },
  { ja: "再塗装", en: "Repaint", vi: "Sơn lại", id: "Pengecatan Ulang", fil: "Muling Pagpipinta", hi: "दोबारा पेंट" },
  { ja: "磨き", en: "Polishing", vi: "Đánh bóng", id: "Poles", fil: "Pagpapakintab", hi: "पॉलिशिंग" },
  {
    ja: "修復歴",
    en: "Repair History",
    vi: "Lịch sử sửa chữa",
    id: "Riwayat Perbaikan",
    fil: "Kasaysayan ng Pagkukumpuni",
    hi: "मरम्मत इतिहास",
  },
  // ── 保険・査定 ──
  { ja: "査定", en: "Assessment", vi: "Định giá", id: "Penilaian", fil: "Pagtatasa", hi: "आकलन" },
  {
    ja: "車両保険",
    en: "Vehicle Insurance",
    vi: "Bảo hiểm xe",
    id: "Asuransi Kendaraan",
    fil: "Seguro ng Sasakyan",
    hi: "वाहन बीमा",
  },
  // ── 技術 ──
  { ja: "車台番号", en: "VIN", vi: "Số khung xe", id: "Nomor Rangka", fil: "VIN", hi: "वाहन पहचान संख्या" },
  { ja: "ブロックチェーン", en: "Blockchain", vi: "Blockchain", id: "Blockchain", fil: "Blockchain", hi: "ब्लॉकचेन" },
  {
    ja: "電子署名",
    en: "Digital Signature",
    vi: "Chữ ký điện tử",
    id: "Tanda Tangan Digital",
    fil: "Digital na Lagda",
    hi: "डिजिटल हस्ताक्षर",
  },
  { ja: "ハッシュ値", en: "Hash", vi: "Giá trị hash", id: "Nilai Hash", fil: "Hash Value", hi: "हैश मान" },
  { ja: "タイムスタンプ", en: "Timestamp", vi: "Dấu thời gian", id: "Cap Waktu", fil: "Timestamp", hi: "टाइमस्टैम्प" },
  { ja: "QRコード", en: "QR Code", vi: "Mã QR", id: "Kode QR", fil: "QR Code", hi: "QR कोड" },
  { ja: "NFC", en: "NFC", vi: "NFC", id: "NFC", fil: "NFC", hi: "NFC" },
  // ── Ledra ドメイン用語 ──
  { ja: "作業", en: "Job", vi: "Công việc", id: "Pekerjaan", fil: "Trabaho", hi: "कार्य" },
  { ja: "工程", en: "Step", vi: "Bước", id: "Langkah", fil: "Hakbang", hi: "चरण" },
  { ja: "証明書", en: "Certificate", vi: "Chứng nhận", id: "Sertifikat", fil: "Sertipiko", hi: "प्रमाणपत्र" },
  { ja: "見積書", en: "Estimate", vi: "Báo giá", id: "Estimasi", fil: "Pagtatantya", hi: "अनुमान" },
  { ja: "請求書", en: "Invoice", vi: "Hóa đơn", id: "Faktur", fil: "Invoice", hi: "चालान" },
  { ja: "入庫", en: "Check-in", vi: "Nhận xe", id: "Check-in", fil: "Check-in", hi: "चेक-इन" },
  { ja: "施工者", en: "Technician", vi: "Kỹ thuật viên", id: "Teknisi", fil: "Teknisyan", hi: "तकनीशियन" },
  { ja: "顧客", en: "Customer", vi: "Khách hàng", id: "Pelanggan", fil: "Kustomer", hi: "ग्राहक" },
  { ja: "店舗", en: "Shop", vi: "Cửa hàng", id: "Bengkel", fil: "Tindahan", hi: "दुकान" },
];

/**
 * 指定ロケールの ja→target 翻訳マップを返す。
 * translateContent.ts の glossary パラメータにそのまま渡せる形式。
 * target にエントリがない場合は en にフォールバック。
 */
export function getGlossaryForLocale(locale: Locale): Record<string, string> {
  if (locale === "ja") {
    // ja→ja は恒等。空を返して translateContent 側の不要な置換を防ぐ。
    return {};
  }
  const result: Record<string, string> = {};
  for (const entry of AUTO_GLOSSARY) {
    const target = (entry as Record<string, string | undefined>)[locale] ?? entry.en;
    result[entry.ja] = target;
  }
  return result;
}
