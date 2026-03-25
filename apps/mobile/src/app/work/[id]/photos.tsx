import { useState } from "react";
import { View, StyleSheet, FlatList, Image, Alert } from "react-native";
import {
  Text,
  Button,
  ActivityIndicator,
  IconButton,
  Snackbar,
} from "react-native-paper";
import { useLocalSearchParams, Stack } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as ImagePicker from "expo-image-picker";

import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/stores/authStore";
import { mobileApi } from "@/lib/api";

interface Photo {
  id: string;
  image_url: string;
  caption: string | null;
  created_at: string;
}

export default function WorkPhotosScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user, selectedStore } = useAuthStore();
  const queryClient = useQueryClient();
  const [uploading, setUploading] = useState(false);
  const [snackbar, setSnackbar] = useState("");

  const {
    data: photos = [],
    isLoading,
    refetch,
  } = useQuery<Photo[]>({
    queryKey: ["work-photos", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("certificate_images")
        .select("id, image_url, caption, created_at")
        .eq("reservation_id", id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Photo[];
    },
    enabled: !!id,
  });

  async function takePhoto() {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("権限エラー", "カメラへのアクセスを許可してください");
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images"],
      quality: 0.8,
      allowsEditing: false,
    });

    if (result.canceled || !result.assets?.[0]) return;

    setUploading(true);
    try {
      const asset = result.assets[0];
      const ext = asset.uri.split(".").pop() ?? "jpg";
      const fileName = `${user!.tenantId}/${id}/${Date.now()}.${ext}`;

      const response = await fetch(asset.uri);
      const blob = await response.blob();

      const { error: uploadError } = await supabase.storage
        .from("work-photos")
        .upload(fileName, blob, {
          contentType: asset.mimeType ?? "image/jpeg",
        });

      if (uploadError) throw uploadError;

      const {
        data: { publicUrl },
      } = supabase.storage.from("work-photos").getPublicUrl(fileName);

      const { error: insertError } = await supabase
        .from("certificate_images")
        .insert({
          reservation_id: id,
          tenant_id: user!.tenantId,
          image_url: publicUrl,
          caption: null,
        });

      if (insertError) throw insertError;

      await queryClient.invalidateQueries({ queryKey: ["work-photos", id] });
      setSnackbar("写真をアップロードしました");
    } catch (err) {
      setSnackbar("アップロードに失敗しました");
    } finally {
      setUploading(false);
    }
  }

  return (
    <>
      <Stack.Screen options={{ title: "写真" }} />
      <View style={styles.container}>
        {isLoading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" />
          </View>
        ) : (
          <FlatList
            data={photos}
            keyExtractor={(item) => item.id}
            numColumns={3}
            contentContainerStyle={styles.grid}
            renderItem={({ item }) => (
              <View style={styles.photoContainer}>
                <Image
                  source={{ uri: item.image_url }}
                  style={styles.photo}
                />
              </View>
            )}
            ListEmptyComponent={
              <View style={styles.center}>
                <Text variant="bodyMedium" style={styles.emptyText}>
                  写真がありません
                </Text>
              </View>
            }
          />
        )}

        <View style={styles.footer}>
          <Button
            mode="contained"
            icon="camera"
            onPress={takePhoto}
            loading={uploading}
            disabled={uploading}
            style={styles.captureButton}
            buttonColor="#1a1a2e"
            contentStyle={{ paddingVertical: 8 }}
          >
            撮影
          </Button>
        </View>
      </View>

      <Snackbar
        visible={!!snackbar}
        onDismiss={() => setSnackbar("")}
        duration={2000}
      >
        {snackbar}
      </Snackbar>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fafafa" },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingTop: 64,
  },
  grid: {
    padding: 4,
  },
  photoContainer: {
    flex: 1 / 3,
    aspectRatio: 1,
    padding: 4,
  },
  photo: {
    flex: 1,
    borderRadius: 8,
    backgroundColor: "#e4e4e7",
  },
  emptyText: { color: "#71717a" },
  footer: {
    padding: 16,
    backgroundColor: "#ffffff",
    borderTopWidth: 1,
    borderTopColor: "#e4e4e7",
  },
  captureButton: {
    borderRadius: 8,
  },
});
