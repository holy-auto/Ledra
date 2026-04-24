/**
 * Marketing lead capture: persist to DB + notify Slack + (optionally) auto-reply.
 *
 * Used by `/api/marketing/leads` and anywhere else that captures leads
 * from the public marketing site.
 */

import { createServiceRoleAdmin } from "@/lib/supabase/admin";
import { notifySlack } from "./slack";

export type LeadSource =
  | "document_dl"
  | "document_shop"
  | "document_agent"
  | "document_insurer"
  | "demo"
  | "contact"
  | "newsletter"
  | "roi"
  | "pilot"
  | "other";

export type LeadInput = {
  source: LeadSource;
  resource_key?: string;
  name?: string;
  company?: string;
  role?: string;
  email: string;
  phone?: string;
  industry?: string;
  locations?: string;
  timing?: string;
  message?: string;
  context?: Record<string, unknown>;
  consent_at?: string;
  referrer?: string;
  user_agent?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_term?: string;
  utm_content?: string;
};

const SOURCE_LABEL: Record<LeadSource, string> = {
  document_dl: "資料ダウンロード",
  document_shop: "資料請求（施工店）",
  document_agent: "資料請求（代理店）",
  document_insurer: "資料請求（保険会社）",
  demo: "デモ依頼",
  contact: "お問い合わせ",
  newsletter: "メルマガ登録",
  roi: "ROIシミュレーター",
  pilot: "パイロット参加応募",
  other: "その他",
};

type SaveResult = { id: string } | { error: string };

export async function saveLead(input: LeadInput): Promise<SaveResult> {
  const supabase = createServiceRoleAdmin("marketing public forms — anonymous leads / aggregated stats");
  const { data, error } = await supabase
    .from("marketing_leads")
    .insert({
      source: input.source,
      resource_key: input.resource_key ?? null,
      name: input.name ?? null,
      company: input.company ?? null,
      role: input.role ?? null,
      email: input.email,
      phone: input.phone ?? null,
      industry: input.industry ?? null,
      locations: input.locations ?? null,
      timing: input.timing ?? null,
      message: input.message ?? null,
      context: input.context ?? null,
      consent_at: input.consent_at ?? null,
      referrer: input.referrer ?? null,
      user_agent: input.user_agent ?? null,
      utm_source: input.utm_source ?? null,
      utm_medium: input.utm_medium ?? null,
      utm_campaign: input.utm_campaign ?? null,
      utm_term: input.utm_term ?? null,
      utm_content: input.utm_content ?? null,
    })
    .select("id")
    .single();

  if (error) {
    console.error("[leads] insert failed:", error);
    return { error: error.message };
  }
  return { id: data.id as string };
}

/**
 * Mark a lead as having successfully received its requested resource PDF.
 * Called from the PDF route after bytes have been generated and handed
 * back to the client. Failures are logged but never surfaced — the primary
 * user action (downloading the PDF) must not be blocked by analytics.
 */
export async function markLeadDownloaded(leadId: string): Promise<void> {
  // UUID v4 rough shape check to reject junk query params before touching DB.
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(leadId)) {
    return;
  }
  const supabase = createServiceRoleAdmin("marketing lead download tag — anonymous lead-id lookup");
  const { error } = await supabase
    .from("marketing_leads")
    .update({ downloaded_at: new Date().toISOString() })
    .eq("id", leadId)
    .is("downloaded_at", null);
  if (error) {
    console.error("[leads] markLeadDownloaded failed:", error);
  }
}

export async function notifyLeadToSlack(input: LeadInput): Promise<void> {
  const label = SOURCE_LABEL[input.source] ?? input.source;
  const fields = [
    input.name ? { title: "お名前", value: input.name, short: true } : null,
    input.company ? { title: "会社名", value: input.company, short: true } : null,
    input.role ? { title: "役職", value: input.role, short: true } : null,
    { title: "メール", value: input.email, short: true },
    input.phone ? { title: "電話", value: input.phone, short: true } : null,
    input.industry ? { title: "業態", value: input.industry, short: true } : null,
    input.locations ? { title: "拠点数", value: input.locations, short: true } : null,
    input.timing ? { title: "検討時期", value: input.timing, short: true } : null,
    input.resource_key ? { title: "リソース", value: input.resource_key, short: true } : null,
    input.utm_source ? { title: "utm_source", value: input.utm_source, short: true } : null,
    input.utm_campaign ? { title: "utm_campaign", value: input.utm_campaign, short: true } : null,
    input.message ? { title: "メッセージ", value: input.message.slice(0, 500) } : null,
  ].filter((f): f is NonNullable<typeof f> => f !== null);

  await notifySlack({
    text: `:sparkles: 新規リード: *${label}*`,
    fields,
  });
}
