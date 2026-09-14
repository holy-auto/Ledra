/**
 * 正準ドメイン状態のロケール別 UI ラベル(IMP-001 作成、IMP-011 で 6 言語化)。
 *
 * ドメインコード(大文字の正準値)は翻訳・表示の都合で変更しない。表示文言は
 * このラベルマップだけを差し替える(v2.0 §17、docs/adr/0002)。
 * ja のラベルは v2.0 Appendix A の表記に従う。PaymentState は Appendix A に無いため
 * §11.2 の Meaning 列を基にし、PENDING・PAID・UNKNOWN は表示用に短縮した
 * (「処理中 / 確認中」→「処理中」等。意味論の正はコードコメントと ADR 側)。
 * StepState / SyncState は仕様書に UI ラベルの定義がないため、本実装で定めた
 * (仕様引用ではない)。
 *
 * vi/id/fil/hi ラベルは IMP-011 でベストエフォート翻訳。正式検証は IMP-051。
 */
import type {
  CertificateState,
  DocumentCorrectionState,
  JobState,
  PartInstallationState,
  PaymentState,
  Severity,
  StepState,
  SyncState,
} from "./states";
import { SUPPORTED_LOCALES, DEFAULT_LOCALE, type Locale } from "@/lib/i18n/locales";

/** ロケール定義源は src/lib/i18n/locales.ts に統一(IMP-011)。後方互換のため再エクスポート。 */
export const DOMAIN_LOCALES = SUPPORTED_LOCALES;
export type DomainLocale = Locale;
export const DEFAULT_DOMAIN_LOCALE = DEFAULT_LOCALE;

type LabelMaps<T extends string> = { readonly ja: Record<T, string> } & Partial<
  Record<DomainLocale, Record<T, string>>
>;

const JOB_STATE_LABELS: LabelMaps<JobState> = {
  ja: {
    SCHEDULED: "予定",
    CHECKED_IN: "入庫済み",
    IN_PROGRESS: "作業中",
    PAUSED: "中断中",
    WAITING_REVIEW: "確認待ち",
    WAITING_CUSTOMER: "顧客確認待ち",
    WAITING_PAYMENT: "決済待ち",
    CERTIFICATE_PROCESSING: "証明処理中",
    VERIFIED: "完了 / VERIFIED",
    CANCELED: "キャンセル",
    NO_SHOW: "来店なし",
    PARTIALLY_COMPLETED: "部分終了",
  },
  en: {
    SCHEDULED: "Scheduled",
    CHECKED_IN: "Checked in",
    IN_PROGRESS: "In progress",
    PAUSED: "Paused",
    WAITING_REVIEW: "Awaiting review",
    WAITING_CUSTOMER: "Awaiting customer",
    WAITING_PAYMENT: "Awaiting payment",
    CERTIFICATE_PROCESSING: "Certificate processing",
    VERIFIED: "VERIFIED",
    CANCELED: "Canceled",
    NO_SHOW: "No-show",
    PARTIALLY_COMPLETED: "Partially completed",
  },
  vi: {
    SCHEDULED: "Đã lên lịch",
    CHECKED_IN: "Đã nhận xe",
    IN_PROGRESS: "Đang thực hiện",
    PAUSED: "Tạm dừng",
    WAITING_REVIEW: "Chờ kiểm tra",
    WAITING_CUSTOMER: "Chờ khách hàng",
    WAITING_PAYMENT: "Chờ thanh toán",
    CERTIFICATE_PROCESSING: "Đang xử lý chứng nhận",
    VERIFIED: "VERIFIED",
    CANCELED: "Đã hủy",
    NO_SHOW: "Không đến",
    PARTIALLY_COMPLETED: "Hoàn thành một phần",
  },
  id: {
    SCHEDULED: "Dijadwalkan",
    CHECKED_IN: "Sudah masuk",
    IN_PROGRESS: "Sedang dikerjakan",
    PAUSED: "Dijeda",
    WAITING_REVIEW: "Menunggu peninjauan",
    WAITING_CUSTOMER: "Menunggu pelanggan",
    WAITING_PAYMENT: "Menunggu pembayaran",
    CERTIFICATE_PROCESSING: "Memproses sertifikat",
    VERIFIED: "VERIFIED",
    CANCELED: "Dibatalkan",
    NO_SHOW: "Tidak hadir",
    PARTIALLY_COMPLETED: "Selesai sebagian",
  },
  fil: {
    SCHEDULED: "Naka-iskedyul",
    CHECKED_IN: "Nai-check in",
    IN_PROGRESS: "Isinasagawa",
    PAUSED: "Pansamantalang huminto",
    WAITING_REVIEW: "Naghihintay ng pagsusuri",
    WAITING_CUSTOMER: "Naghihintay ng kustomer",
    WAITING_PAYMENT: "Naghihintay ng bayad",
    CERTIFICATE_PROCESSING: "Pinoproseso ang sertipiko",
    VERIFIED: "VERIFIED",
    CANCELED: "Kinansela",
    NO_SHOW: "Hindi dumating",
    PARTIALLY_COMPLETED: "Bahagyang natapos",
  },
  hi: {
    SCHEDULED: "निर्धारित",
    CHECKED_IN: "चेक-इन हुआ",
    IN_PROGRESS: "कार्य जारी",
    PAUSED: "रुका हुआ",
    WAITING_REVIEW: "समीक्षा की प्रतीक्षा",
    WAITING_CUSTOMER: "ग्राहक की प्रतीक्षा",
    WAITING_PAYMENT: "भुगतान की प्रतीक्षा",
    CERTIFICATE_PROCESSING: "प्रमाणपत्र प्रसंस्करण",
    VERIFIED: "VERIFIED",
    CANCELED: "रद्द",
    NO_SHOW: "उपस्थित नहीं",
    PARTIALLY_COMPLETED: "आंशिक रूप से पूर्ण",
  },
};

