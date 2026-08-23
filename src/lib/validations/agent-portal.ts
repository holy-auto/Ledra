import { z } from "zod";

/**
 * Schemas for `/api/agent/*` (代理店ポータル) routes.
 *
 * These are the agent-side counterparts to `/api/admin/agent-*` (Ledra
 * 運営側) — same domain, different caller role.
 */

const NON_EMPTY = (max: number, label: string) =>
  z.string().trim().min(1, `${label}は必須です。`).max(max, `${label}は${max}文字以内で入力してください。`);

const OPTIONAL_TRIMMED = (max: number) => z.string().trim().max(max).optional();

/* ─── Members (招待) ──────────────────────────────────────── */

export const agentMemberInviteSchema = z.object({
  email: z.string().trim().toLowerCase().email("有効なメールアドレスを入力してください。").max(254),
  role: z.enum(["admin", "staff", "viewer"]).optional().default("viewer"),
  display_name: OPTIONAL_TRIMMED(100),
});
export type AgentMemberInvite = z.infer<typeof agentMemberInviteSchema>;

/* ─── Notifications (一括既読) ────────────────────────────── */

export const agentNotificationsMarkReadSchema = z.object({
  ids: z.array(z.string().uuid()).max(500).optional(),
});
export type AgentNotificationsMarkRead = z.infer<typeof agentNotificationsMarkReadSchema>;

/* ─── Referral Links (作成) ───────────────────────────────── */

export const agentReferralLinkCreateSchema = z.object({
  label: NON_EMPTY(100, "ラベル"),
});
export type AgentReferralLinkCreate = z.infer<typeof agentReferralLinkCreateSchema>;

/* ─── Referrals (紹介案件 CRUD) ───────────────────────────── */

export const agentReferralCreateSchema = z.object({
  shop_name: NON_EMPTY(200, "店舗名"),
  contact_name: OPTIONAL_TRIMMED(100),
  contact_email: z.string().trim().email("メールアドレスの形式が不正です。").max(254).optional(),
  contact_phone: OPTIONAL_TRIMMED(50),
  notes: OPTIONAL_TRIMMED(5000),
});
export type AgentReferralCreate = z.infer<typeof agentReferralCreateSchema>;

const REFERRAL_STATUSES = [
  "pending",
  "contacted",
  "in_negotiation",
  "trial",
  "contracted",
  "cancelled",
  "churned",
] as const;
export type AgentReferralStatus = (typeof REFERRAL_STATUSES)[number];

export const agentReferralUpdateSchema = z
  .object({
    contact_name: OPTIONAL_TRIMMED(100),
    contact_email: z.string().trim().email("メールアドレスの形式が不正です。").max(254).optional(),
    contact_phone: OPTIONAL_TRIMMED(50),
    notes: OPTIONAL_TRIMMED(5000),
    status: z.enum(REFERRAL_STATUSES).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: "更新するフィールドを 1 つ以上指定してください。",
  });
export type AgentReferralUpdate = z.infer<typeof agentReferralUpdateSchema>;

/* ─── Settings (代理店プロファイル) ────────────────────────── */

const COMMISSION_TYPES = ["rate", "fixed"] as const;
const BANK_ACCOUNT_TYPES = ["ordinary", "checking"] as const;

export const agentSettingsUpdateSchema = z
  .object({
    name: NON_EMPTY(200, "名称").optional(),
    contact_name: OPTIONAL_TRIMMED(100),
    contact_email: z.string().trim().email("メールアドレスの形式が不正です。").max(254).optional(),
    contact_phone: OPTIONAL_TRIMMED(50),
    company_name: OPTIONAL_TRIMMED(200),
    // 画面は `address` を送る。`company_address` は旧名として残す（どちらも agents.address へ）
    address: OPTIONAL_TRIMMED(500),
    company_address: OPTIONAL_TRIMMED(500),
    postal_code: OPTIONAL_TRIMMED(20),
    // 保存先の列がまだ無い項目。宣言しておかないと zod が黙って落とすため、
    // 受け取ったうえで「保存できない」と返す（toAgentPatch 側で判定）
    email_notifications: z.boolean().optional(),
    website_url: z.string().trim().url("URL の形式が不正です。").max(2000).optional(),
    logo_url: z.string().trim().url("URL の形式が不正です。").max(2000).optional(),
    commission_type: z.enum(COMMISSION_TYPES).optional(),
    commission_rate: z.number().min(0).max(100).optional(),
    bank_name: OPTIONAL_TRIMMED(100),
    bank_branch: OPTIONAL_TRIMMED(100),
    bank_account_type: z.enum(BANK_ACCOUNT_TYPES).optional(),
    bank_account_number: OPTIONAL_TRIMMED(50),
    bank_account_holder: OPTIONAL_TRIMMED(100),
    notes: OPTIONAL_TRIMMED(5000),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: "更新するフィールドを 1 つ以上指定してください。",
  });
export type AgentSettingsUpdate = z.infer<typeof agentSettingsUpdateSchema>;

/* ─── Support (チケット) ─────────────────────────────────── */

const SUPPORT_CATEGORIES = ["general", "technical", "billing", "feature_request", "bug_report"] as const;
const SUPPORT_PRIORITIES = ["low", "normal", "high", "urgent"] as const;

export const agentSupportTicketCreateSchema = z.object({
  subject: NON_EMPTY(200, "件名"),
  message: NON_EMPTY(10_000, "本文"),
  category: z.enum(SUPPORT_CATEGORIES).optional(),
  priority: z.enum(SUPPORT_PRIORITIES).optional(),
});
export type AgentSupportTicketCreate = z.infer<typeof agentSupportTicketCreateSchema>;

export const agentSupportMessageCreateSchema = z.object({
  body: NON_EMPTY(10_000, "本文"),
});
export type AgentSupportMessageCreate = z.infer<typeof agentSupportMessageCreateSchema>;

/* ─── Materials (提案表紙 PDF 差し込み) ────────────────────── */

export const agentMaterialPersonalizeSchema = z.object({
  company_name: NON_EMPTY(200, "会社名"),
  contact_name: NON_EMPTY(100, "担当者名"),
  proposal_date: OPTIONAL_TRIMMED(40),
  memo: OPTIONAL_TRIMMED(2000),
});
export type AgentMaterialPersonalize = z.infer<typeof agentMaterialPersonalizeSchema>;

/* ─── Training (進捗更新) ─────────────────────────────────── */

export const agentTrainingProgressSchema = z.object({
  course_id: z.string().uuid("コース ID の形式が不正です。"),
  progress: z.number().min(0).max(100).optional(),
});
export type AgentTrainingProgress = z.infer<typeof agentTrainingProgressSchema>;
