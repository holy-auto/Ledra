import { useState } from "react";
import { View, StyleSheet } from "react-native";
import { Text, ActivityIndicator, Icon } from "react-native-paper";
import { useLocalSearchParams } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import NfcManager, { NfcTech, Ndef } from "react-native-nfc-manager";

import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/stores/authStore";
import { mobileApi } from "@/lib/api";
import { LedraButton } from "@/components/ui";
import { colors, spacing, radius, typography, shadows } from "@/constants/tokens";
import { publicCertUrl, passportUrl } from "@/lib/certificateLinks";

type WriteState = "idle" | "writing" | "verifying" | "success" | "error";



interface CertificateInfo {
  id: string;
  public_id: string;
  customer_name: string | null;
  vehicle_info_json: { maker?: string; model?: string; plate?: string } | null;
  /** Resolved at fetch time. Non-null when the cert's vehicle has a VIN
   * with a published vehicle_passports row — write `/v/{vin}` instead of
   * `/c/{public_id}` so the same physical tag carries the cross-tenant
   * lifetime view. */
  passport_vin: string | null;
}

export default function NfcWriteScreen() {
  const { certificateId } = useLocalSearchParams<{ certificateId: string }>();
  const { user } = useAuthStore();

  const [writeState, setWriteState] = useState<WriteState>("idle");
  const [errorMessage, setErrorMessage] = useState("");

  const { data: cert, isLoading } = useQuery({
    queryKey: ["certificate-for-write", certificateId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("certificates")
        .select(
          // certificate_no / vehicle_* / plate_display 列は存在しない。
          // 番号は public_id、車両は発行時スナップショットの vehicle_info_json
          "id, public_id, customer_name, vehicle_info_json, vehicle_id"
        )
        .eq("id", certificateId)
        .eq("tenant_id", user!.tenantId)
        .single();
      if (error) throw error;

      // Look up the vehicle's normalized VIN and confirm a vehicle_passports
      // row exists. Only when both succeed do we redirect the NFC URL to
      // `/v/{vin}`; otherwise we fall back to the per-cert `/c/{public_id}`
      // page so the tag still resolves.
      let passport_vin: string | null = null;
      const vehicleId = (data as { vehicle_id?: string | null }).vehicle_id ?? null;
      if (vehicleId) {
        const { data: veh } = await supabase
          .from("vehicles")
          .select("vin_code_normalized, passport_opt_out")
          .eq("id", vehicleId)
          .single();
        const vin = veh?.vin_code_normalized ?? null;
        if (vin && !veh?.passport_opt_out) {
          const { data: passport } = await supabase
            .from("vehicle_passports")
            .select("vin_code_normalized")
            .eq("vin_code_normalized", vin)
            .maybeSingle();
          if (passport?.vin_code_normalized) passport_vin = passport.vin_code_normalized;
        }
      }

      return { ...(data as Omit<CertificateInfo, "passport_vin">), passport_vin } as CertificateInfo;
    },
    enabled: !!certificateId && !!user?.tenantId,
  });

  async function startWrite() {
    if (!cert?.public_id) {
      setErrorMessage("証明書のpublic_idが見つかりません");
      setWriteState("error");
      return;
    }

    setWriteState("writing");
    setErrorMessage("");

    // Prefer the vehicle passport URL when one exists — single tag carries
    // the cross-tenant lifetime view. Fall back to the per-cert page otherwise.
    //
    // URL の組み立ては QR・共有と同じ lib/certificateLinks に寄せる。
    // ここだけ別の既定ドメイン（cert.ledra.co.jp）を持っていて、QR と
    // **違うドメインをタグに焼いていた**。タグは書いたら向き先を直せない
    const certUrl = cert.passport_vin
      ? passportUrl(cert.passport_vin)
      : publicCertUrl(cert.public_id);
    if (!certUrl) {
      setWriteState("error");
      setErrorMessage("公開URLが設定されていないため書き込めません（EXPO_PUBLIC_API_URL）");
      return;
    }

    try {
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

      // Create NDEF URI record
      const bytes = Ndef.encodeMessage([Ndef.uriRecord(certUrl)]);
      if (!bytes) {
        throw new Error("NDEFメッセージの作成に失敗しました");
      }

      // Write to tag
      await NfcManager.ndefHandler.writeNdefMessage(bytes);

      // Read-back verify
      setWriteState("verifying");
      const tag = await NfcManager.getTag();
      if (!tag) {
        throw new Error("書込み後の読み戻しに失敗しました");
      }

      const ndefRecords = tag.ndefMessage;
      if (!ndefRecords || ndefRecords.length === 0) {
        throw new Error("書込み後のデータが見つかりません");
      }

      let readUrl = "";
      for (const record of ndefRecords) {
        if (record.tnf === Ndef.TNF_WELL_KNOWN) {
          const decoded = Ndef.uri.decodePayload(
            record.payload as unknown as Uint8Array
          );
          if (decoded) {
            readUrl = decoded;
            break;
          }
        }
      }

      if (readUrl !== certUrl) {
        throw new Error("書込みデータの検証に失敗しました");
      }

      const tagUid = tag.id;

      // Record the write on the server
      try {
        // First create or find the tag record
        await mobileApi(`/nfc/${tagUid}/write`, {
          method: "POST",
          body: {
            certificate_id: cert.id,
            url: certUrl,
          },
        });

        // Then attach the tag
        await mobileApi(`/nfc/${tagUid}/attach`, {
          method: "POST",
          body: {
            certificate_id: cert.id,
          },
        });
      } catch {
        // Server recording failed but NFC write succeeded
        // We'll still show success since the physical write worked
      }

      setWriteState("success");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "書込みに失敗しました";
      setErrorMessage(message);
      setWriteState("error");
    } finally {
      try {
        await NfcManager.cancelTechnologyRequest();
      } catch {
        // ignore cleanup errors
      }
    }
  }

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (!cert) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyText}>証明書が見つかりません</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Certificate Info */}
      <View style={styles.card}>
        <Text style={styles.certNo}>{cert.public_id}</Text>
        {cert.customer_name && (
          <Text style={styles.sub}>{cert.customer_name}</Text>
        )}
        <Text style={styles.sub}>
          {[
            cert.vehicle_info_json?.maker,
            cert.vehicle_info_json?.model,
            cert.vehicle_info_json?.plate,
          ]
            .filter(Boolean)
            .join(" ")}
        </Text>
      </View>

      <View style={styles.content}>
        {writeState === "idle" && (
          <>
            <Icon source="nfc" size={64} color={colors.primary} />
            <Text style={styles.instruction}>
              NFCタグをデバイスに近づけてください
            </Text>
            <LedraButton
              onPress={startWrite}
              icon="nfc"
              style={styles.writeButton}
              fullWidth={false}
            >
              書込み開始
            </LedraButton>
          </>
        )}

        {writeState === "writing" && (
          <>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.statusText}>書込み中...</Text>
            <Text style={styles.instruction}>タグを離さないでください</Text>
          </>
        )}

        {writeState === "verifying" && (
          <>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.statusText}>検証中...</Text>
          </>
        )}

        {writeState === "success" && (
          <>
            <Icon source="check-circle" size={64} color={colors.successDark} />
            <Text style={styles.successText}>書込み完了</Text>
            <Text style={styles.instruction}>
              NFCタグへの書込みが正常に完了しました
            </Text>
            <LedraButton
              onPress={() => setWriteState("idle")}
              style={styles.writeButton}
              fullWidth={false}
            >
              別のタグに書込む
            </LedraButton>
          </>
        )}

        {writeState === "error" && (
          <>
            <Icon source="alert-circle" size={64} color={colors.dangerDark} />
            <Text style={styles.errorText}>{errorMessage}</Text>
            <LedraButton
              onPress={startWrite}
              style={styles.writeButton}
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
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  emptyText: {
    ...typography.body,
    color: colors.textSecondary,
  },
  card: {
    margin: spacing.md,
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
  content: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: spacing["2xl"],
  },
  instruction: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: "center",
    marginTop: spacing.lg,
  },
  writeButton: {
    marginTop: spacing["2xl"],
    paddingHorizontal: spacing["2xl"],
  },
  statusText: {
    ...typography.titleMedium,
    color: colors.textPrimary,
    marginTop: spacing.lg,
  },
  successText: {
    ...typography.titleMedium,
    color: colors.successDark,
    marginTop: spacing.lg,
  },
  errorText: {
    ...typography.body,
    color: colors.dangerDark,
    textAlign: "center",
    marginTop: spacing.lg,
  },
});
