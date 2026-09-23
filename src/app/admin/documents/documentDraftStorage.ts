/**
 * 帳票の新規作成フォームの入力途中データを端末（localStorage）に退避する。
 * 誤ってブラウザの「戻る」やリロードをしても、もう一度作成画面を開けば続きから再開できる。
 *
 * キーはテナント × ユーザー × URL プリフィル（顧客・車両・案件・外注職人）で分ける。
 * 別テナント・別スタッフや、案件 A から開いた下書きが案件 B の作成画面に混ざらないようにするため。
 *
 * ponytail: 端末ローカル保存なので別端末とは共有されない。共有端末で他スタッフに
 * 見えうるため TTL で古い下書きは捨てる。
 */

const PREFIX = "ledra:document-draft:v1";
export const DRAFT_TTL_MS = 24 * 60 * 60 * 1000;

export type DraftContext = {
  tenantId: string;
  userId: string;
  customerId?: string;
  vehicleId?: string;
  reservationId?: string;
  staffMemberId?: string;
};

export function draftKey(ctx: DraftContext): string {
  return [
    PREFIX,
    ctx.tenantId,
    ctx.userId,
    ctx.customerId ?? "",
    ctx.vehicleId ?? "",
    ctx.reservationId ?? "",
    ctx.staffMemberId ?? "",
  ].join(":");
}

type Stored<T> = { savedAt: number; data: T };

export function loadDraft<T>(key: string, now = Date.now()): { savedAt: number; data: T } | null {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Stored<T>;
    if (typeof parsed?.savedAt !== "number" || parsed.data == null || now - parsed.savedAt > DRAFT_TTL_MS) {
      window.localStorage.removeItem(key);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function saveDraft<T>(key: string, data: T, now = Date.now()): void {
  try {
    window.localStorage.setItem(key, JSON.stringify({ savedAt: now, data } satisfies Stored<T>));
  } catch {
    // 容量超過・プライベートモード等。保存できなくても入力自体は続けられる。
  }
}

export function clearDraft(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {}
}
