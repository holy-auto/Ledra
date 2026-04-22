/**
 * Deepfake detection provider.
 *
 * Env: `DEEPFAKE_PROVIDER` = "disabled" | "hive" | "sensity"
 *      `HIVE_API_KEY` = Hive Moderation API key (required when provider=hive)
 * Default: "disabled"
 */

import type { DeepfakeResult, DeepfakeVerdict } from "./types";

export type DeepfakeProvider = "disabled" | "hive" | "sensity";

function getProvider(): DeepfakeProvider {
  const raw = process.env.DEEPFAKE_PROVIDER;
  if (raw === "hive" || raw === "sensity") return raw;
  return "disabled";
}

const DISABLED_RESULT: DeepfakeResult = { score: null, verdict: null };

const HIVE_TIMEOUT_MS = 8_000;

function scoreToVerdict(score: number): DeepfakeVerdict {
  if (score >= 0.8) return "likely_fake";
  if (score >= 0.5) return "suspicious";
  return "likely_real";
}

/**
 * Call Hive Moderation visual-deepfake detection API.
 */
async function callHive(buffer: Buffer): Promise<DeepfakeResult> {
  const apiKey = process.env.HIVE_API_KEY;
  if (!apiKey) {
    console.warn("[deepfake] HIVE_API_KEY not set, skipping");
    return DISABLED_RESULT;
  }

  const blob = new Blob([new Uint8Array(buffer)]);
  const form = new FormData();
  form.append("media", blob, "image.jpg");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), HIVE_TIMEOUT_MS);

  try {
    const res = await fetch("https://api.thehive.ai/api/v2/task/sync", {
      method: "POST",
      headers: { Authorization: `Token ${apiKey}` },
      body: form,
      signal: controller.signal,
    });

    if (!res.ok) {
      console.error(`[deepfake] Hive API returned ${res.status}`);
      return DISABLED_RESULT;
    }

    const json = await res.json();

    // Navigate Hive response: status[0].response.output[0].classes[]
    const classes: Array<{ class: string; score: number }> =
      json?.status?.[0]?.response?.output?.[0]?.classes ?? [];

    const deepfakeClass = classes.find((c: { class: string }) => c.class === "deepfake");
    if (!deepfakeClass) {
      console.warn("[deepfake] Hive response missing deepfake class");
      return DISABLED_RESULT;
    }

    const score = deepfakeClass.score;
    return { score, verdict: scoreToVerdict(score) };
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      console.error("[deepfake] Hive API timed out");
    } else {
      console.error("[deepfake] Hive API error", err);
    }
    return DISABLED_RESULT;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Check an image buffer for deepfake indicators.
 *
 * @returns DeepfakeResult with score and verdict.
 */
export async function checkDeepfake(buffer: Buffer): Promise<DeepfakeResult> {
  const provider = getProvider();
  if (provider === "disabled") return DISABLED_RESULT;

  if (provider === "hive") return callHive(buffer);

  // sensity: not yet implemented
  console.warn(`[deepfake] provider=${provider} not yet implemented, skipping`);
  return DISABLED_RESULT;
}
