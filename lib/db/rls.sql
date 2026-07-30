-- Row-level security: tenant isolation for every business table.
--
-- Policies compare organization_id against the `app.current_organization_id`
-- session variable, which the withOrg action wrapper sets inside a transaction
-- before touching the database.
--
-- `current_setting(..., true)` returns NULL when the variable is unset, and
-- `organization_id = NULL` is NULL (not true), so an unscoped connection sees
-- zero rows. The failure mode is an empty result, never a cross-tenant leak.
--
-- FORCE ROW LEVEL SECURITY matters: without it the table owner — which is the
-- role the app connects as locally — would bypass these policies entirely and
-- the isolation would be decorative.
--
-- This file is idempotent and re-applied on every `bun run db:migrate`.

do $$
declare
  target_table text;
  business_tables text[] := array[
    'accounts',
    'contacts',
    'leads',
    'pipelines',
    'stages',
    'deals',
    'activities',
    'tags',
    'taggings',
    'ai_insights',
    'embeddings',
    'audit_log'
  ];
begin
  foreach target_table in array business_tables loop
    -- Skip tables that do not exist yet (partial migration state).
    if not exists (
      select 1 from information_schema.tables
      where table_schema = 'public' and table_name = target_table
    ) then
      continue;
    end if;

    execute format('alter table public.%I enable row level security', target_table);
    execute format('alter table public.%I force row level security', target_table);

    execute format('drop policy if exists tenant_isolation on public.%I', target_table);
    execute format(
      'create policy tenant_isolation on public.%I
         using (organization_id = current_setting(''app.current_organization_id'', true))
         with check (organization_id = current_setting(''app.current_organization_id'', true))',
      target_table
    );
  end loop;
end
$$;
