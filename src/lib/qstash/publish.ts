import { Client } from "@upstash/qstash";

const qstash = new Client({
  token: process.env.QSTASH_TOKEN!,
});

function getBaseUrl() {
  const candidates = [
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.APP_URL,
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

export async function enqueueInsuranceCaseCreated(payload: Record<string, unknown>) {
  const url = `${getBaseUrl()}/api/qstash/insurance-case-created`;

  return await qstash.publishJSON({
    url,
    body: payload,
  });
}
