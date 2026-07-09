/**
 * 公開: 証明書レコードアンカリングの検証 API
 *
 * GET /api/cert-verify/:public_id
 *
 * 誰でも叩ける公開エンドポイント。証明書の canonical_json (PII 非保持) ・cert_digest ・
 * merkle_proof ・merkle_root ・tx ・Polygonscan URL を返し、第三者が Ledra のサーバーに
 * 依存せず「その内容の証明書がその時点で存在した」ことを独立検証できるようにする。
 *
 * 設計: docs/anchoring-roadmap.md (検証 API)
 *
 * セキュリティ:
 *   - 返すのは PII を含まない anchor データのみ (canonical_json は型で PII 非保持を保証)。
 *   - tenant_id 等の内部 ID は返さない。
 *   - レート制限は `general` プリセット。
 */

import type { NextRequest } from "next/server";
import { createServiceRoleAdmin } from "@/lib/supabase/admin";
import { apiOk, apiNotFound, apiValidationError, apiInternalError } from "@/lib/api/response";
import { checkRateLimit } from "@/lib/api/rateLimit";
import { verifyBatchAnchor } from "@/lib/anchoring/providers/polygonBatch";
import {
  buildCertVerifyResponse,
  type RawAnchorRow,
  type RawBatchRow,
  type RawImageRow,
} from "@/lib/anchoring/certVerifyResponse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PUBLIC_ID_RE = /^[A-Za-z0-9_-]{1,80}$/;
/** 1 証明書あたりの anchor 履歴の取得上限。 */
const MAX_HISTORY = 100;

export async function GET(req: NextRequest, ctx: { params: Promise<{ public_id: string }> }) {
  try {
    const limited = await checkRateLimit(req, "general");
    if (limited) return limited;

    const { public_id: publicId } = await ctx.params;
    if (!PUBLIC_ID_RE.test(publicId)) {
      return apiValidationError("public_id の形式が不正です。");
    }

    const admin = createServiceRoleAdmin("public cert-verify — anonymous public_id lookup spans every tenant");

    // 証明書 (非 PII 列のみ)。
    const { data: cert, error: certErr } = await admin
      .from("certificates")
      .select("id, public_id, status, latest_anchor_id")
      .eq("public_id", publicId)
      .maybeSingle();
    if (certErr) return apiInternalError(certErr, "cert-verify.[public_id]");
    if (!cert) return apiNotFound("証明書が見つかりません。");

    const certId = (cert as { id: string }).id;

    // record anchor 履歴 (新しい順)。
    const { data: anchorData } = await admin
      .from("certificate_anchors")
      .select(
        "id, cert_digest, schema_version, status, anchor_route, canonical_json, batch_id, merkle_proof, instant_tx_hash, polygon_network, block_number, anchored_at, created_at",
      )
      .eq("certificate_id", certId)
      .order("created_at", { ascending: false })
      .limit(MAX_HISTORY);
    const anchors = (anchorData ?? []) as RawAnchorRow[];

    // 参照される batch をまとめて取得。
    const batchIds = [...new Set(anchors.map((a) => a.batch_id).filter((id): id is string => typeof id === "string"))];
    const batchById = new Map<string, RawBatchRow>();
    if (batchIds.length > 0) {
      const { data: batchData } = await admin
        .from("certificate_anchor_batches")
        .select("id, merkle_root, contract_address, network, tx_hash, block_number, anchored_at")
        .in("id", batchIds);
      for (const b of (batchData ?? []) as RawBatchRow[]) batchById.set(b.id, b);
    }

    // 画像バイト列アンカー (既存の per-image アンカー) も併記。
    // polygon 未アンカーでも TSA 封印済みなら第三者が独立検証できる証跡があるため、
    // どちらか一方でも揃っている行を返す (polygon 限定だと TSA のみの担保撮影が
    // 一切露出せず、Phase 4 の「第三者が存在時刻を独立検証可能に」の趣旨に反する)。
    const { data: imageData } = await admin
      .from("certificate_images")
      .select(
        "sha256, polygon_tx_hash, polygon_network, authenticity_grade, created_at, tsa_authority, tsa_timestamp_at",
      )
      .eq("certificate_id", certId)
      .or("polygon_tx_hash.not.is.null,tsa_token.not.is.null")
      .order("created_at", { ascending: true });
    const images = (imageData ?? []) as RawImageRow[];

    // current anchor の merkle_root をオンチェーン検証 (best-effort / 有効時のみ)。
    const currentAnchorId = (cert as { latest_anchor_id: string | null }).latest_anchor_id ?? null;
    const currentRow = anchors.find((a) => a.id === currentAnchorId) ?? anchors[0] ?? null;
    const currentBatch = currentRow?.batch_id ? batchById.get(currentRow.batch_id) : undefined;
    const currentRoot = currentBatch?.merkle_root ?? null;
    const currentNetwork =
      currentBatch?.network === "polygon" || currentBatch?.network === "amoy" ? currentBatch.network : null;

    let onChainVerified: boolean | null = null;
    if (process.env.POLYGON_ANCHOR_ENABLED === "true" && currentRoot) {
      onChainVerified = await verifyBatchAnchor(currentRoot, currentNetwork);
    }

    const response = buildCertVerifyResponse({
      publicId: (cert as { public_id: string }).public_id,
      certStatus: (cert as { status: string }).status,
      anchors,
      batchById,
      currentAnchorId,
      images,
      onChainVerified,
    });

    return apiOk(response);
  } catch (e) {
    return apiInternalError(e, "cert-verify.[public_id]");
  }
}
