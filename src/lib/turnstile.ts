/**
 * Cloudflare Turnstile server-side token verification.
 *
 * When TURNSTILE_SECRET_KEY is not set (local dev), verification is skipped
 * and success is returned immediately — same pattern as rate limit bypass
 * when Redis is not configured.
 */
export async function verifyTurnstile(
  token: string | null | undefined,
  ip?: string,
): Promise<{ success: true } | { success: false; error: string }> {
  const secret = process.env.TURNSTILE_SECRET_KEY;

  if (!secret) {
    console.warn("[turnstile] TURNSTILE_SECRET_KEY not set — skipping verification (dev mode)");
    return { success: true };
  }

  if (!token) {
    return { success: false, error: "captcha_missing" };
  }

  try {
    const form = new URLSearchParams();
    form.set("secret", secret);
    form.set("response", token);
    if (ip) form.set("remoteip", ip);

    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    });

    if (!res.ok) {
      console.error("[turnstile] siteverify HTTP error:", res.status);
      return { success: false, error: "captcha_error" };
    }

    const data = (await res.json()) as { success: boolean; "error-codes"?: string[] };

    if (!data.success) {
      return { success: false, error: "captcha_failed" };
    }

    return { success: true };
  } catch (e) {
    console.error("[turnstile] verification error:", e);
    return { success: false, error: "captcha_error" };
  }
}
