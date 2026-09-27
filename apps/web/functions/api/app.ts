import { Hono, type Context } from "hono";
import { getCookie } from "hono/cookie";
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";
import { mergeCityMap, newer, type CityMapDoc, type Stamped } from "@streetwise/core";
import {
  deleteUser,
  exportUser,
  insertAnswers,
  loadCityMap,
  loadSettings,
  progressFor,
  saveCityMap,
  saveSettings,
  userIdFor,
  type SyncAnswer,
} from "./store";

export interface Env {
  ACCESS_TEAM_DOMAIN?: string;
  ACCESS_AUD?: string;
  /** Local development only: skip Access and act as this user. */
  DEV_USER_EMAIL?: string;
  DB?: D1Database;
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

/** Resolves the Access user to a database user id, or returns an error response. */
async function requireUser(
  c: Context<{ Bindings: Env }>,
): Promise<{ db: D1Database; userId: string } | Response> {
  const id = await identify(c.req, getCookie(c, "CF_Authorization"), c.env);
  if ("error" in id) return c.json(id, 401);
  if (!c.env.DB) return c.json({ error: "db_not_configured" }, 503);
  return { db: c.env.DB, userId: await userIdFor(c.env.DB, id.email) };
}

const MAX_ANSWERS = 5000;
const MAX_STREETS = 20000;

/** Validates the sync request body; returns null if malformed. */
export function parseSync(body: unknown): {
  city: string;
  answers: SyncAnswer[];
  cityMap: CityMapDoc;
  settings: Stamped<unknown> | null;
} | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  if (typeof b.city !== "string" || !/^[a-z0-9-]{1,40}$/.test(b.city)) return null;
  const answers = Array.isArray(b.answers) ? b.answers : [];
  if (answers.length > MAX_ANSWERS) return null;
  const ok = answers.every(
    (a) =>
      a &&
      typeof a.id === "string" &&
      a.id.length <= 64 &&
      typeof a.streetId === "string" &&
      typeof a.mode === "string" &&
      typeof a.correct === "boolean" &&
      Number.isFinite(a.at),
  );
  if (!ok) return null;
  const cm = (b.cityMap ?? {}) as Partial<CityMapDoc>;
  const found = cm.found && typeof cm.found === "object" ? cm.found : {};
  const hinted = cm.hinted && typeof cm.hinted === "object" ? cm.hinted : {};
  if (Object.keys(found).length + Object.keys(hinted).length > MAX_STREETS) return null;
  const cityMap: CityMapDoc = {
    resetAt: Number.isFinite(cm.resetAt) ? (cm.resetAt as number) : null,
    found: Object.fromEntries(
      Object.entries(found)
        .filter(([, f]) => f && Number.isFinite(f.at))
        .map(([id, f]) => [id, { at: f.at, hinted: !!f.hinted }]),
    ),
    hinted: Object.fromEntries(
      Object.entries(hinted).filter(([, at]) => Number.isFinite(at)),
    ) as Record<string, number>,
  };
  const st = b.settings as Stamped<unknown> | null | undefined;
  const settings =
    st && Number.isFinite(st.updatedAt) && st.value && typeof st.value === "object" ? st : null;
  return { city: b.city, answers: answers as SyncAnswer[], cityMap, settings };
}

/**
 * Sync (M4): uploads unsynced answers and the device's city map/settings, returns the
 * merged server state. Idempotent: answers carry client UUIDs.
 */
app.post("/sync", async (c) => {
  const u = await requireUser(c);
  if (u instanceof Response) return u;
  const req = parseSync(await c.req.json().catch(() => null));
  if (!req) return c.json({ error: "bad_request" }, 400);
  const { db, userId } = u;

  await insertAnswers(db, userId, req.city, req.answers);

  const serverMap = await loadCityMap(db, userId, req.city);
  const cityMap = mergeCityMap(serverMap, req.cityMap);
  await saveCityMap(db, userId, req.city, serverMap, cityMap);

  const serverSettings = await loadSettings(db, userId);
  const settings = newer(serverSettings, req.settings);
  if (settings && settings !== serverSettings) await saveSettings(db, userId, settings);

  return c.json({
    progress: await progressFor(db, userId, req.city),
    cityMap,
    settings,
    accepted: req.answers.map((a) => a.id),
    serverTime: Date.now(),
  });
});

/** Data export (REQUIREMENTS F-20). */
app.get("/export", async (c) => {
  const u = await requireUser(c);
  if (u instanceof Response) return u;
  c.header("Content-Disposition", 'attachment; filename="streetwise-export.json"');
  return c.json(await exportUser(u.db, u.userId));
});

/** Deletes the account and all server-side data (REQUIREMENTS F-20). */
app.delete("/me", async (c) => {
  const u = await requireUser(c);
  if (u instanceof Response) return u;
  await deleteUser(u.db, u.userId);
  return c.json({ deleted: true });
});

app.notFound((c) => c.json({ error: "not_found" }, 404));
