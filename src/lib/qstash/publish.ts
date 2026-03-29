import { Client } from "@upstash/qstash";

function getClient() {
  const token = process.env.QSTASH_TOKEN;
  if (!token) {
    console.warn("[QSTASH] QSTASH_TOKEN not set, skipping publish");
    return null;
  }
  return new Client({ token });
}

function getBaseUrl() {
  const candidates = [
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.APP_URL,
    process.env.NEXT_PUBLIC_BASE_URL,
    process.env.VERCEL_URL,
  ].filter(Boolean) as string[];

  const baseUrl = candidates[0];

  if (!baseUrl) {
    throw new Error(
      "Base URL is not set. Set NEXT_PUBLIC_APP_URL or APP_URL in Vercel."
    );
  }

  return baseUrl.startsWith("http") ? baseUrl : `https://${baseUrl}`;
}

async function publish(path: string, payload: Record<string, unknown>) {
  const client = getClient();
  if (!client) return null;

  const targetUrl = `${getBaseUrl()}${path}`;
  console.info("[QSTASH][publish]", path, { hasToken: true });

  const result = await client.publishJSON({
    url: targetUrl,
    body: payload,
  });

  return result;
}

/** Enqueue certificate creation event for async processing */
export async function enqueueInsuranceCaseCreated(
  payload: Record<string, unknown>
) {
  return publish("/api/qstash/insurance-case-created", payload);
}
