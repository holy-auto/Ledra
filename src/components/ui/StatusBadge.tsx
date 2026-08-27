import Badge from "@/components/ui/Badge";
import { getStatusEntry, type StatusEntry } from "@/lib/statusMaps";

interface StatusBadgeProps {
  /** statusMaps.ts のマップ(単一の出典。独自 map の持ち込み禁止 = DESIGN_SYSTEM ルール#3) */
  map: Record<string, StatusEntry>;
  status: string | null | undefined;
  dot?: boolean;
}

/**
 * statusMaps → Badge の定型接続(`getStatusEntry` + `<Badge>`)の糖衣。
 * 未知のステータスは getStatusEntry のフォールバック(default variant + 生ラベル)に従う。
 * (旧 `src/components/StatusBadge.tsx` は独自スタイルの二重管理かつ使用0件だったため削除済み)
 */
export default function StatusBadge({ map, status, dot = false }: StatusBadgeProps) {
  const entry = getStatusEntry(map, status);
  return (
    <Badge variant={entry.variant} dot={dot}>
      {entry.label}
    </Badge>
  );
}
