/**
 * IdentityScanButton (Mobile) — 身分証 OCR で顧客フォームを自動入力するボタン.
 *
 * フロー:
 *   1. ボタン押下 → カメラ起動 (ImagePicker.launchCameraAsync)
 *   2. POST /api/mobile/identity/ocr で AI Vision OCR
 *   3. 抽出結果を Dialog でプレビュー → ユーザが「反映」を押すと
 *      onComplete(fields) が呼ばれる
 *
 * 注意:
 *   - 本人確認 (KYC) ではない. UI 上に「自動入力」と明記.
 *   - マイナンバー検知時は rejected 状態で破棄.
 *   - 画像はサーバ上で OCR 処理のみに使用され保存されない.
 */
import { useState } from "react";
import { View, StyleSheet } from "react-native";
import { Button, Dialog, Portal, Text, SegmentedButtons, ActivityIndicator } from "react-native-paper";
import * as ImagePicker from "expo-image-picker";

import { supabase } from "@/lib/supabase";

export interface IdentityScanFields {
  name?: string;
  name_kana?: string;
  birth_date?: string;
  postal_code?: string;
  address?: string;
  gender?: "male" | "female" | "other";
  expiration_date?: string;
}

interface ApiResponse {
  ok: boolean;
  status?: "ok" | "rejected";
  doc_type?: string;
  confidence?: number;
  fields?: IdentityScanFields;
  rejected_reasons?: string[];
  warnings?: string[];
  notice?: string;
  error?: string;
  message?: string;
}

type DocType = "driver_license" | "mynumber_card_front" | "residence_card" | "passport" | "health_insurance_card";

const DOC_TYPE_OPTIONS: { value: DocType; label: string }[] = [
  { value: "driver_license", label: "免許証" },
  { value: "mynumber_card_front", label: "マイナンバー(表)" },
  { value: "residence_card", label: "在留" },
  { value: "passport", label: "パスポート" },
  { value: "health_insurance_card", label: "保険証" },
];

interface Props {
  onComplete: (fields: IdentityScanFields) => void;
  label?: string;
}

export default function IdentityScanButton({ onComplete, label = "身分証で自動入力" }: Props) {
  const [docType, setDocType] = useState<DocType>("driver_license");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ApiResponse | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  function reset() {
    setBusy(false);
    setError(null);
    setResult(null);
  }

  function close() {
    setPickerOpen(false);
    reset();
  }

  async function pickAndScan(source: "camera" | "library") {
    setError(null);
    setResult(null);

    if (source === "camera") {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        setError("カメラの使用を許可してください");
        return;
      }
    } else {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        setError("写真ライブラリの使用を許可してください");
        return;
      }
    }

    const picked =
      source === "camera"
        ? await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.8, base64: false })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.8, base64: false });

    if (picked.canceled || !picked.assets?.[0]) return;
    const asset = picked.assets[0];
    if (!asset.uri) return;

    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("image", {
        uri: asset.uri,
        type: "image/jpeg",
        name: "id.jpg",
      } as unknown as Blob);
      fd.append("expected", docType);

      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) {
        setError("認証セッションが見つかりません。再ログインしてください。");
        return;
      }
      const apiBase = process.env.EXPO_PUBLIC_API_URL!;
      const baseRoot = apiBase.replace(/\/api\/mobile\/?$/, "");
      const url = `${baseRoot}/api/mobile/identity/ocr`;

      const res = await fetch(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      const json = (await res.json().catch(() => null)) as ApiResponse | null;

      if (!res.ok || !json || json.ok === false) {
        setError(json?.message ?? json?.error ?? `OCR に失敗しました (HTTP ${res.status})`);
        return;
      }
      setResult(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "通信エラーが発生しました");
    } finally {
      setBusy(false);
    }
  }

  function applyFields() {
    if (!result || result.status !== "ok" || !result.fields) return;
    onComplete(result.fields);
    close();
  }

  return (
    <>
      <Button mode="outlined" icon="camera-account" onPress={() => setPickerOpen(true)} style={styles.trigger}>
        {label}
      </Button>

      <Portal>
        <Dialog visible={pickerOpen} onDismiss={close}>
          <Dialog.Title>身分証で自動入力</Dialog.Title>
          <Dialog.Content>
            <Text variant="bodySmall" style={styles.muted}>
              撮影した身分証から氏名・生年月日・住所を自動入力します。{"\n"}
              <Text style={styles.strong}>本人確認ではありません。</Text>必ず内容を確認してください。{"\n"}
              画像はサーバで OCR 処理のみに使われ、保存されません。
            </Text>

            <View style={styles.warningBox}>
              <Text variant="bodySmall" style={styles.warningText}>
                マイナンバーカードは <Text style={styles.strong}>顔写真面のみ</Text> を撮影してください。
                個人番号(裏面)が含まれていた場合は処理を中止します。
              </Text>
            </View>

            <Text variant="labelSmall" style={styles.label}>書類タイプ</Text>
            <SegmentedButtons
              value={docType}
              onValueChange={(v) => setDocType(v as DocType)}
              buttons={DOC_TYPE_OPTIONS.slice(0, 3).map((o) => ({ value: o.value, label: o.label }))}
              style={styles.segmented}
            />
            <SegmentedButtons
              value={docType}
              onValueChange={(v) => setDocType(v as DocType)}
              buttons={DOC_TYPE_OPTIONS.slice(3).map((o) => ({ value: o.value, label: o.label }))}
              style={styles.segmented}
            />

            {busy && (
              <View style={styles.busy}>
                <ActivityIndicator />
                <Text variant="bodySmall" style={styles.muted}>読取り中…</Text>
              </View>
            )}

            {error && (
              <View style={styles.errorBox}>
                <Text variant="bodySmall" style={styles.errorText}>{error}</Text>
              </View>
            )}

            {result && result.status === "rejected" && (
              <View style={styles.errorBox}>
                <Text variant="bodySmall" style={styles.errorText}>
                  {result.notice ?? "結果を破棄しました。手動で入力してください。"}
                </Text>
                {result.rejected_reasons?.map((r, i) => (
                  <Text key={i} variant="bodySmall" style={styles.errorText}>・{r}</Text>
                ))}
              </View>
            )}

            {result && result.status === "ok" && result.fields && (
              <View style={styles.previewBox}>
                <View style={styles.previewHeader}>
                  <Text variant="titleSmall">読取り結果</Text>
                  <Text variant="bodySmall" style={styles.muted}>
                    信頼度 {Math.round((result.confidence ?? 0) * 100)}%
                  </Text>
                </View>
                <FieldRow label="氏名" value={result.fields.name} />
                <FieldRow label="フリガナ" value={result.fields.name_kana} />
                <FieldRow label="生年月日" value={result.fields.birth_date} />
                <FieldRow label="郵便番号" value={result.fields.postal_code} />
                <FieldRow label="住所" value={result.fields.address} />
                <FieldRow label="性別" value={genderLabel(result.fields.gender)} />
                <FieldRow label="有効期限" value={result.fields.expiration_date} />
              </View>
            )}
          </Dialog.Content>
          <Dialog.Actions>
            {result && result.status === "ok" ? (
              <>
                <Button onPress={close}>閉じる</Button>
                <Button mode="contained" onPress={applyFields} buttonColor="#1a1a2e">
                  フォームに反映
                </Button>
              </>
            ) : (
              <>
                <Button onPress={close} disabled={busy}>閉じる</Button>
                <Button icon="image" onPress={() => pickAndScan("library")} disabled={busy}>
                  写真から
                </Button>
                <Button icon="camera" mode="contained" buttonColor="#1a1a2e" onPress={() => pickAndScan("camera")} disabled={busy}>
                  撮影
                </Button>
              </>
            )}
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </>
  );
}

