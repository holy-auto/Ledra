import { useState } from "react";
import { View, StyleSheet, Platform } from "react-native";
import { Text, Button, Card, ActivityIndicator, Icon } from "react-native-paper";
import { router } from "expo-router";
import NfcManager, { NfcTech, Ndef } from "react-native-nfc-manager";

import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/stores/authStore";

type ScanState = "idle" | "scanning" | "success" | "error";

export default function NfcScanScreen() {
  const { user } = useAuthStore();
  const [scanState, setScanState] = useState<ScanState>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [certInfo, setCertInfo] = useState<{
    id: string;
    certificate_no: string;
    customer_name: string | null;
  } | null>(null);

  async function startScan() {
    setScanState("scanning");
    setErrorMessage("");
    setCertInfo(null);

    try {
      // Check NFC support
      const isSupported = await NfcManager.isSupported();
      if (!isSupported) {
        throw new Error("このデバイスはNFCに対応していません");
      }

      await NfcManager.start();

      const isEnabled = await NfcManager.isEnabled();
      if (!isEnabled) {
        throw new Error("NFCが無効です。設定から有効にしてください");
      }

      // Request NFC technology
      await NfcManager.requestTechnology(NfcTech.Ndef);

      const tag = await NfcManager.getTag();
      if (!tag) {
        throw new Error("タグを読み取れませんでした");
      }

      // Parse NDEF records
      const ndefRecords = tag.ndefMessage;
      if (!ndefRecords || ndefRecords.length === 0) {
        throw new Error("NFCタグにデータがありません");
      }

      // Extract URL from NDEF URI record
      let url = "";
      for (const record of ndefRecords) {
        if (record.tnf === Ndef.TNF_WELL_KNOWN) {
          const decoded = Ndef.uri.decodePayload(
            record.payload as unknown as Uint8Array
          );
          if (decoded) {
            url = decoded;
            break;
          }
        }
      }

      if (!url) {
        throw new Error("有効なURLが見つかりません");
      }

      // Parse public_id from URL (e.g., https://example.com/cert/PUBLIC_ID)
      const urlParts = url.split("/");
      const publicId = urlParts[urlParts.length - 1];

      if (!publicId) {
        throw new Error("証明書IDを解析できません");
      }

      // Look up certificate by public_id
      const { data: cert, error } = await supabase
        .from("certificates")
        .select("id, certificate_no, customer_name")
        .eq("public_id", publicId)
        .eq("tenant_id", user!.tenantId)
        .single();

      if (error || !cert) {
        throw new Error("対応する証明書が見つかりません");
      }

      setCertInfo(cert);
      setScanState("success");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "スキャンに失敗しました";
      setErrorMessage(message);
      setScanState("error");
    } finally {
      try {
        await NfcManager.cancelTechnologyRequest();
      } catch {
        // ignore cleanup errors
      }
    }
  }

  function navigateToCert() {
    if (certInfo) {
      router.push(`/certificates/${certInfo.id}`);
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        {scanState === "idle" && (
          <>
            <Icon source="nfc" size={80} color="#1a1a2e" />
            <Text variant="bodyLarge" style={styles.description}>
              NFCタグをスキャンして証明書情報を確認します
            </Text>
            <Button
              mode="contained"
              onPress={startScan}
              buttonColor="#1a1a2e"
              style={styles.scanButton}
              icon="nfc"
              contentStyle={styles.scanButtonContent}
            >
              タグをスキャン
            </Button>
          </>
        )}

        {scanState === "scanning" && (
          <>
            <ActivityIndicator size="large" color="#1a1a2e" />
            <Text variant="titleMedium" style={styles.scanningText}>
              スキャン中...
            </Text>
            <Text variant="bodyMedium" style={styles.description}>
              NFCタグをデバイスに近づけてください
            </Text>
            <Button
              mode="outlined"
              onPress={async () => {
                try {
                  await NfcManager.cancelTechnologyRequest();
                } catch {
                  // ignore
                }
                setScanState("idle");
              }}
              style={styles.cancelButton}
            >
              キャンセル
            </Button>
          </>
        )}

        {scanState === "success" && certInfo && (
          <>
            <Icon source="check-circle" size={64} color="#166534" />
            <Card style={styles.resultCard} mode="outlined">
              <Card.Content>
                <Text variant="titleMedium" style={styles.certNo}>
                  {certInfo.certificate_no}
                </Text>
                {certInfo.customer_name && (
                  <Text variant="bodyMedium" style={styles.sub}>
                    {certInfo.customer_name}
                  </Text>
                )}
              </Card.Content>
            </Card>
            <Button
              mode="contained"
              onPress={navigateToCert}
              buttonColor="#1a1a2e"
              style={styles.scanButton}
            >
              証明書を表示
            </Button>
            <Button mode="outlined" onPress={startScan} style={styles.retryButton}>
              再スキャン
            </Button>
          </>
        )}

        {scanState === "error" && (
          <>
            <Icon source="alert-circle" size={64} color="#991b1b" />
            <Text variant="bodyLarge" style={styles.errorText}>
              {errorMessage}
            </Text>
            <Button
              mode="contained"
              onPress={startScan}
              buttonColor="#1a1a2e"
              style={styles.scanButton}
            >
              再試行
            </Button>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fafafa" },
  content: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  description: {
    color: "#71717a",
    textAlign: "center",
    marginTop: 16,
    marginBottom: 24,
  },
  scanButton: {
    paddingHorizontal: 24,
    marginTop: 16,
  },
  scanButtonContent: {
    paddingVertical: 8,
  },
  scanningText: {
    color: "#1a1a2e",
    marginTop: 16,
    fontWeight: "600",
  },
  cancelButton: { marginTop: 24 },
  resultCard: {
    marginTop: 16,
    width: "100%",
    backgroundColor: "#ffffff",
  },
  certNo: { fontWeight: "700", color: "#1a1a2e" },
  sub: { color: "#71717a", marginTop: 4 },
  retryButton: { marginTop: 8 },
  errorText: {
    color: "#991b1b",
    textAlign: "center",
    marginTop: 16,
  },
});
