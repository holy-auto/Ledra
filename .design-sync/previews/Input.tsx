import { Input } from "holy-cert";

export function Default() {
  return <Input placeholder="品川 300 あ 12-34" className="max-w-xs" />;
}

export function ErrorState() {
  return <Input defaultValue="不明" aria-label="走行距離" error className="max-w-xs" />;
}

export function Disabled() {
  return <Input defaultValue="LC-2026-0417" disabled className="max-w-xs" />;
}
