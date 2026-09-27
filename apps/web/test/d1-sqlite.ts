// Test helper: a minimal D1Database implementation on top of node:sqlite.
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

type Value = string | number | null;

class Stmt {
  constructor(
    private db: DatabaseSync,
    readonly sql: string,
    private params: Value[] = [],
  ) {}
  bind(...params: unknown[]) {
    return new Stmt(
      this.db,
      this.sql,
      params.map((p) => (p === undefined ? null : (p as Value))),
    );
  }
  async first<T>() {
    return (this.db.prepare(this.sql).get(...this.params) as T) ?? null;
  }
  async all<T>() {
    return { results: this.db.prepare(this.sql).all(...this.params) as T[], success: true };
  }
  async run() {
    this.db.prepare(this.sql).run(...this.params);
    return { success: true };
  }
}

export function createTestD1(migrationsDir: string) {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec(readFileSync(`${migrationsDir}/0001_init.sql`, "utf8"));
  return {
    prepare: (sql: string) => new Stmt(db, sql),
    batch: async (stmts: Stmt[]) => {
      db.exec("BEGIN");
      try {
        const out = [];
        for (const s of stmts) out.push(await s.run());
        db.exec("COMMIT");
        return out;
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
    },
    raw: db,
  } as unknown as D1Database & { raw: DatabaseSync };
}
