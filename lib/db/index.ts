import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "@/lib/env";
import * as schema from "./schema";

/**
 * Next.js hot-reloads modules in development, which would otherwise open a new
 * connection pool on every edit until Postgres refuses more clients. Cache the
 * client on globalThis so reloads reuse one pool.
 */
const globalForDb = globalThis as unknown as {
  __synapseSql?: ReturnType<typeof postgres>;
};

function client() {
  if (!globalForDb.__synapseSql) {
    globalForDb.__synapseSql = postgres(env().DATABASE_URL, {
      max: 10,
      // Drizzle handles its own type parsing; keep dates as JS Date objects.
      transform: undefined,
    });
  }
  return globalForDb.__synapseSql;
}

export const sql = client();
export const db = drizzle(sql, { schema });

export type Database = typeof db;
export { schema };
