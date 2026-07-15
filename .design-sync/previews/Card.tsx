import { Card } from "holy-cert";

export function Variants() {
  return (
    <div className="grid grid-cols-1 gap-4">
      <Card variant="default">
        <p className="text-sm font-medium text-primary">施工証明書 #LC-2026-0417</p>
        <p className="mt-1 text-xs text-muted">2026年7月15日発行・ボディコーティング</p>
      </Card>
      <Card variant="elevated">
        <p className="text-sm font-medium text-primary">今月の発行件数</p>
        <p className="mt-1 text-2xl font-semibold text-primary">128件</p>
      </Card>
      <Card variant="inset" padding="compact">
        <p className="text-xs text-muted">下書き保存済み（自動保存 3分前）</p>
      </Card>
    </div>
  );
}