const STEP_STATE_LABELS: LabelMaps<StepState> = {
  ja: {
    NOT_STARTED: "未着手",
    READY: "開始可能",
    IN_PROGRESS: "作業中",
    BLOCKED: "ブロック中",
    WAITING_APPROVAL: "承認待ち",
    COMPLETED: "完了",
    SKIPPED: "スキップ",
    CANCELED: "キャンセル",
  },
  en: {
    NOT_STARTED: "Not started",
    READY: "Ready",
    IN_PROGRESS: "In progress",
    BLOCKED: "Blocked",
    WAITING_APPROVAL: "Awaiting approval",
    COMPLETED: "Completed",
    SKIPPED: "Skipped",
    CANCELED: "Canceled",
  },
  vi: {
    NOT_STARTED: "Chưa bắt đầu",
    READY: "Sẵn sàng",
    IN_PROGRESS: "Đang thực hiện",
    BLOCKED: "Bị chặn",
    WAITING_APPROVAL: "Chờ phê duyệt",
    COMPLETED: "Hoàn thành",
    SKIPPED: "Bỏ qua",
    CANCELED: "Đã hủy",
  },
  id: {
    NOT_STARTED: "Belum dimulai",
    READY: "Siap",
    IN_PROGRESS: "Sedang dikerjakan",
    BLOCKED: "Diblokir",
    WAITING_APPROVAL: "Menunggu persetujuan",
    COMPLETED: "Selesai",
    SKIPPED: "Dilewati",
    CANCELED: "Dibatalkan",
  },
  fil: {
    NOT_STARTED: "Hindi pa nagsisimula",
    READY: "Handa na",
    IN_PROGRESS: "Isinasagawa",
    BLOCKED: "Naharang",
    WAITING_APPROVAL: "Naghihintay ng pag-apruba",
    COMPLETED: "Tapos na",
    SKIPPED: "Nilaktawan",
    CANCELED: "Kinansela",
  },
  hi: {
    NOT_STARTED: "शुरू नहीं हुआ",
    READY: "तैयार",
    IN_PROGRESS: "कार्य जारी",
    BLOCKED: "अवरुद्ध",
    WAITING_APPROVAL: "स्वीकृति की प्रतीक्षा",
    COMPLETED: "पूर्ण",
    SKIPPED: "छोड़ा गया",
    CANCELED: "रद्द",
  },
};

