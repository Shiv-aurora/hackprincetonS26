// Supabase client singleton — initialized with project URL and anon key from env.
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string) ?? "";
const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string) ?? "";

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn("Supabase env vars missing — auth and history persistence will be disabled.");
}

// Use a no-op placeholder URL when vars are absent so createClient never throws.
export const supabase = createClient(
  supabaseUrl || "https://placeholder.supabase.co",
  supabaseAnonKey || "placeholder",
);

// Row shape for the activity_history table.
export interface ActivityHistoryRow {
  id?: string;
  user_id?: string;
  prompt: string;
  response: string | null;
  proxy_sent: string | null;
  routing_path: string | null;
  entities_proxied: number;
  audit_id: string | null;
  created_at?: string;
}

// Insert one activity record for the authenticated user; silently no-ops if not signed in.
export async function insertActivity(row: Omit<ActivityHistoryRow, "id" | "user_id" | "created_at">): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  await supabase.from("activity_history").insert({ ...row, user_id: user.id });
}

// Fetch the most recent `limit` activity rows for the signed-in user, newest first.
export async function fetchHistory(limit = 50): Promise<ActivityHistoryRow[]> {
  const { data, error } = await supabase
    .from("activity_history")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    console.error("fetchHistory:", error.message);
    return [];
  }
  return (data ?? []) as ActivityHistoryRow[];
}
