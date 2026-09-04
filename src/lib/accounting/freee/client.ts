/**
 * freee 会計 API クライアント
 *
 * - OAuth 2.0 (Authorization Code, PKCE 任意)
 * - 認可: https://accounts.secure.freee.co.jp/public_api/authorize
 * - トークン: https://accounts.secure.freee.co.jp/public_api/token
 * - API base: https://api.freee.co.jp/api/1
 *
 * MVP スコープ:
 *   - companies (事業所一覧)
 *   - account_items (勘定科目 — "売上高" を自動検出)
 *   - taxes (税区分 — 10%課税売上を自動検出)
 *   - partners (取引先 upsert)
 *   - deals (売上仕訳投入)
 *
 * 参考: https://developer.freee.co.jp/reference/accounting/reference
 */

import { type AccountingProviderClient, type OAuthTokenSet, type LedraSalesEntry, AccountingApiError } from "../types";

const AUTH_BASE = "https://accounts.secure.freee.co.jp";
const API_BASE = "https://api.freee.co.jp/api/1";

interface FreeeTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number; // seconds
  token_type: "bearer";
  scope?: string;
  created_at?: number; // unix seconds
}

interface FreeeCompany {
  id: number;
  name: string;
  display_name?: string;
  role?: string;
}

interface FreeeAccountItem {
  id: number;
  name: string;
  shortcut?: string;
  shortcut_num?: string;
  default_tax_id?: number;
  default_tax_code?: string;
  account_category?: string;
  account_category_id?: number;
  categories?: string[];
}

interface FreeeTax {
  code: number;
  name: string;
  name_ja?: string;
  display_category?: string;
  rate?: number;
  available?: boolean;
}

interface FreeePartner {
  id: number;
  code?: string;
  name: string;
}

interface FreeeDealCreateResponse {
  deal: {
    id: number;
    company_id: number;
    issue_date: string;
    amount: number;
    type: "income" | "expense";
  };
}

const DEFAULT_TIMEOUT_MS = 15_000;

