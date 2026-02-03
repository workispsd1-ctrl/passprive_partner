// app/actions/auth.ts
"use server";

import { supabaseFromToken } from "@/lib/supabaseHeadless";

export async function verifyUserSession(
  accessToken: string | undefined
): Promise<
  | { status: 200; user: { id: string; email: string; fullName: string; avatar: string; role: string } }
  | { status: 401 | 403; error: string }
> {
  if (!accessToken) return { status: 401, error: "Token missing" };

  const supabase = supabaseFromToken(accessToken);
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) return { status: 403, error: "User not authenticated" };

  const userData = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single();

  return {
    status: 200,
    user: {
      id: user.id,
      email: user.email ?? "",
      fullName: user.user_metadata?.full_name ?? "",
      avatar: user.user_metadata?.avatar_url ?? "",
      role: user.user_metadata?.role ?? userData?.data?.role ?? "user",
    },
  };
}
