-- Application database role.
--
-- Why this exists: the bootstrap role created by the Postgres image (and the
-- owner role on most managed providers) is a SUPERUSER, and **superusers bypass
-- row-level security entirely** — even when the table is marked
-- FORCE ROW LEVEL SECURITY. Connecting the app as that role makes the policies
-- in rls.sql decorative: every tenant sees every row.
--
-- So the app connects as `synapse_app`, which:
--   * is NOT a superuser and does NOT have the BYPASSRLS attribute,
--   * has plain DML rights on the schema,
--   * is therefore fully subject to the tenant_isolation policies.
--
-- Migrations and seeding keep using the owner role (DATABASE_ADMIN_URL), which
-- needs to create types and tables.
--
-- Applied on every `bun run db:migrate`, after the migrations so that the
-- GRANTs cover newly created tables.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'synapse_app') then
    -- Local development password. In production, provision this role out of
    -- band with a real secret (on Neon: create a dedicated role and use its
    -- connection string as DATABASE_URL).
    create role synapse_app login password 'synapse_app';
  end if;
end
$$;

-- Defensive: make sure nobody has handed this role a way around the policies.
alter role synapse_app nosuperuser nobypassrls;

grant usage on schema public to synapse_app;
grant select, insert, update, delete on all tables in schema public to synapse_app;
grant usage, select on all sequences in schema public to synapse_app;

-- Future tables created by the owner are usable by the app role without
-- needing to re-run these grants by hand.
alter default privileges in schema public
  grant select, insert, update, delete on tables to synapse_app;
alter default privileges in schema public
  grant usage, select on sequences to synapse_app;
