import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export const supabaseAnon = createClient(url, anon, {
  auth: { persistSession: false },
});

export const supabaseService = createClient(url, service, {
  auth: { persistSession: false },
});
