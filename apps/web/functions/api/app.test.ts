import { describe, expect, it } from "vitest";
import { exportJWK, generateKeyPair, SignJWT, createLocalJWKSet } from "jose";
import { app, identify } from "./app";

const env = { ACCESS_TEAM_DOMAIN: "team.cloudflareaccess.com", ACCESS_AUD: "aud123" };

async function setup() {
  const { publicKey, privateKey } = await generateKeyPair("RS256");
  const jwk = { ...(await exportJWK(publicKey)), kid: "k1", alg: "RS256" };
  const keys = createLocalJWKSet({ keys: [jwk] });
  const sign = (claims: Record<string, unknown>, aud = env.ACCESS_AUD) =>
    new SignJWT(claims)
      .setProtectedHeader({ alg: "RS256", kid: "k1" })
      .setIssuer(`https://${env.ACCESS_TEAM_DOMAIN}`)
      .setAudience(aud)
      .setExpirationTime("1h")
      .sign(privateKey);
  return { keys, sign };
}

const req = (headers: Record<string, string>) => ({ header: (n: string) => headers[n] });

describe("identify", () => {
  it("accepts a valid Access token and lower-cases the email", async () => {
    const { keys, sign } = await setup();
    const token = await sign({ email: "Me@Example.com" });
    expect(await identify(req({ "Cf-Access-Jwt-Assertion": token }), undefined, env, keys)).toEqual(
      { email: "me@example.com" },
    );
    expect(await identify(req({}), token, env, keys)).toEqual({ email: "me@example.com" });
  });

  it("rejects wrong audience, missing token and missing config", async () => {
    const { keys, sign } = await setup();
    const token = await sign({ email: "a@b.c" }, "other");
    expect(await identify(req({ "Cf-Access-Jwt-Assertion": token }), undefined, env, keys)).toEqual(
      { error: "invalid_token" },
    );
    expect(await identify(req({}), undefined, env, keys)).toEqual({ error: "unauthenticated" });
    expect(await identify(req({}), undefined, {}, keys)).toEqual({
      error: "access_not_configured",
    });
  });
});

describe("api", () => {
  it("serves health and 401 on /me without identity", async () => {
    expect((await app.request("/api/health", {}, {})).status).toBe(200);
    const res = await app.request("/api/me", {}, env);
    expect(res.status).toBe(401);
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("uses DEV_USER_EMAIL locally", async () => {
    const res = await app.request("/api/me", {}, { DEV_USER_EMAIL: "dev@local" });
    expect(await res.json()).toEqual({ email: "dev@local" });
  });
});
