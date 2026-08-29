/**
 * POST /api/csp-report
 *
 * CSP の `report-uri` / `report-to` から飛んでくる violation を受信し、
 * Sentry に breadcrumb + tag 付きで送る。XSS の混入や CSP 設定ミスが
 * 早期に観測できる。
 *
 * - 認証なし (CSP 違反は browser から直接 POST されるため)
 * - rate limit は proxy.ts の `/api/*` 共通リミットでカバー
 * - 200 を返さないと一部ブラウザがリトライするため必ず 204 で応答
 */

import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface CspReportLegacy {
  "csp-report"?: {
    "document-uri"?: string;
    "violated-directive"?: string;
    "blocked-uri"?: string;
    "source-file"?: string;
    "line-number"?: number;
    "column-number"?: number;
  };
}

interface CspReportNew {
  type?: string;
  body?: {
    documentURL?: string;
    effectiveDirective?: string;
    blockedURL?: string;
    sourceFile?: string;
    lineNumber?: number;
    columnNumber?: number;
    disposition?: string;
  };
}

function extract(body: CspReportLegacy | CspReportNew | CspReportNew[]) {
  // report-uri (legacy): single { "csp-report": {...} }
  const legacy = (Array.isArray(body) ? body[0] : body) as CspReportLegacy;
  if (legacy && "csp-report" in legacy && legacy["csp-report"]) {
    const r = legacy["csp-report"];
    return {
      documentUri: r["document-uri"],
      directive: r["violated-directive"],
      blockedUri: r["blocked-uri"],
      sourceFile: r["source-file"],
      line: r["line-number"],
      column: r["column-number"],
    };
  }
  // report-to (new): array of { type: 'csp-violation', body: {...} }
  const nu = (Array.isArray(body) ? body : [body]).find((x) => (x as CspReportNew)?.type === "csp-violation") as
    CspReportNew | undefined;
  if (nu?.body) {
    return {
      documentUri: nu.body.documentURL,
      directive: nu.body.effectiveDirective,
      blockedUri: nu.body.blockedURL,
      sourceFile: nu.body.sourceFile,
      line: nu.body.lineNumber,
      column: nu.body.columnNumber,
    };
  }
  return null;
}

export async function POST(req: Request) {
  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    // Malformed body — ignore silently to not amplify noise.
    return new Response(null, { status: 204 });
  }

  const fields = extract(payload as CspReportLegacy | CspReportNew);
  if (!fields) return new Response(null, { status: 204 });

  // Skip noisy report-only browser extensions (chrome-extension://, moz-extension://)
  if (fields.blockedUri && /^(chrome|moz|safari)-extension:/i.test(fields.blockedUri)) {
    return new Response(null, { status: 204 });
  }

  logger.warn("csp violation", fields);

  // Lightly-coupled Sentry capture so missing SDK doesn't break this endpoint.
  try {
    const Sentry = await import("@sentry/nextjs");
    Sentry.captureMessage("csp_violation", {
      level: "warning",
      tags: {
        csp_directive: fields.directive ?? "unknown",
      },
      extra: fields,
    });
  } catch {
    /* sentry optional */
  }

  return new Response(null, { status: 204 });
}
