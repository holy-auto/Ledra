import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { Snackbar } from "react-native-paper";

type ToastVariant = "info" | "success" | "error";

type ToastOptions = {
  variant?: ToastVariant;
  durationMs?: number;
};

type ShowToast = (message: string, options?: ToastOptions) => void;

interface ToastContextValue {
  show: ShowToast;
  showSuccess: (message: string) => void;
  showError: (message: string | Error | unknown) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const VARIANT_COLORS: Record<ToastVariant, string> = {
  info: "#1a1a2e",
  success: "#166534",
  error: "#991b1b",
};

/**
 * 全画面共通のスナックバー表示プロバイダ。
 *
 * 使い方:
 *   const { showError, showSuccess } = useToast();
 *   showSuccess("保存しました");
 *   showError(err); // Error | string | unknown いずれもOK
 *
 * 各画面ごとに Snackbar を実装する代わりにこれを使うと、
 * ・連続した通知の挙動が統一される
 * ・エラーオブジェクトからの message 抽出ロジックを1箇所に集約できる
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState("");
  const [variant, setVariant] = useState<ToastVariant>("info");
  const [duration, setDuration] = useState(3000);
  const [visible, setVisible] = useState(false);

  const show = useCallback<ShowToast>((msg, options) => {
    setMessage(msg);
    setVariant(options?.variant ?? "info");
    setDuration(options?.durationMs ?? 3000);
    setVisible(true);
  }, []);

  const showSuccess = useCallback(
    (msg: string) => show(msg, { variant: "success" }),
    [show]
  );

  const showError = useCallback(
    (err: string | Error | unknown) => {
      const msg =
        err instanceof Error
          ? err.message
          : typeof err === "string"
            ? err
            : "エラーが発生しました";
      show(msg, { variant: "error", durationMs: 5000 });
    },
    [show]
  );

  const value = useMemo<ToastContextValue>(
    () => ({ show, showSuccess, showError }),
    [show, showSuccess, showError]
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <Snackbar
        visible={visible}
        onDismiss={() => setVisible(false)}
        duration={duration}
        style={{ backgroundColor: VARIANT_COLORS[variant] }}
        // Android は兄弟同士の重なりを elevation で決める。画面下端の固定バーは
        // elevation 3 で浮かせているので、既定（0）のままだと通知が隠れる
        wrapperStyle={{ elevation: 8 }}
      >
        {message}
      </Snackbar>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error(
      "useToast must be used within a ToastProvider (see app/_layout.tsx)"
    );
  }
  return ctx;
}
