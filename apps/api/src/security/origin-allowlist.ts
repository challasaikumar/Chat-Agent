/**
 * Exact origins (https://app.example.com) or single-label wildcards
 * (https://*.vercel.app). Bare "*" is never allowed.
 */
export function isOriginAllowed(
  origin: string,
  allowed: readonly string[],
): boolean {
  const normalized = origin.trim().replace(/\/$/, "");
  if (!normalized) return false;

  for (const entry of allowed) {
    const pattern = entry.trim().replace(/\/$/, "");
    if (!pattern || pattern === "*") continue;
    if (pattern === normalized) return true;
    if (!pattern.includes("*")) continue;

    // Escape regex metacharacters, then turn each * into one hostname label.
    const escaped = pattern
      .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
      .replace(/\*/g, "[a-z0-9-]+");
    if (new RegExp(`^${escaped}$`, "i").test(normalized)) {
      return true;
    }
  }
  return false;
}
