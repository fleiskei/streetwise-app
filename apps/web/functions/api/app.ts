import { Hono } from "hono";
import { getCookie } from "hono/cookie";
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";

export interface Env {
  ACCESS_TEAM_DOMAIN?: string;
  ACCESS_AUD?: string;
  /** Local development only: skip Access and act as this user. */
  DEV_USER_EMAIL?: string;
}

type Identity =
  { email: string } | { error: "unauthenticated" | "access_not_configured" | "invalid_token" };

const jwksByTeam = new Map<string, JWTVerifyGetKey>();

/**
 * Identity comes from Cloudflare Access, which protects /api/* and forwards a signed JWT
 * (header Cf-Access-Jwt-Assertion, cookie CF_Authorization). We verify it ourselves so the
 * API stays safe even if the Access policy is misconfigured.
 */
export async function identify(
  req: { header(name: string): string | undefined },
  cookie: string | undefined,
  env: Env,
  keys?: JWTVerifyGetKey,
): Promise<Identity> {
  if (env.DEV_USER_EMAIL) return { email: env.DEV_USER_EMAIL };
  const team = env.ACCESS_TEAM_DOMAIN;
  if (!team || !env.ACCESS_AUD) return { error: "access_not_configured" };
  const token = req.header("Cf-Access-Jwt-Assertion") ?? cookie;
  if (!token) return { error: "unauthenticated" };
  let jwks = keys ?? jwksByTeam.get(team);
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(`https://${team}/cdn-cgi/access/certs`));
    jwksByTeam.set(team, jwks);
  }
  try {
    const { payload } = await jwtVerify(token, jwks, {
      issuer: `https://${team}`,
      audience: env.ACCESS_AUD,
    });
    return typeof payload.email === "string"
      ? { email: payload.email.toLowerCase() }
      : { error: "invalid_token" };
  } catch {
    return { error: "invalid_token" };
  }
}

export const app = new Hono<{ Bindings: Env }>().basePath("/api");

app.use("*", async (c, next) => {
  await next();
  c.header("Cache-Control", "no-store");
});

app.get("/health", (c) => c.json({ ok: true }));

/** Navigation target for "Anmelden": Access forces the login before this runs. */
app.get("/auth/login", (c) => c.redirect("/#/konto", 302));

app.get("/me", async (c) => {
  const id = await identify(c.req, getCookie(c, "CF_Authorization"), c.env);
  if ("error" in id) return c.json(id, 401);
  return c.json({ email: id.email });
});

app.notFound((c) => c.json({ error: "not_found" }, 404));
