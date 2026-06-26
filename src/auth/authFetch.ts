import { useCallback } from "react";
import { apiFetch, getAuthToken } from "./api";

/**
 * Hook returning a `fetch` wrapper that attaches the backend-issued JWT and
 * raises the global unauthorized event on a 401. Thin wrapper over apiFetch so
 * components and the src/data helpers share one code path.
 *
 * @example
 * const authFetch = useAuthFetch();
 * const res = await authFetch("/api/api-keys");
 */
export function useAuthFetch() {
  return useCallback(
    (path: string, init?: RequestInit) => apiFetch(path, init),
    [],
  );
}

/** Returns the current access token, or undefined if not authenticated. */
export function useAccessToken(): string | undefined {
  return getAuthToken() ?? undefined;
}
