"use client";

import { useFormStatus } from "react-dom";

export function LoginSubmitButton({ label = "ログイン" }: { label?: string }) {
  const { pending } = useFormStatus();
  return (
    <button className="btn-primary w-full" disabled={pending}>
      {pending ? (
        <span className="flex items-center justify-center gap-2">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
          処理中...
        </span>
      ) : (
        label
      )}
    </button>
  );
}