async function freeeFetch<T>(opts: {
  url: string;
  method?: "GET" | "POST";
  accessToken?: string;
  body?: unknown;
  contentType?: "json" | "form";
  query?: Record<string, string | number | undefined>;
}): Promise<T> {
  const { url, method = "GET", accessToken, body, query, contentType = "json" } = opts;
  let fullUrl = url;
  if (query) {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null) params.set(k, String(v));
    }
    const qs = params.toString();
    if (qs) fullUrl += (url.includes("?") ? "&" : "?") + qs;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  try {
    const res = await fetch(fullUrl, {
      method,
      headers: {
        "Content-Type": contentType === "form" ? "application/x-www-form-urlencoded" : "application/json",
        accept: "application/json",
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: !body
        ? undefined
        : contentType === "form"
          ? new URLSearchParams(body as Record<string, string>).toString()
          : JSON.stringify(body),
      signal: controller.signal,
    });

    if (res.status === 401) {
      throw new AccountingApiError("freee", 401, "unauthorized", "Access token rejected");
    }
    if (res.status === 429) {
      throw new AccountingApiError("freee", 429, "rate_limited", "Rate limit exceeded");
    }
    if (!res.ok) {
      let detail: unknown;
      try {
        detail = await res.json();
      } catch {
        detail = await res.text().catch(() => "");
      }
      const code = res.status >= 500 ? "server_error" : "bad_request";
      throw new AccountingApiError("freee", res.status, code, `HTTP ${res.status}`, detail);
    }
    return (await res.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
}

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

export const freeeClient: AccountingProviderClient = {
  provider: "freee",

  buildAuthUrl({ state, redirectUri }) {
    const clientId = requireEnv("FREEE_CLIENT_ID");
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      state,
    });
    return `${AUTH_BASE}/public_api/authorize?${params.toString()}`;
  },

  async exchangeCode({ code, redirectUri }) {
    const data = await freeeFetch<FreeeTokenResponse>({
      url: `${AUTH_BASE}/public_api/token`,
      method: "POST",
      body: {
        grant_type: "authorization_code",
        client_id: requireEnv("FREEE_CLIENT_ID"),
        client_secret: requireEnv("FREEE_CLIENT_SECRET"),
        code,
        redirect_uri: redirectUri,
      },
      contentType: "form",
    });
    return tokensFromResponse(data);
  },

  async refreshAccessToken(refreshToken) {
    const data = await freeeFetch<FreeeTokenResponse>({
      url: `${AUTH_BASE}/public_api/token`,
      method: "POST",
      body: {
        grant_type: "refresh_token",
        client_id: requireEnv("FREEE_CLIENT_ID"),
        client_secret: requireEnv("FREEE_CLIENT_SECRET"),
        refresh_token: refreshToken,
      },
      contentType: "form",
    });
    return tokensFromResponse(data);
  },

  async bootstrap(accessToken) {
    // 1) 事業所一覧 — 加盟店が複数事業所を持つケースは稀なので、最初の 1 件を採用
    //    (UI で後から事業所を切り替えできるようにする拡張余地あり)
    const companiesRes = await freeeFetch<{ companies: FreeeCompany[] }>({
      url: `${API_BASE}/companies`,
      accessToken,
    });
    const company = companiesRes.companies[0];
    if (!company) {
      throw new AccountingApiError("freee", 400, "bad_request", "No company associated with account");
    }

    // 2) 勘定科目 — "売上高" を検出
    const accountsRes = await freeeFetch<{ account_items: FreeeAccountItem[] }>({
      url: `${API_BASE}/account_items`,
      accessToken,
      query: { company_id: company.id },
    });
    const salesAccount =
      accountsRes.account_items.find((a) => a.name === "売上高") ??
      accountsRes.account_items.find((a) => a.name?.includes("売上")) ??
      null;

    // 3) 税区分 — 10% 課税売上 (vat10) を検出
    const taxesRes = await freeeFetch<{ taxes: FreeeTax[] }>({
      url: `${API_BASE}/taxes/companies/${company.id}`,
      accessToken,
    });
    const tax10 =
      taxesRes.taxes.find((t) => t.name_ja?.includes("課税売上") && t.rate === 10) ??
      taxesRes.taxes.find((t) => t.name?.includes("vat10")) ??
      null;

    return {
      company: { id: String(company.id), name: company.display_name ?? company.name },
      defaultSalesAccount: salesAccount
        ? { id: String(salesAccount.id), name: salesAccount.name, category: salesAccount.account_category }
        : null,
      defaultTaxCode: tax10
        ? {
            code: String(tax10.code),
            rate: tax10.rate ?? 10,
            name: tax10.name_ja ?? tax10.name,
          }
        : null,
      defaultPartner: null,
    };
  },

  async postSalesEntry({ accessToken, companyId, entry, defaults }) {
    const partnerId = await ensurePartner({
      accessToken,
      companyId,
      partnerName: entry.partnerName ?? null,
      fallbackPartnerId: defaults.partnerId,
    });

    // 入金口座 (借方): 簡素のため、receiptAccount に応じて固定マッピング。
    // 実運用では加盟店ごとに「現預金=◯◯銀行普通預金」を選ばせるとさらに便利。
    // MVP では provider 標準の現金/普通預金/売掛金を name で検出する。
    const debitAccountId = await resolveDebitAccount({
      accessToken,
      companyId,
      kind: entry.receiptAccount,
    });

    // freee deals は details[] に「貸方明細」を並べる形式。借方は from_walletable / company レベルで決まる。
    // 売上計上は最もシンプルな形 (issue_date / type=income / details[] に税率別行) で投入する。
    const details = entry.breakdown
      .filter((b) => b.subtotal + b.tax > 0)
      .map((b) => ({
        account_item_id: Number(defaults.salesAccountId),
        tax_code: Number(defaults.taxCode),
        amount: b.subtotal + b.tax,
        vat: b.tax,
        description: entry.description,
      }));

    if (details.length === 0) {
      throw new AccountingApiError("freee", 400, "bad_request", "No sales lines to post");
    }

    const totalAmount = details.reduce((sum, d) => sum + d.amount, 0);

    const body: Record<string, unknown> = {
      issue_date: entry.issuedDate,
      type: "income",
      company_id: Number(companyId),
      due_date: entry.issuedDate,
      partner_id: partnerId !== null ? Number(partnerId) : undefined,
      ref_number: entry.ledraRef.docNumber ?? entry.sourceId,
      details,
      // 売掛 or 現預金 で借方を切る
      payments:
        entry.receiptAccount === "receivable"
          ? undefined
          : [
              {
                amount: totalAmount,
                from_walletable_type: "wallet",
                from_walletable_id: debitAccountId,
                date: entry.issuedDate,
              },
            ],
    };

    const res = await freeeFetch<FreeeDealCreateResponse>({
      url: `${API_BASE}/deals`,
      method: "POST",
      accessToken,
      body,
    });
    return { externalId: String(res.deal.id) };
  },
};

