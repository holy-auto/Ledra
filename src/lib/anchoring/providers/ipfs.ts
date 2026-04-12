/**
 * IPFS pinning via Pinata.
 *
 * Env: `PINATA_JWT` — Pinata API v2 JWT (required to enable pinning)
 *
 * Pins a Buffer to IPFS and returns the CID, or null on failure.
 * Failures never throw — callers should treat null as "not pinned".
 */

const PINATA_API = "https://api.pinata.cloud/pinning/pinFileToIPFS";
const TIMEOUT_MS = 20_000;

/**
 * Pin a buffer to IPFS via Pinata.
 *
 * @param buffer - Raw bytes to pin (e.g. C2PA-signed image)
 * @param fileName - File name hint sent to Pinata
 * @returns IPFS CID string (e.g. "Qm..."), or null if pinning is
 *          disabled / fails.
 */
export async function pinToIPFS(buffer: Buffer, fileName: string): Promise<string | null> {
  const jwt = process.env.PINATA_JWT;
  if (!jwt) return null;

  const form = new FormData();
  const blob = new Blob([buffer]);
  form.append("file", blob, fileName);
  form.append(
    "pinataMetadata",
    JSON.stringify({ name: fileName, keyvalues: { source: "ledra-c2pa" } }),
  );

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(PINATA_API, {
      method: "POST",
      headers: { Authorization: `Bearer ${jwt}` },
      body: form,
      signal: controller.signal,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error(`[ipfs] Pinata returned ${res.status}: ${text}`);
      return null;
    }

    const json = await res.json();
    const cid: string = json?.IpfsHash;
    if (!cid) {
      console.error("[ipfs] Pinata response missing IpfsHash", json);
      return null;
    }

    console.info(`[ipfs] pinned to IPFS: ${cid}`);
    return cid;
  } catch (err) {
    if ((err as Error)?.name === "AbortError") {
      console.error("[ipfs] Pinata timed out after 20s");
    } else {
      console.error("[ipfs] Pinata error:", err);
    }
    return null;
  } finally {
    clearTimeout(timer);
  }
}
