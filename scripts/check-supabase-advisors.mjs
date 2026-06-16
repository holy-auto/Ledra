#!/usr/bin/env node
/**
 * Supabase database advisor check (security + performance).
 *
 * Calls the Supabase Management API advisor endpoints and summarizes findings.
 * This is the CI counterpart to the MCP `get_advisors` tool — it surfaces
 * RLS-disabled tables, mutable `search_path` SECURITY DEFINER functions,
 * exposed auth settings, missing indexes, etc., as a recurring baseline.
 *
 * Required env (set as CI secrets):
 *   SUPABASE_ACCESS_TOKEN   Personal/CI access token (Account → Access Tokens)
 *   SUPABASE_PROJECT_ID     Project ref (the xxxx in xxxx.supabase.co)
 *
 * Behavior:
 *   - If either secret is missing → prints a skip notice and exits 0, so the
 *     job never blocks when secrets are not configured (e.g. forks).
 *   - Default mode is informational (exit 0) — it reports counts by level.
 *   - With `--strict`, exits 1 when any SECURITY advisor of level "ERROR" is
 *     present, so the team can flip the workflow to blocking once the baseline
 *     is clean.
 *
 * Docs: https://supabase.com/docs/guides/database/database-advisors
 */

const API = "https://api.supabase.com/v1";
const STRICT = process.argv.includes("--strict");

const token = process.env.SUPABASE_ACCESS_TOKEN;
const ref = process.env.SUPABASE_PROJECT_ID;

if (!token || !ref) {
  console.log(
    "[advisors] SUPABASE_ACCESS_TOKEN / SUPABASE_PROJECT_ID not set — skipping advisor check.",
  );
  process.exit(0);
}

/** Fetch one advisor category; returns { lints: [...] } or null on failure. */
async function fetchAdvisors(category) {
  const url = `${API}/projects/${ref}/advisors/${category}`;
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    });
    if (!res.ok) {
      console.warn(`[advisors] ${category}: HTTP ${res.status} — ${(await res.text()).slice(0, 200)}`);
      return null;
    }
    return await res.json();
  } catch (err) {
    console.warn(`[advisors] ${category}: request failed — ${err?.message ?? err}`);
    return null;
  }
}

function summarize(category, payload) {
  const lints = Array.isArray(payload?.lints) ? payload.lints : [];
  const byLevel = { ERROR: 0, WARN: 0, INFO: 0 };
  for (const l of lints) {
    const lvl = String(l.level ?? "").toUpperCase();
    if (lvl in byLevel) byLevel[lvl] += 1;
  }
  console.log(
    `\n[advisors:${category}] ERROR=${byLevel.ERROR} WARN=${byLevel.WARN} INFO=${byLevel.INFO} (total ${lints.length})`,
  );
  // Print the high-signal items so the log is actionable.
  for (const l of lints) {
    const lvl = String(l.level ?? "").toUpperCase();
    if (lvl === "ERROR" || lvl === "WARN") {
      console.log(`  - [${lvl}] ${l.name ?? l.title ?? "?"}: ${l.detail ?? l.description ?? ""}`.slice(0, 300));
    }
  }
  return byLevel;
}

const [security, performance] = await Promise.all([
  fetchAdvisors("security"),
  fetchAdvisors("performance"),
]);

if (security === null && performance === null) {
  // Could not reach the API at all. Don't hard-fail unless strict.
  console.warn("[advisors] could not retrieve advisors from the Management API.");
  process.exit(STRICT ? 1 : 0);
}

// In strict mode, a missing SECURITY result must NOT be summarized as "no
// findings" — that would let the blocking check pass precisely when it did not
// run (e.g. 403 missing advisors_read, or a transient 5xx). Fail instead.
if (STRICT && security === null) {
  console.error("\n[advisors] strict mode: SECURITY advisors could not be fetched — failing (did not run, not 'clean').");
  process.exit(1);
}

const sec = summarize("security", security ?? { lints: [] });
summarize("performance", performance ?? { lints: [] });

if (STRICT && sec.ERROR > 0) {
  console.error(`\n[advisors] ${sec.ERROR} security advisor(s) at ERROR level — failing (strict mode).`);
  process.exit(1);
}

console.log("\n[advisors] check complete.");
process.exit(0);
