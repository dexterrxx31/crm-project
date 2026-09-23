/**
 * Migration runner — owner/admin role (needs DDL rights). Order matters:
 * vector extension (the type must exist before migrations reference it) →
 * drizzle migrations → roles/grants (after tables exist) → RLS policies
 * (re-applied every run so edits ship without a hand-written migration).
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

// Migrations need DDL rights, so they use the owner role. DATABASE_URL is the
// least-privileged app role and cannot create tables.
const databaseUrl = process.env.DATABASE_ADMIN_URL ?? process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_ADMIN_URL is not set. Copy .env.example to .env.local first.");
  process.exit(1);
}

// max: 1 — migrations must run serially on a single connection.
const sql = postgres(databaseUrl, { max: 1, onnotice: () => {} });

async function runSqlFile(relativePath: string, label: string) {
  console.log(`→ ${label}`);
  const contents = await readFile(join(process.cwd(), relativePath), "utf8");
  await sql.unsafe(contents);
}

async function main() {
  console.log("→ enabling pgvector extension");
  await sql`CREATE EXTENSION IF NOT EXISTS vector`;

  console.log("→ applying drizzle migrations");
  await migrate(drizzle(sql), { migrationsFolder: join(process.cwd(), "lib/db/migrations") });

  await runSqlFile("lib/db/roles.sql", "creating application role and grants");
  await runSqlFile("lib/db/rls.sql", "applying row-level security policies");

  // Guard against the failure mode this whole setup exists to prevent: if the
  // app role can bypass RLS, tenant isolation is silently off.
  const [appRole] = await sql<{ rolsuper: boolean; rolbypassrls: boolean }[]>`
    select rolsuper, rolbypassrls from pg_roles where rolname = 'synapse_app'
  `;
  if (!appRole) {
    throw new Error("synapse_app role was not created");
  }
  if (appRole.rolsuper || appRole.rolbypassrls) {
    throw new Error(
      "synapse_app can bypass row-level security — tenant isolation would not be enforced",
    );
  }

  console.log("✓ database is up to date (app role verified as RLS-bound)");
}

main()
  .catch((error) => {
    console.error("✗ migration failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await sql.end();
  });
