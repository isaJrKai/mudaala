// Mudaala — environment feature flags.
// Kept dependency-free (no next/* imports) so the API test suite can import
// and unit-test the gate logic directly.

// Bearer-token auth is an opt-in compatibility channel for cookie-blocked
// contexts (cross-origin preview iframes). ALLOW_BEARER_AUTH is the spec name;
// AUTH_BEARER_FALLBACK remains as the legacy alias from earlier deployments.
// Anything unset, "0" or "false" keeps the httpOnly-cookie-only posture —
// which is the production posture by default.
export function bearerAuthEnabled(env: Record<string, string | undefined> = process.env): boolean {
  const raw = (env.ALLOW_BEARER_AUTH ?? env.AUTH_BEARER_FALLBACK ?? '').trim().toLowerCase()
  return raw === '1' || raw === 'true'
}
