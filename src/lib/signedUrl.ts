import { createServiceRoleAdmin } from "@/lib/supabase/admin";

export async function createSignedAssetUrl(path: string, expiresInSeconds = 3600) {
  const supabaseService = createServiceRoleAdmin("signedUrl — assets バケットの署名付きURL発行");
  const { data, error } = await supabaseService.storage.from("assets").createSignedUrl(path, expiresInSeconds);

  if (error) return null;
  return data?.signedUrl ?? null;
}
