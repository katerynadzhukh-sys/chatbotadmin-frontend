import { useAuth } from "../auth/AuthContext";

/**
 * Parsed user information for display, derived from the backend session.
 */
export interface CurrentUser {
  /** Backend user id (UUID). */
  id: string;
  /** Login name. */
  username: string;
  /** Display name (currently the username; the backend JWT carries no name). */
  displayName: string;
  /** Single role string from the backend ("user" | "admin" | "superadmin"). */
  role: string;
  /** Initials derived from the username, for avatars. */
  initials: string;
}

/** Derives 1–2 character initials from a name. "admin" → "AD", "" → "?". */
function deriveInitials(name: string): string {
  const parts = name.trim().split(/[\s._-]+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  if (parts[0] && parts[0].length >= 2) {
    return parts[0].substring(0, 2).toUpperCase();
  }
  return parts[0]?.[0]?.toUpperCase() ?? "?";
}

/**
 * Hook exposing the current user for UI components. Returns null when no user
 * is authenticated.
 */
export function useCurrentUser(): CurrentUser | null {
  const { user } = useAuth();
  if (!user) return null;
  return {
    id: user.id,
    username: user.username,
    displayName: user.username,
    role: user.role,
    initials: deriveInitials(user.username),
  };
}
