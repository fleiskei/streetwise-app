import {
  emptyCityMap,
  replay,
  type Answer,
  type CityMapDoc,
  type Mode,
  type Stamped,
  type StreetProgress,
} from "@streetwise/core";

/** D1 access for the synced state. Kept free of HTTP concerns so it can be tested with SQLite. */

const MODES: readonly Mode[] = ["choice", "match", "locate", "complete", "postcode"];

export interface SyncAnswer extends Answer {
  id: string;
}

export async function userIdFor(db: D1Database, email: string): Promise<string> {
  await db
    .prepare("INSERT OR IGNORE INTO users (id, email, created_at) VALUES (?, ?, ?)")
    .bind(crypto.randomUUID(), email, Date.now())
    .run();
  const row = await db
    .prepare("SELECT id FROM users WHERE email = ?")
    .bind(email)
    .first<{ id: string }>();
  return row!.id;
}

export async function insertAnswers(
  db: D1Database,
  userId: string,
  city: string,
  answers: SyncAnswer[],
) {
  const stmt = db.prepare(
    "INSERT OR IGNORE INTO answers (id, user_id, city, street_id, mode, correct, at) VALUES (?, ?, ?, ?, ?, ?, ?)",
  );
  const valid = answers.filter((a) => MODES.includes(a.mode));
  for (let i = 0; i < valid.length; i += 50)
    await db.batch(
      valid
        .slice(i, i + 50)
        .map((a) => stmt.bind(a.id, userId, city, a.streetId, a.mode, a.correct ? 1 : 0, a.at)),
    );
}

export async function progressFor(
  db: D1Database,
  userId: string,
  city: string,
): Promise<Record<string, StreetProgress>> {
  const { results } = await db
    .prepare(
      "SELECT street_id, mode, correct, at FROM answers WHERE user_id = ? AND city = ? ORDER BY at",
    )
    .bind(userId, city)
    .all<{ street_id: string; mode: Mode; correct: number; at: number }>();
  return replay(
    results.map((r) => ({
      streetId: r.street_id,
      mode: r.mode,
      correct: r.correct === 1,
      at: r.at,
    })),
  );
}

export async function loadCityMap(
  db: D1Database,
  userId: string,
  city: string,
): Promise<CityMapDoc> {
  const doc = emptyCityMap();
  const meta = await db
    .prepare("SELECT reset_at FROM city_map_meta WHERE user_id = ? AND city = ?")
    .bind(userId, city)
    .first<{ reset_at: number | null }>();
  doc.resetAt = meta?.reset_at ?? null;
  const { results } = await db
    .prepare(
      "SELECT street_id, found_at, hinted, hint_at FROM city_map WHERE user_id = ? AND city = ?",
    )
    .bind(userId, city)
    .all<{ street_id: string; found_at: number | null; hinted: number; hint_at: number | null }>();
  for (const r of results) {
    if (r.found_at !== null) doc.found[r.street_id] = { at: r.found_at, hinted: r.hinted === 1 };
    else if (r.hint_at !== null) doc.hinted[r.street_id] = r.hint_at;
  }
  return doc;
}

/** Writes `next` over `prev` with the minimal set of statements. */
export async function saveCityMap(
  db: D1Database,
  userId: string,
  city: string,
  prev: CityMapDoc,
  next: CityMapDoc,
) {
  const stmts: D1PreparedStatement[] = [];
  if (next.resetAt !== prev.resetAt) {
    stmts.push(
      db
        .prepare(
          "INSERT INTO city_map_meta (user_id, city, reset_at) VALUES (?, ?, ?) ON CONFLICT (user_id, city) DO UPDATE SET reset_at = excluded.reset_at",
        )
        .bind(userId, city, next.resetAt),
    );
  }
  const upsert = db.prepare(
    "INSERT INTO city_map (user_id, city, street_id, found_at, hinted, hint_at) VALUES (?, ?, ?, ?, ?, ?) " +
      "ON CONFLICT (user_id, city, street_id) DO UPDATE SET found_at = excluded.found_at, hinted = excluded.hinted, hint_at = excluded.hint_at",
  );
  const del = db.prepare("DELETE FROM city_map WHERE user_id = ? AND city = ? AND street_id = ?");
  const ids = new Set([
    ...Object.keys(prev.found),
    ...Object.keys(prev.hinted),
    ...Object.keys(next.found),
    ...Object.keys(next.hinted),
  ]);
  for (const id of ids) {
    const f = next.found[id];
    const h = next.hinted[id];
    const pf = prev.found[id];
    const ph = prev.hinted[id];
    if (f) {
      if (!pf || pf.at !== f.at || pf.hinted !== f.hinted)
        stmts.push(upsert.bind(userId, city, id, f.at, f.hinted ? 1 : 0, null));
    } else if (h !== undefined) {
      if (pf || ph !== h) stmts.push(upsert.bind(userId, city, id, null, 1, h));
    } else if (pf || ph !== undefined) {
      stmts.push(del.bind(userId, city, id));
    }
  }
  for (let i = 0; i < stmts.length; i += 100) await db.batch(stmts.slice(i, i + 100));
}

export async function loadSettings(
  db: D1Database,
  userId: string,
): Promise<Stamped<unknown> | null> {
  const row = await db
    .prepare("SELECT value, updated_at FROM settings WHERE user_id = ?")
    .bind(userId)
    .first<{ value: string; updated_at: number }>();
  return row ? { value: JSON.parse(row.value), updatedAt: row.updated_at } : null;
}

export async function saveSettings(db: D1Database, userId: string, s: Stamped<unknown>) {
  await db
    .prepare(
      "INSERT INTO settings (user_id, value, updated_at) VALUES (?, ?, ?) ON CONFLICT (user_id) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
    )
    .bind(userId, JSON.stringify(s.value), s.updatedAt)
    .run();
}

export async function exportUser(db: D1Database, userId: string) {
  const all = async (sql: string) => (await db.prepare(sql).bind(userId).all()).results;
  return {
    user: await db.prepare("SELECT email, created_at FROM users WHERE id = ?").bind(userId).first(),
    answers: await all(
      "SELECT id, city, street_id, mode, correct, at FROM answers WHERE user_id = ? ORDER BY at",
    ),
    cityMap: await all(
      "SELECT city, street_id, found_at, hinted, hint_at FROM city_map WHERE user_id = ?",
    ),
    cityMapMeta: await all("SELECT city, reset_at FROM city_map_meta WHERE user_id = ?"),
    settings: await db
      .prepare("SELECT value, updated_at FROM settings WHERE user_id = ?")
      .bind(userId)
      .first(),
  };
}

export async function deleteUser(db: D1Database, userId: string) {
  await db.batch(
    ["answers", "city_map", "city_map_meta", "settings"]
      .map((t) => db.prepare(`DELETE FROM ${t} WHERE user_id = ?`).bind(userId))
      .concat(db.prepare("DELETE FROM users WHERE id = ?").bind(userId)),
  );
}
