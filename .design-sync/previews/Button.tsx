import { Button } from "holy-cert";

export function Variants() {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button variant="primary">証明書を発行</Button>
      <Button variant="secondary">下書き保存</Button>
      <Button variant="ghost">キャンセル</Button>
      <Button variant="danger">削除する</Button>
      <Button variant="outline">詳細を見る</Button>
    </div>
  );
}

export function Sizes() {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button size="sm">小</Button>
      <Button size="md">中</Button>
      <Button size="lg">大</Button>
    </div>
  );
}

export function States() {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button variant="primary" loading>
        送信中
      </Button>
      <Button variant="primary" disabled>
        送信済み
      </Button>
    </div>
  );
}
