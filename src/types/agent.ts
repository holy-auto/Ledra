/** Agent (代理店) status */
export type AgentStatus = "active_pending_review" | "active" | "suspended";

/** Agent role within an agent organization */
export type AgentRole = "admin" | "staff" | "viewer";

/** Commission calculation type */
export type CommissionType = "percentage" | "fixed";

/** Referral status */
export type ReferralStatus =
  | "pending"
  | "contacted"
  | "in_negotiation"
  | "trial"
  | "contracted"
  | "cancelled"
  | "churned";

/** Commission payout status */
export type CommissionStatus = "pending" | "approved" | "paid" | "failed" | "cancelled";

/** Announcement category */
export type AnnouncementCategory = "general" | "campaign" | "system" | "important";

export const AGENT_ROLE_RANK: Record<AgentRole, number> = {
  viewer: 1,
  staff: 2,
  admin: 3,
};

export const AGENT_ROLE_LABELS: Record<AgentRole, string> = {
  admin: "管理者",
  staff: "スタッフ",
  viewer: "閲覧者",
};

export const REFERRAL_STATUS_LABELS: Record<ReferralStatus, string> = {
  pending: "審査待ち",
  contacted: "連絡済み",
  in_negotiation: "商談中",
  trial: "トライアル中",
  contracted: "契約成立",
  cancelled: "キャンセル",
  churned: "解約",
};

export const COMMISSION_STATUS_LABELS: Record<CommissionStatus, string> = {
  pending: "未払い",
  approved: "承認済み",
  paid: "支払い済み",
  failed: "支払い失敗",
  cancelled: "キャンセル",
};

export const ANNOUNCEMENT_CATEGORY_LABELS: Record<AnnouncementCategory, string> = {
  general: "一般",
  campaign: "キャンペーン",
  system: "システム",
  important: "重要",
};

export function normalizeAgentRole(raw: string | null | undefined): AgentRole {
  if (raw === "admin" || raw === "staff") return raw;
  return "viewer";
}

export function normalizeAgentStatus(raw: string | null | undefined): AgentStatus {
  if (raw === "active" || raw === "suspended") return raw;
  return "active_pending_review";
}

/** Check if agent role has at least the minimum role level */
export function hasMinAgentRole(role: AgentRole, minRole: AgentRole): boolean {
  return AGENT_ROLE_RANK[role] >= AGENT_ROLE_RANK[minRole];
}
