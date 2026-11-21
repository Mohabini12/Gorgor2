import { getAuthenticatedUser } from "@/lib/auth";

// Admins are listed in the ADMIN_USERS env var (comma-separated usernames or emails).
export async function requireAdmin() {
  const me = await getAuthenticatedUser();
  if (!me) return null;
  const list = (process.env.ADMIN_USERS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (
    !list.includes(me.username.toLowerCase()) &&
    !list.includes(me.email.toLowerCase())
  ) {
    return null;
  }
  return me;
}

export const FORBIDDEN = { error: "Admin access required." };
