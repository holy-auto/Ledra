import { supabaseService } from "@/lib/supabase";

export async function createSignedAssetUrl(path: string, expiresInSeconds = 3600) {
  const { data, error } = await supabaseService
    .storage
    .from("assets")
    .createSignedUrl(path, expiresInSeconds);

  if (error) return null;
  return data?.signedUrl ?? null;
}