const SEVERITY_LABELS: LabelMaps<Severity> = {
  ja: {
    NORMAL: "通常",
    ACTION: "要対応",
    HIGH: "高",
    CRITICAL: "緊急",
    RESOLVED: "解消",
  },
  en: {
    NORMAL: "Normal",
    ACTION: "Action needed",
    HIGH: "High",
    CRITICAL: "Critical",
    RESOLVED: "Resolved",
  },
  vi: { NORMAL: "Bình thường", ACTION: "Cần xử lý", HIGH: "Cao", CRITICAL: "Khẩn cấp", RESOLVED: "Đã giải quyết" },
  id: { NORMAL: "Normal", ACTION: "Perlu tindakan", HIGH: "Tinggi", CRITICAL: "Kritis", RESOLVED: "Terselesaikan" },
  fil: { NORMAL: "Normal", ACTION: "Kailangang aksyunan", HIGH: "Mataas", CRITICAL: "Kritikal", RESOLVED: "Nalutas" },
  hi: { NORMAL: "सामान्य", ACTION: "कार्रवाई आवश्यक", HIGH: "उच्च", CRITICAL: "गंभीर", RESOLVED: "हल हो गया" },
};

const CERTIFICATE_STATE_LABELS: LabelMaps<CertificateState> = {
  ja: {
    NOT_READY: "未準備",
    READY: "発行条件成立",
    ISSUING: "発行中",
    VERIFYING: "検証中",
    VERIFIED: "VERIFIED",
    PENDING_CORRECTION: "訂正確認中",
    SUPERSEDED: "新しい版あり",
    REVOKED: "無効",
  },
  en: {
    NOT_READY: "Not ready",
    READY: "Ready",
    ISSUING: "Issuing",
    VERIFYING: "Verifying",
    VERIFIED: "VERIFIED",
    PENDING_CORRECTION: "Correction pending",
    SUPERSEDED: "Superseded",
    REVOKED: "Revoked",
  },
  vi: {
    NOT_READY: "Chưa sẵn sàng",
    READY: "Đủ điều kiện cấp",
    ISSUING: "Đang cấp",
    VERIFYING: "Đang xác minh",
    VERIFIED: "VERIFIED",
    PENDING_CORRECTION: "Chờ chỉnh sửa",
    SUPERSEDED: "Có bản mới",
    REVOKED: "Đã thu hồi",
  },
  id: {
    NOT_READY: "Belum siap",
    READY: "Siap diterbitkan",
    ISSUING: "Sedang menerbitkan",
    VERIFYING: "Sedang memverifikasi",
    VERIFIED: "VERIFIED",
    PENDING_CORRECTION: "Menunggu koreksi",
    SUPERSEDED: "Ada versi baru",
    REVOKED: "Dicabut",
  },
  fil: {
    NOT_READY: "Hindi pa handa",
    READY: "Handa na i-isyu",
    ISSUING: "Ini-isyu",
    VERIFYING: "Bine-verify",
    VERIFIED: "VERIFIED",
    PENDING_CORRECTION: "Naghihintay ng pagwawasto",
    SUPERSEDED: "May bagong bersyon",
    REVOKED: "Binawi",
  },
  hi: {
    NOT_READY: "तैयार नहीं",
    READY: "जारी करने योग्य",
    ISSUING: "जारी हो रहा है",
    VERIFYING: "सत्यापन जारी",
    VERIFIED: "VERIFIED",
    PENDING_CORRECTION: "सुधार लंबित",
    SUPERSEDED: "नया संस्करण उपलब्ध",
    REVOKED: "रद्द किया गया",
  },
};

