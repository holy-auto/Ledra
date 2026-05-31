import { formatDateTime } from "@/lib/format";

export type HistoryItem = {
  id: string;
  type: string | null;
  title: string | null;
  description?: string | null;
  performed_at?: string | null;
  created_at?: string | null;
};

export type CertEvent = {
  id: string;
  publicId: string;
  status: string | null;
  createdAt: string | null;
};

export type ReservationItem = {
  id: string;
  title: string | null;
  status: string | null;
  scheduled_at: string | null;
};

type Variant = "certificate" | "reservation" | "history" | "void";

type UnifiedEvent = {
  key: string;
  occurredAt: string;
  variant: Variant;
  badge: string;
  title: string;
  description: string | null;
};

const variantClass: Record<Variant, string> = {
  certificate: "bg-emerald-500/10 text-emerald-300 border-emerald-500/30",
  reservation: "bg-sky-500/10 text-sky-300 border-sky-500/30",
  history: "bg-violet-500/10 text-violet-300 border-violet-500/30",
  void: "bg-red-500/10 text-red-300 border-red-500/30",
};

const reservationStatusLabel: Record<string, string> = {
  arrived: "来店",
  in_progress: "作業中",
  completed: "作業完了",
};

/**
 * UnifiedTimeline (公開ページ用)
 *
 * - vehicle_histories + 同じ車両の他の証明書発行イベント + 完了 / 来店
 *   ステータスの reservations を 1 本のタイムラインに合成。
 * - 公開向けに顧客名・担当者名は表示しない (個人情報保護のため)。
 * - 既存の admin/vehicles ServiceTimeline は内部向けで詳細リンクや顧客
 *   情報を含むため、公開ページではこの簡素版を使う。
 */
export default function UnifiedTimeline({
  histories,
  certs,
  reservations,
  selfPublicId,
}: {
  histories: HistoryItem[];
  certs: CertEvent[];
  reservations: ReservationItem[];
  selfPublicId: string;
}) {
  const events = mergeUnifiedEvents({ histories, certs, reservations, selfPublicId });

  if (events.length === 0) {
    return (
      <section className="glass-card p-4">
        <div className="mb-3 font-bold text-primary">サービス履歴</div>
        <div className="text-sm text-muted">履歴はありません。</div>
      </section>
    );
  }

  return (
    <section className="glass-card p-4">
      <div className="mb-3 font-bold text-primary">サービス履歴</div>
      <ol className="relative space-y-3 pl-5 before:absolute before:left-1.5 before:top-1 before:bottom-1 before:w-px before:bg-border-default">
        {events.map((ev) => (
          <li key={ev.key} className="relative">
            <span className="absolute -left-[14px] top-3 h-2 w-2 rounded-full bg-accent ring-4 ring-base" />
            <div className="rounded-xl border border-border-default bg-base p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${variantClass[ev.variant]}`}
                >
                  {ev.badge}
                </span>
                <span className="text-xs text-muted">{formatDateTime(ev.occurredAt)}</span>
              </div>
              <div className="mt-1.5 text-sm font-medium text-primary">{ev.title}</div>
              {ev.description ? (
                <div className="mt-1 whitespace-pre-wrap text-xs text-secondary">{ev.description}</div>
              ) : null}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function mergeUnifiedEvents({
  histories,
  certs,
  reservations,
  selfPublicId,
}: {
  histories: HistoryItem[];
  certs: CertEvent[];
  reservations: ReservationItem[];
  selfPublicId: string;
}): UnifiedEvent[] {
  const events: UnifiedEvent[] = [];

  // 1) certificate events: 自身を除く同車両の他証明書発行
  for (const c of certs) {
    if (c.publicId === selfPublicId) continue;
    const occurred = c.createdAt;
    if (!occurred) continue;
    const status = String(c.status ?? "").toLowerCase();
    const isVoid = status === "void";
    events.push({
      key: `cert-${c.id}`,
      occurredAt: occurred,
      variant: isVoid ? "void" : "certificate",
      badge: isVoid ? "証明書 (無効)" : "証明書",
      title: isVoid ? `他の施工証明書 (${c.publicId}) — 無効化` : `他の施工証明書 (${c.publicId})`,
      description: null,
    });
  }

  // 2) vehicle_histories: 公開ページ向けに type と title をそのまま表示
  for (const h of histories) {
    const occurred = h.performed_at ?? h.created_at;
    if (!occurred) continue;
    events.push({
      key: `hist-${h.id}`,
      occurredAt: occurred,
      variant: "history",
      badge: typeBadge(h.type),
      title: h.title ?? "履歴",
      description: h.description ?? null,
    });
  }

  // 3) reservations: 公開対象 (arrived / in_progress / completed のみ)
  for (const r of reservations) {
    if (!r.scheduled_at) continue;
    const status = String(r.status ?? "").toLowerCase();
    const label = reservationStatusLabel[status] ?? "予約";
    events.push({
      key: `rsv-${r.id}`,
      occurredAt: r.scheduled_at,
      variant: "reservation",
      badge: label,
      title: r.title ?? "予約",
      description: null,
    });
  }

  // 時系列降順 (新しい順)
  events.sort((a, b) => {
    const at = Date.parse(a.occurredAt);
    const bt = Date.parse(b.occurredAt);
    if (Number.isNaN(at) || Number.isNaN(bt)) return 0;
    return bt - at;
  });

  return events;
}

function typeBadge(type: string | null): string {
  if (!type) return "履歴";
  const t = type.toLowerCase();
  if (t.includes("issued") || t.includes("created")) return "発行";
  if (t.includes("void") || t.includes("revoke")) return "無効";
  if (t.includes("nfc")) return "NFC";
  if (t.includes("thickness") || t.includes("inspection")) return "点検";
  return "履歴";
}
