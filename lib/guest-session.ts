/**
 * Guest session utilities.
 *
 * Provides a hardcoded demo user/session that mirrors the structure of a real
 * Supabase authenticated user/session. This lets the rest of the app behave
 * normally (auth guards, org context, DynamoDB actions) while bypassing real
 * authentication for a seamless demo experience.
 *
 * The guest session is persisted in two places:
 *  - localStorage  -> read by client components (dashboard guard, org context)
 *  - a cookie       -> read by server-side code (middleware, server actions)
 *
 * These constants are intentionally framework-agnostic (no top-level browser
 * API access) so this module can be safely imported from the edge middleware
 * and server actions as well as client components.
 */

export const GUEST_USER_ID = "guest-user-001"
export const GUEST_USER_EMAIL = "guest@whisprdoc.demo"
export const GUEST_SESSION_KEY = "whisprdoc.guest-session"
export const GUEST_COOKIE_NAME = "whisprdoc_guest"

/**
 * Build a hardcoded guest session object that mirrors the shape of a Supabase
 * login response (`{ ...session, user }`).
 */
export function buildGuestSession() {
  const nowSeconds = Math.floor(Date.now() / 1000)
  const nowIso = new Date().toISOString()

  const user = {
    id: GUEST_USER_ID,
    aud: "authenticated",
    role: "authenticated",
    email: GUEST_USER_EMAIL,
    email_confirmed_at: nowIso,
    phone: "",
    confirmed_at: nowIso,
    last_sign_in_at: nowIso,
    app_metadata: { provider: "guest", providers: ["guest"] },
    user_metadata: { full_name: "Guest User", is_guest: true },
    identities: [],
    created_at: nowIso,
    updated_at: nowIso,
  }

  return {
    access_token: "guest-access-token",
    token_type: "bearer",
    expires_in: 86400,
    expires_at: nowSeconds + 86400,
    refresh_token: "guest-refresh-token",
    user,
  }
}

/**
 * Persist a guest session (localStorage + cookie) and return it.
 * Safe to call only on the client.
 */
export function signInAsGuest() {
  if (typeof window === "undefined") return null

  const session = buildGuestSession()
  window.localStorage.setItem(GUEST_SESSION_KEY, JSON.stringify(session))
  // Cookie so middleware and server actions can recognize the guest.
  document.cookie = `${GUEST_COOKIE_NAME}=${GUEST_USER_ID}; path=/; max-age=86400; SameSite=Lax`
  return session
}

/**
 * Read the persisted guest session from localStorage, or null if none.
 */
export function getGuestSession() {
  if (typeof window === "undefined") return null

  const raw = window.localStorage.getItem(GUEST_SESSION_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as ReturnType<typeof buildGuestSession>
  } catch {
    return null
  }
}

/**
 * Whether a guest session is currently active (client-side check).
 */
export function isGuestSession() {
  return getGuestSession() !== null
}

/**
 * Clear the guest session from both localStorage and the cookie.
 */
export function clearGuestSession() {
  if (typeof window === "undefined") return

  window.localStorage.removeItem(GUEST_SESSION_KEY)
  document.cookie = `${GUEST_COOKIE_NAME}=; path=/; max-age=0; SameSite=Lax`
}