const PAYMENT_STATE_LABELS: LabelMaps<PaymentState> = {
  ja: {
    UNPAID: "未入金",
    PENDING: "処理中",
    PARTIALLY_PAID: "一部入金",
    PAID: "入金完了",
    OVERPAID: "過入金",
    REFUNDED: "全額返金",
    PARTIALLY_REFUNDED: "一部返金",
    CANCELED: "取消",
    UNKNOWN: "結果不明",
  },
  en: {
    UNPAID: "Unpaid",
    PENDING: "Pending",
    PARTIALLY_PAID: "Partially paid",
    PAID: "Paid",
    OVERPAID: "Overpaid",
    REFUNDED: "Refunded",
    PARTIALLY_REFUNDED: "Partially refunded",
    CANCELED: "Canceled",
    UNKNOWN: "Unknown",
  },
  vi: {
    UNPAID: "Chưa thanh toán",
    PENDING: "Đang xử lý",
    PARTIALLY_PAID: "Thanh toán một phần",
    PAID: "Đã thanh toán",
    OVERPAID: "Thanh toán dư",
    REFUNDED: "Đã hoàn tiền",
    PARTIALLY_REFUNDED: "Hoàn tiền một phần",
    CANCELED: "Đã hủy",
    UNKNOWN: "Chưa rõ",
  },
  id: {
    UNPAID: "Belum dibayar",
    PENDING: "Diproses",
    PARTIALLY_PAID: "Dibayar sebagian",
    PAID: "Lunas",
    OVERPAID: "Kelebihan bayar",
    REFUNDED: "Dikembalikan",
    PARTIALLY_REFUNDED: "Dikembalikan sebagian",
    CANCELED: "Dibatalkan",
    UNKNOWN: "Tidak diketahui",
  },
  fil: {
    UNPAID: "Hindi pa bayad",
    PENDING: "Pinoproseso",
    PARTIALLY_PAID: "Bahagyang bayad",
    PAID: "Bayad na",
    OVERPAID: "Labis ang bayad",
    REFUNDED: "Naibalik ang bayad",
    PARTIALLY_REFUNDED: "Bahagyang naibalik",
    CANCELED: "Kinansela",
    UNKNOWN: "Hindi alam",
  },
  hi: {
    UNPAID: "अवैतनिक",
    PENDING: "प्रसंस्करण में",
    PARTIALLY_PAID: "आंशिक भुगतान",
    PAID: "भुगतान पूर्ण",
    OVERPAID: "अतिरिक्त भुगतान",
    REFUNDED: "वापसी पूर्ण",
    PARTIALLY_REFUNDED: "आंशिक वापसी",
    CANCELED: "रद्द",
    UNKNOWN: "अज्ञात",
  },
};

const SYNC_STATE_LABELS: LabelMaps<SyncState> = {
  ja: {
    SYNCED: "同期済み",
    PENDING: "同期待ち",
    SYNCING: "同期中",
    FAILED: "同期失敗",
    CONFLICT: "競合",
  },
  en: {
    SYNCED: "Synced",
    PENDING: "Pending",
    SYNCING: "Syncing",
    FAILED: "Failed",
    CONFLICT: "Conflict",
  },
  vi: {
    SYNCED: "Đã đồng bộ",
    PENDING: "Chờ đồng bộ",
    SYNCING: "Đang đồng bộ",
    FAILED: "Thất bại",
    CONFLICT: "Xung đột",
  },
  id: {
    SYNCED: "Tersinkron",
    PENDING: "Menunggu sinkronisasi",
    SYNCING: "Sedang sinkronisasi",
    FAILED: "Gagal",
    CONFLICT: "Konflik",
  },
  fil: {
    SYNCED: "Na-sync",
    PENDING: "Naghihintay ng sync",
    SYNCING: "Nagsi-sync",
    FAILED: "Nabigo",
    CONFLICT: "Salungatan",
  },
  hi: { SYNCED: "सिंक हो गया", PENDING: "सिंक लंबित", SYNCING: "सिंक हो रहा है", FAILED: "विफल", CONFLICT: "विरोध" },
};

/**
 * 部品装着の状態ラベル(IMP-040)。v2.0 §8。
 * ja ラベルは既存の admin/parts-integrity ページの STATUS_LABEL に合致させた。
 */
const PART_INSTALLATION_STATE_LABELS: LabelMaps<PartInstallationState> = {
  ja: {
    DRAFT: "下書き",
    INSTALLED: "装着済み（未確定）",
    CUSTOMER_VERIFIED: "確定済み（完全凍結）",
    DISPUTED: "係争中",
    VOIDED: "取消済み",
  },
  en: {
    DRAFT: "Draft",
    INSTALLED: "Installed (unconfirmed)",
    CUSTOMER_VERIFIED: "Verified (frozen)",
    DISPUTED: "Disputed",
    VOIDED: "Voided",
  },
  vi: {
    DRAFT: "Bản nháp",
    INSTALLED: "Đã lắp đặt (chưa xác nhận)",
    CUSTOMER_VERIFIED: "Đã xác nhận (đóng băng)",
    DISPUTED: "Đang tranh chấp",
    VOIDED: "Đã hủy bỏ",
  },
  id: {
    DRAFT: "Draf",
    INSTALLED: "Terpasang (belum dikonfirmasi)",
    CUSTOMER_VERIFIED: "Dikonfirmasi (dibekukan)",
    DISPUTED: "Disengketakan",
    VOIDED: "Dibatalkan",
  },
  fil: {
    DRAFT: "Draft",
    INSTALLED: "Naka-install (hindi pa kumpirmado)",
    CUSTOMER_VERIFIED: "Nakumpirma (naka-freeze)",
    DISPUTED: "Pinagtatalunan",
    VOIDED: "Na-void",
  },
  hi: {
    DRAFT: "ड्राफ़्ट",
    INSTALLED: "स्थापित (अपुष्ट)",
    CUSTOMER_VERIFIED: "पुष्ट (फ़्रीज़)",
    DISPUTED: "विवादित",
    VOIDED: "रद्द",
  },
};

