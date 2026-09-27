import { describe, expect, it } from "vitest";
import path from "node:path";
import { app } from "./app";
import { createTestD1 } from "../../test/d1-sqlite";

interface SyncBody {
  progress: Record<string, { box: number; nCorrect: number; nWrong: number }>;
  cityMap: unknown;
  settings: unknown;
  accepted: string[];
}

const MIGRATIONS = path.join(import.meta.dirname, "..", "..", "migrations");

function setup() {
  const DB = createTestD1(MIGRATIONS);
  const env = { DEV_USER_EMAIL: "me@example.com", DB };
  const sync = async (body: unknown, e: object = env) => {
    const res = await app.request(
      "/api/sync",
      {
        method: "POST",
        body: JSON.stringify(body),
        headers: { "content-type": "application/json" },
      },
      e,
    );
    return { status: res.status, body: (await res.json()) as SyncBody };
  };
  return { DB, env, sync };
}

const answer = (id: string, streetId: string, correct: boolean, at: number, mode = "locate") => ({
  id,
  streetId,
  mode,
  correct,
  at,
});

describe("POST /api/sync", () => {
  it("stores answers idempotently and returns replayed progress", async () => {
    const { sync } = setup();
    const body = {
      city: "aachen",
      answers: [answer("a1", "s1", true, 1), answer("a2", "s1", true, 2)],
      cityMap: {},
    };
    const r1 = await sync(body);
    expect(r1.status).toBe(200);
    expect(r1.body.progress.s1.box).toBe(2);
    expect(r1.body.accepted).toEqual(["a1", "a2"]);
    const r2 = await sync(body); // retry after a lost response
    expect(r2.body.progress.s1.box).toBe(2);
  });

  it("merges answers from two devices in time order", async () => {
    const { sync } = setup();
    await sync({ city: "aachen", answers: [answer("p1", "s1", true, 10)] });
    const r = await sync({ city: "aachen", answers: [answer("l1", "s1", false, 5)] });
    // wrong at t=5, correct at t=10 → box 1 (not 0)
    expect(r.body.progress.s1).toMatchObject({ box: 1, nCorrect: 1, nWrong: 1 });
  });

  it("merges the city map across devices, honours resets and writes minimal rows", async () => {
    const { sync, DB } = setup();
    await sync({
      city: "aachen",
      cityMap: { resetAt: null, found: { a: { at: 10, hinted: false } }, hinted: { h: 11 } },
    });
    const r = await sync({
      city: "aachen",
      cityMap: { resetAt: 20, found: { b: { at: 25, hinted: false } }, hinted: {} },
    });
    expect(r.body.cityMap).toEqual({
      resetAt: 20,
      found: { b: { at: 25, hinted: false } },
      hinted: {},
    });
    const rows = DB.raw.prepare("SELECT street_id FROM city_map ORDER BY street_id").all();
    expect(rows).toEqual([{ street_id: "b" }]);
  });

  it("settings: last writer wins", async () => {
    const { sync } = setup();
    await sync({ city: "aachen", settings: { value: { sound: false }, updatedAt: 5 } });
    const r = await sync({ city: "aachen", settings: { value: { sound: true }, updatedAt: 3 } });
    expect(r.body.settings).toEqual({ value: { sound: false }, updatedAt: 5 });
  });

  it("rejects bad input and unauthenticated requests", async () => {
    const { sync, DB } = setup();
    expect((await sync({ city: "../x" })).status).toBe(400);
    expect((await sync({ city: "aachen", answers: [{ id: 1 }] })).status).toBe(400);
    expect((await sync({ city: "aachen" }, { DB })).status).toBe(401);
  });

  it("keeps users apart and deletes all data of a user", async () => {
    const { sync, env } = setup();
    await sync({ city: "aachen", answers: [answer("x1", "s1", true, 1)] });
    const other = await sync({ city: "aachen" }, { ...env, DEV_USER_EMAIL: "other@example.com" });
    expect(other.body.progress).toEqual({});
    const del = await app.request("/api/me", { method: "DELETE" }, env);
    expect(del.status).toBe(200);
    const again = await sync({ city: "aachen" });
    expect(again.body.progress).toEqual({});
  });
});
