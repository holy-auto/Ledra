import { useLayoutEffect } from "react";
import { ToastProvider, useToast } from "holy-cert";

function FireToast({ message, variant }: { message: string; variant: "success" | "error" | "warning" | "info" }) {
  const { toast } = useToast();
  // useLayoutEffect (not useEffect) so the toast is visible on first paint
  // — capture screenshots as soon as the page settles, before a deferred
  // passive effect would otherwise get a chance to run.
  useLayoutEffect(() => {
    toast(message, variant);
  }, []);
  return null;
}

export function Success() {
  // See Modal.tsx for why the minHeight wrapper is needed for fixed-overlay
  // single-mode previews. ponytail: 160 is hand-picked, not derived from
  // cfg.overrides.ToastProvider.viewport (420x200) — keep the two in sync by
  // hand if either changes; see Modal.tsx for the upgrade path.
  return (
    <div style={{ minHeight: 160 }}>
      <ToastProvider>
        <FireToast message="証明書を発行しました" variant="success" />
      </ToastProvider>
    </div>
  );
}

export function ErrorState() {
  return (
    <div style={{ minHeight: 160 }}>
      <ToastProvider>
        <FireToast message="保存に失敗しました。もう一度お試しください" variant="error" />
      </ToastProvider>
    </div>
  );
}
