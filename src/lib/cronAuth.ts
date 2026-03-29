import crypto from "crypto";

/**
 * Verify a cron request is authorized.
 *
 * Checks in order:
 * 1. Vercel cron signature (`x-vercel-cron-signature` header) — verified via
 *    HMAC-SHA256 of the request body using CRON_SECRET as the key.
 * 2. Bearer token in the `Authorization` header matching CRON_SECRET —
 *    works both for Vercel's built-in cron auth and local development.
 */
export function verifyCronRequest(req: Request): {
  authorized: boolean;
  error?: string;
} {
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    return { authorized: false, error: "CRON_SECRET is not configured" };
  }

  // 1. Check Vercel cron signature header
  //    Vercel signs the full request URL path with CRON_SECRET as HMAC key.
  const vercelSignature = req.headers.get("x-vercel-cron-signature");
  if (vercelSignature) {
    const url = new URL(req.url);
    const expected = crypto.createHmac("sha256", cronSecret).update(url.pathname).digest("hex");
    if (vercelSignature === expected) {
      return { authorized: true };
    }
    // Signature present but invalid — reject immediately
    return { authorized: false, error: "Invalid Vercel cron signature" };
  }

  // 2. Fallback: Bearer token check (Vercel built-in + local dev)
  const authHeader = req.headers.get("authorization");
  if (authHeader === `Bearer ${cronSecret}`) {
    return { authorized: true };
  }

  return { authorized: false, error: "Missing or invalid authorization" };
}
