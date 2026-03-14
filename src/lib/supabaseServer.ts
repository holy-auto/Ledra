// Re-export from canonical module — all new code should import from "@/lib/supabase/server"
import { createClient } from "@/lib/supabase/server";
export { createClient as createSupabaseServerClient };
