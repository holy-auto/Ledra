import { useState } from "react";
import { View, StyleSheet } from "react-native";
import { Text, ActivityIndicator, Icon } from "react-native-paper";
import { router } from "expo-router";
import NfcManager, { NfcTech, Ndef } from "react-native-nfc-manager";

import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/stores/authStore";
import { LedraButton } from "@/components/ui";
import { colors, spacing, radius, typography, shadows } from "@/constants/tokens";

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

      // URL 種別で分岐: /s/v/<publicId> は車両タグ、それ以外は従来どおり証明書タグ。
      const pathname = (() => {
        try {
          return new URL(url).pathname;
        } catch {
          return url;
        }
      })();
      const vehicleMatch = pathname.match(/\/s\/v\/([^/]+)\/?$/);
      if (vehicleMatch) {
        const vehiclePublicId = vehicleMatch[1];
        const { data: vehicle, error: vehicleError } = await supabase
          .from("vehicles")
          .select("id")
          .eq("public_id", vehiclePublicId)
          .eq("tenant_id", user!.tenantId)
          .single();
        if (vehicleError || !vehicle) {
          throw new Error("対応する車両が見つかりません");
        }
        router.push(`/vehicles/${vehicle.id}`);
        return;
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
            <Icon source="nfc" size={80} color={colors.primary} />
            <Text style={styles.description}>
              NFCタグをスキャンして証明書情報を確認します
            </Text>
            <LedraButton
              onPress={startScan}
              icon="nfc"
              style={styles.actionButton}
              fullWidth={false}
            >
              タグをスキャン
            </LedraButton>
          </>
        )}

        {scanState === "scanning" && (
          <>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.statusText}>スキャン中...</Text>
            <Text style={styles.description}>
              NFCタグをデバイスに近づけてください
            </Text>
            <LedraButton
              variant="outline"
              onPress={async () => {
                try {
                  await NfcManager.cancelTechnologyRequest();
                } catch {
                  // ignore
                }
                setScanState("idle");
              }}
              style={styles.cancelButton}
              fullWidth={false}
            >
              キャンセル
            </LedraButton>
          </>
        )}

        {scanState === "success" && certInfo && (
          <>
            <Icon source="check-circle" size={64} color={colors.successDark} />
            <View style={styles.resultCard}>
              <Text style={styles.certNo}>{certInfo.certificate_no}</Text>
              {certInfo.customer_name && (
                <Text style={styles.sub}>{certInfo.customer_name}</Text>
              )}
            </View>
            <LedraButton
              onPress={navigateToCert}
              style={styles.actionButton}
              fullWidth={false}
            >
              証明書を表示
            </LedraButton>
            <LedraButton
              variant="outline"
              onPress={startScan}
              style={styles.retryButton}
              fullWidth={false}
            >
              再スキャン
            </LedraButton>
          </>
        )}

        {scanState === "error" && (
          <>
            <Icon source="alert-circle" size={64} color={colors.dangerDark} />
            <Text style={styles.errorText}>{errorMessage}</Text>
            <LedraButton
              onPress={startScan}
              style={styles.actionButton}
              fullWidth={false}
            >
              再試行
            </LedraButton>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: spacing["2xl"],
  },
  description: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: "center",
    marginTop: spacing.lg,
    marginBottom: spacing["2xl"],
  },
  actionButton: {
    marginTop: spacing.lg,
    paddingHorizontal: spacing["2xl"],
  },
  statusText: {
    ...typography.titleMedium,
    color: colors.textPrimary,
    marginTop: spacing.lg,
  },
  cancelButton: { marginTop: spacing["2xl"] },
  resultCard: {
    marginTop: spacing.lg,
    width: "100%",
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    padding: spacing.lg,
    ...shadows.card,
  },
  certNo: {
    ...typography.titleMedium,
    color: colors.textPrimary,
  },
  sub: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  retryButton: { marginTop: spacing.sm },
  errorText: {
    ...typography.body,
    color: colors.dangerDark,
    textAlign: "center",
    marginTop: spacing.lg,
  },
});