function tokensFromResponse(data: FreeeTokenResponse): OAuthTokenSet {
  const issuedAt = data.created_at ? data.created_at * 1000 : Date.now();
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: new Date(issuedAt + data.expires_in * 1000).toISOString(),
  };
}

/**
 * 取引先名から freee 取引先を upsert。
 * - 名前がなければ fallback (default_partner_id) を使う
 * - 存在チェックを GET /partners?keyword= で行い、無ければ POST で作る
 */
async function ensurePartner(opts: {
  accessToken: string;
  companyId: string;
  partnerName: string | null;
  fallbackPartnerId: string | null;
}): Promise<string | null> {
  if (!opts.partnerName) return opts.fallbackPartnerId;

  // existing lookup
  try {
    const res = await freeeFetch<{ partners: FreeePartner[] }>({
      url: `${API_BASE}/partners`,
      accessToken: opts.accessToken,
      query: { company_id: opts.companyId, keyword: opts.partnerName, limit: 5 },
    });
    const exact = res.partners.find((p) => p.name === opts.partnerName);
    if (exact) return String(exact.id);
  } catch {
    // 検索失敗時は作成を試みる (fallback)
  }

  try {
    const created = await freeeFetch<{ partner: FreeePartner }>({
      url: `${API_BASE}/partners`,
      method: "POST",
      accessToken: opts.accessToken,
      body: {
        company_id: Number(opts.companyId),
        name: opts.partnerName,
      },
    });
    return String(created.partner.id);
  } catch {
    return opts.fallbackPartnerId;
  }
}

/**
 * 借方口座 (現金 / 普通預金 / 売掛金 / Stripe未収金) を name ベースで検出。
 * MVP のため固定的なマッチング — 後で加盟店設定でオーバーライド可能にする想定。
 */
async function resolveDebitAccount(opts: {
  accessToken: string;
  companyId: string;
  kind: LedraSalesEntry["receiptAccount"];
}): Promise<number | null> {
  if (opts.kind === "receivable") return null;

  // walletables (現金 / 預金 / クレカ等の決済口座)
  try {
    const res = await freeeFetch<{ walletables: { id: number; name: string; type: string }[] }>({
      url: `${API_BASE}/walletables`,
      accessToken: opts.accessToken,
      query: { company_id: opts.companyId, with_balance: "false" },
    });
    const wallets = res.walletables ?? [];
    let match: { id: number; name: string } | undefined;
    if (opts.kind === "cash") {
      match = wallets.find((w) => w.name?.includes("現金"));
    } else if (opts.kind === "bank") {
      match = wallets.find((w) => w.type === "bank_account") ?? wallets.find((w) => w.name?.includes("預金"));
    } else if (opts.kind === "stripe_receivable") {
      match =
        wallets.find((w) => w.name?.toLowerCase().includes("stripe")) ?? wallets.find((w) => w.type === "credit_card");
    }
    return match?.id ?? wallets[0]?.id ?? null;
  } catch {
    return null;
  }
}