/**
 * 帳票訂正リクエストの状態ラベル(IMP-043)。ADR-0004 準拠。
 * 正準語彙は states.ts の DOCUMENT_CORRECTION_STATES。
 */
const DOCUMENT_CORRECTION_STATE_LABELS: LabelMaps<DocumentCorrectionState> = {
  ja: {
    PENDING: "申請中",
    APPROVED: "承認済み",
    REJECTED: "却下",
    APPLIED: "適用済み",
  },
  en: {
    PENDING: "Pending",
    APPROVED: "Approved",
    REJECTED: "Rejected",
    APPLIED: "Applied",
  },
  vi: { PENDING: "Đang chờ", APPROVED: "Đã duyệt", REJECTED: "Từ chối", APPLIED: "Đã áp dụng" },
  id: { PENDING: "Menunggu", APPROVED: "Disetujui", REJECTED: "Ditolak", APPLIED: "Diterapkan" },
  fil: { PENDING: "Nakabinbin", APPROVED: "Aprubado", REJECTED: "Tinanggihan", APPLIED: "Inilapat" },
  hi: { PENDING: "लंबित", APPROVED: "स्वीकृत", REJECTED: "अस्वीकृत", APPLIED: "लागू" },
};

function pick<T extends string>(maps: LabelMaps<T>, code: T, locale: DomainLocale): string {
  // 型を欺いて legacy 値等が渡された場合に「undefined」を描画せず、コードをそのまま返す
  // (statusMaps.ts の getStatusEntry と同じ境界防御)
  return (maps[locale] ?? maps.ja)[code] ?? code;
}

export const jobStateLabel = (s: JobState, locale: DomainLocale = DEFAULT_DOMAIN_LOCALE) =>
  pick(JOB_STATE_LABELS, s, locale);
export const stepStateLabel = (s: StepState, locale: DomainLocale = DEFAULT_DOMAIN_LOCALE) =>
  pick(STEP_STATE_LABELS, s, locale);
export const severityLabel = (s: Severity, locale: DomainLocale = DEFAULT_DOMAIN_LOCALE) =>
  pick(SEVERITY_LABELS, s, locale);
export const certificateStateLabel = (s: CertificateState, locale: DomainLocale = DEFAULT_DOMAIN_LOCALE) =>
  pick(CERTIFICATE_STATE_LABELS, s, locale);
export const paymentStateLabel = (s: PaymentState, locale: DomainLocale = DEFAULT_DOMAIN_LOCALE) =>
  pick(PAYMENT_STATE_LABELS, s, locale);
export const syncStateLabel = (s: SyncState, locale: DomainLocale = DEFAULT_DOMAIN_LOCALE) =>
  pick(SYNC_STATE_LABELS, s, locale);
export const partInstallationStateLabel = (s: PartInstallationState, locale: DomainLocale = DEFAULT_DOMAIN_LOCALE) =>
  pick(PART_INSTALLATION_STATE_LABELS, s, locale);
export const documentCorrectionStateLabel = (
  s: DocumentCorrectionState,
  locale: DomainLocale = DEFAULT_DOMAIN_LOCALE,
) => pick(DOCUMENT_CORRECTION_STATE_LABELS, s, locale);

/** テスト用に全マップを公開(アプリコードからは個別の *Label 関数を使うこと)。 */
export const __DOMAIN_LABEL_MAPS = {
  job: JOB_STATE_LABELS,
  step: STEP_STATE_LABELS,
  severity: SEVERITY_LABELS,
  certificate: CERTIFICATE_STATE_LABELS,
  payment: PAYMENT_STATE_LABELS,
  sync: SYNC_STATE_LABELS,
  partInstallation: PART_INSTALLATION_STATE_LABELS,
  documentCorrection: DOCUMENT_CORRECTION_STATE_LABELS,
} as const;
