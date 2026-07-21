import { Textarea } from "holy-cert";

export function Default() {
  return (
    <Textarea
      rows={4}
      placeholder="施工内容の詳細を記入してください"
      className="max-w-sm"
    />
  );
}

export function ErrorState() {
  return (
    <Textarea rows={3} defaultValue="" error aria-label="施工メモ" className="max-w-sm" />
  );
}
