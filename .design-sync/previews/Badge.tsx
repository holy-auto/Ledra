import { Badge } from "holy-cert";

export function Variants() {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge variant="default">下書き</Badge>
      <Badge variant="success">発行済み</Badge>
      <Badge variant="warning">確認待ち</Badge>
      <Badge variant="danger">差し戻し</Badge>
      <Badge variant="info">アンカー中</Badge>
      <Badge variant="violet">VIP会員</Badge>
    </div>
  );
}
