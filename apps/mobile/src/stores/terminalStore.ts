import { create } from "zustand";
import type { Reader } from "@stripe/stripe-terminal-react-native";

type ReaderStatus = "disconnected" | "discovering" | "connecting" | "connected";
type PaymentStatus =
  | "idle"
  | "creating"
  | "collecting"
  | "processing"
  | "capturing"
  | "succeeded"
  | "failed"
  | "cancelled";

interface TerminalState {
  readerStatus: ReaderStatus;
  connectedReader: Reader.Type | null;
  discoveredReaders: Reader.Type[];
  readerError: string | null;

  paymentStatus: PaymentStatus;
  paymentError: string | null;
  lastReceiptData: Record<string, unknown> | null;
  /**
   * **カードを切り終えたが、まだサーバへ記録できていない** PaymentIntent の ID。
   * ここに値があるうちに決済をやり直すと、新しい PaymentIntent が作られて
   * **二重に請求される**。記録の再送だけを行うために保持する。
   */
  pendingCapturePaymentIntentId: string | null;

  // Apple TTP T&C 同意状況とiOS互換性
  // null = 未確認, true = 同意済み, false = 未同意
  termsAccepted: boolean | null;
  osVersionSupported: boolean;
  // 設定進捗 (0.0 - 1.0) PaymentCardReader.Event.updateProgress
  configurationProgress: number | null;

  setReaderStatus: (status: ReaderStatus) => void;
  setConnectedReader: (reader: Reader.Type | null) => void;
  setDiscoveredReaders: (readers: Reader.Type[]) => void;
  setReaderError: (error: string | null) => void;

  setPaymentStatus: (status: PaymentStatus) => void;
  setPaymentError: (error: string | null) => void;
  setLastReceiptData: (data: Record<string, unknown> | null) => void;
  setPendingCapture: (paymentIntentId: string | null) => void;
  resetPayment: () => void;

  setTermsAccepted: (accepted: boolean | null) => void;
  setOsVersionSupported: (supported: boolean) => void;
  setConfigurationProgress: (progress: number | null) => void;
}

export const useTerminalStore = create<TerminalState>((set) => ({
  readerStatus: "disconnected",
  connectedReader: null,
  discoveredReaders: [],
  readerError: null,

  paymentStatus: "idle",
  paymentError: null,
  lastReceiptData: null,
  pendingCapturePaymentIntentId: null,

  termsAccepted: null,
  osVersionSupported: true,
  configurationProgress: null,

  setReaderStatus: (readerStatus) => set({ readerStatus }),
  setConnectedReader: (connectedReader) => set({ connectedReader }),
  setDiscoveredReaders: (discoveredReaders) => set({ discoveredReaders }),
  setReaderError: (readerError) => set({ readerError }),

  setPaymentStatus: (paymentStatus) => set({ paymentStatus }),
  setPaymentError: (paymentError) => set({ paymentError }),
  setLastReceiptData: (lastReceiptData) => set({ lastReceiptData }),
  setPendingCapture: (pendingCapturePaymentIntentId) => set({ pendingCapturePaymentIntentId }),

  resetPayment: () =>
    set({
      paymentStatus: "idle",
      paymentError: null,
      lastReceiptData: null,
      pendingCapturePaymentIntentId: null,
    }),

  setTermsAccepted: (termsAccepted) => set({ termsAccepted }),
  setOsVersionSupported: (osVersionSupported) => set({ osVersionSupported }),
  setConfigurationProgress: (configurationProgress) =>
    set({ configurationProgress }),
}));
