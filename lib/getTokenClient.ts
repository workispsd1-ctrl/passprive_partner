// lib/getTokenClient.ts
import { supabaseBrowser } from "@/lib/supabaseBrowser";

/** Returns the JWT from the browser session cookie, or null */
export async function getTokenClient(): Promise<string | null> {
  const { data } = await supabaseBrowser.auth.getSession();
  return data.session?.access_token ?? null;
}