function FieldRow({ label, value }: { label: string; value?: string }) {
  return (
    <View style={styles.row}>
      <Text variant="bodySmall" style={styles.rowLabel}>{label}</Text>
      <Text variant="bodySmall" style={value ? styles.rowValue : styles.rowValueMuted}>
        {value ?? "未取得"}
      </Text>
    </View>
  );
}

function genderLabel(g?: "male" | "female" | "other"): string | undefined {
  if (!g) return undefined;
  return g === "male" ? "男性" : g === "female" ? "女性" : "その他";
}

const styles = StyleSheet.create({
  trigger: { marginBottom: 12 },
  muted: { color: "#666", marginTop: 4 },
  strong: { fontWeight: "700", color: "#1a1a2e" },
  label: { marginTop: 12, marginBottom: 6, color: "#666" },
  segmented: { marginBottom: 6 },
  busy: { flexDirection: "row", gap: 8, alignItems: "center", marginTop: 12 },
  warningBox: {
    marginTop: 8,
    padding: 8,
    backgroundColor: "#fff8e1",
    borderRadius: 6,
    borderColor: "#f6c453",
    borderWidth: 1,
  },
  warningText: { color: "#7a5d00" },
  errorBox: {
    marginTop: 12,
    padding: 8,
    backgroundColor: "#fde2e2",
    borderRadius: 6,
    borderColor: "#e07a7a",
    borderWidth: 1,
  },
  errorText: { color: "#a02525" },
  previewBox: {
    marginTop: 12,
    padding: 10,
    backgroundColor: "#fafafa",
    borderRadius: 6,
    borderColor: "#ddd",
    borderWidth: 1,
  },
  previewHeader: { flexDirection: "row", justifyContent: "space-between", marginBottom: 6 },
  row: { flexDirection: "row", paddingVertical: 3, borderBottomColor: "#eee", borderBottomWidth: 1 },
  rowLabel: { width: 80, color: "#666" },
  rowValue: { flex: 1, color: "#1a1a2e" },
  rowValueMuted: { flex: 1, color: "#aaa", fontStyle: "italic" },
});
