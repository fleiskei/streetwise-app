export type Me =
  | { status: "loggedIn"; email: string }
  | { status: "loggedOut"; reason: string }
  | { status: "offline" };

/**
 * Asks the API who we are. With Cloudflare Access in front of /api/*, an unauthenticated
 * request is redirected to the Access login page; `redirect: "manual"` turns that into an
 * opaque response instead of a CORS error.
 */
export async function fetchMe(): Promise<Me> {
  try {
    const res = await fetch("/api/me", { redirect: "manual", credentials: "same-origin" });
    if (res.type === "opaqueredirect" || res.status === 302)
      return { status: "loggedOut", reason: "unauthenticated" };
    const body = (await res.json().catch(() => ({}))) as { email?: string; error?: string };
    if (res.ok && body.email) return { status: "loggedIn", email: body.email };
    return { status: "loggedOut", reason: body.error ?? `http_${res.status}` };
  } catch {
    return navigator.onLine ? { status: "loggedOut", reason: "network" } : { status: "offline" };
  }
}

/** Full page navigation so Cloudflare Access can show its login and redirect back. */
export function login() {
  window.location.assign("/api/auth/login");
}

export function logout() {
  window.location.assign("/cdn-cgi/access/logout");
}
